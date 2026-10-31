"""Static SVG of Claude's Sweet Spots map: the 404 real candies (dots in their family inks), the 11 spots that stayed
empty (dashed rings) and the 30 new candies (diamonds; tier A filled). It is the Lab card's fallback for visitors
without JavaScript: src/lab/sweet-spots-map.js removes it and draws the live map in its place. Mirrors the live map
at its desktop size: same fitter (best rotation, uniform scale, y up), colours, dot, ring and diamond sizes.

Regenerates src/lab/sweet-spots-map.svg from the Sweet Spots page, which embeds its data as
<script type="application/json" id="candy-data"> (dev only; then run python3 build.py):
  python3 tools/lab/sweet_spots_map.py <sweet-spots-page.html> src/lab/sweet-spots-map.svg
"""
import json, math, re, sys
src, out = sys.argv[1], sys.argv[2]
W, H, PAD = 360, 240, dict(l=10, r=10, t=12, b=10)
SCALE = 360 / 600                         # the map box is about 600 CSS px wide on desktop
R = 600 / 150 * SCALE; Z = R * 1.8; RING_MIN = 7 * SCALE   # the live map: R = W / 150, diamonds 1.8 R, rings at least 7 px
C = {0: '#b9aa9e', 1: '#2a78d6', 2: '#eb6834', 3: '#1baf7a', 4: '#eda100', 5: '#e87ba4', 6: '#008300', 7: '#6250d6', 8: '#e34948'}
FAMC = {1: 8, 2: 3, 3: 2, 4: 1, 5: 5, 6: 7, 7: 6, 8: 4}   # family -> palette slot (Sweet Spots, Claude run)
INK, SHEET, SUGAR = '#1b1317', '#ffffff', '#ffe6ef'
s = open(src, encoding='utf-8').read()
run = json.loads(re.search(r'<script type="application/json" id="candy-data">(.*?)</script>', s, re.S).group(1))['claude']
pts = [(p['x'], p['y'], 0) for p in run['real']] + [(p['x'], p['y'], 0) for p in run['new']] + [(h['x'], h['y'], h['r']) for h in run['holes']]
cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
bw, bh = W - PAD['l'] - PAD['r'], H - PAD['t'] - PAD['b']
best = None
for deg in range(0, 180, 5):
    a = math.radians(deg); c, sn = math.cos(a), math.sin(a)
    us = [((x - cx) * c - (y - cy) * sn, (x - cx) * sn + (y - cy) * c, r) for x, y, r in pts]
    x0 = min(u - r for u, v, r in us); x1 = max(u + r for u, v, r in us); y0 = min(v - r for u, v, r in us); y1 = max(v + r for u, v, r in us)
    k = min(bw / (x1 - x0), bh / (y1 - y0))
    if not best or k > best[0] * 1.03: best = (k, c, sn, x0, x1, y0, y1)
k, c, sn, x0, x1, y0, y1 = best
ox = PAD['l'] + (bw - (x1 - x0) * k) / 2; oy = PAD['t'] + (bh - (y1 - y0) * k) / 2
X = lambda x, y: ox + ((x - cx) * c - (y - cy) * sn - x0) * k
Y = lambda x, y: oy + (y1 - ((x - cx) * sn + (y - cy) * c)) * k
f1 = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')
parts = []
# empty spots
for h in run['holes']:
    parts.append(f'<circle cx="{f1(X(h["x"], h["y"]))}" cy="{f1(Y(h["x"], h["y"]))}" r="{f1(max(RING_MIN, h["r"] * k))}"/>')
holes = f'<g fill="{SUGAR}" fill-opacity=".85" stroke="{INK}" stroke-opacity=".9" stroke-width="{f1(1.5 * SCALE)}" stroke-dasharray="{f1(3.5 * SCALE)} {f1(3 * SCALE)}">' + ''.join(parts) + '</g>'
# real candies: one white underlay, then one path per family ink (zero-length round-capped segments draw dots)
dot = lambda p: f'M{f1(X(p["x"], p["y"]))} {f1(Y(p["x"], p["y"]))}h0'
under = f'<path d="{"".join(dot(p) for p in run["real"])}" stroke="{SHEET}" stroke-width="{f1(2 * R + 1.8 * SCALE)}"/>'
fams = ''.join(f'<path d="{"".join(dot(p) for p in run["real"] if p["f"] == f)}" stroke="{C[FAMC[f]]}" stroke-width="{f1(2 * R)}"/>' for f in sorted(FAMC))
dots = f'<g fill="none" stroke-linecap="round">{under}{fams}</g>'
# new candies
dia = lambda p: f'M{f1(X(p["x"], p["y"]))} {f1(Y(p["x"], p["y"]) - Z)}l{f1(Z)} {f1(Z)} {f1(-Z)} {f1(Z)} {f1(-Z)} {f1(-Z)}z'
tierA = ''.join(dia(p) for p in run['new'] if p.get('tier') == 'A'); other = ''.join(dia(p) for p in run['new'] if p.get('tier') != 'A')
gems = (f'<path d="{tierA}" fill="{INK}" stroke="{SHEET}" stroke-width="{f1(1.3 * SCALE)}"/>' if tierA else '') + (f'<path d="{other}" fill="{SHEET}" stroke="{INK}" stroke-width="{f1(1.6 * SCALE)}"/>' if other else '')
svg = f'<svg class="ss-map" viewBox="0 0 {W} {H}" aria-hidden="true" focusable="false">{holes}{dots}{gems}</svg>'
open(out, 'w').write(svg)
print(f'{len(run["real"])} dots, {len(run["holes"])} rings, {len(run["new"])} diamonds ({sum(1 for p in run["new"] if p.get("tier") == "A")} tier A), rotation {math.degrees(math.atan2(sn, c)):.0f} deg, {len(svg)} bytes', file=sys.stderr)
