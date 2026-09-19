// 편입/편출 문턱 검증.
//
// 스캐너는 "최근 12회 스프레드의 중앙값"으로 종목을 넣고 뺀다(편입 0.8% / 편출 1.2%).
// 그런데 실제로 거래할 때 우리가 맞는 건 중앙값이 아니라 "그 순간의 스프레드"다.
// 봇에는 두 번째 관문이 있다 — 진입 직전 호가를 다시 재서 스프레드가
// MAX_SPREAD_PERCENT(1.0%)를 넘으면 진입을 취소한다.
//
// 여기서 답할 질문:
//   ① 중앙값 <= 0.8인 종목이라도 개별 순간에는 얼마나 벌어지나?
//   ② 그 순간을 두 번째 관문(1.0%)이 실제로 잡아내나? 몇 %를 놓치나?
//   ③ 0.8 / 1.2라는 두 숫자가 종목을 깔끔하게 가르나, 아니면 애매한 구간에 몰려 있나?
//   ④ 중앙값은 안정적인가 — 앞 절반으로 잰 중앙값이 뒤 절반을 예측하나?
const fs = require('fs');
const path = require('path');

const ADMIT = 0.8;        // 편입 문턱 (중앙값 기준)
const DROP = 1.2;         // 편출 문턱 (중앙값 기준)
const ENTRY_GATE = 1.0;   // 봇의 진입 직전 관문 (순간 스프레드 기준)

const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'universe_snapshot.json'), 'utf8'));

function median(a) {
  const s = a.slice().sort((x, y) => x - y);
  const n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';

const rows = snap.rows.map(r => {
  const med = median(r.recent);
  const max = Math.max(...r.recent);
  const min = Math.min(...r.recent);
  const over = r.recent.filter(v => v > ENTRY_GATE).length;
  return { ...r, med, max, min, over, n: r.recent.length, ratio: med > 0 ? max / med : null };
});

console.log(`=== 편입/편출 문턱 검증 (${snap.asOf}) ===`);
console.log(`${rows.length}종목 · 관측 ${rows.reduce((s, r) => s + r.n, 0)}개 · 편입 ${ADMIT}% / 편출 ${DROP}% / 진입관문 ${ENTRY_GATE}%\n`);

// ---------- ① ② 편입권 종목의 순간 스프레드 이탈 ----------
const admitZone = rows.filter(r => r.med <= ADMIT);
const obsAdmit = admitZone.reduce((s, r) => s + r.n, 0);
const overAdmit = admitZone.reduce((s, r) => s + r.over, 0);

console.log('===== ① 중앙값이 편입권(<=0.8%)인 종목의 순간 이탈 =====');
console.log('코인      n  중앙값   최소   최대  최대/중앙  >1.0% 횟수');
admitZone.sort((a, b) => b.ratio - a.ratio).forEach(r => {
  const flag = r.over > 0 ? '  <-- 진입관문에 걸림' : '';
  console.log('  ' + r.coin.padEnd(7) + String(r.n).padStart(2)
    + r.med.toFixed(2).padStart(8) + r.min.toFixed(2).padStart(7) + r.max.toFixed(2).padStart(7)
    + (r.ratio ? r.ratio.toFixed(1) + 'x' : '-').padStart(10)
    + String(r.over).padStart(8) + flag);
});
console.log(`\n  편입권 ${admitZone.length}종목의 관측 ${obsAdmit}개 중 ${overAdmit}개(${pct(overAdmit, obsAdmit)})가 순간적으로 1.0%를 넘었다.`);
console.log('  -> 이 순간에 진입 신호가 겹치면 봇의 두 번째 관문이 진입을 취소한다(기회 상실, 손실 아님).');

// ---------- ③ 두 문턱 사이(완충 구간) 밀집도 ----------
console.log('\n===== ③ 문턱이 종목을 가르는가 =====');
const zones = [
  ['편입권  (<= 0.8)', rows.filter(r => r.med <= ADMIT)],
  ['완충    (0.8~1.2)', rows.filter(r => r.med > ADMIT && r.med < DROP)],
  ['편출권  (>= 1.2)', rows.filter(r => r.med >= DROP)],
];
zones.forEach(([label, list]) => {
  console.log('  ' + label.padEnd(20) + String(list.length).padStart(3) + '종목  ' + list.map(r => r.coin).join(' '));
});
const buf = zones[1][1].length;
console.log(`\n  완충 구간에 ${buf}종목(${pct(buf, rows.length)}). 이 구간은 상태가 바뀌지 않으므로`);
console.log('  여기에 많이 몰려 있으면 문턱이 사실상 작동하지 않는다는 뜻이다.');

// ---------- ④ 중앙값의 예측력 ----------
console.log('\n===== ④ 앞 절반의 중앙값이 뒤 절반을 예측하나 =====');
const splitable = rows.filter(r => r.n >= 4);
let agree = 0, disagree = 0;
const flips = [];
splitable.forEach(r => {
  const h = Math.floor(r.n / 2);
  const a = median(r.recent.slice(0, h));
  const b = median(r.recent.slice(h));
  const aIn = a <= ADMIT, bIn = b <= ADMIT;
  if (aIn === bIn) agree++; else { disagree++; flips.push(`${r.coin}(${a.toFixed(2)}->${b.toFixed(2)})`); }
});
console.log(`  ${splitable.length}종목 중 편입권 여부가 유지된 종목: ${agree} (${pct(agree, splitable.length)})`);
console.log(`  뒤집힌 종목: ${disagree} ${flips.length ? '-> ' + flips.join(' ') : ''}`);

// ---------- 현재 tradable 상태와 중앙값의 일치 ----------
console.log('\n===== 현재 tradable 플래그와 중앙값의 불일치 =====');
const badTrue = rows.filter(r => r.tradable && r.med > ADMIT);
const badFalse = rows.filter(r => !r.tradable && r.med <= ADMIT);
console.log(`  tradable=true인데 중앙값 > 0.8: ${badTrue.length}종목  ${badTrue.map(r => r.coin + '(' + r.med.toFixed(2) + ')').join(' ')}`);
console.log(`  tradable=false인데 중앙값 <= 0.8: ${badFalse.length}종목  ${badFalse.map(r => r.coin + '(' + r.med.toFixed(2) + ')').join(' ')}`);
console.log('  (전자는 시드로 넣은 뒤 아직 편출 연속 4회를 못 채운 종목, 후자는 편입 연속 12회를 쌓는 중인 종목)');

// ---------- 진입관문 후보값 비교 ----------
console.log('\n===== 진입관문(MAX_SPREAD_PERCENT) 후보 =====');
console.log('  관문    편입권 관측 중 취소되는 비율   편출권 종목이 뚫고 들어올 관측 수');
[0.6, 0.8, 1.0, 1.2, 1.5].forEach(gate => {
  const cancels = admitZone.reduce((s, r) => s + r.recent.filter(v => v > gate).length, 0);
  const leak = rows.filter(r => r.med >= DROP).reduce((s, r) => s + r.recent.filter(v => v <= gate).length, 0);
  console.log('  ' + (gate.toFixed(1) + '%').padEnd(8) + (cancels + '개 / ' + obsAdmit + ' (' + pct(cancels, obsAdmit) + ')').padEnd(28) + leak + '개');
});

// ---------- ⑤ 호가 깊이: 문턱이 전혀 보지 않는 차원 ----------
// 스프레드가 좁아도 호가창에 물량이 없으면 주문이 안 채워지거나 슬리피지로 다 까먹는다.
// depthKrw = 매도 5호가 누적 금액. 현재 편입 규칙은 이 값을 전혀 보지 않는다.
console.log('\n===== ⑤ 호가 깊이 (편입권 종목) =====');
const KRW_PER_USD = 1386.9;
const SIZES = [
  ['페이퍼 $1,000', 1000 * KRW_PER_USD],
  ['실거래 3,000만/4자리', 30000000 / 4 / 2],   // 자본의 절반이 코빗 현물
  ['실거래 5,000만/4자리', 50000000 / 4 / 2],
];
console.log('  코인      깊이(원)   ' + SIZES.map(s => s[0].padStart(22)).join(''));
admitZone.slice().sort((a, b) => a.depthKrw - b.depthKrw).forEach(r => {
  const cells = SIZES.map(([, krw]) => {
    const share = krw / r.depthKrw * 100;
    const mark = share > 100 ? ' !!' : share > 30 ? ' !' : '';
    return (share.toFixed(0) + '%' + mark).padStart(22);
  }).join('');
  console.log('  ' + r.coin.padEnd(7) + r.depthKrw.toLocaleString('en-US').padStart(12) + cells);
});
console.log('  (숫자 = 포지션이 매도 5호가 누적 금액에서 차지하는 비중. ! = 30% 초과, !! = 책 전체보다 큼)');

console.log('\n===== 깊이 문턱 후보 =====');
console.log('  문턱(원)     편입권에서 탈락      남는 종목의 최소 깊이');
[0, 1000000, 2000000, 4000000, 7000000, 14000000].forEach(floor => {
  const out = admitZone.filter(r => r.depthKrw < floor);
  const keep = admitZone.filter(r => r.depthKrw >= floor);
  const minKeep = keep.length ? Math.min(...keep.map(r => r.depthKrw)) : 0;
  console.log('  ' + floor.toLocaleString('en-US').padStart(10)
    + ('  ' + out.length + '종목').padEnd(10)
    + (out.length ? out.map(r => r.coin).join(' ') : '-').padEnd(30)
    + minKeep.toLocaleString('en-US').padStart(12));
});
