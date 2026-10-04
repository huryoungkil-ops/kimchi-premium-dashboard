const fs=require('fs');
const info=JSON.parse(fs.readFileSync('data/fapi_info.json'));
const rank=JSON.parse(fs.readFileSync('data/spot_rank.json'));
const set=new Set(info.map(x=>x.s));
const extra='LUNA SRM BTCST ANC MATIC EOS BCH TOMO LEND RNDR HNT BTS MKR KEEP NU REN AUDIO DGB CTK SC STMX BZRX YFII BAL MIR FTT RAY XMR XEM ZEC DASH CVC AGIX OCEAN FET GAL MDT DAR STRAX ANT WAVES BLZ'.split(' ');
extra.forEach(b=>set.add(b+'USDT'));
for(const q in rank)rank[q].forEach(s=>{set.add(s);set.add('1000'+s)});
const syms=[...set];console.log(syms.length);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){for(let i=0;i<5;i++){try{const r=await fetch(url);if(r.status==429||r.status==418){await sleep(30000);continue}if(r.status==400)return null;return await r.json()}catch(e){await sleep(2000)}}return null}
(async()=>{let n=0;for(const s of syms){const fn='data/perp1d/'+s+'.json';if(fs.existsSync(fn))continue;
 let out=[],st=Date.parse('2019-09-01');
 while(true){const j=await get(`https://fapi.binance.com/fapi/v1/klines?symbol=${s}&interval=1d&startTime=${st}&limit=1500`);if(!Array.isArray(j)||!j.length)break;
  out.push(...j.map(k=>[k[0],+k[1],+k[2],+k[3],+k[4],+k[7]]));if(j.length<1500)break;st=j.at(-1)[0]+1;await sleep(250)}
 if(out.length)fs.writeFileSync(fn,JSON.stringify(out));else fs.writeFileSync(fn,'[]');n++;await sleep(250);if(n%50==0)console.log(n,s,out.length)}
console.log('done')})();
