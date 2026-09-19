// 시장 국면 필터 검증.
//
// 지금 페이퍼 봇이 물려 있는 이유를 코드로 재현해 본다: 김프 수준 자체가
// 며칠씩 내려가면 모든 종목이 동시에 자기 3일 MA 아래로 떨어진다. 그때
// "이 종목이 싸다"는 신호는 정보를 잃는다 — 싼 게 아니라 전부 내려간 것이다.
//
// 매 틱 전 종목의 (프리미엄-MA)/σ 평균(marketZ)을 재서, 바닥 아래면 진입을
// 보류하는 필터가 6년 데이터에서 실제로 도움이 되는지 본다.
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

// run6y가 고른 보수적 조합을 그대로 쓰고 필터만 얹는다
const BASE = JSON.parse(fs.readFileSync(path.join(lib.OUT_DIR, 'run6y_result.json'), 'utf8')).best;

function row(label, r) {
  const p = (s, n) => String(s).padStart(n);
  return label.padEnd(26)
    + p(r.totalTrades, 7)
    + p(r.winRate === null ? '-' : r.winRate + '%', 8)
    + p((r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%', 10)
    + p('$' + r.avgNetPerTrade, 9)
    + p('$' + r.maxDrawdown, 10)
    + p((r.annualizedPct / (r.maxDrawdown || 1)).toFixed(2), 8);
}
const HEAD = ''.padEnd(26) + '   거래   승률    연환산     건당       MDD  수익/MDD';

(async () => {
  console.log(`=== 시장 국면 필터 (종목 ${ready.length}개, ${YEARS}년) ===`);
  console.log(`기준 조합: ${JSON.stringify(BASE)}\n`);
  const ds = await lib.buildDataset({ yearsBack: YEARS });

  const FLOORS = [null, -0.2, -0.3, -0.4, -0.5, -0.6, -0.8, -1.0];
  const out = [];

  console.log('\n===== 전체 기간 =====');
  console.log(HEAD);
  for (const f of FLOORS) {
    const P = Object.assign({}, BASE, { MARKET_Z_FLOOR: f });
    const r = lib.simulate(ds, P, { fromRatio: 0, toRatio: 1 });
    const label = f === null ? '  필터 없음(현재)' : `  marketZ < ${f} 보류`;
    console.log(row(label, r));
    out.push({ floor: f, full: { trades: r.totalTrades, winRate: r.winRate, ann: r.annualizedPct, mdd: r.maxDrawdown, blocked: r.blocked.하락국면 } });
    delete r.trades; delete r.equity;
  }

  console.log('\n===== 학습(70%) / 검증(30%) 분리 =====');
  console.log(HEAD);
  for (const f of FLOORS) {
    const P = Object.assign({}, BASE, { MARKET_Z_FLOOR: f });
    const tr = lib.simulate(ds, P, { fromRatio: 0, toRatio: TRAIN_RATIO });
    const va = lib.simulate(ds, P, { fromRatio: TRAIN_RATIO, toRatio: 1 });
    const label = f === null ? '필터 없음(현재)' : `marketZ < ${f}`;
    console.log(row('  [학습] ' + label, tr));
    console.log(row('  [검증] ' + label, va));
    const rec = out.find(o => o.floor === f);
    rec.train = { ann: tr.annualizedPct, mdd: tr.maxDrawdown, trades: tr.totalTrades };
    rec.valid = { ann: va.annualizedPct, mdd: va.maxDrawdown, trades: va.totalTrades };
  }

  fs.writeFileSync(path.join(lib.OUT_DIR, 'driftfilter_result.json'),
    JSON.stringify({ base: BASE, coins: ready.map(c => c[0]), results: out }, null, 2));
  console.log('\n저장: driftfilter_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
