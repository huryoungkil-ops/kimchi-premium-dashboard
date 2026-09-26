// 완화 청산(SOFT)이 지금 설정에서도 값을 하는가.
//
// 배경: 봇은 «2일 경과 + 손실 0.5%p 이내면 청산»(SOFT)을 켜고 돌고 있다.
// 그런데 그 값은 softsweep.js를 옛 조합(σ1 · 관문5 · 청산+0.5)으로 돌려 고른 것이고,
// 2026-09-20에 바꾼 새 조합(σ2 · 관문3 · 청산+0.25 · 자리4)으로는 재측정한 적이 없다.
//
// 진입선을 2σ로 깊게 바꾸면 회귀가 빨라져(반감기 12~16시간) 오래 물리는 자리 자체가
// 줄어든다. 그러면 SOFT가 발동할 일도 줄고, 효과도 달라질 수 있다. 그걸 확인한다.
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const TRAIN_RATIO = 0.7;

// 봇에 반영된 설정 — 정의는 lib5m.js LIVE_PARAMS 한 곳뿐이다
const LIVE = lib.LIVE_PARAMS;
// 비교용 옛 조합 (softsweep.js가 SOFT 값을 고를 때 쓴 기준)
const OLD = {
  ENTRY_SIGMA: 1.0, EDGE_MULTIPLE: 5.0, EXIT_SIGMA_OFFSET: 0.5,
  REQUIRE_PROFIT_EXIT: false, MAX_POSITIONS: 3, RANK_BY: 'zscore',
  MAX_HOLD_DAYS: 7,
};

const CASES = [
  ['SOFT 끔', { SOFT_HOLD_DAYS: null }],
  ['1일 · 0.5%p', { SOFT_HOLD_DAYS: 1, SOFT_EXIT_LOSS_PP: 0.5 }],
  ['2일 · 0%p(본전)', { SOFT_HOLD_DAYS: 2, SOFT_EXIT_LOSS_PP: 0 }],
  ['2일 · 0.5%p ← 지금 봇', { SOFT_HOLD_DAYS: 2, SOFT_EXIT_LOSS_PP: 0.5 }],
  ['2일 · 1.0%p', { SOFT_HOLD_DAYS: 2, SOFT_EXIT_LOSS_PP: 1.0 }],
  ['3일 · 0.5%p', { SOFT_HOLD_DAYS: 3, SOFT_EXIT_LOSS_PP: 0.5 }],
  ['2일·0.5%p +호가반영', { SOFT_HOLD_DAYS: 2, SOFT_EXIT_LOSS_PP: 0.5, SOFT_SPREAD_AWARE: true }],
  ['2일·1.0%p +호가반영', { SOFT_HOLD_DAYS: 2, SOFT_EXIT_LOSS_PP: 1.0, SOFT_SPREAD_AWARE: true }],
];

const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
);
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

const p = (s, n) => String(s).padStart(n);
const HEAD = ''.padEnd(24) + p('거래', 7) + p('승률', 7) + p('연환산', 9)
  + p('건당', 8) + p('MDD', 8) + p('수익/MDD', 9)
  + p('신호', 7) + p('완화', 6) + p('강제', 6) + p('손절', 6);

function row(label, r) {
  return label.padEnd(24)
    + p(r.totalTrades, 7)
    + p((r.winRate === null ? '-' : r.winRate + '%'), 7)
    + p((r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%', 9)
    + p('$' + r.avgNetPerTrade, 8)
    + p('$' + r.maxDrawdown, 8)
    + p((r.annualizedPct / (r.maxDrawdown / lib.SEED * 100 || 1)).toFixed(2), 9)
    + p(r.exitReasons.SIGNAL, 7) + p(r.exitReasons.SOFT, 6)
    + p(r.exitReasons.MAXHOLD, 6) + p(r.exitReasons.STOP, 6);
}

(async () => {
  console.log(`=== 완화 청산(SOFT) 재측정 (종목 ${ready.length}개, ${YEARS}년) ===\n`);
  const ds = await lib.buildDataset({ yearsBack: YEARS });
  const out = { live: [], old: [], holdDist: null };

  for (const [tag, BASE, bucket] of [['지금 조합 (σ2·관문3·청산+0.25·자리4)', LIVE, 'live'],
                                      ['옛 조합 (σ1·관문5·청산+0.5·자리3)', OLD, 'old']]) {
    console.log(`\n===== ${tag} · 전체 기간 =====`);
    console.log(HEAD);
    for (const [label, over] of CASES) {
      const P = Object.assign({}, BASE, over);
      const r = lib.simulate(ds, P);
      const va = lib.simulate(ds, P, { fromRatio: TRAIN_RATIO, toRatio: 1 });
      console.log(row('  ' + label, r)
        + `  |검증 ${(va.annualizedPct >= 0 ? '+' : '') + va.annualizedPct}%`
        + ` (완화 ${va.exitReasons.SOFT})`);
      out[bucket].push({
        label, params: over,
        full: { trades: r.totalTrades, winRate: r.winRate, ann: r.annualizedPct,
                avg: r.avgNetPerTrade, mdd: r.maxDrawdown, exits: r.exitReasons },
        valid: { trades: va.totalTrades, ann: va.annualizedPct, mdd: va.maxDrawdown, exits: va.exitReasons },
      });
    }
  }

  // 보유 시간 분포 — «2일 넘게 물리는 자리»가 애초에 얼마나 되는가
  console.log('\n===== 보유 시간 분포 (지금 조합 · SOFT 끔) =====');
  const base = lib.simulate(ds, Object.assign({}, LIVE, { SOFT_HOLD_DAYS: null }));
  const buckets = [[0, 6], [6, 12], [12, 24], [24, 48], [48, 72], [72, 120], [120, 1e9]];
  const labels = ['~6시간', '6~12시간', '12~24시간', '1~2일', '2~3일', '3~5일', '5일+'];
  const dist = buckets.map(function (b) {
    const ts = base.trades.filter(function (t) { return t.holdHours >= b[0] && t.holdHours < b[1]; });
    const net = ts.reduce(function (s, t) { return s + t.netProfit; }, 0);
    return { trades: ts.length, net: Math.round(net * 100) / 100,
             avg: ts.length ? Math.round(net / ts.length * 100) / 100 : 0,
             wins: ts.filter(function (t) { return t.netProfit > 0; }).length };
  });
  console.log('구간'.padEnd(12) + p('거래', 8) + p('비중', 8) + p('승률', 8) + p('합계손익', 12) + p('건당', 9));
  dist.forEach(function (d, i) {
    console.log(labels[i].padEnd(12) + p(d.trades, 8)
      + p((d.trades / base.totalTrades * 100).toFixed(1) + '%', 8)
      + p(d.trades ? (d.wins / d.trades * 100).toFixed(1) + '%' : '-', 8)
      + p((d.net >= 0 ? '+$' : '-$') + Math.abs(d.net).toFixed(2), 12)
      + p('$' + d.avg, 9));
  });
  out.holdDist = labels.map(function (l, i) { return Object.assign({ bucket: l }, dist[i]); });

  fs.writeFileSync(path.join(lib.OUT_DIR, 'softcheck_result.json'),
    JSON.stringify({ years: YEARS, live: LIVE, old: OLD, results: out }, null, 2));
  console.log('\n저장: softcheck_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
