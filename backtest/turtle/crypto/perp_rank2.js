// selection dates: monthly 2019-10..2020-06 (perp universe still forming), quarterly afterwards; top20 by trailing-60d avg quote volume, >=75d history
const fs=require('fs');
const EXCL=/^(USDC|BTCDOM|DEFI|FOOTBALL|BLUEBIRD|XAU|XAG|XPT|XPD|TSLA|NVDA|AAPL|MSTR|COIN|HOOD|AMZN|GOOGL|META|MSFT|QQQ|SPY|CRCL|EUR|GBP|JPY|USDE|FDUSD|USD1|BUSD|TUSD|PAXG|XAUT|INTC|AMD|PLTR|SNDK|EWY|EWJ|NATGAS|CL|BZ|COPPER|WTI|BRENT|GC|SI)USDT$/;
const D={};for(const f of fs.readdirSync('data/perp1d')){const s=f.replace('.json','');if(EXCL.test(s))continue;const a=JSON.parse(fs.readFileSync('data/perp1d/'+f));if(a.length<80)continue;D[s]=new Map(a.map(r=>[Math.floor(r[0]/864e5),r[5]]));D[s].first=Math.floor(a[0][0]/864e5);}
const dates=[];for(let y=2019;y<=2026;y++)for(let m=1;m<=12;m++){const k=`${y}-${String(m).padStart(2,'0')}-01`;if(k<'2019-10-01'||k>'2026-09-01')continue;if(k<'2020-07-01'||[1,4,7,10].includes(m))dates.push(k);}
const out={};const union=new Set();
for(const k of dates){const q=Date.parse(k)/864e5;const rk=[];for(const s in D){if(q-D[s].first<75)continue;let v=0,n=0;for(let d=q-60;d<q;d++){const x=D[s].get(d);if(x!=null){v+=x;n++}}if(n>=55)rk.push([s,v/n]);}
 rk.sort((a,b)=>b[1]-a[1]);out[k]=rk.slice(0,20).map(x=>x[0]);out[k].forEach(s=>union.add(s));}
fs.writeFileSync('data/perp_universe.json',JSON.stringify(out,null,0));
const have=new Set(fs.readdirSync('data/perp1h').map(f=>f.replace('.json','')));
console.log([...union].filter(s=>!have.has(s)).join(' '));for(const k of dates.slice(0,10))console.log(k,out[k].length,out[k].join(' '));
