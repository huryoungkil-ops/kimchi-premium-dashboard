const fs=require('fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function j(u){for(let i=0;i<4;i++){try{const r=await fetch(u);if(r.status===400)return {err:await r.text()};return await r.json();}catch(e){await sleep(1000)}}return {err:'net'}}
async function klines(mkt,sym,iv,start,end){
  const base=mkt==='spot'?'https://api.binance.com/api/v3/klines':'https://fapi.binance.com/fapi/v1/klines';
  const lim=mkt==='spot'?1000:1500;let out=[];let s=start;
  while(s<end){const d=await j(`${base}?symbol=${sym}&interval=${iv}&startTime=${s}&endTime=${end}&limit=${lim}`);
    if(!Array.isArray(d)){if(out.length===0)return {err:d.err};break;}
    if(d.length===0)break;
    out.push(...d.map(k=>[k[0],+k[1],+k[2],+k[3],+k[4],+k[5],+k[7]]));
    s=d[d.length-1][0]+1; if(d.length<lim)break; await sleep(150);}
  return out;}
async function funding(sym,start,end){let out=[];let s=start;
  while(s<end){const d=await j(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&startTime=${s}&endTime=${end}&limit=1000`);
   if(!Array.isArray(d)||d.length===0)break;out.push(...d.map(x=>[x.fundingTime,+x.fundingRate]));s=d[d.length-1].fundingTime+1;if(d.length<1000)break;await sleep(150);}
  return out;}
module.exports={klines,funding,j};
if(require.main===module)(async()=>{
  const args=process.argv.slice(2); // sym startISO endISO
  const syms=args[0].split(',');const st=Date.parse(args[1]);const en=Date.parse(args[2]);
  for(const sym of syms){
    const row={sym};
    for(const mkt of ['spot','perp']){
      const d=await klines(mkt,sym,'1d',st,en);
      if(d.err||d.length===0){row[mkt]='none';continue;}
      fs.writeFileSync(`data/${mkt}_${sym}_1d.json`,JSON.stringify(d));
      row[mkt]=`${new Date(d[0][0]).toISOString().slice(0,10)}..${new Date(d.at(-1)[0]).toISOString().slice(0,10)} n=${d.length}`;
    }
    if(row.perp!=='none'){const f=await funding(sym,st,en);fs.writeFileSync(`data/funding_${sym}.json`,JSON.stringify(f));row.fund=f.length;}
    console.log(JSON.stringify(row));
  }})();
