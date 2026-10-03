// Public data downloader: hourly closes -> data/<name>.json as [[t_ms, close, quoteVol]]
import fs from 'fs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const j = async (u,o)=>{for(let i=0;i<5;i++){try{const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'},...o});if(r.status===429){await sleep(3000);continue;}return await r.json();}catch(e){await sleep(1500)}}throw new Error('fail '+u)};
const H=3600e3, NOW=Date.now();
const save=(n,a)=>{const m=new Map();a.forEach(r=>m.set(r[0],r));const s=[...m.values()].sort((x,y)=>x[0]-y[0]);fs.writeFileSync(`data/${n}.json`,JSON.stringify(s));console.log(n,s.length,s.length?new Date(s[0][0]).toISOString().slice(0,13):'',s.length?new Date(s.at(-1)[0]).toISOString().slice(0,13):'');};
async function binance(n,base,sym){let out=[],st=0;while(true){const d=await j(`${base}?symbol=${sym}&interval=1h&startTime=${st}&limit=1000`);if(!Array.isArray(d)||!d.length)break;out.push(...d.map(k=>[k[0],+k[4],+k[7]]));st=d.at(-1)[0]+H;if(d.length<1000)break;}save(n,out);}
async function bybit(n,cat,sym){let out=[],end=NOW;while(true){const d=await j(`https://api.bybit.com/v5/market/kline?category=${cat}&symbol=${sym}&interval=60&end=${end}&limit=1000`);const l=d.result?.list||[];if(!l.length)break;out.push(...l.map(k=>[+k[0],+k[4],+k[6]]));end=+l.at(-1)[0]-H;if(l.length<1000)break;await sleep(150);}save(n,out);}
async function bitfinex(n,sym){let out=[],st=1577836800000;while(st<NOW){const d=await j(`https://api-pub.bitfinex.com/v2/candles/trade:1h:${sym}/hist?limit=10000&sort=1&start=${st}`);if(!Array.isArray(d)||!d.length)break;out.push(...d.map(k=>[k[0],k[2],k[5]*k[2]]));st=d.at(-1)[0]+H;if(d.length<10000)break;await sleep(2500);}save(n,out);}
async function okx(n,inst){let out=[],after=NOW;while(true){const d=await j(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=1H&after=${after}&limit=100`);const l=d.data||[];if(!l.length)break;out.push(...l.map(k=>[+k[0],+k[4],+k[7]]));after=+l.at(-1)[0];await sleep(120);}save(n,out);}
async function yahoo(n,sym,interval,range){const d=await j(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${range==="PERIOD"?"period1=1577836800&period2=1791100000":"range="+range}&interval=${interval}`);const r=d.chart.result[0];const out=r.timestamp.map((t,i)=>[t*1000,r.indicators.quote[0].close[i],r.indicators.quote[0].volume[i]]).filter(x=>x[1]!=null);save(n,out);}
async function hl(n,coin){let out=[],st=NOW-400*864e5;while(st<NOW){const d=await j('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'candleSnapshot',req:{coin,interval:'1h',startTime:st,endTime:NOW}})});if(!Array.isArray(d)||!d.length)break;out.push(...d.map(k=>[k.t,+k.c,+k.v*+k.c]));const ns=d.at(-1).t+H;if(ns<=st)break;st=ns;if(d.length<500)break;}save(n,out);}
const S='https://api.binance.com/api/v3/klines', F='https://fapi.binance.com/fapi/v1/klines';
const jobs=[
 ()=>binance('bn_spot_PAXG',S,'PAXGUSDT'), ()=>binance('bn_spot_XAUT',S,'XAUTUSDT'),
 ()=>binance('bn_perp_XAU',F,'XAUUSDT'), ()=>binance('bn_perp_PAXG',F,'PAXGUSDT'), ()=>binance('bn_perp_XAUT',F,'XAUTUSDT'),
 ()=>binance('bn_perp_TSLA',F,'TSLAUSDT'), ()=>binance('bn_perp_NVDA',F,'NVDAUSDT'), ()=>binance('bn_perp_SPY',F,'SPYUSDT'),
 ()=>binance('bn_perp_CL',F,'CLUSDT'), ()=>binance('bn_perp_BZ',F,'BZUSDT'),
 ()=>bybit('by_spot_XAUT','spot','XAUTUSDT'), ()=>bybit('by_spot_PAXG','spot','PAXGUSDT'),
 ()=>bybit('by_spot_TSLAX','spot','TSLAXUSDT'), ()=>bybit('by_spot_NVDAX','spot','NVDAXUSDT'), ()=>bybit('by_spot_AAPLX','spot','AAPLXUSDT'),
 ()=>bybit('by_perp_XAU','linear','XAUUSDT'),
 ()=>bitfinex('bfx_XAUT_UST','tXAUT:UST'),
 ()=>okx('okx_XAUT','XAUT-USDT'),
 ()=>yahoo('yh_GC_1h','GC=F','1h','730d'), ()=>yahoo('yh_GC_1d','GC=F','1d','PERIOD'),
 ()=>yahoo('yh_TSLA_1h','TSLA','1h','730d'), ()=>yahoo('yh_NVDA_1h','NVDA','1h','730d'), ()=>yahoo('yh_AAPL_1h','AAPL','1h','730d'), ()=>yahoo('yh_SPY_1h','SPY','1h','730d'),
 ()=>yahoo('yh_USDT_1h','USDT-USD','1h','730d'),
 ()=>hl('hl_CL','xyz:CL'), ()=>hl('hl_BRENT','xyz:BRENTOIL'), ()=>hl('hl_GOLD','xyz:GOLD'),
];
const only=process.argv[2];
for (const f of jobs){ if(only && !f.toString().includes(only)) continue; try{await f()}catch(e){console.log('ERR',f.toString().slice(6,40),e.message)} }
