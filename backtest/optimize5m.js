// 김치 프리미엄 전략 — 파라미터 최적 조합 탐색
//
// 사용법:
//   node optimize5m.js            # 3년, 전체 격자
//   node optimize5m.js 6          # 6년
//   node optimize5m.js 3 quick    # 3년, 축소 격자(빠른 확인용)
//
// 방법론:
//   기간을 시간 순으로 70% 학습 / 30% 검증으로 나눈다.
//   조합의 우열은 "학습 구간 성적"으로만 정하고, 검증 구간은 그 결론이
//   처음 보는 기간에서도 버티는지 확인하는 용도로만 쓴다.
//   학습에선 좋은데 검증에서 무너지면 그건 과최적화다.

const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = Number(process.argv[2] || 3);
const QUICK = process.argv.includes('quick');
const TRAIN_RATIO = 0.7;

// 탐색할 파라미터 격자
const GRID = QUICK ? {
  ENTRY_SIGMA: [1.0, 2.0],
  EDGE_MULTIPLE: [0, 1.5, 3.0],
  EXIT_SIGMA_OFFSET: [0, 0.5],
  REQUIRE_PROFIT_EXIT: [false, true],
} : {
  ENTRY_SIGMA: [1.0, 1.5, 2.0, 2.5],
  EDGE_MULTIPLE: [0, 1.0, 1.5, 2.0, 3.0],
  EXIT_SIGMA_OFFSET: [0, 0.25, 0.5],
  REQUIRE_PROFIT_EXIT: [false, true],
};

// 지금 실거래 봇이 쓰고 있는 설정 (비교 기준선)
const BASELINE = { ENTRY_SIGMA: 1.0, EDGE_MULTIPLE: 0, EXIT_SIGMA_OFFSET: 0, REQUIRE_PROFIT_EXIT: false };

function combos(grid) {
  const keys = Object.keys(grid);
  let out = [{}];
  for (const k of keys) {
    const next = [];
    for (const base of out) for (const v of grid[k]) next.push(Object.assign({}, base, { [k]: v }));
    out = next;
  }
  return out;
}

function sameParams(a, b) {
  return Object.keys(BASELINE).every(k => a[k] === b[k]);
}

function fmtRow(label, r) {
  const pad = (s, n) => String(s).padStart(n);
  return label.padEnd(34)
    + pad(r.totalTrades, 7)
    + pad(r.winRate === null ? '-' : r.winRate + '%', 9)
    + pad((r.returnPct >= 0 ? '+' : '') + r.returnPct + '%', 10)
    + pad((r.annualizedPct === null ? '-' : (r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%'), 11)
    + pad(r.avgNetPerTrade === null ? '-' : '$' + r.avgNetPerTrade, 10)
    + pad('$' + r.maxDrawdown, 10);
}

const HEADER = ''.padEnd(34) + '   거래   승률     수익률    연환산      건당      MDD';

async function main() {
  console.log(`=== 김치 프리미엄 전략 파라미터 탐색 (${YEARS}년${QUICK ? ', 축소 격자' : ''}) ===\n`);

  const dataset = await lib.buildDataset({ yearsBack: YEARS });

  const list = combos(GRID);
  console.log(`\n조합 ${list.length}개 × (학습/검증) 시뮬레이션 시작...`);
  console.log(`학습 구간 0~${TRAIN_RATIO * 100}% / 검증 구간 ${TRAIN_RATIO * 100}~100%\n`);

  const results = [];
  const t0 = Date.now();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const train = lib.simulate(dataset, p, { fromRatio: 0, toRatio: TRAIN_RATIO });
    const valid = lib.simulate(dataset, p, { fromRatio: TRAIN_RATIO, toRatio: 1 });
    // 거래 내역은 용량이 크니 상위 후보만 나중에 다시 뽑는다
    delete train.trades; delete train.equity;
    delete valid.trades; delete valid.equity;
    results.push({ params: p, train, valid });
    if ((i + 1) % 10 === 0 || i === list.length - 1) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\r  ${i + 1}/${list.length} 완료 (${el.toFixed(0)}초)   `);
    }
  }
  console.log('\n');

  // 학습 구간 성적으로만 순위를 매긴다
  const ranked = results.slice().sort((a, b) => b.train.annualizedPct - a.train.annualizedPct);

  console.log('===== 학습 구간 상위 10개 조합 =====');
  console.log(HEADER);
  for (const r of ranked.slice(0, 10)) {
    const p = r.params;
    const label = `σ${p.ENTRY_SIGMA} 배수${p.EDGE_MULTIPLE} 청산+${p.EXIT_SIGMA_OFFSET}${p.REQUIRE_PROFIT_EXIT ? ' 본전보장' : ''}`;
    console.log(fmtRow('  [학습] ' + label, r.train));
    console.log(fmtRow('  [검증] ' + label, r.valid));
    console.log('');
  }

  const base = results.find(r => sameParams(r.params, BASELINE));
  if (base) {
    console.log('===== 현재 실거래 봇 설정 (기준선) =====');
    console.log(HEADER);
    console.log(fmtRow('  [학습] 현재 설정', base.train));
    console.log(fmtRow('  [검증] 현재 설정', base.valid));
    console.log('');
  }

  // 과최적화 점검: 학습 상위권이 검증에서도 버티는가
  console.log('===== 과최적화 점검 =====');
  const top = ranked.slice(0, 10);
  const held = top.filter(r => r.valid.annualizedPct > 0).length;
  console.log(`학습 상위 10개 중 검증 구간에서도 수익을 낸 조합: ${held}개`);
  if (held < 5) {
    console.log('⚠ 절반도 버티지 못했습니다. 학습 구간에만 맞춘 결과일 가능성이 큽니다.');
  }

  // 학습·검증 양쪽에서 모두 살아남은 조합 (실거래에 반영할 후보)
  const robust = results
    .filter(r => r.train.annualizedPct > 0 && r.valid.annualizedPct > 0 && r.train.totalTrades >= 30 && r.valid.totalTrades >= 10)
    .sort((a, b) => Math.min(b.train.annualizedPct, b.valid.annualizedPct) - Math.min(a.train.annualizedPct, a.valid.annualizedPct));

  console.log(`\n===== 양 구간 모두 수익 + 표본 충분 (${robust.length}개) — 상위 5개 =====`);
  console.log('(순위는 두 구간 중 "나쁜 쪽" 성적 기준 — 가장 보수적으로 본 것)');
  console.log(HEADER);
  for (const r of robust.slice(0, 5)) {
    const p = r.params;
    const label = `σ${p.ENTRY_SIGMA} 배수${p.EDGE_MULTIPLE} 청산+${p.EXIT_SIGMA_OFFSET}${p.REQUIRE_PROFIT_EXIT ? ' 본전보장' : ''}`;
    console.log(fmtRow('  [학습] ' + label, r.train));
    console.log(fmtRow('  [검증] ' + label, r.valid));
    console.log('');
  }

  // 추천 조합으로 전체 기간을 다시 돌려 상세 결과를 남긴다
  let recommended = null;
  if (robust.length) {
    recommended = robust[0].params;
    console.log('===== 추천 조합 전체 기간 재실행 =====');
    const full = lib.simulate(dataset, recommended, { fromRatio: 0, toRatio: 1 });
    console.log(HEADER);
    console.log(fmtRow('  전체 기간', full));
    console.log('\n코인별:');
    for (const [c, v] of Object.entries(full.byCoin).sort((a, b) => b[1].net - a[1].net)) {
      console.log(`  ${c.padEnd(6)} ${String(v.trades).padStart(5)}건  승 ${String(v.wins).padStart(4)}  ${(v.net >= 0 ? '+$' : '-$') + Math.abs(v.net).toFixed(2)}`);
    }
    console.log('\n청산 사유:', JSON.stringify(full.exitReasons));
    console.log('걸러낸 신호:', JSON.stringify(full.blocked));
    console.log(`비용 내역 — 수수료 $${full.totalFees} / 스프레드 $${full.totalSpreadCost} / 펀딩 ${full.totalFunding >= 0 ? '+' : ''}$${full.totalFunding}`);

    fs.writeFileSync(
      path.join(lib.OUT_DIR, `optimize5m_recommended_${YEARS}y.json`),
      JSON.stringify({ recommended, full }, null, 2)
    );
  } else {
    console.log('⚠ 학습·검증 양쪽에서 모두 수익을 낸 조합이 없습니다.');
    console.log('  이 전략은 현재 비용 구조(왕복 0.3% + 스프레드)에서 수익을 내기 어렵다는 뜻일 수 있습니다.');
  }

  fs.writeFileSync(
    path.join(lib.OUT_DIR, `optimize5m_all_${YEARS}y.json`),
    JSON.stringify({
      years: YEARS, trainRatio: TRAIN_RATIO, grid: GRID,
      coinMeta: dataset.meta, baseline: base || null, recommended,
      results: ranked.map(r => ({ params: r.params, train: r.train, valid: r.valid })),
    }, null, 2)
  );
  console.log(`\n결과 저장: optimize5m_all_${YEARS}y.json`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
