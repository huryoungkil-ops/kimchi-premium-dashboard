// 주간 모멘텀(직전 L일 상승률 상위 N) 백테스트 엔진 — 일봉, 00:00 UTC 기준
const fs=require('fs');
const DAY=86400000;
function loadUniverse(name){
  const raw=JSON.parse(fs.readFileSync(`data/${name}_daily.json`,'utf8'));
  const series={};
  for(const [sym,rows] of Object.entries(raw)){
    // 데이터 공백(>3일)이 있으면 별개 상장으로 분리 (예: LUNA 구/신)
    let part=0,cur=[];const push=()=>{if(cur.length)series[part?`${sym}#${part+1}`:sym]=cur;};
    for(let i=0;i<rows.length;i++){
      // 공백 >3일 또는 시가/전일종가 갭 >3배(액면 재조정·토큰 스왑)면 별개 시계열로 분리
      if(i>0&&((Date.parse(rows[i][0])-Date.parse(rows[i-1][0]))>3*DAY||rows[i][1]/rows[i-1][4]>3||rows[i][1]/rows[i-1][4]<1/3)){push();part++;cur=[];}
      cur.push(rows[i]);}
    push();
  }
  let minD=Infinity,maxD=-Infinity;
  for(const r of Object.values(series)){minD=Math.min(minD,Date.parse(r[0][0]));maxD=Math.max(maxD,Date.parse(r[r.length-1][0]));}
  const n=Math.round((maxD-minD)/DAY)+1;const dates=[];for(let i=0;i<n;i++)dates.push(new Date(minD+i*DAY).toISOString().slice(0,10));
  const coins={};
  for(const [sym,rows] of Object.entries(series)){
    const o=new Float64Array(n).fill(NaN),c=new Float64Array(n).fill(NaN),v=new Float64Array(n).fill(NaN);
    let first=-1,last=-1;
    for(const r of rows){const i=Math.round((Date.parse(r[0])-minD)/DAY);if(!(r[1]>0&&r[4]>0))continue;o[i]=r[1];c[i]=r[4];v[i]=r[5];if(first<0)first=i;last=i;}
    if(first>=0)coins[sym]={o,c,v,first,last};
  }
  return {dates,coins,n};
}
function lastValid(arr,i,first){for(let k=i;k>=first;k--)if(!isNaN(arr[k]))return arr[k];return NaN;}
function sma(c,i,k){let s=0;for(let j=i-k+1;j<=i;j++){if(isNaN(c[j]))return NaN;s+=c[j];}return s/k;}
function avgTurn(v,i,k){let s=0,m=0;for(let j=i-k+1;j<=i;j++){if(!isNaN(v[j])){s+=v[j];m++;}}return m?s/k:0;}
/* p: {btc, excl:Set, N, L, H, wd(0=Sun..6, UTC date of execution), lag, minTurn, minAge, mkt(0|sma len), posOnly, side:'top'|'bottom'|'all',
       cost (per side, alts), costBtc, topK (restrict to top K by 30d turnover), only:[syms], start, end} */
function run(U,p){
  const {dates,coins,n}=U;const syms=Object.keys(coins).filter(s=>!p.excl.has(s.split('#')[0]));
  const btc=coins[p.btc];
  let s=dates.indexOf(p.start);while(new Date(dates[s]+'T00:00:00Z').getUTCDay()!==p.wd)s++;
  const end=p.end?dates.indexOf(p.end):n-1;
  let V=1,units={},entryIdx={};const eq=[];const periods=[];let totTurn=0,totCost=0,nReb=0;
  const markVal=(i,useOpen)=>{let val=0;for(const [sym,u] of Object.entries(units)){const C=coins[sym];let px=useOpen?C.o[i]:C.c[i];if(isNaN(px))px=lastValid(C.c,i-(useOpen?1:0),C.first);val+=u*px;}return val;};
  let cash=1;
  for(let e=s;e+1<=end;e+=p.H){
    const r=e-p.lag; const sig=r-1; // 신호: r-1일 종가까지, 체결: e일 시가
    // 현재 가치
    const holdVal=markVal(e,true);V=cash+holdVal;
    const wOld={};for(const [sym,u] of Object.entries(units)){const C=coins[sym];let px=C.o[e];if(isNaN(px))px=lastValid(C.c,e-1,C.first);wOld[sym]=u*px/V;}
    // 시장 필터
    let on=true;if(p.mkt){const m=sma(btc.c,sig,p.mkt);on=!isNaN(m)&&btc.c[sig]>m;}
    let sel=[];
    if(on){
      let cand=[];
      for(const sym of (p.only||syms)){const C=coins[sym];if(!C)continue;
        if(sig-p.L<C.first||sig>C.last)continue;if(sig-C.first<p.minAge)continue;
        if(isNaN(C.o[e]))continue;const c0=C.c[sig-p.L],c1=C.c[sig];if(isNaN(c0)||isNaN(c1))continue;
        if(avgTurn(C.v,sig,7)<p.minTurn)continue;
        cand.push({sym,score:c1/c0-1,t30:avgTurn(C.v,sig,30)});}
      if(p.topK){cand.sort((a,b)=>b.t30-a.t30);cand=cand.slice(0,p.topK);}
      if(p.side==='all')sel=cand;
      else{cand.sort((a,b)=>p.side==='top'?b.score-a.score:a.score-b.score);sel=cand.slice(0,p.N);if(p.posOnly)sel=sel.filter(x=>p.side==='top'?x.score>0:x.score<0);}
    }
    const wNew={};const N=p.side==='all'?sel.length:p.N;for(const x of sel)wNew[x.sym]=1/N;
    let turn=0,cost=0;const all=new Set([...Object.keys(wOld),...Object.keys(wNew)]);
    for(const sym of all){const d=Math.abs((wNew[sym]||0)-(wOld[sym]||0));turn+=d;cost+=d*(sym===p.btc?p.costBtc:p.cost);}
    totTurn+=turn;totCost+=cost;nReb++;
    V*=(1-cost);units={};let invested=0;for(const [sym,w] of Object.entries(wNew)){units[sym]=w*V/coins[sym].o[e];invested+=w;}cash=V*(1-invested);
    const V0=V;
    const stop=Math.min(e+p.H,end+1);
    for(let d=e;d<stop;d++){const val=cash+markVal(d,false);eq.push([dates[d],val]);}
    const Vend=eq[eq.length-1][1];
    periods.push({date:dates[e],ret:Vend/V0-1,inv:Object.keys(wNew).length,hold:sel.map(x=>x.sym+':'+(x.score*100).toFixed(0)+'%').join(' '),cost});
    // 다음 루프에서 markVal(e+H, open)로 재평가
    V=Vend;
  }
  return {eq,periods,totTurn,totCost,nReb,H:p.H};
}
function metrics(eq,periods,from,to){
  let E=eq.filter(x=>(!from||x[0]>=from)&&(!to||x[0]<=to));if(E.length<10)return null;
  // 기준값: 구간 시작 전날 값
  const i0=eq.indexOf(E[0]);const base=i0>0?eq[i0-1][1]:1;
  const vals=[base,...E.map(x=>x[1])];const rets=[];for(let i=1;i<vals.length;i++)rets.push(vals[i]/vals[i-1]-1);
  const yrs=E.length/365;const tot=vals[vals.length-1]/base;const cagr=Math.pow(tot,1/yrs)-1;
  const mu=rets.reduce((a,b)=>a+b,0)/rets.length;const sd=Math.sqrt(rets.reduce((a,b)=>a+(b-mu)**2,0)/(rets.length-1));
  let pk=-Infinity,mdd=0;for(const v of vals){pk=Math.max(pk,v);mdd=Math.min(mdd,v/pk-1);}
  let P=periods?periods.filter(x=>(!from||x.date>=from)&&(!to||x.date<=to)):[];
  const inv=P.filter(x=>x.inv>0);
  return {start:E[0][0],end:E[E.length-1][0],totalRet:tot-1,cagr,vol:sd*Math.sqrt(365),sharpe:sd>0?mu/sd*Math.sqrt(365):0,mdd,calmar:mdd<0?cagr/-mdd:null,
    winRate:inv.length?inv.filter(x=>x.ret>0).length/inv.length:null,investedShare:P.length?inv.length/P.length:null,nPeriods:P.length};
}
function yearly(eq){const end={};for(const [d,v] of eq)end[d.slice(0,4)]=v;const out={};let prev=1;for(const y of Object.keys(end).sort()){out[y]=end[y]/prev-1;prev=end[y];}return out;}
function concentration(periods,k=5){const lr=periods.map(x=>Math.log(1+x.ret));const tot=lr.reduce((a,b)=>a+b,0);
  const idx=[...periods.keys()].sort((a,b)=>periods[b].ret-periods[a].ret);const top=idx.slice(0,k);
  const topSum=top.reduce((a,i)=>a+lr[i],0);
  return {totalLogRet:tot,topKLogShare:tot!==0?topSum/tot:null,multipleWithoutTopK:Math.exp(tot-topSum),multipleTotal:Math.exp(tot),
    topK:top.map(i=>({date:periods[i].date,ret:+periods[i].ret.toFixed(4),hold:periods[i].hold}))};}
module.exports={loadUniverse,run,metrics,yearly,concentration};
