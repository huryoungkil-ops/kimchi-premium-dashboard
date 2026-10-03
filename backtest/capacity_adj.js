// capacity.js 결과에 «지금 코빗 호가창 슬리피지»를 거래마다 빼 본다(호가창 부족 = 그 거래 못 함).
// 과거 호가창이 없어 오늘 스냅샷 하나를 6년 전체에 적용한 근사치다.
const lib = require('./lib5m');
const cap = require('./capacity_result.json');
(async () => {
  const ds = await lib.buildDataset({ yearsBack: cap.years });
  const out = [];
  cap.slippage.sizes.forEach((s, si) => {
    const r = lib.simulate(ds, Object.assign({}, lib.LIVE_PARAMS, { SIZING: 'equity', FIXED_SIZE_USD: s }), { fromRatio: 0, toRatio: 1 });
    const yrs = (new Date(r.range.to) - new Date(r.range.from)) / 3.156e10;
    let net = 0, n = 0, wins = 0, dropped = 0; const byCoin = {};
    for (const t of r.trades) {
      const slip = (cap.slippage.coins[t.coin] || [])[si];
      if (slip == null) { dropped++; continue; }
      // 백테스트가 이미 뺀 스프레드 비용(spreadCost)을 넘는 만큼만 추가로 뺀다
      const p = t.netProfit - Math.max(0, t.sizeUsd * slip / 100 - (t.spreadCost || 0));
      net += p; n++; if (p > 0) wins++;
      byCoin[t.coin] = (byCoin[t.coin] || 0) + 1;
    }
    out.push({ s, n, dropped, win: wins / n * 100, net, annual: net / (s * 10) / yrs * 100, byCoin });
    console.log(s, n, dropped, (wins / n * 100).toFixed(1), net.toFixed(0), (net / (s * 10) / yrs * 100).toFixed(2), JSON.stringify(byCoin));
  });
  require('fs').writeFileSync(__dirname + '/capacity_adj_result.json', JSON.stringify(out, null, 2));
})();
