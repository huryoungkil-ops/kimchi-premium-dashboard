// 가격 기반 증거금 보호 손절의 비용과 효과
const fs=require('fs'), path=require('path');
const lib=require('./lib5m');
const Y=6;
const ready=lib.COINS.filter(c=>
  fs.existsSync(path.join(lib.CACHE_DIR,`upbit_${c[0]}_${Y}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR,`okx_${c[0]}_${Y}y.json`)));
lib.COINS.length=0; for(const c of ready) lib.COINS.push(c);
const BASE={ENTRY_SIGMA:1,EDGE_MULTIPLE:5,EXIT_SIGMA_OFFSET:0.5,
            SOFT_HOLD_DAYS:2,SOFT_EXIT_LOSS_PP:0.5,MAX_HOLD_DAYS:5,STOP_LOSS_PP:999};
(async()=>{
 const ds=await lib.buildDataset({yearsBack:Y,log:()=>{}});
 console.log('\n=== 가격 손절폭별 (증거금 보호) ===');
 console.log('손절폭   거래    승률   연환산    건당     실현MDD  가격손절  청산위험잔존');
 for(const p of [20,30,40,50,70,90,null]){
   const r=lib.simulate(ds,Object.assign({},BASE,{PRICE_STOP_PCT:p}),{fromRatio:0,toRatio:1});
   // 손절 후에도 100% 넘게 오른 거래가 남아 있는가
   const remain=r.trades.filter(t=>t.priceRisePct!==null&&t.priceRisePct>=99).length;
   console.log((p===null?'없음':'+'+p+'%').padEnd(8)
     +String(r.totalTrades).padStart(6)+String(r.winRate+'%').padStart(8)
     +String((r.annualizedPct>=0?'+':'')+r.annualizedPct+'%').padStart(9)
     +String('$'+r.avgNetPerTrade).padStart(8)+String('$'+r.maxDrawdown).padStart(10)
     +String(r.exitReasons.PRICESTOP).padStart(9)+String(remain).padStart(13));
 }
 // 가격손절이 실제로 발동한 거래들의 손익
 const r50=lib.simulate(ds,Object.assign({},BASE,{PRICE_STOP_PCT:50}),{fromRatio:0,toRatio:1});
 const ps=r50.trades.filter(t=>t.exitReason==='PRICESTOP');
 if(ps.length){
   const net=ps.reduce((a,b)=>a+b.netProfit,0);
   console.log(`\n+50% 손절 발동 ${ps.length}건: 순손익 합계 ${net>=0?'+':''}$${net.toFixed(2)} (건당 ${(net/ps.length).toFixed(2)})`);
   console.log('  샘플:', ps.slice(0,5).map(t=>`${t.coin} 가격+${t.priceRisePct}% 김프${t.movePp>=0?'+':''}${t.movePp} 순$${t.netProfit}`).join(' | '));
 }
})().catch(e=>{console.error('FATAL:',e);process.exit(1)});
