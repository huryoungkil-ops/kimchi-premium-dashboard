// 분할 진입(물타기) 검증.
//
// 아이디어: 신호가 뜬 순간 $1,000을 다 넣지 말고 $333만 넣고, 김프가 더 벌어지면
// 더 깊은 계단에서 $333씩 추가한다. 평단(가중평균 진입 김프)이 낮아지면
// 회복 시 먹는 폭이 커진다.
//
// 공짜가 아닌 지점: 수수료·스프레드는 명목금액 비례라 분할 자체는 비용이 0이다.
// 진짜 비용은 "덜 깔린 자본"이다 — 2·3차가 안 채워지면 그 자리는 작은 크기로만 굴러간다.
// 즉 「더 좋은 평단」 vs 「더 적은 투입금」의 교환이고, 답은 -1σ에서 들어간 뒤
// -2σ까지 더 내려가는 빈도에 달려 있다. 그걸 여기서 잰다.
//
// 자본이 남는다면 자리 수를 늘려 같은 돈을 다 굴릴 수 있다. 그 변형도 같이 본다.
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const TRAIN_RATIO = 0.7;

const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
);
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

const BASE = JSON.parse(fs.readFileSync(path.join(lib.OUT_DIR, 'run6y_result.json'), 'utf8')).best;
const T = (sigma, fraction) => ({ sigma, fraction });

const LADDERS = [
  ['일괄 (현재)',            null,                                            null],
  ['2단 1.0/1.5  50:50',     [T(1.0, 0.5), T(1.5, 0.5)],                      null],
  ['2단 1.0/2.0  50:50',     [T(1.0, 0.5), T(2.0, 0.5)],                      null],
  ['3단 1.0/1.5/2.0 균등',   [T(1.0, 1/3), T(1.5, 1/3), T(2.0, 1/3)],         null],
  ['3단 1.0/1.75/2.5 균등',  [T(1.0, 1/3), T(1.75, 1/3), T(2.5, 1/3)],        null],
  ['3단 앞무겁게 50:30:20',  [T(1.0, 0.5), T(1.5, 0.3), T(2.0, 0.2)],         null],
  ['3단 뒤무겁게 20:30:50',  [T(1.0, 0.2), T(1.5, 0.3), T(2.0, 0.5)],         null],
  // 자리를 비운 만큼 더 많은 종목에 깔아보는 변형
  ['3단 균등 + 자리 9',      [T(1.0, 1/3), T(1.5, 1/3), T(2.0, 1/3)],         9],
  ['2단 50:50 + 자리 6',     [T(1.0, 0.5), T(1.5, 0.5)],                      6],
];

function row(label, r) {
  const p = (s, n) => String(s).padStart(n);
  // 투입 1달러당 수익(bp) — 자본 효율. 절대 수익과 따로 봐야 한다.
  const deployed = r.totalTrades * (r.avgSizeUsd || 0);
  const perDollarBp = deployed ? (r.netProfit / deployed * 10000) : 0;
  return label.padEnd(24)
    + p(r.totalTrades, 6)
    + p(r.winRate === null ? '-' : r.winRate + '%', 7)
    + p((r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%', 9)
    + p('$' + r.maxDrawdown, 9)
    + p(r.avgTranches === null ? '-' : r.avgTranches, 7)
    + p('$' + (r.avgSizeUsd || 0), 8)
    + p(perDollarBp.toFixed(1) + 'bp', 9);
}
const HEAD = ''.padEnd(24) + '  거래   승률   연환산      MDD  평균차수  평균크기  달러당';

(async () => {
  console.log(`=== 분할 진입 검증 (종목 ${ready.length}개, ${YEARS}년) ===`);
  console.log(`기준 조합: ${JSON.stringify(BASE)} · 1자리 최대 $${lib.POSITION_SIZE}\n`);
  const ds = await lib.buildDataset({ yearsBack: YEARS });

  // --- 회귀 검사: TRANCHES=null이 기존 결과와 같은지 ---
  const baseRun = lib.simulate(ds, BASE, { fromRatio: 0, toRatio: 1 });
  console.log(`\n[회귀 검사] 일괄 진입 = 거래 ${baseRun.totalTrades}건 / 연환산 ${baseRun.annualizedPct}% / MDD $${baseRun.maxDrawdown}`);
  console.log(`            기대값     = 거래 5027건 / 연환산 22.45% / MDD $281.71`);
  if (baseRun.totalTrades !== 5027 || baseRun.annualizedPct !== 22.45) {
    console.log('            ⚠ 불일치 — 리팩터링이 기존 동작을 바꿨다. 아래 결과를 믿지 말 것.');
  } else {
    console.log('            일치 ✓ 리팩터링은 기존 동작을 바꾸지 않았다.');
  }

  const out = [];
  console.log('\n===== 전체 기간 =====');
  console.log(HEAD);
  for (const [label, ladder, slots] of LADDERS) {
    const P = Object.assign({}, BASE, { TRANCHES: ladder });
    if (slots) P.MAX_POSITIONS = slots;
    const r = lib.simulate(ds, P, { fromRatio: 0, toRatio: 1 });
    console.log(row('  ' + label, r));
    out.push({ label, ladder, slots, full: {
      trades: r.totalTrades, winRate: r.winRate, ann: r.annualizedPct, net: r.netProfit,
      mdd: r.maxDrawdown, addOns: r.addOns, avgTranches: r.avgTranches, avgSizeUsd: r.avgSizeUsd,
    } });
  }

  console.log('\n===== 학습(70%) / 검증(30%) =====');
  console.log(HEAD);
  for (const [label, ladder, slots] of LADDERS) {
    const P = Object.assign({}, BASE, { TRANCHES: ladder });
    if (slots) P.MAX_POSITIONS = slots;
    const tr = lib.simulate(ds, P, { fromRatio: 0, toRatio: TRAIN_RATIO });
    const va = lib.simulate(ds, P, { fromRatio: TRAIN_RATIO, toRatio: 1 });
    console.log(row('  [학습] ' + label, tr));
    console.log(row('  [검증] ' + label, va));
    const rec = out.find(o => o.label === label);
    rec.train = { ann: tr.annualizedPct, mdd: tr.maxDrawdown };
    rec.valid = { ann: va.annualizedPct, mdd: va.maxDrawdown };
  }

  fs.writeFileSync(path.join(lib.OUT_DIR, 'tranches_result.json'),
    JSON.stringify({ base: BASE, coins: ready.map(c => c[0]), results: out }, null, 2));
  console.log('\n저장: tranches_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
