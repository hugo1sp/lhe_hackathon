// Week data for the prototype: Anna (P0187), Fri 2026-06-19 .. Thu 2026-06-25.
// Daily values for 06-21..06-25 and all risk values come from demo/anna_data.js.
// 06-19 and 06-20 are filled in near her 14-day baseline. Intraday curves are synthesized
// deterministically (seeded) around the daily values.
window.P = {};
(function (P) {
  P.DAYS = [
    { name: 'Fri', date: 19, risk: 0.025, sleep: 7.40, eff: 0.800, rhr: 69.2, stress: 61, steps: 4800 },
    { name: 'Sat', date: 20, risk: 0.032, sleep: 7.90, eff: 0.830, rhr: 70.4, stress: 66, steps: 6100 },
    { name: 'Sun', date: 21, risk: 0.041, sleep: 8.55, eff: 0.821, rhr: 76.9, stress: 83, steps: 5599 },
    { name: 'Mon', date: 22, risk: 0.086, sleep: 8.45, eff: 0.818, rhr: 74.8, stress: 94, steps: 3264 },
    { name: 'Tue', date: 23, risk: 0.128, sleep: 7.60, eff: 0.762, rhr: 76.6, stress: 88, steps: 6248 },
    { name: 'Wed', date: 24, risk: 0.331, sleep: 8.67, eff: 0.742, rhr: 77.6, stress: 81, steps: 4943 },
    { name: 'Thu', date: 25, risk: 0.723, sleep: 5.94, eff: 0.688, rhr: 77.1, stress: 92, steps: 3674, hrv: 28.4, cycle: 24 },
  ];
  // Anna's 14-day baseline before Thursday (base_* in anna_data.js).
  P.BASE = { sleep: 7.70, rhr: 71.9, hrv: 32.3, stress: 76, cycleLength: 25 };

  P.T_END = 168;            // hours in the week
  P.STEP = 1 / 6;           // 10-minute samples
  P.N = P.T_END * 6 + 1;
  P.WAKE = [7.1, 8.4, 8.9, 6.9, 7.0, 6.8, 6.5];
  P.ATTACK = { start: 6 * 24 + 14 + 50 / 60, end: 6 * 24 + 19 };

  P.dayOf = t => Math.min(6, Math.max(0, Math.floor(t / 24)));
  P.pubTime = d => d * 24 - 3;  // forecast for day d is made at 21:00 the evening before
  P.level = r => (r >= 0.5 ? 'high' : r >= 0.25 ? 'elev' : 'low');
  P.LEVEL_COLOR = { low: '#34c88a', elev: '#f4b13e', high: '#ff6461' };
  P.LEVEL_TEXT = { low: 'Low', elev: 'Elevated', high: 'High' };

  P.sleepScore = D => {
    const dur = Math.min(1, Math.max(0, (D.sleep - 5) / 3.5));
    return Math.round(Math.min(100, Math.max(0, 45 + 45 * dur + 60 * (D.eff - 0.78))));
  };

  // Sleep intervals; night d ends on the morning of day d.
  P.NIGHTS = P.DAYS.map((D, d) => {
    const end = d * 24 + P.WAKE[d];
    return { start: end - (D.sleep + 0.5), end, score: P.sleepScore(D) };
  });
  P.NIGHTS.push({ start: 6 * 24 + 22.6, end: 7 * 24 + 7, score: null });
  P.asleep = t => P.NIGHTS.some(n => t >= n.start && t < n.end);
  P.inAttack = t => t >= P.ATTACK.start && t < P.ATTACK.end;

  P.EVENTS = [
    { id: 'pub5', t: P.pubTime(5), kind: 'forecast', day: 5 },
    { id: 'q', t: 5 * 24 + 13 + 40 / 60, kind: 'question', block: true },
    { id: 'pub6', t: P.pubTime(6), kind: 'forecast', day: 6 },
    { id: 'warn', t: 6 * 24 + 7.5, kind: 'warning', block: true },
    { id: 'attack', t: P.ATTACK.start, kind: 'attack', block: true },
  ];

  // Fast-forward everywhere except the last 45 sim-minutes before each notification.
  P.isFast = t => !P.EVENTS.some(e => e.block && t >= e.t - 0.75 && t < e.t);

  P.CAPTIONS = [
    { t: 0, text: 'Fast-forwarding between notifications. The watch streams heart rate, sleep and stress, and every evening at 21:00 the model forecasts the next day. When nothing needs Anna, the app stays silent: no diary, no check-ins.' },
  ];

  P.fmtClock = t => {
    const m = ((Math.round(t * 60) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  P.fmtDay = t => { const D = P.DAYS[P.dayOf(t)]; return D.name + ' ' + D.date + ' Jun'; };

  // ---- Intraday series ----
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const bump = (h, c, w) => Math.exp(-((h - c) * (h - c)) / (2 * w * w));
  function activity(t) {
    const d = P.dayOf(t), h = t - d * 24, weekend = d === 1 || d === 2;
    const a = weekend
      ? 0.8 * bump(h, 11, 0.9) + 0.6 * bump(h, 15.5, 1.2)
      : 0.9 * bump(h, 8.1, 0.35) + 0.5 * bump(h, 12.3, 0.4) + 0.9 * bump(h, 17.2, 0.4);
    return a * P.DAYS[d].steps / 5000;
  }

  const rnd = mulberry32(187);
  P.HR = new Float32Array(P.N);
  P.ST = new Array(P.N);
  let hrPrev = null, stPrev = null;
  for (let i = 0; i < P.N; i++) {
    const t = i * P.STEP, d = P.dayOf(t), h = t - d * 24, D = P.DAYS[d];
    let hr, st = null;
    if (P.asleep(t)) {
      hr = D.rhr - 7 + 1.5 * Math.sin(t * 4.2) + (rnd() - 0.5) * 2;
      stPrev = null;
    } else {
      const att = P.inAttack(t), a = activity(t) * (att ? 0.1 : 1);
      st = D.stress * 0.8 + 10 * Math.sin(Math.PI * (h - 8) / 12) + 10 * a + (rnd() - 0.5) * 14 + (att ? 12 : 0);
      st = Math.min(99, Math.max(5, st));
      st = stPrev == null ? st : stPrev + 0.45 * (st - stPrev);
      stPrev = st;
      hr = D.rhr + 5 + 28 * a + (st - 50) * 0.1 + (rnd() - 0.5) * 5
        + (att ? 9 * Math.exp(-(t - P.ATTACK.start) * 1.2) : 0);
    }
    hr = hrPrev == null ? hr : hrPrev + 0.4 * (hr - hrPrev);
    hrPrev = hr;
    P.HR[i] = hr;
    P.ST[i] = st;
  }
  P.at = (arr, t) => arr[Math.min(P.N - 1, Math.max(0, Math.round(t / P.STEP)))];
})(window.P);
