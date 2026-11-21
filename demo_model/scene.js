// Scene: Anna walking (or sleeping / in an attack) under a sky that follows the time of day.
(function (P) {
  let cv, cx, W, H, walk = 0;
  const stars = Array.from({ length: 90 }, (_, i) => ({
    x: (Math.sin(i * 91.7) * 0.5 + 0.5), y: (Math.sin(i * 37.3) * 0.5 + 0.5) * 0.55, p: i * 1.7,
  }));

  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mix = (c1, c2, k) => {
    const a = hex(c1), b = hex(c2);
    return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')';
  };
  const SKY = [
    [0, '#060914', '#121a33'], [4.5, '#0a0f24', '#1c2547'], [5.5, '#2b2f5e', '#e9876a'],
    [6.6, '#5d8fd6', '#f6c48f'], [8, '#5f9ce6', '#bfe0ff'], [18.5, '#5f9ce6', '#bfe0ff'],
    [20.5, '#40507f', '#f19066'], [21.5, '#1b1f45', '#5a3d6e'], [22.5, '#060914', '#121a33'], [24, '#060914', '#121a33'],
  ];
  function sky(h) {
    let i = 0;
    while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i++;
    const [h0, t0, b0] = SKY[i], [h1, t1, b1] = SKY[i + 1], k = (h - h0) / (h1 - h0);
    return [mix(t0, t1, k), mix(b0, b1, k)];
  }
  const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  P.daylight = h => smooth(5, 7.5, h) * (1 - smooth(19.5, 22, h));

  function pose(t) {
    if (P.asleep(t)) return 'sleep';
    if (P.inAttack(t)) return 'attack';
    return 'walk';
  }
  P.pose = pose;

  function init() {
    cv = document.getElementById('scene');
    cx = cv.getContext('2d');
    W = cv.clientWidth; H = cv.clientHeight;
    const r = Math.max(2, window.devicePixelRatio || 1);
    cv.width = W * r; cv.height = H * r;
    cx.setTransform(r, 0, 0, r, 0, 0);
  }

  function advance(dt, t) {
    const p = pose(t);
    if (p === 'walk') walk += dt * (t > P.ATTACK.end && t < 7 * 24 ? 55 : 110);
  }

  function seg(x1, y1, x2, y2, w, c) {
    cx.strokeStyle = c; cx.lineWidth = w; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
  }
  const pt = (x, y, len, a) => [x + len * Math.sin(a), y + len * Math.cos(a)];

  function drawBackground(t, light) {
    const h = ((t % 24) + 24) % 24;
    const [top, bot] = sky(h);
    const g = cx.createLinearGradient(0, 0, 0, H * 0.8);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);

    const now = performance.now() / 1000;
    for (const s of stars) {
      cx.globalAlpha = (1 - light) * (0.5 + 0.5 * Math.sin(now * 1.3 + s.p));
      cx.fillStyle = '#fff'; cx.fillRect(s.x * W, s.y * H, 1.6, 1.6);
    }
    cx.globalAlpha = 1;

    if (h > 5.2 && h < 21.8) {
      const f = (h - 5.2) / 16.6, x = W * (0.06 + 0.88 * f), y = H * 0.75 - Math.sin(f * Math.PI) * H * 0.6;
      const sg = cx.createRadialGradient(x, y, 4, x, y, 60);
      sg.addColorStop(0, 'rgba(255,236,170,.9)'); sg.addColorStop(1, 'rgba(255,236,170,0)');
      cx.fillStyle = sg; cx.beginPath(); cx.arc(x, y, 60, 0, 7); cx.fill();
      cx.fillStyle = '#ffe7a3'; cx.beginPath(); cx.arc(x, y, 17, 0, 7); cx.fill();
    } else {
      const f = ((h - 21.5 + 24) % 24) / 8.2, x = W * (0.06 + 0.88 * f), y = H * 0.7 - Math.sin(f * Math.PI) * H * 0.52;
      cx.fillStyle = '#e8ecff'; cx.beginPath(); cx.arc(x, y, 14, 0, 7); cx.fill();
      cx.fillStyle = top; cx.beginPath(); cx.arc(x + 6, y - 4, 12, 0, 7); cx.fill();
    }

    // far hills
    cx.fillStyle = mix('#1a2440', '#7fa3c4', light);
    cx.beginPath(); cx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const u = x + walk * 0.08;
      cx.lineTo(x, H * 0.62 - 22 * Math.sin(u / 160) - 12 * Math.sin(u / 57 + 1));
    }
    cx.lineTo(W, H); cx.fill();

    // mid layer: trees, houses, lamps
    const par = walk * 0.4, gap = 120, gy = H * 0.8;
    for (let i = Math.floor(par / gap) - 1; i < (par + W) / gap + 1; i++) {
      const x = i * gap - par, kind = Math.abs(Math.floor(Math.sin(i * 12.9898) * 1000)) % 5;
      if (kind <= 1) {
        seg(x, gy, x, gy - 34, 6, mix('#1c1a22', '#6b4f3a', light));
        cx.fillStyle = mix('#13261f', '#4f9a6a', light);
        cx.beginPath(); cx.arc(x, gy - 50, 24 + kind * 6, 0, 7); cx.fill();
      } else if (kind === 2) {
        cx.fillStyle = mix('#1d2135', '#d9cfc2', light); cx.fillRect(x - 34, gy - 58, 68, 58);
        cx.fillStyle = mix('#2a1f2c', '#a4574a', light);
        cx.beginPath(); cx.moveTo(x - 40, gy - 56); cx.lineTo(x, gy - 86); cx.lineTo(x + 40, gy - 56); cx.fill();
        cx.fillStyle = light < 0.5 ? '#ffd27a' : '#7a8fa8';
        cx.fillRect(x - 22, gy - 44, 14, 14); cx.fillRect(x + 8, gy - 44, 14, 14);
      } else if (kind === 3) {
        seg(x, gy, x, gy - 70, 3, mix('#2a2f3d', '#59606e', light));
        if (light < 0.6) {
          const lg = cx.createRadialGradient(x, gy - 70, 2, x, gy - 70, 40);
          lg.addColorStop(0, 'rgba(255,214,140,.8)'); lg.addColorStop(1, 'rgba(255,214,140,0)');
          cx.fillStyle = lg; cx.beginPath(); cx.arc(x, gy - 70, 40, 0, 7); cx.fill();
        }
      }
    }
    // ground and path
    cx.fillStyle = mix('#0e1420', '#5d8c58', light); cx.fillRect(0, gy, W, H - gy);
    cx.fillStyle = mix('#1a1f2b', '#c9b99a', light); cx.fillRect(0, H * 0.86, W, 14);
    cx.fillStyle = mix('#232a39', '#e4d7bb', light);
    for (let x = -(walk % 40); x < W; x += 40) cx.fillRect(x, H * 0.86 + 6, 18, 2);
  }

  const COL = { skin: '#f1c7a5', hair: '#5b3a29', jacket: '#4f63e6', pants: '#2b3145', shoe: '#1a1d26' };

  function drawWalker(x, y, t, still) {
    const ph = still ? 0 : walk / 22, bob = still ? 0 : -Math.abs(Math.cos(ph)) * 3;
    const hip = [x, y - 60 + bob], sh = [x + 3, y - 108 + bob], head = [x + 5, y - 124 + bob];
    for (const s of [0, Math.PI]) {               // legs: back one first
      const a = still ? (s ? -0.08 : 0.08) : 0.5 * Math.sin(ph + s);
      const knee = pt(hip[0], hip[1], 29, a);
      const bend = still ? 0 : 0.7 * Math.max(0, Math.sin(ph + s - 1.2));
      const foot = pt(knee[0], knee[1], 29, a - bend);
      const c = s ? '#232838' : COL.pants;
      seg(hip[0], hip[1], knee[0], knee[1], 10, c); seg(knee[0], knee[1], foot[0], foot[1], 9, c);
      seg(foot[0], foot[1], foot[0] + 9, foot[1], 7, COL.shoe);
    }
    // back arm
    const ab = still ? 0.05 : -0.45 * Math.sin(ph + Math.PI);
    const eb = pt(sh[0], sh[1], 24, ab), hb = pt(eb[0], eb[1], 22, ab + 0.35);
    seg(sh[0], sh[1], eb[0], eb[1], 8, '#3b4cc0'); seg(eb[0], eb[1], hb[0], hb[1], 7, '#3b4cc0');
    seg(hip[0], hip[1], sh[0], sh[1], 22, COL.jacket);            // torso
    drawHead(head);
    // front arm (watch wrist)
    let ef, hf;
    if (still) {                                                 // hand to forehead
      ef = pt(sh[0], sh[1], 24, 2.25); hf = [head[0] + 11, head[1] - 4];
    } else {
      const af = -0.45 * Math.sin(ph); ef = pt(sh[0], sh[1], 24, af); hf = pt(ef[0], ef[1], 22, af + 0.35);
    }
    seg(sh[0], sh[1], ef[0], ef[1], 8, COL.jacket); seg(ef[0], ef[1], hf[0], hf[1], 7, COL.jacket);
    drawWatch((ef[0] + hf[0] * 2) / 3, (ef[1] + hf[1] * 2) / 3);
    cx.fillStyle = COL.skin; cx.beginPath(); cx.arc(hf[0], hf[1], 4.5, 0, 7); cx.fill();
    return head;
  }

  function drawHead(head) {
    cx.fillStyle = COL.hair;
    cx.beginPath(); cx.arc(head[0] - 3, head[1] - 1, 14.5, 0, 7); cx.fill();
    const sw = Math.sin(walk / 22) * 3;                          // ponytail
    seg(head[0] - 14, head[1] - 4, head[0] - 24, head[1] + 10 + sw, 7, COL.hair);
    cx.fillStyle = COL.skin; cx.beginPath(); cx.arc(head[0] + 1, head[1] + 1, 12, 0, 7); cx.fill();
    cx.fillStyle = COL.hair; cx.beginPath(); cx.arc(head[0] - 1, head[1] - 5, 12.5, Math.PI * 1.05, Math.PI * 1.95); cx.fill();
    cx.fillStyle = '#2a2230'; cx.beginPath(); cx.arc(head[0] + 8, head[1] - 1, 1.6, 0, 7); cx.fill();
  }

  function drawWatch(x, y) {
    cx.fillStyle = '#111'; cx.fillRect(x - 5, y - 4, 10, 8);
    if (P.scene.glow) {
      const a = 0.55 + 0.45 * Math.sin(performance.now() / 120);
      cx.fillStyle = `rgba(143,168,255,${a})`; cx.fillRect(x - 3.5, y - 2.5, 7, 5);
      cx.strokeStyle = `rgba(143,168,255,${a * 0.5})`; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(x, y, 12 + 4 * a, 0, 7); cx.stroke();
    } else { cx.fillStyle = '#2b3550'; cx.fillRect(x - 3.5, y - 2.5, 7, 5); }
  }

  function drawSleeper(x, y) {
    const now = performance.now() / 1000;
    cx.fillStyle = '#3a2f3a'; cx.fillRect(x - 80, y - 34, 170, 18); cx.fillRect(x - 84, y - 60, 8, 60); cx.fillRect(x + 86, y - 44, 6, 44);
    cx.fillStyle = '#d8dcf0'; cx.beginPath(); cx.ellipse(x - 56, y - 42, 22, 9, 0, 0, 7); cx.fill();
    cx.fillStyle = COL.hair; cx.beginPath(); cx.arc(x - 54, y - 52, 13, 0, 7); cx.fill();
    cx.fillStyle = COL.skin; cx.beginPath(); cx.arc(x - 50, y - 50, 10.5, 0, 7); cx.fill();
    cx.fillStyle = '#6f7fe8';
    cx.beginPath(); cx.roundRect(x - 40, y - 52 + Math.sin(now * 1.6) * 1.2, 126, 20, 9); cx.fill();
    cx.fillStyle = 'rgba(220,226,255,.85)'; cx.font = '600 15px Inter, sans-serif';
    for (let i = 0; i < 3; i++) {
      const k = (now * 0.35 + i / 3) % 1;
      cx.globalAlpha = Math.sin(k * Math.PI);
      cx.fillText('z', x - 34 + k * 30 + i * 4, y - 70 - k * 46);
    }
    cx.globalAlpha = 1;
  }

  function drawAttackAura(head) {
    const now = performance.now() / 1000;
    for (let i = 0; i < 3; i++) {
      const k = (now * 0.6 + i / 3) % 1;
      cx.strokeStyle = `rgba(255,100,97,${0.5 * (1 - k)})`; cx.lineWidth = 2.5;
      cx.beginPath(); cx.arc(head[0], head[1], 16 + k * 34, 0, 7); cx.stroke();
    }
    cx.strokeStyle = 'rgba(255,170,90,.9)'; cx.lineWidth = 2;
    for (let j = 0; j < 3; j++) {
      const ox = head[0] - 30 + j * 9 + Math.sin(now * 5 + j) * 2, oy = head[1] - 30 - j * 4;
      cx.beginPath(); cx.moveTo(ox, oy); cx.lineTo(ox + 4, oy - 6); cx.lineTo(ox + 8, oy); cx.lineTo(ox + 12, oy - 6); cx.stroke();
    }
  }

  function render(t) {
    const h = ((t % 24) + 24) % 24, light = P.daylight(h), p = pose(t);
    cx.clearRect(0, 0, W, H);
    drawBackground(t, light);
    const x = W * 0.36, y = H * 0.87;
    if (p === 'sleep') drawSleeper(x, y);
    else {
      if (p === 'attack') { cx.fillStyle = 'rgba(120,40,80,.18)'; cx.fillRect(0, 0, W, H); }  // tint background only
      const head = drawWalker(x, y, t, p === 'attack');
      if (p === 'attack') drawAttackAura(head);
    }
    return { light, pose: p };
  }

  P.scene = { init, render, advance, glow: false };
})(window.P);
