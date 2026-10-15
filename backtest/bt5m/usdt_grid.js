// USDT 웃돈 규칙 탐색: 학습 2024 / 검증 2025-01~2026-10 (기간 전체를 돌리고 매도 시점으로 나눈다)
const { execFileSync } = require('child_process');
const res = [];
for (const K of [1.5, 2, 2.5, 3]) for (const WIN of [168, 336, 720]) for (const XO of [-0.5, 0, 0.5, 1]) {
  const o = execFileSync('node', ['usdt_bt.js'], { env: { ...process.env, K, WIN, XO } }).toString();
  const y = {}; for (const l of o.split('\n')) { const m = l.match(/^(20\d\d)\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s+(\d+)/); if (m) y[m[1]] = { r: +m[2], mdd: +m[3], n: +m[4] }; }
  const tot = o.match(/연 (-?[\d.]+)% · 최대낙폭 (-?[\d.]+)%/);
  res.push({ K, WIN, XO, y24: y['2024']?.r, y25: y['2025']?.r, y26: y['2026']?.r, cagr: +tot[1], mdd: +tot[2], n: Object.values(y).reduce((a, v) => a + v.n, 0) });
}
res.sort((a, b) => b.y24 - a.y24);
console.log('학습(2024) 순위 상위 12 — 검증(2025·2026)은 고른 뒤에 보는 값');
console.log('K    창(시간) 청산   2024    2025    2026    전체연  낙폭  거래');
for (const r of res.slice(0, 12)) console.log(String(r.K).padEnd(4), String(r.WIN).padStart(6), String(r.XO).padStart(6), (r.y24 + '%').padStart(7), (r.y25 + '%').padStart(7), (r.y26 + '%').padStart(7), (r.cagr + '%').padStart(7), (r.mdd + '%').padStart(6), String(r.n).padStart(4));
const cur = res.find(r => r.K === 2 && r.WIN === 336 && r.XO === 0); console.log('지금 봇 규칙(K2·336·평균):', JSON.stringify(cur));
