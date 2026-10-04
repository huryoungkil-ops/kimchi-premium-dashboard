const fs=require('fs');
(async()=>{let marker='',all=[];
for(;;){const u=`https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?prefix=data/futures/um/monthly/klines/&delimiter=/`+(marker?`&marker=${encodeURIComponent(marker)}`:'');
const t=await (await fetch(u)).text();const ps=[...t.matchAll(/<Prefix>data\/futures\/um\/monthly\/klines\/([^<]+)\/<\/Prefix>/g)].map(m=>m[1]);all.push(...ps);
const nm=t.match(/<NextMarker>([^<]+)<\/NextMarker>/);if(!/<IsTruncated>true/.test(t)||!nm)break;marker=nm[1];}
all=[...new Set(all)];fs.writeFileSync('data/vision_symbols.json',JSON.stringify(all));
console.log(all.length, all.filter(s=>s.endsWith('USDT')).length);})();
