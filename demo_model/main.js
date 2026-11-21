// Simulation clock, event scripts (question, warning, attack logging), captions and controls.
(function (P) {
  const S = P.S = { t: 5.5, paused: false, speed: 1, busy: false, tk: null, done: new Set(), cap: null, flags: { logged: false }, ended: false, manual: false, target: null, userLog: null };
  const $ = id => document.getElementById(id);
  const dev = P.dev;

  function token() {
    const tk = { cancelled: false };
    tk.wait = ms => new Promise((res, rej) => {
      let left = ms, last = performance.now();
      const tick = () => {
        if (tk.cancelled) return rej(new Error('cancelled'));
        const now = performance.now();
        if (!S.paused || S.manual) left -= (now - last) * Math.sqrt(S.speed);
        last = now;
        left <= 0 ? res() : requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return tk;
  }
  const say = text => { S.cap = { t: S.t + 1e-6, text }; };


  const LABEL_KEY = 'migrai-followanna-model-labels';
  function saveLabel(day, fields, question, answer) {
    try {
      const rows = JSON.parse(localStorage.getItem(LABEL_KEY) || '[]');
      const prior = rows.find(r => r.date === day.iso) || {};
      const row = { ...prior, person_id: window.WEEK.person.id, date: day.iso, question, answer, ...fields };
      localStorage.setItem(LABEL_KEY, JSON.stringify([...rows.filter(r => r.date !== day.iso), row]));
    } catch (_) { /* The animation also works when browser storage is unavailable. */ }
  }

  // ---- Event scripts ----
  const pct = r => Math.round(r * 100) + '%';
  const DAYNAME = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
  const WHY = {
    attack_check: 'Her activity dropped sharply today',
    prodrome: 'The forecast is high for her',
    anomaly: 'One of her signals was off her baseline',
    no_data: 'The watch recorded nothing today',
    checkin: 'Nothing has been asked for a few days',
  };

  async function question(tk, e) {
    const D = P.DAYS[e.day], Q = D.question;
    say(`${WHY[Q.id]}. One question, picked by our policy.`);
    await tk.wait(900);
    dev.buzz();
    dev.setWatch(`<div class="w-app">${dev.ICON}Quick question</div>
      <div class="w-q">${Q.text}</div>
      <div class="w-opts">${Q.options.map((o, i) => `<button data-k="o${i}">${o.label}</button>`).join('')}</div>`);
    dev.showBanner('Quick question', Q.text);
    await tk.wait(2800);
    const i = Math.max(0, Q.options.findIndex(o => o.label === Q.answer));
    const pick = await dev.tap(`#wscreen [data-k="o${i}"]`, tk);
    P.scene.glow = false;
    dev.setWatch(`<div class="w-done">${dev.CHECK}<div class="w-dt">Thanks</div><div class="w-ds">Saved. That was 1 tap.</div></div>`);
    dev.showBanner('Answered on watch', `${pick.textContent}, ${P.fmtClock(e.t)}. Thanks, Anna.`);
    await tk.wait(2400);
    dev.idle();
    const chosen = Q.options.find(o => o.label === pick.textContent) || Q.options[i];
    saveLabel(D, chosen.set, Q.id, chosen.label);
    say('One tap. A structured label for future training.');
  }

  async function warning(tk) {
    const D = P.DAYS[6], B = P.BASE, last = P.DAYS[5], lv = P.level(D.risk), r = pct(D.risk);
    const head = lv === 'high' ? 'High migraine risk today' : 'Elevated migraine risk today';
    const row = (name, v, u, worse) => `<div class="p-row${worse ? ' bad' : ''}"><span>${name}</span><b>${v} <small>usual ${u}</small></b></div>`;
    say(`${r} risk today. The model sent a heads-up.`);
    await tk.wait(900);
    dev.buzz();
    dev.setWatch(`<div class="w-app">${dev.ICON}Heads-up</div>
      <div class="w-big">${r}</div><div class="w-q">${head}</div>
      <div class="w-sub">Keep medication close</div><button class="w-ok" data-k="ok">OK</button>`);
    dev.showBanner(`${head} (${r})`, 'Keep medication close and plan a lighter afternoon.');
    await tk.wait(2800);
    await dev.tap('#wscreen [data-k="ok"]', tk);
    P.scene.glow = false;
    dev.hideBanner();
    dev.setPhone(`<div class="p-h"><div class="p-hi">Heads-up</div><div class="p-sub">${P.fmtDay(S.t)}</div></div>
      <div class="p-risk lv-${lv}"><div class="p-rn">${r}</div><div class="p-rl">${P.LEVEL_TEXT[lv]} risk of migraine today</div><div class="p-bar"><i style="width:${r}"></i></div></div>
      <div class="p-sec">Signals from last night’s forecast</div>
      ${row('Sleep', last.sleep.toFixed(1) + ' h', B.sleep.toFixed(1), last.sleep < B.sleep)}
      ${row('HRV', Math.round(last.hrv) + ' ms', Math.round(B.hrv), last.hrv < B.hrv)}
      ${row('Resting heart rate', Math.round(last.rhr), Math.round(B.rhr), last.rhr > B.rhr)}
      ${row('Stress', last.stress, B.stress, last.stress > B.stress)}
      <div class="p-sec">Suggestions</div>
      <div class="p-tip">Keep medication within reach. Drink water. Plan a lighter afternoon.</div>`);
    dev.setWatch(`<div class="w-done">${dev.CHECK}<div class="w-dt">Got it</div><div class="w-ds">Details on your phone</div></div>`);
    await tk.wait(5200);
    dev.idle();
    say('Time to plan a calmer day.');
  }

  async function attack(tk) {
    say('A migraine starts. Two taps to log it.');
    const sw = document.querySelector('.scene-wrap');
    sw.classList.remove('quake'); void sw.offsetWidth; sw.classList.add('quake');
    await tk.wait(2200);
    dev.idle(); dev.update(S.t);
    await dev.tap('#wscreen [data-k="log"]', tk);
    const sev = await severity(tk, false);
    S.flags.logged = true;
    dev.setWatch(`<div class="w-done">${dev.CHECK}<div class="w-dt">Logged</div><div class="w-ds">${P.fmtClock(S.t)} · ${sev}<br>2 taps</div></div>`);
    saveLabel(P.DAYS[6], { migraine: 1, intensity: { Mild: 2, Moderate: 3, Severe: 4 }[sev] }, 'log_now', '');
    say('Logged on her watch. Ready for the training data.');
    dev.showBanner('Migraine logged on watch', `Started ${P.fmtClock(S.t)} · ${sev}`);
    await tk.wait(2200);
    dev.hideBanner();
    await details(tk, sev);
    dev.idle();
    const r6 = pct(P.DAYS[6].risk);
    say(P.WARN ? `${r6} forecast. A warning before the simulated attack.` : `${r6} forecast. This attack was missed; logging it still matters.`);
  }

  // Shared logging steps: severity on watch or phone, then optional details on the phone.
  async function severity(tk, onPhone) {
    const opts = '<button data-k="mild">Mild</button><button data-k="mod">Moderate</button><button data-k="sev">Severe</button>';
    const sub = `Started now · ${P.fmtClock(S.t)}`;
    if (onPhone) {
      dev.setPhone(`<div class="p-h"><div class="p-hi">How bad is it?</div><div class="p-sub">${sub}</div></div><div class="p-chips">${opts}</div>`);
      return (await dev.tap('#pbody [data-k="mod"]', tk)).textContent;
    }
    dev.setWatch(`<div class="w-q">How bad is it?</div><div class="w-sub">${sub}</div><div class="w-opts">${opts}</div>`);
    await tk.wait(1400);
    return (await dev.tap('#wscreen [data-k="mod"]', tk)).textContent;
  }
  async function details(tk, sev) {
    dev.setPhone(`<div class="p-h"><div class="p-hi">Migraine logged</div><div class="p-sub">Started ${P.fmtClock(S.t)} · ${sev}</div></div>
      <div class="p-sec">Add details (optional)</div>
      <div class="p-chips"><button data-k="med">Took medication</button><button>Dizziness</button><button>Nausea</button><button>Light sensitive</button></div>
      <button class="p-log" data-k="done">Done</button>`);
    if (S.manual) {   // the viewer picks any details, then taps Done
      document.querySelectorAll('#pbody .p-chips button').forEach(b => { b.classList.add('tap-ok'); b.onclick = () => b.classList.toggle('sel'); });
    } else {
      await tk.wait(1200);
      (await dev.tap('#pbody [data-k="med"]', tk)).classList.add('sel');
      await tk.wait(600);
    }
    await dev.tap('#pbody [data-k="done"]', tk);
    dev.setPhone(`<div class="p-saved">${dev.CHECK}<div class="p-hi">Saved</div><div class="p-sub">Rest up, Anna. We will check in when it is over.</div></div>`);
    await tk.wait(2400);
  }

  // Manual mode: Anna logs a migraine herself, at any time, from the watch or the phone.
  async function selfLog(tk, onPhone) {
    say('Anna logs a migraine with two taps.');
    const sev = await severity(tk, onPhone);
    S.userLog = S.t;
    if (!onPhone) dev.setWatch(`<div class="w-done">${dev.CHECK}<div class="w-dt">Logged</div><div class="w-ds">${P.fmtClock(S.t)} · ${sev}</div></div>`);
    await details(tk, sev);
    dev.idle();
    saveLabel(P.DAYS[P.dayOf(S.t)], { migraine: 1, intensity: { Mild: 2, Moderate: 3, Severe: 4 }[sev] }, 'log_now', '');
    say('Saved as a label. The watch-only base model stays unchanged.');
  }

  const SCRIPTS = { question, warning, attack };

  function fire(e) {
    if (e.kind === 'forecast') { P.charts.flash(e.day); return; }
    run(SCRIPTS[e.kind], e);
  }
  function run(script, ...args) {
    const tk = S.tk = token();
    S.busy = true;
    script(tk, ...args).catch(() => {}).finally(() => {
      if (S.tk === tk) { S.busy = false; S.tk = null; }
      dev.hideFinger();
    });
  }

  function seek(t) {
    if (S.tk) S.tk.cancelled = true;
    S.tk = null; S.busy = false; S.ended = false; S.cap = null; S.target = null;
    S.t = t;
    if (S.userLog != null && S.userLog > t) S.userLog = null;
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
    const moving = !S.paused || S.target != null;   // in manual mode time only moves toward a chosen target
    if (moving && !S.busy && !S.ended) {
      let rate = (P.isFast(S.t) ? 10 : P.asleep(S.t) ? 2.4 : 0.7) * S.speed;
      if (S.target != null) rate = Math.max(rate, 6);
      let nt = Math.min(P.T_END - 1 / 60, S.t + dt * rate, S.target ?? Infinity);
      const e = P.EVENTS.find(x => !S.done.has(x.id) && x.t >= S.t && x.t <= nt);
      if (e) { nt = e.t; S.done.add(e.id); }
      S.t = nt;
      if (e) fire(e);
      if (S.target != null && S.t >= Math.min(S.target, P.T_END - 1 / 60)) S.target = null;
      if (S.t >= P.T_END - 1 / 60) {
        S.ended = true; S.target = null; $('summary').classList.add('show');
        dev.showApp();
        say('Watch data. Real forecasts. One-tap labels.');
      }
    }
    if (moving || (S.manual && S.busy)) P.scene.advance(dt, S.t);
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
    document.getElementById('modelMode').textContent = window.MODEL_LIVE ? 'Live model' : 'Model replay';
    P.scene.init(); P.charts.init(); dev.init();
    const nq = P.DAYS.filter(D => D.question).length, r6 = pct(P.DAYS[6].risk);
    $('sumQ').textContent = nq + (nq === 1 ? ' tap' : ' taps');
    $('sumQs').textContent = 'Questions chosen by the policy';
    $('sumW').textContent = r6;
    $('sumWs').textContent = 'Forecast the evening before the attack';
    $('play').onclick = () => setPaused(!S.paused);
    const setManual = m => {
      S.manual = m; S.target = null; setPaused(m);
      $('manual').classList.toggle('on', m); document.body.classList.toggle('manual', m);
    };
    const step = next => {
      if (!S.manual || S.busy || S.ended) return;
      const ev = P.EVENTS.find(e => e.block && !S.done.has(e.id) && e.t >= S.t);
      S.target = next ? (ev ? ev.t : P.T_END) : (S.target ?? S.t) + 1;
    };
    $('manual').onclick = () => setManual(!S.manual);
    $('hour').onclick = () => step(false);
    $('nextEv').onclick = () => step(true);
    // Manual mode: the idle "Log migraine" buttons on watch and phone work at any time.
    document.querySelector('.devices').addEventListener('click', ev => {
      const b = ev.target.closest('[data-k="log"], [data-k="plog"]');
      if (b && S.manual && !S.busy && !S.ended) run(selfLog, b.dataset.k === 'plog');
    });
    $('restart').onclick = () => { seek(5.5); setPaused(false); };
    $('replay').onclick = () => { seek(5.5); setPaused(false); };
    document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => {
      S.speed = +b.dataset.speed;
      document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b));
    });
    $('timeline').onclick = ev => seek(P.charts.timeAt(ev.clientX));
    addEventListener('keydown', ev => { if (ev.code === 'Space') { ev.preventDefault(); setPaused(!S.paused); }
      else if (ev.code === 'KeyM') setManual(!S.manual);
      else if (ev.code === 'ArrowRight') { ev.preventDefault(); step(ev.shiftKey); } });
    const q = new URLSearchParams(location.search);
    if (q.has('t')) seek(+q.get('t'));
    if (q.has('speed')) S.speed = +q.get('speed');
    requestAnimationFrame(frame);
  });
  addEventListener('resize', fit);
})(window.P);
