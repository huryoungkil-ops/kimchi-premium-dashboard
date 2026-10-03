// Binance USDT 현물 일봉 — 현재 24h 거래대금 상위 + 일부 상장폐지 종목
const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(u){for(let i=0;i<6;i++){try{const r=await fetch(u);if(r.status===429||r.status===418){await sleep(5000);continue;}if(r.status===400)return null;if(!r.ok)throw new Error(r.status);return await r.json();}catch(e){await sleep(1000*(i+1));}}return null;}
const STABLE=new Set(['USDC','BUSD','TUSD','FDUSD','USDP','DAI','PAX','USDS','EUR','GBP','AEUR','UST','USTC','EURI','USDE','XUSD','RLUSD','BFUSD','PAXG','WBTC','WBETH','BNSOL','SUSD','USD1','U']);
(async()=>{
 const t=await get('https://api.binance.com/api/v3/ticker/24hr');
 let syms=t.filter(x=>x.symbol.endsWith('USDT')).map(x=>({s:x.symbol,b:x.symbol.slice(0,-4),q:+x.quoteVolume}))
  .filter(x=>!STABLE.has(x.b)&&!/(UP|DOWN|BULL|BEAR)$/.test(x.b)).sort((a,b)=>b.q-a.q).slice(0,60).map(x=>x.s);
 const delisted=['LUNAUSDT','FTTUSDT','SRMUSDT','BTTUSDT','XMRUSDT','WAVESUSDT','ANCUSDT','MIRUSDT','HNTUSDT','RNDRUSDT','OMGUSDT','BCCUSDT','VENUSDT','NPXSUSDT','EOSUSDT','MATICUSDT','FTMUSDT','KLAYUSDT','MCUSDT','CVCUSDT','BSVUSDT','XEMUSDT','STRATUSDT','WTCUSDT','BCHABCUSDT','BCHSVUSDT','KEEPUSDT','NUUSDT','DNTUSDT','REPUSDT','LENDUSDT','BZRXUSDT','AUTOUSDT','GTOUSDT','TCTUSDT','AGIXUSDT','OCEANUSDT','MULTIUSDT','ELFUSDT','LOOMUSDT'];
 if(!syms.includes('BTCUSDT'))syms.unshift('BTCUSDT');
 const all=[...new Set([...syms,...delisted])];const out={};
 for(const s of all){let st=Date.UTC(2017,7,1);const rows=[];
  while(true){const a=await get(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=1d&limit=1000&startTime=${st}`);await sleep(150);
   if(!a||!a.length)break;for(const k of a)rows.push([new Date(k[0]).toISOString().slice(0,10),+k[1],+k[2],+k[3],+k[4],+k[7]]);
   if(a.length<1000)break;st=a[a.length-1][0]+86400000;}
  if(rows.length){out[s]=rows;console.log(s,rows.length,rows[0][0],rows[rows.length-1][0]);}else console.log(s,'none');}
 fs.writeFileSync('data/binance_daily.json',JSON.stringify(out));fs.writeFileSync('data/binance_universe.json',JSON.stringify({top:syms,delisted_tried:delisted}));console.log('done');
})();
