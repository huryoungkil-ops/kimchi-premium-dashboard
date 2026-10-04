const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const coins='BTC ETH XRP ADA DOGE SOL TRX LINK BCH ETC XLM DOT AVAX QTUM NEO SUI HBAR'.split(' ');
async function get(u){for(let i=0;i<8;i++){try{const r=await fetch(u,{headers:{accept:'application/json'}});if(r.status==429){await sleep(1500);continue}if(!r.ok){await sleep(1000);continue}return await r.json()}catch(e){await sleep(2000)}}return null}
(async()=>{for(const c of coins){const fn=`data/upbit1h/${c}.json`;if(fs.existsSync(fn))continue;const m='KRW-'+c;
 let out=[],to=null;
 while(true){const u=`https://api.upbit.com/v1/candles/minutes/60?market=${m}&count=200`+(to?`&to=${encodeURIComponent(to)}`:'');
  const j=await get(u);if(!j||!j.length)break;
  for(const k of j)out.push([Date.parse(k.candle_date_time_utc+'Z'),k.opening_price,k.high_price,k.low_price,k.trade_price,k.candle_acc_trade_price]);
  to=j.at(-1).candle_date_time_utc+'Z';if(Date.parse(to)<Date.parse('2017-12-01'))break;if(j.length<200)break;await sleep(120)}
 out.sort((a,b)=>a[0]-b[0]);const dd=[];let last=-1;for(const r of out){if(r[0]!==last)dd.push(r);last=r[0]}
 fs.writeFileSync(fn,JSON.stringify(dd));console.log(c,dd.length,new Date(dd[0][0]).toISOString())}console.log('done')})();
