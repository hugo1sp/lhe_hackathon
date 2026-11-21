(() => {
  'use strict';
  const P=window.P, iframe=document.getElementById('anna-app'), $=id=>document.getElementById(id);
  const state={paused:false,ready:false,pending:null,speed:4,done:new Set(),hold:0,phase:'',ended:false};
  const events=[];
  P.DAYS.forEach((day,i)=>{
    const q=day.policy;
    if(q){
      const at=q.id==='anomaly'?Math.max(9,P.WAKE[i]+.5):20.75;
      events.push({id:day.iso+'-primary',t:i*24+at,question:q});
      if(at<12) events.push({id:day.iso+'-followup',t:i*24+20.75,question:ANNA_SOURCE.followup});
    }
  });
  events.sort((a,b)=>a.t-b.t);
  function send(message){iframe.contentWindow.postMessage(message,location.origin);}
  function sync(force=false){
    const d=P.dayOf(P.S.t),h=P.S.t-d*24,slot=h>=20.5?'evening':'morning',key=d+'-'+slot;
    if(!force&&key===state.phase)return;
    state.phase=key;send({type:'anna-sync',index:P.START+d,slot,time:clock(P.S.t)});drawData();if(slot==='evening')state.hold=Math.max(state.hold,performance.now()+1200);
  }
  function clock(t){const minutes=Math.round(t*60)%1440;return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
  function drawData(){
    const i=P.dayOf(P.S.t),today=ANNA_SOURCE.days[P.START+i],evening=(P.S.t%24)>=20.5;
    const made=ANNA_SOURCE.days[P.START+i-(evening?0:1)],forecast=made.forecast[0],p=forecast.p;
    const value=(v,d=0)=>v==null?'—':Number(v).toFixed(d);
    $('watch-values').innerHTML=[['Sleep',today.sleep,today.b_sleep,'h',1],['HRV',today.hrv,today.b_hrv,'ms',0],['Resting HR',today.rhr,today.b_rhr,'bpm',0]].map(([name,v,b,unit,d])=>`<div class="watch-value"><span>${name}</span><b>${value(v,d)} <small>${unit}</small></b><small>usual ${value(b,d)} ${unit}</small></div>`).join('');
    $('sync-label').textContent=evening?'Day synced':'Night synced';
    $('forecast-value').textContent=Math.round(p*100)+'% '+(evening?'tomorrow':'today');
    const names={sleep:'Sleep',mid:'Sleep timing',hrv:'HRV',rhr:'Resting HR',stress:'Stress',steps:'Activity'};
    const effects=Object.entries(made.effects).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,4),max=Math.max(...effects.map(x=>Math.abs(x[1])),.001);
    $('effects').innerHTML=effects.map(([key,v])=>`<div class="effect"><span>${names[key]}</span><div class="effect-track"><i class="${v<0?'down':''}" style="width:${Math.abs(v)/max*47}%"></i></div><span>${v>0?'Raises risk':'Lowers risk'}</span></div>`).join('');
    const history=ANNA_SOURCE.days.slice(P.START-5,P.START+i+1),w=560,h=90,left=8,right=10,top=8,bottom=18;
    const x=n=>left+n/Math.max(history.length-1,1)*(w-left-right),sy=v=>top+(1-v)*(h-top-bottom);
    const hrv=history.map((d,n)=>`${x(n)},${sy(Math.max(0,Math.min(1,d.hrv/70)))}`).join(' '),risk=history.map((d,n)=>`${x(n)},${sy(d.risk||0)}`).join(' ');
    $('signal-chart').innerHTML=`<div class="spark-labels"><span><i></i>HRV</span><span><i></i>Next-day forecast from the prior evening</span></div><svg class="spark" viewBox="0 0 ${w} ${h}" aria-label="HRV and model forecast over recent days" role="img"><line x1="8" x2="550" y1="72" y2="72" stroke="#303a50"/><polyline points="${hrv}" fill="none" stroke="#a99be4" stroke-width="2"/><polyline points="${risk}" fill="none" stroke="#e7b66b" stroke-width="2"/><text x="8" y="87">${history[0].date.slice(5)}</text><text x="550" y="87" text-anchor="end">${today.date.slice(5)}</text></svg>`;
    $('timeline').innerHTML=P.DAYS.map((d,n)=>`<div class="${n===i?'active':''}">${d.name} ${d.date}<b>${n<=i?Math.round(d.risk*100)+'%':'—'}</b></div>`).join('');
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==iframe.contentWindow)return;
    const m=event.data;
    if(m?.type==='anna-ready'){state.ready=true;sync(true);if(state.pending)send({type:'anna-question',...state.pending,time:clock(P.S.t)});}
    if(m?.type==='anna-answer'||m?.type==='anna-dismiss'){state.pending=null;state.hold=performance.now()+450;$('demo-status').textContent='Saved. Anna’s day continues.';$('demo-status').classList.remove('waiting');}
    if(m?.type==='anna-reset-request'){try{localStorage.removeItem('migrai-product-demo-v1');localStorage.removeItem('migrai-product-demo-labels');}catch(_){}location.reload();}
    if(m?.type==='anna-activity')state.hold=performance.now()+1000;
  });
  $('play').onclick=()=>{state.paused=!state.paused;$('play').textContent=state.paused?'Play':'Pause';};
  document.querySelectorAll('[data-speed]').forEach(button=>button.onclick=()=>{state.speed=+button.dataset.speed;document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('on',b===button));});
  $('restart').onclick=()=>{try{localStorage.removeItem('migrai-product-demo-v1');localStorage.removeItem('migrai-product-demo-labels');}catch(_){}location.reload();};
  let last=performance.now();
  function frame(now){
    const dt=Math.max(0,Math.min(1,(now-last)/1000));last=now;
    if(state.ready&&!state.paused&&!state.pending&&now>=state.hold&&!state.ended){
      const next=Math.min(P.T_END-.02,P.S.t+dt*.6*state.speed),event=events.find(e=>!state.done.has(e.id)&&e.t>=P.S.t&&e.t<=next);
      P.S.t=event?event.t:next;sync();
      if(event){state.done.add(event.id);state.pending={key:event.id,question:event.question};send({type:'anna-question',...state.pending,time:clock(P.S.t)});$('demo-status').textContent='A question for Anna. Tap the notification in her app.';$('demo-status').classList.add('waiting');}
      if(P.S.t>=P.T_END-.02){state.ended=true;$('demo-status').textContent='Anna feels a migraine. Log it in her app.';}
    }
    const nowClock=clock(P.S.t);if(nowClock!==state.lastClock){state.lastClock=nowClock;send({type:'anna-clock',time:nowClock});}
    const i=P.dayOf(P.S.t);$('clock').textContent=clock(P.S.t);$('scene-day').textContent=P.DAYS[i].name+' '+P.DAYS[i].date+' Jun';
    P.scene.advance(dt,P.S.t);P.scene.render(P.S.t);requestAnimationFrame(frame);
  }
  function setup(){P.scene.init();drawData();$('mode').textContent=window.MODEL_LIVE?'Live inference':'Model forecasts';requestAnimationFrame(frame);send({type:'anna-init'});}
  if(document.readyState==='complete')setup();else addEventListener('load',setup,{once:true});
})();
