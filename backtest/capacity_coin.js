// 규모별·코인별 슬리피지 반영 손익 — 손해 나는 코인을 빼면 어디까지 남는가(사후 선택이라 낙관적).
const lib = require('./lib5m');
const cap = require('./capacity_result.json');
(async () => {
  const ds = await lib.buildDataset({ yearsBack: cap.years });
  const rows = [];
  cap.slippage.sizes.forEach((s, si) => {
    const r = lib.simulate(ds, Object.assign({}, lib.LIVE_PARAMS, { SIZING: 'equity', FIXED_SIZE_USD: s }), { fromRatio: 0, toRatio: 1 });
    const yrs = (new Date(r.range.to) - new Date(r.range.from)) / 3.156e10;
    const by = {};
    for (const t of r.trades) {
      const slip = (cap.slippage.coins[t.coin] || [])[si];
      const b = by[t.coin] = by[t.coin] || { n: 0, raw: 0, adj: 0, ok: slip != null };
      b.n++; b.raw += t.netProfit;
      if (slip != null) b.adj += t.netProfit - Math.max(0, t.sizeUsd * slip / 100 - (t.spreadCost || 0));
    }
    const keep = Object.entries(by).filter(([, b]) => b.ok && b.adj > 0);
    const net = keep.reduce((a, [, b]) => a + b.adj, 0);
    rows.push({ s, annualRaw: r.netProfit / (s * 10) / yrs * 100, annualFiltered: net / (s * 10) / yrs * 100, keep: keep.map(([c]) => c), byCoin: by });
    console.log(s, (r.netProfit / (s * 10) / yrs * 100).toFixed(2), (net / (s * 10) / yrs * 100).toFixed(2), keep.map(([c, b]) => c + ':' + b.adj.toFixed(0)).join(' '));
    console.log('   all:', Object.entries(by).map(([c, b]) => `${c} raw${b.raw.toFixed(0)} adj${b.ok ? b.adj.toFixed(0) : 'X'}`).join(' | '));
  });
  require('fs').writeFileSync(__dirname + '/capacity_coin_result.json', JSON.stringify(rows, null, 2));
})();
