// The example timeline only moves when the viewer chooses to sync or select a day.
const CURSOR_KEY = 'migrai-product-demo-day';
const embedded = new URLSearchParams(location.search).has("embedded");
let demoIndex = embedded ? 169 : ANNA_SOURCE.defaultIndex;
try {
  const saved = Number(localStorage.getItem(CURSOR_KEY));
  if (!embedded && Number.isInteger(saved) && saved >= ANNA_SOURCE.defaultIndex && saved < ANNA_SOURCE.days.length) demoIndex = saved;
} catch (_) { /* Storage is optional. */ }
const selected = ANNA_SOURCE.days[demoIndex];
const ANNA = {
  live: false,
  person: ANNA_SOURCE.person,
  days: ANNA_SOURCE.days.slice(0, demoIndex + 1).map((row,index) => { const copy={...row}; if(embedded && index>=169){delete copy.log;delete copy.a;} return copy; }),
  outlook: { made: selected.date, ...Object.fromEntries(selected.forecast.map(f => [f.date, f.p])) },
};
