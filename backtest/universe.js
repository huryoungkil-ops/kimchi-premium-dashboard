// 스프레드가 넓은 종목까지 확대하면 될까?
// 진입 관문 = 기대수익 >= 본전문턱 x 5, 본전문턱 = 왕복수수료 0.04% + 스프레드
// 실제로 발생하는 괴리(평균-현재김프) 분포와 비교한다.
const fs=require('fs'), path=require('path');
const lib=require('./lib5m');
const Y=6;
const ready=lib.COINS.filter(c=>
  fs.existsSync(path.join(lib.CACHE_DIR,`upbit_${c[0]}_${Y}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR,`okx_${c[0]}_${Y}y.json`)));
lib.COINS.length=0; for(const c of ready) lib.COINS.push(c);

(async()=>{
 const ds=await lib.buildDataset({yearsBack:Y,log:()=>{}});
 // 모든 시점의 괴리폭(평균-현재김프) 분포 — 진입 신호가 뜬 순간만
 const gaps=[];
 for(const c of ds.coins){
   for(let i=0;i<c.premium.length;i++){
     const sd=c.sd[i]; if(!(sd>0)||sd>2.5) continue;
     const gap=c.ma[i]-c.premium[i];
     if(gap>sd) gaps.push(gap); // 진입선(-1σ) 아래인 순간
   }
 }
 gaps.sort((a,b)=>a-b);
 const q=p=>gaps[Math.floor(gaps.length*p)];
 console.log(`\n=== 진입 신호 순간의 괴리폭 분포 (${gaps.length.toLocaleString('en-US')}회) ===`);
 console.log(`  중앙 ${q(.5).toFixed(2)}%p | 90% ${q(.9).toFixed(2)}%p | 99% ${q(.99).toFixed(2)}%p | 99.9% ${q(.999).toFixed(2)}%p | 최대 ${gaps[gaps.length-1].toFixed(2)}%p`);

 console.log('\n=== 스프레드별: 관문 통과에 필요한 괴리폭과 실제 발생 빈도 ===');
 console.log('스프레드  종목예시        본전문턱  필요괴리(x5)   그만큼 벌어지는 빈도');
 const ex={0.05:'XRP',0.08:'XLM',0.13:'BTC',0.17:'DOGE',0.32:'ADA',0.43:'LINK',0.70:'UNI',
           1.39:'SHIB',1.73:'AVAX',2.50:'DOT',4.77:'BCH',8.70:'ICP',16.44:'IMX'};
 for(const [sp,name] of Object.entries(ex)){
   const be=0.04+Number(sp);
   const need=be*5;
   const cnt=gaps.filter(g=>g>=need).length;
   const pct=cnt/gaps.length*100;
   console.log(String(sp+'%').padEnd(9)+name.padEnd(16)
     +String(be.toFixed(2)+'%p').padStart(8)
     +String(need.toFixed(2)+'%p').padStart(13)
     +String(pct>=0.01?pct.toFixed(2)+'%':(cnt===0?'없음':'<0.01%')).padStart(14)
     +String('('+cnt.toLocaleString('en-US')+'회)').padStart(12));
 }
})().catch(e=>{console.error('FATAL:',e);process.exit(1)});
