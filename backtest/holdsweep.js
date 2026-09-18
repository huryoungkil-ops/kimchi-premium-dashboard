// 최대 보유 기간과 손절폭을 실제 데이터로 재본다.
// 슬롯이 3개뿐이라 오래 물린 포지션은 그 자체로 기회비용이다.
const fs = require('fs'), path = require('path');
const lib = require('./lib5m');
const Y = 6;
const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${Y}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${Y}y.json`)));
lib.COINS.length = 0; for (const c of ready) lib.COINS.push(c);

const BASE = { ENTRY_SIGMA: 1, EDGE_MULTIPLE: 5, EXIT_SIGMA_OFFSET: 0.5, REQUIRE_PROFIT_EXIT: false };

(async () => {
  const ds = await lib.buildDataset({ yearsBack: Y, log: () => {} });

  // 1) 보유시간 분포 (현재 설정)
  const base = lib.simulate(ds, Object.assign({}, BASE, { MAX_HOLD_DAYS: 999, STOP_LOSS_PP: 999 }), { fromRatio: 0, toRatio: 1 });
  const h = base.trades.map(t => t.holdHours).sort((a, b) => a - b);
  const q = p => h[Math.floor(h.length * p)];
  console.log(`\n=== 강제청산 없을 때 보유시간 분포 (${base.totalTrades}건) ===`);
  console.log(`  중앙 ${q(.5).toFixed(1)}h | 75% ${q(.75).toFixed(1)}h | 90% ${q(.90).toFixed(1)}h | 95% ${q(.95).toFixed(1)}h | 99% ${q(.99).toFixed(1)}h | 최대 ${(h[h.length-1]/24).toFixed(1)}일`);
  for (const d of [0.25, 0.5, 1, 2, 3, 7]) {
    const over = h.filter(x => x > d * 24).length;
    console.log(`  ${String(d).padStart(5)}일 초과: ${String(over).padStart(5)}건 (${(over / h.length * 100).toFixed(1)}%)`);
  }

  // 2) 최대 보유 기간 스윕
  console.log('\n=== 최대 보유 기간별 (손절 없음) ===');
  console.log('보유상한   거래    승률    연환산     건당      MDD   강제청산');
  for (const d of [0.25, 0.5, 1, 2, 3, 5, 7, 999]) {
    const r = lib.simulate(ds, Object.assign({}, BASE, { MAX_HOLD_DAYS: d, STOP_LOSS_PP: 999 }), { fromRatio: 0, toRatio: 1 });
    console.log(
      (d === 999 ? '없음' : d + '일').padEnd(10)
      + String(r.totalTrades).padStart(6) + String(r.winRate + '%').padStart(8)
      + String((r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%').padStart(9)
      + String('$' + r.avgNetPerTrade).padStart(8) + String('$' + r.maxDrawdown).padStart(9)
      + String(r.exitReasons.MAXHOLD).padStart(9));
  }

  // 3) 손절폭 스윕 (보유상한은 위 최적값과 무관하게 넉넉히)
  console.log('\n=== 손절폭별 (보유상한 2일) ===');
  console.log('손절폭    거래    승률    연환산     건당      MDD    손절발동');
  for (const s of [0.5, 1, 1.5, 2, 3, 5, 999]) {
    const r = lib.simulate(ds, Object.assign({}, BASE, { MAX_HOLD_DAYS: 2, STOP_LOSS_PP: s }), { fromRatio: 0, toRatio: 1 });
    console.log(
      (s === 999 ? '없음' : s + '%p').padEnd(9)
      + String(r.totalTrades).padStart(6) + String(r.winRate + '%').padStart(8)
      + String((r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%').padStart(9)
      + String('$' + r.avgNetPerTrade).padStart(8) + String('$' + r.maxDrawdown).padStart(9)
      + String(r.exitReasons.STOP).padStart(10));
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
