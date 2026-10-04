const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(u){for(;;){const r=await fetch(u);const used=r.headers.get('x-mbx-used-weight-1m');const j=await r.json();
 if(j&&j.code===-1003){const m=/until (\d+)/.exec(j.msg);const w=m?(+m[1]-Date.now()+5000):60000;console.log('banned, wait',w);await sleep(w);continue;}
 if(r.status===429){console.log('429');await sleep(65000);continue;}
 if(used&&+used>1500)await sleep(30000);return j;}}
async function kl(base,sym,iv,s,e,lim){let out=[];while(s<e){const d=await get(`${base}?symbol=${sym}&interval=${iv}&startTime=${s}&endTime=${e}&limit=${lim}`);if(!Array.isArray(d)){if(!out.length)return null;break;}if(!d.length)break;out.push(...d.map(k=>[k[0],+k[1],+k[2],+k[3],+k[4],+k[5],+k[7]]));s=d.at(-1)[0]+1;if(d.length<lim)break;await sleep(400);}return out;}
const F='https://fapi.binance.com/fapi/v1/klines';
(async()=>{const w=Date.parse('2026-10-04T23:38:30Z')-Date.now();if(w>0)await sleep(w);
 const h=await kl(F,'LUNAUSDT','1h',Date.parse('2022-02-01'),Date.parse('2022-05-13T16:00Z'),1500);fs.writeFileSync('data/perp_LUNAUSDT_1h.json',JSON.stringify(h));console.log('luna1h',h.length);
 const U=JSON.parse(fs.readFileSync('data/scan/universe.json'));let n=0;
 for(const [s,st] of U){const f=`data/scan/${s}.json`;let ok=false;if(fs.existsSync(f)){const d=JSON.parse(fs.readFileSync(f));ok=Array.isArray(d)&&d.length&&d.at(-1)[0]>=Date.parse('2026-10-03');}
  if(ok)continue;const d=await kl(F,s,'1d',Date.parse('2021-01-01'),Date.parse('2026-10-05'),1500);if(d)fs.writeFileSync(f,JSON.stringify(d));n++;await sleep(500);}
 console.log('refetched',n);})();
