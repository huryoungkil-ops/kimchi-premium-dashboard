const fs=require('fs');
const syms=process.argv.slice(2);
(async()=>{for(const s of syms){try{
const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?period1=946684800&period2=1791000000&interval=1d`,{headers:{'User-Agent':'Mozilla/5.0'}});
const j=await r.json();const res=j.chart.result?.[0];if(!res){console.log(s,'none',JSON.stringify(j.chart.error));continue;}
const t=res.timestamp||[];const c=res.indicators.quote[0].close;
const rows=t.map((x,i)=>[new Date(x*1000+ (res.meta.gmtoffset||0)*1000).toISOString().slice(0,10),c[i]]).filter(r=>r[1]!=null&&r[1]>0);
fs.writeFileSync('data/'+s.replace(/[=^]/g,'_')+'.csv','date,close\n'+rows.map(r=>r.join(',')).join('\n'));
console.log(s,rows.length,rows[0]?.[0],rows.at(-1)?.join(' '));}catch(e){console.log(s,'err',e.message)}}})();
