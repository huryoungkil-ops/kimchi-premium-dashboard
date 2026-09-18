// 기회비용이 문제라면, 물린 포지션을 강제로 내보내는 것보다
// 자리를 늘리는 쪽이 낫지 않은지 확인한다.
const fs = require('fs'), path = require('path');
const lib = require('./lib5m');
const Y = 6;
const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${Y}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${Y}y.json`)));
lib.COINS.length = 0; for (const c of ready) lib.COINS.push(c);
const BASE = { ENTRY_SIGMA: 1, EDGE_MULTIPLE: 5, EXIT_SIGMA_OFFSET: 0.5, MAX_HOLD_DAYS: 999, STOP_LOSS_PP: 999 };

(async () => {
  const ds = await lib.buildDataset({ yearsBack: Y, log: () => {} });
  console.log('\n=== 동시 보유 자리 수별 (강제청산 없음, 자리당 시드의 10%) ===');
  console.log('자리  최대투입   거래    승률    연환산     건당      MDD');
  for (const m of [1, 2, 3, 4, 5, 6, 8, 10]) {
    const r = lib.simulate(ds, Object.assign({}, BASE, { MAX_POSITIONS: m }), { fromRatio: 0, toRatio: 1 });
    console.log(
      String(m).padEnd(5) + String(m * 10 + '%').padStart(7)
      + String(r.totalTrades).padStart(8) + String(r.winRate + '%').padStart(8)
      + String((r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%').padStart(9)
      + String('$' + r.avgNetPerTrade).padStart(8) + String('$' + r.maxDrawdown).padStart(9));
  }
  // 자리가 막혀서 놓친 기회가 실제로 얼마나 되는지
  const r3 = lib.simulate(ds, Object.assign({}, BASE, { MAX_POSITIONS: 3 }), { fromRatio: 0, toRatio: 1 });
  const r10 = lib.simulate(ds, Object.assign({}, BASE, { MAX_POSITIONS: 10 }), { fromRatio: 0, toRatio: 1 });
  console.log(`\n자리 3개일 때 ${r3.totalTrades}건 → 10개일 때 ${r10.totalTrades}건 (놓친 기회 ${r10.totalTrades - r3.totalTrades}건)`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
