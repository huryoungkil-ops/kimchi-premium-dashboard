import fs from 'fs';
import { bt, stats } from './backtest.mjs';
const L=n=>JSON.parse(fs.readFileSync(`data/${n}.json`));
const R=JSON.parse(fs.readFileSync('bt_raw.json'));
for (const k of ['A1_PAXGspot_vs_BNperpXAU','A2_PAXGspot_vs_GCF_1h','A4a_PAXG_BN_vs_XAUT_BFX','A4b_PAXG_BN_vs_XAUT_OKX','A4d_PAXGperp_vs_XAUTperp_BN']) {
  const s=R.series[k]; console.log(k,'open',JSON.stringify(s.statsTradFiOpen),'closed',JSON.stringify(s.statsTradFiClosed));
  for (const c of ['W72_cost0.20','W480_cost0.20','W72_cost0.10','W72_gross']) { const r=s.results[c]; console.log('  ',c,JSON.stringify(r.byYear),'closedSig',JSON.stringify(r.signalWhenTradFiClosed),'openSig',JSON.stringify(r.signalWhenTradFiOpen)); }
}
// liquidity filter: require both legs quote volume >= V in that hour
const out={};
for (const [a,b,name] of [['bn_spot_PAXG','okx_XAUT','A4b'],['bn_spot_PAXG','bfx_XAUT_UST','A4a']]) {
  const A=L(a), B=new Map(L(b).map(r=>[r[0],r]));
  for (const V of [0,20000,100000,500000]) {
    const rows=[]; for (const r of A){const q=B.get(r[0]); if(q&&r[2]>=V&&q[2]>=V) rows.push({t:r[0],x:r[1]/q[1]-1});}
    if(rows.length<500){console.log(name,V,'rows',rows.length);continue;}
    const g=bt(rows,{W:72,rtCost:0}), c=bt(rows,{W:72,rtCost:0.002}), w=bt(rows,{W:480,rtCost:0.002});
    out[`${name}_minVol${V}`]={rows:rows.length,period:g.period,gross:{n:g.trades,avg:g.avgGrossPct,ann:g.annNetPct},cost020:{ann:c.annNetPct,sharpe:c.sharpe,mdd:c.mddPct},W480cost020:{n:w.trades,ann:w.annNetPct,sharpe:w.sharpe,byYear:w.byYear}};
    console.log(name,V,JSON.stringify(out[`${name}_minVol${V}`]));
  }
}
fs.writeFileSync('bt_liquidity_filter.json',JSON.stringify(out,null,1));
