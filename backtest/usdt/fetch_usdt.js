// 업비트 KRW-USDT 5분봉 전체(상장 이후) 수집 → cache_upbit_usdt_5m.json [{ts, close, value}]
const fs = require('fs');
const OUT = __dirname + '/cache_upbit_usdt_5m.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = []; let to = new Date().toISOString().slice(0, 19) + 'Z';
  for (let k = 0; k < 5000; k++) {
    let j;
    for (let t = 0; t < 6; t++) { const r = await fetch(`https://api.upbit.com/v1/candles/minutes/5?market=KRW-USDT&count=200&to=${to}`); if (r.status === 429) { await sleep(1500); continue; } j = await r.json(); break; }
    if (!Array.isArray(j) || !j.length) break;
    for (const c of j) out.push({ ts: Date.parse(c.candle_date_time_utc + 'Z'), close: c.trade_price, value: c.candle_acc_trade_price });
    to = j[j.length - 1].candle_date_time_utc + 'Z';
    if (k % 100 === 0) console.error(k, to, out.length);
    await sleep(130);
  }
  out.sort((a, b) => a.ts - b.ts);
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('bars', out.length, new Date(out[0].ts).toISOString(), new Date(out.at(-1).ts).toISOString());
})();
