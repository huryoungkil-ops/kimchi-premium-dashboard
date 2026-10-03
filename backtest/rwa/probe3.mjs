const j = async (u,o)=>{const r=await fetch(u,o);return r.json()};
const ex = await j('https://fapi.binance.com/fapi/v1/exchangeInfo');
const tf = ex.symbols.filter(s=>s.contractType==='TRADIFI_PERPETUAL' && s.underlyingType!=='EQUITY');
console.log(tf.map(s=>[s.symbol,s.underlyingType,s.status,new Date(s.onboardDate).toISOString().slice(0,10)].join(' ')).join('\n'));
console.log('EQUITY:',ex.symbols.filter(s=>s.underlyingType==='EQUITY').map(s=>s.symbol).join(' '));
const xau = ex.symbols.find(s=>s.symbol==='XAUUSDT'); console.log(JSON.stringify(xau).slice(0,1500));
const prem = await j('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=XAUUSDT'); console.log(prem);
const oi = await j('https://fapi.binance.com/fapi/v1/openInterest?symbol=XAUUSDT'); console.log(oi);
const t24 = await j('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=XAUUSDT'); console.log(t24.quoteVolume);
