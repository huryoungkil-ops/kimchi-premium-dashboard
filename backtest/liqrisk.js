// 1배 숏의 청산 조건 = 보유 기간 중 가격이 약 +100% 상승.
// 6년 5분봉으로 "임의의 5일 구간에서 가격이 최대 몇 % 올랐는가"를 잰다.
const fs=require('fs'), path=require('path');
const lib=require('./lib5m');
const Y=6;
const ready=lib.COINS.filter(c=>
  fs.existsSync(path.join(lib.CACHE_DIR,`upbit_${c[0]}_${Y}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR,`okx_${c[0]}_${Y}y.json`)));

console.log('\n=== 보유 기간 중 최대 가격 상승폭 (OKX 무기한선물, 6년) ===');
console.log('1배 숏은 약 +100%에서 청산. 증거금 배수 = 100 / 최대상승폭\n');
console.log('코인    1일최대   2일최대   5일최대   7일최대   5일기준 필요증거금');
const rows=[];
for(const [name,,inst] of ready){
  const d=JSON.parse(fs.readFileSync(path.join(lib.CACHE_DIR,`okx_${name}_${Y}y.json`),'utf8'));
  const n=d.length;
  const bars={1:288,2:576,5:1440,7:2016};
  const out={};
  for(const [days,w] of Object.entries(bars)){
    let mx=0;
    // 구간 시작가 대비 그 구간 내 최고가 (단조 최대 슬라이딩)
    for(let i=0;i<n-w;i+=12){ // 1시간 간격 표본
      const p0=d[i].close;
      let hi=p0;
      for(let j=i+1;j<=i+w;j+=12){ if(d[j].close>hi) hi=d[j].close; }
      const g=(hi/p0-1)*100;
      if(g>mx) mx=g;
    }
    out[days]=mx;
  }
  rows.push([name,out]);
  console.log(name.padEnd(7)
    +String(out[1].toFixed(1)+'%').padStart(9)
    +String(out[2].toFixed(1)+'%').padStart(10)
    +String(out[5].toFixed(1)+'%').padStart(10)
    +String(out[7].toFixed(1)+'%').padStart(10)
    +String((100/out[5]).toFixed(2)+'배').padStart(18));
}
const worst5=Math.max(...rows.map(r=>r[1][5]));
const worstCoin=rows.find(r=>r[1][5]===worst5)[0];
console.log(`\n최악: ${worstCoin} 5일간 +${worst5.toFixed(1)}%`);
console.log(`→ 1배(증거금=명목)로 버티려면 상승폭이 100% 미만이어야 함`);
console.log(`→ 최악 구간을 버티려면 증거금을 명목의 ${(worst5/100).toFixed(2)}배 이상 넣어야 안전`);
