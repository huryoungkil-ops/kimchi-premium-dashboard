const j = async (u,o)=>{const r=await fetch(u,o);return r.json()};
const ex = await j('https://fapi.binance.com/fapi/v1/exchangeInfo');
const tf = ex.symbols.filter(s=>s.status==='TRADING' && (s.contractType!=='PERPETUAL' || (s.underlyingSubType||[]).some(x=>/TradFi|COMMOD|STOCK|Index|Metal/i.test(x)) || /XAU|XAG|PAXG|XAUT|CL|BZ|NATGAS|TSLA|NVDA|SPY|QQQ|COIN|MSTR|AAPL|HOOD|XPT|XPD|COPPER/i.test(s.baseAsset)));
const typ = {}; ex.symbols.forEach(s=>{const k=s.contractType+'|'+(s.underlyingType||'')+'|'+(s.underlyingSubType||[]).join(',');typ[k]=(typ[k]||0)+1});
console.log(typ);
console.log(tf.filter(s=>!/^1000|DOG/.test(s.symbol)).map(s=>[s.symbol,s.contractType,s.underlyingType,(s.underlyingSubType||[]).join(','),new Date(s.onboardDate).toISOString().slice(0,10)].join(' ')).join('\n'));
