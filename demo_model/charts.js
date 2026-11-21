// Live week charts (heart rate, sleep score, stress, model risk) and the week timeline below them.
(function (P) {
  const LBL = 150, PADR = 14, TOP = 24, GAP = 6;
  let LANE = 86;
  const LANES = [
    { key: 'hr', label: 'Resting HR', unit: 'bpm', min: 45, max: 130, color: '#ff7a85' },
    { key: 'sleep', label: 'Sleep', unit: 'h', min: 0, max: 12, color: '#8fa8ff' },
    { key: 'stress', label: 'Stress', unit: '', min: 0, max: 100, color: '#f4b13e' },
    { key: 'risk', label: 'Migraine risk', unit: '%', min: 0, max: 1, color: '#ff6461' },
  ];
  let cv, cx, W, H, tl, tx, TW, TH;
  const flash = {};

  function setup(id) {
    const c = document.getElementById(id), w = c.clientWidth, h = c.clientHeight;
    const r = Math.max(2, window.devicePixelRatio || 1);
    c.width = w * r; c.height = h * r;
    const ctx = c.getContext('2d'); ctx.setTransform(r, 0, 0, r, 0, 0);
    return [c, ctx, w, h];
  }
  function init() {
    [cv, cx, W, H] = setup('charts');
    [tl, tx, TW, TH] = setup('timeline');
    LANE = (H - TOP - 3 * GAP) / 4;
  }
  const X = (t, w) => LBL + (t / P.T_END) * (w - LBL - PADR);
  const laneY = i => TOP + i * (LANE + GAP);
  const yv = (L, i, v) => laneY(i) + LANE - 6 - ((v - L.min) / (L.max - L.min)) * (LANE - 14);

  function riskBands(t) {
    const now = performance.now();
    for (let d = 0; d < 7; d++) {
      const r = P.DAYS[d].risk, lv = P.level(r);
      if (t < P.pubTime(d) || lv === 'low') continue;
      const x0 = X(d * 24, W), x1 = X(d * 24 + 24, W), c = lv === 'high' ? '255,100,97' : '244,177,62';
      const f = flash[d] ? Math.max(0, 1 - (now - flash[d]) / 2500) : 0;
      const g = cx.createLinearGradient(0, TOP, 0, H);
      g.addColorStop(0, `rgba(${c},${0.2 + f * 0.25})`); g.addColorStop(1, `rgba(${c},${0.06 + f * 0.15})`);
      cx.fillStyle = g; cx.fillRect(x0, TOP - 4, x1 - x0, H - TOP + 4);
      cx.fillStyle = `rgba(${c},.95)`; cx.fillRect(x0, TOP - 4, x1 - x0, 2);
      cx.font = '600 11px Inter, sans-serif'; cx.fillStyle = `rgb(${c})`;
      cx.fillText((lv === 'high' ? 'High risk ' : 'Elevated risk ') + Math.round(r * 100) + '%', x0 + 6, TOP - 9);
    }
  }

  function series(arr, L, i, t) {
    cx.strokeStyle = L.color; cx.lineWidth = 1.6; cx.lineJoin = 'round';
    cx.beginPath();
    let pen = false;
    const n = Math.min(P.N - 1, Math.floor(t / P.STEP));
    for (let k = 0; k <= n; k++) {
      const v = arr[k];
      if (v == null) { pen = false; continue; }
      const x = X(k * P.STEP, W), y = yv(L, i, v);
      pen ? cx.lineTo(x, y) : cx.moveTo(x, y); pen = true;
    }
    cx.stroke();
  }

  function render(t, done) {
    cx.clearRect(0, 0, W, H);
    LANES.forEach((L, i) => {
      cx.fillStyle = 'rgba(255,255,255,.03)';
      cx.fillRect(LBL, laneY(i), W - LBL - PADR, LANE);
    });
    // nights, past only
    cx.fillStyle = 'rgba(10,14,40,.55)';
    for (const n of P.NIGHTS) {
      if (n.start > t) continue;
      const a = X(Math.max(0, n.start), W), b = X(Math.min(t, n.end, P.T_END), W);
      cx.fillRect(a, TOP, b - a, H - TOP);
    }
    for (let d = 1; d < 7; d++) {
      cx.fillStyle = 'rgba(255,255,255,.07)'; cx.fillRect(X(d * 24, W), TOP, 1, H - TOP);
    }
    riskBands(t);

    series(P.HR, LANES[0], 0, t);
    series(P.ST, LANES[2], 2, t);
    // sleep score bars
    const SL = LANES[1];
    for (const n of P.NIGHTS) {
      if (n.start > t || n.score == null) continue;
      const a = X(Math.max(0, n.start), W), b = X(Math.min(t, n.end), W);
      const y = yv(SL, 1, n.score), base = laneY(1) + LANE - 6;
      cx.fillStyle = 'rgba(143,168,255,.55)'; cx.fillRect(a, y, b - a, base - y);
      if (t >= n.end) {
        cx.fillStyle = n.score < 6 ? '#ff8a87' : '#c9d4ff'; cx.font = '700 12px Inter, sans-serif';
        cx.fillText(n.score.toFixed(1) + ' h', Math.max(a, LBL + 2) + 2, y - 4);
      }
    }
    // risk lane: forecast per day, published 21:00 the evening before
    const RL = LANES[3];
    cx.setLineDash([3, 4]); cx.strokeStyle = 'rgba(255,255,255,.18)'; cx.lineWidth = 1;
    for (const v of [0.15, 0.4]) {
      const y = yv(RL, 3, v);
      cx.beginPath(); cx.moveTo(LBL, y); cx.lineTo(W - PADR, y); cx.stroke();
    }
    cx.setLineDash([]);
    for (let d = 0; d < 7; d++) {
      if (t < P.pubTime(d)) continue;
      const r = P.DAYS[d].risk, x0 = X(d * 24, W) + 3, x1 = X(d * 24 + 24, W) - 3;
      const y = yv(RL, 3, Math.max(r, 0.02)), base = laneY(3) + LANE - 6;
      cx.fillStyle = P.LEVEL_COLOR[P.level(r)];
      cx.globalAlpha = t < d * 24 ? 0.4 : 0.9;
      cx.fillRect(x0, y, x1 - x0, base - y);
      cx.globalAlpha = 1;
      cx.fillStyle = '#eef1f7'; cx.font = '600 11px Inter, sans-serif';
      cx.fillText(Math.round(r * 100) + '%', x0 + 2, y - 4);
    }
    // event markers
    for (const e of P.EVENTS) {
      if (!done.has(e.id) || e.kind === 'forecast') continue;
      const x = X(e.t, W), c = e.kind === 'attack' ? '#ff6461' : e.kind === 'warning' ? '#ff9f6b' : '#8fa8ff';
      cx.fillStyle = c; cx.fillRect(x - 0.75, TOP, 1.5, H - TOP);
    }
    // playhead
    const px = X(t, W);
    cx.fillStyle = '#eef1f7'; cx.fillRect(px - 1, TOP - 4, 2, H - TOP + 4);
    // labels with current values
    const d = P.dayOf(t), asleep = P.asleep(t);
    const lastNight = [...P.NIGHTS].reverse().find(n => n.end <= t && n.score != null);
    const vals = [
      Math.round(P.at(P.HR, t)) + ' bpm',
      lastNight ? lastNight.score.toFixed(1) + ' h' : '--',
      asleep ? '--' : String(Math.round(P.at(P.ST, t))),
      Math.round(P.DAYS[d].risk * 100) + '%',
    ];
    LANES.forEach((L, i) => {
      const y = laneY(i);
      cx.fillStyle = L.color; cx.fillRect(0, y + 8, 3, LANE - 16);
      cx.fillStyle = '#7f889b'; cx.font = '600 11px Inter, sans-serif';
      cx.fillText(L.label.toUpperCase(), 14, y + 24);
      cx.fillStyle = i === 3 ? P.LEVEL_COLOR[P.level(P.DAYS[d].risk)] : '#eef1f7';
      cx.font = '600 24px Inter, sans-serif';
      cx.fillText(vals[i], 14, y + 56);
      if (i === 3) { cx.fillStyle = '#7f889b'; cx.font = '500 11px Inter, sans-serif'; cx.fillText('forecast for today', 14, y + 74); }
    });
    renderTimeline(t, done);
  }

  function marker(kind, x, y) {
    tx.save(); tx.translate(x, y);
    if (kind === 'question') {
      tx.fillStyle = '#8fa8ff'; tx.beginPath(); tx.arc(0, 0, 9, 0, 7); tx.fill();
      tx.fillStyle = '#0b0f1a'; tx.font = '800 12px Inter, sans-serif'; tx.textAlign = 'center'; tx.fillText('?', 0, 4.5);
    } else if (kind === 'warning') {
      tx.fillStyle = '#ff9f6b'; tx.beginPath(); tx.moveTo(0, -10); tx.lineTo(10, 8); tx.lineTo(-10, 8); tx.fill();
      tx.fillStyle = '#0b0f1a'; tx.font = '800 11px Inter, sans-serif'; tx.textAlign = 'center'; tx.fillText('!', 0, 6);
    } else {
      tx.fillStyle = '#ff6461'; tx.rotate(Math.PI / 4); tx.fillRect(-7, -7, 14, 14);
    }
    tx.restore();
  }

  function renderTimeline(t, done) {
    tx.clearRect(0, 0, TW, TH);
    const y0 = 28, bh = 28;
    tx.fillStyle = '#7f889b'; tx.font = '600 11px Inter, sans-serif';
    tx.fillText('ANNA’S WEEK', 14, y0 + 12);
    tx.font = '500 11px Inter, sans-serif'; tx.fillText('click to jump', 14, y0 + 28);
    for (let d = 0; d < 7; d++) {
      const x0 = X(d * 24, TW), x1 = X(d * 24 + 24, TW), cur = P.dayOf(t) === d;
      const g = tx.createLinearGradient(x0, 0, x1, 0);
      const n = '#0d1330', day = cur ? '#3d5a8f' : '#2a3a5c';
      g.addColorStop(0, n); g.addColorStop(5 / 24, n); g.addColorStop(7.5 / 24, day);
      g.addColorStop(19.5 / 24, day); g.addColorStop(22 / 24, n); g.addColorStop(1, n);
      tx.fillStyle = g; tx.beginPath(); tx.roundRect(x0 + 2, y0, x1 - x0 - 4, bh, 6); tx.fill();
      tx.fillStyle = cur ? '#eef1f7' : '#b9c0cf'; tx.font = (cur ? '700' : '500') + ' 12px Inter, sans-serif';
      tx.fillText(P.DAYS[d].name + ' ' + P.DAYS[d].date, x0 + 6, y0 - 9);
      if (t >= P.pubTime(d)) {
        const r = P.DAYS[d].risk;
        tx.fillStyle = P.LEVEL_COLOR[P.level(r)];
        tx.beginPath(); tx.roundRect(x1 - 42, y0 - 21, 36, 16, 8); tx.fill();
        tx.fillStyle = '#0b0f1a'; tx.font = '700 10px Inter, sans-serif'; tx.textAlign = 'center';
        tx.fillText(Math.round(r * 100) + '%', x1 - 24, y0 - 9.5); tx.textAlign = 'left';
      }
    }
    // played part
    tx.fillStyle = 'rgba(143,168,255,.22)';
    tx.fillRect(X(0, TW) + 2, y0 + bh + 4, X(t, TW) - X(0, TW) - 2, 4);
    for (const e of P.EVENTS) if (e.kind !== 'forecast' && done.has(e.id)) marker(e.kind, X(e.t, TW), y0 + bh + 20);
    const px = X(t, TW);
    tx.fillStyle = '#eef1f7'; tx.fillRect(px - 1, y0 - 4, 2, bh + 8);
    tx.beginPath(); tx.arc(px, y0 + bh + 6, 5, 0, 7); tx.fill();
  }

  function timeAt(clientX) {
    const r = tl.getBoundingClientRect(), x = (clientX - r.left) * (TW / r.width);
    return Math.min(P.T_END - 0.01, Math.max(0, ((x - LBL) / (TW - LBL - PADR)) * P.T_END));
  }

  P.charts = { init, render, timeAt, flash: d => { flash[d] = performance.now(); } };
})(window.P);
