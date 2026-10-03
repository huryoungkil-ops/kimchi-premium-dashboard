const fs=require('fs');const NEW=require('./results.json');const OLD=require('../commod/results.json');
const PHYS='물리적 차익',FIN='금융 차익',STAT='통계/경제적 상관',WEAK='약한 물리적 연결';
const priorMeta={'Brent-WTI (BZ=F/CL=F)':['에너지',PHYS],'Brent-WTI spot (FRED, roll-free check)':['에너지',PHYS,'check'],'Gold/Silver (GC/SI)':['금속',STAT],
 'Corn/Wheat (ZC/ZW)':['곡물',WEAK],'KC HRW/Chicago SRW wheat (KE/ZW)':['곡물',WEAK],'Soy crush (ZS vs 0.022ZM+0.11ZL)':['곡물',PHYS],
 '3-2-1 crack (CL vs 2RB+1HO)':['에너지',PHYS],'3-2-1 crack spot (FRED WTI vs NYH gasoline/HO, roll-free check)':['에너지',PHYS,'check'],
 'Shanghai gold proxy (518880.SS vs GC*CNY, same date)':['금속',FIN],'Shanghai gold proxy (GC lagged 1d, async check)':['금속',FIN,'check']};
const newCheck=n=>/async check|stale-stamp/.test(n);const untradable=n=>/VIX|FRED 10y|spot \(FRED|crack spot/.test(n);
const rows=[];
for(const [n,r] of Object.entries(OLD.spreads)){const m=priorMeta[n];const g=r.grid.N60_H20,g2=r.grid.N20_H10;
 rows.push({name:n,src:'prior',cls:m[0],bind:m[1],check:!!m[2],r,g,g2,stress:g.cost10bpPerLeg});}
for(const [n,r] of Object.entries(NEW.spreads)){const g=r.grid.N60_H20,g2=r.grid.N20_H10;
 rows.push({name:n,src:'new',cls:r.cls,bind:r.bind,check:newCheck(n),r,g,g2,stress:g.cost12bp});}
for(const x of rows)x.untr=untradable(x.name);
rows.sort((a,b)=>(b.g.full.sharpe??-9)-(a.g.full.sharpe??-9));
const fmt=v=>v==null?'–':v;
console.log('| # | 스프레드 | 자산군 | 묶는 힘 | 기간 | 거래 | 승률% | 건당% | 연% | Sharpe | MDD% | 최악% | 상위5%비중 | 1일지연 연%/SR | +12bp 연%/SR | N20H10 SR | WF OOS 연%/SR |');
console.log('|'+'---|'.repeat(17));
rows.forEach((x,i)=>{const f=x.g.full,wf=x.r.walkForward;
 console.log(`| ${i+1} | ${x.name}${x.check?' (점검용)':''}${x.untr?' †':''} | ${x.cls} | ${x.bind} | ${x.r.start.slice(0,7)}~${x.r.end.slice(0,7)} | ${f.trades} | ${fmt(f.winRate)} | ${fmt(f.avgNetPct)} | ${fmt(f.annRetPct)} | ${fmt(f.sharpe)} | ${fmt(f.maxDDPct)} | ${fmt(f.worstTradePct)} | ${fmt(f.top5pctShareOfPnL)} | ${x.g.delay2.annRetPct}/${x.g.delay2.sharpe} | ${x.stress.annRetPct}/${x.stress.sharpe} | ${fmt(x.g2.full.sharpe)} | ${wf.oosAnnRetPct}/${wf.oosSharpe} (${wf.chosen}) |`);});
// class & binding summaries (main tradable versions only)
const main=rows.filter(x=>!x.check);const mainT=main.filter(x=>!x.untr);
const avg=a=>a.length?+(a.reduce((s,v)=>s+v,0)/a.length).toFixed(2):null;
function grp(list,key){const o={};for(const x of list)(o[x[key]]=o[x[key]]||[]).push(x);
 for(const [k,L] of Object.entries(o)){const s=L.map(x=>x.g.full.sharpe),s2=L.map(x=>x.g2.full.sharpe),oo=L.map(x=>x.r.walkForward.oosSharpe),d=L.map(x=>x.g.delay2.sharpe),c=L.map(x=>x.stress.sharpe);
  const best=L.reduce((a,b)=>a.g.full.sharpe>b.g.full.sharpe?a:b),worst=L.reduce((a,b)=>a.g.full.sharpe<b.g.full.sharpe?a:b);
  console.log(`| ${k} | ${L.length} | ${avg(s)} | ${avg(s2)} | ${avg(oo)} | ${avg(d)} | ${avg(c)} | ${L.filter(x=>x.g.full.sharpe>=0.3).length}/${L.length} | ${best.name} ${best.g.full.sharpe} | ${worst.name} ${worst.g.full.sharpe} |`);}}
console.log('\n## by class (tradable main)');console.log('| 자산군 | n | 평균SR N60H20 | 평균SR N20H10 | 평균 WF-OOS SR | 평균 지연SR | 평균 +12bp SR | SR≥0.3 | 최고 | 최저 |');grp(mainT,'cls');
console.log('\n## by binding (tradable main)');console.log('| 묶는 힘 | n | 평균SR N60H20 | 평균SR N20H10 | 평균 WF-OOS SR | 평균 지연SR | 평균 +12bp SR | SR≥0.3 | 최고 | 최저 |');grp(mainT,'bind');
console.log('\n## by binding (incl. untradable index/synthetic)');grp(main,'bind');
// blocks top 8 & yearly top 6
const pick8=['3-2-1 crack (CL vs 2RB+1HO)','CNY onshore vs CNH futures (CNH lag 1d, aligned)','VIX/VIX3M term structure (index proxy)','TTF$/Henry Hub (TTF×EURUSD/3.412 vs NG)','Brent-WTI (BZ=F/CL=F)','Cotton/Soy (CT/ZS, control)','Corn/Wheat (ZC/ZW)','KC HRW/Chicago SRW wheat (KE/ZW)','Soy crush (ZS vs 0.022ZM+0.11ZL)'];
const BK=['2000-2004','2005-2009','2010-2014','2015-2019','2020-2026'];
console.log('\n## blocks (N60H20 연%/SR/거래)');console.log('| 스프레드 | '+BK.join(' | ')+' |');console.log('|'+'---|'.repeat(6));
for(const n of pick8){const x=rows.find(r=>r.name===n);console.log(`| ${n} | `+BK.map(b=>x.g.blocks[b]?`${x.g.blocks[b].annRetPct}/${x.g.blocks[b].sharpe}/${x.g.blocks[b].trades}`:'–').join(' | ')+' |');}
const pick6=pick8.slice(0,6);const yrs=[...new Set(pick6.flatMap(n=>Object.keys(rows.find(r=>r.name===n).g.yearly)))].sort().filter(y=>y>='2000');
const csv=['year,'+pick6.map(n=>'"'+n+'"').join(',')];for(const y of yrs)csv.push(y+','+pick6.map(n=>rows.find(r=>r.name===n).g.yearly[y]??'').join(','));
fs.writeFileSync(__dirname+'/yearly_top6_N60_H20.csv',csv.join('\n'));
// all-spreads yearly CSV
const allN=rows.filter(x=>!x.check).map(x=>x.name);const yrsA=[...new Set(allN.flatMap(n=>Object.keys(rows.find(r=>r.name===n).g.yearly)))].sort();
fs.writeFileSync(__dirname+'/yearly_all_N60_H20.csv',['year,'+allN.map(n=>'"'+n+'"').join(',')].concat(yrsA.map(y=>y+','+allN.map(n=>rows.find(r=>r.name===n).g.yearly[y]??'').join(','))).join('\n'));
console.log('\n## yearly top6');console.log(csv.join('\n'));
NEW.combinedTable=rows.map(x=>({name:x.name,source:x.src,cls:x.cls,binding:x.bind,checkVariant:x.check,untradableIndexOrSynthetic:x.untr,start:x.r.start,end:x.r.end,
 base_N60_H20:x.g.full,alt_N20_H10:x.g2.full,delay1d:x.g.delay2,plus12bp:x.stress,walkForward:x.r.walkForward,blocks:x.g.blocks}));
fs.writeFileSync(__dirname+'/results.json',JSON.stringify(NEW,null,1));
