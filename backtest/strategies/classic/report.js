const fs=require('fs');const L=require('./lib.js');const{IS,OOS,FULL,stats,tstats,yearly,monthlyEq,corr}=L;
const{R,uniLog}=require('./run.js');
const CANON=['turtle_s1_BTC_LO','turtle_s2_PORT_LO','turtle_s2_PORT_LS','tsmom_BTC_LO_90_30','tsmom_PORT_LS_90_30','sma200_BTC','cross50_200_BTC','faber10_BTC','lwvb_k0.5_ma5','lwvb_knoise','dthrust_BTC_LS_N4_k0.5','rsi2_BTC_1d_e10','rsi2_BTC_4h_e10','bb_rev_BTC_4h_LO','bb_bo_BTC_4h_LO','dualmom_365','xsmom_28','season_weekend'];
const BENCH={BTC:'bh_btc',ETH:'bh_eth',PORT:'bh_ew_top10','KRW-BTC':'bh_upbit_btc','BTC/ETH':'bh_btc',PERPS:'bh_btc'};
const rnd=(o,d=4)=>JSON.parse(JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toFixed(d):v));
const out={meta:{generated:'2026-10-03',data:'Binance spot 1d/4h/1h (2017-08-17..2026-09-30), Binance USDT-M perp 1d + actual funding history, Upbit KRW-BTC 1d/60m (2017-09-25..2026-09-30)',
 periods:{IS,OOS},annualization:'365 days, rf=0, daily (UTC) returns; Sharpe=mean/sd*sqrt(365)',
 costs:{spot:'0.10% fee + 0.05% slippage per side',perp:'0.05% fee + 0.05% slippage per side + actual Binance funding (0 before the coin\'s perp listing)',upbit:'0.05% fee + 0.05% slippage per side'},
 execution:'signals on bar close, fills at next bar open; LW VB / Dual Thrust use stop-level fills found on 1h bars (max(level, hour open)) and exit at next 00:00 UTC open',
 universe:'PIT top-10 by trailing-60d Binance USDT spot quote volume, re-ranked quarterly from a 31-coin candidate list chosen today (includes dead/delisted LUNA, FTT, BCC, VEN, BCHABC, EOS, MATIC) -> residual survivorship bias. Market-cap ranks not available from allowed APIs.',
 universeLog:uniLog,hourMeansIS:R._hourMeansIS},strategies:{},grids:{},corr:{},combo:{}};
for(const[k,v]of Object.entries(R)){if(k.startsWith('_'))continue;const rows=v.res.rows;const tr=v.res.trades||[];
 const s={family:v.family,desc:v.desc,params:v.params||null,asset:v.asset,canonical:CANON.includes(k),gridOnly:!!v.grid,
  full:stats(rows,...FULL),is:stats(rows,...IS),oos:stats(rows,...OOS),trades:{full:tstats(tr,...FULL),is:tstats(tr,...IS),oos:tstats(tr,...OOS)},yearly:yearly(rows)};
 const b=BENCH[v.asset];if(b&&k!==b&&v.family!=='benchmark'){const br=R[b].res.rows;s.bench={name:b,is:s.is?stats(br,s.is.from,s.is.to):null,oos:s.oos?stats(br,s.oos.from,s.oos.to):null};}
 if(v.missingDays!==undefined)s.missingIntradayDays=v.missingDays;
 out.strategies[k]=s;}
// grids per family: IS vs OOS sharpe, rank correlation
const fam={};for(const[k,s]of Object.entries(out.strategies)){if(s.family==='benchmark'||!s.is||!s.oos)continue;(fam[s.family]=fam[s.family]||[]).push([k,s.is.sharpe,s.oos.sharpe,s.is.cagr,s.oos.cagr]);}
const rank=a=>{const idx=a.map((x,i)=>[x,i]).sort((x,y)=>x[0]-y[0]);const r=new Array(a.length);idx.forEach(([_,i],j)=>r[i]=j);return r;};
for(const[f,arr]of Object.entries(fam)){const rc=arr.length>2?corr(rank(arr.map(x=>x[1])),rank(arr.map(x=>x[2]))):null;const best=arr.reduce((a,b)=>b[1]>a[1]?b:a);const oosSorted=[...arr].sort((a,b)=>b[2]-a[2]);
 out.grids[f]={variants:arr.map(x=>({name:x[0],isSharpe:x[1],oosSharpe:x[2],isCagr:x[3],oosCagr:x[4]})),spearmanIS_OOS:rc,isBest:best[0],isBestOOSRank:oosSorted.findIndex(x=>x[0]===best[0])+1,n:arr.length,fracOOSSharpePositive:arr.filter(x=>x[2]>0).length/arr.length};}
// correlation matrices
const names=[...CANON,'bh_btc'];const mp={};for(const n of names){mp[n]=new Map(R[n].res.rows.map(x=>[x.d,x.r]));}
function cm(from,to){const M={};for(const a of names){M[a]={};for(const b of names){const xs=[],ys=[];for(const[d,r]of mp[a]){if(d<from||d>to)continue;const r2=mp[b].get(d);if(r2===undefined)continue;xs.push(r);ys.push(r2);}M[a][b]=xs.length>60?corr(xs,ys):null;}}return M;}
out.corr.full=cm(...FULL);out.corr.is=cm(...IS);out.corr.oos=cm(...OOS);
// combination: select on IS (Sharpe desc, pairwise IS corr<0.5, IS days>=365), evaluate OOS with inverse-vol (90d) monthly weights
const cand=CANON.filter(n=>out.strategies[n].is&&out.strategies[n].is.days>=365).sort((a,b)=>out.strategies[b].is.sharpe-out.strategies[a].is.sharpe);
const pick=[];for(const n of cand){if(pick.length>=4)break;if(out.strategies[n].is.sharpe<=0)continue;if(pick.every(p=>Math.abs(out.corr.is[n][p])<0.5))pick.push(n);}
function combo(sel,from,to,mode){const days=[...mp.bh_btc.keys()].filter(d=>d>=from&&d<=to);let w=null,mon=null;const rows=[];
 const hist=sel.map(n=>[...mp[n].entries()]);
 for(const d of days){const m=d.slice(0,7);if(m!==mon){mon=m;if(mode==='ew')w=sel.map(()=>1/sel.length);else{const iv=sel.map(n=>{const arr=[];for(const[dd,r]of mp[n]){if(dd<d)arr.push(r);}const a=arr.slice(-90);const mu=a.reduce((x,y)=>x+y,0)/a.length;const sd=Math.sqrt(a.reduce((x,y)=>x+(y-mu)**2,0)/a.length)||1e-9;return 1/sd;});const s=iv.reduce((a,b)=>a+b);w=iv.map(x=>x/s);}}
  let r=0;sel.forEach((n,i)=>{const x=mp[n].get(d);if(x!==undefined)r+=w[i]*x;});rows.push({d,r});}return rows;}
const cOOS=combo(pick,...OOS,'invvol'),cOOSew=combo(pick,...OOS,'ew'),cIS=combo(pick,...IS,'invvol');
out.combo={selectionRule:'IS (to 2021-12-31) Sharpe ranking among canonical strategies, greedy, require |IS corr|<0.5 to every already-picked one, max 4; weights = inverse trailing-90d vol, monthly; no extra cost for re-weighting',picked:pick,
 is_invvol:stats(cIS,...IS),oos_invvol:stats(cOOS,...OOS),oos_equalweight:stats(cOOSew,...OOS),btc_oos:stats(R.bh_btc.res.rows,...OOS),yearly_oos:yearly(cOOS),monthlyEquityOOS:monthlyEq(cOOS)};
// hindsight contrast: best 4 by OOS (not tradable)
const candO=CANON.filter(n=>out.strategies[n].oos).sort((a,b)=>out.strategies[b].oos.sharpe-out.strategies[a].oos.sharpe);out.combo.hindsightTop4ByOOS=candO.slice(0,4);
fs.writeFileSync('results.json',JSON.stringify(rnd(out),null,1));
// yearly CSV (all strategies)
const years=['2017','2018','2019','2020','2021','2022','2023','2024','2025','2026'];
let csv='strategy,family,canonical,'+years.join(',')+',IS_CAGR,IS_Sharpe,OOS_CAGR,OOS_Sharpe\n';
for(const[k,s]of Object.entries(out.strategies))csv+=[k,s.family,s.canonical?1:0,...years.map(y=>s.yearly[y]==null?'':(s.yearly[y]*100).toFixed(1)),s.is?(s.is.cagr*100).toFixed(1):'',s.is?s.is.sharpe.toFixed(2):'',s.oos?(s.oos.cagr*100).toFixed(1):'',s.oos?s.oos.sharpe.toFixed(2):''].join(',')+'\n';
csv+=['COMBO_OOS_invvol','combo',1,...years.map(y=>out.combo.yearly_oos[y]==null?'':(out.combo.yearly_oos[y]*100).toFixed(1)),'','','',''].join(',')+'\n';
fs.writeFileSync('yearly_returns.csv',csv);
// monthly equity CSV (canonical + benchmarks), each rebased to 1 at its own start
const eqn=[...CANON,'bh_btc','bh_eth','bh_ew_top10','bh_upbit_btc'];const months=new Set();const me={};for(const n of eqn){me[n]=monthlyEq(R[n].res.rows);Object.keys(me[n]).forEach(m=>months.add(m));}
const ms=[...months].sort();let ec='month,'+eqn.join(',')+',combo_oos\n';for(const m of ms)ec+=m+','+eqn.map(n=>me[n][m]==null?'':me[n][m].toFixed(4)).join(',')+','+(out.combo.monthlyEquityOOS[m]==null?'':out.combo.monthlyEquityOOS[m].toFixed(4))+'\n';
fs.writeFileSync('equity_monthly.csv',ec);
// also OOS-rebased monthly equity for canonical (2022-01=1)
let eo='month,'+eqn.join(',')+',combo_oos\n';const meo={};for(const n of eqn)meo[n]=monthlyEq(R[n].res.rows.filter(x=>x.d>=OOS[0]));const mso=ms.filter(m=>m>='2022-01');for(const m of mso)eo+=m+','+eqn.map(n=>meo[n][m]==null?'':meo[n][m].toFixed(4)).join(',')+','+(out.combo.monthlyEquityOOS[m]==null?'':out.combo.monthlyEquityOOS[m].toFixed(4))+'\n';
fs.writeFileSync('equity_monthly_oos.csv',eo);
console.log('picked',pick,JSON.stringify(rnd({is:out.combo.is_invvol,oos:out.combo.oos_invvol,ew:out.combo.oos_equalweight,btc:out.combo.btc_oos},3)));
console.log('hindsight',out.combo.hindsightTop4ByOOS);
