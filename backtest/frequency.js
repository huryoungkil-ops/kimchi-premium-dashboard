// 거래 빈도를 늘리는 방법 비교.
//
// 6년 탐색이 고른 조합(σ2 · 관문3 · 청산+0.5)은 6년에 2,534건으로, 지금 봇(15,484건)의
// 6분의 1이다. 빈도를 되찾되 검증 구간 성적을 지킬 수 있는지 네 가지 손잡이로 확인한다.
//
//   A. 자리 수(MAX_POSITIONS)   ← 진입 기준을 전혀 낮추지 않고 늘리는 유일한 방법
//   B. 진입선(ENTRY_SIGMA)      ← 더 얕은 자리까지 들어간다
//   C. 청산선(EXIT_SIGMA_OFFSET) ← 빨리 나와서 자리를 비운다
//   D. 최대보유(MAX_HOLD_DAYS)  ← 반감기가 12~16시간인데 7일은 과하게 길다
//
// 자리 수를 늘릴 때는 «최대 동시 보유»를 같이 본다. 김프는 공통 요인으로 움직여서
// 진입 신호가 전 종목에 동시에 오므로, 평균이 아니라 최악의 순간에 필요한 자본이
// 시드를 넘지 않아야 한다. (README «함정: 남는 자본으로 자리 수를 늘리지 말 것»)
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const TRAIN_RATIO = 0.7;
// 봇에 반영된 설정에서 손잡이를 돌린다 — 정의는 lib5m.js LIVE_PARAMS 한 곳뿐이다.
// 2026-09-20 최초 측정 때는 6년 탐색 추천값(자리3 · 청산+0.5)에서 출발했고, 그 결과로
// 봇이 자리4 · 청산+0.25가 됐다. 이제 출발점이 그 «도착지»다.
const RECOMMENDED = lib.LIVE_PARAMS;

// 실거래에서는 국내 현물 + 해외 증거금으로 명목의 2배가 묶인다
const CAPITAL_MULTIPLE = 2;

const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
);
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

// 체결 구간을 훑어 실제 최대 동시 보유 수를 구한다 (일별 기록은 장중 정점을 놓친다)
function peakConcurrent(trades) {
  const ev = [];
  for (const t of trades) { ev.push([t.entryTs, 1]); ev.push([t.exitTs, -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // 같은 시각이면 청산 먼저
  let cur = 0, peak = 0;
  for (const [, d] of ev) { cur += d; if (cur > peak) peak = cur; }
  return peak;
}

const p = (s, n) => String(s).padStart(n);
const HEAD = ''.padEnd(24) + p('전체거래', 9) + p('검증거래', 9) + p('검증연환산', 11)
  + p('검증건당', 10) + p('검증MDD', 9) + p('수익/MDD', 9) + p('최대동시', 9) + p('필요자본', 10);

function run(label, over, out) {
  const P = Object.assign({}, RECOMMENDED, over);
  const full = lib.simulate(ds, P);
  const va = lib.simulate(ds, P, { fromRatio: TRAIN_RATIO, toRatio: 1 });
  const peak = peakConcurrent(full.trades);
  const capital = peak * lib.POSITION_SIZE * CAPITAL_MULTIPLE;
  const ratio = va.annualizedPct / (va.maxDrawdown / lib.SEED * 100 || 1);
  console.log(label.padEnd(24)
    + p(full.totalTrades, 9) + p(va.totalTrades, 9)
    + p((va.annualizedPct >= 0 ? '+' : '') + va.annualizedPct + '%', 11)
    + p('$' + va.avgNetPerTrade, 10) + p('$' + va.maxDrawdown, 9)
    + p(ratio.toFixed(2), 9) + p(peak + '자리', 9)
    + p('$' + capital.toLocaleString('en-US'), 10)
    + (capital > lib.SEED ? '  ⚠시드초과' : ''));
  out.push({
    label, params: over, trades: full.totalTrades, validTrades: va.totalTrades,
    validAnn: va.annualizedPct, validAvg: va.avgNetPerTrade, validMdd: va.maxDrawdown,
    validRatio: +ratio.toFixed(2), peakConcurrent: peak, capitalNeeded: capital,
    overSeed: capital > lib.SEED,
  });
}

let ds;
(async () => {
  console.log(`=== 거래 빈도 손잡이 비교 (종목 ${ready.length}개, ${YEARS}년) ===`);
  console.log(`기준: ${JSON.stringify(RECOMMENDED)} · 자리 ${RECOMMENDED.MAX_POSITIONS}`
    + ` · 1자리 $${lib.POSITION_SIZE} · 시드 $${lib.SEED}`);
  console.log(`«필요자본» = 최대동시 × $${lib.POSITION_SIZE} × ${CAPITAL_MULTIPLE}(현물+증거금)\n`);

  ds = await lib.buildDataset({ yearsBack: YEARS });
  const out = { slots: [], entry: [], exit: [], hold: [], combo: [] };

  console.log('\n===== A. 자리 수 — 진입 기준은 그대로 =====');
  console.log(HEAD);
  for (const n of [3, 4, 5, 6, 9]) run(`  자리 ${n}`, { MAX_POSITIONS: n }, out.slots);

  console.log('\n===== B. 진입선 — 더 얕은 자리까지 =====');
  console.log(HEAD);
  for (const s of [2.0, 1.75, 1.5, 1.25]) run(`  진입 ${s}σ`, { ENTRY_SIGMA: s }, out.entry);

  console.log('\n===== C. 청산선 — 빨리 나와 자리를 비운다 =====');
  console.log(HEAD);
  for (const e of [0.5, 0.25, 0]) run(`  청산 +${e}σ`, { EXIT_SIGMA_OFFSET: e }, out.exit);

  console.log('\n===== D. 최대보유 — 반감기는 12~16시간이다 =====');
  console.log(HEAD);
  for (const d of [7, 5, 3, 2, 1]) run(`  최대보유 ${d}일`, { MAX_HOLD_DAYS: d }, out.hold);

  console.log('\n===== E. 조합 — 자리를 늘리고 회전을 빠르게 =====');
  console.log(HEAD);
  run('  기준(자리3)', {}, out.combo);
  run('  자리5', { MAX_POSITIONS: 5 }, out.combo);
  run('  자리5+청산0.25', { MAX_POSITIONS: 5, EXIT_SIGMA_OFFSET: 0.25 }, out.combo);
  run('  자리5+보유3일', { MAX_POSITIONS: 5, MAX_HOLD_DAYS: 3 }, out.combo);
  run('  자리5+청산.25+보유3', { MAX_POSITIONS: 5, EXIT_SIGMA_OFFSET: 0.25, MAX_HOLD_DAYS: 3 }, out.combo);
  run('  위+진입1.75σ', { MAX_POSITIONS: 5, EXIT_SIGMA_OFFSET: 0.25, MAX_HOLD_DAYS: 3, ENTRY_SIGMA: 1.75 }, out.combo);

  fs.writeFileSync(path.join(lib.OUT_DIR, 'frequency_result.json'),
    JSON.stringify({ years: YEARS, recommended: RECOMMENDED, capitalMultiple: CAPITAL_MULTIPLE,
      positionSize: lib.POSITION_SIZE, seed: lib.SEED, results: out }, null, 2));
  console.log('\n저장: frequency_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
