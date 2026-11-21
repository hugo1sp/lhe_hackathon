/* Product interactions only: no clock, autoplay, automatic answers or scripted attacks. */
const LABEL_FIELDS = ['person_id','date','question','answer','migraine','intensity','onset','prodrome','stress','illness','alcohol'];
function collectedLabels() {
  const rows = new Map();
  Object.entries(S.answers).forEach(([date, answer]) => {
    const policy = day(date)?.policy, option = policy?.options.find(o => o.label === answer);
    if (option) rows.set(date, {person_id:P.id,date,question:policy.id,answer,...option.set});
  });
  Object.entries(S.logs).forEach(([date, log]) => {
    if (log.deleted) return;
    rows.set(date, {...(rows.get(date) || {}),person_id:P.id,date,question:rows.get(date)?.question || 'log_now',answer:rows.get(date)?.answer || '',migraine:1,
      onset:log.t, ...(log.int ? {intensity:{Mild:2,Moderate:3,Severe:4}[log.int]} : {})});
  });
  return [...rows.values()].sort((a,b) => a.date.localeCompare(b.date));
}
function updateProductChrome() {
  document.querySelectorAll('.side-link').forEach(button => button.classList.toggle('on',button.dataset.tab === S.tab));
  $('watch-date').textContent = shortDate(OUT.made);
  $('watch-history').textContent = `${DAYS.length} days of history`;
  $('sidebar-badge').textContent = questionOf(T()) && !answerOf(T()) ? '1' : '';
  $('model-mode').textContent = window.MODEL_LIVE ? 'Live inference' : 'Saved model forecasts';
  document.querySelectorAll('[data-act="nextDay"]').forEach(button => button.disabled = demoIndex >= ANNA_SOURCE.days.length - 1);
  try { localStorage.setItem('migrai-product-demo-labels',JSON.stringify(collectedLabels())); } catch (_) { /* Optional storage. */ }
}
const originalRender = render;
render = function(enter = false) { originalRender(enter); updateProductChrome(); };
ACT.nextDay = () => {
  if (demoIndex >= ANNA_SOURCE.days.length - 1) return;
  document.querySelectorAll('[data-act="nextDay"]').forEach(button => {button.disabled=true;button.textContent='Syncing…';});
  try {
    localStorage.setItem(CURSOR_KEY,String(demoIndex + 1));
    S.now={date:ANNA_SOURCE.days[demoIndex+1].date,slot:'evening'};save();location.reload();
  } catch (_) { toast('Browser storage is needed to sync example days.');updateProductChrome(); }
};
ACT.reset = () => {
  try {localStorage.removeItem(KEY);localStorage.removeItem(CURSOR_KEY);localStorage.removeItem('migrai-product-demo-labels');} catch (_) { /* Optional storage. */ }
  location.reload();
};
ACT.answer = element => {
  const policy=day(T()).policy, option=policy?.options.find(o => o.label===element.dataset.v);
  if (!option) return;
  S.answers[T()]=option.label;
  if (option.set.migraine===1 && !logOf(T())) setLog(T(),{t:timeAt(),int:({2:'Mild',3:'Moderate',4:'Severe'})[option.set.intensity] || null,meds:[],src:'check-in'});
  if (option.set.migraine===0 && S.logs[T()]?.src==='check-in') delete S.logs[T()];
  render();toast('Saved to your labels.');
};
ACT.downloadLabels = () => {
  const rows=collectedLabels(), csv=[LABEL_FIELDS.join(','),...rows.map(row => LABEL_FIELDS.map(key => JSON.stringify(String(row[key] ?? ''))).join(','))].join('\n')+'\n';
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})), link=document.createElement('a');
  link.href=url;link.download='anna-labels.csv';link.click();setTimeout(() => URL.revokeObjectURL(url),1000);
};
SHEETS.profile = () => sheetHead('Anna','Example profile · age 23') + `<div class="stack">${card(`<div class="product-summary"><div><b>${DAYS.length}</b><span>days of history</span></div><div><b>${past().filter(d=>logOf(d.date)).length}</b><span>logged attacks</span></div><div><b>${collectedLabels().length}</b><span>new labels</span></div></div>`)}${card(`<p>Forecasts use your watch data. Your answers and logs are saved as training labels.</p><p class="muted" style="margin-top:10px">This example uses simulated data. The personal layer is not connected.</p>`)}<button class="btn soft" data-act="downloadLabels">Download my labels</button><button class="btn ghost-danger" data-act="reset">Reset example</button></div>`;
SHEETS.signal = ({k}) => {
  const made=isEve()?T():addDays(T(),-1), signal=signals(made,true).find(s=>s.k===k);
  if (!signal) return sheetHead('Watch signal')+card('<p>No watch data for this day.</p>');
  return sheetHead(signal.name,shortDate(signal.day))+`<div class="stack">${card(`<div class="grid2">${statBox(signal)}<div class="stat"><div class="k">Your normal</div><div class="v">${normalOf(signal)}</div><div class="d">Previous 28 days</div></div></div>`)}${card(h4('Last 4 weeks')+trendChart(signal))}</div>`;
};
updateProductChrome();
