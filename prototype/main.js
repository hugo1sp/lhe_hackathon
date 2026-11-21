// Simulation clock, event scripts (question, warning, attack logging), captions and controls.
(function (P) {
  const S = P.S = { t: 5.5, paused: false, speed: 1, busy: false, tk: null, done: new Set(), cap: null, flags: { logged: false }, ended: false };
  const $ = id => document.getElementById(id);
  const dev = P.dev;

  function token() {
    const tk = { cancelled: false };
    tk.wait = ms => new Promise((res, rej) => {
      let left = ms, last = performance.now();
      const tick = () => {
        if (tk.cancelled) return rej(new Error('cancelled'));
        const now = performance.now();
        if (!S.paused) left -= (now - last) * Math.sqrt(S.speed);
        last = now;
        left <= 0 ? res() : requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return tk;
  }
  const say = text => { S.cap = { t: S.t + 1e-6, text }; };

  // ---- Event scripts ----
  async function question(tk) {
    say('Wednesday 13:40. Last night the model forecast 33% for today: elevated (the shaded band). Stress has been high since Sunday, so the app asks one question, because this answer would sharpen the forecast.');
    await tk.wait(900);
    dev.buzz();
    dev.setWatch(`<div class="w-app">${dev.ICON}Quick question</div>
      <div class="w-q">How do you feel right now?</div>
      <div class="w-opts"><button data-k="calm">Calm</button><button data-k="tense">Tense</button><button data-k="very">Very stressed</button></div>`);
    dev.showBanner('Quick question', 'Your stress has been high for 3 days. How do you feel right now?');
    await tk.wait(2800);
    await dev.tap('#wscreen [data-k="tense"]', tk);
    P.scene.glow = false;
    dev.setWatch(`<div class="w-done">${dev.CHECK}<div class="w-dt">Thanks</div><div class="w-ds">Saved. That was 1 tap.</div></div>`);
    dev.showBanner('Answered on watch', 'Tense, 13:40. Thanks, Anna.');
    await tk.wait(2400);
    dev.idle();
    say('Saved as a label for the model. One tap, once, only when it matters. Fast-forwarding to the next notification.');
  }

  async function warning(tk) {
    const D = P.DAYS[6], B = P.BASE;
    say('Thursday 07:30. Last night the forecast jumped to 72%, and Anna slept only 5.9 hours. She gets one clear heads-up in the morning.');
    await tk.wait(900);
    dev.buzz();
    dev.setWatch(`<div class="w-app">${dev.ICON}Heads-up</div>
      <div class="w-big">72%</div><div class="w-q">Migraine likely today</div>
      <div class="w-sub">Keep medication close</div><button class="w-ok" data-k="ok">OK</button>`);
    dev.showBanner('Migraine likely today (72%)', 'Short sleep, low HRV and high stress. Keep medication close and plan a lighter afternoon.');
    await tk.wait(2800);
    await dev.tap('#wscreen [data-k="ok"]', tk);
    P.scene.glow = false;
    dev.hideBanner();
    dev.setPhone(`<div class="p-h"><div class="p-hi">Heads-up</div><div class="p-sub">${P.fmtDay(S.t)}</div></div>
      <div class="p-risk lv-high"><div class="p-rn">72%</div><div class="p-rl">High risk of migraine today</div><div class="p-bar"><i style="width:72%"></i></div></div>
      <div class="p-sec">Why the model thinks so</div>
      <div class="p-row bad"><span>Sleep last night</span><b>${D.sleep.toFixed(1)} h <small>usual ${B.sleep.toFixed(1)}</small></b></div>
      <div class="p-row bad"><span>HRV</span><b>${Math.round(D.hrv)} ms <small>usual ${Math.round(B.hrv)}</small></b></div>
      <div class="p-row bad"><span>Resting heart rate</span><b>${Math.round(D.rhr)} <small>usual ${Math.round(B.rhr)}</small></b></div>
      <div class="p-row bad"><span>Stress</span><b>${D.stress} <small>usual ${B.stress}</small></b></div>
      <div class="p-row"><span>Cycle</span><b>day ${D.cycle} of ${B.cycleLength}</b></div>
      <div class="p-sec">Suggestions</div>
      <div class="p-tip">Keep medication within reach. Drink water. Plan a lighter afternoon.</div>`);
    dev.setWatch(`<div class="w-done">${dev.CHECK}<div class="w-dt">Got it</div><div class="w-ds">Details on your phone</div></div>`);
    await tk.wait(5200);
    dev.idle();
    say('Anna keeps her medication close and plans a calmer afternoon.');
  }

  async function attack(tk) {
    say('Thursday 14:50. The migraine starts. Logging it has to take seconds, even with a headache.');
    const sw = document.querySelector('.scene-wrap');
    sw.classList.remove('quake'); void sw.offsetWidth; sw.classList.add('quake');
    await tk.wait(2200);
    dev.idle(); dev.update(S.t);
    await dev.tap('#wscreen [data-k="log"]', tk);
    dev.setWatch(`<div class="w-q">How bad is it?</div><div class="w-sub">Started now · ${P.fmtClock(S.t)}</div>
      <div class="w-opts"><button data-k="mild">Mild</button><button data-k="mod">Moderate</button><button data-k="sev">Severe</button></div>`);
    await tk.wait(1400);
    await dev.tap('#wscreen [data-k="mod"]', tk);
    S.flags.logged = true;
    dev.setWatch(`<div class="w-done">${dev.CHECK}<div class="w-dt">Logged</div><div class="w-ds">${P.fmtClock(S.t)} · Moderate<br>2 taps</div></div>`);
    say('Two taps on the watch: onset time and severity are saved. The phone picks it up straight away.');
    dev.showBanner('Migraine logged on watch', `Started ${P.fmtClock(S.t)} · Moderate`);
    await tk.wait(2200);
    dev.hideBanner();
    dev.setPhone(`<div class="p-h"><div class="p-hi">Migraine logged</div><div class="p-sub">Started ${P.fmtClock(S.t)} · Moderate</div></div>
      <div class="p-sec">Add details (optional)</div>
      <div class="p-chips"><button data-k="med">Took medication</button><button>Dizziness</button><button>Nausea</button><button>Light sensitive</button></div>
      <button class="p-log" data-k="done">Done</button>`);
    await tk.wait(1200);
    await dev.tap('#pbody [data-k="med"]', tk);
    document.querySelector('#pbody [data-k="med"]').classList.add('sel');
    await tk.wait(600);
    await dev.tap('#pbody [data-k="done"]', tk);
    dev.setPhone(`<div class="p-saved">${dev.CHECK}<div class="p-hi">Saved</div><div class="p-sub">Rest up, Anna. We will check in when it is over.</div></div>`);
    await tk.wait(2400);
    dev.idle();
    say('Forecast confirmed: the warning came 7 h 20 min before onset, and the exact onset time is a clean label for the model.');
  }

  const SCRIPTS = { question, warning, attack };

  function fire(e) {
    if (e.kind === 'forecast') { P.charts.flash(e.day); return; }
    const tk = S.tk = token();
    S.busy = true;
    SCRIPTS[e.kind](tk).catch(() => {}).finally(() => {
      if (S.tk === tk) { S.busy = false; S.tk = null; }
      dev.hideFinger();
    });
  }

  function seek(t) {
    if (S.tk) S.tk.cancelled = true;
    S.tk = null; S.busy = false; S.ended = false; S.cap = null;
    S.t = t;
    S.done = new Set(P.EVENTS.filter(e => e.t < t).map(e => e.id));
    S.flags.logged = S.done.has('attack');
    dev.idle(); dev.hideFinger();
    $('summary').classList.remove('show');
  }

  // ---- Captions ----
  let shownCap = '';
  function caption() {
    let c = null;
    for (const x of P.CAPTIONS) if (x.t <= S.t) c = x;
    if (S.cap && (!c || S.cap.t >= c.t)) c = S.cap;
    const text = c ? c.text : '';
    if (text === shownCap) return;
    shownCap = text;
    const el = $('cap');
    el.textContent = text;
    el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
  }

  // ---- Loop ----
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!S.paused && !S.busy && !S.ended) {
      const rate = (P.isFast(S.t) ? 10 : P.asleep(S.t) ? 2.4 : 0.7) * S.speed;
      let nt = Math.min(P.T_END - 1 / 60, S.t + dt * rate);
      const e = P.EVENTS.find(x => !S.done.has(x.id) && x.t >= S.t && x.t <= nt);
      if (e) { nt = e.t; S.done.add(e.id); }
      S.t = nt;
      if (e) fire(e);
      if (S.t >= P.T_END - 1 / 60) { S.ended = true; $('summary').classList.add('show'); }
    }
    if (!S.paused) P.scene.advance(dt, S.t);
    const sc = P.scene.render(S.t);
    P.charts.render(S.t, S.done);
    dev.update(S.t);
    $('stage').classList.toggle('focus', S.busy);
    $('ff').classList.toggle('on', P.isFast(S.t) && !S.busy && !S.paused && !S.ended);
    $('clock').textContent = P.fmtClock(S.t);
    $('day').textContent = P.fmtDay(S.t);
    const dn = $('dn');
    const label = sc.pose === 'sleep' ? 'Asleep' : sc.light > 0.5 ? 'Day' : 'Night';
    if (dn.textContent !== label) { dn.textContent = label; dn.className = 'dn ' + label.toLowerCase(); }
    caption();
    requestAnimationFrame(frame);
  }

  // ---- Controls ----
  function fit() {
    const s = Math.min(innerWidth / 1600, innerHeight / 1000);
    document.documentElement.style.setProperty('--s', s);
  }
  function setPaused(p) {
    S.paused = p;
    $('play').textContent = p ? 'Play' : 'Pause';
  }

  window.addEventListener('load', () => {
    fit();
    P.scene.init(); P.charts.init(); dev.init();
    $('play').onclick = () => setPaused(!S.paused);
    $('restart').onclick = () => { seek(5.5); setPaused(false); };
    $('replay').onclick = () => { seek(5.5); setPaused(false); };
    document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => {
      S.speed = +b.dataset.speed;
      document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b));
    });
    $('timeline').onclick = ev => seek(P.charts.timeAt(ev.clientX));
    addEventListener('keydown', ev => { if (ev.code === 'Space') { ev.preventDefault(); setPaused(!S.paused); } });
    const q = new URLSearchParams(location.search);
    if (q.has('t')) seek(+q.get('t'));
    if (q.has('speed')) S.speed = +q.get('speed');
    requestAnimationFrame(frame);
  });
  addEventListener('resize', fit);
})(window.P);
