// Funding history from Binance Vision monthly zips (no API rate limit). Writes data/f/SYM.json as [[timeMs, rate],...]
const fs=require('fs');const zlib=require('zlib');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function unzipFirst(buf){ // parse first local file entry
  if(buf.readUInt32LE(0)!==0x04034b50)throw new Error('not zip');
  const method=buf.readUInt16LE(8);let csize=buf.readUInt32LE(18);const nlen=buf.readUInt16LE(26),xlen=buf.readUInt16LE(28);const start=30+nlen+xlen;
  if(csize===0){ // data descriptor: use central directory
    const cd=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x01,0x02]));csize=buf.readUInt32LE(cd+20);}
  const data=buf.slice(start,start+csize);return method===8?zlib.inflateRawSync(data):data;}
async function get(u){for(let i=0;i<4;i++){try{const r=await fetch(u);if(r.status===404)return null;if(!r.ok){await sleep(1000);continue;}return Buffer.from(await r.arrayBuffer());}catch(e){await sleep(1000)}}return null;}
async function listKeys(sym){const t=(await get(`https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?prefix=data/futures/um/monthly/fundingRate/${sym}/`)||'').toString();
  return [...t.matchAll(/<Key>([^<]+\.zip)<\/Key>/g)].map(m=>m[1]);}
async function doSym(sym){
  const fn=`data/f/${sym}.json`;if(fs.existsSync(fn))return 'skip';
  const keys=await listKeys(sym);const out=[];
  for(let i=0;i<keys.length;i+=6){const bufs=await Promise.all(keys.slice(i,i+6).map(k=>get('https://data.binance.vision/'+k)));
    for(const b of bufs){if(!b)continue;let csv;try{csv=unzipFirst(b).toString()}catch(e){continue}
      for(const line of csv.split('\n')){const p=line.split(',');if(p.length<3||isNaN(+p[0]))continue;out.push([+p[0],+p[2]]);}}}
  out.sort((a,b)=>a[0]-b[0]);fs.writeFileSync(fn,JSON.stringify(out));return keys.length+' files '+out.length;}
(async()=>{const syms=fs.readdirSync('data/k').map(f=>f.replace('.json',''));
  const q=[...syms];const workers=Array.from({length:4},async()=>{while(q.length){const s=q.shift();try{const r=await doSym(s);if(r!=='skip')console.log(s,r);}catch(e){console.log(s,'ERR',e.message)}}});
  await Promise.all(workers);console.log('DONE');})();
