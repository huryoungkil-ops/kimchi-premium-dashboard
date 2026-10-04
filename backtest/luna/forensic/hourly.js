const {klines,funding}=require('./fetch.js');const fs=require('fs');
(async()=>{
const jobs=[['spot','LUNAUSDT','2022-04-20','2022-05-31'],['perp','LUNAUSDT','2022-04-20','2022-05-31'],['spot','USTUSDT','2022-04-20','2022-05-31'],['spot','USTBUSD','2022-04-20','2022-05-31'],['spot','LUNABUSD','2022-04-20','2022-05-31'],['perp','LUNABUSD','2022-04-20','2022-05-31'],
['spot','FTTUSDT','2022-11-01','2022-11-20'],['perp','FTTUSDT','2022-11-01','2022-11-20'],['perp','SRMUSDT','2022-11-01','2022-11-30'],['perp','OMUSDT','2025-04-10','2025-04-20'],['spot','OMUSDT','2025-04-10','2025-04-20'],['perp','ZKJUSDT','2025-06-10','2025-06-25'],['perp','JELLYJELLYUSDT','2025-03-24','2025-04-05'],['perp','WAVESUSDT','2022-03-25','2022-06-30'],['perp','MOVEUSDT','2025-04-01','2025-06-01']];
for(const [m,s,a,b] of jobs){const d=await klines(m,s,'1h',Date.parse(a),Date.parse(b));
 if(d.err||!d.length){console.log(m,s,'none',d.err);continue;}
 fs.writeFileSync(`data/${m}_${s}_1h.json`,JSON.stringify(d));console.log(m,s,d.length,new Date(d.at(-1)[0]).toISOString());}
const l=JSON.parse(fs.readFileSync('data/spot_LUNAUSDT_1d.json'));
for(const k of l.filter(k=>k[0]>=Date.parse('2022-05-01')&&k[0]<Date.parse('2022-06-05')))console.log(new Date(k[0]).toISOString().slice(0,10),k.slice(1,5).join(' '),Math.round(k[6]/1e6)+'M');
const p=JSON.parse(fs.readFileSync('data/perp_LUNAUSDT_1d.json'));
for(const k of p.slice(-14))console.log('perp',new Date(k[0]).toISOString().slice(0,10),k.slice(1,5).join(' '),Math.round(k[6]/1e6)+'M');
const f=JSON.parse(fs.readFileSync('data/funding_LUNAUSDT.json'));
for(const x of f.filter(x=>x[0]>=Date.parse('2022-05-05')))console.log('fund',new Date(x[0]).toISOString().slice(0,16),x[1]);
})();
