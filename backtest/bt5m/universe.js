// 빗썸 원화 마켓 ∩ 바이낸스 USDT 무기한(1000·1000000 배수 포함) — 빗썸 24시간 거래대금 순
const fs = require('fs');
(async () => {
  const mk = await (await fetch('https://api.bithumb.com/v1/market/all')).json();
  const krw = mk.filter(m => m.market.startsWith('KRW-')).map(m => m.market.slice(4));
  const ex = await (await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo')).json();
  const fut = {};
  for (const s of ex.symbols) {
    if (s.contractType !== 'PERPETUAL' || s.quoteAsset !== 'USDT') continue;
    const m = s.baseAsset.match(/^(1000000|1000)?(.+)$/), coin = m[2], mult = m[1] ? Number(m[1]) : 1;
    if (fut[coin] && fut[coin].mult === 1) continue;
    fut[coin] = { symbol: s.symbol, mult, status: s.status, onboard: s.onboardDate };
  }
  const both = krw.filter(c => fut[c] && !['USDT', 'USDC', 'DAI'].includes(c));
  const vol = {};
  for (let i = 0; i < both.length; i += 50) {
    const t = await (await fetch('https://api.bithumb.com/v1/ticker?markets=' + both.slice(i, i + 50).map(c => 'KRW-' + c).join(','))).json();
    for (const x of t) vol[x.market.slice(4)] = x.acc_trade_price_24h;
  }
  const list = both.map(c => ({ coin: c, ...fut[c], vol24: vol[c] || 0 })).sort((a, b) => b.vol24 - a.vol24);
  fs.writeFileSync('data/universe.json', JSON.stringify(list, null, 1));
  console.log('빗썸 원화', krw.length, '· 바이낸스 무기한과 겹침', both.length, '· 상위 120 마지막', list[119] && list[119].coin, Math.round(list[119].vol24 / 1e6) + '백만원');
})();
