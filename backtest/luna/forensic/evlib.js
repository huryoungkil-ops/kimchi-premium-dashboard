const {L,day,iso,clean,signals,simShort}=require('./lib.js');
function analyze(b,E,{fund=null,endT=null,cost=0.003,W=90,T=60}={}){
  b=clean(b);const S=signals(b);
  const idxE=b.findIndex(k=>k[0]>=E);if(idxE<0)return {err:'no data at event'};
  let pi=-1;for(let i=0;i<b.length;i++){if(b[i][0]<E-W*day||b[i][0]>E+5*day)continue;if(pi<0||b[i][4]>b[pi][4])pi=i;}
  const peak=b[pi][4];let ti=pi;for(let i=pi;i<b.length&&b[i][0]<=b[pi][0]+T*day;i++)if(b[i][3]<b[ti][3])ti=i;
  const trough=b[ti][3];
  const firstClose=f=>{for(let i=pi;i<b.length&&i<=ti+5;i++)if(b[i][4]<=f*peak)return iso(b[i][0]).slice(0,10);return null;};
  let sq=0;for(let i=ti;i<b.length&&b[i][0]<=b[ti][0]+30*day;i++)sq=Math.max(sq,b[i][2]/trough-1);
  const r={peakDate:iso(b[pi][0]).slice(0,10),peakClose:peak,troughDate:iso(b[ti][0]).slice(0,10),troughLow:trough,dropPct:+((1-trough/peak)*100).toFixed(1),
    daysPeakToTrough:Math.round((b[ti][0]-b[pi][0])/day),firstClose50:firstClose(0.5),firstClose20:firstClose(0.2),barsBeforePeak:pi,
    reboundFromTrough30dPct:+(sq*100).toFixed(0),signals:{}};
  r.belowMA120AtPeak=S[pi].ma120===undefined?'n/a(<120d)':S[pi].ma120;
  for(const k of ['d20','d55','ma120','atrx']){let si=-1;for(let i=pi+1;i<=ti&&i<b.length;i++)if(S[i][k]){si=i;break;}
    if(si<0||si+1>=b.length){r.signals[k]=null;continue;}
    const tr=simShort(b,si,{fund,endT,cost});const entry=b[si+1][1];
    r.signals[k]={date:iso(b[si][0]).slice(0,10),close:b[si][4],entry,dropDonePct:+(((peak-entry)/(peak-trough))*100).toFixed(1),remainingToTroughPct:+((1-trough/entry)*100).toFixed(1),trade:tr};}
  // system: repeated D20 entries from peak until trough+30d, flat between Donchian10 exits
  const sys=[];let i=pi+1;const lim=b.findIndex(k=>k[0]>b[ti][0]+30*day);const end=lim<0?b.length-1:lim;
  while(i<end){if(S[i].d20){const t=simShort(b,i,{fund,endT,cost});if(!t)break;sys.push(t);const xi=b.findIndex(k=>iso(k[0])>=t.exitT);i=xi<0?b.length:Math.max(xi,i+1);if(t.why==='delist')break;}else i++;}
  r.systemD20={trades:sys.length,sumNet:+sys.reduce((a,t)=>a+t.net,0).toFixed(4),list:sys.map(t=>[t.entryT.slice(0,10),t.entry,t.exitT.slice(0,10),t.exit,t.net,t.mae])};
  return r;}
module.exports={analyze};
