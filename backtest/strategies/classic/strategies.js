const L=require('./lib.js');const{DAY,HOUR,dk,load,align,fundBars,sma,rstd,prevMax,prevMin,atrW,rsiW,wengine,toDaily,fromStates,firstDefined}=L;
const C={spot:0.001+0.0005,perp:0.0005+0.0005,upbit:0.0005+0.0005};
const FEE={spot:0.001,perp:0.0005,upbit:0.0005,zero:0},SLIP=0.0005;

// ---------- data ----------
const SPOT_CANDS=['BTC','ETH','BNB','XRP','ADA','DOGE','SOL','LTC','TRX','LINK','XLM','ETC','BCH','DOT','AVAX','ATOM','EOS','FIL','UNI','NEAR','MATIC','POL','LUNA','FTT','SHIB','ICP','BCC','VEN','BCHABC','SUI','TON'];
const PERP_CANDS=['BTC','ETH','BNB','XRP','ADA','DOGE','SOL','LTC','TRX','LINK','XLM','ETC','BCH','DOT','AVAX','ATOM','EOS','FIL','UNI','NEAR','MATIC','POL','LUNA','FTT','ICP','SUI','TON'];
const btc=load('spot_BTC_1d');const TD=btc.t; // daily calendar 2017-08-17..2026-09-30
function spotAligned(sym,withFund){const b=load('spot_'+sym+'_1d');const a=align(b,TD);if(withFund)a.f=fundBars(TD,DAY,sym);a.sym=sym;return a;}
// point-in-time universe: top-10 by trailing 60d Binance spot USDT quote volume, re-ranked each quarter start (needs >=60 days history)
function pitUniverse(assets,topN=10,win=60){const uni=new Array(TD.length).fill(null);let cur=null;
 for(let t=0;t<TD.length;t++){const d=new Date(TD[t]);const qs=d.getUTCDate()===1&&d.getUTCMonth()%3===0;if(t===win||(t>win&&qs)){const sc=[];assets.forEach((a,i)=>{let s=0,ok=0;for(let j=t-win;j<t;j++)if(Number.isFinite(a.v[j])){s+=a.v[j];ok++;}if(ok>=win&&Number.isFinite(a.o[t]))sc.push([i,s]);});sc.sort((x,y)=>y[1]-x[1]);cur=new Set(sc.slice(0,topN).map(x=>x[0]));}uni[t]=cur;}return uni;}

// ---------- 1. Turtle ----------
function turtle({A,sys,ls,cost,uni,start,riskPct=0.01,maxUnits=4,grossCap,skip=true}){
 // Close-based signals, executed at NEXT bar open (no intrabar ambiguity). Exits processed before entries.
 const fee=FEE[cost],slip=SLIP;const E=sys===1?20:55,X=sys===1?10:20;const n=A.length;
 const P=A.map(a=>({N:atrW(a.h,a.l,a.c,20),hiE:prevMax(a.h,E),loE:prevMin(a.l,E),hiX:prevMax(a.h,X),loX:prevMin(a.l,X),hi55:prevMax(a.h,55),lo55:prevMin(a.l,55)}));
 const st=A.map(()=>({q:0,dir:0,units:0,stop:0,last:0,Nent:0,cf:0,eq0:0,d0:null,lastPx:0}));
 const sh=A.map(()=>({dir:0,pend:0,entry:0,stop:0,Nent:0,exitPend:false}));const lastWin=A.map(()=>false);
 let cash=1,eqPrev=1;const rows=[],trades=[];let orders=[];
 for(let t=start;t<TD.length;t++){let costD=0,turnD=0,traded=false;const eqS=eqPrev;
  const trade=(i,dq,raw)=>{const px=raw*(1+Math.sign(dq)*slip);const f=Math.abs(dq)*px*fee;cash-=dq*px+f;st[i].cf-=dq*px+f;st[i].q+=dq;costD+=Math.abs(dq)*raw*(fee+slip);turnD+=Math.abs(dq)*raw;traded=true;return px;};
  const grossNow=()=>{let g=0;for(let k=0;k<n;k++)if(st[k].q)g+=Math.abs(st[k].q)*(Number.isFinite(A[k].o[t])?A[k].o[t]:st[k].lastPx);return g;};
  const closePos=(i,raw)=>{const s=st[i];trade(i,-s.q,raw);trades.push({d:dk(TD[t]),pnl:s.cf/s.eq0,dir:s.dir,a:i,from:s.d0});s.q=0;s.dir=0;s.units=0;s.cf=0;};
  // shadow fills at open
  for(let i=0;i<n;i++){const s=sh[i],o=A[i].o[t];if(!Number.isFinite(o))continue;if(s.exitPend){lastWin[i]=(o-s.entry)*s.dir>0;s.dir=0;s.exitPend=false;}if(s.pend){s.dir=s.pend;s.entry=o;s.stop=o-s.dir*2*s.Nent;s.pend=0;}}
  // execute orders: exits first
  orders.sort((a,b)=>(a.type==='exit'?0:1)-(b.type==='exit'?0:1));
  for(const od of orders){const i=od.i,s=st[i],o=A[i].o[t];if(!Number.isFinite(o))continue;
   if(od.type==='exit'){if(s.q)closePos(i,o);continue;}
   const N=od.N;let q=riskPct*eqS/N;
   if(cost==='spot')q=Math.min(q,cash/(o*(1+slip)*(1+fee)));else q=Math.min(q,Math.max(0,grossCap*eqS-grossNow())/o);
   if(q<0.25*riskPct*eqS/N)continue;
   if(od.type==='entry'){if(s.q)continue;s.eq0=eqS;s.d0=dk(TD[t]);s.cf=0;const px=trade(i,od.dir*q,o);s.dir=od.dir;s.units=1;s.Nent=N;s.last=px;s.stop=px-od.dir*2*N;}
   else if(od.type==='add'){if(!s.q||s.dir!==od.dir)continue;const px=trade(i,od.dir*q,o);s.units++;s.last=px;s.stop=px-s.dir*2*s.Nent;}}
  orders=[];
  // funding + mark
  let F=0;for(let i=0;i<n;i++)if(st[i].q&&A[i].f){const pr=Number.isFinite(A[i].c[t])?A[i].c[t]:st[i].lastPx;const fc=st[i].q*pr*(A[i].f[t]||0);cash-=fc;st[i].cf-=fc;F+=fc;}
  for(let i=0;i<n;i++)if(Number.isFinite(A[i].c[t]))st[i].lastPx=A[i].c[t];
  // delisting: if no next bar, close at this close
  for(let i=0;i<n;i++)if(st[i].q&&t<TD.length-1&&!Number.isFinite(A[i].o[t+1])&&Number.isFinite(A[i].c[t]))closePos(i,A[i].c[t]);
  let eq=cash;let held=false;for(let i=0;i<n;i++)if(st[i].q){eq+=st[i].q*st[i].lastPx;held=true;}
  rows.push({t:TD[t],r:eq/eqPrev-1,cost:costD/eqPrev,fund:F/eqPrev,turn:turnD/eqPrev,exp:(held||traded)?1:0});eqPrev=eq;if(eq<=0)break;
  // signals on close t -> orders for t+1
  for(let i=0;i<n;i++){const a=A[i],p=P[i],c=a.c[t],N=p.N[t];if(!Number.isFinite(c)||!Number.isFinite(N)||!Number.isFinite(p.hiE[t]))continue;
   // shadow (System 1 skip filter tracks every breakout)
   if(sys===1&&skip){const s=sh[i];if(s.dir&&!s.exitPend){const lvl=s.dir>0?Math.max(p.loX[t],s.stop):Math.min(p.hiX[t],s.stop);if(s.dir>0?c<lvl:c>lvl)s.exitPend=true;}
    else if(!s.dir&&!s.pend){if(c>p.hiE[t]){s.pend=1;s.Nent=N;}else if(ls&&c<p.loE[t]){s.pend=-1;s.Nent=N;}}}
   const s=st[i];
   if(s.dir){const lvl=s.dir>0?Math.max(p.loX[t],s.stop):Math.min(p.hiX[t],s.stop);
    if(s.dir>0?c<lvl:c>lvl)orders.push({type:'exit',i});
    else if(s.units<maxUnits&&(s.dir>0?c>=s.last+0.5*s.Nent:c<=s.last-0.5*s.Nent))orders.push({type:'add',i,dir:s.dir,N});continue;}
   if(uni&&!(uni[t]&&uni[t].has(i)))continue;
   const allow=!(sys===1&&skip)||!lastWin[i];
   if(c>p.hiE[t]&&(allow||(sys===1&&c>p.hi55[t])))orders.push({type:'entry',i,dir:1,N});
   else if(ls&&c<p.loE[t]&&(allow||(sys===1&&c<p.lo55[t])))orders.push({type:'entry',i,dir:-1,N});}
 }
 return{rows:toDaily(rows),trades};}


// ---------- 2. TSMOM vol-target ----------
function tsmom({A,lb,tv,ls,cost,uni,nDen=1,start}){const n=A.length;
 const S=A.map(a=>{const lr=a.c.map((c,i)=>i&&Number.isFinite(c)&&Number.isFinite(a.c[i-1])?Math.log(c/a.c[i-1]):NaN);const vol=rstd(lr,30).map(x=>x*Math.sqrt(365));
  const mom=a.c.map((c,i)=>lb==='12-1'?(i>=365?a.c[i-30]/a.c[i-365]-1:NaN):(i>=lb?c/a.c[i-lb]-1:NaN));return{vol,mom};});
 const cap=ls?2:1;
 const tgt=(t,w)=>{if(t<1)return null;const s=t-1;const raw=new Array(n).fill(0);let any=false;
  for(let i=0;i<n;i++){if(uni&&!(uni[s]&&uni[s].has(i)))continue;const m=S[i].mom[s],v=S[i].vol[s];if(!Number.isFinite(m)||!Number.isFinite(v)||v<=0)continue;any=true;let sg=Math.sign(m);if(!ls&&sg<0)sg=0;raw[i]=sg*Math.min(cap,tv/v)/nDen;}
  let g=raw.reduce((a,b)=>a+Math.abs(b),0);if(g>cap)for(let i=0;i<n;i++)raw[i]*=cap/g;
  let need=false;const out=w.slice();for(let i=0;i<n;i++){const x=raw[i],y=w[i];if((x===0&&y!==0)||(x!==0&&(Math.sign(x)!==Math.sign(y)||Math.abs(x-y)>0.2*Math.abs(x)))){out[i]=x;need=true;}}
  return need?out:null;};
 return wengine({T:TD,A,cps:C[cost],tgt,start});}

// ---------- generic single-asset state strategies (daily/4h) ----------
function runStates(T,A,pos,cps){return wengine({T,A,cps,tgt:fromStates(pos),start:Math.max(1,firstDefined(pos))});}
function maStrat(a,kind,p){const c=a.c;const n=c.length;const pos=new Array(n).fill(null);
 if(kind==='sma'){const m=sma(c,p);for(let i=0;i<n;i++)if(Number.isFinite(m[i]))pos[i]=c[i]>m[i]?1:0;}
 if(kind==='cross'){const f=sma(c,p[0]),s=sma(c,p[1]);for(let i=0;i<n;i++)if(Number.isFinite(s[i]))pos[i]=f[i]>s[i]?1:0;}
 if(kind==='faber'){ // monthly: at last daily close of month, close > SMA of last p month-end closes -> hold next month
  const me=[];let cur=0;for(let i=0;i<n;i++){const last=i===n-1||new Date(a.t?a.t[i]:TD[i]).getUTCMonth()!==new Date(a.t?a.t[i+1]:TD[i+1]).getUTCMonth();if(last){me.push(c[i]);if(me.length>=p){const m=me.slice(-p).reduce((x,y)=>x+y)/p;cur=c[i]>m?1:0;pos[i]=cur;}}else if(me.length>=p)pos[i]=cur;}}
 return pos;}
function rsi2Pos(a,entry=10,exitR=70,trendN=200){const r=rsiW(a.c,2),m=sma(a.c,trendN),m5=sma(a.c,5);const pos=new Array(a.c.length).fill(null);let st=0;
 for(let i=0;i<a.c.length;i++){if(!Number.isFinite(m[i])||!Number.isFinite(r[i]))continue;if(st===0&&r[i]<entry&&a.c[i]>m[i])st=1;else if(st===1&&(r[i]>exitR||a.c[i]>m5[i]))st=0;pos[i]=st;}return pos;}
function bbPos(a,mode,ls,n=20,k=2){const m=sma(a.c,n),sd=rstd(a.c,n);const pos=new Array(a.c.length).fill(null);let st=0;
 for(let i=0;i<a.c.length;i++){if(!Number.isFinite(sd[i]))continue;const up=m[i]+k*sd[i],dn=m[i]-k*sd[i],c=a.c[i];
  if(mode==='rev'){if(st===0){if(c<dn)st=1;else if(ls&&c>up)st=-1;}else if(st===1&&c>m[i])st=0;else if(st===-1&&c<m[i])st=0;}
  else{if(st===0){if(c>up)st=1;else if(ls&&c<dn)st=-1;}else if(st===1&&c<m[i])st=0;else if(st===-1&&c>m[i])st=0;}
  pos[i]=st;}return pos;}

// ---------- 8. Dual momentum BTC/ETH/cash ----------
function dualMom(B,E,lb){const n=TD.length;const pos=new Array(n).fill(null);let cur=null;
 for(let i=0;i<n;i++){const last=i===n-1||new Date(TD[i]).getUTCMonth()!==new Date(TD[i+1]).getUTCMonth();
  if(last&&i>=lb){const rb=B.c[i]/B.c[i-lb]-1,re=E.c[i]/E.c[i-lb]-1;if(Number.isFinite(rb)&&Number.isFinite(re)){const best=rb>=re?0:1,r=Math.max(rb,re);cur=r>0?(best===0?[1,0]:[0,1]):[0,0];}}
  if(cur)pos[i]=cur;}return pos;}

// ---------- 9. cross-sectional momentum on perps ----------
function xsmom({P,lb,k=3,minN=8,cost='perp',rev=false}){const n=P.length;let lastW=null;
 const tgt=(t,w)=>{const d=new Date(TD[t]);if(d.getUTCDay()!==1)return null;const s=t-1;const sc=[];
  for(let i=0;i<n;i++){const a=P[i];if(!Number.isFinite(a.o[t])||s-lb<0)continue;const c0=a.c[s-lb],c1=a.c[s];let hist=0;for(let j=Math.max(0,s-lb-30);j<=s;j++)if(Number.isFinite(a.c[j]))hist++;if(!Number.isFinite(c0)||!Number.isFinite(c1)||hist<lb+31)continue;sc.push([i,c1/c0-1]);}
  const out=new Array(n).fill(0);if(sc.length>=minN){sc.sort((x,y)=>y[1]-x[1]);for(let j=0;j<k;j++){const sg=rev?-1:1;out[sc[j][0]]=sg*0.5/k;out[sc[sc.length-1-j][0]]=-sg*0.5/k;}}
  return out;};
 return wengine({T:TD,A:P,cps:C[cost],tgt,start:1});}

// ---------- 4. Larry Williams volatility breakout (Upbit KRW-BTC) ----------
function lwvb({D,Hmap,k,ma5=false,mode='honest',fee=FEE.upbit,slip=SLIP,noiseN=20}){const n=D.t.length;const rows=[],trades=[];let missing=0;
 const noise=D.t.map((_,i)=>D.h[i]>D.l[i]?1-Math.abs(D.c[i]-D.o[i])/(D.h[i]-D.l[i]):NaN);
 for(let t=noiseN+1;t<n-1;t++){const O=D.o[t];let kk=k;if(k==='noise'){let s=0;for(let j=t-noiseN;j<t;j++)s+=noise[j];kk=s/noiseN;}
  const target=O+kk*(D.h[t-1]-D.l[t-1]);let ok=true;if(ma5){let s=0;for(let j=t-5;j<t;j++)s+=D.c[j];ok=target>s/5;}
  let entry=null,expo=0;
  if(ok){if(mode==='honest'){const hs=Hmap.get(D.t[t]);if(!hs||hs.length<20){missing++;}else{for(let j=0;j<hs.length;j++){if(hs[j].h>=target){entry=Math.max(target,hs[j].o);expo=(24-j)/24;break;}}}}
   else{if(D.h[t]>=target){entry=target;expo=0.5;}}}
  let r=0,cost=0,turn=0;
  if(entry!==null){const exit=mode==='honest'?D.o[t+1]:D.c[t];const ein=entry*(1+slip),eout=exit*(1-slip);r=(eout*(1-fee))/(ein*(1+fee))-1;cost=2*(fee+slip);turn=2;trades.push({d:dk(D.t[t]),pnl:r});}
  rows.push({t:D.t[t],r,cost,turn,exp:expo});}
 return{rows:toDaily(rows),trades,missing};}

// ---------- 5. Dual Thrust intraday (BTC 1h, Binance spot prices) ----------
function dualThrust({D,Hmap,N=4,k1=0.5,k2=0.5,ls=true,cost='perp',fundMap}){const fee=FEE[cost],slip=cost==='zero'?0:SLIP;const rows=[],trades=[];
 for(let t=N;t<D.t.length;t++){const hs=Hmap.get(D.t[t]);if(!hs||hs.length<20){rows.push({t:D.t[t],r:0,cost:0,turn:0,exp:0});continue;}
  let HH=-Infinity,LL=Infinity,HC=-Infinity,LC=Infinity;for(let j=t-N;j<t;j++){HH=Math.max(HH,D.h[j]);LL=Math.min(LL,D.l[j]);HC=Math.max(HC,D.c[j]);LC=Math.min(LC,D.c[j]);}
  const R=Math.max(HH-LC,HC-LL),up=D.o[t]+k1*R,dn=D.o[t]-k2*R;let pos=0,ein=0,mult=1,cst=0,turn=0,hrs=0;
  const open=(dir,px)=>{pos=dir;ein=px*(1+dir*slip);cst+=fee+slip;turn++;};
  const close=(px)=>{const eout=px*(1-pos*slip);const r=pos*(eout-ein)/ein-fee*(1+eout/ein);mult*=1+r;cst+=fee+slip;turn++;trades.push({d:dk(D.t[t]),pnl:r});pos=0;};
  for(let j=0;j<hs.length;j++){const b=hs[j];
   if(pos&&fundMap){const fr=fundMap.get(b.t);if(fr)mult*=1-pos*fr;} // funding settles at 08:00/16:00 UTC when position is held at hour start
   const hu=b.h>=up,hd=b.l<=dn;
   if(pos===0){if(hu&&hd){open(1,Math.max(b.o,up));close(Math.min(b.o,dn)<dn?dn:dn);if(ls)open(-1,dn);}else if(hu)open(1,Math.max(b.o,up));else if(hd&&ls)open(-1,Math.min(b.o,dn));}
   else if(pos===1&&hd){close(Math.min(b.o,dn));if(ls)open(-1,Math.min(b.o,dn));}
   else if(pos===-1&&hu){close(Math.max(b.o,up));open(1,Math.max(b.o,up));}
   if(pos)hrs++;}
  if(pos)close(hs[hs.length-1].c);
  rows.push({t:D.t[t],r:mult-1,cost:cst,turn,exp:hrs/24});}
 return{rows:toDaily(rows),trades};}

function hourMap(b){const m=new Map();for(let i=0;i<b.t.length;i++){const d=Math.floor(b.t[i]/DAY)*DAY;if(!m.has(d))m.set(d,[]);m.get(d).push({t:b.t[i],o:b.o[i],h:b.h[i],l:b.l[i],c:b.c[i]});}return m;}

module.exports={C,FEE,SLIP,SPOT_CANDS,PERP_CANDS,TD,spotAligned,pitUniverse,turtle,tsmom,runStates,maStrat,rsi2Pos,bbPos,dualMom,xsmom,lwvb,dualThrust,hourMap};
