/* Anna's app remains fully interactive while the parent supplies watch data and time. */
let incomingQuestion=null, demoClock='06:00';
S.qAnswers=S.qAnswers||{};S.qEvents=S.qEvents||{};
const sendParent=message=>{if(parent!==window)parent.postMessage(message,location.origin);};
timeAt=()=>demoClock;
stepNow=()=>{};
const historyQuestionOf=questionOf,historyAnswerOf=answerOf;
questionOf=date=>date===T()?(incomingQuestion?{...incomingQuestion.question,opts:incomingQuestion.question.options.map(o=>o.label),why:incomingQuestion.key.includes('followup')?'Evening check-in':'A quick question from your watch'}:null):historyQuestionOf(date);
answerOf=date=>date===T()&&incomingQuestion?S.qAnswers[incomingQuestion.key]?.answer??null:historyAnswerOf(date);
ACT.nextDay=()=>{};
ACT.now=()=>{};
ACT.answer=element=>{
  if(!incomingQuestion)return;
  const option=incomingQuestion.question.options.find(o=>o.label===element.dataset.v);
  if(!option)return;
  const event={date:T(),time:demoClock,question:incomingQuestion.question.id,answer:option.label,set:option.set};
  S.qAnswers[incomingQuestion.key]=event;S.qEvents[incomingQuestion.key]=event;S.answers[T()]=option.label;
  if(option.set.migraine===1&&!logOf(T()))setLog(T(),{t:demoClock,int:({2:'Mild',3:'Moderate',4:'Severe'})[option.set.intensity]||null,meds:[],src:'check-in'});
  if(option.set.migraine===0&&S.logs[T()]?.src==='check-in')delete S.logs[T()];
  $('banner').classList.remove('on');render();toast('Saved. Thank you, Anna.');sendParent({type:'anna-answer',key:incomingQuestion.key});
};
const priorCollectedLabels=collectedLabels;
collectedLabels=()=>{
  const rows=new Map(priorCollectedLabels().map(row=>[row.date,row]));
  Object.values(S.qEvents).forEach(event=>{
    const previous=rows.get(event.date)||{person_id:P.id,date:event.date};
    rows.set(event.date,{...previous,question:event.question,answer:event.answer,...event.set});
  });
  Object.entries(S.logs).forEach(([date,log])=>{if(!log.deleted)rows.set(date,{...(rows.get(date)||{}),person_id:P.id,date,question:rows.get(date)?.question||'log_now',answer:rows.get(date)?.answer||'',migraine:1,onset:log.t,...(log.int?{intensity:{Mild:2,Moderate:3,Severe:4}[log.int]}:{})});});
  return [...rows.values()].sort((a,b)=>a.date.localeCompare(b.date));
};
const originalCheckin=VIEWS.checkin;
VIEWS.checkin=()=>{
  const history=Object.values(S.qEvents).filter(event=>event.date===T());
  return originalCheckin()+(history.length?card(h4('Today’s answers')+history.map(event=>`<div class="answer-history"><span>${esc(event.time)}</span><b>${esc(event.answer)}</b></div>`).join('')):'');
};
ACT.banner=()=>{$('banner').classList.remove('on');S.tab='checkin';closeSheet();render(true);};
ACT.dismissQuestion=()=>{$('banner').classList.remove('on');sendParent({type:'anna-dismiss',key:incomingQuestion?.key});};
ACT.reset=()=>{try{localStorage.removeItem(KEY);localStorage.removeItem('migrai-product-demo-labels');}catch(_){}sendParent({type:'anna-reset-request'});};
function showQuestion(message){
  incomingQuestion={key:message.key,question:message.question};
  if(message.time)demoClock=message.time;
  render();
  if(S.qAnswers[message.key]){sendParent({type:'anna-answer',key:message.key});return;}
  $('banner').innerHTML=`<span class="ai"><img src="../logo.svg" alt=""></span><div><div class="nh"><span>Migrai · now</span><button data-act="dismissQuestion" aria-label="Dismiss question">×</button></div><b>One quick question</b><p>${esc(message.question.text)}</p><small>Tap to answer</small></div>`;
  $('banner').classList.add('on');
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent)return;
  const message=event.data;
  if(message?.type==='anna-init')sendParent({type:'anna-ready'});
  if(message?.type==='anna-clock')demoClock=message.time;
  if(message?.type==='anna-sync'){
    while(DAYS.length<=message.index){
      const index=DAYS.length,row={...ANNA_SOURCE.days[index]};
      if(index>=169){delete row.log;delete row.a;}
      IDX[row.date]=DAYS.length;DAYS.push(row);
      if(!MONTHS.includes(row.date.slice(0,7)))MONTHS.push(row.date.slice(0,7));
    }
    const date=ANNA_SOURCE.days[message.index].date;
    if(date!==S.now.date)incomingQuestion=null;
    S.now={date,slot:message.slot};demoClock=message.time;
    Object.keys(OUT).forEach(key=>delete OUT[key]);OUT.made=date;
    ANNA_SOURCE.days[message.index].forecast.forEach(f=>OUT[f.date]=f.p);
    if(!S.month||S.month>date.slice(0,7))S.month=date.slice(0,7);
    render(false);
  }
  if(message?.type==='anna-question')showQuestion(message);
  if(message?.type==='anna-reset'){try{localStorage.removeItem(KEY);localStorage.removeItem('migrai-product-demo-labels');}catch(_){}location.reload();}
});
document.addEventListener('pointerdown',()=>sendParent({type:'anna-activity'}),{passive:true});
render();sendParent({type:'anna-ready'});
