(async()=>{for(const c of process.argv.slice(2)){const r=await fetch('https://www.binance.com/bapi/composite/v1/public/cms/article/detail/query?articleCode='+c);const j=await r.json();const d=j.data;if(!d){console.log(c,'none');continue;}
let b=d.body;try{const walk=n=>typeof n==='string'?n:(n.child||[]).map(walk).join(' ')+(n.text||'');b=walk(JSON.parse(b));}catch(e){b=String(b).replace(/<[^>]+>/g,' ')}
console.log('=====',d.title,new Date(d.publishDate).toISOString());console.log(b.replace(/\s+/g,' ').slice(0,1800));}})();
