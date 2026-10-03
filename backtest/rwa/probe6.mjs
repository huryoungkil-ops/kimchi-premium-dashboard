const j = async (u,o)=>{const r=await fetch(u,o);return r.json()};
const sp=await j('https://api.bybit.com/v5/market/instruments-info?category=spot&limit=1000');
console.log('bybit spot x:',sp.result.list.filter(s=>/X$|XUSDT$|^XAU|^PAXG/.test(s.baseCoin+'') || /X(USDT|USDC)$/.test(s.symbol)).map(s=>s.symbol).join(' '));
for (const s of ['XAUTUSDT']) { const d=await j(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${s}&interval=D&start=1500000000000&limit=1000`); const l=d.result.list; console.log(s,'earliest D',new Date(+l[l.length-1][0]).toISOString(), l.length);}
for (const s of ['XAUT-USDT','PAXG-USDT']) { const d=await j(`https://www.okx.com/api/v5/market/history-candles?instId=${s}&bar=1Dutc&after=1600000000000&limit=100`); console.log(s, d.data.length? new Date(+d.data[d.data.length-1][0]).toISOString():'none', d.data.length);
 const d2=await j(`https://www.okx.com/api/v5/market/history-candles?instId=${s}&bar=1H&after=1600000000000&limit=100`); console.log(s,'1H', d2.data.length, d2.data[0]&&new Date(+d2.data[0][0]).toISOString());}
const k=await j('https://api.kraken.com/0/public/AssetPairs'); const kp=Object.keys(k.result||{}).filter(x=>/TSLAX|NVDAX|SPYX|XAUT|PAXG/i.test(x)); console.log('kraken',kp.join(' '), k.error);
const hl = await j('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'candleSnapshot',req:{coin:'xyz:HO',interval:'1d',startTime:Date.now()-20*864e5,endTime:Date.now()}})}); console.log('HL HO', JSON.stringify(hl).slice(0,300));
