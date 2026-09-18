// 종합 검토 ①: 실제 거래 구간에서의 청산 위험과 평가손익 낙폭
const fs=require('fs'), path=require('path');
const lib=require('./lib5m');
const Y=6;
const ready=lib.COINS.filter(c=>
  fs.existsSync(path.join(lib.CACHE_DIR,`upbit_${c[0]}_${Y}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR,`okx_${c[0]}_${Y}y.json`)));
lib.COINS.length=0; for(const c of ready) lib.COINS.push(c);

const P={ENTRY_SIGMA:1,EDGE_MULTIPLE:5,EXIT_SIGMA_OFFSET:0.5,
         SOFT_HOLD_DAYS:2,SOFT_EXIT_LOSS_PP:0.5,MAX_HOLD_DAYS:5,STOP_LOSS_PP:999};

(async()=>{
 const ds=await lib.buildDataset({yearsBack:Y,log:()=>{}});
 const r=lib.simulate(ds,P,{fromRatio:0,toRatio:1});
 console.log(`기준 설정: ${r.totalTrades}건 · 승률 ${r.winRate}% · 연 ${r.annualizedPct}% · 실현MDD $${r.maxDrawdown}`);

 // --- OKX 원본 가격 로드 (청산 위험 계산용) ---
 const px={};
 for(const [name] of ready){
   const d=JSON.parse(fs.readFileSync(path.join(lib.CACHE_DIR,`okx_${name}_${Y}y.json`),'utf8'));
   const m=new Map(); for(const x of d) m.set(x.ts,x.close);
   px[name]={arr:d,map:m};
 }

 // --- ① 실제 거래 구간의 최대 가격 상승(= 숏 손실) ---
 console.log('\n=== ① 실제 보유 구간에서 가격이 얼마나 올랐나 (숏 손실 방향) ===');
 const byCoin={};
 for(const t of r.trades){
   const s=px[t.coin]; if(!s) continue;
   const a=s.arr;
   // 이진탐색으로 구간 인덱스
   let lo=0,hi=a.length-1,i0=0;
   while(lo<=hi){const m=(lo+hi)>>1; if(a[m].ts<t.entryTs){lo=m+1;i0=lo;}else hi=m-1;}
   const p0=a[Math.min(i0,a.length-1)].close;
   let peak=p0;
   for(let i=i0;i<a.length&&a[i].ts<=t.exitTs;i++) if(a[i].close>peak) peak=a[i].close;
   const rise=(peak/p0-1)*100;
   (byCoin[t.coin]=byCoin[t.coin]||[]).push(rise);
 }
 console.log('코인     거래   중앙    95%    99%   최대상승  1배청산건수  안전증거금');
 let allRises=[];
 for(const [c,v] of Object.entries(byCoin).sort((a,b)=>b[1].length-a[1].length)){
   v.sort((a,b)=>a-b); allRises=allRises.concat(v);
   const q=p=>v[Math.floor(v.length*p)];
   const mx=v[v.length-1];
   const liq=v.filter(x=>x>=99).length;
   console.log(c.padEnd(8)+String(v.length).padStart(5)
     +String(q(.5).toFixed(1)+'%').padStart(8)+String(q(.95).toFixed(1)+'%').padStart(8)
     +String(q(.99).toFixed(1)+'%').padStart(8)+String(mx.toFixed(1)+'%').padStart(10)
     +String(liq).padStart(12)+String((mx/100).toFixed(2)+'배').padStart(12));
 }
 allRises.sort((a,b)=>a-b);
 const qa=p=>allRises[Math.floor(allRises.length*p)];
 const liqAll=allRises.filter(x=>x>=99).length;
 console.log(`\n전체 ${allRises.length}건 | 중앙 ${qa(.5).toFixed(1)}% | 99% ${qa(.99).toFixed(1)}% | 99.9% ${qa(.999).toFixed(1)}% | 최대 ${allRises[allRises.length-1].toFixed(1)}%`);
 console.log(`1배 증거금으로 청산됐을 거래: ${liqAll}건 (${(liqAll/allRises.length*100).toFixed(3)}%)`);

 // --- ② 평가손익까지 포함한 진짜 낙폭 ---
 console.log('\n=== ② 평가손익 포함 실제 낙폭 (기존 MDD는 청산분만 셈) ===');
 const gi={}; for(const c of ds.coins) gi[c.name]=c;
 const openAt=new Map(); // gridIdx -> [{coin,entryPremium}]
 for(const t of r.trades){
   const g0=Math.floor((t.entryTs-ds.gridMin)/ds.barMs);
   const g1=Math.floor((t.exitTs-ds.gridMin)/ds.barMs);
   for(let g=g0;g<=g1;g+=12){ // 1시간 간격
     if(!openAt.has(g)) openAt.set(g,[]);
     openAt.get(g).push(t);
   }
 }
 // 실현 누적 + 미실현
 const sorted=r.trades.slice().sort((a,b)=>a.exitTs-b.exitTs);
 let ri=0, realized=0, peak=0, mddMtm=0, mddReal=0, peakReal=0;
 const step=12;
 for(let g=0; g<ds.gridLen; g+=step){
   const ts=ds.gridMin+g*ds.barMs;
   while(ri<sorted.length && sorted[ri].exitTs<=ts){ realized+=sorted[ri].netProfit; ri++; }
   if(realized>peakReal) peakReal=realized;
   if(peakReal-realized>mddReal) mddReal=peakReal-realized;
   let unreal=0;
   const list=openAt.get(g);
   if(list) for(const t of list){
     if(t.entryTs>ts||t.exitTs<ts) continue;
     const c=gi[t.coin]; if(!c) continue;
     let lo=0,hi=c.gridIdx.length-1,idx=-1;
     while(lo<=hi){const m=(lo+hi)>>1; if(c.gridIdx[m]<=g){idx=m;lo=m+1;}else hi=m-1;}
     if(idx<0) continue;
     unreal += lib.POSITION_SIZE*(c.premium[idx]-t.entryPremium)/100;
   }
   const eq=realized+unreal;
   if(eq>peak) peak=eq;
   if(peak-eq>mddMtm) mddMtm=peak-eq;
 }
 console.log(`  청산분만 (기존 방식): $${mddReal.toFixed(2)}`);
 console.log(`  평가손익 포함 (실제): $${mddMtm.toFixed(2)}  ← 계좌에서 실제로 보이는 낙폭`);
 console.log(`  시드 $10,000 대비: ${(mddMtm/100).toFixed(2)}%`);
})().catch(e=>{console.error('FATAL:',e);process.exit(1)});
