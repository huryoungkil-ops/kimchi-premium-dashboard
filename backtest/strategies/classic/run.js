const fs=require('fs');const L=require('./lib.js');const S=require('./strategies.js');
const{DAY,HOUR,IS,OOS,FULL,dk,load,align,fundBars,stats,tstats,yearly,monthlyEq,corr,wengine}=L;const{TD,C}=S;
const R={};const t0=Date.now();
function add(name,meta,res){if(meta.family==='9 XS Momentum'){const i=res.rows.findIndex(x=>x.gross>0);res.rows=res.rows.slice(Math.max(0,i));}R[name]={...meta,res};}
const log=(...a)=>console.log(((Date.now()-t0)/1000).toFixed(0)+'s',...a);

// ---------- data ----------
const BTC=S.spotAligned('BTC',false),ETH=S.spotAligned('ETH',false),BTCp=S.spotAligned('BTC',true),ETHp=S.spotAligned('ETH',true);
const spotAll=S.SPOT_CANDS.map(s=>S.spotAligned(s,false));const spotAllP=S.SPOT_CANDS.map(s=>S.spotAligned(s,true));
const UNI=S.pitUniverse(spotAll,10,60);
const uniStart=60;
const perps=S.PERP_CANDS.map(s=>{const b=load('perp_'+s+'_1d');const a=align(b,TD);a.f=fundBars(TD,DAY,s);a.sym=s;return a;});
// universe log
const uniLog={};for(let t=0;t<TD.length;t++){const d=dk(TD[t]);if(t===uniStart||(UNI[t]!==UNI[t-1]&&UNI[t])){uniLog[d]=[...UNI[t]].map(i=>S.SPOT_CANDS[i]);}}

// ---------- benchmarks ----------
const bh=(A,start=0,cps=C.spot)=>wengine({T:TD,A:[A],cps,tgt:t=>t===start?[1]:null,start});
add('bh_btc',{family:'benchmark',desc:'BTC buy&hold (Binance spot)',asset:'BTC'},bh(BTC));
add('bh_eth',{family:'benchmark',desc:'ETH buy&hold (Binance spot)',asset:'ETH'},bh(ETH));
// EW PIT top10, quarterly rebalance
add('bh_ew_top10',{family:'benchmark',desc:'Equal-weight point-in-time top10 (by 60d Binance quote volume), quarterly rebalance',asset:'PORT'},
 wengine({T:TD,A:spotAll,cps:C.spot,start:uniStart+1,tgt:(t)=>{if(UNI[t-1]===UNI[t-2]&&t>uniStart+1)return null;const u=UNI[t-1];const w=new Array(spotAll.length).fill(0);for(const i of u)w[i]=1/u.size;return w;}}));
const upD=load('upbit_BTC_1d'),upH=load('upbit_BTC_60m');const upHmap=S.hourMap(upH);
{const A=[{o:upD.o,c:upD.c}];add('bh_upbit_btc',{family:'benchmark',desc:'Upbit KRW-BTC buy&hold',asset:'KRW-BTC'},wengine({T:upD.t,A,cps:C.upbit,tgt:t=>t===0?[1]:null}));}
log('bench done');

// ---------- 1. Turtle ----------
const tcfg=[['BTC',[BTC],null,[BTCp]],['ETH',[ETH],null,[ETHp]],['PORT',spotAll,UNI,spotAllP]];
for(const sys of[1,2])for(const[nm,A,uni,AP]of tcfg){
 add(`turtle_s${sys}_${nm}_LO`,{family:'1 Turtle',desc:`Turtle System ${sys} long-only spot ${nm}`,asset:nm,params:{sys,risk:'1%/N',units:4,stop:'2N',costs:'spot 0.1%+0.05%'}},S.turtle({A,sys,ls:false,cost:'spot',uni,start:60,grossCap:1}));
 add(`turtle_s${sys}_${nm}_LS`,{family:'1 Turtle',desc:`Turtle System ${sys} long/short perp-cost ${nm} (gross<=2x)`,asset:nm,params:{sys,risk:'1%/N',units:4,stop:'2N',costs:'perp 0.05%+0.05%+funding'}},S.turtle({A:AP,sys,ls:true,cost:'perp',uni,start:60,grossCap:2}));}
for(const rp of[0.005,0.02])add(`turtle_s2_PORT_LO_risk${rp*100}`,{family:'1 Turtle',grid:true,desc:`S2 PORT LO risk ${rp*100}%`,asset:'PORT'},S.turtle({A:spotAll,sys:2,ls:false,cost:'spot',uni:UNI,start:60,grossCap:1,riskPct:rp}));
add('turtle_s1_BTC_LO_noskip',{family:'1 Turtle',grid:true,desc:'S1 BTC LO without skip filter',asset:'BTC'},S.turtle({A:[BTC],sys:1,ls:false,cost:'spot',start:60,grossCap:1,skip:false}));
add('turtle_s2_BTC_LO_1unit',{family:'1 Turtle',grid:true,desc:'S2 BTC LO no pyramiding',asset:'BTC'},S.turtle({A:[BTC],sys:2,ls:false,cost:'spot',start:60,grossCap:1,maxUnits:1}));
add('turtle_s1_BTC_LO_risk2',{family:'1 Turtle',grid:true,desc:'S1 BTC LO risk 2%',asset:'BTC'},S.turtle({A:[BTC],sys:1,ls:false,cost:'spot',start:60,grossCap:1,riskPct:0.02}));
log('turtle done');

// ---------- 2. TSMOM ----------
for(const lb of[90,'12-1'])for(const tv of[0.2,0.3,0.4]){
 for(const[nm,A,AP]of[['BTC',[BTC],[BTCp]],['ETH',[ETH],[ETHp]]]){
  add(`tsmom_${nm}_LO_${lb}_${tv*100}`,{family:'2 TSMOM',desc:`TSMOM ${lb} tv${tv*100}% long/cash spot ${nm}`,asset:nm,params:{lb,tv,vol:'30d',thr:'20% rel'}},S.tsmom({A,lb,tv,ls:false,cost:'spot',start:lb==='12-1'?366:91}));
  add(`tsmom_${nm}_LS_${lb}_${tv*100}`,{family:'2 TSMOM',desc:`TSMOM ${lb} tv${tv*100}% long/short perp ${nm}`,asset:nm,params:{lb,tv}},S.tsmom({A:AP,lb,tv,ls:true,cost:'perp',start:lb==='12-1'?366:91}));}
 add(`tsmom_PORT_LO_${lb}_${tv*100}`,{family:'2 TSMOM',desc:`TSMOM ${lb} tv${tv*100}% PIT top10 long/cash spot (1/10 each)`,asset:'PORT',params:{lb,tv}},S.tsmom({A:spotAll,lb,tv,ls:false,cost:'spot',uni:UNI,nDen:10,start:Math.max(uniStart+1,lb==='12-1'?366:91)}));
 add(`tsmom_PORT_LS_${lb}_${tv*100}`,{family:'2 TSMOM',desc:`TSMOM ${lb} tv${tv*100}% PIT top10 long/short perp-cost`,asset:'PORT',params:{lb,tv}},S.tsmom({A:spotAllP,lb,tv,ls:true,cost:'perp',uni:UNI,nDen:10,start:Math.max(uniStart+1,lb==='12-1'?366:91)}));}
log('tsmom done');

// ---------- 3. MA filters ----------
for(const[nm,A]of[['BTC',BTC],['ETH',ETH]]){
 for(const p of[100,150,200])add(`sma${p}_${nm}`,{family:'3 MA',desc:`${nm} close>SMA${p} long/cash`,asset:nm,params:{sma:p}},S.runStates(TD,[A],S.maStrat(A,'sma',p),C.spot));
 for(const p of[[20,100],[50,150],[50,200]])add(`cross${p[0]}_${p[1]}_${nm}`,{family:'3 MA',desc:`${nm} SMA${p[0]}>SMA${p[1]} long/cash`,asset:nm,params:{fast:p[0],slow:p[1]}},S.runStates(TD,[A],S.maStrat(A,'cross',p),C.spot));
 for(const p of[6,10,12])add(`faber${p}_${nm}`,{family:'3 MA',desc:`${nm} Faber month-end close>${p}M SMA`,asset:nm,params:{months:p}},S.runStates(TD,[A],S.maStrat(A,'faber',p),C.spot));}
log('ma done');

// ---------- 4. Larry Williams VB (Upbit KRW-BTC) ----------
const lwBench={o:upD.o,c:upD.c};
for(const k of[0.3,0.4,0.5,0.6,0.7,'noise'])for(const ma5 of[false,true]){
 const r=S.lwvb({D:upD,Hmap:upHmap,k,ma5});add(`lwvb_k${k}${ma5?'_ma5':''}`,{family:'4 LW VB',desc:`Upbit KRW-BTC VB k=${k}${ma5?' +MA5 filter':''} honest 1h fills, exit next 09:00 open`,asset:'KRW-BTC',params:{k,ma5,fee:'0.05%',slip:'0.05%'},missingDays:r.missing},r);}
for(const ma5 of[false,true]){
 add(`lwvb_k0.5${ma5?'_ma5':''}_NAIVE_nocost`,{family:'4 LW VB',grid:true,desc:'NAIVE daily-candle: fill at target if daily high>=target, exit at close, no costs',asset:'KRW-BTC'},S.lwvb({D:upD,Hmap:upHmap,k:0.5,ma5,mode:'naive',fee:0,slip:0}));
 add(`lwvb_k0.5${ma5?'_ma5':''}_NAIVE_cost`,{family:'4 LW VB',grid:true,desc:'NAIVE daily-candle with costs',asset:'KRW-BTC'},S.lwvb({D:upD,Hmap:upHmap,k:0.5,ma5,mode:'naive'}));
 add(`lwvb_k0.5${ma5?'_ma5':''}_HONEST_nocost`,{family:'4 LW VB',grid:true,desc:'Honest intraday fills, no costs',asset:'KRW-BTC'},S.lwvb({D:upD,Hmap:upHmap,k:0.5,ma5,fee:0,slip:0}));
 add(`lwvb_k0.5${ma5?'_ma5':''}_HONEST_slip0.2`,{family:'4 LW VB',grid:true,desc:'Honest, slippage 0.2%/side',asset:'KRW-BTC'},S.lwvb({D:upD,Hmap:upHmap,k:0.5,ma5,slip:0.002}));}
log('lwvb done');

// ---------- 5. Dual Thrust (BTC/ETH 1h) ----------
const DT={};for(const sym of['BTC','ETH']){const D=load('spot_'+sym+'_1d'),H=load('spot_'+sym+'_1h');const fm=new Map();const fr=JSON.parse(fs.readFileSync(__dirname+'/data/fund_'+sym+'.json'));for(const[t,r]of fr)fm.set(Math.round(t/HOUR)*HOUR,r);DT[sym]={D,Hmap:S.hourMap(H),fm,H};}
for(const N of[1,4,7])for(const k of[0.3,0.5,0.7])add(`dthrust_BTC_LS_N${N}_k${k}`,{family:'5 Dual Thrust',desc:`Dual Thrust BTC L/S N=${N} k1=k2=${k}, perp cost, flat at 00:00 UTC`,asset:'BTC',params:{N,k1:k,k2:k}},S.dualThrust({D:DT.BTC.D,Hmap:DT.BTC.Hmap,N,k1:k,k2:k,ls:true,cost:'perp',fundMap:DT.BTC.fm}));
add('dthrust_BTC_LO_N4_k0.5',{family:'5 Dual Thrust',desc:'Dual Thrust BTC long-only spot N=4 k=0.5',asset:'BTC',params:{N:4,k:0.5}},S.dualThrust({D:DT.BTC.D,Hmap:DT.BTC.Hmap,N:4,ls:false,cost:'spot'}));
add('dthrust_ETH_LS_N4_k0.5',{family:'5 Dual Thrust',desc:'Dual Thrust ETH L/S N=4 k=0.5 perp cost',asset:'ETH',params:{N:4,k:0.5}},S.dualThrust({D:DT.ETH.D,Hmap:DT.ETH.Hmap,N:4,ls:true,cost:'perp',fundMap:DT.ETH.fm}));
add('dthrust_BTC_LS_N4_k0.5_nocost',{family:'5 Dual Thrust',grid:true,desc:'Dual Thrust BTC L/S N4 k0.5 gross (no cost)',asset:'BTC'},(()=>{const save={...S.FEE};return S.dualThrust({D:DT.BTC.D,Hmap:DT.BTC.Hmap,N:4,ls:true,cost:'zero'});})());
log('dthrust done');

// ---------- 6/7. RSI2 and Bollinger ----------
const H4={},H4p={};for(const sym of['BTC','ETH']){const b=load('spot_'+sym+'_4h');H4[sym]=b;H4p[sym]={...b,f:fundBars(b.t,4*HOUR,sym)};}
const D1={BTC:load('spot_BTC_1d'),ETH:load('spot_ETH_1d')};
for(const sym of['BTC','ETH'])for(const tf of['1d','4h'])for(const e of[5,10,15]){const A=tf==='1d'?D1[sym]:H4[sym];
 add(`rsi2_${sym}_${tf}_e${e}`,{family:'6 RSI2',desc:`Connors RSI(2)<${e} & close>SMA200 (${tf}); exit RSI2>70 or close>SMA5`,asset:sym,params:{tf,entry:e,exit:'70/SMA5',trend:200}},S.runStates(A.t,[A],S.rsi2Pos(A,e),C.spot));}
for(const sym of['BTC','ETH']){const A=H4[sym];
 for(const mode of['rev','bo']){add(`bb_${mode}_${sym}_4h_LO`,{family:'7 Bollinger',desc:`BB(20,2) ${mode==='rev'?'reversion':'breakout'} long-only spot 4h ${sym}`,asset:sym,params:{n:20,k:2}},S.runStates(A.t,[A],S.bbPos(A,mode,false),C.spot));
  add(`bb_${mode}_${sym}_4h_LS`,{family:'7 Bollinger',desc:`BB(20,2) ${mode==='rev'?'reversion':'breakout'} long/short perp-cost 4h ${sym}`,asset:sym,params:{n:20,k:2}},S.runStates(A.t,[H4p[sym]],S.bbPos(A,mode,true),C.perp));}}
for(const k of[1.5,2.5])for(const mode of['rev','bo'])add(`bb_${mode}_BTC_4h_LO_k${k}`,{family:'7 Bollinger',grid:true,desc:`BB(20,${k}) ${mode} LO BTC 4h`,asset:'BTC'},S.runStates(H4.BTC.t,[H4.BTC],S.bbPos(H4.BTC,mode,false,20,k),C.spot));
log('rsi/bb done');

// ---------- 8. Dual momentum ----------
for(const lb of[30,90,180,365])add(`dualmom_${lb}`,{family:'8 Dual Momentum',desc:`BTC/ETH/cash monthly, lookback ${lb}d (abs>0 & relative)`,asset:'BTC/ETH',params:{lb}},S.runStates(TD,[BTC,ETH],S.dualMom(BTC,ETH,lb),C.spot));
log('dualmom done');

// ---------- 9. XS momentum (perps) ----------
for(const lb of[7,28,84])add(`xsmom_${lb}`,{family:'9 XS Momentum',desc:`Weekly long top3/short bottom3 by ${lb}d return, Binance perps (${S.PERP_CANDS.length} incl. delisted LUNA/EOS/MATIC/FTT), gross 1x`,asset:'PERPS',params:{lb,k:3,minN:8}},S.xsmom({P:perps,lb}));
add('xsmom_28_k5',{family:'9 XS Momentum',grid:true,desc:'top5/bottom5, 28d',asset:'PERPS'},S.xsmom({P:perps,lb:28,k:5,minN:12}));
add('xsmom_28_reversal',{family:'9 XS Momentum',grid:true,desc:'reverse sign (short winners/long losers) 28d',asset:'PERPS'},S.xsmom({P:perps,lb:28,rev:true}));
log('xsmom done');

// ---------- 10. Seasonality (BTC 1h) ----------
{const H=DT.BTC.H;const T=H.t;const A=[{o:H.o,c:H.c}];
 const hrsOf=t=>new Date(t).getUTCHours(),dow=t=>new Date(t).getUTCDay();
 const mk=(f)=>T.map(t=>f(t)?1:0);
 // pos[s] is the state for bar s+1 -> shift: state for bar t uses its own (known) clock time
 const shift=(g)=>T.map((t,i)=>i+1<T.length?(g(T[i+1])?1:0):null);
 add('season_weekend',{family:'10 Seasonality',desc:'BTC held only Sat-Sun UTC',asset:'BTC',params:{}},S.runStates(T,A,shift(t=>dow(t)===0||dow(t)===6),C.spot));
 add('season_weekday',{family:'10 Seasonality',desc:'BTC held only Mon-Fri UTC',asset:'BTC',params:{}},S.runStates(T,A,shift(t=>dow(t)>=1&&dow(t)<=5),C.spot));
 // in-sample hour-of-day means (open->open hourly) for 2017-08..2021-12
 const mean=new Array(24).fill(0),cnt=new Array(24).fill(0);for(let i=0;i<T.length-1;i++){if(dk(T[i])>IS[1])break;if(T[i+1]-T[i]!==HOUR)continue;const r=H.o[i+1]/H.o[i]-1;mean[hrsOf(T[i])]+=r;cnt[hrsOf(T[i])]++;}
 for(let h=0;h<24;h++)mean[h]/=cnt[h];R._hourMeansIS=mean;
 for(const len of[4,8,12]){let best=-1,bs=-Infinity;for(let s=0;s<24;s++){let sum=0;for(let j=0;j<len;j++)sum+=mean[(s+j)%24];if(sum>bs){bs=sum;best=s;}}
  const inB=t=>{const h=hrsOf(t);return((h-best+24)%24)<len;};
  add(`season_block${len}h`,{family:'10 Seasonality',desc:`BTC held only UTC ${best}:00-${(best+len)%24}:00 (block chosen on IS hour means)`,asset:'BTC',params:{start:best,len}},S.runStates(T,A,shift(inB),C.spot));
  add(`season_block${len}h_gross`,{family:'10 Seasonality',grid:true,desc:`same block, no costs`,asset:'BTC',params:{start:best,len}},S.runStates(T,A,shift(inB),0));}
 add('season_weekend_gross',{family:'10 Seasonality',grid:true,desc:'weekend only, no cost',asset:'BTC'},S.runStates(T,A,shift(t=>dow(t)===0||dow(t)===6),0));}
log('season done');

module.exports={R,uniLog};
if(require.main===module){
 // summary
 const out={};for(const[k,v]of Object.entries(R)){if(k.startsWith('_'))continue;const rows=v.res.rows;out[k]={family:v.family,desc:v.desc,grid:!!v.grid,
  full:stats(rows,...FULL),is:stats(rows,...IS),oos:stats(rows,...OOS),tf:tstats(v.res.trades||[],...FULL),ti:tstats(v.res.trades||[],...IS),to:tstats(v.res.trades||[],...OOS)};}
 fs.writeFileSync('raw_summary.json',JSON.stringify(out));
 const f=x=>x==null?'   -  ':(x*100).toFixed(0).padStart(6);const g=x=>x==null?'  -  ':x.toFixed(2).padStart(5);
 for(const[k,v]of Object.entries(out)){const i=v.is||{},o=v.oos||{};console.log(k.padEnd(34),'IS',f(i.cagr),g(i.sharpe),f(i.mdd),' OOS',f(o.cagr),g(o.sharpe),f(o.mdd),f(o.exposure),' tr',String(v.to.trades).padStart(5),g(v.to.winRate),g(v.to.profitFactor),' cost',f(o.costDragPerYr));}
}
