// Perp 1h klines + funding from data.binance.vision monthly dumps (includes delisted symbols)
const fs=require('fs'),zlib=require('zlib');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function unzip(buf){let e=buf.length-22;while(e>=0&&buf.readUInt32LE(e)!==0x06054b50)e--;const cd=buf.readUInt32LE(e+16);
 const method=buf.readUInt16LE(cd+10),csz=buf.readUInt32LE(cd+20),loff=buf.readUInt32LE(cd+42);
 const nl=buf.readUInt16LE(loff+26),xl=buf.readUInt16LE(loff+28);const data=buf.subarray(loff+30+nl+xl,loff+30+nl+xl+csz);
 return (method===8?zlib.inflateRawSync(data):data).toString();}
async function get(u){for(let i=0;i<5;i++){try{const r=await fetch(u);if(r.status===404)return null;if(!r.ok)throw new Error(r.status);return Buffer.from(await r.arrayBuffer());}catch(e){await sleep(1500*(i+1));}}return 'ERR';}
const rank=JSON.parse(fs.readFileSync('data/perp_rank.json'));
const set=new Set();for(const q in rank)rank[q].forEach(s=>set.add(s));for(const s of process.argv.slice(2))set.add(s);
const syms=[...set];
const months=[];for(let y=2019;y<=2026;y++)for(let m=1;m<=12;m++){const k=`${y}-${String(m).padStart(2,'0')}`;if(k>='2019-09'&&k<='2026-09')months.push(k);}
async function doSym(s){
 const fk=`data/perp1h/${s}.json`,ff=`data/fund/${s}.json`;if(fs.existsSync(fk)&&fs.existsSync(ff))return;
 const d1=JSON.parse(fs.readFileSync(`data/perp1d/${s}.json`));if(!d1.length){console.log(s,'no 1d');return;}
 const first=new Date(d1[0][0]).toISOString().slice(0,7),last=new Date(d1.at(-1)[0]).toISOString().slice(0,7);
 const ms=months.filter(m=>m>=first&&m<=last);const K=[],F=[];let err=0;
 for(const m of ms){
  const b=await get(`https://data.binance.vision/data/futures/um/monthly/klines/${s}/1h/${s}-1h-${m}.zip`);
  if(b==='ERR'){err++;continue;} if(b){for(const line of unzip(b).split('\n')){const a=line.split(',');if(a.length<8||isNaN(+a[0]))continue;let t=+a[0];if(t>1e14)t=Math.floor(t/1000);K.push([t,+a[1],+a[2],+a[3],+a[4],+a[7]]);}}
  const f=await get(`https://data.binance.vision/data/futures/um/monthly/fundingRate/${s}/${s}-fundingRate-${m}.zip`);
  if(f==='ERR'){err++;continue;} if(f){for(const line of unzip(f).split('\n')){const a=line.split(',');if(a.length<3||isNaN(+a[0]))continue;F.push([+a[0],+a[2]]);}}
 }
 K.sort((a,b)=>a[0]-b[0]);F.sort((a,b)=>a[0]-b[0]);
 if(err){console.log(s,'ERR months',err);return;}
 fs.writeFileSync(fk,JSON.stringify(K));fs.writeFileSync(ff,JSON.stringify(F));console.log(s,K.length,F.length,first,last);}
(async()=>{const q=syms.slice();await Promise.all(Array.from({length:6},async()=>{while(q.length)await doSym(q.shift());}));console.log('done');})();
