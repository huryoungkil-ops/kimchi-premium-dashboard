const urls = {
 binPaxg:'https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1h&startTime=0&limit=2',
 binXaut:'https://api.binance.com/api/v3/klines?symbol=XAUTUSDT&interval=1h&startTime=0&limit=2',
 fapiXau:'https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=1h&startTime=0&limit=2',
 fapiPaxg:'https://fapi.binance.com/fapi/v1/klines?symbol=PAXGUSDT&interval=1h&startTime=0&limit=2',
 fapiXag:'https://fapi.binance.com/fapi/v1/klines?symbol=XAGUSDT&interval=1h&startTime=0&limit=2',
 bybitXautSpot:'https://api.bybit.com/v5/market/kline?category=spot&symbol=XAUTUSDT&interval=60&start=0&limit=2',
 bybitXauLin:'https://api.bybit.com/v5/market/kline?category=linear&symbol=XAUTUSDT&interval=60&start=1&limit=2',
 bybitPaxgSpot:'https://api.bybit.com/v5/market/kline?category=spot&symbol=PAXGUSDT&interval=60&start=1&limit=2',
 okxXaut:'https://www.okx.com/api/v5/market/history-candles?instId=XAUT-USDT&bar=1H&limit=2',
 okxPaxg:'https://www.okx.com/api/v5/market/history-candles?instId=PAXG-USDT&bar=1H&limit=2',
 yahooGC:'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=2y&interval=1h',
};
for (const [k,u] of Object.entries(urls)) {
  try { const r = await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}}); const t = await r.text(); console.log(k, r.status, t.slice(0,250)); } catch(e){ console.log(k,'ERR',e.message) }
}
