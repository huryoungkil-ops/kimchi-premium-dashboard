const j = async (u,o)=>{const r=await fetch(u,o);return r.json()};
const d=await j('https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000');
let all=[],cur='';
do{const d=await j('https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000'+(cur?'&cursor='+cur:''));all.push(...d.result.list);cur=d.result.nextPageCursor;}while(cur);
console.log(all.filter(s=>['commodity','forex'].includes(s.symbolType)).map(s=>s.symbol+' '+s.leverageFilter.maxLeverage).join(', '));
const post=b=>j('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
const out={};
for (const dex of ["xyz","flx","vntl","hyna","km","abcd","cash","para","mkts","io"]) {
  try{ const [meta,ctx]=await post({type:'metaAndAssetCtxs',dex});
  const rows=meta.universe.map((u,i)=>({n:u.name,lev:u.maxLeverage,oi:+ctx[i].openInterest*+ctx[i].markPx,vol:+ctx[i].dayNtlVlm,f:ctx[i].funding,dl:u.isDelisted})).filter(r=>!r.dl);
  out[dex]=rows;
  console.log(dex, rows.length, rows.sort((a,b)=>b.oi-a.oi).slice(0,60).map(r=>`${r.n}(${r.lev}x,OI$${(r.oi/1e6).toFixed(1)}M,v$${(r.vol/1e6).toFixed(1)}M)`).join(' '));
  }catch(e){console.log(dex,'err',e.message)}
}
(await import('fs')).writeFileSync('hl_hip3_snapshot.json',JSON.stringify(out,null,1));
