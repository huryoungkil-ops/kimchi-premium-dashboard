// 진입 후보 «순위 기준» 비교.
//
// 자리가 3~5개뿐이라, 후보가 자리보다 많으면 누구를 먼저 넣느냐가 성적을 바꾼다.
// 지금은 z-score = (평균−김프)/σ 로 줄을 세운다. 그런데 z-score는 비용을 모른다:
// 거래가 뜸한 종목은 마지막 체결가가 낡아 김프가 싸 보이는데 σ는 그만큼 커지지 않아
// z-score만 크게 나온다. 관문(EDGE_MULTIPLE)은 통과/탈락만 보는 바닥이라 이걸 못 막는다.
//
// 포지션 크기가 모두 같으니, 자리 하나가 벌어올 기대 순이익이 큰 순서로 채우는 게
// 목적함수에 맞다. 그게 netEdge = (평균−김프) − 본전문턱 이다.
//
// 같이 확인하는 것: 애초에 순위가 결과를 바꾸는 회차가 얼마나 되는가(rankContested).
// 후보가 늘 자리보다 적다면 이 논의 자체가 무의미하다.
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const TRAIN_RATIO = 0.7;

// 2026-09-20 봇에 반영한 설정
const LIVE = {
  ENTRY_SIGMA: 2.0, EDGE_MULTIPLE: 3.0, EXIT_SIGMA_OFFSET: 0.25,
  REQUIRE_PROFIT_EXIT: false, MAX_POSITIONS: 4,
};

const METHODS = [
  ['zscore', 'z-score (현재)'],
  ['netEdge', '순기대이익 (%p)'],
  ['edgeRatio', '비용 대비 배수'],
];

const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
);
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

const p = (s, n) => String(s).padStart(n);
const HEAD = ''.padEnd(22) + p('거래', 7) + p('승률', 8) + p('연환산', 10)
  + p('건당', 9) + p('MDD', 9) + p('수익/MDD', 10);
function row(label, r) {
  return label.padEnd(22)
    + p(r.totalTrades, 7)
    + p(r.winRate === null ? '-' : r.winRate + '%', 8)
    + p((r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%', 10)
    + p('$' + r.avgNetPerTrade, 9)
    + p('$' + r.maxDrawdown, 9)
    + p((r.annualizedPct / (r.maxDrawdown / lib.SEED * 100 || 1)).toFixed(2), 10);
}

(async () => {
  console.log(`=== 진입 후보 순위 기준 비교 (종목 ${ready.length}개, ${YEARS}년) ===`);
  console.log(`설정: ${JSON.stringify(LIVE)}\n`);

  const ds = await lib.buildDataset({ yearsBack: YEARS });
  const out = [];

  // 순위가 애초에 영향을 주는 회차가 얼마나 되는가
  const probe = lib.simulate(ds, Object.assign({}, LIVE, { RANK_BY: 'zscore' }));
  console.log(`\n순위가 결과를 바꾼 회차: ${probe.rankContested.toLocaleString('en-US')}회`
    + ` (그때 밀려난 후보 누적 ${probe.rankSkipped.toLocaleString('en-US')}건)`);
  console.log(`전체 거래 ${probe.totalTrades.toLocaleString('en-US')}건 대비`
    + ` — 순위 경쟁이 붙는 비율이 낮으면 어떤 기준을 써도 결과는 비슷하다.\n`);

  console.log('===== 전체 기간 =====');
  console.log(HEAD);
  for (const [key, label] of METHODS) {
    const r = lib.simulate(ds, Object.assign({}, LIVE, { RANK_BY: key }));
    console.log(row('  ' + label, r));
    out.push({ method: key, label, full: {
      trades: r.totalTrades, winRate: r.winRate, ann: r.annualizedPct,
      avg: r.avgNetPerTrade, mdd: r.maxDrawdown,
      rankContested: r.rankContested, rankSkipped: r.rankSkipped,
    }, byCoin: r.byCoin });
  }

  console.log('\n===== 학습(70%) / 검증(30%) =====');
  console.log(HEAD);
  for (let i = 0; i < METHODS.length; i++) {
    const [key, label] = METHODS[i];
    const P = Object.assign({}, LIVE, { RANK_BY: key });
    const tr = lib.simulate(ds, P, { fromRatio: 0, toRatio: TRAIN_RATIO });
    const va = lib.simulate(ds, P, { fromRatio: TRAIN_RATIO, toRatio: 1 });
    console.log(row('  [학습] ' + label, tr));
    console.log(row('  [검증] ' + label, va));
    out[i].train = { trades: tr.totalTrades, ann: tr.annualizedPct, mdd: tr.maxDrawdown };
    out[i].valid = { trades: va.totalTrades, ann: va.annualizedPct, mdd: va.maxDrawdown, winRate: va.winRate };
  }

  // 종목별로 자리 배분이 어떻게 달라졌는지 — 순위 기준의 직접적인 효과
  console.log('\n===== 종목별 거래 수 (전체 기간) =====');
  const coins = Array.from(new Set(out.flatMap(o => Object.keys(o.byCoin))))
    .sort((a, b) => (out[0].byCoin[b] ? out[0].byCoin[b].trades : 0) - (out[0].byCoin[a] ? out[0].byCoin[a].trades : 0));
  console.log('종목'.padEnd(8) + METHODS.map(m => p(m[1].slice(0, 9), 12)).join('') + p('스프레드', 11));
  for (const c of coins) {
    console.log(c.padEnd(8)
      + out.map(o => p(o.byCoin[c] ? o.byCoin[c].trades : 0, 12)).join('')
      + p((lib.KORBIT_SPREAD_PCT[c] ?? 0).toFixed(2) + '%', 11));
  }

  console.log('\n===== 종목별 손익 (전체 기간, $) =====');
  console.log('종목'.padEnd(8) + METHODS.map(m => p(m[1].slice(0, 9), 12)).join(''));
  for (const c of coins) {
    console.log(c.padEnd(8) + out.map(o => p(o.byCoin[c] ? o.byCoin[c].net : 0, 12)).join(''));
  }

  fs.writeFileSync(path.join(lib.OUT_DIR, 'ranking_result.json'),
    JSON.stringify({ years: YEARS, live: LIVE, methods: METHODS.map(m => m[0]), results: out }, null, 2));
  console.log('\n저장: ranking_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
