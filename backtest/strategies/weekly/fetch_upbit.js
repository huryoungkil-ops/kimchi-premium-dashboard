// Upbit KRW 일봉 전체 이력 수집 (생존 종목만 — market/all에 상장폐지 종목 없음)
const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(u){for(let i=0;i<6;i++){try{const r=await fetch(u,{headers:{accept:'application/json'}});if(r.status===429){await sleep(1000*(i+1));continue;}if(!r.ok)throw new Error(r.status);return await r.json();}catch(e){await sleep(800*(i+1));}}throw new Error('fail '+u);}
(async()=>{
 const mk=(await get('https://api.upbit.com/v1/market/all')).filter(m=>m.market.startsWith('KRW-')).map(m=>m.market);
 fs.writeFileSync('data/upbit_markets.json',JSON.stringify(mk));
 const out={};let n=0;
 for(const m of mk){let to='';const rows=[];
  while(true){const u=`https://api.upbit.com/v1/candles/days?market=${m}&count=200`+(to?`&to=${encodeURIComponent(to)}`:'');
   const a=await get(u);await sleep(130);if(!a.length)break;
   for(const c of a)rows.push([c.candle_date_time_utc.slice(0,10),c.opening_price,c.high_price,c.low_price,c.trade_price,c.candle_acc_trade_price]);
   if(a.length<200)break;to=a[a.length-1].candle_date_time_utc.replace('T',' ');}
  rows.sort((x,y)=>x[0]<y[0]?-1:1);const d={};const u=[];for(const r of rows){if(!d[r[0]]){d[r[0]]=1;u.push(r);}}
  out[m]=u;n++;if(n%20==0)console.log(n,m,u.length,u[0]&&u[0][0]);}
 fs.writeFileSync('data/upbit_daily.json',JSON.stringify(out));console.log('done',n);
})();
