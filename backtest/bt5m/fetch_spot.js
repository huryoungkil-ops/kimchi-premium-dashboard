// Binance 현물 일봉(UTC) 2020-01 ~ — 펀딩 캐리의 현물 다리. 현물이 없는 종목은 건너뛴다(캐리 불가)
const fs = require('fs');
(async () => {
  const ex = await (await fetch('https://api.binance.com/api/v3/exchangeInfo')).json();
  const spot = new Set(ex.symbols.filter(s => s.quoteAsset === 'USDT').map(s => s.baseAsset));
  const uni = JSON.parse(fs.readFileSync('data/universe.json')).slice(0, 120);
  let have = 0;
  for (const u of uni) {
    if (!spot.has(u.coin)) continue;
    const rows = []; let start = Date.parse('2020-01-01T00:00:00Z');
    for (;;) { const a = await (await fetch(`https://api.binance.com/api/v3/klines?symbol=${u.coin}USDT&interval=1d&startTime=${start}&limit=1000`)).json();
      if (!Array.isArray(a) || !a.length) break; for (const k of a) rows.push([Math.round(k[0] / 60000), +k[4], +k[2]]); start = a.at(-1)[0] + 864e5; if (a.length < 1000) break; }
    fs.writeFileSync(`data/spot/${u.coin}.json`, JSON.stringify(rows)); have++;
  }
  console.log('120종목 중 바이낸스 현물 있는 종목', have, '· 현물 없음(선물만):', uni.filter(u => !spot.has(u.coin)).map(u => u.coin).join(' '));
})();
