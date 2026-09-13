// 6년 검증. 캐시가 완성된 종목만 쓴다 (UNI/ARB/SUI는 수집이 끝나지 않았고,
// 셋 다 사전 분석에서 비용 문턱을 못 넘어 탈락했던 종목이라 제외해도 무방하다).
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const TRAIN_RATIO = 0.7;

// 캐시가 다 있는 종목만 남긴다
const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
);
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

function row(label, r) {
  const p = (s, n) => String(s).padStart(n);
  return label.padEnd(30)
    + p(r.totalTrades, 7)
    + p(r.winRate === null ? '-' : r.winRate + '%', 8)
    + p((r.returnPct >= 0 ? '+' : '') + r.returnPct + '%', 10)
    + p(r.annualizedPct === null ? '-' : (r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%', 10)
    + p('$' + r.avgNetPerTrade, 9)
    + p('$' + r.maxDrawdown, 10);
}
const HEAD = ''.padEnd(30) + '   거래   승률    수익률   연환산     건당       MDD';

(async () => {
  console.log(`=== 6년 검증 (종목 ${ready.length}개: ${ready.map(c => c[0]).join(' ')}) ===\n`);
  const ds = await lib.buildDataset({ yearsBack: YEARS });
  console.log(`\n격자 ${ds.gridLen.toLocaleString('en-US')}칸\n`);

  const combos = [];
  for (const sg of [1.0, 1.5, 2.0, 2.5, 3.0])
    for (const em of [0, 1.5, 3.0, 5.0])
      for (const xo of [0, 0.5, 1.0])
        for (const rp of [false, true])
          combos.push({ ENTRY_SIGMA: sg, EDGE_MULTIPLE: em, EXIT_SIGMA_OFFSET: xo, REQUIRE_PROFIT_EXIT: rp });

  console.log(`조합 ${combos.length}개 × (학습 70% / 검증 30%)...`);
  const res = [];
  for (const P of combos) {
    const tr = lib.simulate(ds, P, { fromRatio: 0, toRatio: TRAIN_RATIO });
    const va = lib.simulate(ds, P, { fromRatio: TRAIN_RATIO, toRatio: 1 });
    delete tr.trades; delete tr.equity; delete va.trades; delete va.equity;
    res.push({ P, tr, va });
  }
  res.sort((a, b) => b.tr.annualizedPct - a.tr.annualizedPct);

  const tag = c => `σ${c.ENTRY_SIGMA} 배수${c.EDGE_MULTIPLE} 청산+${c.EXIT_SIGMA_OFFSET}${c.REQUIRE_PROFIT_EXIT ? ' 본전' : ''}`;

  console.log('\n===== 학습 상위 8개와 그 검증 성적 =====');
  console.log(HEAD);
  for (const r of res.slice(0, 8)) {
    console.log(row('  [학습] ' + tag(r.P), r.tr));
    console.log(row('  [검증] ' + tag(r.P), r.va));
    console.log('');
  }

  const top10 = res.slice(0, 10);
  console.log(`과최적화 점검 — 학습 상위 10개 중 검증에서도 수익: ${top10.filter(r => r.va.annualizedPct > 0).length}개`);
  console.log(`전체 ${res.length}개 중 양 구간 모두 수익: ${res.filter(r => r.tr.annualizedPct > 0 && r.va.annualizedPct > 0).length}개`);

  // 가장 보수적인 선택: 두 구간 중 나쁜 쪽이 가장 좋은 조합
  const robust = res
    .filter(r => r.tr.totalTrades >= 100 && r.va.totalTrades >= 50)
    .sort((a, b) => Math.min(b.tr.annualizedPct, b.va.annualizedPct) - Math.min(a.tr.annualizedPct, a.va.annualizedPct));
  const best = robust[0];
  console.log(`\n===== 추천 조합: ${tag(best.P)} =====`);
  console.log('(두 구간 중 나쁜 쪽 성적으로 고른 것 — 가장 보수적)');
  console.log(HEAD);
  console.log(row('  [학습]', best.tr));
  console.log(row('  [검증]', best.va));

  const full = lib.simulate(ds, best.P, { fromRatio: 0, toRatio: 1 });
  console.log(row('  [전체]', full));
  console.log(`\n청산사유 ${JSON.stringify(full.exitReasons)}`);
  console.log(`비용 수수료$${full.totalFees} 스프레드$${full.totalSpreadCost} 펀딩$${full.totalFunding}`);
  console.log('\n코인별:');
  for (const [c, v] of Object.entries(full.byCoin).sort((a, b) => b[1].net - a[1].net)) {
    console.log(`  ${c.padEnd(6)} ${String(v.trades).padStart(5)}건 승${String(v.wins).padStart(5)} ${(v.net >= 0 ? '+$' : '-$') + Math.abs(v.net).toFixed(0)}`);
  }

  console.log('\n===== 수수료 체계별 (전체 기간) =====');
  console.log(HEAD);
  const fees = [];
  for (const k of Object.keys(lib.FEE_SCENARIOS)) {
    const sc = lib.FEE_SCENARIOS[k];
    const r = lib.simulate(ds, Object.assign({}, best.P, { FEE_SCENARIO: k }), { fromRatio: 0, toRatio: 1 });
    delete r.trades; delete r.equity;
    fees.push({ k, label: sc.label, r });
    console.log(row(`  ${sc.label} (${((sc.domestic + sc.foreign) * 200).toFixed(2)}%)`, r));
  }

  // 연도별로 나눠 국면 차이를 본다
  console.log('\n===== 연도별 =====');
  console.log(HEAD);
  const years = [];
  for (let i = 0; i < YEARS; i++) {
    const r = lib.simulate(ds, best.P, { fromRatio: i / YEARS, toRatio: (i + 1) / YEARS });
    delete r.trades; delete r.equity;
    years.push({ i, range: r.range, r });
    console.log(row(`  ${r.range.from} ~ ${r.range.to}`, r));
  }

  fs.writeFileSync(path.join(lib.OUT_DIR, 'run6y_result.json'),
    JSON.stringify({ coins: ready.map(c => c[0]), best: best.P, meta: ds.meta, ranked: res, fees, years }, null, 2));
  console.log('\n저장: run6y_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
