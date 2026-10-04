const fs=require('fs');
const syms=['ZB','ZN','ZF','ZT','SR3','6E','6J','6B','6S','6C','6A','GC','SI','HG','CL','HO','RB','NG','KC','CC','SB','CT','ZC','ZW','ZS','ES','NQ','LE','HE'];
(async()=>{for(const s of syms){const y=s+'=F';
 try{const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?period1=0&period2=1791000000&interval=1d`,{headers:{'User-Agent':'Mozilla/5.0'}});
 const j=await r.json();const res=j.chart.result[0];const t=res.timestamp,q=res.indicators.quote[0];
 let rows=['date,open,high,low,close,volume'];let n=0;
 for(let i=0;i<t.length;i++){if(q.close[i]==null||q.open[i]==null||q.high[i]==null||q.low[i]==null)continue;
  const d=new Date((t[i]+res.meta.gmtoffset)*1000).toISOString().slice(0,10);rows.push([d,q.open[i],q.high[i],q.low[i],q.close[i],q.volume[i]??0].join(','));n++;}
 fs.writeFileSync(`data/${s}.csv`,rows.join('\n'));console.log(s,n,rows[1]?.slice(0,10),rows.at(-1).slice(0,40));
 }catch(e){console.log(s,'ERR',e.message)}
 await new Promise(r=>setTimeout(r,400));}})();
