import fs from 'fs';
const j=async u=>(await fetch(u)).json();
const out={time:new Date().toISOString(),binancePerp:{},binanceSpot:{},bybit:{}};
for (const s of ['XAUUSDT','XAGUSDT','CLUSDT','BZUSDT','NATGASUSDT','COPPERUSDT','PAXGUSDT','XAUTUSDT','TSLAUSDT','SPYUSDT']) {
  const [oi,t,p]=await Promise.all([j(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${s}`),j(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${s}`),j(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${s}`)]);
  out.binancePerp[s]={oiUsdM:+(oi.openInterest*p.markPrice/1e6).toFixed(1),vol24hUsdM:+(t.quoteVolume/1e6).toFixed(1),mark:+p.markPrice,index:+p.indexPrice,lastFunding:+p.lastFundingRate};
}
for (const s of ['PAXGUSDT','XAUTUSDT']) { const t=await j(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`); out.binanceSpot[s]={vol24hUsdM:+(t.quoteVolume/1e6).toFixed(1),last:+t.lastPrice}; }
for (const s of ['XAUUSDT','CLUSDT','BZUSDT','XAUTUSDT','PAXGUSDT']) { const t=await j(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${s}`); const r=t.result.list[0]; out.bybit[s]={oiUsdM:+(r.openInterestValue/1e6).toFixed(1),vol24hUsdM:+(r.turnover24h/1e6).toFixed(1),funding:+r.fundingRate}; }
for (const s of ['TSLAXUSDT','NVDAXUSDT','XAUTUSDT']) { const t=await j(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${s}`); const r=t.result.list[0]; out.bybit['spot_'+s]={vol24hUsdM:+(r.turnover24h/1e6).toFixed(2)}; }
console.log(JSON.stringify(out,null,1)); fs.writeFileSync('data/market_snapshot.json',JSON.stringify(out,null,1));
