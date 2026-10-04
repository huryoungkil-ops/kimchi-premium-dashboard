const {L,iso,day,clean,signals,simShort}=require('./lib.js');const fs=require('fs');
const U=L('data/scan/universe.json');const START=Date.parse('2023-01-01');
const eps=[];const base={n:0,hit50:0,hit80:0,pnl:[],mae:[]};
for(const [sym,status] of U){const f=`data/scan/${sym}.json`;if(!fs.existsSync(f))continue;let b=L(f);if(!Array.isArray(b))continue;b=clean(b);if(b.length<40)continue;
 const S=signals(b);
 // base rate of D20 signals (fresh: no d20 in prior 20 bars), 2023+
 let last=-99;for(let i=20;i<b.length-1;i++){if(!S[i].d20)continue;const fresh=i-last>20;last=i;if(!fresh||b[i][0]<START||b[i][6]<2e6)continue;
   let mn=Infinity;for(let j=i+1;j<b.length&&j<=i+60;j++)mn=Math.min(mn,b[j][3]);const e=b[i+1][1];base.n++;if(mn<=0.5*e)base.hit50++;if(mn<=0.2*e)base.hit80++;
   const t=simShort(b,i,{cost:0.003});if(t){base.pnl.push(t.net);base.mae.push(t.mae);}}
 // collapse episodes
 for(let i=1;i<b.length;i++){if(b[i][0]<START)continue;let pi=i;for(let j=Math.max(0,i-30);j<=i;j++)if(b[j][4]>b[pi][4])pi=j;
  if(b[i][4]>0.2*b[pi][4])continue;if(b[pi][6]<5e6){continue;}
  let ti=i;for(let j=i;j<b.length&&j<=pi+60;j++)if(b[j][3]<b[ti][3])ti=j;
  let maxDay=0;for(let j=pi+1;j<=i;j++)maxDay=Math.max(maxDay,1-b[j][3]/b[j-1][4]);
  const ep={sym,status,peak:iso(b[pi][0]).slice(0,10),peakClose:b[pi][4],peakQVM:Math.round(b[pi][6]/1e6),ageAtPeakDays:pi,crash80:iso(b[i][0]).slice(0,10),daysTo80:i-pi,trough:b[ti][3],troughDate:iso(b[ti][0]).slice(0,10),dropPct:+((1-b[ti][3]/b[pi][4])*100).toFixed(1),maxIntraDayFromPrevClose:+(maxDay*100).toFixed(1)};
  for(const k of ['d20','ma120']){let si=-1;for(let j=pi+1;j<=i;j++)if(S[j][k]){si=j;break;}
   if(si<0||si+1>=b.length){ep[k]=null;continue;}const e=b[si+1][1];const t=simShort(b,si,{cost:0.003});
   ep[k]={date:iso(b[si][0]).slice(0,10),dropDonePct:+(((b[pi][4]-e)/(b[pi][4]-b[ti][3]))*100).toFixed(1),net:t&&t.net,mae:t&&t.mae,exit:t&&t.why};}
  let sq=0;for(let j=ti;j<b.length&&j<=ti+30;j++)sq=Math.max(sq,b[j][2]/b[ti][3]-1);ep.rebound30dPct=Math.round(sq*100);
  eps.push(ep);i=pi+120;}
}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[s.length>>1]:null;};const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
const baseSum={signals:base.n,pctFollowedBy50drop60d:+(100*base.hit50/base.n).toFixed(2),pctFollowedBy80drop60d:+(100*base.hit80/base.n).toFixed(2),meanNetPnlPct:+(100*avg(base.pnl)).toFixed(2),medianNetPnlPct:+(100*med(base.pnl)).toFixed(2),winRate:+(100*base.pnl.filter(x=>x>0).length/base.pnl.length).toFixed(1),medianMAEpct:+(100*med(base.mae)).toFixed(1),p90MAEpct:+(100*[...base.mae].sort((a,b)=>a-b)[Math.floor(base.mae.length*0.9)]).toFixed(1)};
fs.writeFileSync('results_scan.json',JSON.stringify({note:'Binance USDT-M perps (TRADING+SETTLING listed in exchangeInfo), daily, 2023-01-01..2026-10-04; episode = close <=20% of max close within prior 30 bars, peak bar quote vol>=5M USDT; d20 = close < prior-20-bar low; P&L: short next open, exit close>10-bar high or 60 bars, cost 0.3%/side, funding excluded',baseRateD20:baseSum,episodes:eps},null,1));
console.log(baseSum);console.log('episodes',eps.length);
const w=eps.filter(e=>e.d20);console.log('with d20 before -80%:',w.length,'median dropDone',med(w.map(e=>e.d20.dropDonePct)),'median net',med(w.map(e=>e.d20.net)),'mean net',avg(w.map(e=>e.d20.net)).toFixed(3));
console.log('daysTo80 median',med(eps.map(e=>e.daysTo80)),'share <=3d',(eps.filter(e=>e.daysTo80<=3).length/eps.length).toFixed(2),'young(<60d) share',(eps.filter(e=>e.ageAtPeakDays<60).length/eps.length).toFixed(2));
console.table(eps.map(e=>({s:e.sym,pk:e.peak,age:e.ageAtPeakDays,qv:e.peakQVM,d80:e.daysTo80,drop:e.dropPct,maxDay:e.maxIntraDayFromPrevClose,d20:e.d20?e.d20.date:'-',done:e.d20?e.d20.dropDonePct:'-',net:e.d20?e.d20.net:'-',mae:e.d20?e.d20.mae:'-',reb:e.rebound30dPct})));
