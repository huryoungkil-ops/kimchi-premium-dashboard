(async()=>{for(const id of process.argv.slice(2)){const r=await fetch('https://www.youtube.com/watch?v='+id+'&hl=ko',{headers:{'accept-language':'ko-KR','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 Safari/537.36'}});const h=await r.text();
const t=(h.match(/"title":"(.*?)","lengthSeconds"/)||[])[1];const d=(h.match(/"shortDescription":"(.*?)","isCrawlable"/s)||[])[1]||'';const p=(h.match(/"publishDate":"(.*?)"/)||[])[1];
console.log('### '+id+' | '+t+' | '+p+'\n'+JSON.parse('"'+d+'"').slice(0,1500)+'\n');}})();
