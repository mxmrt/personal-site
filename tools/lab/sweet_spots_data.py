#!/usr/bin/env python3
"""Make the data and pictures behind the Lab's live Sweet Spots map, from the Sweet Spots page.

The page embeds its data as <script type="application/json" id="candy-data"> and its family names, colours and
labels in its script and CSS. This keeps only what the map needs from Claude's run, as compact arrays:

  dims      number of attributes behind the map
  families  [f, full name, short label, count, ink]
  real      [x, y, f, name, nearest twin, gap to it in typical gaps]      (404 real candies)
  new       [x, y, name, novelty in typical gaps, tier, picture id, pitch]   (30 new candies)
  holes     [x, y, r]                                                       (11 spots that stayed empty)

It writes src/lab/sweet-spots-data.json, with <, > and & escaped so the JSON can sit inside an inline <script>.
With --images DIR it also copies each new candy's img/<id>/thumb.webp from DIR (the page's own folder) to
static/lab/sweet-spots/<id>.webp, the pictures the map's tour and tooltips show.

usage (dev only; then run python3 build.py):
  python3 tools/lab/sweet_spots_data.py <sweet-spots-page.html> [--images DIR]
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src', 'lab', 'sweet-spots-data.json')
PICS = os.path.join(ROOT, 'static', 'lab', 'sweet-spots')


def js_object(src, name, key):
    """{1: 'x', 2: 'y'} or {1: 8, 2: 3} for `key` inside `const name = { key: {...} }` in the page script."""
    block = re.search(r'const %s = \{(.*?)\n  \};' % name, src, re.S) or re.search(r'const %s = \{(.*?)\};' % name, src)
    if not block:
        sys.exit('could not find %s in the page script' % name)
    inner = re.search(r'\b%s: \{(.*?)\}' % key, block.group(1))
    if not inner:
        sys.exit('could not find %s.%s in the page script' % (name, key))
    return {int(k): (v if q else int(v)) for k, q, v in re.findall(r"(\d+): ('?)([^',}]*)\2", inner.group(1))}


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__); return 0
    page = open(argv[0], encoding='utf-8').read()
    images = argv[argv.index('--images') + 1] if '--images' in argv else None
    m = re.search(r'<script type="application/json" id="candy-data">(.*?)</script>', page, re.S)
    if not m:
        sys.exit('no <script type="application/json" id="candy-data"> in ' + argv[0])
    data = json.loads(m.group(1))
    run, gallery = data['claude'], {g['g']: g for g in data['gallery']}
    short, famc = js_object(page, 'SHORT', 'claude'), js_object(page, 'FAMC', 'claude')
    # family inks: the light theme's --c0..--c8, the first :root block that defines them (the dark ones come later)
    ink = next(dict(re.findall(r'--c(\d):(#[0-9a-fA-F]{6})', b)) for b in re.findall(r':root\{(.*?)\}', page, re.S) if '--c1:' in b)
    twins = {s['n']: s for s in run['strip']['real']}
    out = {
        'dims': run['dims'],
        'families': [[f['f'], f['name'], short[f['f']], f['count'], ink[str(famc[f['f']])].lower()] for f in run['families']],
        'real': [[p['x'], p['y'], p['f'], p['n'], twins[p['n']]['nb'], twins[p['n']]['d']] for p in run['real']],
        'new': [[p['x'], p['y'], p['n'], p['nov'], p['tier'], p['g'], gallery[p['g']]['pitch']] for p in run['new']],
        'holes': [[h['x'], h['y'], h['r']] for h in run['holes']],
    }
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    text = text.replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text + '\n')
    print('wrote %s (%.1f KB): %d real, %d new, %d empty spots, %d families' % (
        os.path.relpath(OUT, ROOT), len(text.encode('utf-8')) / 1024, len(out['real']), len(out['new']), len(out['holes']), len(out['families'])))
    if images:
        os.makedirs(PICS, exist_ok=True)
        for p in run['new']:
            src = os.path.join(images, 'img', p['g'], 'thumb.webp')
            if not os.path.isfile(src):
                sys.exit('missing picture ' + src)
            shutil.copyfile(src, os.path.join(PICS, p['g'] + '.webp'))
        print('copied %d pictures to %s' % (len(run['new']), os.path.relpath(PICS, ROOT)))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
