// Apple Watch and phone mockups: idle faces driven by the sim clock, plus helpers for notifications and taps.
(function (P) {
  let ws, pb, banner, watch, finger, pclock;
  let key = '';
  const mode = { watch: 'idle', phone: 'idle' };

  const ICON = '<span class="app-ic"><svg viewBox="0 0 24 24"><path d="M3 13h4l2-5 3 10 2-6 2 3h5"/></svg></span>';
  const CHECK = '<svg class="check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function init() {
    ws = document.getElementById('wscreen');
    pb = document.getElementById('pbody');
    banner = document.getElementById('banner');
    watch = document.getElementById('watch');
    finger = document.getElementById('finger');
    pclock = document.getElementById('pclock');
    document.querySelector('.phone').addEventListener('click', openApp);
    document.getElementById('openApp').addEventListener('click', openApp);
  }

  function riskRing(r, size) {
    const lv = P.level(r), c = 2 * Math.PI * 15.5;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="15.5" stroke="rgba(255,255,255,.14)"/>
      <circle cx="18" cy="18" r="15.5" stroke="${P.LEVEL_COLOR[lv]}" stroke-dasharray="${Math.max(1.5, r * c)} ${c}" transform="rotate(-90 18 18)"/>
      <text x="18" y="21.5">${Math.round(r * 100)}%</text></svg>`;
  }

  function watchIdle(t) {
    const d = P.dayOf(t), r = P.DAYS[d].risk;
    if (P.asleep(t)) return `<div class="w-idle dim"><div class="w-time">${P.fmtClock(t)}</div><div class="w-date">Sleep tracking</div></div>`;
    const ul = P.S.userLog, own = ul != null && P.dayOf(ul) === d && t >= ul;
    const logged = (P.S.flags.logged && t >= P.ATTACK.start) || own;
    return `<div class="w-idle">
      <div class="w-date">${P.DAYS[d].name} ${P.DAYS[d].date}</div>
      <div class="w-time">${P.fmtClock(t)}</div>
      <div class="w-comp">${riskRing(r, 46)}<span>Migraine<br>risk today</span></div>
      ${logged ? `<div class="w-log on">Migraine logged ${P.fmtClock(own ? ul : P.ATTACK.start)}</div>`
               : '<button class="w-log" data-k="log">Log migraine</button>'}</div>`;
  }

  function phoneIdle(t) {
    const d = P.dayOf(t), D = P.DAYS[d], r = D.risk, lv = P.level(r);
    if (P.asleep(t)) return `<div class="p-lock"><div class="p-lt">${P.fmtClock(t)}</div><div class="p-ld">${P.fmtDay(t)}</div></div>`;
    const st = P.at(P.ST, t);
    const week = P.DAYS.map((x, i) => {
      const known = t >= P.pubTime(i);
      return `<div class="p-wb${i === d ? ' cur' : ''}${known ? '' : ' unk'}"><i style="height:${known ? Math.max(6, x.risk * 100) : 6}%;background:${known ? P.LEVEL_COLOR[P.level(x.risk)] : 'transparent'}"></i><span>${x.name[0]}</span></div>`;
    }).join('');
    return `<div class="p-app">
      <div class="p-h"><div class="p-hi">Today</div><div class="p-sub">${P.fmtDay(t)}</div></div>
      <div class="p-risk lv-${lv}"><div class="p-rn">${Math.round(r * 100)}%</div>
        <div class="p-rl">${P.LEVEL_TEXT[lv]} risk of migraine today</div><div class="p-bar"><i style="width:${Math.max(2, r * 100)}%"></i></div></div>
      <div class="p-sec">Your signals</div>
      <div class="p-row"><span>Sleep last night</span><b>${D.sleep.toFixed(1)} h</b></div>
      <div class="p-row"><span>Heart rate now</span><b>${Math.round(P.at(P.HR, t))} bpm</b></div>
      <div class="p-row"><span>Stress now</span><b>${st == null ? '--' : Math.round(st)}</b></div>
      <div class="p-sec">This week</div><div class="p-week">${week}</div>
      <button class="p-log" data-k="plog">Log migraine</button></div>`;
  }

  function update(t) {
    pclock.textContent = P.fmtClock(t);
    const k = Math.round(t * 60) + '|' + P.S.flags.logged + '|' + P.S.userLog + '|' + mode.watch + mode.phone;
    if (k === key) return;
    key = k;
    if (mode.watch === 'idle') ws.innerHTML = watchIdle(t);
    if (mode.phone === 'idle') pb.innerHTML = phoneIdle(t);
  }

  function setWatch(html) { mode.watch = 'custom'; ws.innerHTML = `<div class="w-pane">${html}</div>`; }
  function setPhone(html) { mode.phone = 'custom'; pb.innerHTML = `<div class="p-app p-pane">${html}</div>`; }
  // After the week: the phone hands over to the real Migrai app (its mobile layout, scaled into this screen).
  // In the repo prototype/migrai is a symlink to ../app (works however the folder is served); on GitHub Pages the app is at ../migrai/.
  const appUrl = fetch('migrai/', { method: 'HEAD' }).then(r => r.ok ? 'migrai/' : '../migrai/').catch(() => '../migrai/');
  async function showApp() {
    mode.phone = 'app';
    const url = await appUrl;
    if (mode.phone !== 'app') return;
    const k = pb.clientWidth / 390;   // 390 px: the app's own phone width
    document.body.classList.add('app-on');
    pb.innerHTML = `<div class="p-migrai"><iframe src="${url}" title="Migrai app" style="transform:scale(${k});height:${pb.clientHeight / k}px"></iframe></div>`;
  }
  // Tapping the phone frame or the button opens the same app full screen, in live mode and phone only (clicks inside the screen stay in the app).
  async function openApp() { if (mode.phone === 'app') location.href = (await appUrl) + '?live&phone'; }
  function idle() { document.body.classList.remove('app-on'); mode.watch = 'idle'; mode.phone = 'idle'; key = ''; hideBanner(); P.scene.glow = false; }

  function showBanner(title, body) {
    banner.innerHTML = `${ICON}<div><div class="b-t">Migraine Forecast · now</div><div class="b-h">${title}</div><div class="b-b">${body}</div></div>`;
    banner.classList.add('show');
  }
  function hideBanner() { banner.classList.remove('show'); }

  function buzz() {
    P.scene.glow = true;
    watch.classList.remove('buzz'); void watch.offsetWidth; watch.classList.add('buzz');
  }

  // Simulated finger tap on an element inside the watch or phone.
  // Returns the tapped element. In manual mode it waits for the viewer's click instead.
  async function tap(sel, tk) {
    const el = document.querySelector(sel);
    if (!el) return el;
    if (P.S.manual) return clickOn(el, tk);
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    finger.style.transition = 'none';
    finger.style.left = cx + 70 + 'px'; finger.style.top = cy + 90 + 'px'; finger.style.opacity = 0;
    void finger.offsetWidth;
    finger.style.transition = '';
    finger.style.left = cx + 'px'; finger.style.top = cy + 'px'; finger.style.opacity = 1;
    await tk.wait(700);
    finger.classList.add('press'); el.classList.add('pressed');
    await tk.wait(240);
    finger.classList.remove('press'); el.classList.remove('pressed');
    await tk.wait(160);
    finger.style.opacity = 0;
    return el;
  }
  // Answer options can be picked freely; any other button only by itself.
  function clickOn(goal, tk) {
    const group = goal.parentElement.matches('.w-opts, .p-chips') ? [...goal.parentElement.children] : [goal];
    goal.classList.add('tap-goal');
    return new Promise((res, rej) => {
      let open = true;
      const close = () => { open = false; group.forEach(b => { b.onclick = null; b.classList.remove('tap-goal', 'tap-ok'); }); };
      group.forEach(b => { b.classList.add('tap-ok'); b.onclick = () => {
        close(); b.classList.add('pressed');
        setTimeout(() => { b.classList.remove('pressed'); res(b); }, 220);
      }; });
      const check = () => { if (!open) return; if (tk.cancelled) { close(); rej(new Error('cancelled')); } else requestAnimationFrame(check); };
      requestAnimationFrame(check);
    });
  }
  function hideFinger() { finger.style.opacity = 0; finger.classList.remove('press'); }

  P.dev = { init, update, setWatch, setPhone, idle, showApp, showBanner, hideBanner, buzz, tap, hideFinger, ICON, CHECK, riskRing };
})(window.P);
