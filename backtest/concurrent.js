// 교차 증거금이라면 "동시에 열린 포지션들의 숏 손실 합계"가 증거금을 위협한다.
// 자리 수별로 그 최대치를 잰다. 가격 손절 유무도 비교.
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
 const byName={}; for(const c of ds.coins) byName[c.name]=c;

 // 5분 사이 최대 가격 점프 (손절이 건너뛸 수 있는 갭)
 let maxGap=0, gapCoin='';
 for(const c of ds.coins){
   for(let i=1;i<c.foreign.length;i++){
     const g=(c.foreign[i]/c.foreign[i-1]-1)*100;
     if(g>maxGap){maxGap=g;gapCoin=c.name;}
   }
 }
 console.log(`\n5분 사이 최대 가격 점프: ${gapCoin} +${maxGap.toFixed(1)}%  (손절이 뛰어넘을 수 있는 폭)`);

 console.log('\n=== 자리 수 × 가격손절: 동시 숏 손실 최대치 ===');
 console.log('(교차 증거금 가정. 증거금 = 자리수 x $1,000, 1배)');
 console.log('자리 가격손절  거래   연환산   동시최대손실  증거금대비  청산여유');
 for(const slots of [3,4,5,6]){
  for(const ps of [50,null]){
   const r=lib.simulate(ds,Object.assign({},BASE,{MAX_POSITIONS:slots,PRICE_STOP_PCT:ps}),{fromRatio:0,toRatio:1});
   // 시점별 동시 숏 손실 합계
   const events=[];
   for(const t of r.trades){
     events.push({ts:t.entryTs,type:1,t});
     events.push({ts:t.exitTs,type:-1,t});
   }
   events.sort((a,b)=>a.ts-b.ts);
   const open=new Set();
   let maxLoss=0;
   let ei=0;
   const step=ds.barMs*12; // 1시간
   for(let ts=ds.gridMin; ts<ds.gridMax; ts+=step){
     while(ei<events.length&&events[ei].ts<=ts){ const e=events[ei]; if(e.type===1) open.add(e.t); else open.delete(e.t); ei++; }
     if(!open.size) continue;
     let loss=0;
     for(const t of open){
       const c=byName[t.coin]; if(!c) continue;
       const g=Math.floor((ts-ds.gridMin)/ds.barMs);
       let lo=0,hi=c.gridIdx.length-1,idx=-1;
       while(lo<=hi){const m=(lo+hi)>>1; if(c.gridIdx[m]<=g){idx=m;lo=m+1;}else hi=m-1;}
       if(idx<0) continue;
       // 진입 시점 해외가
       let lo2=0,hi2=c.gridIdx.length-1,i0=-1;
       const g0=Math.floor((t.entryTs-ds.gridMin)/ds.barMs);
       while(lo2<=hi2){const m=(lo2+hi2)>>1; if(c.gridIdx[m]<=g0){i0=m;lo2=m+1;}else hi2=m-1;}
       if(i0<0||!c.foreign[i0]) continue;
       const rise=(c.foreign[idx]/c.foreign[i0]-1);
       if(rise>0) loss += lib.POSITION_SIZE*rise; // 숏 손실
     }
     if(loss>maxLoss) maxLoss=loss;
   }
   const margin=slots*lib.POSITION_SIZE;
   console.log(String(slots).padEnd(4)+(ps===null?'없음':'+'+ps+'%').padEnd(9)
     +String(r.totalTrades).padStart(6)
     +String((r.annualizedPct>=0?'+':'')+r.annualizedPct+'%').padStart(9)
     +String('$'+maxLoss.toFixed(0)).padStart(13)
     +String((maxLoss/margin*100).toFixed(1)+'%').padStart(11)
     +String(maxLoss/margin<1?'안전':'청산').padStart(9));
  }
 }
})().catch(e=>{console.error('FATAL:',e);process.exit(1)});
