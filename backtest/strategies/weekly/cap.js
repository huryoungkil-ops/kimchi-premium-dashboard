(async()=>{const id=process.argv[2];
// Innertube player with ANDROID client often returns caption URLs w/o pot
const body={context:{client:{clientName:'ANDROID',clientVersion:'20.10.38',androidSdkVersion:30,hl:'ko'}},videoId:id};
const r=await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false',{method:'POST',headers:{'content-type':'application/json','user-agent':'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip'},body:JSON.stringify(body)});
const j=await r.json();const tr=j?.captions?.playerCaptionsTracklistRenderer?.captionTracks||[];console.error('tracks',tr.map(t=>t.languageCode+':'+t.kind));
if(!tr.length){console.error(JSON.stringify(j.playabilityStatus));return;}
const t0=tr.find(t=>t.languageCode=="ko")||tr[0];const u=t0.baseUrl.replace(/&fmt=[^&]*/,'')+'&fmt=json3';const x=await (await fetch(u,{headers:{'user-agent':'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip'}})).text();
try{const jj=JSON.parse(x);console.log(jj.events.filter(e=>e.segs).map(e=>e.segs.map(s=>s.utf8).join('')).join(' '));}catch(e){console.log(x.slice(0,500).replace(/<[^>]+>/g,' '));}})();
