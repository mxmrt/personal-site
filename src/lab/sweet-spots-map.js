/* Sweet Spots map for the Lab card: Claude's map of 404 real candies, with a guided tour of the 30 new candies.
   Ported from the hero map of the Sweet Spots page: the same fitter, fly-in, marks, tour timing and tooltips.
   Changes for this site:
     - fixed light colours (the card is always the strawberry wrapper) and the site's fonts;
     - the tour card is a picture, not a button: this site has no candy lightbox;
     - the fly-in waits until the map scrolls into view, and nothing animates off-screen;
     - a Pause tour button (WCAG 2.2.2); under prefers-reduced-motion the map is still and there is no tour.
   Data: <script type="application/json" id="ss-data">, made by tools/lab/sweet_spots_data.py.
   Pictures: lab/sweet-spots/<id>.webp, copied by the same tool. If this script can't run, the static SVG map stays. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const box = $('#ssBox'), cv = $('#ssCanvas'), tip = $('#ssTip'), legend = $('#ssLegend'), hint = $('#ssHint'), btn = $('#ssTour');
  if (!box || !cv || !tip || !legend || !hint || !btn) return;
  let D;
  try { D = JSON.parse($('#ss-data').textContent); } catch (e) { console.error('Sweet Spots map: data missing', e); return; }
  const ctx = cv.getContext('2d'); if (!ctx) return;
  const fallback = $('.ss-map', box); if (fallback) fallback.remove();   // the static map, for when this script can't run

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const median = arr => { const s = [...arr].sort((a, b) => a - b), h = (s.length - 1) / 2, lo = Math.floor(h); return s[lo] + (h - lo) * ((s[lo + 1] ?? s[lo]) - s[lo]); };
  const x2 = v => `${v.toFixed(2)}×`;
  const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const T = { ink: hex('#1b1317'), sheet: hex('#ffffff'), pop: hex('#ff4f86'), sugar: hex('#ffe6ef') };
  const FONT = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const tierWord = t => t === 'A' ? 'Tier A' : t === 'C' ? 'Tier C' : 'Not rated';
  const nb = s => s.replace(/ /g, '\u00a0');   // keep "2.27× the typical gap" and "Tier A" whole when the card wraps
  const pic = g => `lab/sweet-spots/${g}.webp`;
  const diamond = (x, y, z) => { ctx.beginPath(); ctx.moveTo(x, y - z); ctx.lineTo(x + z, y); ctx.lineTo(x, y + z); ctx.lineTo(x - z, y); ctx.closePath(); };

  /* data: compact arrays (see tools/lab/sweet_spots_data.py) */
  const FAM = new Map(D.families.map(([f, name, short, count, ink]) => [f, { f, name, short, count, ink, rgb: hex(ink) }]));
  const run = {
    real: D.real.map(([x, y, f, n, nb, d]) => ({ x, y, f, n, nb, d })),
    new: D.new.map(([x, y, n, nov, tier, g, pitch]) => ({ x, y, n, nov, tier, g, pitch })),
    holes: D.holes.map(([x, y, r]) => ({ x, y, r })),
  };

  /* fit map coordinates into the box: uniform scale, y up, turned to fill the box (a UMAP picture has no fixed orientation) */
  function fitter(W, H, pad) {
    const pts = [];
    run.real.forEach(p => pts.push([p.x, p.y, 0])); run.new.forEach(p => pts.push([p.x, p.y, 0])); run.holes.forEach(h => pts.push([h.x, h.y, h.r]));
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const bw = W - pad.l - pad.r, bh = H - pad.t - pad.b;
    let best = null;
    for (let deg = 0; deg < 180; deg += 5) {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y, r] of pts) { const u = (x - cx) * c - (y - cy) * s, v = (x - cx) * s + (y - cy) * c; x0 = Math.min(x0, u - r); x1 = Math.max(x1, u + r); y0 = Math.min(y0, v - r); y1 = Math.max(y1, v + r); }
      const k = Math.min(bw / (x1 - x0), bh / (y1 - y0));
      if (!best || k > best.k * 1.03) best = { k, c, s, x0, x1, y0, y1 };
    }
    const { k, c, s, x0, x1, y0, y1 } = best;
    const ox = pad.l + (bw - (x1 - x0) * k) / 2, oy = pad.t + (bh - (y1 - y0) * k) / 2;
    return { k, X: (x, y) => ox + ((x - cx) * c - (y - cy) * s - x0) * k, Y: (x, y) => oy + (y1 - ((x - cx) * s + (y - cy) * c)) * k };
  }
  function placeTip(px, py) {
    tip.style.opacity = '1';
    const tw = tip.offsetWidth, th = tip.offsetHeight, hw = box.clientWidth;
    let l = px + 14, t = py - th - 12;
    if (l + tw > hw - 4) l = px - tw - 14;
    if (l < 4) l = Math.max(4, Math.min(hw - tw - 4, px - tw / 2));
    if (t < 4) t = py + 16;
    tip.style.left = `${l}px`; tip.style.top = `${t}px`;
  }

  const HINT = coarse ? 'Tap a candy to meet its family.' : 'Hover a candy to meet its family.';
  const HINT_TOUR = coarse ? 'Touring the new candies. Tap the map to explore it yourself.' : 'Touring the new candies. Move over the map to explore it yourself.';
  const DWELL = 3800, MOVE = 1050, IDLE = 30000;
  let W = 0, H = 0, dpr = 1, F = null, R = 3, narrow = false, raf = 0, t0 = 0, introAt = 0, introDone = reduceMotion;
  let visible = false, seen = false;   // any of the map on screen (it draws), a quarter of it (the fly-in and tour start)
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dots = run.real.map(p => ({ p, hx: 0, hy: 0, x: 0, y: 0, vx: 0, vy: 0, sx: rnd(), sy: rnd(), a: 1, at: 1 }));
  const gems = run.new.map(p => ({ p, hx: 0, hy: 0, a: 1, at: 1 }));
  const holes = run.holes.map(h => ({ h, hx: 0, hy: 0, r: 0 }));
  let labels = [], labelA = 1, labelAt = 1, hoverFam = 0, pinFam = 0, hover = null, lastType = 'mouse';
  const view = { s: 1, tx: 0, ty: 0 }; let vFrom = null, vTo = null, vT0 = 0, vDur = 0;
  let mode = 'play', stop = null, tourI = 0, interactedOnce = false, resumeOnShow = false, autoplay = !reduceMotion;
  let tourTimer = 0, tourTimer2 = 0, tourTimer3 = 0, idleTimer = 0, firstTimer = 0, resumeTimer = 0;
  const order = [...gems].sort((a, b) => b.p.nov - a.p.nov);
  const SX = x => x * view.s + view.tx, SY = y => y * view.s + view.ty;

  // the tour card: a picture of the new candy pinned beside its diamond (decorative: the canvas carries the name)
  const card = document.createElement('div');
  card.className = 'tour'; card.hidden = true; card.setAttribute('aria-hidden', 'true');
  box.appendChild(card);

  legend.innerHTML = [...FAM.values()].map(f => `<button class="fam" type="button" data-f="${f.f}" aria-pressed="false"><i style="--sw:${f.ink}"></i>${esc(f.short)} <b>${f.count}</b></button>`).join('');
  const syncLegend = () => legend.querySelectorAll('.fam').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.f === pinFam)));
  const syncBtn = () => { btn.textContent = autoplay ? 'Pause tour' : 'Play tour'; btn.dataset.on = autoplay ? '1' : '0'; };
  // where the map is, for the tests and tools: waiting (not yet seen), intro (dots flying in), play or tour
  const setState = () => { box.dataset.state = !introAt ? 'waiting' : !introDone ? 'intro' : mode; };
  hint.textContent = HINT; setState();
  if (!reduceMotion) { btn.hidden = false; syncBtn(); }

  function layoutLabels() {
    labels = [];
    if (narrow || !F) return;
    const fs = 12.5;
    ctx.font = `600 ${fs}px ${FONT}`;
    FAM.forEach(f => {
      const m = dots.filter(d => d.p.f === f.f); if (!m.length) return;
      let x = median(m.map(d => d.hx)), y = median(m.map(d => d.hy));
      const w = ctx.measureText(f.short).width + 8;
      x = clamp(x, w / 2 + 4, W - w / 2 - 4); y = clamp(y, fs + 4, H - 6);
      for (let n = 0; n < 12 && labels.some(l => Math.abs(l.x - x) < (l.w + w) / 2 && Math.abs(l.y - y) < fs + 4); n++) y += (n % 2 ? -1 : 1) * (fs + 5) * (n + 1);
      labels.push({ x, y, w, text: f.short, f: f.f });
    });
  }
  function layout() {
    const b = box.getBoundingClientRect(); W = b.width; H = b.height; if (!W || !H) return false;
    narrow = W < 520; box.classList.toggle('narrow', narrow);
    dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    F = fitter(W, H, narrow ? { l: 6, r: 6, t: 8, b: 8 } : { l: 10, r: 10, t: 12, b: 10 });
    R = clamp(W / 150, 2.6, 4.5);
    dots.forEach(d => {
      d.hx = F.X(d.p.x, d.p.y); d.hy = F.Y(d.p.x, d.p.y);
      if (!introAt && !reduceMotion) { d.x = d.sx * W; d.y = d.sy * H; }   // scattered until the fly-in starts
      else { d.x = d.hx; d.y = d.hy; d.vx = d.vy = 0; }
    });
    gems.forEach(g => { g.hx = F.X(g.p.x, g.p.y); g.hy = F.Y(g.p.x, g.p.y); });
    holes.forEach(o => { o.hx = F.X(o.h.x, o.h.y); o.hy = F.Y(o.h.x, o.h.y); o.r = Math.max(7, o.h.r * F.k); });
    layoutLabels();
    return true;
  }
  function targets() {
    const eff = hoverFam || pinFam;
    if (mode === 'tour') {
      dots.forEach(d => { d.at = 0.42; }); gems.forEach(g => { g.at = stop && g === stop ? 1 : 0.4; }); labelAt = 0;
    } else {
      dots.forEach(d => { d.at = eff && d.p.f !== eff ? 0.14 : 1; }); gems.forEach(g => { g.at = eff ? 0.55 : 1; }); labelAt = narrow ? 0 : 1;
    }
    wake();
  }
  function tweenView(to, dur) {
    if (reduceMotion || !dur) { Object.assign(view, to); vTo = null; wake(); return; }
    vFrom = { ...view }; vTo = to; vT0 = performance.now(); vDur = dur; wake();
  }

  /* ---- the fly-in starts the first time the map is in view; the tour follows unless the visitor got there first ---- */
  function begin() {
    if (introAt || !W || !seen) return;
    introAt = t0 = performance.now(); setState(); wake();
    if (autoplay) firstTimer = setTimeout(() => { if (!interactedOnce) startTour(); }, 2300);
  }

  /* ---- tour ---- */
  function placeCard() {
    if (!stop) return;
    const s = view.s, fx = stop.hx * s + view.tx, fy = stop.hy * s + view.ty;
    const cw = narrow ? Math.min(170, W * 0.5) : Math.min(250, W * 0.38);
    card.style.setProperty('--cw', `${cw}px`);
    const right = stop.side === 'right';
    let x = right ? fx + 26 : fx - 26 - cw; x = clamp(x, 6, W - cw - 6);
    const ch = card.offsetHeight || cw * 1.4;
    const y = clamp(fy - ch / 2, 6, Math.max(6, H - ch - 6));
    card.style.left = `${x}px`; card.style.top = `${y}px`;
    stop.cx = right ? x : x + cw; stop.cy = clamp(fy, y + 14, y + ch - 14);
  }
  function showStop() {
    if (mode !== 'tour') return;
    const gm = order[tourI % order.length], p = gm.p;
    stop = gm;
    const s = narrow ? 1.5 : 1.75;
    gm.side = gm.hx < W / 2 ? 'right' : 'left';
    const fx = W * (gm.side === 'right' ? (narrow ? 0.24 : 0.3) : (narrow ? 0.76 : 0.7)), fy = H * 0.5;
    tweenView({ s, tx: fx - gm.hx * s, ty: fy - gm.hy * s }, MOVE);
    targets();
    card.classList.remove('on'); card.hidden = false;
    card.style.setProperty('--dwell', `${DWELL}ms`);
    card.innerHTML = `<span class="tour-img"><img src="${pic(p.g)}" alt=""></span>` +
      `<span class="tour-txt"><span class="tour-k">◆ New candy ${tourI % order.length + 1} of ${order.length}</span><b>${esc(p.n)}</b>` +
      `<span class="tour-p">${esc(p.pitch)}</span><span class="tour-m">${nb(`${x2(p.nov)} ${narrow ? 'typical gap' : 'the typical gap'}`)} · ${nb(tierWord(p.tier))}</span></span><span class="tour-bar"><i></i></span>`;
    const nxt = order[(tourI + 1) % order.length]; if (nxt) { const im = new Image(); im.src = pic(nxt.p.g); }
    clearTimeout(tourTimer); clearTimeout(tourTimer2); clearTimeout(tourTimer3);
    tourTimer = setTimeout(() => { if (mode !== 'tour') return; placeCard(); card.classList.add('on'); wake(); }, MOVE * 0.7);
    tourTimer2 = setTimeout(() => { if (mode !== 'tour') return; card.classList.remove('on'); tourI++; tourTimer3 = setTimeout(showStop, 320); }, MOVE * 0.7 + DWELL);
  }
  function startTour() {
    if (reduceMotion || !autoplay || mode === 'tour' || !introAt) return;
    if (!visible) { resumeOnShow = true; return; }
    mode = 'tour'; hover = null; hoverFam = 0; pinFam = 0; syncLegend(); setState();
    tip.style.opacity = '0'; hint.textContent = HINT_TOUR;
    showStop();
  }
  function stopTour() {
    if (mode !== 'tour') return;
    mode = 'play'; clearTimeout(tourTimer); clearTimeout(tourTimer2); clearTimeout(tourTimer3); stop = null; setState();
    card.classList.remove('on'); setTimeout(() => { if (mode === 'play') card.hidden = true; }, 360);
    hint.textContent = HINT;
    tweenView({ s: 1, tx: 0, ty: 0 }, 650); targets();
  }
  function interacted() {
    interactedOnce = true; resumeOnShow = false; clearTimeout(resumeTimer); stopTour();
    clearTimeout(idleTimer); if (autoplay) idleTimer = setTimeout(startTour, IDLE);
  }
  btn.addEventListener('click', () => {
    autoplay = !autoplay; resumeOnShow = false;
    [idleTimer, firstTimer, resumeTimer].forEach(clearTimeout);
    if (autoplay) startTour(); else stopTour();
    syncBtn();
  });

  /* ---- drawing ---- */
  function physics() {
    let e = 0;
    for (const d of dots) {
      const ax = (d.hx - d.x) * 0.036, ay = (d.hy - d.y) * 0.036;
      d.vx = (d.vx + ax) * 0.83; d.vy = (d.vy + ay) * 0.83; d.x += d.vx; d.y += d.vy;
      e += Math.abs(d.vx) + Math.abs(d.vy);
    }
    return e;
  }
  function draw(now) {
    const t = introAt ? (now - t0) / 1000 : 0, show = reduceMotion ? 1 : clamp((t - 0.8) / 0.6);
    const zs = 1 + (view.s - 1) * 0.45, eff = hoverFam || pinFam;
    ctx.clearRect(0, 0, W, H);
    if (show > 0) {
      ctx.save(); ctx.setLineDash([3.5, 3]); ctx.lineWidth = 1.5;
      const ha = show * (mode === 'tour' ? 0.55 : 1);
      for (const o of holes) {
        ctx.beginPath(); ctx.arc(SX(o.hx), SY(o.hy), o.r * view.s * (0.6 + 0.4 * easeOut(show)), 0, Math.PI * 2);
        ctx.fillStyle = rgba(T.sugar, 0.85 * ha); ctx.fill(); ctx.strokeStyle = rgba(T.ink, 0.9 * ha); ctx.stroke();
      }
      ctx.restore();
    }
    const r = R * zs;
    for (const d of dots) {
      if (d.a < 0.02) continue;
      ctx.beginPath(); ctx.arc(SX(d.x), SY(d.y), r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(FAM.get(d.p.f).rgb, d.a); ctx.fill();
      ctx.lineWidth = 0.9; ctx.strokeStyle = rgba(T.sheet, Math.min(1, d.a)); ctx.stroke();
    }
    if (labelA > 0.02 && show > 0) {
      ctx.save(); ctx.font = `600 12.5px ${FONT}`; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4;
      for (const l of labels) {
        ctx.globalAlpha = labelA * show * (eff ? (l.f === eff ? 1 : 0.18) : 0.95);
        ctx.strokeStyle = rgba(T.sheet, 0.92); ctx.strokeText(l.text, SX(l.x), SY(l.y));
        ctx.fillStyle = rgba(T.ink); ctx.fillText(l.text, SX(l.x), SY(l.y));
      }
      ctx.restore();
    }
    const z = R * 1.8 * zs;
    gems.forEach((gm, i) => {
      const k = reduceMotion ? 1 : clamp((t - 1.15 - i * 0.025) / 0.45); if (k <= 0) return;
      const x = SX(gm.hx), y = SY(gm.hy) - (1 - easeOut(k)) * 24;
      ctx.globalAlpha = k * gm.a; diamond(x, y, z);
      if (gm.p.tier === 'A') { ctx.fillStyle = rgba(T.ink); ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(T.sheet); ctx.stroke(); }
      else { ctx.fillStyle = rgba(T.sheet); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(T.ink); ctx.stroke(); }
      ctx.globalAlpha = 1;
    });
    if (mode === 'tour' && stop) {
      const x = SX(stop.hx), y = SY(stop.hy), pulse = 0.5 + 0.5 * Math.sin(now / 260);
      ctx.beginPath(); ctx.arc(x, y, z + 6 + pulse * 4, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = rgba(T.pop, 0.55 + 0.45 * pulse); ctx.stroke();
      if (card.classList.contains('on') && stop.cx != null) {
        ctx.beginPath(); ctx.moveTo(x + (stop.side === 'right' ? z + 4 : -z - 4), y); ctx.lineTo(stop.cx, stop.cy);
        ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(T.ink); ctx.stroke();
        ctx.beginPath(); ctx.arc(stop.cx, stop.cy, 3, 0, Math.PI * 2); ctx.fillStyle = rgba(T.ink); ctx.fill();
      }
    }
    if (hover && mode === 'play') {
      const x = hover.kind === 'dot' ? SX(hover.o.x) : SX(hover.o.hx), y = hover.kind === 'dot' ? SY(hover.o.y) : SY(hover.o.hy);
      const rr = hover.kind === 'gem' ? z + 5 : hover.kind === 'hole' ? hover.o.r * view.s + 3 : r + 4;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = rgba(T.ink); ctx.stroke();
    }
  }
  function loop(now) {
    raf = 0;
    let busy = false;
    if (!introDone && introAt) { const e = physics(); if (e < 0.4 && (now - t0) > 1800) { introDone = true; dots.forEach(d => { d.x = d.hx; d.y = d.hy; }); setState(); } else busy = true; }
    for (const d of dots) { const dd = d.at - d.a; if (Math.abs(dd) > 0.01) { d.a += dd * 0.2; busy = true; } else d.a = d.at; }
    for (const g of gems) { const dd = g.at - g.a; if (Math.abs(dd) > 0.01) { g.a += dd * 0.2; busy = true; } else g.a = g.at; }
    { const dd = labelAt - labelA; if (Math.abs(dd) > 0.01) { labelA += dd * 0.2; busy = true; } else labelA = labelAt; }
    if (vTo) {
      const k = easeIO(clamp((now - vT0) / vDur));
      view.s = lerp(vFrom.s, vTo.s, k); view.tx = lerp(vFrom.tx, vTo.tx, k); view.ty = lerp(vFrom.ty, vTo.ty, k);
      if (k >= 1) vTo = null; else busy = true;
      if (mode === 'tour') placeCard();
    }
    if (mode === 'tour' || (!reduceMotion && introAt && now - t0 < 2400)) busy = true;   // pulse ring; diamonds dropping in
    draw(now);
    if (busy && visible) raf = requestAnimationFrame(loop);
  }
  function wake() { if (!raf && W) raf = requestAnimationFrame(loop); }

  /* ---- interaction ---- */
  function pick(px, py, touch) {
    const lim = touch ? 22 : 14;
    let best = null, bd = lim * lim;
    for (const g of gems) { const d = ((SX(g.hx) - px) ** 2 + (SY(g.hy) - py) ** 2) * 0.55; if (d < bd) { bd = d; best = { kind: 'gem', o: g }; } }
    for (const d0 of dots) { if (d0.a < 0.3) continue; const d = (SX(d0.x) - px) ** 2 + (SY(d0.y) - py) ** 2; if (d < bd) { bd = d; best = { kind: 'dot', o: d0 }; } }
    if (!best) for (const o of holes) { if (Math.hypot(SX(o.hx) - px, SY(o.hy) - py) < o.r * view.s) { best = { kind: 'hole', o }; break; } }
    return best;
  }
  function showTip(h) {
    hover = h;
    if (!h) { tip.style.opacity = '0'; tip.classList.remove('rich'); if (!pinFam) hoverFam = 0; targets(); return; }
    if (h.kind === 'dot') {
      const p = h.o.p, fam = FAM.get(p.f);
      hoverFam = p.f; tip.classList.remove('rich');
      tip.innerHTML = `<b>${esc(p.n)}</b><span class="fl"><i style="background:${fam.ink}"></i>${esc(fam.name)}</span>` +
        `<span>Nearest twin: ${esc(p.nb)}, ${x2(p.d)} the typical gap</span>`;
    } else if (h.kind === 'gem') {
      const p = h.o.p;
      hoverFam = 0; tip.classList.add('rich');
      tip.innerHTML = `<span class="ti"><img src="${pic(p.g)}" alt=""></span><span><b>${esc(p.n)} ◆</b><span>${esc(p.pitch)}</span>` +
        `<span>${x2(p.nov)} the typical gap · ${tierWord(p.tier)}</span></span>`;
    } else {
      hoverFam = 0; tip.classList.remove('rich');
      tip.innerHTML = `<b>Empty spot</b><span>It looked empty on this picture and stayed empty across all ${D.dims} attributes. The candies around it have little in common, so no new candy was aimed here.</span>`;
    }
    targets();
    const x = h.kind === 'dot' ? SX(h.o.x) : SX(h.o.hx), y = h.kind === 'dot' ? SY(h.o.y) : SY(h.o.hy);
    placeTip(x, y);
  }
  const local = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener('pointerdown', e => { lastType = e.pointerType; });
  cv.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    interacted();
    const [x, y] = local(e), h = pick(x, y, false);
    cv.style.cursor = h && (h.kind === 'gem' || h.kind === 'dot') ? 'pointer' : 'default';
    if (!h && !hover) return;
    if (h && hover && h.o === hover.o) return;
    showTip(h);
  });
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') showTip(null); });
  cv.addEventListener('click', e => {
    interacted();
    const touch = lastType !== 'mouse', [x, y] = local(e), h = pick(x, y, touch);
    if (h && h.kind === 'dot' && !touch) { pinFam = pinFam === h.o.p.f ? 0 : h.o.p.f; syncLegend(); }
    showTip(h || null);
  });
  legend.addEventListener('pointerover', e => { const b = e.target.closest('.fam'); if (!b || e.pointerType !== 'mouse') return; interacted(); hoverFam = +b.dataset.f; targets(); });
  legend.addEventListener('pointerleave', () => { hoverFam = 0; targets(); });
  legend.addEventListener('click', e => {
    const b = e.target.closest('.fam'); if (!b) return; interacted();
    const f = +b.dataset.f; pinFam = pinFam === f ? 0 : f; hoverFam = 0; syncLegend(); showTip(null);
  });
  legend.addEventListener('focusin', interacted);

  new IntersectionObserver(es => {
    const e = es[es.length - 1], was = visible, wasSeen = seen;
    visible = e.isIntersecting; seen = visible && e.intersectionRatio >= 0.25;
    if (!visible && mode === 'tour') { stopTour(); resumeOnShow = true; }
    if (visible && !was) wake();
    if (seen && !wasSeen) {
      if (!introAt) begin();
      else if (resumeOnShow) { resumeOnShow = false; clearTimeout(resumeTimer); resumeTimer = setTimeout(startTour, 1200); }
    }
  }, { threshold: [0, 0.25] }).observe(box);
  let lastW = 0;
  new ResizeObserver(() => {
    const w = box.clientWidth; if (Math.abs(w - lastW) < 2) return; lastW = w;
    const wasTour = mode === 'tour';
    if (wasTour) { mode = 'play'; [tourTimer, tourTimer2, tourTimer3].forEach(clearTimeout); card.classList.remove('on'); card.hidden = true; stop = null; Object.assign(view, { s: 1, tx: 0, ty: 0 }); vTo = null; hint.textContent = HINT; setState(); }
    if (!layout()) return;
    targets(); draw(performance.now());
    if (!introAt) begin(); else if (wasTour) startTour();
  }).observe(box);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (W) { layoutLabels(); wake(); } });
})();
