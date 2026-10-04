const fs=require('fs');
const WK='C:/Users/허영길/AppData/Local/Temp/claude/C--test-kimchi-premium-dashboard/2659b0cb-f561-4bd0-86c6-731822d2e7a5/scratchpad/weekly/data/';
const D=JSON.parse(fs.readFileSync(WK+'binanceall_daily.json'));
const STABLE=/^(USDC|BUSD|TUSD|PAX|USDP|USDS|USDSB|FDUSD|DAI|EUR|GBP|AUD|TRY|BRL|UST|USTC|USDE|USD1|RLUSD|PAXG|XUSD|AEUR|EURI|BKRW|IDRT|BIDR|NGN|RUB|UAH|ZAR|SUSD|BVND|U|USDT)$/;
const LEV=/(UP|DOWN|BULL|BEAR)USDT$/;
const syms=Object.keys(D).filter(s=>s.endsWith('USDT')&&!LEV.test(s)&&!STABLE.test(s.slice(0,-4)));
const idx={};for(const s of syms){const m=new Map();for(const r of D[s])m.set(r[0],r[5]);idx[s]=m;}
function dates(a,b){const o=[];for(let t=Date.parse(a);t<=Date.parse(b);t+=864e5)o.push(new Date(t).toISOString().slice(0,10));return o}
const out={};const union=new Set();
for(let y=2018;y<=2026;y++)for(const m of[1,4,7,10]){const q=`${y}-${String(m).padStart(2,'0')}-01`;if(q>'2026-09-01')continue;
 const end=new Date(Date.parse(q)-864e5).toISOString().slice(0,10);const st=new Date(Date.parse(q)-60*864e5).toISOString().slice(0,10);
 const ds=dates(st,end);const rk=[];
 for(const s of syms){let v=0,n=0;for(const d of ds){const x=idx[s].get(d);if(x!=null){v+=x;n++}}if(n>=55)rk.push([s,v/n]);}
 rk.sort((a,b)=>b[1]-a[1]);out[q]=rk.slice(0,30).map(x=>x[0]);rk.slice(0,25).forEach(x=>union.add(x[0]));}
fs.writeFileSync('data/spot_rank.json',JSON.stringify(out));
console.log(union.size,[...union].join(' '));
