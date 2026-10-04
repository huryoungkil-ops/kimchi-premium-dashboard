const {prep}=require('./data_prep');const {run}=require('./lib');const St=require('./strategies');
const D=prep();const r=run(D,St.turtle(),{});
const T=r.trades;const s=[...T].sort((a,b)=>a.pnlPctOfEq-b.pnlPctOfEq);
const f=t=>[t.sym,t.entryDate,t.exitDate,t.reason,t.units,(t.ret*100).toFixed(1)+'%',(t.pnlPctOfEq*100).toFixed(2)+'%eq','N0 '+t.notional0.toFixed(3),'mae '+(t.mae*100).toFixed(0)+'%'].join(' ');
console.log('WORST');s.slice(0,8).forEach(t=>console.log(f(t)));console.log('BEST');s.slice(-8).forEach(t=>console.log(f(t)));
for(const y of ['LUNAUSDT','FTTUSDT','SRMUSDT','OMUSDT','WAVESUSDT'])T.filter(t=>t.sym===y).forEach(t=>console.log(f(t)));
// equity path at some dates
for(const d of ['2020-03-31','2020-12-31','2021-06-30','2021-12-31','2022-06-30','2022-12-31','2023-12-31','2024-12-31','2025-12-31','2026-10-04'])console.log(d,r.eq[D.dates.indexOf(d)].toFixed(3));
