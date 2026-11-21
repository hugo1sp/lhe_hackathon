"use strict";
/* Migrai - interactive app UI preloaded with simulated person P0187 ("Anna").
   All physiology, logged attacks and forecasts come from anna_data.js. Everything Anna does in the
   app (logs, answers, checklists) is kept in session state, saved to localStorage when available. */

/* ================= Data & helpers ================= */
const P = ANNA.person, DAYS = ANNA.days, OUT = ANNA.outlook;
const IDX = Object.fromEntries(DAYS.map((d, i) => [d.date, i]));
const MONTHS = [...new Set(DAYS.map(d => d.date.slice(0, 7)))];
const FIRST_FC = DAYS.find(d => d.risk != null).date;
const SLOTS = DAYS.slice(-4).map(d => d.date).flatMap(date => [{ date, slot: "morning" }, { date, slot: "evening" }]);
const EVENING = "20:30";

const $ = id => document.getElementById(id);
const day = s => DAYS[IDX[s]];
const toD = s => new Date(s + "T12:00:00Z");
const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (s, o) => toD(s).toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
const wd = s => fmt(s, { weekday: "short" });
const longDate = s => fmt(s, { weekday: "long", day: "numeric", month: "long" });
const shortDate = s => fmt(s, { weekday: "short", day: "numeric", month: "short" });
const pad = n => String(n).padStart(2, "0");
const pct = v => Math.round(v * 100) + "%";
const hm = h => { const m = Math.round(Math.abs(h) * 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`; };
const clock = h => { const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const level = p => p == null ? { k: "none", txt: "No forecast" } : p >= 0.4 ? { k: "high", txt: "High" } : p >= 0.15 ? { k: "mod", txt: "Moderate" } : { k: "low", txt: "Low" };
const pill = p => `<span class="pill lvl-${level(p).k}"><i></i>${level(p).txt} risk</span>`;
const sign = (v, d = 1) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const ICONS = {
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  wave: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  cycle: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 8 8h-8z" fill="currentColor"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  pill: '<path d="M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
  bed: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.5"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/>',
  watch: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>',
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3"/>',
  steps: '<path d="M7 3c2 0 2.5 3 2 6s-3 3-3.5 0S5 3 7 3zM15 8c2 0 2.5 3 2 6s-3 3-3.5 0S13 8 15 8zM5.5 13h3M13.5 18h3"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>', chart: '<path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  right: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  hand: '<path d="M9 11V5a1.5 1.5 0 0 1 3 0v5M12 10V4a1.5 1.5 0 0 1 3 0v6M15 10V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.6L9 13"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

/* ================= Session state ================= */
const KEY = "migrai-product-demo-v1";
const fresh = () => ({ now: { date: OUT.made, slot: "evening" }, tab: "today", logs: {}, answers: {}, auto: {}, autoLast: null,
  plan: {}, remind: true, hist: "6w", month: OUT.made.slice(0, 7), sel: null, sent: false });
let S = (() => { try { const state = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); return IDX[state.now?.date] == null ? fresh() : state; } catch (e) { return fresh(); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: session only */ } };

const T = () => S.now.date, isEve = (now = S.now) => now.slot === "evening";
function timeAt(now = S.now) {
  if (isEve(now)) return EVENING;
  const d = day(now.date), m = Math.round(((d.mid + d.sleep / 2) * 60 + 15) / 5) * 5;  // a quarter after waking up
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
const known = (madeOn, now) => madeOn < now.date || (madeOn === now.date && isEve(now));
/* Forecast for `date`, as available at `now` (forecasts are made in the evening). */
function fc(date, now = S.now) {
  const d = day(date);
  if (date <= now.date && d && d.risk != null && known(addDays(date, -1), now)) return { p: d.risk, made: addDays(date, -1) };
  const made = isEve(now) ? now.date : addDays(now.date, -1);
  const forecast = day(made)?.forecast.find(f => f.date === date);
  return forecast ? { p: forecast.p, made } : null;
}

const heroDate = (now = S.now) => isEve(now) ? addDays(now.date, 1) : now.date;
/* The migraine logged for a date: Anna's own edits first, then the record from the data. */
function logOf(date) {
  if (date > T()) return null;
  const u = S.logs[date];
  if (u) return u.deleted ? null : u;
  const d = day(date);
  if (!d || !d.log || (date === T() && d.log.t > timeAt())) return null;
  return d.log;
}
const past = (incl = true) => DAYS.filter(d => incl ? d.date <= T() : d.date < T());
const baseRate = () => { const ds = past(); return ds.filter(d => logOf(d.date)).length / ds.length; };

/* ================= Signals vs. Anna's own 28-day normal ================= */
const W = P.triggers;
function signals(date = T(), eve = isEve()) {
  const t = day(date), y = day(addDays(date, -1)) || t, a = eve ? t : y, aw = date !== T() ? "" : eve ? "today" : "yesterday";
  const out = [];
  if (t.sleep != null && t.b_sleep != null) {
    const dl = t.sleep - t.b_sleep, dm = t.mid - t.b_mid;
    out.push({ k: "sleep", icon: "moon", name: "Sleep", key: "sleep", day: date, w: W.sleep_debt, sev: dl <= -1 ? 2 : dl <= -0.5 ? 1 : 0,
      val: hm(t.sleep).replace(" min", "m").replace(" h", "h"), delta: `${dl < 0 ? "−" : "+"}${hm(dl)} vs normal`,
      title: dl <= -0.5 ? `Short night: ${hm(t.sleep)}` : `Slept ${hm(t.sleep)}`, sub: `${hm(dl)} ${dl < 0 ? "below" : "above"} your normal of ${hm(t.b_sleep)}` });
    out.push({ k: "mid", icon: "clock", name: "Sleep timing", key: "mid", day: date, w: W.sleep_irregularity, sev: Math.abs(dm) >= 1 ? 1 : 0,
      val: clock(t.mid), delta: `midpoint ${dm < 0 ? "−" : "+"}${hm(dm)}`,
      title: `Sleep timing shifted ${hm(dm)}`, sub: `Asleep ${clock(t.mid - t.sleep / 2)}, up ${clock(t.mid + t.sleep / 2)}` });
    const h = Math.round((t.hrv / t.b_hrv - 1) * 100);
    out.push({ k: "hrv", icon: "wave", name: "HRV", key: "hrv", day: date, w: 1, sev: h <= -10 ? 2 : h <= -5 ? 1 : 0,
      val: `${t.hrv} ms`, delta: `${h >= 0 ? "+" : "−"}${Math.abs(h)}% vs normal`,
      title: h < 0 ? `HRV ${-h}% below your normal` : `HRV ${h}% above your normal`, sub: `${t.hrv} ms overnight vs ${t.b_hrv.toFixed(1)} ms normally` });
    const r = t.rhr - t.b_rhr;
    out.push({ k: "rhr", icon: "heart", name: "Resting HR", key: "rhr", day: date, w: 1, sev: r >= 5 ? 2 : r >= 2 ? 1 : 0,
      val: `${t.rhr} bpm`, delta: `${sign(r)} vs normal`,
      title: `Resting heart rate ${sign(r)} bpm`, sub: `${t.rhr} bpm vs ${t.b_rhr.toFixed(1)} bpm normally` });
  }
  if (a.stress != null && a.b_stress != null) {
    const s = a.stress - a.b_stress, st = Math.round(a.steps / a.b_steps * 100) - 100;
    out.push({ k: "stress", icon: "bolt", name: `Stress ${aw}`.trim(), key: "stress", day: a.date, w: W.stress, sev: s >= 20 ? 2 : s >= 10 ? 1 : 0,
      val: `${a.stress}`, delta: `normal ${Math.round(a.b_stress)}`,
      title: `High stress${aw ? " " + aw : ""}: ${a.stress}/100`, sub: `Your normal is ${Math.round(a.b_stress)}` });
    out.push({ k: "steps", icon: "steps", name: `Steps ${aw}`.trim(), key: "steps", day: a.date, w: 0.3, sev: st <= -40 ? 1 : 0,
      val: Math.round(a.steps).toLocaleString("en-GB"), delta: `${st >= 0 ? "+" : "−"}${Math.abs(st)}% vs normal`,
      title: `Activity ${-st}% below normal`, sub: `${Math.round(a.steps).toLocaleString("en-GB")} steps ${aw}`.trim() });
  }
  if (t.cd) {
    const tp = P.cycle_length - t.cd + 1, near = t.cd <= 3 || tp <= 4;
    out.push({ k: "cycle", icon: "cycle", name: "Cycle", key: "cd", day: date, w: W.menstrual, sev: near ? 2 : tp <= 6 ? 1 : 0,
      val: `day ${t.cd}`, delta: t.cd <= 3 ? "period" : `period in ~${tp} d`,
      title: t.cd <= 3 ? `Period day ${t.cd}` : `Period expected in ~${tp} days`, sub: `Day ${t.cd} of your ${P.cycle_length}-day cycle` });
  }
  return out;
}
const drivers = (date = T(), eve = isEve()) => {
  const made = eve ? date : addDays(date, -1), effects = day(made)?.effects || {};
  return signals(made, true).filter(s => effects[s.k] != null).map(s => ({ ...s,
    title: s.name + ': ' + s.val, sub: (effects[s.k] > 0 ? 'Raises' : 'Lowers') + ' this forecast · ' + s.delta,
    sev: effects[s.k] > 0 ? 1 : 0, effect: effects[s.k]
  })).sort((a,b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0,3);
};
const sevCls = s => ["", "warn", "bad"][s.sev];

/* ================= What the data says about Anna (recomputed from logs, so Anna's edits count) ================= */
const inPeriodWindow = d => d.cd && (d.cd >= P.cycle_length - 1 || d.cd <= 3);
const TRIG = {
  sleep_debt: { name: "Too little sleep", icon: "moon", when: "within two days of a night with at least 1 h less sleep than your normal",
    cond: (d, y) => d.sleep == null ? null : d.sleep - d.b_sleep <= -1 || (!!y && y.sleep != null && y.sleep - y.b_sleep <= -1) },
  menstrual: { name: "Around your period", icon: "cycle", when: "from 2 days before to 3 days into your period", cond: (d) => d.cd ? !!inPeriodWindow(d) : null },
  sleep_irregularity: { name: "Irregular sleep times", icon: "clock", when: "after nights when your sleep timing shifted by 1 h or more",
    cond: (d) => d.mid == null ? null : Math.abs(d.mid - d.b_mid) >= 1 },
  stress: { name: "Stress", icon: "bolt", when: "on the day after a high-stress day (15+ above your normal)",
    cond: (d, y) => !y || y.stress == null ? null : y.stress - y.b_stress >= 15 },
};
function relRisk(cond) {
  let a = 0, an = 0, b = 0, bn = 0;
  past(!isEve()).forEach(d => { const c = cond(d, day(addDays(d.date, -1))); if (c == null || d.b_sleep == null) return; const m = logOf(d.date) ? 1 : 0; if (c) { an++; a += m; } else { bn++; b += m; } });
  return { pa: an ? a / an : 0, pb: bn ? b / bn : 0, n: an, x: a, ratio: an && b ? (a / an) / (b / bn) : null };
}
function warningSigns() {
  const att = past().filter(d => logOf(d.date)), hrv = [], rhr = [], steps = [];
  att.forEach(d => { const p = day(addDays(d.date, -1)); if (p && p.hrv != null && p.b_hrv) { hrv.push((p.hrv / p.b_hrv - 1) * 100); rhr.push(p.rhr - p.b_rhr); }
    if (d.steps != null && d.b_steps) steps.push(d.steps / d.b_steps); });
  const all = past().filter(d => d.hrv != null && d.b_hrv).map(d => (d.hrv / d.b_hrv - 1) * 100);
  const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  return { n: hrv.length, hrv: mean(hrv), hrvAll: mean(all), hrvDrop: hrv.filter(v => v <= -10).length, rhr: mean(rhr), steps: mean(steps), nAtt: att.length };
}
function forecastScore(upTo = T()) {
  const win = DAYS.filter(d => d.risk != null && d.date >= addDays(upTo,-41) && d.date <= upTo && fc(d.date));
  const att = win.filter(d => logOf(d.date)), flagged = att.filter(d => d.risk >= 0.4);
  const fa = win.filter(d => !logOf(d.date) && d.risk >= 0.4 && d.date < upTo);
  return { att, flagged, fa, missed: att.length - flagged.length };
}

/* ================= Data collection ================= */
const QDEF = {
  attack_check: { why: "Asked because your activity dropped", text: "Your activity dropped sharply today. Did you have a migraine?", opts: ["No", "Mild", "Moderate", "Severe"] },
  prodrome: { why: "Asked because your risk is high", text: "Your migraine risk is high. Any early warning signs (stiff neck, yawning, light sensitivity)?", opts: ["No", "A little", "Clearly"] },
  anomaly: { why: "Asked because a signal looked unusual", text: "Your {signal} was unusual last night. Anything going on?", opts: ["Nothing", "Stress", "Sick", "Alcohol", "Headache"] },
  no_data: { why: "No watch data today", text: "Your watch has no data today. Did you have a migraine?", opts: ["No", "Yes"] },
  checkin: { why: "Quick check, nothing asked for a few days", text: "Any migraine today?", opts: ["No", "Yes"] },
  feel: { why: "Daily check-in · optional", text: "How are you feeling today?", opts: ["Great", "Fine", "A bit off", "Bad", "Migraine"] },
};
const FACES = { Great: "#4fa38a", Fine: "#a9d3c6", "A bit off": "#e0a245", Bad: "#e5876f", Migraine: "#d9645a" };
const SIGNAL_NAMES = { hrv_rmssd: "HRV", resting_hr: "resting heart rate", sleep_hours: "sleep" };
const MIG_ANSWER = { Mild: "Mild", Moderate: "Moderate", Severe: "Severe", Yes: null, Headache: null, Migraine: null };
function questionOf(date) {
  if (date === T() && logOf(date) && !S.answers[date]) return null;
  const policy = day(date)?.policy;
  return policy ? { ...policy, opts: policy.options.map(o => o.label), why: QDEF[policy.id]?.why || "One quick question" } : null;
}

let answerOf = date => S.answers[date] ?? (date < T() ? day(date).a ?? null : null);
function autoCandidate() {
  let best = null;
  for (let k = 1; k <= 14; k++) {
    const d = day(addDays(T(), -k));
    if (!d || d.steps == null || !d.b_steps || logOf(d.date) || S.auto[d.date]) continue;
    const r = d.steps / d.b_steps;
    if (r < 0.7 && (!best || r < best.r)) best = { d, r };
  }
  return best;
}
function quality() {
  const last = past().slice(-30), worn = last.filter(d => d.sleep != null).length;
  const asked = last.filter(d => questionOf(d.date) && questionOf(d.date).id !== "feel"), answered = asked.filter(d => answerOf(d.date));
  const logs = past().map(d => logOf(d.date)).filter(Boolean), detailed = logs.filter(l => l.int).length;
  const parts = [worn / last.length, asked.length ? answered.length / asked.length : 1, logs.length ? detailed / logs.length : 1];
  return { worn, days: last.length, asked: asked.length, answered: answered.length, logs: logs.length, detailed,
    score: Math.round(100 * (0.5 * parts[0] + 0.3 * parts[1] + 0.2 * parts[2])) };
}
function openItems() {
  const q = questionOf(T());
  return (q && !answerOf(T()) ? 1 : 0) + (logOf(T()) && !logOf(T()).int ? 1 : 0);
}

/* ================= Small view parts ================= */
const card = (body, cls = "", attrs = "") => `<div class="card ${cls}" ${attrs}>${body}</div>`;
const h4 = (t, s = "") => `<h4>${t}<span>${s}</span></h4>`;
const row = (icon, cls, t, s, right = "", attrs = "") =>
  `<${attrs ? "button" : "div"} class="row ${attrs ? "tap" : ""}" ${attrs}><div class="ri ${cls}">${ic(icon)}</div><div><b>${t}</b>${s ? `<span class="s">${s}</span>` : ""}</div>${right}</${attrs ? "button" : "div"}>`;
const head = (title, sub) => `<header class="head"><div><h1>${title}</h1><p>${sub}</p></div><button class="avatar" data-act="profile" aria-label="Profile and settings">A</button></header>`;
const footNote = () => `<p class="foot-note">Simulated data (person P0187) · not medical advice</p>`;
const logText = l => [l.int, (l.meds || []).join(" + "), { watch: "confirmed on watch", tap: "one-tap log", "check-in": "from check-in", detected: "auto-detected" }[l.src]].filter(Boolean).join(" · ");

const ARC = 2 * Math.PI * 82 * 0.75, CIRC = 2 * Math.PI * 82;
let shownRisk = 0;
function gauge(p) {
  const tick = v => { const a = (135 + 270 * v) * Math.PI / 180; return `<line class="g-tick" x1="${105 + 72 * Math.cos(a)}" y1="${105 + 72 * Math.sin(a)}" x2="${105 + 93 * Math.cos(a)}" y2="${105 + 93 * Math.sin(a)}"/>`; };
  return `<div class="gauge"><svg viewBox="0 0 210 210" aria-hidden="true">
    <circle class="g-track" cx="105" cy="105" r="82" fill="none" stroke-width="17" stroke-linecap="round" stroke-dasharray="${ARC} ${CIRC}" transform="rotate(135 105 105)"/>
    <circle class="g-val" id="gval" cx="105" cy="105" r="82" fill="none" stroke-width="17" stroke-linecap="round" data-to="${p}" style="stroke-dasharray:${Math.max(shownRisk * ARC, .1)} ${CIRC}" transform="rotate(135 105 105)"/>
    ${tick(0.15)}${tick(0.4)}</svg>
    <div class="gnum"><span id="gnum" data-to="${p}">${Math.round(shownRisk * 100)}</span><small>%</small></div>
    <div class="gsub">${pill(p)}</div></div>`;
}
function animateGauge() {
  const gauge = $("gval"), number = $("gnum");
  if (!gauge || !number) return;
  shownRisk = Number(gauge.dataset.to);
  gauge.style.strokeDasharray = `${Math.max(shownRisk * ARC, .1)} ${CIRC}`;
  number.textContent = Math.round(shownRisk * 100);
}

/* ================= Screens ================= */
const VIEWS = {};

VIEWS.today = () => {
  const hd = heroDate(), f = fc(hd), p = f?.p, log = logOf(T()), q = questionOf(T());
  const out = [head('Hi, Anna', longDate(T()))];
  out.push(log
    ? card(`<div class="ri">${ic('check')}</div><div><b>Migraine logged</b><span class="muted">${log.int || 'Details optional'}</span></div><button class="btn small soft" data-act="details" data-date="${T()}">Edit</button>`, 'attack-card')
    : `<button class="logcta" data-act="logNow"><span class="lc-ic">${ic('bolt')}</span><span><b>Log migraine</b><small>One tap · details later</small></span></button>`);
  out.push(card(`<div class="hero-top"><div class="hero-lab">Migraine risk ${isEve() ? 'tomorrow' : 'today'}<small>${longDate(hd)}</small></div><button class="info" data-act="explain" aria-label="About this forecast">${ic('info')}</button></div>${p != null ? gauge(p) : '<p>No forecast yet.</p>'}`, `hero lvl-${level(p).k}`));
  const tiles = [0,1,2].map(k => {
    const date = addDays(hd,k), f = fc(date), label = k === 0 ? (isEve() ? 'Tomorrow' : 'Today') : wd(date);
    return `<button class="tile lvl-${level(f?.p).k}" data-act="tile" data-date="${date}"><div class="d">${label}</div><div class="v">${f ? pct(f.p) : '–'}</div><div class="l">${f ? level(f.p).txt : 'Not yet'}</div></button>`;
  }).join('');
  out.push(card(h4('Next 3 days') + `<div class="strip">${tiles}</div>`));
  if (q && !answerOf(T())) out.push(`<button class="note tap" data-act="goto" data-tab="checkin" style="text-align:left">${ic('pen')}<span><b>One quick question</b><br>${q.text}</span>${ic('right')}</button>`);
  const relevant = drivers(T(),isEve());
  out.push(card(h4('Model signals', 'vs. your normal') + `<div class="rows">${relevant.map(signal => row(signal.icon,sevCls(signal),signal.title,signal.sub,ic('right'),`data-act="signal" data-k="${signal.k}"`)).join('')}<button class="row tap" data-act="allSignals"><div class="ri">${ic('watch')}</div><div><b>All watch data</b><span class="s">Sleep, HRV, heart rate, stress and activity</span></div>${ic('right')}</button></div>`));
  return out.join('') + footNote();
};

function planItems(p) {
  const lv = level(p).k;
  if (lv === "high") return isEve()
    ? [["bed", "Bed by 22:30 tonight", "Sleep loss is one of your strongest triggers"], ["pill", "Pack your medication", "Treat early if it starts"],
       ["drop", "Water and regular meals tomorrow", "Easy wins on a high-risk day"], ["cal", "Lighten tomorrow morning", "Move what can wait"]]
    : [["pill", "Keep medication with you", "Treatment works best taken early"], ["drop", "Drink water, don't skip lunch", "Easy wins on a high-risk day"],
       ["cal", "Plan breaks between tasks", "Dim screens, step outside"], ["moon", "Wind down early tonight", "Protect tonight's sleep"]];
  if (lv === "mod") return [["bed", "Keep your usual bedtime", "Regular sleep protects you"], ["wind", "Take a short break", "Two minutes of slow breathing"], ["pill", "Medication in your bag", "Just in case"]];
  return [["bed", "Keep your usual bedtime", "Regular sleep is your best protection"], ["watch", "Wear your watch tonight", "Better data, better forecasts"]];
}

VIEWS.history = () => {
  const out = [head("History", S.hist === "6w" ? "Forecast vs. the migraines you logged" : "Six months of your data"),
    `<div class="seg" role="tablist"><button class="${S.hist === "6w" ? "on" : ""}" data-act="hist" data-v="6w">6 weeks</button><button class="${S.hist === "6m" ? "on" : ""}" data-act="hist" data-v="6m">6 months</button></div>`];
  return out.join("") + (S.hist === "6w" ? history6w() : history6m()) + footNote();
};

function history6w() {
  const sc = forecastScore();
  const out = [card(h4("Did we see it coming?", "6 weeks") + `<div class="score">
      <div><b>${sc.flagged.length} of ${sc.att.length}</b><span>attacks flagged high (40%+) the evening before</span></div>
      <div><b>${sc.fa.length}</b><span>false ${sc.fa.length === 1 ? "alarm" : "alarms"}</span></div>
      <div><b>${sc.missed}</b><span>${sc.missed === 1 ? "attack" : "attacks"} missed</span></div></div>`)];
  out.push(card(h4("Forecast risk", "tap a day") + riskChart() + `<div class="legend">
      <span class="lvl-low"><i></i>Low</span><span class="lvl-mod"><i></i>Moderate</span><span class="lvl-high"><i></i>High</span><span><i class="dotm"></i>Migraine logged</span><span><i class="dash"></i>Upcoming</span></div>`, "", `style="padding:16px 12px 14px"`));
  const att = DAYS.filter(d => d.date >= addDays(T(), -41) && d.date <= T() && logOf(d.date)).reverse();
  out.push(card(h4("Logged attacks", plural(att.length, "attack")) + `<div class="rows">${att.map(d => {
    const l = logOf(d.date), f = fc(d.date);
    const chip = !f ? `<span class="chip">no forecast</span>` : f.p >= 0.4 ? `<span class="chip good">${ic("check")} warned ${pct(f.p)}</span>` : `<span class="chip warn">missed · ${pct(f.p)}</span>`;
    return row("bolt", "bad", shortDate(d.date), `${l.t}${l.int ? " · " + l.int : ""}${S.logs[d.date] && !day(d.date).log ? " · added by you" : ""}`, chip, `data-act="day" data-date="${d.date}"`);
  }).join("") || `<p class="muted">No attacks logged in this period.</p>`}</div>`));
  return out.join("");
}

function riskChart() {
  const end = fc(addDays(T(), 1)) ? addDays(T(), 1) : T(), dates = [];
  for (let s = addDays(T(), -41); s <= end; s = addDays(s, 1)) dates.push(s);
  const Wd = 334, H = 200, l = 30, r = 4, t = 20, b = 22, iw = Wd - l - r, ih = H - t - b, bw = iw / dates.length, y = v => t + ih - v / 0.8 * ih;
  let g = [0, 0.15, 0.4, 0.8].map(v => `<line x1="${l}" x2="${Wd - r}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? "#ece8e2" : "#d8d3cb"}" ${v && v < 0.8 ? 'stroke-dasharray="3 3"' : ""}/>
    <text x="${l - 6}" y="${y(v) + 3.5}" font-size="10" text-anchor="end" fill="#6e6980">${pct(v)}</text>`).join("");
  dates.forEach((ds, i) => {
    const d = day(ds), f = fc(ds), x = l + i * bw, lg = logOf(ds), fut = ds > T(), sel = S.sel === ds;
    let col = `<rect class="hit" x="${x}" y="${t - 14}" width="${bw}" height="${ih + 14}" fill="${sel ? "rgba(107,92,165,.10)" : "transparent"}" rx="3"/>`;
    if (d && d.sleep == null && !fut) col += `<rect x="${x + 1}" y="${y(0) - 6}" width="${bw - 2}" height="6" rx="1.5" fill="#d8d3cb"/>`;
    if (f) {
      const hh = Math.max(y(0) - y(f.p), 2), c = `var(--${level(f.p).k})`;
      col += fut ? `<rect x="${x + 1.5}" y="${y(f.p)}" width="${bw - 3}" height="${hh}" rx="2.5" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 2"/>`
        : `<rect x="${x + 1}" y="${y(f.p)}" width="${bw - 2}" height="${hh}" rx="2.5" fill="${c}" opacity="${lg || sel ? 1 : .55}"/>`;
    }
    if (lg) col += `<circle cx="${x + bw / 2}" cy="${y(f ? f.p : 0) - 8}" r="4" fill="#1f1d2b" stroke="#fff" stroke-width="1.5"/>`;
    if (ds === T()) col += `<text x="${Math.min(x + bw / 2, Wd - 16)}" y="${H - 6}" font-size="10" font-weight="700" text-anchor="middle" fill="#1f1d2b">Today</text>`;
    else if (i % 14 === 6 && i < dates.length - 8) col += `<text x="${x + bw / 2}" y="${H - 6}" font-size="10" text-anchor="middle" fill="#6e6980">${fmt(ds, { day: "numeric", month: "short" })}</text>`;
    g += `<g class="col" data-act="day" data-date="${ds}" role="button" aria-label="${shortDate(ds)}${f ? ", forecast " + pct(f.p) : ""}${lg ? ", migraine" : ""}">${col}</g>`;
  });
  const first = dates.findIndex(ds => fc(ds));
  if (first > 0) g += `<text x="${l + 4}" y="${y(0.5)}" font-size="10.5" fill="#6e6980">no forecasts before ${fmt(FIRST_FC, { day: "numeric", month: "short" })}</text>`;
  return `<svg class="chart" viewBox="0 0 ${Wd} ${H}" width="100%" role="img" aria-label="Daily forecast risk for the last six weeks">${g}</svg>`;
}

function history6m() {
  const months = MONTHS.filter(m => m <= T().slice(0, 7));
  const counts = months.map(m => past().filter(d => d.date.startsWith(m) && logOf(d.date)).length), max = Math.max(...counts, 1);
  const all = past(), worn = all.filter(d => d.sleep != null).length, total = counts.reduce((a, b) => a + b, 0);
  const out = [card(`<div class="score"><div><b>${total}</b><span>attacks logged since 1 Jan</span></div>
      <div><b>${(total / all.length * 30.4).toFixed(1)}</b><span>per month on average</span></div>
      <div><b>${Math.round(worn / all.length * 100)}%</b><span>nights tracked by the watch</span></div></div>`)];
  out.push(card(h4("Attacks per month", "tap a month") + `<div class="mbars">${months.map((m, i) =>
    `<div class="${m === S.month ? "on" : ""}" data-act="month" data-m="${m}" role="button"><span class="v">${counts[i]}</span><div class="b" style="height:${counts[i] / max * 80 + 3}px"></div><span class="l">${fmt(m + "-15", { month: "short" })}</span></div>`).join("")}</div>`));
  // Month calendar
  const m = S.month, first = m + "-01", lead = (toD(first).getUTCDay() + 6) % 7, mi = months.indexOf(m);
  let cells = ["M", "T", "W", "T", "F", "S", "S"].map(x => `<div class="dh">${x}</div>`).join("") + "<div></div>".repeat(lead);
  for (let s = first; s.startsWith(m); s = addDays(s, 1)) {
    const d = day(s), fut = !d || s > T(), cls = fut ? "fut" : [logOf(s) ? "mig" : "", d.sleep == null ? "nodata" : "", s === T() ? "today" : "", d.cd === 1 ? "period" : ""].join(" ");
    cells += `<div class="c ${cls}" ${fut ? "" : `data-act="day" data-date="${s}" role="button"`} aria-label="${shortDate(s)}">${+s.slice(8)}</div>`;
  }
  out.push(card(`<div class="mhead"><button class="iconbtn" data-act="month" data-m="${months[mi - 1] || ""}" ${mi > 0 ? "" : "disabled"} aria-label="Previous month">${ic("left")}</button>
    <b>${fmt(first, { month: "long", year: "numeric" })}</b><button class="iconbtn" data-act="month" data-m="${months[mi + 1] || ""}" ${mi < months.length - 1 ? "" : "disabled"} aria-label="Next month">${ic("right")}</button></div>
    <div class="cal">${cells}</div><div class="legend"><span><i style="background:var(--high)"></i>Migraine</span><span><i style="background:repeating-linear-gradient(45deg,#e4e0d9 0 2px,#fff 2px 4px)"></i>No watch data</span><span><i class="dotm" style="background:#e46aa0;width:6px;height:6px"></i>Period starts</span></div>`));
  return out.join("");
}

VIEWS.checkin = () => {
  const q = questionOf(T()), answer = answerOf(T()), log = logOf(T());
  const out = [head('Check-in', shortDate(T()))];
  if (q) out.push(card(`<p class="muted">${q.why}</p><h3 style="font-size:18px;margin:12px 0">${q.text}</h3><div class="chips">${q.opts.map(option => `<button class="chip ${answer === option ? 'sel' : ''}" data-act="answer" data-v="${esc(option)}">${esc(option)}</button>`).join('')}</div>${answer ? '<p class="muted" style="margin-top:12px">Saved to your labels.</p>' : ''}`));
  else out.push(card(`<div class="ri">${ic('check')}</div><h3>${log ? 'Already logged today' : 'Nothing to answer today'}</h3><p class="muted">${log ? 'Your migraine is in your history.' : 'We only ask when a question is useful.'}</p>`));
  out.push(card(`<div class="rows"><button class="row tap" data-act="${log ? 'details' : 'logNow'}" data-date="${T()}"><div class="ri">${ic('bolt')}</div><div><b>${log ? 'Edit migraine details' : 'Log a migraine'}</b><span class="s">Intensity and medication are optional</span></div>${ic('right')}</button></div>`));
  out.push(`<button class="btn soft" data-act="downloadLabels">Download my labels</button>`);
  return out.join('') + footNote();
};

VIEWS.insights = () => {
  const all = past(), att = all.filter(d => logOf(d.date)), worn = all.filter(d => d.sleep != null).length;
  const out = [head("Insights", "Learned from 6 months of your data")];
  out.push(card(`<div class="score"><div><b>${all.length}</b><span>days with the app</span></div><div><b>${worn}</b><span>nights tracked</span></div><div><b>${att.length}</b><span>attacks logged</span></div></div>`));
  const maxW = Math.max(...Object.values(W));
  out.push(card(h4("Your triggers", "tap for details") + `<div class="rows trig">${Object.entries(W).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<button class="row tap" data-act="trigger" data-k="${k}"><div><b>${TRIG[k].name}</b><div class="tbar"><i style="--w:${v / maxW * 100}%"></i></div></div><span class="chip ${v / maxW > .75 ? "bad" : "warn"}">${v / maxW > .75 ? "Strong" : "Moderate"}</span></button>`).join("")}</div>
    <p class="muted" style="margin:10px 0 0">Everyone's triggers differ. For you, sleep and your cycle matter more than stress.</p>`));
  const ws = warningSigns();
  out.push(card(h4("Early warning signs", "day before") + `<div class="rows">
    ${row("down", "bad", `HRV drops ~${Math.round(-ws.hrv)}%`, `${ws.hrvDrop} of ${ws.n} attacks · a typical day is ${sign(ws.hrvAll, 0)}%`)}
    ${row("up", "warn", `Resting heart rate ${sign(ws.rhr)} bpm`, "Compared with your 28-day normal")}
    ${row("steps", "", `Activity ~${Math.round((1 - ws.steps) * 100)}% lower on attack days`, "This is how your watch spots attacks you forgot to log")}</div>`));
  out.push(card(h4("Around your period", `${P.cycle_length}-day cycle`) + cycleView()));
  const sc = forecastScore();
  out.push(`<button class="note tap" data-act="goto" data-tab="history" style="text-align:left">${ic("spark")}<span><b>Your forecast is personal now.</b> In the last 6 weeks it flagged ${sc.flagged.length} of ${sc.att.length} attacks the evening before, with ${plural(sc.fa.length, "false alarm")}. It keeps learning from every night and every tap.</span></button>`);
  out.push(card(`<div class="share"><div class="ri">${ic("doc")}</div><div style="flex:1"><b style="font-size:15px">Report for your doctor</b><div class="muted">Attacks, medication, triggers · 6 months</div></div><button class="btn small primary" data-act="report">${ic("share")}Share</button></div>`));
  return out.join("") + footNote();
};

function cycleView() {
  const cl = P.cycle_length, att = past().filter(d => logOf(d.date) && d.cd), byDay = {};
  att.forEach(d => byDay[d.cd] = (byDay[d.cd] || 0) + 1);
  const inWin = att.filter(inPeriodWindow).length, t = day(T()), tp = cl - t.cd + 1;
  const cx = 66, cy = 66, R = 46, pt = (cd, r) => { const a = (cd - 1) / cl * 2 * Math.PI - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  let g = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#efece6" stroke-width="12"/>`;
  const arc = (a0, a1, col) => { const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R); return `<path d="M${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round"/>`; };
  g += arc(cl - 1.5, cl + 0.5, "#f6c1d8") + arc(1, 3.5, "#f6c1d8");
  for (let cd = 1; cd <= cl; cd++) for (let k = 0; k < (byDay[cd] || 0); k++) { const [x, y] = pt(cd, R - 16 - k * 9); g += `<circle cx="${x}" cy="${y}" r="3.6" fill="var(--high)"/>`; }
  const [tx, ty] = pt(t.cd, R);
  g += `<circle cx="${tx}" cy="${ty}" r="7" fill="#fff" stroke="#1f1d2b" stroke-width="2.5"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#1f1d2b">day ${t.cd}</text>`;
  return `<div class="cyc"><svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label="Attacks by cycle day">${g}</svg>
    <p><b>${inWin} of ${att.length}</b> attacks started between 2 days before and 3 days after your period began (pink). Red dots are attacks by cycle day.<br><br>${t.cd <= 3 ? `You're on day ${t.cd} of your period now.` : `Next period expected in about <b>${tp} days</b>; your forecast already accounts for it.`}</p></div>`;
}

/* ================= Sheets ================= */
const SHEETS = {};
const sheetHead = (t, s = "") => `<div class="sh-head"><div><h2>${t}</h2>${s ? `<p>${s}</p>` : ""}</div><button class="close" data-act="closeSheet" aria-label="Close">${ic("x")}</button></div>`;
const statBox = s => `<div class="stat"><div class="k">${ic(s.icon)}${s.name}</div><div class="v">${s.val}</div><div class="d ${sevCls(s)}">${s.delta}</div></div>`;

SHEETS.explain = () => {
  const hd = heroDate(), f = fc(hd);
  return sheetHead("How to read your forecast", f ? `${pct(f.p)} for ${longDate(hd)}` : "") + `<div class="stack">
    ${card(`<p class="sh-text">The number is the model's estimated <b>likelihood of a migraine</b> on that day. It compares your sleep, HRV, resting heart rate, stress and activity with <b>your own normal</b> over the last 28 days.</p>`)}
    ${card(h4("Risk levels") + `<div class="rows">${row("check", "good", "Low · under 15%", "A normal day for you")}${row("info", "warn", "Moderate · 15–40%", "Worth keeping an eye on")}${row("bolt", "bad", "High · 40% and up", "Prepare: medication, sleep, a lighter day")}</div>`)}
    ${card(`<p class="sh-text">Forecasts are made each evening, once today's data is in. A high number is not a certainty: in the last six weeks <b>${forecastScore().fa.length}</b> high-risk day passed without an attack.</p>`)}
    <button class="btn block soft" data-act="goto" data-tab="history">See how past forecasts did</button></div>`;
};

SHEETS.signal = ({ k }) => {
  const s = signals(T(), isEve()).find(x => x.k === k);
  return sheetHead(s.title, `${s.name} · ${shortDate(s.day)}`) + `<div class="stack">
    ${card(k === "cycle" ? h4("Attacks by cycle day", "6 months") + cycleView() : h4("Last 4 weeks", "vs. your normal") + trendChart(s))}
    ${card(`<p class="sh-text">${evidenceText(k)}</p>`)}
    ${s.k === "cycle" ? "" : `<div class="grid2">${statBox(s)}<div class="stat"><div class="k">${ic("chart")}Your normal</div><div class="v">${normalOf(s)}</div><div class="d">28-day average</div></div></div>`}</div>`;
};
function normalOf(s) {
  const d = day(s.day);
  return { sleep: hm(d.b_sleep), mid: clock(d.b_mid), hrv: `${d.b_hrv.toFixed(1)} ms`, rhr: `${d.b_rhr.toFixed(1)} bpm`, stress: Math.round(d.b_stress), steps: Math.round(d.b_steps).toLocaleString("en-GB") }[s.k];
}
function evidenceText(k) {
  const ws = warningSigns(), rr = t => relRisk(TRIG[t].cond), say = (t, r) => r.ratio
    ? `In your data, migraines came <b>${pct(r.pa)}</b> of the time ${TRIG[t].when}, versus <b>${pct(r.pb)}</b> otherwise${r.ratio >= 1.2 ? `: about <b>${r.ratio.toFixed(1)}×</b> as likely` : ""} (${r.x} of ${r.n} days).`
    : `Not enough of these days in your data yet to say how much this matters for you.`;
  return {
    sleep: say("sleep_debt", rr("sleep_debt")), mid: say("sleep_irregularity", rr("sleep_irregularity")), stress: say("stress", rr("stress")), cycle: say("menstrual", rr("menstrual")),
    hrv: `HRV is one of your clearest early warning signs. On the day before your attacks it was on average <b>${Math.round(-ws.hrv)}% below</b> your normal (${ws.hrvDrop} of ${ws.n} attacks dropped 10% or more), while on a typical day it is ${sign(ws.hrvAll, 0)}%.`,
    rhr: `Your resting heart rate tends to rise before attacks: on average <b>${sign(ws.rhr)} bpm</b> above your normal on the day before, across ${ws.n} attacks.`,
    steps: `On attack days you move about <b>${Math.round((1 - ws.steps) * 100)}% less</b> than normal. A drop like this is how your watch spots possible attacks to confirm.`,
  }[k];
}
function trendChart(s) {
  const key = s.key, ds = [];
  for (let i = 27; i >= 0; i--) ds.push(day(addDays(s.day, -i)));
  const vals = ds.flatMap(d => [d[key], d["b_" + key]]).filter(v => v != null);
  let lo = Math.min(...vals), hi = Math.max(...vals); const padv = (hi - lo) * .15 || 1; lo -= padv; hi += padv;
  const Wd = 326, H = 150, l = 34, r = 8, t = 10, b = 20, iw = Wd - l - r, ih = H - t - b;
  const x = i => l + i * iw / (ds.length - 1), y = v => t + ih - (v - lo) / (hi - lo) * ih;
  const path = k => { let p = "", pen = false; ds.forEach((d, i) => { if (d[k] == null) { pen = false; return; } p += (pen ? "L" : "M") + x(i).toFixed(1) + "," + y(d[k]).toFixed(1); pen = true; }); return p; };
  const f = v => key === "mid" ? clock(v) : key === "sleep" ? v.toFixed(1) + "h" : key === "steps" ? Math.round(v / 1000) + "k" : Math.round(v);
  let g = [lo + (hi - lo) * .2, lo + (hi - lo) * .8].map(v => `<line x1="${l}" x2="${Wd - r}" y1="${y(v)}" y2="${y(v)}" stroke="#ece8e2"/><text x="${l - 6}" y="${y(v) + 3.5}" font-size="10" text-anchor="end" fill="#6e6980">${f(v)}</text>`).join("");
  ds.forEach((d, i) => { if (logOf(d.date)) g += `<rect x="${x(i) - 4}" y="${t}" width="8" height="${ih}" rx="3" fill="var(--high-soft)"/>`; });
  g += `<path d="${path("b_" + key)}" fill="none" stroke="#9aa1b1" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  g += `<path d="${path(key)}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const L = ds.length - 1;
  if (ds[L][key] != null) g += `<circle cx="${x(L)}" cy="${y(ds[L][key])}" r="5" fill="var(--brand)" stroke="#fff" stroke-width="2"/>`;
  [0, 14, L].forEach(i => g += `<text x="${x(i)}" y="${H - 4}" font-size="10" text-anchor="${i === 0 ? "start" : i === L ? "end" : "middle"}" fill="#6e6980">${fmt(ds[i].date, { day: "numeric", month: "short" })}</text>`);
  return `<svg class="chart" viewBox="0 0 ${Wd} ${H}" width="100%" role="img" aria-label="${s.name} over four weeks">${g}</svg>
    <div class="legend"><span><i style="background:var(--brand);height:3px"></i>${s.name}</span><span><i class="dash"></i>Your normal</span><span><i style="background:var(--high-soft)"></i>Migraine day</span></div>`;
}

SHEETS.allSignals = () => {
  const sg = signals(T(), isEve());
  return sheetHead("All signals", `${isEve() ? "Today" : "This morning"} vs. your 28-day normal`) +
    `<div class="grid2">${sg.map(s => `<button class="stat tap" style="text-align:left" data-act="signal" data-k="${s.k}">${statBox(s).replace(/^<div class="stat">|<\/div>$/g, "")}</button>`).join("")}</div>
    <p class="muted" style="margin:12px 4px 0">Measured automatically by your watch. Tap a signal to see its trend.</p>`;
};

SHEETS.day = ({ date }) => {
  const d = day(date), f = fc(date), l = logOf(date), fut = date > T(), q = date <= T() && questionOf(date), a = date <= T() && answerOf(date);
  const parts = [];
  if (fut) parts.push(card(`<p class="sh-text">This day hasn't happened yet. The forecast was made ${f && f.made === T() ? "this evening" : "on " + shortDate(f.made)}.</p>`));
  else parts.push(card(l
    ? `<div class="rows">${row("bolt", "bad", `Migraine · ${l.t}`, logText(l) || "No details yet")}</div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn small dark" data-act="details" data-date="${date}">${l.int ? "Edit details" : "Add details"}</button><button class="btn small ghost-danger" data-act="unlog" data-date="${date}">Not a migraine</button></div>`
    : `<div class="rows">${row("check", "good", "No migraine logged", date === T() ? "So far today" : "Migraine-free day")}</div><button class="btn small soft" style="margin-top:12px" data-act="logDay" data-date="${date}">${ic("plus")}Log a migraine for this day</button>`));
  if (f) {
    const outcome = fut ? "" : l ? (f.p >= 0.4 ? `<span class="chip good">${ic("check")}Warned</span>` : `<span class="chip warn">Missed</span>`) : date < T() ? (f.p >= 0.4 ? `<span class="chip warn">False alarm</span>` : `<span class="chip good">Correctly calm</span>`) : "";
    parts.push(card(h4("Forecast", f.outlook ? `3-day outlook from ${shortDate(f.made)}` : "made the evening before") + `<div style="display:flex;align-items:center;gap:12px"><span style="font-size:34px;font-weight:750;letter-spacing:-.03em" class="num">${pct(f.p)}</span>${pill(f.p)}<span style="margin-left:auto">${outcome}</span></div>`));
  } else parts.push(card(h4("Forecast") + `<p class="muted" style="margin:0">No forecast for this day.${date < FIRST_FC ? ` Forecasts in this demo start ${fmt(FIRST_FC, { day: "numeric", month: "long" })}.` : ""}</p>`));
  if (!fut) parts.push(d.sleep == null ? card(h4("Watch data") + `<p class="muted" style="margin:0">No watch data this day. ${l ? "" : "The check-in answer is the only data we have."}</p>`)
    : card(h4("Watch data", "vs. 28-day normal") + `<div class="grid2">${signals(date, true).filter(s => s.k !== "mid").map(statBox).join("")}</div>`, "", `style="background:transparent;box-shadow:none;padding:0"`));
  if (q && q.id !== "feel") parts.push(card(h4("Check-in") + `<p class="sh-text" style="font-size:14px">${q.text.replace(" today", " that day")}</p><p style="margin:6px 0 0;font-weight:650">${a ? "Answered: " + esc(a) : `<span class="muted">Not answered</span>`}</p>`));
  else if (a) parts.push(card(h4("Check-in") + `<p style="margin:0;font-weight:650">Feeling: ${esc(a)}</p>`));
  return sheetHead(longDate(date), d && d.cd ? `Cycle day ${d.cd}${fut ? " · upcoming" : ""}` : "") + `<div class="stack">${parts.join("")}</div>`;
};

SHEETS.details = ({ date }) => {
  const l = logOf(date);
  if (!l) return sheetHead("Migraine") + `<p class="muted">No migraine logged.</p>`;
  // When it started: quick "how long ago" choices (today only, relative to when it was logged) or an exact time
  const today = date === T(), now = today ? timeAt() : "23:59", base = today ? l.at || now : null;
  const toM = t => +t.slice(0, 2) * 60 + +t.slice(3), back = m => clock((toM(base) - m) / 60);
  const agos = today ? [0, 30, 60, 120, 180].filter(m => toM(base) - m >= 0) : [];
  return sheetHead(`Migraine · ${l.t}`, `${longDate(date)} · saved`) + `<div class="stack">
    ${card(h4("Started", "if it began earlier") + (agos.length ? `<div class="chips">${agos.map(m => `<button class="${l.t === back(m) ? "sel" : ""}" data-act="setStart" data-date="${date}" data-v="${back(m)}">${!m ? "Just now" : m < 60 ? m + " min ago" : m / 60 + " h ago"}</button>`).join("")}</div>` : "") +
      `<label class="start-at">${agos.length ? "Or exact time" : "Start time"}<input type="time" id="startAt" data-date="${date}" value="${l.t}" max="${now}"></label>`)}
    ${card(h4("Intensity", "optional") + `<div class="choice">${["Mild", "Moderate", "Severe"].map(x => `<button class="${l.int === x ? "sel" : ""}" data-act="setInt" data-date="${date}" data-v="${x}">${x}</button>`).join("")}</div>`)}
    ${card(h4("Medication", "optional · pick any") + `<div class="chips">${["Triptan", "Ibuprofen", "Paracetamol", "Nothing"].map(x => `<button class="${(l.meds || []).includes(x) ? "sel" : ""}" data-act="setMed" data-date="${date}" data-v="${x}">${x}</button>`).join("")}</div>`)}
    <p class="muted" style="text-align:center;margin:0">Your log is already saved. Details help you and your doctor see patterns.</p>
    <button class="btn block primary" data-act="closeSheet" data-toast="Details saved">Done</button></div>`;
};

SHEETS.trigger = ({ k }) => {
  const t = TRIG[k], r = relRisk(t.cond), maxW = Math.max(...Object.values(W));
  const bar = (lab, v, col) => `<div class="mrow"><span>${lab}</span><b>${pct(v)}</b></div><div class="meter"><i style="--w:${Math.min(100, v / Math.max(r.pa, r.pb, .01) * 100)}%;background:${col}"></i></div>`;
  return sheetHead(t.name, `${W[k] / maxW > .75 ? "Strong" : "Moderate"} trigger for you`) + `<div class="stack">
    ${card(h4("Chance of a migraine", "your last 6 months") + (r.ratio ? bar(t.when.replace(/^(after|on|from|within) /, s => s[0].toUpperCase() + s.slice(1)), r.pa, "var(--high)") + bar("On other days", r.pb, "#b9bfcc") : `<p class="muted">Not enough data yet.</p>`))}
    ${card(`<p class="sh-text">${evidenceText({ sleep_debt: "sleep", sleep_irregularity: "mid", stress: "stress", menstrual: "cycle" }[k])}</p>`)}
    ${card(`<p class="sh-text">The forecast weighs this trigger for you specifically, together with your watch signals. Patterns get sharper with every night tracked and every attack logged.</p>`)}</div>`;
};

SHEETS.report = () => {
  const all = past(), att = all.filter(d => logOf(d.date)), logs = att.map(d => logOf(d.date)), months = all.length / 30.4;
  const ints = ["Mild", "Moderate", "Severe"].map(x => [x, logs.filter(l => l.int === x).length]);
  const medDays = logs.filter(l => (l.meds || []).some(m => m !== "Nothing")).length, trip = logs.filter(l => (l.meds || []).includes("Triptan")).length;
  const sc = forecastScore(), per = att.filter(inPeriodWindow).length, worn = all.filter(d => d.sleep != null).length;
  const byMonth = MONTHS.slice(-6).map(m => [fmt(m + "-15", { month: "short" }), att.filter(d => d.date.startsWith(m)).length]);
  const maxM = Math.max(...byMonth.map(x => x[1]), 1);
  const paper = `<div class="paper"><div class="ph"><div><h3>Migraine summary</h3><div class="meta">Anna, ${P.age} · ${fmt(all[0].date, { day: "numeric", month: "short" })} – ${fmt(T(), { day: "numeric", month: "short", year: "numeric" })}</div></div><div class="meta" style="text-align:right">Migrai<br>Generated ${fmt(T(), { day: "numeric", month: "short" })}</div></div>
    <div class="kpis"><div><b>${att.length}</b><span>attacks logged</span></div><div><b>${(att.length / months).toFixed(1)}</b><span>per month</span></div><div><b>${(medDays / months).toFixed(1)}</b><span>medication days / month</span></div></div>
    <h5>Attacks per month</h5><svg viewBox="0 0 300 66" width="100%">${byMonth.map(([m, n], i) => `<rect x="${i * 50 + 12}" y="${50 - n / maxM * 36}" width="26" height="${n / maxM * 36 + .5}" rx="3" fill="#d9645a"/><text x="${i * 50 + 25}" y="62" font-size="9" text-anchor="middle" fill="#5f5b6e">${m}</text><text x="${i * 50 + 25}" y="${46 - n / maxM * 36}" font-size="9" font-weight="700" text-anchor="middle" fill="#1b1e27">${n}</text>`).join("")}</svg>
    <h5>Attacks</h5><table>${ints.map(([x, n]) => `<tr><td>${x}</td><td>${n}</td></tr>`).join("")}<tr><td>Intensity not recorded</td><td>${logs.filter(l => !l.int).length}</td></tr><tr><td>Treated with a triptan</td><td>${trip}</td></tr></table>
    <h5>Patterns</h5><table><tr><td>Within −2 to +3 days of period start</td><td>${per} of ${att.length}</td></tr>
      <tr><td>Strongest personal triggers</td><td>${Object.entries(W).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => TRIG[e[0]].name.toLowerCase()).join(", ")}</td></tr>
      <tr><td>HRV the day before attacks</td><td>${Math.round(warningSigns().hrv)}% vs normal</td></tr>
      <tr><td>Forecast: attacks flagged the evening before (6 wk)</td><td>${sc.flagged.length} of ${sc.att.length}</td></tr>
      <tr><td>Nights with wearable data</td><td>${Math.round(worn / all.length * 100)}%</td></tr></table>
    <div class="disc">Generated from wearable data and patient-reported logs. Demo with simulated data. Not a diagnosis.</div></div>`;
  return sheetHead("Report for your doctor", "Preview · 1 page PDF") + `<div class="stack">${paper}
    <div class="grid2"><button class="btn ${S.sent ? "soft" : "primary"}" data-act="send">${S.sent ? ic("check") + "Sent" : ic("share") + "Send securely"}</button><button class="btn soft" data-act="print">${ic("doc")}Save as PDF</button></div>
    <p class="muted" style="text-align:center;margin:0">${ic("shield")} You choose what to share. The link expires after 7 days.</p></div>`;
};

SHEETS.profile = () => sheetHead("Anna", `${P.age} · using Migrai for 6 months`) + `<div class="stack">
  ${card(`<div class="rows">${row("watch", "good", "Watch connected", `Synced at ${timeAt()} · battery 64%`)}${row("bell", "", "Wear-your-watch reminder", "Evenings at 22:30", `<span class="toggle ${S.remind ? "on" : ""}"></span>`, `data-act="remind" role="switch" aria-checked="${S.remind}"`)}${row("shield", "", "Your data stays yours", "Shared only when you choose")}</div>`)}
  ${card(`<p class="sh-text">This is a demo with <b>simulated data</b> for person P0187 from our simulator. Physiology and forecasts come from the data; times of day and check-in answers are illustrative.</p>`)}
  <button class="btn block ghost-danger" data-act="reset">${ic("undo")}Reset demo data</button></div>`;

/* ================= Sheet / toast / banner mechanics ================= */
let sheet = null;
function openSheet(name, args = {}) {
  const swap = !!sheet;
  sheet = { name, args };
  const body = $("sheetBody");
  body.innerHTML = SHEETS[name](args); body.scrollTop = 0;
  if (swap) { body.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" }); }
  $("scrim").classList.add("on"); $("sheet").classList.add("on");
  setTimeout(() => { const c = body.querySelector(".close"); c && c.focus({ preventScroll: true }); }, 50);
}
function closeSheet() { sheet = null; $("scrim").classList.remove("on"); $("sheet").classList.remove("on"); }
function refreshSheet() { if (!sheet) return; const b = $("sheetBody"), st = b.scrollTop; b.innerHTML = SHEETS[sheet.name](sheet.args); b.scrollTop = st; }
let toastT;
function toast(msg, icon = "check") {  // grows out of the dynamic island, like a live activity
  const t = $("toast"), sc = $("screen"); t.innerHTML = ic(icon) + msg; t.classList.add("on"); sc.classList.add("toasting");
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove("on"); sc.classList.remove("toasting"); }, 2300);
}
let bannerT;
function banner() {
  const hd = heroDate(), f = fc(hd), d = day(T()), b = $("banner");
  const title = isEve() ? (f ? `Tomorrow: ${level(f.p).txt.toLowerCase()} risk (${pct(f.p)})` : "Your evening summary is ready") : `Good morning, Anna`;
  const body = isEve() ? (f && f.p >= 0.4 ? "Tap to see why, and how to prepare tonight." : "Your evening forecast is ready.")
    : `You slept ${hm(d.sleep)}. Migraine risk today: ${f ? pct(f.p) + " (" + level(f.p).txt.toLowerCase() + ")" : "no forecast"}.`;
  b.innerHTML = `<div class="ai"><img src="logo.svg" alt=""></div><div><div class="nh"><span>Migrai</span><span>now</span></div><b>${title}</b><p>${body}</p></div>`;
  b.classList.add("on"); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove("on"), 4200);
}

/* ================= Rendering ================= */
const TABS = [["today", "home", "Today"], ["history", "chart", "History"], ["checkin", "pen", "Check-in"]];
function render(enter = false) {
  const host = $("views"), old = host.firstElementChild, st = !enter && old ? old.scrollTop : 0;
  host.innerHTML = `<div class="view ${enter ? "enter" : ""}" role="tabpanel"><div class="stack ${enter ? "anim" : ""}">${VIEWS[S.tab]()}</div></div>`;
  host.firstElementChild.scrollTop = st;
  if (S.tab === "today") animateGauge();
  const n = openItems();
  $("tabbar").innerHTML = TABS.map(([k, i, l]) => `<button class="tab ${S.tab === k ? "on" : ""}" data-act="tab" data-tab="${k}" aria-current="${S.tab === k}">${ic(i)}${l}${k === "checkin" && n ? `<span class="badge">${n}</span>` : ""}</button>`).join("");
  $("sbTime").textContent = timeAt();
  renderPicker();
  refreshSheet();
  save();
}
function renderPicker() {
  const html = SLOTS.reduce((acc, s, i) => {
    if (s.slot === "evening") return acc;
    const btn = n => { const f = fc(heroDate(n), n), on = n.date === S.now.date && n.slot === S.now.slot, mg = n.slot === "evening" && day(n.date).log;
      return `<button class="pbtn ${on ? "on" : ""}" role="radio" aria-checked="${on}" data-act="now" data-date="${n.date}" data-slot="${n.slot}" style="--c:var(--${level(f && f.p).k === "none" ? "tx-3" : level(f && f.p).k})">
        ${mg ? '<span class="mg">migraine</span>' : ""}<span class="dot"></span><span class="pt">${n.slot === "morning" ? "Morning" : "Evening"}<small>${timeAt(n)}</small></span><span class="pv">${f ? pct(f.p) : "–"}</span></button>`; };
    return acc + `<div class="pday"><div class="pd">${fmt(s.date, { weekday: "long" })}<small>${fmt(s.date, { day: "numeric", month: "short" })}</small></div>${btn(s)}${btn(SLOTS[i + 1])}</div>`;
  }, "");
  $("picker").innerHTML = html;
  $("mpop").innerHTML = `<div class="picker">${html}</div><div class="picker-foot"><span>Demo: choose Anna's "now"</span><button class="linkbtn" data-act="reset">Reset demo</button></div>`;
  
  $("mpick").innerHTML = ic("clock"); $("mpick").title = `Demo time: ${shortDate(T())} ${timeAt()}`;
}
function setNow(date, slot) {
  if (date === S.now.date && slot === S.now.slot) return;
  S.now = { date, slot }; S.sel = null; S.month = date.slice(0, 7);
  closeSheet(); render(true); banner();
}
function stepNow(k) { const i = SLOTS.findIndex(s => s.date === S.now.date && s.slot === S.now.slot), n = SLOTS[Math.max(0, Math.min(SLOTS.length - 1, i + k))]; setNow(n.date, n.slot); }

/* ================= Actions ================= */
function setLog(date, patch) { S.logs[date] = { ...(logOf(date) || {}), ...patch }; delete S.logs[date].deleted; }
const ACT = {
  tab: el => { if (S.tab !== el.dataset.tab) { S.tab = el.dataset.tab; closeSheet(); render(true); } },
  goto: el => { S.tab = el.dataset.tab; closeSheet(); render(true); },
  now: el => { setNow(el.dataset.date, el.dataset.slot); $("mpop").classList.remove("on"); },
  mpick: () => $("mpop").classList.toggle("on"),
  banner: () => { $("banner").classList.remove("on"); if (S.tab !== "today") { S.tab = "today"; render(true); } },
  closeSheet: el => { closeSheet(); if (el && el.dataset.toast) toast(el.dataset.toast); },
  explain: () => openSheet("explain"),
  signal: el => openSheet("signal", { k: el.dataset.k }),
  allSignals: () => openSheet("allSignals"),
  tile: el => { const ds = el.dataset.date, f = fc(ds);
    toast(f ? `${fmt(ds, { weekday: "long" })}: ${pct(f.p)} · ${level(f.p).txt.toLowerCase()} risk` : `${fmt(ds, { weekday: "long" })}'s forecast arrives ${fmt(addDays(ds, -1), { weekday: "long" })} evening`, f ? "wave" : "clock"); },
  plan: el => { const key = `${T()}|${S.now.slot}`, a = S.plan[key] = S.plan[key] || [], i = +el.dataset.i; a[i] = !a[i]; render();
    const n = planItems((fc(heroDate()) || {}).p).length; if (a.filter(Boolean).length === n && a[i]) toast("All set. Good luck tonight!"); },
  remind: () => { S.remind = !S.remind; render(); toast(S.remind ? "Reminder on · 22:30" : "Reminder off", S.remind ? "bell" : "x"); },
  hist: el => { S.hist = el.dataset.v; render(); },
  month: el => { if (el.dataset.m) { S.month = el.dataset.m; render(); } },
  day: el => { S.sel = el.dataset.date; render(); openSheet("day", { date: el.dataset.date }); },
  logNow: () => {
    setLog(T(), { t: timeAt(), at: timeAt(), int: null, meds: [], src: "tap" }); render();
    toast(`Migraine logged at ${timeAt()}`); setTimeout(() => openSheet("details", { date: T() }), 650);
  },
  logDay: el => { const ds = el.dataset.date; setLog(ds, { t: ds === T() ? timeAt() : "12:00", int: null, meds: [], src: "tap" }); render(); toast(`Migraine added for ${shortDate(ds)}`); openSheet("details", { date: ds }); },
  details: el => openSheet("details", { date: el.dataset.date }),
  unlog: el => { const ds = el.dataset.date; if (day(ds).log) S.logs[ds] = { deleted: true }; else delete S.logs[ds]; if (sheet && sheet.name === "details") closeSheet(); render(); toast("Log removed", "undo"); },
  setStart: el => { setLog(el.dataset.date, { t: el.dataset.v }); render(); },
  setInt: el => { const l = logOf(el.dataset.date); setLog(el.dataset.date, { int: l.int === el.dataset.v ? null : el.dataset.v }); render(); },
  setMed: el => { const l = logOf(el.dataset.date), v = el.dataset.v; let m = (l.meds || []).slice();
    m = v === "Nothing" ? (m.includes(v) ? [] : [v]) : m.includes(v) ? m.filter(x => x !== v) : m.filter(x => x !== "Nothing").concat(v); setLog(el.dataset.date, { meds: m }); render(); },
  answer: el => { const v = el.dataset.v; S.answers[T()] = v;
    if (MIG_ANSWER[v] !== undefined && !logOf(T())) { setLog(T(), { t: timeAt(), int: MIG_ANSWER[v], meds: [], src: "check-in" }); toast(`Migraine logged at ${timeAt()}`); }
    else toast(isEve() ? "Thanks! Saved to your labels." : "Thanks! Saved to your labels."); render(); bump("m2"); },
  reanswer: () => { const a = S.answers[T()] ?? answerOf(T()); delete S.answers[T()];
    if (MIG_ANSWER[a] !== undefined && S.logs[T()] && S.logs[T()].src === "check-in") delete S.logs[T()]; render(); },
  auto: el => { const ds = el.dataset.date, yes = el.dataset.v === "yes"; S.auto[ds] = yes ? "yes" : "no"; S.autoLast = ds;
    if (yes) setLog(ds, { t: "time unknown", int: null, meds: [], src: "detected" }); render(); toast(yes ? "Saved. Added to your history." : "Got it, marked migraine-free.");
    if (yes) setTimeout(() => openSheet("details", { date: ds }), 650); },
  autoUndo: () => { const ds = S.autoLast; if (S.auto[ds] === "yes") delete S.logs[ds]; delete S.auto[ds]; S.autoLast = null; render(); },
  trigger: el => openSheet("trigger", { k: el.dataset.k }),
  report: () => openSheet("report"),
  send: () => { if (!S.sent) { S.sent = true; render(); toast("Report sent securely", "shield"); } },
  print: () => { $("printReport").innerHTML = $("sheetBody").querySelector(".paper").outerHTML; window.print(); },
  profile: () => openSheet("profile"),
  nextDay: () => fetch("/next", { method: "POST" }).then(() => { S.now = { date: addDays(OUT.made, 1), slot: "evening" }; save(); location.reload(); }),
  reset: () => { if (ANNA.live) { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } fetch("/reset", { method: "POST" }).then(() => location.reload()); return; } S = fresh(); try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } shownRisk = 0; closeSheet(); $("mpop").classList.remove("on"); render(true); toast("Demo reset", "undo"); },
  tryWhy: () => { S.tab = "today"; render(true); const d = drivers(T(), isEve())[0]; setTimeout(() => d ? openSheet("signal", { k: d.k }) : openSheet("allSignals"), 300); },
  tryLog: () => { S.tab = "checkin"; closeSheet(); render(true); },
  tryHistory: () => { S.tab = "history"; S.hist = "6w"; closeSheet(); render(true); },
  tryReport: () => { S.tab = "insights"; render(true); setTimeout(() => openSheet("report"), 300); },
};
function bump(id) { const m = $(id); if (m) { m.classList.remove("bump"); void m.offsetWidth; m.classList.add("bump"); } }

document.addEventListener("change", e => {   // exact start time in the migraine details sheet
  const el = e.target;
  if (el.id !== "startAt" || !el.value) return;
  const ds = el.dataset.date, v = ds === T() && el.value > timeAt() ? timeAt() : el.value;
  setLog(ds, { t: v }); render(); toast(`Start time set to ${v}`);
});
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (el && !el.disabled && ACT[el.dataset.act]) { ACT[el.dataset.act](el, e); return; }
  if (!e.target.closest("#mpop, #mpick")) $("mpop").classList.remove("on");
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeSheet(); $("mpop").classList.remove("on"); }
  else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.target.closest("input, textarea")) { stepNow(e.key === "ArrowRight" ? 1 : -1); e.preventDefault(); }
  else if ((e.key === "Enter" || e.key === " ") && e.target.matches("g[data-act], div[data-act][role=button]")) { e.target.click(); e.preventDefault(); }
});
/* Swipe a sheet down to close it */
(() => {
  const sh = $("sheet"); let y0 = null, dy = 0;
  sh.addEventListener("pointerdown", e => { if (e.target.closest(".grab, .sh-head") && !e.target.closest("button")) { y0 = e.clientY; dy = 0; sh.classList.add("drag"); sh.setPointerCapture(e.pointerId); } });
  sh.addEventListener("pointermove", e => { if (y0 == null) return; dy = Math.max(0, (e.clientY - y0) / (sh.getBoundingClientRect().height / sh.offsetHeight)); sh.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (y0 == null) return; y0 = null; sh.classList.remove("drag"); sh.style.transform = ""; if (dy > 90) closeSheet(); };
  sh.addEventListener("pointerup", end); sh.addEventListener("pointercancel", end);
})();

function fit() {
  document.body.classList.toggle("mobile", innerWidth < 760);
}

addEventListener("resize", fit); fit();
if ($("aboutRate")) $("aboutRate").textContent = (DAYS.filter(d => d.mig).length / DAYS.length * 30.4).toFixed(0);
render(true);
