const {klines,funding}=require('./fetch.js');const fs=require('fs');
(async()=>{const ex=await (await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo')).json();
const syms=ex.symbols.filter(x=>x.contractType==='PERPETUAL'&&x.quoteAsset==='USDT'&&(x.status==='TRADING'||x.status==='SETTLING')).map(x=>[x.symbol,x.status,x.onboardDate,x.deliveryDate]);
fs.writeFileSync('data/scan/universe.json',JSON.stringify(syms));
let n=0;for(const [s] of syms){const f=`data/scan/${s}.json`;if(fs.existsSync(f))continue;
 const d=await klines('perp',s,'1d',Date.parse('2021-01-01'),Date.parse('2026-10-05'));
 if(!d.err)fs.writeFileSync(f,JSON.stringify(d));n++;await new Promise(r=>setTimeout(r,250));}
console.log('done',syms.length,n);})();
