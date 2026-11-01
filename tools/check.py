#!/usr/bin/env python3
"""Static checks for the site: no browser and no npm packages needed (Node is used when present).

  1. public/ is a fresh build of src/ and static/ (build.py --check)
  2. every inline <script> in public/index.html parses (node --check; JSON data blocks with a JSON parser)
  3. every engine, the ride and the worlds it embeds, honours docs/ENGINE_API.md (tools/engine-contract.mjs)
  4. the site is silent: no audio or video APIs in src/ or public/
  5. HTML basics: doctype, lang, charset, viewport, title, description, social tags, one h1, unique ids, in-page
     links resolve, buttons and links have names, external links use https, no inline event handlers, no external
     scripts, Google Fonts is the only external stylesheet, no dev-only ride or build placeholders shipped,
     images have alt text and a size, and every local image the page uses exists in public/
  6. deploy files: 404.html, icons, og.png at 1200x630, _headers and _redirects within Cloudflare's limits, and
     every Sweet Spots picture the Lab map can show
  7. size of index.html, raw and gzipped

usage: python3 tools/check.py        exit 0 when nothing FAILs (WARN lines are advisory)
"""
import gzip, json, os, re, shutil, struct, subprocess, sys, tempfile
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
results = []


def report(kind, msg):
    results.append((kind, msg))
    print('%-4s %s' % (kind, msg))


def ok(msg): report('ok', msg)
def fail(msg): report('FAIL', msg)
def warn(msg): report('WARN', msg)


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags, self.ids, self.scripts, self.doctype = [], [], [], None
        self.stack, self._script = [], None

    def handle_decl(self, decl):
        self.doctype = decl

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        node = {'tag': tag, 'attrs': a, 'text': ''}
        self.tags.append(node)
        if 'id' in a: self.ids.append(a['id'])
        if tag == 'script': self._script = []; self._sattrs = a
        if tag not in ('meta', 'link', 'br', 'img', 'input', 'source', 'rect', 'path'): self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack and self.stack[-1]['tag'] == tag: self.stack.pop()

    def handle_endtag(self, tag):
        if tag == 'script' and self._script is not None:
            self.scripts.append({'type': self._sattrs.get('type', ''), 'id': self._sattrs.get('id'), 'text': ''.join(self._script)})
            self._script = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]['tag'] == tag: del self.stack[i:]; break

    def handle_data(self, data):
        if self._script is not None: self._script.append(data); return
        for n in self.stack:
            if n['tag'] in ('a', 'button', 'h1', 'title'): n['text'] += data


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    if head[:8] != b'\x89PNG\r\n\x1a\n': return None
    return struct.unpack('>II', head[16:24])


def main():
    node = shutil.which('node')

    # 1. build freshness
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'build.py'), '--check'], capture_output=True, text=True)
    (ok if r.returncode == 0 else fail)(r.stdout.strip().splitlines()[0] if r.stdout.strip() else 'build.py --check failed: ' + r.stderr.strip())
    index = os.path.join(PUB, 'index.html')
    if not os.path.exists(index):
        fail('public/index.html is missing; run: python3 build.py'); return finish()
    html = read(index)
    page = Page(); page.feed(html); page.close()

    # 2. script syntax (JSON data blocks are parsed as JSON, the rest by node)
    code = [s['text'] for s in page.scripts if s['type'] != 'application/json']
    data = {s['id']: s['text'] for s in page.scripts if s['type'] == 'application/json'}
    bad = 0
    for k, text in data.items():
        try: data[k] = json.loads(text)
        except ValueError as e: bad += 1; fail('inline JSON #%s does not parse: %s' % (k, e))
    if node:
        with tempfile.TemporaryDirectory() as tmp:
            for i, s in enumerate(code):
                p = os.path.join(tmp, 'script%d.js' % i)
                with open(p, 'w', encoding='utf-8') as f: f.write(s)
                r = subprocess.run([node, '--check', p], capture_output=True, text=True)
                if r.returncode: bad += 1; fail('inline script #%d does not parse: %s' % (i, r.stderr.strip().splitlines()[-1] if r.stderr.strip() else '?'))
        if not bad: ok('all %d inline scripts and %d JSON data block%s parse' % (len(code), len(data), '' if len(data) == 1 else 's'))
    else:
        warn('node not found: skipped script syntax and engine contract checks')

    # 3. engine contract
    if node:
        r = subprocess.run([node, os.path.join(ROOT, 'tools', 'engine-contract.mjs')], capture_output=True, text=True, cwd=ROOT)
        lines = [l for l in r.stdout.strip().splitlines() if l.strip()]
        if r.returncode == 0: ok('engine contract: ' + ', '.join(l.split()[1] for l in lines if l.startswith('ok')))
        else:
            for l in lines:
                if l.startswith('FAIL'): fail('engine contract: ' + l[5:])
            if r.stderr.strip(): fail('engine contract crashed: ' + r.stderr.strip().splitlines()[-1])

    # 4. silent site
    audio = re.compile(r'AudioContext|createOscillator|createMediaElementSource|new\s+Audio\s*\(|<audio|<video|HTMLMediaElement|speechSynthesis')
    hits = []
    for base, _, files in os.walk(os.path.join(ROOT, 'src')):
        for n in files:
            if n.endswith(('.js', '.html')):
                for ln, line in enumerate(read(os.path.join(base, n)).splitlines(), 1):
                    if audio.search(line): hits.append('%s:%d' % (os.path.relpath(os.path.join(base, n), ROOT), ln))
    if audio.search(html): hits.append('public/index.html')
    (fail if hits else ok)('no audio or video APIs' + (': found in ' + ', '.join(hits) if hits else ''))
    dbg = [m.group(0) for m in re.finditer(r'console\.(log|debug)\(|\bdebugger\b', '\n'.join(code))]
    (warn if dbg else ok)('no console.log/debugger left in scripts' if not dbg else 'debug statements in scripts: %d' % len(dbg))

    # 5. HTML basics
    tags = page.tags
    first = lambda pred: next((t for t in tags if pred(t)), None)
    meta = lambda **kw: first(lambda t: t['tag'] == 'meta' and all(t['attrs'].get(k) == v for k, v in kw.items()))
    problems = []
    if not (page.doctype or '').lower().startswith('doctype html'): problems.append('missing <!doctype html>')
    h = first(lambda t: t['tag'] == 'html')
    if not h or h['attrs'].get('lang') != 'en': problems.append('<html lang="en"> missing')
    if not first(lambda t: t['tag'] == 'meta' and 'charset' in t['attrs']): problems.append('no <meta charset>')
    if not meta(name='viewport'): problems.append('no viewport meta')
    title = first(lambda t: t['tag'] == 'title')
    if not title or not title['text'].strip(): problems.append('no <title>')
    desc = meta(name='description')
    if not desc: problems.append('no meta description')
    elif not 50 <= len(desc['attrs'].get('content', '')) <= 160: warn('meta description is %d chars (aim for 50-160)' % len(desc['attrs']['content']))
    for prop in ('og:title', 'og:description', 'og:image', 'og:type'):
        if not meta(property=prop): problems.append('no %s' % prop)
    og = meta(property='og:image')
    if og and not re.match(r'^https://[^/]+/og\.png$', og['attrs'].get('content', '')): problems.append('og:image must be an absolute https URL to /og.png')
    if not meta(name='twitter:card'): problems.append('no twitter:card')
    canon = first(lambda t: t['tag'] == 'link' and t['attrs'].get('rel') == 'canonical')
    ogurl = meta(property='og:url')
    if not canon or not re.match(r'^https://[^/]+/$', canon['attrs'].get('href', '')): problems.append('canonical link must be the absolute https home URL')
    elif not ogurl or ogurl['attrs'].get('content') != canon['attrs']['href']: problems.append('og:url must equal the canonical URL')
    elif og and not og['attrs'].get('content', '').startswith(canon['attrs']['href']): problems.append('og:image must be on the canonical host')
    h1s = [t for t in tags if t['tag'] == 'h1']
    if len(h1s) != 1: problems.append('%d <h1> elements (want exactly 1)' % len(h1s))
    dup = sorted({i for i in page.ids if page.ids.count(i) > 1})
    if dup: problems.append('duplicate ids: ' + ', '.join(dup))
    for t in tags:
        a = t['attrs']
        handlers = [k for k in a if k.startswith('on')]
        if handlers: problems.append('inline event handler %s on <%s>' % (handlers[0], t['tag']))
        if t['tag'] == 'script' and a.get('src'): problems.append('external script %s (scripts are inline by design)' % a['src'])
        if t['tag'] == 'link' and 'stylesheet' in (a.get('rel') or '') and not (a.get('href') or '').startswith('https://fonts.googleapis.com/'):
            problems.append('stylesheet from %s (only Google Fonts is external)' % a.get('href'))
        if t['tag'] == 'a':
            href = a.get('href')
            if not href: problems.append('<a> without href')
            elif href.startswith('#') and len(href) > 1 and href[1:] not in page.ids: problems.append('in-page link %s has no target' % href)
            elif href.startswith('http://'): problems.append('insecure link ' + href)
            if not (t['text'].strip() or a.get('aria-label')): problems.append('link without a name: ' + str(href))
            if a.get('target') == '_blank' and 'noopener' not in (a.get('rel') or ''): problems.append('target=_blank without rel=noopener: ' + str(href))
        if t['tag'] == 'button' and not (t['text'].strip() or a.get('aria-label')): problems.append('button without a name (id=%s)' % a.get('id'))
        if t['tag'] == 'img':
            if 'alt' not in a: problems.append('<img> without alt')
            if not (a.get('width') and a.get('height')): problems.append('<img> without width and height (layout shift): ' + str(a.get('src')))
            urls = [a.get('src') or ''] + [c.strip().split()[0] for c in (a.get('srcset') or '').split(',') if c.strip()]
            for u in urls:
                if u and not re.match(r'(https?:|data:)', u) and not os.path.isfile(os.path.join(PUB, *u.lstrip('/').split('?')[0].split('/'))):
                    problems.append('<img> source missing from public/: ' + u)
    for token in ('__RIDES__', '<!--ENGINES-->', '<!--RUNTIME-->'):
        if token in html: problems.append('build placeholder %s left in the page' % token)
    if re.search(r"MM_ENGINES\[['\"]test['\"]\]", html): problems.append('the dev-only test ride is in the page')
    if problems:
        for p in problems: fail('html: ' + p)
    else:
        ok('html: doctype, lang, meta, social tags, 1 h1, %d unique ids, links and buttons named, in-page links resolve' % len(page.ids))

    # 6. deploy files
    need = ['index.html', '404.html', 'favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og.png', '_headers']
    missing = [n for n in need if not os.path.exists(os.path.join(PUB, n))]
    if missing: fail('public/ is missing ' + ', '.join(missing))
    else:
        sizes = {n: png_size(os.path.join(PUB, n)) for n in ('og.png', 'apple-touch-icon.png')}
        bad = [n for n, want in (('og.png', (1200, 630)), ('apple-touch-icon.png', (180, 180))) if sizes[n] != want]
        with open(os.path.join(PUB, 'favicon.ico'), 'rb') as f: ico = f.read(6)
        if ico[:4] != b'\x00\x00\x01\x00': bad.append('favicon.ico')
        p404 = read(os.path.join(PUB, '404.html'))
        if 'noindex' not in p404 or 'href="/"' not in p404: bad.append('404.html (needs noindex and a link home)')
        hdr = read(os.path.join(PUB, '_headers')).splitlines()
        rules = [l for l in hdr if l.strip() and not l.startswith((' ', '\t', '#'))]
        if len(rules) > 100 or any(len(l) > 2000 for l in hdr): bad.append('_headers (max 100 rules, 2000 chars per line)')
        red = os.path.join(PUB, '_redirects')
        if os.path.exists(red):   # Cloudflare: 'source destination [code]', max 2,100 rules, 1,000 chars per rule
            lines = [l.strip() for l in read(red).splitlines() if l.strip() and not l.strip().startswith('#')]
            okline = lambda f: 2 <= len(f) <= 3 and f[0].startswith('/') and (len(f) == 2 or f[2] in ('200', '301', '302', '303', '307', '308'))
            if len(lines) > 2100 or any(len(l) > 1000 or not okline(l.split()) for l in lines): bad.append('_redirects ("source destination [code]" per line)')
        lab = data.get('ss-data')
        if isinstance(lab, dict):   # the live Sweet Spots map shows lab/sweet-spots/<id>.webp for each new candy
            gone = [p[5] for p in lab.get('new', []) if not os.path.isfile(os.path.join(PUB, 'lab', 'sweet-spots', p[5] + '.webp'))]
            if gone: bad.append('Sweet Spots pictures missing: ' + ', '.join(gone[:3]) + (' and %d more' % (len(gone) - 3) if len(gone) > 3 else ''))
        (fail if bad else ok)('deploy files present and valid' if not bad else 'deploy files wrong: ' + ', '.join(bad))

    # 7. size
    raw = len(html.encode('utf-8')); gz = len(gzip.compress(html.encode('utf-8'), 9))
    (warn if gz > 120 * 1024 else ok)('index.html is %.1f KB (%.1f KB gzipped)' % (raw / 1024, gz / 1024))
    return finish()


def finish():
    n_fail = sum(1 for k, _ in results if k == 'FAIL'); n_warn = sum(1 for k, _ in results if k == 'WARN')
    print('\n%s: %d checks, %d failed, %d warnings' % ('FAILED' if n_fail else 'PASSED', len(results), n_fail, n_warn))
    return 1 if n_fail else 0


if __name__ == '__main__':
    sys.exit(main())
