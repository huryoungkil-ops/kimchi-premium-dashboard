const fs=require('fs');
const s=process.argv[2];const L=fs.readFileSync(`data/${s}.csv`,'utf8').trim().split('\n').slice(1).map(l=>l.split(','));
let N=null,pc=null,bad=0;const out=[];
for(const r of L){const [d,o,h,l,c]=[r[0],+r[1],+r[2],+r[3],+r[4]];
 if(!(o>0&&h>0&&l>0)||h<l)bad++;
 if(pc!=null){const tr=Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));N=N==null?tr:(19*N+tr)/20;
  const g=(o-pc)/N, gc=(c-pc)/N; if(Math.abs(g)>2||Math.abs(gc)>4)out.push(`${d} gap=${g.toFixed(1)} cc=${gc.toFixed(1)} rng=${((h-l)/N).toFixed(1)} vol=${r[5]}`);}
 pc=c;}
console.log(s,'bad',bad,'n',out.length);console.log(out.slice(0,+process.argv[3]||25).join('\n'));
