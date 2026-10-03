// Binance USDT 현물 전 종목(거래중 TRADING + 거래중단/상폐 BREAK) 일봉 — 생존편향 완화용 유니버스 B2
const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(u){for(let i=0;i<6;i++){try{const r=await fetch(u);if(r.status===429||r.status===418){await sleep(10000);continue;}if(r.status===400)return null;if(!r.ok)throw new Error(r.status);return await r.json();}catch(e){await sleep(1000*(i+1));}}return null;}
const STABLE=new Set(['USDC','BUSD','TUSD','FDUSD','USDP','DAI','PAX','USDS','USDSB','EUR','GBP','AEUR','UST','USTC','EURI','USDE','XUSD','RLUSD','BFUSD','PAXG','XAUT','WBTC','WBETH','BNSOL','SUSD','USD1','U','BKRW','IDRT','BIDR','TRY','BRL','AUD','RUB','UAH','NGN','ZAR','USDSOLD','ERD']);
(async()=>{
 const j=await get('https://api.binance.com/api/v3/exchangeInfo');
 const syms=j.symbols.filter(s=>s.quoteAsset==='USDT'&&!STABLE.has(s.baseAsset)&&!/(UP|DOWN|BULL|BEAR)$/.test(s.baseAsset)&&!/^[A-Z0-9]+B$/.test(s.baseAsset.replace(/^(?!SPCX|CRCL|SNDK).*$/,''))).map(s=>({s:s.symbol,st:s.status}));
 const out={};let k=0;
 for(const {s} of syms){let st=Date.UTC(2017,7,1);const rows=[];
  while(true){const a=await get(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=1d&limit=1000&startTime=${st}`);await sleep(120);
   if(!a||!a.length)break;for(const x of a)rows.push([new Date(x[0]).toISOString().slice(0,10),+x[1],+x[2],+x[3],+x[4],+x[7]]);
   if(a.length<1000)break;st=a[a.length-1][0]+86400000;}
  if(rows.length)out[s]=rows;if(++k%50==0)console.log(k,s,rows.length);}
 fs.writeFileSync('data/binanceall_daily.json',JSON.stringify(out));
 fs.writeFileSync('data/binanceall_universe.json',JSON.stringify(syms));console.log('done',Object.keys(out).length);
})();
