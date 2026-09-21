// 진입 간격 제한 — 종목 대신 «시간»으로 분산할 수 있는가.
//
// corr.js: 종목 간 김프 변화의 상관이 1일 기준 0.88. 김프가 빠지면 신호가 전 종목에
// 동시에 떠서 4자리가 같은 가격대에 한꺼번에 찬다 — 4자리는 실효 베팅 1.1개다.
// 새 진입 뒤 N시간 동안 다음 새 진입을 막으면, 공통 요인이 계속 빠질 때 다음 자리는
// 더 싼 가격에 들어간다. 그 대가로 기회를 놓친다. 그 교환을 잰다.
//
// ⚠️ 위험 지표는 «평가손익을 포함한 최대 낙폭»(MDD 평가)으로 본다. 기존 MDD는 청산된
//    손익만 쌓아서, 동시에 물린 자리들의 평가손실(실거래 화면의 −$112 같은 것)을 못 본다.
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const TRAIN_RATIO = 0.7;

// 지금 봇 설정 그대로 (완화 청산 포함)
const LIVE = {
  ENTRY_SIGMA: 2.0, EDGE_MULTIPLE: 3.0, EXIT_SIGMA_OFFSET: 0.25,
  REQUIRE_PROFIT_EXIT: false, MAX_POSITIONS: 4, RANK_BY: 'netEdge',
  SOFT_HOLD_DAYS: 2, SOFT_EXIT_LOSS_PP: 0.5, MAX_HOLD_DAYS: 5,
};
const GAPS = [0, 1, 3, 6, 12, 24];

const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
);
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

const p = (s, n) => String(s).padStart(n);
const ratio = r => (r.annualizedPct / (r.maxDrawdownMTM / lib.SEED * 100 || 1));

// 몰려서 들어간 정도: 진입 직전 6시간 안에 다른 진입이 몇 건 있었나
function clustering(trades) {
  const ts = trades.map(t => t.entryTs).sort((a, b) => a - b);
  let clustered = 0, j = 0;
  for (let i = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] > 6 * 3600000) j++;
    if (i - j >= 2) clustered++; // 6시간 안에 자신 포함 3건 이상
  }
  return ts.length ? clustered / ts.length * 100 : 0;
}

(async () => {
  console.log(`=== 진입 간격 제한 (종목 ${ready.length}개, ${YEARS}년) ===`);
  console.log(`설정: ${JSON.stringify(LIVE)}\n`);
  const ds = await lib.buildDataset({ yearsBack: YEARS });
  const out = [];

  console.log('\n' + '간격'.padEnd(10) + p('거래', 7) + p('승률', 7) + p('연환산', 9) + p('건당', 8)
    + p('MDD실현', 9) + p('MDD평가', 9) + p('수익/MDD', 9) + p('몰림', 7)
    + '  |' + p('검증연환산', 10) + p('검증MDD평가', 12) + p('검증비', 8));
  for (const g of GAPS) {
    const P = Object.assign({}, LIVE, { ENTRY_GAP_HOURS: g });
    const r = lib.simulate(ds, P);
    const va = lib.simulate(ds, P, { fromRatio: TRAIN_RATIO, toRatio: 1 });
    const cl = clustering(r.trades);
    const label = g === 0 ? '없음(지금)' : g + '시간';
    console.log(label.padEnd(10)
      + p(r.totalTrades, 7) + p(r.winRate + '%', 7)
      + p((r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%', 9)
      + p('$' + r.avgNetPerTrade, 8)
      + p('$' + r.maxDrawdown, 9) + p('$' + r.maxDrawdownMTM, 9)
      + p(ratio(r).toFixed(2), 9) + p(cl.toFixed(1) + '%', 7)
      + '  |' + p((va.annualizedPct >= 0 ? '+' : '') + va.annualizedPct + '%', 10)
      + p('$' + va.maxDrawdownMTM, 12) + p(ratio(va).toFixed(2), 8));
    out.push({
      gapHours: g,
      full: { trades: r.totalTrades, winRate: r.winRate, ann: r.annualizedPct, avg: r.avgNetPerTrade,
              mdd: r.maxDrawdown, mddMTM: r.maxDrawdownMTM, ratioMTM: +ratio(r).toFixed(2),
              clusteredPct: +cl.toFixed(1), blockedGap: r.blockedGap },
      valid: { trades: va.totalTrades, ann: va.annualizedPct, mddMTM: va.maxDrawdownMTM, ratioMTM: +ratio(va).toFixed(2) },
    });
  }

  fs.writeFileSync(path.join(lib.OUT_DIR, 'entrygap_result.json'),
    JSON.stringify({ years: YEARS, live: LIVE, results: out }, null, 2));
  console.log('\n몰림 = 진입 직전 6시간 안에 다른 진입이 2건 이상 있었던 비율');
  console.log('저장: entrygap_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
