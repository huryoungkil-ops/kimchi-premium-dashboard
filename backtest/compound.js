// 복리(재투자) vs 고정 금액 — 같은 신호·같은 규칙으로 포지션 크기만 바꿔 비교한다.
//   fixed : 늘 $1,000 (지금 봇)
//   equity: 그 시점 실현 자산의 10% (벌면 커지고 잃으면 작아진다), 봉 거래대금의 1/5까지만
// 사용: node compound.js [년=6]
const lib = require('./lib5m');
const YEARS = Number(process.argv[2] || 6);

(async () => {
  const ds = await lib.buildDataset({ yearsBack: YEARS });
  const rows = [];
  for (const [label, extra] of [
    ['고정 $1,000 (지금)', { SIZING: 'fixed' }],
    ['복리 — 자산의 10%', { SIZING: 'equity', SIZING_PCT: 0.10 }],
    ['복리 — 자산의 15%', { SIZING: 'equity', SIZING_PCT: 0.15 }],
  ]) {
    const r = lib.simulate(ds, Object.assign({}, lib.LIVE_PARAMS, extra), { fromRatio: 0, toRatio: 1 });
    rows.push({ label, r });
  }
  const f = (v, d = 2) => (v === null || v === undefined ? '-' : Number(v).toFixed(d));
  console.log(`\n=== 복리 vs 고정 (${YEARS}년, ${rows[0].r.range.from} ~ ${rows[0].r.range.to}) ===`);
  console.log('방식                    거래   승률   누적손익$   총수익%  연복리%  최대낙폭%(평가)  평균크기$  최대크기$  유동성상한');
  for (const { label, r } of rows) {
    console.log(label.padEnd(22), String(r.totalTrades).padStart(5), f(r.winRate, 1).padStart(6),
      f(r.netProfit).padStart(11), f(r.returnPct).padStart(9), f(r.cagrPct).padStart(8),
      f(r.maxDrawdownPctMTM).padStart(15), f(r.avgSizeUsd).padStart(10), f(r.maxSizeUsd).padStart(10), String(r.cappedByLiquidity ?? '-').padStart(10));
  }
  // 연도별 손익 (복리 효과가 언제 벌어지는지)
  const byYear = rs => { const y = {}; for (const t of rs.trades) { const k = new Date(t.exitTs).toISOString().slice(0, 4); y[k] = (y[k] || 0) + t.netProfit; } return y; };
  const ys = rows.map(x => byYear(x.r));
  console.log('\n연도별 손익($):', Object.keys(ys[0]).sort().map(k => `${k} ${ys.map(y => f(y[k] || 0, 0)).join('/')}`).join(' · '));
})().catch(e => { console.error(e); process.exit(1); });
