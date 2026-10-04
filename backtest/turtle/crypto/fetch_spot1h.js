const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rank=JSON.parse(fs.readFileSync('data/spot_rank.json'));
const set=new Set();for(const q in rank)rank[q].slice(0,20).forEach(s=>set.add(s));
const syms=[...set];console.log(syms.length);
async function get(u){for(let i=0;i<6;i++){try{const r=await fetch(u);if(r.status===429||r.status===418){await sleep(30000);continue;}if(r.status===400)return null;if(!r.ok)throw new Error(r.status);return await r.json();}catch(e){await sleep(1000*(i+1));}}return null;}
(async()=>{for(const s of syms){const fn=`data/spot1h/${s}.json`;if(fs.existsSync(fn))continue;let st=Date.UTC(2017,10,1);const rows=[];
 while(true){const a=await get(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=1h&limit=1000&startTime=${st}`);await sleep(60);
  if(!a||!a.length)break;for(const x of a)rows.push([x[0],+x[1],+x[2],+x[3],+x[4],+x[7]]);if(a.length<1000)break;st=a[a.length-1][0]+3600000;}
 fs.writeFileSync(fn,JSON.stringify(rows));console.log(s,rows.length)}console.log('done')})();
