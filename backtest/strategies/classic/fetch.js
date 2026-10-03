const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url,tries=6){for(let i=0;i<tries;i++){try{const r=await fetch(url);if(r.status===429||r.status>=500){await sleep(2000*(i+1));continue;}const j=await r.json();return j;}catch(e){await sleep(1500*(i+1));}}throw new Error('fail '+url);}
const END=Date.UTC(2026,9,1); // 2026-10-01 00:00 UTC exclusive (data through 2026-09-30)
async function binKlines(base,path,sym,interval,start){const out=[];let s=start;for(;;){const j=await get(`${base}${path}?symbol=${sym}&interval=${interval}&startTime=${s}&endTime=${END-1}&limit=1000`);if(!Array.isArray(j)){console.log(sym,j);break;}if(!j.length)break;for(const k of j)out.push([k[0],+k[1],+k[2],+k[3],+k[4],+k[7]]);s=j[j.length-1][0]+1;if(j.length<1000)break;await sleep(60);}return out;}
async function funding(sym){const out=[];let s=Date.UTC(2019,0,1);for(;;){const j=await get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&startTime=${s}&endTime=${END-1}&limit=1000`);if(!Array.isArray(j)||!j.length)break;for(const f of j)out.push([f.fundingTime,+f.fundingRate]);s=j[j.length-1].fundingTime+1;if(j.length<1000)break;await sleep(100);}return out;}
async function upbit(unit,market){ // unit: 'days' or minutes number
 const out=[];let to=new Date(END).toISOString().replace('.000Z','Z');
 for(;;){const url=unit==='days'?`https://api.upbit.com/v1/candles/days?market=${market}&count=200&to=${to}`:`https://api.upbit.com/v1/candles/minutes/${unit}?market=${market}&count=200&to=${to}`;
  const j=await get(url);if(!Array.isArray(j)||!j.length)break;
  for(const c of j)out.push([Date.parse(c.candle_date_time_utc+'Z'),c.opening_price,c.high_price,c.low_price,c.trade_price,c.candle_acc_trade_price]);
  to=c0(j[j.length-1]);if(j.length<200)break;await sleep(130);}
 out.sort((a,b)=>a[0]-b[0]);const d=[];for(const r of out){if(!d.length||d[d.length-1][0]!==r[0])d.push(r);}return d;}
function c0(c){return c.candle_date_time_utc+'Z';}
const save=(n,d)=>{fs.writeFileSync('data/'+n+'.json',JSON.stringify(d));console.log(n,d.length,d.length?new Date(d[0][0]).toISOString():'');};
(async()=>{
 const spot=['BTC','ETH','BNB','XRP','ADA','DOGE','SOL','LTC','TRX','LINK','XLM','ETC','BCH','DOT','AVAX','ATOM','EOS','FIL','UNI','NEAR','MATIC','POL'];
 const S=Date.UTC(2017,7,1);
 const job=process.argv[2]||'all';
 if(job==='all'||job==='spot')for(const c of spot){if(fs.existsSync(`data/spot_${c}_1d.json`))continue;save(`spot_${c}_1d`,await binKlines('https://api.binance.com','/api/v3/klines',c+'USDT','1d',S));}
 if(job==='all'||job==='intra')for(const c of ['BTC','ETH']){for(const iv of ['4h','1h']){if(fs.existsSync(`data/spot_${c}_${iv}.json`))continue;save(`spot_${c}_${iv}`,await binKlines('https://api.binance.com','/api/v3/klines',c+'USDT',iv,S));}}
 if(job==='all'||job==='perp')for(const c of spot){if(fs.existsSync(`data/perp_${c}_1d.json`))continue;const k=await binKlines('https://fapi.binance.com','/fapi/v1/klines',c+'USDT','1d',Date.UTC(2019,0,1));save(`perp_${c}_1d`,k);if(k.length)save(`fund_${c}`,await funding(c+'USDT'));}
 if(job==='all'||job==='upbit'){if(!fs.existsSync('data/upbit_BTC_1d.json'))save('upbit_BTC_1d',await upbit('days','KRW-BTC'));if(!fs.existsSync('data/upbit_BTC_60m.json'))save('upbit_BTC_60m',await upbit(60,'KRW-BTC'));}
})();
