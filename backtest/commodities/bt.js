// Commodity spread mean-reversion backtest (kimchi-bot analog). No look-ahead: z uses data up to t, trade at close t+1.
const fs=require('fs');
function load(f,col=1){const L=fs.readFileSync(__dirname+'/data/'+f,'utf8').trim().split('\n').slice(1);const m=new Map();
 for(const l of L){const p=l.split(',');const v=parseFloat(p[col]);if(isFinite(v)&&v>0)m.set(p[0],v);}return m;}
function shiftMap(m,lag){const ks=[...m.keys()].sort();const o=new Map();for(let i=lag;i<ks.length;i++)o.set(ks[i],m.get(ks[i-lag]));return o;}
function join(maps){const ks=[...maps[0].keys()].filter(k=>maps.every(m=>m.has(k))).sort();return {dates:ks,cols:maps.map(m=>ks.map(k=>m.get(k)))};}
const D={};for(const s of ['CL_F','BZ_F','GC_F','SI_F','ZC_F','ZW_F','KE_F','ZS_F','ZL_F','ZM_F','RB_F','HO_F','CNY_X','518880.SS'])D[s]=load(s+'.csv');
D.FBR=load('DCOILBRENTEU.csv');D.FWT=load('DCOILWTICO.csv');D.FGAS=load('DGASNYH.csv');D.FHO=load('DHOILNYH.csv');
const tick={CL_F:.01,BZ_F:.01,GC_F:.1,SI_F:.005,ZC_F:.25,ZW_F:.25,KE_F:.25,ZS_F:.25,ZL_F:.01,ZM_F:.1,RB_F:.0001,HO_F:.0001,'518880.SS':.001,FBR:.01,FWT:.01};
const BP=4e-4; // per leg per round trip: 4bp + 1 tick
function mk(name,a,b,fa,fb,ca,cb){const j=join([...a.map(k=>D[k]),...b.map(k=>D[k])]);const n=j.dates.length;
 const A=[],B=[],CA=[],CB=[];for(let i=0;i<n;i++){const row=j.cols.map(c=>c[i]);A.push(fa(row));B.push(fb(row));CA.push(ca(row));CB.push(cb(row));}
 return {name,dates:j.dates,A,B,CA,CB};}
const c1=(k,i)=>r=>BP+tick[k]/r[i];
const S=[];
S.push(mk('Brent-WTI (BZ=F/CL=F)',['BZ_F'],['CL_F'],r=>r[0],r=>r[1],c1('BZ_F',0),c1('CL_F',1)));
S.push(mk('Brent-WTI spot (FRED, roll-free check)',['FBR'],['FWT'],r=>r[0],r=>r[1],c1('FBR',0),c1('FWT',1)));
S.push(mk('Gold/Silver (GC/SI)',['GC_F'],['SI_F'],r=>r[0],r=>r[1],c1('GC_F',0),c1('SI_F',1)));
S.push(mk('Corn/Wheat (ZC/ZW)',['ZC_F'],['ZW_F'],r=>r[0],r=>r[1],c1('ZC_F',0),c1('ZW_F',1)));
S.push(mk('KC HRW/Chicago SRW wheat (KE/ZW)',['KE_F'],['ZW_F'],r=>r[0],r=>r[1],c1('KE_F',0),c1('ZW_F',1)));
// Soy crush: beans $/bu vs product value per bu = 0.022*meal($/short ton) + 0.11*oil(cents/lb)
S.push(mk('Soy crush (ZS vs 0.022ZM+0.11ZL)',['ZS_F'],['ZM_F','ZL_F'],r=>r[0]/100,r=>0.022*r[1]+0.11*r[2],c1('ZS_F',0),r=>BP+(0.022*tick.ZM_F+0.11*tick.ZL_F)/(0.022*r[1]+0.11*r[2])));
// 3-2-1 crack: crude $/bbl vs (2 RBOB + 1 HO)*42/3 $/bbl
S.push(mk('3-2-1 crack (CL vs 2RB+1HO)',['CL_F'],['RB_F','HO_F'],r=>r[0],r=>(2*r[1]+r[2])*14,c1('CL_F',0),r=>BP+tick.RB_F/r[1]));
S.push(mk('3-2-1 crack spot (FRED WTI vs NYH gasoline/HO, roll-free check)',['FWT'],['FGAS','FHO'],r=>r[0],r=>(2*r[1]+r[2])*14,c1('FWT',0),r=>BP+1e-4));
// Shanghai gold premium proxy: 518880.SS (SSE gold ETF tracking SGE Au99.99, CNY) vs COMEX GC * USDCNY
D.GCCNY_same=new Map([...D.GC_F].filter(([k])=>D.CNY_X.has(k)).map(([k,v])=>[k,v*D.CNY_X.get(k)]));
D.GCCNY_lag=shiftMap(D.GCCNY_same,1);
S.push(mk('Shanghai gold proxy (518880.SS vs GC*CNY, same date)',['518880.SS'],['GCCNY_same'],r=>r[0],r=>r[1],c1('518880.SS',0),r=>BP+1e-4));
S.push(mk('Shanghai gold proxy (GC lagged 1d, async check)',['518880.SS'],['GCCNY_lag'],r=>r[0],r=>r[1],c1('518880.SS',0),r=>BP+1e-4));

function run(sp,N,H,opt={}){const {dates,A,B,CA,CB}=sp;const n=dates.length;const s=A.map((a,i)=>Math.log(a/B[i]));
 const rA=new Array(n).fill(0),rB=new Array(n).fill(0);
 const lr=X=>X.map((x,i)=>i?Math.log(x/X[i-1]):0);const la=lr(A),lb=lr(B);
 const sd60=(X,i)=>{let m=0;for(let k=i-60;k<i;k++)m+=X[k];m/=60;let v=0;for(let k=i-60;k<i;k++)v+=(X[k]-m)**2;return Math.sqrt(v/59)};
 for(let i=1;i<n;i++){rA[i]=A[i]/A[i-1]-1;rB[i]=B[i]/B[i-1]-1;
  if(opt.clean&&i>60){if(Math.abs(la[i])>6*sd60(la,i))rA[i]=0;if(Math.abs(lb[i])>6*sd60(lb,i))rB[i]=0;}}
 const z=new Array(n).fill(NaN);let sm=0,sq=0;
 for(let i=0;i<n;i++){sm+=s[i];sq+=s[i]*s[i];if(i>=N){sm-=s[i-N];sq-=s[i-N]*s[i-N];}
  if(i>=N-1){const m=sm/N,v=Math.max(sq/N-m*m,0)*N/(N-1),sd=Math.sqrt(v);z[i]=sd>0?(s[i]-m)/sd:NaN;}}
 const pnl=new Array(n).fill(0);const trades=[];let pos=0,ent=-1,VA=1,VB=1,pend=null;
 for(let i=1;i<n;i++){
  if(pos!==0){const nVA=VA*(1+rA[i]),nVB=VB*(1+rB[i]);pnl[i]+=pos*((nVA-VA)-(nVB-VB));VA=nVA;VB=nVB;}
  if(pend!==null&&i>=pend.at){
   const c=(CA[i]+CB[i])/2+(opt.extraBp||0)*1e-4; // half of round-trip cost of each leg on each side => total = CA+CB per round trip
   if(pend.type==='enter'){pos=pend.dir;ent=i;VA=1;VB=1;pnl[i]-=c;trades.push({dir:pos,ei:i,cost:c});}
   else{pnl[i]-=c;const t=trades.at(-1);t.xi=i;t.cost+=c;t.gross=pos*(VA-VB);t.net=t.gross-t.cost;t.reason=pend.reason;pos=0;}
   pend=null;}
  if(pend===null&&pos===0&&isFinite(z[i])&&i<n-1){if(z[i]<-2)pend={type:'enter',dir:1,at:i+(opt.delay||1)};else if(z[i]>2&&!opt.longOnly)pend={type:'enter',dir:-1,at:i+(opt.delay||1)};}
  else if(pend===null&&pos!==0&&i>ent){const held=i-ent;
   if(pos===1&&z[i]>=0.25)pend={type:'exit',reason:'mean',at:i+(opt.delay||1)};else if(pos===-1&&z[i]<=-0.25)pend={type:'exit',reason:'mean',at:i+(opt.delay||1)};
   else if(held>=H-1)pend={type:'exit',reason:'time',at:i+1};}
 }
 if(pos!==0)trades.pop();
 return {pnl,trades,dates};}
function stats(r,from=0,to=Infinity){const {pnl,trades,dates}=r;const idx=dates.map((d,i)=>i).filter(i=>i>=from&&i<to);
 const P=idx.map(i=>pnl[i]);const T=trades.filter(t=>t.ei>=from&&t.xi<to);const yrs=P.length/252;
 const tot=P.reduce((a,b)=>a+b,0);const m=tot/P.length;const sd=Math.sqrt(P.reduce((a,b)=>a+(b-m)**2,0)/(P.length-1));
 let eq=0,pk=0,dd=0;for(const p of P){eq+=p;pk=Math.max(pk,eq);dd=Math.min(dd,eq-pk);}
 const nets=T.map(t=>t.net).sort((a,b)=>b-a);const k=Math.max(1,Math.ceil(nets.length*0.05));const top=nets.slice(0,k).reduce((a,b)=>a+b,0);const tsum=nets.reduce((a,b)=>a+b,0);
 const f=(x,d=2)=>x==null||!isFinite(x)?null:+x.toFixed(d);
 return {start:dates[idx[0]],end:dates[idx.at(-1)],years:f(yrs,1),trades:T.length,tradesPerYr:f(T.length/yrs,1),
  winRate:T.length?f(T.filter(t=>t.net>0).length/T.length*100,1):null,avgNetPct:T.length?f(tsum/T.length*100,3):null,
  avgGrossPct:T.length?f(T.reduce((a,t)=>a+t.gross,0)/T.length*100,3):null,
  annRetPct:f(tot/yrs*100),sharpe:sd>0?f(m/sd*Math.sqrt(252)):null,maxDDPct:f(dd*100),
  worstTradePct:T.length?f(nets.at(-1)*100):null,bestTradePct:T.length?f(nets[0]*100):null,top5pctShareOfPnL:tsum!==0?f(top/tsum*100,0):null,
  longPnLPct:f(T.filter(t=>t.dir===1).reduce((a,t)=>a+t.net,0)*100,1),shortPnLPct:f(T.filter(t=>t.dir===-1).reduce((a,t)=>a+t.net,0)*100,1),
  timeExitPct:T.length?f(T.filter(t=>t.reason==='time').length/T.length*100,0):null};}
function yearly(r){const o={};r.dates.forEach((d,i)=>{const y=d.slice(0,4);o[y]=(o[y]||0)+r.pnl[i];});for(const y in o)o[y]=+(o[y]*100).toFixed(2);return o;}
function blocks(r){const B=[['2000','2004'],['2005','2009'],['2010','2014'],['2015','2019'],['2020','2026']];const o={};
 for(const [a,b] of B){const ix=r.dates.map((d,i)=>[d,i]).filter(([d])=>d.slice(0,4)>=a&&d.slice(0,4)<=b).map(x=>x[1]);if(ix.length<200)continue;
  const s=stats(r,ix[0],ix.at(-1)+1);o[a+'-'+b]={annRetPct:s.annRetPct,sharpe:s.sharpe,trades:s.trades,winRate:s.winRate};}return o;}
const grid=[[20,10],[20,20],[60,10],[60,20]];
const out={generated:new Date().toISOString(),assumptions:{
 signal:'z=(ln(A/B)-MA_N)/SD_N using data through day t; enter long spread if z<-2, short if z>+2; exit long when z>=+0.25 / short when z<=-0.25 (bot analog: exit 0.25sd past the mean) or after max hold H trading days; every order executed at close of t+1',
 sizing:'equal $1 notional per leg at entry, one position at a time, P&L in % of one-leg notional, non-compounded (sum)',
 cost:'per leg per round trip: 4bp + 1 tick (fraction of price); baskets use component ticks',
 jumpCleaned:'variant zeroing a leg daily return if |log return| > 6x trailing-60d std (crude roll-gap / bad-print filter)',
 data:'Yahoo Finance continuous front-month (=F) daily closes; FRED DCOILBRENTEU/DCOILWTICO spot; Yahoo 518880.SS & CNY=X'},spreads:{}};
for(const sp of S){const res={n:sp.dates.length,start:sp.dates[0],end:sp.dates.at(-1),grid:{}};
 const half=Math.floor(sp.dates.length/2);let best=null;
 for(const [N,H] of grid){const k=`N${N}_H${H}`;const r=run(sp,N,H);const rc=run(sp,N,H,{clean:true});const rl=run(sp,N,H,{longOnly:true});
  const IS=stats(r,0,half),OOS=stats(r,half);
  const rd=run(sp,N,H,{delay:2}),rx=run(sp,N,H,{extraBp:12});
  res.grid[k]={full:stats(r),delay2:stats(rd),cost10bpPerLeg:stats(rx),jumpCleaned:stats(rc),longOnly:stats(rl),IS,OOS,blocks:blocks(r),yearly:yearly(r)};
  if(!best||IS.sharpe>best.isSharpe)best={k,isSharpe:IS.sharpe,oos:OOS};}
 res.walkForward={splitDate:sp.dates[half],chosen:best.k,isSharpe:best.isSharpe,oosAnnRetPct:best.oos.annRetPct,oosSharpe:best.oos.sharpe,oosTrades:best.oos.trades,oosWin:best.oos.winRate};
 out.spreads[sp.name]=res;}
fs.writeFileSync(__dirname+'/results.json',JSON.stringify(out,null,1));
for(const [nm,r] of Object.entries(out.spreads)){console.log('\n== '+nm,r.start,r.end,'n='+r.n,'WF:',JSON.stringify(r.walkForward));
 for(const [k,g] of Object.entries(r.grid)){const f=g.full;console.log(k,`tr=${f.trades} win=${f.winRate} avg=${f.avgNetPct}% (gross ${f.avgGrossPct}) ann=${f.annRetPct}% SR=${f.sharpe} DD=${f.maxDDPct} worst=${f.worstTradePct} best=${f.bestTradePct} top5=${f.top5pctShareOfPnL}% L/S=${f.longPnLPct}/${f.shortPnLPct} time=${f.timeExitPct}% | clean ann=${g.jumpCleaned.annRetPct} SR=${g.jumpCleaned.sharpe} | longOnly ann=${g.longOnly.annRetPct} SR=${g.longOnly.sharpe} | delay2 ${g.delay2.annRetPct}/${g.delay2.sharpe} cost10bp ${g.cost10bpPerLeg.annRetPct}/${g.cost10bpPerLeg.sharpe} | IS ${g.IS.annRetPct}/${g.IS.sharpe} OOS ${g.OOS.annRetPct}/${g.OOS.sharpe}`);
  }}
