"""Sweet Spots wordmark as SVG outlines: Archivo at wdth 125 / wght 860, letter-spacing -0.035em, two lines
("SWEET", "SP" + ring-and-diamond O + "TS") at line-height .8, with the strawberry plate shadow (.024em, .02em).
Mirrors the Sweet Spots page's .title CSS so the card matches the project's own wordmark.

Regenerates src/lab/sweet-spots-wordmark.svg (dev only; then run python3 build.py):
  pip install fonttools brotli uharfbuzz
  npm pack @fontsource-variable/archivo && tar xzf fontsource-variable-archivo-*.tgz   # Archivo, SIL OFL 1.1
  python3 tools/lab/sweet_spots_wordmark.py package/files/archivo-latin-wdth-normal.woff2 src/lab/sweet-spots-wordmark.svg
"""
import sys, io
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

src, out = sys.argv[1], sys.argv[2]
INK, PLATE = '#1b1317', '#c4155a'
var = TTFont(src)
axes = {a.axisTag: (a.minValue, a.maxValue) for a in var['fvar'].axes}
print('axes', axes, file=sys.stderr)
LOC = {'wght': 860, 'wdth': 125}
inst = instancer.instantiateVariableFont(TTFont(src), LOC)
inst.flavor = None   # plain TrueType for HarfBuzz
buf = io.BytesIO(); inst.save(buf); data = buf.getvalue()
upem = inst['head'].unitsPerEm
gs = inst.getGlyphSet()

face = hb.Face(data); font = hb.Font(face)
def shape(text):
    b = hb.Buffer(); b.add_str(text); b.guess_segment_properties()
    hb.shape(font, b, {'kern': True, 'liga': True})
    names = [inst.getGlyphName(i.codepoint) for i in b.glyph_infos]
    return list(zip(names, [(p.x_advance, p.x_offset, p.y_offset) for p in b.glyph_positions]))

EM = upem; LS = -0.035 * EM
paths, shadows, bounds = [], [], [None, None, None, None]
def grow(x0, y0, x1, y1):
    b = bounds
    bounds[:] = [x0 if b[0] is None else min(b[0], x0), y0 if b[1] is None else min(b[1], y0), x1 if b[2] is None else max(b[2], x1), y1 if b[3] is None else max(b[3], y1)]
def glyph(name, x, base):
    pen = SVGPathPen(gs, ntos=lambda v: '%d' % round(v))
    gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, base)))   # y down, baseline at `base`
    bp = BoundsPen(gs); gs[name].draw(TransformPen(bp, (1, 0, 0, -1, x, base)))
    if bp.bounds: grow(*bp.bounds)
    return pen.getCommands()
def run(text, x, base):
    for name, (adv, xo, yo) in shape(text):
        d = glyph(name, x + xo, base - yo)
        if d: paths.append(d)
        x += adv + LS
    return x
# line 1
run('SWEET', 0, 0)
# line 2: SP, the O (inline-block .86em x .73em, margins .005em, bottom on the baseline), TS
base2 = 0.8 * EM
x = run('SP', 0, base2)
ox = x + 0.005 * EM
s = min(0.86 * EM / 116, 0.73 * EM / 100)            # viewBox 116x100, xMidYMid meet
dx = ox + (0.86 * EM - 116 * s) / 2; dy = base2 - 0.73 * EM + (0.73 * EM - 100 * s) / 2
ring = f'<g transform="translate({dx:.0f} {dy:.0f}) scale({s:.4f})"><ellipse cx="58" cy="50" rx="49" ry="42" fill="none" stroke="{{c}}" stroke-width="15" stroke-dasharray="15.5 11"/><path d="M58 27L81 50 58 73 35 50Z"/></g>'
grow(dx + 1.5 * s, dy + 0.5 * s, dx + 114.5 * s, dy + 99.5 * s)
x = ox + 0.86 * EM + 0.005 * EM
run('TS', x, base2)
sx, sy = 0.024 * EM, 0.02 * EM
x0, y0, x1, y1 = bounds
pad = 0.01 * EM
vb = (x0 - pad, y0 - pad, (x1 + sx) - x0 + 2 * pad, (y1 + sy) - y0 + 2 * pad)
d = ''.join(paths)
ring_ink = ring.format(c='currentColor')
svg = (f'<svg class="ss-mark" viewBox="{vb[0]:.0f} {vb[1]:.0f} {vb[2]:.0f} {vb[3]:.0f}" role="img" aria-label="Sweet Spots">'
       f'<defs><g id="ss-word"><path d="{d}"/>{ring_ink}</g></defs>'
       f'<use href="#ss-word" fill="{PLATE}" color="{PLATE}" transform="translate({sx:.0f} {sy:.0f})"/>'
       f'<use href="#ss-word" fill="{INK}" color="{INK}"/></svg>')
open(out, 'w').write(svg)
print(f'upem {upem}, viewBox {vb}, {len(svg)} bytes', file=sys.stderr)
