// 데이터 수집 전용. 분석·탐색은 캐시를 재사용한다.
// 사용법: node fetch.js [연수]
const lib = require('./lib5m');
const YEARS = Number(process.argv[2] || 1);
(async () => {
  const t0 = Date.now();
  const ds = await lib.buildDataset({ yearsBack: YEARS });
  console.log(`\n수집 완료: ${((Date.now() - t0) / 60000).toFixed(1)}분`);
  console.log(`종목 ${ds.coins.length}개, 공통 격자 ${ds.gridLen.toLocaleString('en-US')}칸`);
  for (const m of ds.meta) {
    console.log(`  ${m.name.padEnd(6)} ${String(m.bars).padStart(8)}봉  ${m.from} ~ ${m.to}  거래량미달 ${m.thinPct}%  펀딩 ${m.fundingEvents}`);
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
