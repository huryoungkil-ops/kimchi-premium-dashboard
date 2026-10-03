const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){for(let i=0;i<6;i++){try{const r=await fetch(url);if(r.status===429||r.status>=500){await sleep(2000*(i+1));continue;}return await r.json();}catch(e){await sleep(1500);}}throw url;}
const END=Date.UTC(2026,9,1);
async function k(base,path,sym,s){const out=[];for(;;){const j=await get(`${base}${path}?symbol=${sym}&interval=1d&startTime=${s}&endTime=${END-1}&limit=1000`);if(!Array.isArray(j)||!j.length)break;for(const x of j)out.push([x[0],+x[1],+x[2],+x[3],+x[4],+x[7]]);s=j[j.length-1][0]+1;if(j.length<1000)break;}return out;}
async function fr(sym){const out=[];let s=Date.UTC(2019,0,1);for(;;){const j=await get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&startTime=${s}&endTime=${END-1}&limit=1000`);if(!Array.isArray(j)||!j.length)break;for(const f of j)out.push([f.fundingTime,+f.fundingRate]);s=j[j.length-1].fundingTime+1;if(j.length<1000)break;}return out;}
const save=(n,d)=>{fs.writeFileSync('data/'+n+'.json',JSON.stringify(d));console.log(n,d.length,d.length?new Date(d[0][0]).toISOString().slice(0,10)+'..'+new Date(d[d.length-1][0]).toISOString().slice(0,10):'');};
(async()=>{
 for(const c of ['LUNA','FTT','SHIB','ICP','BCC','VEN','BCHABC','SUI','TON'])save('spot_'+c+'_1d',await k('https://api.binance.com','/api/v3/klines',c+'USDT',Date.UTC(2017,7,1)));
 for(const c of ['LUNA','FTT','ICP','SUI','TON']){save('perp_'+c+'_1d',await k('https://fapi.binance.com','/fapi/v1/klines',c+'USDT',Date.UTC(2019,0,1)));save('fund_'+c,await fr(c+'USDT'));}
 const l=JSON.parse(fs.readFileSync('data/spot_LUNA_1d.json'));for(const x of l.filter(x=>{const d=new Date(x[0]).toISOString().slice(0,10);return d>='2022-05-05'&&d<='2022-06-02'}))console.log(new Date(x[0]).toISOString().slice(0,10),x[1],x[4]);
 const p=JSON.parse(fs.readFileSync('data/perp_LUNA_1d.json'));console.log(p.slice(-4).map(x=>[new Date(x[0]).toISOString().slice(0,10),x[4]]));
})();
