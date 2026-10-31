#!/usr/bin/env python3
"""Build maxmartinelli.com from src/ into public/, the folder Cloudflare serves.

The page is one self-contained index.html: the shell (layout, content, CSS), the four ride engines and the shared
runtime, all inline. <!--include:path--> in the shell pulls in a file from src/ (the Lab's generated SVGs, scripts
and data). static/ holds the files copied next to it, folders included (404 page, icons, social image, _headers and
_redirects, the Lab's pictures).
The build is deterministic, so `--check` can prove public/ matches src/.

usage:
  python3 build.py                  rebuild public/ from src/ and static/
  python3 build.py --check          rebuild into a temp folder; exit 1 if public/ is stale
  python3 build.py --artifact OUT   write the claude.ai artifact fragment (no doctype/head/body) to OUT
  python3 build.py --only ID        dev page with one ride, written to dev/ID.html (never deploy)
  python3 build.py --with-test      dev page that also includes the runtime smoke-test ride (never deploy)
  python3 build.py --out PATH       with --only/--with-test: where to write the dev page

Python 3.8+, standard library only.
"""
import filecmp, html, json, os, re, shutil, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, 'rides.json'), encoding='utf-8') as _f:
    RIDES = json.load(_f)   # every ride that ships, in order (the tools read the same file)

# ---- site settings: edit these, then rebuild ----
SITE_URL = 'https://maxmartinelli.com'   # canonical host (the apex answers; www has no DNS record): canonical, og:url, og:image
TITLE = 'Max Martinelli'
DESCRIPTION = ('Max Martinelli, career intern who likes AI and insurance: the Almost Nowhere podcast '
               'and lab experiments, starting with Sweet Spots.')
OG_IMAGE_ALT = 'The name Max Martinelli over a starbow of light streaks, a frame from the site’s animated hero'
THEME_COLOR = '#050A1A'
HERO_MARKER = '<header class="hero"'   # the shell's first body element; everything before it goes in <head>


def read(*parts):
    with open(os.path.join(HERE, *parts), encoding='utf-8') as f:
        return f.read()


def include(m):
    """<!--include:lab/x.svg--> in the shell is replaced by src/lab/x.svg (long generated markup, scripts and data)."""
    rel = m.group(1)
    if '..' in rel.split('/') or not os.path.isfile(os.path.join(HERE, 'src', rel)):
        sys.exit('src/shell.html includes a missing file: src/' + rel)
    text = read('src', *rel.split('/')).strip()
    if rel.endswith(('.js', '.json')) and ('</script' in text.lower() or '<!--' in text):
        sys.exit('src/%s contains "</script" or "<!--" and would break its inline <script>' % rel)
    return text


def static_files():
    """every file under static/, as sorted paths relative to it (dotfiles and dot-folders skipped)."""
    base, out = os.path.join(HERE, 'static'), []
    for d, dirs, files in os.walk(base):
        dirs[:] = sorted(x for x in dirs if not x.startswith('.'))
        out += [os.path.relpath(os.path.join(d, n), base).replace(os.sep, '/') for n in sorted(files) if not n.startswith('.')]
    return sorted(out)


def tree(root):
    """every file under root, as relative paths."""
    return {os.path.relpath(os.path.join(d, n), root).replace(os.sep, '/') for d, _, files in os.walk(root) for n in files}


def fragment(ids):
    """shell + engines + runtime as one fragment (the claude.ai artifact form of the page)."""
    shell, runtime = read('src', 'shell.html'), read('src', 'runtime.js')
    shell = re.sub(r'<!--include:([\w./-]+)-->', include, shell)
    for token in ('__RIDES__', '<!--ENGINES-->', '<!--RUNTIME-->'):
        if shell.count(token) != 1:
            sys.exit('src/shell.html must contain %s exactly once' % token)
    parts = ['<script>window.MM_ENGINES = window.MM_ENGINES || {};</script>']
    for k in ids:
        src = read('src', 'engines', k + '.js')
        if '</script' in src.lower():
            sys.exit('src/engines/%s.js contains "</script" and would end its inline <script> early' % k)
        parts.append('<script>\n' + src.rstrip() + '\n</script>')
    if '</script' in runtime.lower():
        sys.exit('src/runtime.js contains "</script"')
    return (shell.replace('__RIDES__', json.dumps(ids))
                 .replace('<!--ENGINES-->', '\n'.join(parts))
                 .replace('<!--RUNTIME-->', '<script>\n' + runtime.rstrip() + '\n</script>'))


def web_page(frag):
    """wrap the fragment in a complete HTML document with the meta tags a public site needs."""
    i = frag.find(HERO_MARKER)
    if i < 0:
        sys.exit('src/shell.html: could not find %r' % HERO_MARKER)
    head, body = frag[:i].strip(), frag[i:].strip()
    head = re.sub(r'<title>.*?</title>\s*', '', head, count=1, flags=re.S)
    a = lambda s: html.escape(s, quote=True)
    meta = [
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>%s</title>' % a(TITLE),
        '<meta name="description" content="%s">' % a(DESCRIPTION),
        '<link rel="canonical" href="%s/">' % SITE_URL.rstrip('/'),
        '<meta name="theme-color" content="%s">' % THEME_COLOR,
        '<meta name="color-scheme" content="dark">',
        '<link rel="icon" href="/favicon.ico" sizes="32x32">',
        '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
        '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="%s">' % a(TITLE),
        '<meta property="og:url" content="%s/">' % SITE_URL.rstrip('/'),
        '<meta property="og:title" content="%s">' % a(TITLE),
        '<meta property="og:description" content="%s">' % a(DESCRIPTION),
        '<meta property="og:image" content="%s/og.png">' % SITE_URL.rstrip('/'),
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="%s">' % a(OG_IMAGE_ALT),
        '<meta name="twitter:card" content="summary_large_image">',
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    ]
    return ('<!doctype html>\n'
            '<!-- Generated by build.py from src/. Edit src/ and run `python3 build.py`; do not edit this file by hand. -->\n'
            '<html lang="en">\n<head>\n' + '\n'.join(meta) + '\n' + head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def build_public(out_dir):
    missing = [k for k in RIDES if not os.path.exists(os.path.join(HERE, 'src', 'engines', k + '.js'))]
    if missing:
        sys.exit('missing engine files: ' + ', '.join(missing))
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    page = web_page(fragment(RIDES))
    write(os.path.join(out_dir, 'index.html'), page)
    for rel in static_files():
        dst = os.path.join(out_dir, *rel.split('/'))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(HERE, 'static', *rel.split('/')), dst)
    return page


def check_public():
    pub = os.path.join(HERE, 'public')
    with tempfile.TemporaryDirectory() as tmp:
        fresh = os.path.join(tmp, 'public')
        build_public(fresh)
        a = tree(fresh); b = tree(pub) if os.path.isdir(pub) else set()
        stale = sorted(a ^ b) + sorted(n for n in a & b if not filecmp.cmp(os.path.join(fresh, n), os.path.join(pub, n), shallow=False))
    if stale:
        print('public/ is stale (differs from a fresh build): ' + ', '.join(stale))
        print('run: python3 build.py')
        return 1
    print('public/ is up to date with src/ and static/')
    return 0


def main(argv):
    only, with_test, out, artifact, check = None, False, None, None, False
    i = 0
    while i < len(argv):
        x = argv[i]
        if x == '--only': only = argv[i + 1]; i += 2
        elif x == '--with-test': with_test = True; i += 1
        elif x == '--out': out = os.path.abspath(argv[i + 1]); i += 2
        elif x == '--artifact': artifact = os.path.abspath(argv[i + 1]); i += 2
        elif x == '--check': check = True; i += 1
        elif x in ('-h', '--help'): print(__doc__); return 0
        else: sys.exit('unknown argument: %s (see --help)' % x)
    if check:
        return check_public()
    if only or with_test:   # dev builds never touch public/
        ids = [only] if only else list(RIDES)
        if only and not os.path.exists(os.path.join(HERE, 'src', 'engines', only + '.js')):
            sys.exit('no engine file src/engines/%s.js' % only)
        if with_test: ids.append('test')
        path = out or os.path.join(HERE, 'dev', (only or 'with-test') + '.html')
        page = web_page(fragment(ids))
        write(path, page)
        print('wrote %s (%.1f KB, dev only) rides=%s' % (os.path.relpath(path, HERE), len(page.encode('utf-8')) / 1024, ','.join(ids)))
        return 0
    if artifact:
        frag = fragment(RIDES)
        write(artifact, frag)
        print('wrote %s (%.1f KB artifact fragment)' % (artifact, len(frag.encode('utf-8')) / 1024))
        return 0
    page = build_public(os.path.join(HERE, 'public'))
    files = static_files()
    top = sorted({f.split('/')[0] + ('/' if '/' in f else '') for f in files})
    print('wrote public/index.html (%.1f KB) rides=%s, plus %d static files: %s' % (
        len(page.encode('utf-8')) / 1024, ','.join(RIDES), len(files), ', '.join(top)))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
