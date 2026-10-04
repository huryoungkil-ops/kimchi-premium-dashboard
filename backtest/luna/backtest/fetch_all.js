// Fetch daily klines (API, fallback Binance Vision zips) + funding history for all USDT-M perps ever listed
const fs=require('fs');const {execSync}=require('child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const START=Date.parse('2019-09-01'),END=Date.parse('2026-10-05');
async function j(u){for(let i=0;i<5;i++){try{const r=await fetch(u);if(r.status===429||r.status===418){await sleep(30000);continue;}
 const t=await r.text();try{return JSON.parse(t)}catch(e){return {err:t.slice(0,100)}}}catch(e){await sleep(2000)}}return {err:'net'}}
async function klines(sym){let out=[],s=START;
 while(s<END){const d=await j(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1d&startTime=${s}&limit=1000`);
  if(!Array.isArray(d)){if(!out.length)return {err:d.err||d.msg||JSON.stringify(d).slice(0,80)};break;}
  if(!d.length)break;out.push(...d.map(k=>[k[0],+k[1],+k[2],+k[3],+k[4],+k[7]]));s=d.at(-1)[0]+1;if(d.length<1000)break;await sleep(250);}
 return out;}
async function vision(sym){ // monthly 1d zips
 const t=await (await fetch(`https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?prefix=data/futures/um/monthly/klines/${sym}/1d/`)).text();
 const keys=[...t.matchAll(/<Key>([^<]+\.zip)<\/Key>/g)].map(m=>m[1]);let out=[];
 for(const k of keys){const r=await fetch('https://data.binance.vision/'+k);const b=Buffer.from(await r.arrayBuffer());
  fs.writeFileSync('data/tmp.zip',b);const csv=execSync('unzip -p data/tmp.zip').toString();
  for(const line of csv.split('\n')){const p=line.split(',');if(p.length<8||isNaN(+p[0]))continue;out.push([+p[0],+p[1],+p[2],+p[3],+p[4],+p[7]]);}}
 out.sort((a,b)=>a[0]-b[0]);return out;}
async function funding(sym,from){let out=[],s=from;
 while(s<END){const d=await j(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&startTime=${s}&limit=1000`);
  await sleep(650); if(!Array.isArray(d)||!d.length)break;out.push(...d.map(x=>[x.fundingTime,+x.fundingRate]));s=d.at(-1).fundingTime+1;if(d.length<1000)break;}
 return out;}
(async()=>{
 const vis=require('./data/vision_symbols.json').filter(s=>s.endsWith('USDT')&&!s.includes('_'));
 const ei=require('./data/exchangeInfo.json').symbols.filter(x=>x.quoteAsset==='USDT'&&/PERPETUAL/.test(x.contractType));
 const meta={};for(const x of ei)meta[x.symbol]={status:x.status,ct:x.contractType,onboard:x.onboardDate,delivery:x.deliveryDate,base:x.baseAsset,underlyingType:x.underlyingType,subTypes:x.underlyingSubType};
 const syms=[...new Set([...vis,...ei.map(x=>x.symbol)])].sort();
 const mode=process.argv[2]||'k';const log=[];
 for(const sym of syms){
  if(meta[sym]&&meta[sym].ct==='TRADIFI_PERPETUAL')continue;
  if(mode==='k'){const fn=`data/k/${sym}.json`;if(fs.existsSync(fn))continue;
   let d=await klines(sym),src='api';
   if(d.err||!d.length){const e=d.err;d=await vision(sym);src='vision';if(!d.length){console.log(sym,'NONE',e);fs.writeFileSync(fn,JSON.stringify({src:'none',err:e,k:[]}));continue;}}
   fs.writeFileSync(fn,JSON.stringify({src,k:d}));console.log(sym,src,d.length,new Date(d[0][0]).toISOString().slice(0,10),new Date(d.at(-1)[0]).toISOString().slice(0,10));
  } else {const fn=`data/f/${sym}.json`;if(fs.existsSync(fn))continue;const kf=`data/k/${sym}.json`;if(!fs.existsSync(kf))continue;
   const K=JSON.parse(fs.readFileSync(kf)).k;if(!K.length)continue;
   const f=await funding(sym,K[0][0]);fs.writeFileSync(fn,JSON.stringify(f));console.log(sym,'funding',f.length);}
 }
 fs.writeFileSync('data/meta.json',JSON.stringify(meta));console.log('DONE',mode);
})();
