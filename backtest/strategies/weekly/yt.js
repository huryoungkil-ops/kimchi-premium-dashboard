const q=process.argv.slice(2).join(' ');
(async()=>{const r=await fetch('https://www.youtube.com/results?search_query='+encodeURIComponent(q)+'&hl=ko&gl=KR',{headers:{'accept-language':'ko-KR,ko;q=0.9','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36'}});
const h=await r.text();const m=h.match(/var ytInitialData = (\{.*?\});<\/script>/s);if(!m){console.log('no data',h.length);return;}
const d=JSON.parse(m[1]);const out=[];(function walk(o){if(!o||typeof o!=='object')return;if(o.videoRenderer){const v=o.videoRenderer;out.push([v.videoId,(v.title?.runs||[]).map(x=>x.text).join(''),v.ownerText?.runs?.[0]?.text,v.publishedTimeText?.simpleText,v.viewCountText?.simpleText,(v.detailedMetadataSnippets?.[0]?.snippetText?.runs||[]).map(x=>x.text).join('')].join(' | '));}for(const k in o)walk(o[k]);})(d);
console.log(out.join('\n'));})();
