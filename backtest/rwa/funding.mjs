import fs from 'fs';
const j=async u=>(await fetch(u)).json();
const out={};
for (const s of ['XAUUSDT','PAXGUSDT','XAUTUSDT','TSLAUSDT','CLUSDT','BZUSDT']) {
  let st=0, all=[];
  while(true){const d=await j(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${s}&startTime=${st}&limit=1000`); if(!d.length)break; all.push(...d.map(x=>[x.fundingTime,+x.fundingRate])); st=d.at(-1).fundingTime+1; if(d.length<1000)break;}
  const n=all.length, mean=all.reduce((a,b)=>a+b[1],0)/n, days=(all.at(-1)[0]-all[0][0])/864e5;
  const iv = n>1? days*24/(n-1):null;
  out[s]={n, from:new Date(all[0][0]).toISOString().slice(0,10), meanPerInterval:mean, intervalH:+iv.toFixed(2), annualizedPct:+(mean*(24/iv)*365*100).toFixed(2), maxAbs:Math.max(...all.map(x=>Math.abs(x[1]))), pctZero:+(all.filter(x=>x[1]===0).length/n*100).toFixed(1)};
}
console.log(out); fs.writeFileSync('data/funding_summary.json',JSON.stringify(out,null,1));
