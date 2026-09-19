// "2단 분할은 수익 -6%" 주장 검증.
//
// -6%는 전체 6년 · 한 조합(run6y 추천) · 9종목에서 나온 점추정치다.
// 그 숫자가 얼마나 단단한지 네 가지로 캔다:
//   ① 연도별 — 매년 지는가, 아니면 평균만 지는가
//   ② 조합 민감도 — 다른 진입선/관문에서도 같은 폭인가
//   ③ 짝지은 거래 비교 — 두 전략은 사실상 같은 거래를 하므로 1:1로 뺄 수 있다
//   ④ 블록 부트스트랩 — 그 차이가 잡음과 구별되는가 (월 단위 블록으로 재표본)
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
);
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

const BASE = JSON.parse(fs.readFileSync(path.join(lib.OUT_DIR, 'run6y_result.json'), 'utf8')).best;
const LADDER2 = [{ sigma: 1.0, fraction: 0.5 }, { sigma: 1.5, fraction: 0.5 }];
const LADDER3 = [{ sigma: 1.0, fraction: 1/3 }, { sigma: 1.5, fraction: 1/3 }, { sigma: 2.0, fraction: 1/3 }];

const pctChange = (a, b) => b === 0 ? null : ((a - b) / Math.abs(b) * 100);
const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

(async () => {
  const ds = await lib.buildDataset({ yearsBack: YEARS });
  console.log(`\n=== "2단 분할 = 수익 -6%" 검증 (${ready.length}종목, ${YEARS}년) ===`);
  console.log(`기준 조합: ${JSON.stringify(BASE)}\n`);

  const run = (ladder, range) => lib.simulate(ds, Object.assign({}, BASE, { TRANCHES: ladder }), range);

  // ---------- ① 연도별 ----------
  console.log('===== ① 연도별 (매년 지는가) =====');
  console.log('  구간                    일괄      2단    변화       3단    변화');
  const yearly = [];
  for (let i = 0; i < YEARS; i++) {
    const r = { fromRatio: i / YEARS, toRatio: (i + 1) / YEARS };
    const a = run(null, r), b = run(LADDER2, r), c = run(LADDER3, r);
    const d2 = pctChange(b.annualizedPct, a.annualizedPct);
    const d3 = pctChange(c.annualizedPct, a.annualizedPct);
    yearly.push({ range: a.range, base: a.annualizedPct, t2: b.annualizedPct, t3: c.annualizedPct, d2, d3 });
    console.log('  ' + (a.range.from + '~' + a.range.to).padEnd(24)
      + (a.annualizedPct + '%').padStart(8) + (b.annualizedPct + '%').padStart(8) + sgn(d2).padStart(8)
      + (c.annualizedPct + '%').padStart(9) + sgn(d3).padStart(8));
  }
  const worse2 = yearly.filter(y => y.d2 < 0).length;
  console.log(`\n  2단이 진 해: ${worse2}/${YEARS}   변화폭 범위 ${Math.min(...yearly.map(y=>y.d2)).toFixed(1)}% ~ ${Math.max(...yearly.map(y=>y.d2)).toFixed(1)}%`);

  // ---------- ② 조합 민감도 ----------
  console.log('\n===== ② 다른 조합에서도 같은 폭인가 =====');
  console.log('  진입σ 관문배수 청산+     일괄      2단    변화');
  const combos = [];
  for (const sg of [1.0, 1.5, 2.0])
    for (const em of [0, 3.0, 5.0])
      for (const xo of [0, 0.5])
        combos.push({ ENTRY_SIGMA: sg, EDGE_MULTIPLE: em, EXIT_SIGMA_OFFSET: xo });
  const sens = [];
  for (const C of combos) {
    // 계단 1차는 그 조합의 진입선에 맞추고, 2차는 0.5σ 더 깊게
    const L = [{ sigma: C.ENTRY_SIGMA, fraction: 0.5 }, { sigma: C.ENTRY_SIGMA + 0.5, fraction: 0.5 }];
    const a = lib.simulate(ds, Object.assign({}, BASE, C, { TRANCHES: null }), { fromRatio: 0, toRatio: 1 });
    const b = lib.simulate(ds, Object.assign({}, BASE, C, { TRANCHES: L }), { fromRatio: 0, toRatio: 1 });
    if (a.totalTrades < 100) continue;
    const d = pctChange(b.annualizedPct, a.annualizedPct);
    sens.push(d);
    console.log('  ' + String(C.ENTRY_SIGMA).padStart(4) + String(C.EDGE_MULTIPLE).padStart(8) + String(C.EXIT_SIGMA_OFFSET).padStart(6)
      + (a.annualizedPct + '%').padStart(10) + (b.annualizedPct + '%').padStart(8) + sgn(d).padStart(8));
  }
  sens.sort((x, y) => x - y);
  const med = sens[Math.floor(sens.length / 2)];
  console.log(`\n  ${sens.length}개 조합 · 변화 중앙값 ${sgn(med)} · 범위 ${sgn(sens[0])} ~ ${sgn(sens[sens.length-1])}`);
  console.log(`  2단이 이긴 조합: ${sens.filter(d => d > 0).length}/${sens.length}`);

  // ---------- ③ 짝지은 거래 비교 ----------
  console.log('\n===== ③ 같은 거래끼리 1:1 비교 =====');
  const A = run(null, { fromRatio: 0, toRatio: 1 });
  const B = run(LADDER2, { fromRatio: 0, toRatio: 1 });
  const key = t => t.coin + '@' + t.entryTs;
  const mapB = new Map();
  for (const t of B.trades) mapB.set(key(t), t);
  const pairs = [];
  for (const t of A.trades) {
    const u = mapB.get(key(t));
    if (u) pairs.push({ ts: t.entryTs, coin: t.coin, a: t.netProfit, b: u.netProfit, d: u.netProfit - t.netProfit });
  }
  const sum = a => a.reduce((s, v) => s + v, 0);
  const totD = sum(pairs.map(p => p.d));
  const meanD = totD / pairs.length;
  const sd = Math.sqrt(sum(pairs.map(p => (p.d - meanD) ** 2)) / (pairs.length - 1));
  const se = sd / Math.sqrt(pairs.length);
  console.log(`  짝지어진 거래: ${pairs.length} / 일괄 ${A.totalTrades}건`);
  console.log(`  일괄 총수익 $${A.netProfit}  ->  2단 총수익 $${B.netProfit}   차이 $${totD.toFixed(2)} (${sgn(pctChange(B.netProfit, A.netProfit))})`);
  console.log(`  거래당 평균 차이 $${meanD.toFixed(4)} (표준오차 $${se.toFixed(4)}, t = ${(meanD / se).toFixed(2)})`);
  console.log(`  2단이 더 번 거래: ${pairs.filter(p => p.d > 0).length} / 덜 번 거래: ${pairs.filter(p => p.d < 0).length} / 동일: ${pairs.filter(p => p.d === 0).length}`);
  console.log('  ※ 거래들은 같은 시점의 시장을 공유해 독립이 아니다. t값은 과대평가다 -> ④로 확인.');

  // ---------- ④ 월 블록 부트스트랩 ----------
  console.log('\n===== ④ 월 단위 블록 부트스트랩 (차이가 잡음인가) =====');
  const byMonth = new Map();
  for (const p of pairs) {
    const m = new Date(p.ts).toISOString().slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(p.d);
  }
  const blocks = [...byMonth.values()].map(sum);
  const N = blocks.length;
  const ITER = 5000;
  let rng = 12345;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  const boots = [];
  for (let it = 0; it < ITER; it++) {
    let s = 0;
    for (let j = 0; j < N; j++) s += blocks[Math.floor(rand() * N)];
    boots.push(s);
  }
  boots.sort((x, y) => x - y);
  const q = p => boots[Math.floor(p * (ITER - 1))];
  console.log(`  블록 ${N}개월 · 재표본 ${ITER}회`);
  console.log(`  총차이 점추정 $${totD.toFixed(2)}`);
  console.log(`  95% 신뢰구간 [$${q(0.025).toFixed(2)}, $${q(0.975).toFixed(2)}]`);
  console.log(`  차이가 0 이상일 확률(2단이 안 지거나 이길 확률): ${(boots.filter(v => v >= 0).length / ITER * 100).toFixed(1)}%`);
  const relLo = pctChange(A.netProfit + q(0.025), A.netProfit);
  const relHi = pctChange(A.netProfit + q(0.975), A.netProfit);
  console.log(`  -> 수익 변화 95% 구간: ${sgn(relLo)} ~ ${sgn(relHi)}`);

  fs.writeFileSync(path.join(lib.OUT_DIR, 'verify_tranches_result.json'),
    JSON.stringify({ base: BASE, yearly, sensitivity: sens, paired: { n: pairs.length, totalDiff: totD, meanDiff: meanD, se },
      bootstrap: { blocks: N, iters: ITER, lo: q(0.025), hi: q(0.975), pGE0: boots.filter(v => v >= 0).length / ITER } }, null, 2));
  console.log('\n저장: verify_tranches_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
