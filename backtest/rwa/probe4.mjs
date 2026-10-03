const j = async (u,o)=>{const r=await fetch(u,o);return r.json()};
let all=[],cur='';
do{const d=await j('https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000'+(cur?'&cursor='+cur:''));all.push(...d.result.list);cur=d.result.nextPageCursor;}while(cur);
const keys={};all.forEach(s=>{keys[s.contractType+'|'+(s.symbolType||'')]=(keys[s.contractType+'|'+(s.symbolType||'')]||0)+1});console.log(keys);
console.log(all.filter(s=>/XAU|XAG|PAXG|OIL|WTI|BRENT|CL|NATGAS|GAS|COPPER|XPT|SPX|NAS|TSLA|NVDA|SPY/.test(s.baseCoin)&&!/CLOUD|CLANK|CLV|CLO$/.test(s.baseCoin)).map(s=>[s.symbol,s.contractType,s.symbolType,s.status,new Date(+s.launchTime).toISOString().slice(0,10)].join(' ')).join('\n'));
// hyperliquid
const dexs = await j('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'perpDexs'})});
console.log('HL dexs:', JSON.stringify(dexs.map(d=>d&&d.name)));
