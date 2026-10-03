const fs=require('fs');const U=['upbit','binance','binanceall'];
const label={upbit:'A 업비트 KRW (현존 종목만, 생존편향)',binance:'B1 바이낸스 USDT — 현재 거래대금 상위60 + 상폐 일부 (선택편향 큼)',binanceall:'B2 바이낸스 USDT 전 종목(거래중+상폐 BREAK 670개)'};
const research={videos:[
 {no:1135,title:'비트코인 보다 더 오를 수 있는 알트코인, 뭘 사야 할까?',date:'2023-12-20',url:'https://www.youtube.com/watch?v=4aqECQh6lF8'},
 {no:1159,title:'매번 잘 나가는 알트코인을 맞춰 살 수 있다면',date:'2024-01-22',url:'https://www.youtube.com/watch?v=Cw2I6NDIEns'},
 {no:1245,title:'앞으로 상승 확률이 높은 신규 코인들을 소개합니다.',date:'2024-05-16',url:'https://www.youtube.com/watch?v=kHmMcAnPiCY'}],
 rules:'BTC>120일 이평일 때만 투자; 시총 상위 15~20개(스테이블 제외) 중 최근 7일 상승률 상위 3개 1/3씩; 1주 보유 후 교체; 전부 하락한 주는 쉬어감',
 claims:['2015년부터 손 백테스트, 수익률 기가 막힘, MDD 어마어마(1135)','2017-01 시작 시 1년간 100배 이상, 2016 반감기 구간 15~16배(1159)','5년 동안 100배 이상(1245)','실전 5만 달러로 시작해 한 달 안 돼 1만 달러 이상 손실(1159)','개선 방향: 반감기 6개월 후부터, 10% 손절, 2~3주 보유(1159)'],
 note:'CAGR/MDD 등 정확한 수치는 자막에서 확인 못함'};
const out={generated:new Date().toISOString(),research,universes:{}};
const rows=[];
for(const u of U){const r=JSON.parse(fs.readFileSync(`results_${u}.json`,'utf8'));const d=JSON.parse(fs.readFileSync(`diag_${u}.json`,'utf8'));out.universes[u]={label:label[u],dataEnd:r.dataEnd,nSymbols:r.nSymbols,diagnostic:d,runs:r.runs};
 for(const x of r.runs.filter(x=>x.stagger))rows.push([label[u].split(' ')[0],x.name,...['2018','2019','2020','2021','2022','2023','2024','2025','2026'].map(y=>x.yearly[y]??''),x.full.cagr,x.full.sharpe,x.full.mdd,x.is?.cagr,x.is?.sharpe,x.oos.cagr,x.oos.sharpe,x.oos.mdd]);}
out.largecapProxy=JSON.parse(fs.readFileSync('results_largecap_proxy.json','utf8'));out.methodNotes=['일봉 00:00 UTC(=09:00 KST) 기준; 신호=직전일 종가, 체결=당일 시가; 1일 지연 변형 포함','비용: 업비트 편도 0.25%(수수료0.05+슬리피지0.2) 기본, 0.15/0.35 민감도; 바이낸스 편도 0.1%, 0.2% 민감도; BTC 편도 0.1%','STAG=월~일 7개 트랜치 각 1/7(리밸런싱 요일 운 제거)','IS=~2021-12-31, OOS=2022-01-01~2026-10-03','현금 이자 0','시총 대신 거래대금 순위 사용(과거 시총 데이터 없음)'];fs.writeFileSync('results.json',JSON.stringify(out,null,1));
fs.writeFileSync('yearly_staggered.csv','﻿'+['universe,strategy,2018,2019,2020,2021,2022,2023,2024,2025,2026YTD,CAGR,Sharpe,MDD,IS_CAGR,IS_Sharpe,OOS_CAGR,OOS_Sharpe,OOS_MDD'].concat(rows.map(r=>r.map(v=>typeof v==='string'?`"${v}"`:v).join(','))).join('\n'));
// 보고용 요약 출력
const pick=['BTC + SMA50','EW 유니버스 + SMA50','MOM top1 L7 H7 SMA50','MOM top3 L7 H7 SMA50','MOM top5 L7 H7 SMA50','KANG 원형근사(top20유동성,SMA120,양수만,top3)','REV bottom3 L7 H7 SMA50','MOM top3 L7 H7 필터없음'];
const p=v=>v==null?'-':(v*100).toFixed(0);
for(const u of U){console.log('##',u);const R=out.universes[u].runs;
 const bh=R.find(x=>x.name==='BENCH BTC 보유');console.log('BTC보유',p(bh.full.cagr),bh.full.sharpe.toFixed(2),p(bh.full.mdd),'IS',p(bh.is.cagr),bh.is.sharpe.toFixed(2),'OOS',p(bh.oos.cagr),bh.oos.sharpe.toFixed(2),p(bh.oos.mdd),'Y',Object.values(bh.yearly).map(p).join('/'));
 for(const n of pick){const x=R.find(r=>r.stagger&&r.name===n);console.log(n,'|',p(x.full.cagr),x.full.vol.toFixed(2),x.full.sharpe.toFixed(2),p(x.full.mdd),x.full.calmar?.toFixed(2),'| IS',p(x.is.cagr),x.is.sharpe.toFixed(2),'| OOS',p(x.oos.cagr),x.oos.sharpe.toFixed(2),p(x.oos.mdd),'| Y',Object.values(x.yearly).map(p).join('/'),'| wd',p(x.weekdayRange.cagrMin),p(x.weekdayRange.cagrMax));}
 for(const n of ['MOM top3 L7 H7 SMA50 월','KANG 원형근사 top20유동성 SMA120 양수만 top3','MOM top1 L7 H7 SMA50 월']){const x=R.find(r=>r.name===n);console.log(' MON',n,'win',x.full.winRate,'inv',x.full.investedShare,'turn',x.annTurnover,'gross',p(x.grossCagr),'drag',p(x.costDragCagr),'top5share',x.concentration.top5LogShare,'mult',x.concentration.multipleTotal,'w/o5',x.concentration.multipleWithoutTop5,'oosSh',x.oos.sharpe);}
}
