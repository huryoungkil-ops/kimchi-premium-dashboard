const fs=require('fs');
const DAY=864e5,HOUR=36e5;
const IS=['2017-08-01','2021-12-31'],OOS=['2022-01-01','2026-09-30'],FULL=['2017-08-01','2026-09-30'];
const dk=t=>new Date(t).toISOString().slice(0,10);
function load(name){const p=__dirname+'/data/'+name+'.json';if(!fs.existsSync(p))return null;let d=JSON.parse(fs.readFileSync(p));
 if(name==='spot_LUNA_1d')d=d.filter(x=>x[0]<=Date.UTC(2022,4,13));
 d=d.filter(x=>x[0]<Date.UTC(2026,9,1));if(!d.length)return null;
 return{t:d.map(x=>x[0]),o:d.map(x=>x[1]),h:d.map(x=>x[2]),l:d.map(x=>x[3]),c:d.map(x=>x[4]),v:d.map(x=>x[5])};}
function align(b,T){const m=new Map();b.t.forEach((t,i)=>m.set(t,i));const out={o:[],h:[],l:[],c:[],v:[]};for(const t of T){const i=m.get(t);for(const k of['o','h','l','c','v'])out[k].push(i===undefined?NaN:b[k][i]);}return out;}
function loadFund(sym){const p=__dirname+'/data/fund_'+sym+'.json';if(!fs.existsSync(p))return null;return JSON.parse(fs.readFileSync(p)).map(x=>[Math.round(x[0]/6e4)*6e4,x[1]]);}
// sum of funding rates with fundingTime in (T[t], T[t]+iv]
function fundBars(T,iv,sym){const a=loadFund(sym);const out=new Array(T.length).fill(0);if(!a)return out;let j=0;for(let t=0;t<T.length;t++){while(j<a.length&&a[j][0]<=T[t])j++;let k=j,s=0;while(k<a.length&&a[k][0]<=T[t]+iv){s+=a[k][1];k++;}out[t]=s;}return out;}
function sma(a,n){const o=new Array(a.length).fill(NaN);let s=0,cnt=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])){s=0;cnt=0;continue;}s+=a[i];cnt++;if(cnt>n){s-=a[i-n];cnt=n;}if(cnt===n)o[i]=s/n;}return o;}
function rstd(a,n){const o=new Array(a.length).fill(NaN);for(let i=n-1;i<a.length;i++){let s=0,ss=0,ok=true;for(let j=i-n+1;j<=i;j++){if(!Number.isFinite(a[j])){ok=false;break;}s+=a[j];ss+=a[j]*a[j];}if(ok){const m=s/n;o[i]=Math.sqrt(Math.max(0,ss/n-m*m));}}return o;}
function prevMax(a,n){const o=new Array(a.length).fill(NaN);for(let i=n;i<a.length;i++){let m=-Infinity,ok=true;for(let j=i-n;j<i;j++){if(!Number.isFinite(a[j])){ok=false;break;}if(a[j]>m)m=a[j];}if(ok)o[i]=m;}return o;}
function prevMin(a,n){const o=new Array(a.length).fill(NaN);for(let i=n;i<a.length;i++){let m=Infinity,ok=true;for(let j=i-n;j<i;j++){if(!Number.isFinite(a[j])){ok=false;break;}if(a[j]<m)m=a[j];}if(ok)o[i]=m;}return o;}
function atrW(h,l,c,n){const o=new Array(c.length).fill(NaN);let N=NaN,trs=[];for(let i=1;i<c.length;i++){if(!Number.isFinite(c[i])||!Number.isFinite(c[i-1])){N=NaN;trs=[];continue;}const tr=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]));if(!Number.isFinite(N)){trs.push(tr);if(trs.length===n)N=trs.reduce((a,b)=>a+b)/n;else continue;}else N=((n-1)*N+tr)/n;o[i]=N;}return o;}
function rsiW(c,n){const o=new Array(c.length).fill(NaN);let ag=NaN,al=NaN,g=[],l=[];for(let i=1;i<c.length;i++){if(!Number.isFinite(c[i])||!Number.isFinite(c[i-1])){ag=NaN;g=[];l=[];continue;}const d=c[i]-c[i-1],up=Math.max(d,0),dn=Math.max(-d,0);if(!Number.isFinite(ag)){g.push(up);l.push(dn);if(g.length===n){ag=g.reduce((a,b)=>a+b)/n;al=l.reduce((a,b)=>a+b)/n;}else continue;}else{ag=(ag*(n-1)+up)/n;al=(al*(n-1)+dn)/n;}o[i]=al===0?100:100-100/(1+ag/al);}return o;}
// weight engine: target for bar t decided with data <= close of t-1; held open[t] -> open[t+1]
function wengine({T,A,cps,tgt,start=0}){const n=A.length;let w=new Array(n).fill(0);const rows=[],trades=[],legs=new Array(n).fill(null);
 const V=(i,t)=>Number.isFinite(A[i].o[t]);
 const close=(i,t)=>{trades.push({d:dk(T[Math.min(t,T.length-1)]),pnl:legs[i].pnl,dir:legs[i].dir,a:i});legs[i]=null;};
 for(let t=start;t<T.length-1;t++){let cost=0,turn=0;const tg=tgt(t,w);
  if(tg){for(let i=0;i<n;i++){const x=V(i,t)?(tg[i]||0):0;const d=Math.abs(x-w[i]);if(d<1e-12)continue;turn+=d;const c=d*cps;cost+=c;
    if(w[i]!==0&&(x===0||Math.sign(x)!==Math.sign(w[i]))){const co=Math.abs(w[i])*cps;legs[i].pnl-=co;close(i,t);if(x!==0)legs[i]={pnl:-(c-co),dir:Math.sign(x)};}
    else if(w[i]===0)legs[i]={pnl:-c,dir:Math.sign(x)};else legs[i].pnl-=c;w[i]=x;}}
  let R=0,F=0,gross=0;const rs=new Array(n).fill(0);
  for(let i=0;i<n;i++){if(w[i]===0)continue;gross+=Math.abs(w[i]);const nx=A[i].o[t+1];const r=Number.isFinite(nx)?nx/A[i].o[t]-1:A[i].c[t]/A[i].o[t]-1;rs[i]=r;R+=w[i]*r;const f=A[i].f?(A[i].f[t]||0):0;F+=w[i]*f;legs[i].pnl+=w[i]*r-w[i]*f;}
  const net=R-cost-F;let forced=0;
  for(let i=0;i<n;i++){if(w[i]===0)continue;w[i]=w[i]*(1+rs[i])/(1+net);if(!Number.isFinite(A[i].o[t+1])){const c=Math.abs(w[i])*cps;forced+=c;turn+=Math.abs(w[i]);legs[i].pnl-=c;close(i,t);w[i]=0;}}
  rows.push({t:T[t],r:net-forced,cost:cost+forced,fund:F,turn,exp:gross>1e-9?1:0,gross});}
 for(let i=0;i<n;i++)if(legs[i])close(i,T.length-1);
 return{rows:toDaily(rows),trades};}
function toDaily(rows){const m=new Map();for(const x of rows){const d=dk(x.t);let y=m.get(d);if(!y){y={d,r:1,cost:0,turn:0,exp:0,k:0,fund:0,gross:0};m.set(d,y);}y.r*=1+x.r;y.cost+=x.cost||0;y.turn+=x.turn||0;y.exp+=x.exp||0;y.gross+=x.gross||0;y.fund+=x.fund||0;y.k++;}
 return[...m.values()].map(y=>({d:y.d,r:y.r-1,cost:y.cost,turn:y.turn,exp:y.exp/y.k,gross:y.gross/y.k,fund:y.fund}));}
// pos[s] decided at close of bar s => held during bar s+1. Only trade on state change.
function fromStates(pos){return(t,w)=>{if(t<1)return null;const p=pos[t-1];if(p===undefined||p===null||(typeof p==='number'&&Number.isNaN(p)))return null;const q=pos[t-2];if(t>=2&&JSON.stringify(q)===JSON.stringify(p))return null;return Array.isArray(p)?p:[p];};}
function firstDefined(pos){for(let i=0;i<pos.length;i++)if(pos[i]!==null&&pos[i]!==undefined&&!(typeof pos[i]==='number'&&Number.isNaN(pos[i])))return i+1;return pos.length;}
function stats(rows,from,to){const R=rows.filter(x=>x.d>=from&&x.d<=to);if(R.length<60)return null;const n=R.length;let eq=1,pk=1,mdd=0,s=0,ss=0,dn=0,cost=0,turn=0,exp=0,fund=0;
 for(const x of R){eq*=1+x.r;if(eq>pk)pk=eq;mdd=Math.min(mdd,eq/pk-1);s+=x.r;ss+=x.r*x.r;dn+=Math.min(x.r,0)**2;cost+=x.cost||0;turn+=x.turn||0;exp+=x.exp||0;fund+=x.fund||0;}
 const y=n/365,m=s/n,sd=Math.sqrt(Math.max(1e-18,ss/n-m*m)),cagr=eq>0?Math.pow(eq,1/y)-1:-1;
 return{from:R[0].d,to:R[n-1].d,days:n,totRet:eq-1,cagr,vol:sd*Math.sqrt(365),sharpe:m/sd*Math.sqrt(365),sortino:dn>0?m*365/(Math.sqrt(dn/n)*Math.sqrt(365)):null,mdd,calmar:mdd<0?cagr/-mdd:null,exposure:exp/n,turnoverPerYr:turn/y,costDragPerYr:cost/y,fundingPerYr:fund/y};}
function tstats(tr,from,to){const T=tr.filter(x=>x.d>=from&&x.d<=to);if(!T.length)return{trades:0};const w=T.filter(x=>x.pnl>0),l=T.filter(x=>x.pnl<=0);const gw=w.reduce((a,b)=>a+b.pnl,0),gl=-l.reduce((a,b)=>a+b.pnl,0);return{trades:T.length,winRate:w.length/T.length,profitFactor:gl>0?gw/gl:null,avgTrade:(gw-gl)/T.length};}
function yearly(rows){const m={};for(const x of rows){const y=x.d.slice(0,4);m[y]=(m[y]||1)*(1+x.r);}for(const k in m)m[k]-=1;return m;}
function monthlyEq(rows){const m={};let eq=1;for(const x of rows){eq*=1+x.r;m[x.d.slice(0,7)]=eq;}return m;}
function corr(a,b){const n=a.length;let sa=0,sb=0;for(let i=0;i<n;i++){sa+=a[i];sb+=b[i];}const ma=sa/n,mb=sb/n;let c=0,va=0,vb=0;for(let i=0;i<n;i++){c+=(a[i]-ma)*(b[i]-mb);va+=(a[i]-ma)**2;vb+=(b[i]-mb)**2;}return c/Math.sqrt(va*vb);}
module.exports={DAY,HOUR,IS,OOS,FULL,dk,load,align,fundBars,sma,rstd,prevMax,prevMin,atrW,rsiW,wengine,toDaily,fromStates,firstDefined,stats,tstats,yearly,monthlyEq,corr};
