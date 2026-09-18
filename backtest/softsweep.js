// 제안받은 2단계 청산: 3일 지나면 조건을 완화, 7일에 강제.
// 완화 문턱을 바꿔가며 "그냥 7일에 던지기"보다 나은지 본다.
const fs=require('fs'), path=require('path');
const lib=require('./lib5m');
const Y=6;
const ready=lib.COINS.filter(c=>
  fs.existsSync(path.join(lib.CACHE_DIR,`upbit_${c[0]}_${Y}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR,`okx_${c[0]}_${Y}y.json`)));
lib.COINS.length=0; for(const c of ready) lib.COINS.push(c);
const BASE={ENTRY_SIGMA:1,EDGE_MULTIPLE:5,EXIT_SIGMA_OFFSET:0.5,STOP_LOSS_PP:999};

function row(label,r){
  return label.padEnd(30)
    +String(r.totalTrades).padStart(6)+String(r.winRate+'%').padStart(8)
    +String((r.annualizedPct>=0?'+':'')+r.annualizedPct+'%').padStart(9)
    +String('$'+r.avgNetPerTrade).padStart(8)+String('$'+r.maxDrawdown).padStart(9)
    +String(r.exitReasons.SOFT).padStart(7)+String(r.exitReasons.MAXHOLD).padStart(8);
}
(async()=>{
  const ds=await lib.buildDataset({yearsBack:Y,log:()=>{}});
  console.log('\n=== 2단계 청산: 3일 후 완화 → 7일 강제 ===');
  console.log(''.padEnd(30)+'  거래    승률   연환산    건당      MDD   완화청산 강제청산');
  const cases=[
    ['① 아무 장치 없음',                    {MAX_HOLD_DAYS:999}],
    ['② 7일에 그냥 강제청산',                {MAX_HOLD_DAYS:7}],
    ['③ 3일후 본전이상 → 7일강제',           {SOFT_HOLD_DAYS:3,SOFT_EXIT_LOSS_PP:0,MAX_HOLD_DAYS:7}],
    ['④ 3일후 손실0.2%p이내 → 7일강제',      {SOFT_HOLD_DAYS:3,SOFT_EXIT_LOSS_PP:0.2,MAX_HOLD_DAYS:7}],
    ['⑤ 3일후 손실0.5%p이내 → 7일강제',      {SOFT_HOLD_DAYS:3,SOFT_EXIT_LOSS_PP:0.5,MAX_HOLD_DAYS:7}],
    ['⑥ 3일후 손실1.0%p이내 → 7일강제',      {SOFT_HOLD_DAYS:3,SOFT_EXIT_LOSS_PP:1.0,MAX_HOLD_DAYS:7}],
    ['⑦ 2일후 손실0.5%p이내 → 5일강제',      {SOFT_HOLD_DAYS:2,SOFT_EXIT_LOSS_PP:0.5,MAX_HOLD_DAYS:5}],
    ['⑧ 1일후 손실0.5%p이내 → 5일강제',      {SOFT_HOLD_DAYS:1,SOFT_EXIT_LOSS_PP:0.5,MAX_HOLD_DAYS:5}],
  ];
  for(const [label,extra] of cases){
    const r=lib.simulate(ds,Object.assign({},BASE,extra),{fromRatio:0,toRatio:1});
    console.log(row(label,r));
  }
})().catch(e=>{console.error('FATAL:',e);process.exit(1)});
