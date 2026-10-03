// 전체 실험 실행 → results.json, yearly CSV
const fs=require('fs');const {loadUniverse,run,metrics,yearly,concentration}=require('./lib');
const which=process.argv[2]||'binance';
const r4=x=>x==null?null:Math.round(x*10000)/10000;
const STABLE_UP=['KRW-USDT','KRW-USDC','KRW-PYUSD','KRW-USD1','KRW-USDE','KRW-USDS','KRW-DAI','KRW-TUSD','KRW-USDG','KRW-RLUSD','KRW-PAXG','KRW-XAUT'];
const STABLE_BN=['XAUTUSDT','PAXGUSDT','SPCXBUSDT','CRCLBUSDT','SNDKBUSDT','USDCUSDT','FDUSDUSDT','TUSDUSDT','BUSDUSDT','USDPUSDT','EURUSDT','AEURUSDT'];
const cfg=which==='upbit'?{btc:'KRW-BTC',excl:new Set(STABLE_UP),minTurn:1e9,costs:[0.0015,0.0025,0.0035],baseCost:0.0025,costBtc:0.0005+0.0005,start:'2018-03-01'}
                        :{btc:'BTCUSDT',excl:new Set(STABLE_BN),minTurn:5e6,costs:[0.001,0.002],baseCost:0.001,costBtc:0.001,start:'2018-03-01'};
const U=loadUniverse(which);
if(which==='binanceall'){ // 2026-06 이후 상장된 토큰화 주식/ETF(…BUSDT) 제외
  for(const [sym,C] of Object.entries(U.coins)){if(/BUSDT$/.test(sym)&&U.dates[C.first]>='2026-06-01')cfg.excl.add(sym.split('#')[0]);}
  console.log('excluded',cfg.excl.size);}
const base={btc:cfg.btc,excl:cfg.excl,N:3,L:7,H:7,wd:1,lag:0,minTurn:cfg.minTurn,minAge:30,mkt:50,posOnly:false,side:'top',cost:cfg.baseCost,costBtc:cfg.costBtc,start:cfg.start};
const IS_END='2021-12-31',OOS_START='2022-01-01';
function summarize(name,p){const R=run(U,p);const yrs=R.eq.length/365;
  const g=run(U,{...p,cost:0,costBtc:0});const mg=metrics(g.eq,g.periods);
  const m=metrics(R.eq,R.periods);
  return {name,params:{N:p.N,L:p.L,H:p.H,wd:p.wd,lag:p.lag,mkt:p.mkt,posOnly:p.posOnly,side:p.side,topK:p.topK||null,minTurn:p.minTurn,cost:p.cost},
    full:rnd(m),is:rnd(metrics(R.eq,R.periods,null,IS_END)),oos:rnd(metrics(R.eq,R.periods,OOS_START,null)),
    grossCagr:r4(mg.cagr),costDragCagr:r4(mg.cagr-m.cagr),annTurnover:r4(R.totTurn/yrs),
    yearly:Object.fromEntries(Object.entries(yearly(R.eq)).map(([k,v])=>[k,r4(v)])),concentration:conc(R.periods)};}
function rnd(m){if(!m)return null;const o={};for(const [k,v] of Object.entries(m))o[k]=typeof v==='number'?r4(v):v;return o;}
function conc(P){const c=concentration(P,5);return {topK:c.topK,top5LogShare:r4(c.topKLogShare),multipleTotal:r4(c.multipleTotal),multipleWithoutTop5:r4(c.multipleWithoutTopK)};}
const out={universe:which,generated:new Date().toISOString(),dataEnd:U.dates[U.n-1],nSymbols:Object.keys(U.coins).length,runs:[]};
const add=(name,p)=>{const s=summarize(name,p);out.runs.push(s);const f=s.full,o=s.oos;console.log(name.padEnd(42),'CAGR',(f.cagr*100).toFixed(1),'Shp',f.sharpe.toFixed(2),'MDD',(f.mdd*100).toFixed(0),'| OOS CAGR',o?(o.cagr*100).toFixed(1):'-','Shp',o?o.sharpe.toFixed(2):'-','MDD',o?(o.mdd*100).toFixed(0):'-');};
// 벤치마크
add('BENCH BTC 보유',{...base,only:[cfg.btc],side:'all',N:1,mkt:0,minTurn:0,minAge:0,H:7,cost:0,costBtc:0});
add('BENCH BTC + SMA50 필터',{...base,only:[cfg.btc],side:'top',N:1,minTurn:0,cost:cfg.costBtc});
add('BENCH BTC + SMA120 필터',{...base,only:[cfg.btc],side:'top',N:1,minTurn:0,mkt:120,cost:cfg.costBtc});
add('BENCH 동일가중 유니버스(필터없음)',{...base,side:'all',mkt:0});
add('BENCH 동일가중 유니버스 + SMA50',{...base,side:'all'});
// 메인: Top N, 필터 on
for(const N of [1,3,5])add(`MOM top${N} L7 H7 SMA50 월`,{...base,N});
for(const N of [1,3,5])add(`MOM top${N} L7 H7 필터없음`,{...base,N,mkt:0});
for(const N of [1,3,5])add(`REV bottom${N} L7 H7 SMA50`,{...base,N,side:'bottom'});
for(const N of [1,3,5])add(`REV bottom${N} L7 H7 필터없음`,{...base,N,side:'bottom',mkt:0});
// 강환국 원형 근사: 거래대금 상위20(시총 대용), BTC>SMA120, 양(+)수익만, top3, 1주
add('KANG 원형근사 top20유동성 SMA120 양수만 top3',{...base,N:3,topK:20,mkt:120,posOnly:true});
add('KANG 원형근사 + 20주(140일)MA',{...base,N:3,topK:20,mkt:140,posOnly:true});
add('KANG 원형근사 필터없음(시장필터X)',{...base,N:3,topK:20,mkt:0,posOnly:true});
// 시장필터 변형
add('MOM top3 SMA120',{...base,mkt:120});add('MOM top3 SMA140(20주)',{...base,mkt:140});
// 체결 지연 1일
add('MOM top3 SMA50 체결1일지연',{...base,lag:1});
// 비용 민감도
for(const c of cfg.costs)add(`MOM top3 SMA50 비용${(c*100).toFixed(2)}%/편도`,{...base,cost:c});
// 요일 강건성
const WD=['일','월','화','수','목','금','토'];
for(let wd=0;wd<7;wd++)add(`MOM top3 SMA50 리밸 ${WD[wd]}`,{...base,wd});
for(let wd=0;wd<7;wd++)add(`KANG 원형근사 리밸 ${WD[wd]}`,{...base,wd,N:3,topK:20,mkt:120,posOnly:true});
// 룩백/보유 그리드
for(const L of [3,7,14,28])for(const H of [7,14])for(const side of ['top','bottom'])add(`GRID ${side} N3 L${L} H${H} SMA50`,{...base,L,H,side});

// 요일 분산(7개 트랜치, 각 1/7 자본, 요일별 리밸런싱) — 리밸런싱 요일 운(運) 제거
function stagger(name,p){const eqs=[];const stats=[];for(let wd=0;wd<7;wd++){const R=run(U,{...p,wd});eqs.push(new Map(R.eq));const m=metrics(R.eq,R.periods),mo=metrics(R.eq,R.periods,OOS_START,null);stats.push({wd,cagr:r4(m.cagr),sharpe:r4(m.sharpe),mdd:r4(m.mdd),oosCagr:r4(mo.cagr),oosSharpe:r4(mo.sharpe)});}
  const starts=eqs.map(m=>[...m.keys()][0]).sort();const st=starts[6];const dates=[...eqs[0].keys()].filter(d=>d>=st&&eqs.every(m=>m.has(d)));
  const b=eqs.map(m=>m.get(dates[0]));const eq=dates.map(d=>[d,eqs.reduce((a,m,i)=>a+m.get(d)/b[i],0)/7]);
  const med=a=>{const x=[...a].sort((p,q)=>p-q);return x[3];};
  const res={name,stagger:true,full:rnd(metrics(eq,null)),is:rnd(metrics(eq,null,null,IS_END)),oos:rnd(metrics(eq,null,OOS_START,null)),
    yearly:Object.fromEntries(Object.entries(yearly(eq.map(([d,v])=>[d,v/eq[0][1]]))).map(([k,v])=>[k,r4(v)])),byWeekday:stats,
    weekdayRange:{cagrMin:Math.min(...stats.map(x=>x.cagr)),cagrMed:med(stats.map(x=>x.cagr)),cagrMax:Math.max(...stats.map(x=>x.cagr)),oosCagrMin:Math.min(...stats.map(x=>x.oosCagr)),oosCagrMed:med(stats.map(x=>x.oosCagr)),oosCagrMax:Math.max(...stats.map(x=>x.oosCagr))}};
  out.runs.push(res);const f=res.full,o=res.oos;console.log(('STAG '+name).padEnd(42),'CAGR',(f.cagr*100).toFixed(1),'Shp',f.sharpe.toFixed(2),'MDD',(f.mdd*100).toFixed(0),'| OOS CAGR',(o.cagr*100).toFixed(1),'Shp',o.sharpe.toFixed(2),'MDD',(o.mdd*100).toFixed(0),' wd CAGR',res.weekdayRange.cagrMin,res.weekdayRange.cagrMed,res.weekdayRange.cagrMax);}
stagger('BTC + SMA50',{...base,only:[cfg.btc],N:1,minTurn:0,cost:cfg.costBtc});
stagger('BTC + SMA120',{...base,only:[cfg.btc],N:1,minTurn:0,mkt:120,cost:cfg.costBtc});
stagger('EW 유니버스 + SMA50',{...base,side:'all'});
for(const N of [1,3,5])stagger(`MOM top${N} L7 H7 SMA50`,{...base,N});
stagger('MOM top3 L7 H7 필터없음',{...base,mkt:0});
stagger('KANG 원형근사(top20유동성,SMA120,양수만,top3)',{...base,N:3,topK:20,mkt:120,posOnly:true});
stagger('KANG 원형근사 체결1일지연',{...base,N:3,topK:20,mkt:120,posOnly:true,lag:1});
stagger('MOM top3 SMA50 체결1일지연',{...base,lag:1});
for(const N of [1,3,5])stagger(`REV bottom${N} L7 H7 SMA50`,{...base,N,side:'bottom'});
for(const L of [3,7,14,28])for(const H of [7,14])stagger(`GRID top N3 L${L} H${H} SMA50`,{...base,L,H});
for(const c of cfg.costs)stagger(`MOM top3 SMA50 비용${(c*100).toFixed(2)}%`,{...base,cost:c});

fs.writeFileSync(`results_${which}.json`,JSON.stringify(out,null,1));
// 연도별 CSV
const yrs=[...new Set(out.runs.flatMap(r=>Object.keys(r.yearly)))].sort();
const csv=['run,'+yrs.join(',')+',CAGR,Sharpe,MDD,OOS_CAGR,OOS_Sharpe,OOS_MDD'].concat(out.runs.map(r=>`"${r.name}",`+yrs.map(y=>r.yearly[y]??'').join(',')+`,${r.full.cagr},${r.full.sharpe},${r.full.mdd},${r.oos?.cagr},${r.oos?.sharpe},${r.oos?.mdd}`));
fs.writeFileSync(`yearly_${which}.csv`,'﻿'+csv.join('\n'));
