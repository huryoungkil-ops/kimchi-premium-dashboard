// All-futures-class spread mean-reversion backtest. Engine copied from ../commod/bt.js (identical rules) +
// optional rolling-OLS beta (DV01/beta-neutral) variant. No look-ahead: z uses data through t, trade at close t+1.
const fs=require('fs');
function load(f,col=1){const L=fs.readFileSync(__dirname+'/data/'+f,'utf8').trim().split('\n').slice(1);const m=new Map();
 for(const l of L){const p=l.split(',');const v=parseFloat(p[col]);if(isFinite(v)&&v>0)m.set(p[0],v);}return m;}
function shiftMap(m,lag){const ks=[...m.keys()].sort();const o=new Map();for(let i=lag;i<ks.length;i++)o.set(ks[i],m.get(ks[i-lag]));return o;}
function join(maps){const ks=[...maps[0].keys()].filter(k=>maps.every(m=>m.has(k))).sort();return {dates:ks,cols:maps.map(m=>ks.map(k=>m.get(k)))};}
function prod(a,b,f=(x,y)=>x*y){return new Map([...a].filter(([k])=>b.has(k)).map(([k,v])=>[k,f(v,b.get(k))]));}
// synthetic constant-maturity bond total-return price from FRED yield (%): dlnP = -D*dy + y*dt
function yld2px(m,D){const ks=[...m.keys()].sort();const o=new Map();let p=100;o.set(ks[0],p);
 for(let i=1;i<ks.length;i++){const y0=m.get(ks[i-1])/100,y1=m.get(ks[i])/100;const dt=(Date.parse(ks[i])-Date.parse(ks[i-1]))/864e5/365;
  p*=Math.exp(-D*(y1-y0)+y0*dt);o.set(ks[i],p);}return o;}
const D={};
for(const f of fs.readdirSync(__dirname+'/data'))if(f.endsWith('.csv')&&!/^DGS|^DCOIL|^DGAS|^DHOIL/.test(f))D[f.slice(0,-4)]=load(f);
for(const s of ['DGS2','DGS5','DGS10'])D[s]=load(s+'.csv');
D.Y2=yld2px(D.DGS2,1.9);D.Y5=yld2px(D.DGS5,4.5);D.Y10=yld2px(D.DGS10,8.5);
D.EWY_KRW=prod(D.EWY,D.KRW_X);D.EWY_KRW_lag=shiftMap(D.EWY_KRW,1);
D.EWJ_JPY=prod(D.EWJ,D.JPY_X);D.EWJ_JPY_lag=shiftMap(D.EWJ_JPY,1);
D.TTF_USD=prod(D.TTF_F,D.EURUSD_X,(t,e)=>t*e/3.412);
D.CNH_F_lag=shiftMap(D.CNH_F,1);
const tick={ES_F:.25,NQ_F:.25,YM_F:1,RTY_F:.1,NKD_F:5,_GSPC:.25,'069500.KS':5,EWY:.01,EWJ:.01,_N225:5,
 ZN_F:1/64,ZF_F:1/128,ZB_F:1/32,ZT_F:1/256,_6A_F:5e-5,_6N_F:5e-5,_6E_F:5e-5,_6S_F:5e-5,_6B_F:1e-4,_6C_F:5e-5,
 CNY_X:1e-4,CNH_F:1e-4,_VIX:.05,_VIX3M:.05,HG_F:.0005,GC_F:.1,PL_F:.1,PA_F:.5,NG_F:.001,CL_F:.01,HO_F:1e-4,RB_F:1e-4,
 TTF_F:.005,LE_F:.025,GF_F:.025,HE_F:.025,ZC_F:.25,SB_F:.01,CC_F:1,KC_F:.05,CT_F:.01,ZS_F:.25,BTC_F:5,'BTC-USD':.01};
// Yahoo files for symbols starting with a digit were saved as e.g. 6A_F.csv
for(const k of Object.keys(D))if(/^\d[A-Z]_F$/.test(k))D['_'+k]=D[k];
const BP=4e-4;
function mk(name,cls,bind,a,b,fa,fb,ca,cb,extra={}){const j=join([...a.map(k=>{if(!D[k])throw Error('missing '+k);return D[k]}),...b.map(k=>D[k])]);const n=j.dates.length;
 const A=[],B=[],CA=[],CB=[];for(let i=0;i<n;i++){const row=j.cols.map(c=>c[i]);A.push(fa(row));B.push(fb(row));CA.push(ca(row));CB.push(cb(row));}
 return {name,cls,bind,dates:j.dates,A,B,CA,CB,...extra};}
const c1=(k,i)=>r=>BP+(tick[k]||0)/r[i];
const p0=r=>r[0],p1=r=>r[1];
const pair=(name,cls,bind,ka,kb,extra)=>mk(name,cls,bind,[ka],[kb],p0,p1,c1(ka,0),c1(kb,1),extra);
const PHYS='물리적 차익', FIN='금융 차익', STAT='통계/경제적 상관', WEAK='약한 물리적 연결';
const S=[];
// Equity index
S.push(pair('S&P/Nasdaq (ES/NQ)','주가지수',STAT,'ES_F','NQ_F',{betaVar:true}));
S.push(pair('Dow/S&P (YM/ES)','주가지수',STAT,'YM_F','ES_F',{betaVar:true}));
S.push(pair('Russell/S&P (RTY/ES)','주가지수',STAT,'RTY_F','ES_F',{betaVar:true}));
S.push(pair('Nikkei$/S&P (NKD/ES)','주가지수',STAT,'NKD_F','ES_F',{betaVar:true}));
S.push(pair('S&P cash vs futures basis (^GSPC/ES)','주가지수',FIN,'_GSPC','ES_F'));
S.push(mk('KODEX200 vs EWY×KRW (same date)','주가지수',FIN,['069500.KS'],['EWY_KRW'],p0,p1,c1('069500.KS',0),r=>BP+1e-4));
S.push(mk('KODEX200 vs EWY×KRW (EWY lag 1d, async check)','주가지수',FIN,['069500.KS'],['EWY_KRW_lag'],p0,p1,c1('069500.KS',0),r=>BP+1e-4));
S.push(mk('Nikkei225 vs EWJ×JPY (same date)','주가지수',FIN,['_N225'],['EWJ_JPY'],p0,p1,c1('_N225',0),r=>BP+1e-4));
S.push(mk('Nikkei225 vs EWJ×JPY (EWJ lag 1d, async check)','주가지수',FIN,['_N225'],['EWJ_JPY_lag'],p0,p1,c1('_N225',0),r=>BP+1e-4));
// Rates
S.push(pair('10y/5y (ZN/ZF)','금리',STAT,'ZN_F','ZF_F',{betaVar:true}));
S.push(pair('Bond/10y (ZB/ZN)','금리',STAT,'ZB_F','ZN_F',{betaVar:true}));
S.push(pair('10y/2y (ZN/ZT)','금리',STAT,'ZN_F','ZT_F',{betaVar:true}));
S.push(mk('FRED 10y/2y synthetic bond (DGS10/DGS2)','금리',STAT,['Y10'],['Y2'],p0,p1,r=>BP+5e-5,r=>BP+5e-5,{betaVar:true}));
// FX
S.push(pair('AUD/NZD (6A/6N)','외환',STAT,'_6A_F','_6N_F'));
S.push(pair('EUR/CHF (6E/6S)','외환',STAT,'_6E_F','_6S_F'));
S.push(pair('EUR/GBP (6E/6B)','외환',STAT,'_6E_F','_6B_F'));
S.push(pair('CAD vs oil (6C/CL)','외환',STAT,'_6C_F','CL_F'));
S.push(mk('CNY onshore vs CNH futures (CNH lag 1d, aligned)','외환',FIN,['CNY_X'],['CNH_F_lag'],p0,p1,c1('CNY_X',0),c1('CNH_F',1)));
S.push(mk('CNY vs CNH (same Yahoo date; stale-stamp artifact)','외환',FIN,['CNY_X'],['CNH_F'],p0,p1,c1('CNY_X',0),c1('CNH_F',1)));
// Volatility
S.push(pair('VIX/VIX3M term structure (index proxy)','변동성',STAT,'_VIX','_VIX3M'));
// Metals
S.push(pair('Copper/Gold (HG/GC)','금속',STAT,'HG_F','GC_F'));
S.push(pair('Platinum/Palladium (PL/PA)','금속',WEAK,'PL_F','PA_F'));
S.push(pair('Platinum/Gold (PL/GC)','금속',STAT,'PL_F','GC_F'));
// Energy
S.push(pair('Gas/Oil (NG/CL)','에너지',WEAK,'NG_F','CL_F'));
S.push(pair('Diesel/Gasoline (HO/RB)','에너지',PHYS,'HO_F','RB_F'));
S.push(mk('TTF$/Henry Hub (TTF×EURUSD/3.412 vs NG)','에너지',PHYS,['TTF_USD'],['NG_F'],p0,p1,r=>BP+tick.TTF_F/(r[0]*3.412/1.1),c1('NG_F',1)));
// Livestock: per head: 12.5cwt fed steer vs 7.5cwt feeder + 50bu corn
S.push(mk('Cattle crush (12.5LE vs 7.5GF+50bu ZC)','축산',PHYS,['LE_F'],['GF_F','ZC_F'],r=>12.5*r[0],r=>7.5*r[1]+0.5*r[2],c1('LE_F',0),r=>BP+(7.5*.025+.5*.25)/(7.5*r[1]+0.5*r[2])));
S.push(pair('Hog/Corn (HE/ZC)','축산',PHYS,'HE_F','ZC_F'));
// Softs
S.push(pair('Sugar/Corn (SB/ZC, ethanol link)','소프트',WEAK,'SB_F','ZC_F'));
S.push(pair('Cocoa/Coffee (CC/KC, control)','소프트',STAT,'CC_F','KC_F'));
S.push(pair('Cotton/Soy (CT/ZS, control)','소프트',STAT,'CT_F','ZS_F'));
// Crypto
S.push(pair('CME BTC basis (BTC=F/BTC-USD)','암호화폐',FIN,'BTC_F','BTC-USD'));

function rollBeta(A,B,W=60){const n=A.length,b=new Array(n).fill(NaN);const ra=A.map((x,i)=>i?x/A[i-1]-1:0),rb=B.map((x,i)=>i?x/B[i-1]-1:0);
 for(let i=W;i<n;i++){let ma=0,mb=0;for(let k=i-W+1;k<=i;k++){ma+=ra[k];mb+=rb[k];}ma/=W;mb/=W;let c=0,v=0;for(let k=i-W+1;k<=i;k++){c+=(ra[k]-ma)*(rb[k]-mb);v+=(rb[k]-mb)**2;}
  b[i]=v>0?Math.min(Math.max(c/v,0.1),10):NaN;}return b;}
function run(sp,N,H,opt={}){const {dates,A,B,CA,CB}=sp;const n=dates.length;
 const lr=X=>X.map((x,i)=>i?Math.log(x/X[i-1]):0);const la=lr(A),lb=lr(B);
 const bet=opt.beta?rollBeta(A,B):null;
 let s;if(bet){s=new Array(n).fill(0);for(let i=1;i<n;i++){const b=isFinite(bet[i-1])?bet[i-1]:1;s[i]=s[i-1]+la[i]-b*lb[i];}}
 else s=A.map((a,i)=>Math.log(a/B[i]));
 const rA=new Array(n).fill(0),rB=new Array(n).fill(0);
 const sd60=(X,i)=>{let m=0;for(let k=i-60;k<i;k++)m+=X[k];m/=60;let v=0;for(let k=i-60;k<i;k++)v+=(X[k]-m)**2;return Math.sqrt(v/59)};
 for(let i=1;i<n;i++){rA[i]=A[i]/A[i-1]-1;rB[i]=B[i]/B[i-1]-1;
  if(opt.clean&&i>60){if(Math.abs(la[i])>6*sd60(la,i))rA[i]=0;if(Math.abs(lb[i])>6*sd60(lb,i))rB[i]=0;}}
 const z=new Array(n).fill(NaN);let sm=0,sq=0;
 for(let i=0;i<n;i++){sm+=s[i];sq+=s[i]*s[i];if(i>=N){sm-=s[i-N];sq-=s[i-N]*s[i-N];}
  if(i>=N-1){const m=sm/N,v=Math.max(sq/N-m*m,0)*N/(N-1),sd=Math.sqrt(v);z[i]=sd>0?(s[i]-m)/sd:NaN;}}
 if(bet)for(let i=0;i<Math.min(n,60+N);i++)z[i]=NaN;
 const pnl=new Array(n).fill(0);const trades=[];let pos=0,ent=-1,VA=1,VB=1,bE=1,pend=null;
 for(let i=1;i<n;i++){
  if(pos!==0){const nVA=VA*(1+rA[i]),nVB=VB*(1+rB[i]);pnl[i]+=pos*((nVA-VA)-(nVB-VB));VA=nVA;VB=nVB;}
  if(pend!==null&&i>=pend.at){
   if(pend.type==='enter'){bE=bet&&isFinite(bet[i])?bet[i]:1;}
   const c=(CA[i]+bE*CB[i])/2+(opt.extraBp||0)*1e-4*(1+bE)/2;
   if(pend.type==='enter'){pos=pend.dir;ent=i;VA=1;VB=bE;pnl[i]-=c;trades.push({dir:pos,ei:i,cost:c,b:bE});}
   else{pnl[i]-=c;const t=trades.at(-1);t.xi=i;t.cost+=c;t.gross=pos*(VA-1-(VB-bE));t.net=t.gross-t.cost;t.reason=pend.reason;pos=0;}
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
module.exports={S,run,stats,yearly,blocks};
if(require.main!==module)return;
const grid=[[20,10],[20,20],[60,10],[60,20]];
const out={generated:new Date().toISOString(),assumptions:{
 signal:'same as ../commod: z=(ln(A/B)-MA_N)/SD_N through t; enter at |z|>2, exit at z crossing ±0.25 past mean or H days; execute close t+1',
 sizing:'$1 per leg (beta variant: $1 A vs $beta B, beta = rolling 60d OLS of daily returns A on B through entry day, clipped 0.1..10; beta-variant spread = cumulative sum of rA - beta_{t-1} rB); P&L % of one-leg($1 A) notional, non-compounded',
 cost:'per leg per round trip 4bp + 1 tick; +12bp stress adds 12bp per leg per round trip',
 ticks:tick,
 synthetic:'FRED DGS yields -> constant-maturity price index with fixed modified duration (2y 1.9, 5y 4.5, 10y 8.5) + carry',
 data:'Yahoo continuous front-month (=F) daily closes (roll gaps not adjusted); FRED DGS2/5/10'},spreads:{}};
for(const sp of S){const res={cls:sp.cls,bind:sp.bind,n:sp.dates.length,start:sp.dates[0],end:sp.dates.at(-1),grid:{}};
 const half=Math.floor(sp.dates.length/2);let best=null;
 for(const [N,H] of grid){const k=`N${N}_H${H}`;const r=run(sp,N,H);
  const IS=stats(r,0,half),OOS=stats(r,half);
  res.grid[k]={full:stats(r),delay2:stats(run(sp,N,H,{delay:2})),cost12bp:stats(run(sp,N,H,{extraBp:12})),jumpCleaned:stats(run(sp,N,H,{clean:true})),
   longOnly:stats(run(sp,N,H,{longOnly:true})),IS,OOS,blocks:blocks(r),yearly:yearly(r)};
  if(sp.betaVar){const rb=run(sp,N,H,{beta:true});res.grid[k].betaNeutral={full:stats(rb),OOS:stats(rb,half),blocks:blocks(rb)};}
  if(!best||IS.sharpe>best.isSharpe)best={k,isSharpe:IS.sharpe,oos:OOS};}
 res.walkForward={splitDate:sp.dates[half],chosen:best.k,isSharpe:best.isSharpe,oosAnnRetPct:best.oos.annRetPct,oosSharpe:best.oos.sharpe,oosTrades:best.oos.trades,oosWin:best.oos.winRate};
 out.spreads[sp.name]=res;}
fs.writeFileSync(__dirname+'/results.json',JSON.stringify(out,null,1));
for(const [nm,r] of Object.entries(out.spreads)){console.log('\n== '+nm,r.start,r.end,'n='+r.n,'WF:',JSON.stringify(r.walkForward));
 for(const k of ['N60_H20','N20_H10']){const g=r.grid[k],f=g.full;console.log(k,`tr=${f.trades} win=${f.winRate} avg=${f.avgNetPct}% ann=${f.annRetPct}% SR=${f.sharpe} DD=${f.maxDDPct} worst=${f.worstTradePct} top5=${f.top5pctShareOfPnL}% | clean ${g.jumpCleaned.annRetPct}/${g.jumpCleaned.sharpe} | d2 ${g.delay2.annRetPct}/${g.delay2.sharpe} c12 ${g.cost12bp.annRetPct}/${g.cost12bp.sharpe} | OOS ${g.OOS.annRetPct}/${g.OOS.sharpe}`+(g.betaNeutral?` | beta ${g.betaNeutral.full.annRetPct}/${g.betaNeutral.full.sharpe} tr=${g.betaNeutral.full.trades} OOS ${g.betaNeutral.OOS.sharpe}`:''));}}
