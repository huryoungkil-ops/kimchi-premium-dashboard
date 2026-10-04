const {L,day,iso,clean,signals,fundingSum,priceAt}=require('./lib.js');const fs=require('fs');
const D=clean(L('data/perp_LUNAUSDT_1d.json')).filter(k=>k[0]<Date.parse('2022-05-13'));
const H=clean(L('data/perp_LUNAUSDT_1h.json'));const F=L('data/funding_LUNAUSDT.json');
const S=signals(D);const out={};
// daily table Apr 1 - May 12
out.daily=[];for(let i=0;i<D.length;i++){if(D[i][0]<Date.parse('2022-03-25'))continue;const r=S[i];out.daily.push({d:iso(D[i][0]).slice(0,10),o:D[i][1],h:D[i][2],l:D[i][3],c:D[i][4],qvM:Math.round(D[i][6]/1e6),d20:!!r.d20,d55:!!r.d55,belowMA120:!!r.ma120,ma120:r.ma120v&&+r.ma120v.toFixed(2),atrx:!!r.atrx});}
const ath=Math.max(...D.map(k=>k[2]));const athBar=D.find(k=>k[2]===ath);
const athClose=Math.max(...D.map(k=>k[4]));
out.ath={high:ath,date:iso(athBar[0]).slice(0,10),maxClose:athClose,maxCloseDate:iso(D.find(k=>k[4]===athClose)[0]).slice(0,10)};
const SETTLE=0.008,SETT=Date.parse('2022-05-12T15:30Z');
// first signal dates since Apr 1 2022 (regime)
const first=(key,from)=>{for(let i=0;i<D.length;i++)if(D[i][0]>=from&&S[i][key])return i;return -1;};
const sig={};for(const k of ['d20','d55','ma120','atrx'])sig[k]=first(k,Date.parse('2022-04-01'));
// also first d20 on/after May 1
sig.d20_may=first('d20',Date.parse('2022-05-01'));sig.d55_may=first('d55',Date.parse('2022-05-01'));sig.atrx_may=first('atrx',Date.parse('2022-05-01'));
// last MA120 cross from above
let lastCross=-1;for(let i=121;i<D.length;i++)if(S[i].ma120&&!S[i-1].ma120)lastCross=i;sig.ma120_lastcross=lastCross;
// hourly breakout: hourly close < min daily low over prior 20/55 completed days
function hourlySig(n){for(const h of H){if(h[0]<Date.parse('2022-04-25'))continue;const di=D.findIndex(k=>k[0]+day>h[0]);if(di<n)continue;let m=Infinity;for(let j=di-n;j<di;j++)m=Math.min(m,D[j][3]);if(h[4]<m)return {t:h[0],close:h[4],level:m};}}
const h20=hourlySig(20),h55=hourlySig(55);
const ref={athClose,may5close:D.find(k=>iso(k[0]).startsWith('2022-05-05'))[4],may6close:D.find(k=>iso(k[0]).startsWith('2022-05-06'))[4]};
const frac=(p,peak)=>+(((peak-p)/(peak-SETTLE))*100).toFixed(1);
function trade(label,entryT,entryP,cost){const mae=Math.max(...H.filter(h=>h[0]>=entryT&&h[0]<SETT).map(h=>h[2]))/entryP-1;
 const fsum=fundingSum(F,entryT,SETT,H,entryP).sum;const gross=(entryP-SETTLE)/entryP;
 return {label,entryT:iso(entryT),entry:entryP,exit:'settle 0.008 @2022-05-12 15:30',gross:+(gross*100).toFixed(2),fundingPct:+(fsum*100).toFixed(3),costPct:cost*200,netPct:+((gross+fsum-2*cost)*100).toFixed(2),maxAdversePct:+(mae*100).toFixed(1),
  declineAlreadyDone_fromATHclose:frac(entryP,athClose),declineAlreadyDone_fromMay5:frac(entryP,ref.may5close)};}
const nextOpenD=i=>[D[i+1][0],D[i+1][1]];const nextOpenH=t=>{const h=H.find(h=>h[0]>t);return [h[0],h[1]];};
const T=[];
for(const [k,i] of Object.entries(sig)){if(i<0)continue;out['sig_'+k]={date:iso(D[i][0]).slice(0,10),close:D[i][4]};}
const mk=(label,[t,p],c)=>T.push(trade(label,t,p,c));
mk('daily D20 (first in May)',nextOpenD(sig.d20_may),0.003);
mk('daily D55 (first in May)',nextOpenD(sig.d55_may),0.003);
if(sig.ma120_lastcross>=0)mk('daily close<MA120 (last cross)',nextOpenD(sig.ma120_lastcross),0.002);
mk('daily ATR expansion (first in May)',nextOpenD(sig.atrx_may),0.01);
mk('hourly close < 20d low',nextOpenH(h20.t),0.005);
mk('hourly close < 55d low',nextOpenH(h55.t),0.005);
for(const t of ['2022-05-09T16:00Z','2022-05-10T00:00Z','2022-05-11T00:00Z','2022-05-11T12:00Z','2022-05-12T00:00Z']){const h=H.find(h=>h[0]===Date.parse(t));mk('late entry '+t,[h[0],h[1]],0.01);}
out.hourlySignals={h20:{...h20,t:iso(h20.t)},h55:{...h55,t:iso(h55.t)}};
out.trades=T;out.ref=ref;
// funding summary
out.funding=F.filter(x=>x[0]>=Date.parse('2022-04-25')).map(x=>[iso(x[0]),x[1]]);
// spot margin short: borrow stop 05-12 07:00, settlement 05-13 07:00
const SB=L('data/spot_LUNABUSD_1h.json');const ms=SB.find(k=>k[0]===Date.parse('2022-05-13T07:00Z'));
out.marginShort={borrowSuspended:'2022-05-12 07:00 UTC',forcedSettlement:'2022-05-13 07:00 UTC',LUNABUSD_0700_bar:ms.slice(1,5)};
// hourly UST
const U=L('data/spot_USTUSDT_1h.json');out.ustFirstBelow={};for(const th of [0.995,0.99,0.98,0.95,0.9,0.8,0.5]){const u=U.find(k=>k[3]<th);out.ustFirstBelow[th]=u?iso(u[0]):null;}
fs.writeFileSync('results_luna.json',JSON.stringify(out,null,1));
console.log(JSON.stringify({ath:out.ath,ref,sig:Object.fromEntries(Object.keys(sig).map(k=>[k,out['sig_'+k]])),hourly:out.hourlySignals,ust:out.ustFirstBelow,margin:out.marginShort},null,1));
console.table(T.map(t=>({l:t.label,t:t.entryT,e:t.entry,g:t.gross,f:t.fundingPct,n:t.netPct,mae:t.maxAdversePct,doneATH:t.declineAlreadyDone_fromATHclose,doneMay5:t.declineAlreadyDone_fromMay5})));
console.table(out.daily.filter(d=>d.d>='2022-04-20').map(d=>({d:d.d,c:d.c,ma120:d.ma120,d20:d.d20,d55:d.d55,ma:d.belowMA120,atr:d.atrx})));
