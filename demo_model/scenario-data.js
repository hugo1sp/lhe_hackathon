// Actual model data. Only the character animation and event times are illustrative.
window.P = {};
(() => {
  const P=window.P;
  P.START=169;
  P.DAYS=ANNA_SOURCE.days.slice(P.START,P.START+3).map(d=>({...d,name:new Date(d.date+'T12:00').toLocaleDateString('en',{weekday:'short'}),iso:d.date,date:Number(d.date.slice(-2))}));
  P.T_END=63;P.S={t:20.5};
  P.dayOf=t=>Math.max(0,Math.min(2,Math.floor(t/24)));
  P.WAKE=P.DAYS.map(d=>d.mid+d.sleep/2);
  P.NIGHTS=P.DAYS.map((d,i)=>({start:i*24+P.WAKE[i]-d.sleep,end:i*24+P.WAKE[i]}));
  P.asleep=t=>P.NIGHTS.some(n=>t>=n.start&&t<n.end);
  const attack=P.DAYS.findIndex(d=>d.mig===1);
  P.ATTACK={start:attack<0?Infinity:attack*24+14+50/60,end:attack<0?Infinity:attack*24+19};
  P.inAttack=t=>t>=P.ATTACK.start&&t<P.ATTACK.end;
})();
