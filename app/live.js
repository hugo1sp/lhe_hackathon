"use strict";
/* Live mode: a running clock streams simulated watch data into Migrai (Anna, 23-25 June).
   Intraday heart rate, stress and steps are synthesized (deterministic) around Anna's daily values in
   anna_data.js. The app's own "now" (morning / evening) follows the clock, so morning and evening
   forecasts, her one-tap answers and her logged attack arrive when they happen.
   Leaving live mode restores the demo state as it was. Accuracy chart data: accuracy_data.js. */
(() => {
  const START = "2026-06-23", END_T = 72;              // hours since START 00:00
  const L = { on: false, t: 0, speed: 1, rt: false, skipNights: true, paused: false, snap: null, step: -1, slotKey: "", hadLog: false, answered: {} };

  /* ---------- Simulated watch signals ---------- */
  const dateAt = t => addDays(START, Math.floor(t / 24));
  const hourAt = t => t - 24 * Math.floor(t / 24);
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) + (hash(i + 1) - hash(i)) * u; };
  const bump = (h, c, w) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  function sleepWin(k) {                               // night ending on the morning of day START+k
    const d = day(addDays(START, k));
    return d ? [24 * k + d.mid - d.sleep / 2, 24 * k + d.mid + d.sleep / 2] : [24 * k - 1.25, 24 * k + 7];
  }
  const asleep = t => { const k = Math.floor(t / 24); return [k, k + 1].some(j => { const [a, b] = sleepWin(j); return t >= a && t < b; }); };
  const wakeAt = k => sleepWin(k)[1];
  const logHour = d => d && d.log ? +d.log.t.slice(0, 2) + +d.log.t.slice(3) / 60 : null;
  function attack(t) {                                 // 0..1 while Anna's logged migraine is going on
    const d = day(dateAt(t)), lh = logHour(d), h = hourAt(t);
    return lh != null && h >= lh ? Math.max(0, 1 - (h - lh) / 7) : 0;
  }
  function activity(t) {
    if (asleep(t)) return 0;
    const h = hourAt(t), d = day(dateAt(t));
    return (0.12 + 0.9 * bump(h, 8.2, 0.35) + 0.5 * bump(h, 12.3, 0.4) + 0.9 * bump(h, 17.3, 0.45)) * (attack(t) ? 0.2 : 1) * d.steps / 5000;
  }
  function stress(t) {
    if (asleep(t)) return null;
    const d = day(dateAt(t)), h = hourAt(t);
    const v = d.stress * 0.8 + 10 * Math.sin(Math.PI * (h - 8) / 12) + 16 * (vnoise(t * 1.5 + 50) - 0.5) + 14 * attack(t);
    return Math.round(Math.min(99, Math.max(5, v)));
  }
  function heart(t) {
    const d = day(dateAt(t));
    if (asleep(t)) return Math.round(d.rhr - 7 + 4 * (vnoise(t * 2) - 0.5));
    return Math.round(d.rhr + 4 + 26 * activity(t) + (stress(t) - 50) * 0.1 + 7 * (vnoise(t * 3 + 9) - 0.5) + 8 * attack(t));
  }
  const stepCache = {};
  function steps(t) {                                  // cumulative steps today, scaled to the day's total
    const k = Math.floor(t / 24), d = day(dateAt(t));
    if (!stepCache[k]) {
      const cum = [0];
      for (let i = 0; i < 144; i++) cum.push(cum[i] + activity(24 * k + i / 6));
      stepCache[k] = cum;
    }
    const cum = stepCache[k], i = Math.min(144, Math.floor(hourAt(t) * 6));
    return Math.round(d.steps * cum[i] / (cum[144] || 1));
  }
  function slotAt(t) {
    const k = Math.floor(t / 24), date = addDays(START, k);
    if (t < wakeAt(k)) return { date: addDays(date, -1), slot: "evening" };
    return { date, slot: hourAt(t) >= 20.5 ? "evening" : "morning" };
  }
  const hhmm = t => clock(hourAt(t));
  const fmtN = n => n.toLocaleString("en-GB");

  /* ---------- Hooks into the app ---------- */
  const origTimeAt = timeAt, origStep = stepNow, origToday = VIEWS.today;
  // In live mode "now" is the running clock (capped at 23:59 after midnight, which still belongs to the evening slot).
  timeAt = (now = S.now) => L.on && now.date === S.now.date && now.slot === S.now.slot
    ? (dateAt(L.t) > S.now.date ? "23:59" : hhmm(L.t)) : origTimeAt(now);
  stepNow = k => { if (!L.on) origStep(k); };
  VIEWS.today = () => { const html = origToday(); return L.on ? html.replace("</header>", "</header>" + liveCard()) : html; };

  function liveCard() {
    return card(`<div class="lc-h"><span class="lc-dot"></span>Live from your watch<span class="lc-t" id="lcState"></span></div>
      <div class="lc-grid"><div><span>Heart rate</span><b class="num" id="lcHr">–</b><small>bpm</small></div>
      <div><span>Stress</span><b class="num" id="lcSt">–</b><small>/100</small></div>
      <div><span>Steps today</span><b class="num" id="lcSteps">–</b><small>&nbsp;</small></div></div>`, "live-card");
  }

  /* ---------- Side panel ---------- */
  const side = document.querySelector(".side.left");
  side.querySelector(".brandrow").insertAdjacentHTML("afterend", `
    <div class="lv-switch"><button data-act="liveOff" class="on">Demo</button><button data-act="liveOn"><i class="lv-dot"></i>Live mode</button></div>
    <div class="lv" id="livePanel">
      <div class="lv-top"><div><div class="lv-clock num" id="lvClock">--:--</div><div class="lv-date" id="lvDate"></div></div><span class="lv-state" id="lvState"></span></div>
      <div class="lv-ctl"><button data-act="livePause" id="lvPause">Pause</button>
        <button data-act="liveSpeed" data-v="rt" title="One second per second, nothing skipped">Real time</button>
        ${[1, 4, 16].map(v => `<button data-act="liveSpeed" data-v="${v}" class="${v === 1 ? "on" : ""}">${v}x</button>`).join("")}
        <button data-act="liveNights" id="lvNights" class="on" title="Nights run 4x faster than days">Skip nights</button>
        <button data-act="liveRestart">Restart</button></div>
      <div class="lv-box"><div class="lv-h"><span>Watch stream</span><span>last 3 h</span></div>
        <svg id="lvSpark" viewBox="0 0 360 64" width="100%" height="64"></svg>
        <div class="lv-vals"><span>${ic("heart")}<b class="num" id="lvHr">–</b> bpm</span><span>${ic("bolt")}stress <b class="num" id="lvSt">–</b></span><span>${ic("steps")}<b class="num" id="lvSteps">–</b> steps</span></div></div>
      <div class="lv-feed" id="lvFeed"></div>
      <div class="lv-box"><div class="lv-h"><span>Forecast accuracy</span><span>ROC AUC by month of use</span></div>
        <svg id="lvAcc" viewBox="0 0 360 150" width="100%" height="150"></svg>
        <div class="lv-legend"><span><i class="ans"></i>Watch + one-tap answers</span><span><i class="base"></i>Watch only</span></div>
        <p class="lv-note" id="lvAccNote"></p></div>
    </div>`);

  function accChart() {
    const M = ACCURACY.by_month, W = 360, H = 150, l = 34, r = 10, t = 12, b = 22;
    const x = m => l + m / (M.length - 1) * (W - l - r), y = v => t + (1 - (v - 0.55) / 0.15) * (H - t - b);
    const line = k => M.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(1)},${y(p[k]).toFixed(1)}`).join("");
    let g = [0.55, 0.6, 0.65, 0.7].map(v => `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${l - 6}" y="${y(v) + 3.5}" text-anchor="end">${v.toFixed(2)}</text>`).join("");
    g += `<path d="${line("answers")}${[...M].reverse().map(p => `L${x(p.month).toFixed(1)},${y(p.base).toFixed(1)}`).join("")}Z" class="gap"/>`;
    g += `<path d="${line("base")}" class="base"/><path d="${line("answers")}" class="ans"/>`;
    M.forEach(p => g += `<text x="${x(p.month)}" y="${H - 6}" text-anchor="middle">${p.month}</text>`);
    const am = (toD(T()) - toD(DAYS[0].date)) / 864e5 / 30, i = Math.min(M.length - 2, Math.floor(am)), f = am - i;
    const av = M[i].answers + (M[i + 1].answers - M[i].answers) * f;
    g += `<circle cx="${x(am)}" cy="${y(av)}" r="5.5" class="anna" id="lvAnna"/><text x="${x(am)}" y="${y(av) - 10}" text-anchor="middle" class="annal">Anna</text>`;
    $("lvAcc").innerHTML = g;
  }
  function answerRate() {
    let n = 0;
    for (let k = 0; k < 28; k++) { const ds = addDays(T(), -k), d = day(ds); if (d && d.q && answerOf(ds)) n++; }
    return n / 4;
  }
  function accNote() {
    const M = ACCURACY.by_month, R = ACCURACY.by_rate, g0 = M[1].answers - M[1].base, g1 = M[M.length - 1].answers - M[M.length - 1].base;
    $("lvAccNote").innerHTML = `${ACCURACY.users} simulated users. Answers add <b>+${g0.toFixed(2)}</b> AUC in month 1, growing to <b>+${g1.toFixed(2)}</b> by month ${M.length - 1}. ` +
      `More answers, better forecast: ${R.map(p => `${p.per_week}/wk → ${p.auc.toFixed(2)}`).join(", ")}. Anna answers <b>${answerRate().toFixed(1)} per week</b>.`;
  }

  /* ---------- Feed ---------- */
  function feed(icon, text, cls = "") {
    const f = $("lvFeed");
    f.insertAdjacentHTML("afterbegin", `<div class="lv-row ${cls}"><span class="num">${hhmm(L.t)}</span>${ic(icon)}<span>${text}</span></div>`);
    while (f.children.length > 12) f.lastElementChild.remove();
  }
  function sample() {
    if (asleep(L.t)) { if (Math.round(L.t * (L.rt ? 60 : 6)) % 3 === 0) feed("moon", `Sleeping · ${heart(L.t)} bpm`); return; }
    feed("watch", `${heart(L.t)} bpm · stress ${stress(L.t)} · ${fmtN(steps(L.t))} steps`);
  }

  /* ---------- Clock ---------- */
  function syncSlot(force) {
    const s = slotAt(L.t), key = s.date + s.slot;
    if (!force && key === L.slotKey) return;
    const morning = L.slotKey && s.slot === "morning";
    L.slotKey = key;
    if (s.date === S.now.date && s.slot === S.now.slot) render(true); else setNow(s.date, s.slot);
    L.hadLog = !!logOf(T());
    if (morning) { const d = day(T()); feed("moon", `Sleep synced: ${hm(d.sleep)} · HRV ${d.hrv} ms · resting HR ${d.rhr}`, "ev"); }
    if (s.slot === "evening" && force !== "start") { const f = fc(heroDate()); if (f) feed("spark", `Forecast for tomorrow: ${pct(f.p)} (${level(f.p).txt.toLowerCase()})`, "ev"); }
  }
  function events() {
    const k = Math.floor(L.t / 24), date = dateAt(L.t), h = hourAt(L.t);
    // Anna answers the day's one-tap question on her watch around lunch (her real answer from the data).
    if (h >= 12.5 && !asleep(L.t) && !L.answered[date] && date === T()) {
      L.answered[date] = true;
      const q = questionOf(T()), a = day(T()).a;
      if (q && q.id !== "feel" && a && !S.answers[T()]) {
        S.answers[T()] = a; render();
        toast(`Answered on watch: ${a}`, "watch"); feed("pen", `One-tap answer: "${a}" · added to the model's labels`, "ev");
        accNote(); const m = $("lvAnna"); if (m) { m.classList.remove("pulse"); void m.getBBox(); m.classList.add("pulse"); }
      }
    }
    const has = !!logOf(T());
    if (has && !L.hadLog) {
      L.hadLog = true; render(); const l = logOf(T());
      toast(`Migraine logged on your watch · ${l.t}`, "bolt"); feed("bolt", `Migraine logged on watch at ${l.t}`, "bad");
    }
    if (k >= 0 && L.t >= END_T - 1 / 60) { L.paused = true; $("lvPause").textContent = "Play"; feed("info", "End of Anna's data (25 June)", "ev"); }
  }
  function paint() {
    const a = asleep(L.t), hr = heart(L.t), st = stress(L.t), sp = steps(L.t), att = attack(L.t) > 0;
    $("lvClock").textContent = hhmm(L.t) + (L.rt ? ":" + String(Math.floor(L.t * 3600) % 60).padStart(2, "0") : "");
    $("lvDate").textContent = longDate(dateAt(L.t));
    const state = att ? ["Migraine", "bad"] : a ? ["Asleep", "sleep"] : ["Awake", "ok"];
    $("lvState").textContent = state[0]; $("lvState").className = "lv-state " + state[1];
    $("lvHr").textContent = hr; $("lvSt").textContent = st ?? "–"; $("lvSteps").textContent = fmtN(sp);
    $("sbTime").textContent = hhmm(L.t);
    if ($("lcHr")) {
      $("lcHr").textContent = hr; $("lcSt").textContent = st ?? "–"; $("lcSteps").textContent = fmtN(sp);
      $("lcState").textContent = a ? "Sleeping · tracking" : "Synced just now";
    }
    const pts = []; for (let i = 36; i >= 0; i--) pts.push(heart(L.t - i / 12));
    const y = v => 58 - (v - 50) / 80 * 52;
    $("lvSpark").innerHTML = `<path d="${pts.map((v, i) => `${i ? "L" : "M"}${(i * 10).toFixed(0)},${y(v).toFixed(1)}`).join("")}" class="sp"/><circle cx="360" cy="${y(hr)}" r="4" class="spd"/>`;
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (L.on) {
      if (!L.paused) {
        const rate = L.rt ? 1 / 3600 : (asleep(L.t) && L.skipNights ? 4 / 3 : 1 / 3) * L.speed;  // sim hours per real second
        L.t = Math.min(END_T - 1 / 60, L.t + dt * rate);
        const step = Math.floor(L.t * (L.rt ? 60 : 6));
        if (step !== L.step) { L.step = step; sample(); }
        syncSlot(false); events();
      }
      paint();
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Controls ---------- */
  function start() {
    L.t = wakeAt(0) - 0.25; L.step = Math.floor(L.t * (L.rt ? 60 : 6)); L.answered = {}; $("lvFeed").innerHTML = ""; L.slotKey = ""; L.paused = false;
    $("lvPause").textContent = "Pause";
    S.tab = "today"; closeSheet();
    feed("watch", "Live mode on · streaming from Anna's watch", "ev");
    syncSlot("start"); accChart(); accNote();
  }
  function stop() {
    L.on = false; document.body.classList.remove("live");
    if (L.snap) { S = JSON.parse(L.snap); L.snap = null; }
    closeSheet(); render(true);
    document.querySelectorAll(".lv-switch button").forEach(b => b.classList.toggle("on", b.dataset.act === "liveOff"));
  }
  Object.assign(ACT, {
    liveOn: () => {
      if (L.on) return;
      L.snap = JSON.stringify(S); L.on = true; document.body.classList.add("live");
      document.querySelectorAll(".lv-switch button").forEach(b => b.classList.toggle("on", b.dataset.act === "liveOn"));
      start();
    },
    liveOff: () => { if (L.on) stop(); },
    livePause: () => { L.paused = !L.paused; $("lvPause").textContent = L.paused ? "Play" : "Pause"; },
    liveSpeed: el => { L.rt = el.dataset.v === "rt"; L.speed = L.rt ? 1 : +el.dataset.v; L.step = Math.floor(L.t * (L.rt ? 60 : 6)); $("lvNights").disabled = L.rt; document.querySelectorAll("[data-act=liveSpeed]").forEach(b => b.classList.toggle("on", b === el)); },
    liveNights: () => { L.skipNights = !L.skipNights; $("lvNights").classList.toggle("on", L.skipNights); },
    liveRestart: () => { if (L.snap) S = JSON.parse(L.snap); start(); },
  });
  /* ---------- Phone only: hide everything around the phone (button or F key) ---------- */
  document.body.insertAdjacentHTML("beforeend", `<button class="po-btn" data-act="phoneOnly" title="Toggle with F">Phone only</button>`);
  ACT.phoneOnly = () => {
    const on = document.body.classList.toggle("phone-only");
    document.querySelector(".po-btn").textContent = on ? "Show panels" : "Phone only";
  };
  addEventListener("keydown", e => { if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey && !e.altKey) ACT.phoneOnly(); });

  addEventListener("beforeunload", () => { if (L.on && L.snap) { S = JSON.parse(L.snap); save(); } });
  // ?live&phone (e.g. when opened from the followanna prototype): start in live mode and/or phone only
  const q = new URLSearchParams(location.search);
  if (q.has("live")) ACT.liveOn();
  if (q.has("phone")) ACT.phoneOnly();
  requestAnimationFrame(frame);
})();
