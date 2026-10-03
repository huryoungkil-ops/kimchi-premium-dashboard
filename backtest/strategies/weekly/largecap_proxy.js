// 대형주 근사 강화: 상위20을 '최근 180일 평균 거래대금'으로, 상장 180일 이상만 → 시총 상위20에 더 가깝게 (B2/A)
const fs=require('fs');const {loadUniverse,run,metrics,yearly}=require('./lib');
const res={};
for(const u of ['binanceall','upbit']){const U=loadUniverse(u);const btc=u==='upbit'?'KRW-BTC':'BTCUSDT';
 const excl=new Set();for(const [s,C] of Object.entries(U.coins)){const b=s.split('#')[0];if(/USD|DAI|XAUT|PAXG|^EUR|AEUR/.test(b.replace(/USDT$/,'').replace(/^KRW-/,''))||(/BUSDT$/.test(b)&&U.dates[C.first]>='2026-06-01'))excl.add(b);}
 // lib의 topK는 30일 거래대금 기준 → 180일 기준으로 바꾸기 위해 v를 180일 이동평균으로 치환한 복제본 사용
 const U2={...U,coins:{}};for(const [s,C] of Object.entries(U.coins)){const v=new Float64Array(C.v.length).fill(NaN);let sum=0,q=[];for(let i=0;i<C.v.length;i++){const x=isNaN(C.v[i])?0:C.v[i];q.push(x);sum+=x;if(q.length>180)sum-=q.shift();if(i>=C.first)v[i]=sum/180;}U2.coins[s]={...C,v};}
 const out=[];
 for(let wd=0;wd<7;wd++){const R=run(U2,{btc,excl,N:3,L:7,H:7,wd,lag:0,minTurn:u==='upbit'?1e9:5e6,minAge:180,mkt:120,posOnly:true,side:'top',topK:20,cost:u==='upbit'?0.0025:0.001,costBtc:0.001,start:'2018-03-01'});out.push(R);}
 // 7트랜치 평균
 const maps=out.map(R=>new Map(R.eq));const st=out.map(R=>R.eq[0][0]).sort()[6];const dates=out[0].eq.map(x=>x[0]).filter(d=>d>=st&&maps.every(m=>m.has(d)));const b=maps.map(m=>m.get(dates[0]));
 const eq=dates.map(d=>[d,maps.reduce((a,m,i)=>a+m.get(d)/b[i],0)/7]);
 const f=metrics(eq),o=metrics(eq,null,'2022-01-01'),i=metrics(eq,null,null,'2021-12-31');const y=yearly(eq.map(([d,v])=>[d,v/eq[0][1]]));
 res[u]={rule:'top20 by 180d avg turnover, age>=180d, BTC>SMA120, positive-only, top3, 1w, 7-tranche',full:f,is:i,oos:o,yearly:y,weekdayCagr:out.map(R=>metrics(R.eq,R.periods).cagr)};
 const p=v=>(v*100).toFixed(0);console.log(u,'CAGR',p(f.cagr),'Sh',f.sharpe.toFixed(2),'MDD',p(f.mdd),'| IS',p(i.cagr),i.sharpe.toFixed(2),'| OOS',p(o.cagr),o.sharpe.toFixed(2),p(o.mdd),'| Y',Object.values(y).map(p).join('/'),'| wd',res[u].weekdayCagr.map(p).join(','));}
fs.writeFileSync('results_largecap_proxy.json',JSON.stringify(res,null,1));
