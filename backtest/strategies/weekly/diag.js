// 횡단면 진단: 매주(월) 유동성 필터 통과 코인을 직전 7일 수익률로 5분위 → 다음 7일 수익률 (비용 전)
const {loadUniverse}=require('./lib');const which=process.argv[2];const U=loadUniverse(which);
const minTurn=which==='upbit'?1e9:5e6;const excl=/USDT$|USDC|USD1|USDE|USDG|USDS|RLUSD|PYUSD|XAUT|PAXG|FDUSD|TUSD|BUSD/;
const res=[];
for(let e=0;e<U.n-7;e++){if(new Date(U.dates[e]+'T00:00:00Z').getUTCDay()!==1||U.dates[e]<'2018-03-01')continue;const sig=e-1;const xs=[];
 for(const [sym,C] of Object.entries(U.coins)){const b=sym.split('#')[0];if(which==='upbit'?excl.test(b.replace('KRW-','')+'X')&&/USD|DAI|XAUT|PAXG/.test(b):(/^(USDC|FDUSD|TUSD|BUSD|XAUT|PAXG|USDP|EUR|AEUR)/.test(b)||(/BUSDT$/.test(b)&&U.dates[C.first]>='2026-06-01')))continue;
  if(sig-7<C.first||sig-C.first<30||e+7>C.last+1)continue;const c0=C.c[sig-7],c1=C.c[sig],o0=C.o[e];let o1=C.o[e+7];if(isNaN(o1))o1=C.c[Math.min(e+6,C.last)];
  if([c0,c1,o0,o1].some(isNaN))continue;let t=0;for(let j=sig-6;j<=sig;j++)t+=C.v[j]||0;if(t/7<minTurn)continue;xs.push([c1/c0-1,o1/o0-1]);}
 if(xs.length<10)continue;xs.sort((a,b)=>a[0]-b[0]);const q=Math.floor(xs.length/5);const avg=a=>a.reduce((s,x)=>s+x[1],0)/a.length;
 const med=a=>{const s=a.map(x=>x[1]).sort((p,q)=>p-q);return s[s.length>>1];};
 res.push({d:U.dates[e],n:xs.length,lo:avg(xs.slice(0,q)),hi:avg(xs.slice(-q)),all:avg(xs),top3:avg(xs.slice(-3)),hiMed:med(xs.slice(-q)),allMed:med(xs)});}
const stat=(rows,k)=>{const v=rows.map(r=>r[k]);const m=v.reduce((a,b)=>a+b,0)/v.length;const sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/(v.length-1));return {mean:+(m*100).toFixed(2),t:+(m/sd*Math.sqrt(v.length)).toFixed(2)};};
const out={};for(const [lab,f] of [['전체',r=>true],['IS ~2021',r=>r.d<='2021-12-31'],['OOS 2022~',r=>r.d>='2022-01-01']]){const R=res.filter(f);
 const sp=R.map(r=>({x:r.hi-r.lo,y:r.hi-r.all,z:r.top3-r.all,w:r.hiMed-r.allMed}));
 out[lab]={weeks:R.length,avgN:Math.round(R.reduce((a,r)=>a+r.n,0)/R.length),Q5minusQ1:stat(sp,'x'),Q5minusAll:stat(sp,'y'),Top3minusAll:stat(sp,'z'),Q5median_minus_allMedian:stat(sp,'w')};}
console.log(which,JSON.stringify(out,null,0));require('fs').writeFileSync(`diag_${which}.json`,JSON.stringify(out,null,1));
