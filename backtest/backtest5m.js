// 김치 프리미엄 전략 — 단일 조건 백테스트 (파라미터 하나만 골라 돌려볼 때)
//
// 사용법:
//   node backtest5m.js              # 3년, 현재 실거래 봇과 같은 설정
//   node backtest5m.js 6            # 6년
//   node backtest5m.js 3 optimized  # 3년, optimize5m.js가 추천한 조합으로
//
// 여러 조합을 비교하려면 optimize5m.js를 쓴다. 데이터 수집·시뮬레이션 로직은
// lib5m.js에 모여 있고 두 스크립트가 같은 캐시를 공유한다.

const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = Number(process.argv[2] || 3);
const USE_OPTIMIZED = process.argv.includes('optimized');

function pick() {
  if (!USE_OPTIMIZED) {
    // 현재 실거래 봇(n8n)이 쓰고 있는 조건과 동일
    return { label: '현재 실거래 봇 설정', params: {} };
  }
  const f = path.join(lib.OUT_DIR, `optimize5m_recommended_${YEARS}y.json`);
  if (!fs.existsSync(f)) {
    console.error(`추천 조합 파일이 없습니다: ${f}\n먼저 "node optimize5m.js ${YEARS}"를 실행하세요.`);
    process.exit(1);
  }
  return { label: '최적화 추천 조합', params: JSON.parse(fs.readFileSync(f, 'utf8')).recommended };
}

async function main() {
  const { label, params } = pick();
  console.log(`=== 김치 프리미엄 백테스트 (${YEARS}년 · ${label}) ===\n`);

  const dataset = await lib.buildDataset({ yearsBack: YEARS });
  const r = lib.simulate(dataset, params, { fromRatio: 0, toRatio: 1 });

  console.log('\n===== 결과 =====');
  console.log(`기간        ${r.range.from} ~ ${r.range.to} (${r.range.days}일)`);
  console.log(`조건        ${JSON.stringify(r.params)}`);
  console.log(`거래        ${r.totalTrades}건 · 승 ${r.wins} · 승률 ${r.winRate}%`);
  console.log(`순손익      ${r.netProfit >= 0 ? '+' : ''}$${r.netProfit} (원금 대비 ${r.returnPct >= 0 ? '+' : ''}${r.returnPct}%, 연환산 ${r.annualizedPct >= 0 ? '+' : ''}${r.annualizedPct}%)`);
  console.log(`건당 평균   ${r.avgNetPerTrade >= 0 ? '+' : ''}$${r.avgNetPerTrade} · 평균 보유 ${r.avgHoldHours}시간`);
  console.log(`최대 낙폭   $${r.maxDrawdown}`);
  console.log(`비용        수수료 $${r.totalFees} / 스프레드 $${r.totalSpreadCost} / 펀딩 ${r.totalFunding >= 0 ? '+' : ''}$${r.totalFunding}`);
  console.log(`청산 사유   ${JSON.stringify(r.exitReasons)}`);
  console.log(`걸러낸 신호 ${JSON.stringify(r.blocked)}`);

  console.log('\n코인별:');
  for (const [c, v] of Object.entries(r.byCoin).sort((a, b) => b[1].net - a[1].net)) {
    console.log(`  ${c.padEnd(6)} ${String(v.trades).padStart(5)}건  승 ${String(v.wins).padStart(4)}  ${(v.net >= 0 ? '+$' : '-$') + Math.abs(v.net).toFixed(2)}`);
  }

  const out = path.join(lib.OUT_DIR, `backtest5m_result_${YEARS}y.json`);
  fs.writeFileSync(out, JSON.stringify({ label, summary: Object.assign({}, r, { trades: undefined, equity: undefined }), coinMeta: dataset.meta, trades: r.trades, equity: r.equity }, null, 2));
  console.log(`\n저장: ${path.basename(out)}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
