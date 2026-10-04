const {prep,btcLong}=require('./data_prep');const {run,metrics}=require('./lib');const St=require('./strategies');
console.time('load');const D=prep();console.timeEnd('load');console.log(D.coverage.withBars,D.coverage.api,D.coverage.vision,D.coverage.none,D.coverage.excluded);
for(const s of [St.turtle(),St.trendB(),St.crashC(),St.relD()]){console.time(s.name);const r=run(D,s,{});console.timeEnd(s.name);
const m=metrics(r.eq,D.dates,'2019-09-08','2026-10-04',r.trades);console.log(JSON.stringify(m),'liq',r.liqCount,'delist',r.delistCount,'fund',r.fundingTot.toFixed(3),'fee',r.feeTot.toFixed(3));}
const b=btcLong(D);console.log(JSON.stringify(metrics(b.eq,D.dates,'2019-09-08','2026-10-04')));
