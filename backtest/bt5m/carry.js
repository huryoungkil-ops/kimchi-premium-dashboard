// 펀딩 캐리(현물 롱 + 선물 숏, 가격 위험 0)의 연도별 수취 펀딩. 자료: Binance 실제 펀딩 이력
const fs = require('fs');
const uni = JSON.parse(fs.readFileSync('data/universe.json')).slice(0, 120).map(u => u.coin);
const F = {}; for (const c of uni) { try { F[c] = JSON.parse(fs.readFileSync(`data/binance/${c}.funding.json`)); } catch (e) {} }
const yr = m => new Date(m * 60000).getUTCFullYear();
console.log('① 한 종목 계속 보유 (연간 펀딩 합, 수수료 전)');
for (const c of ['BTC', 'ETH', 'XRP', 'SOL']) { const by = {}; for (const [m, r] of F[c] || []) by[yr(m)] = (by[yr(m)] || 0) + r; console.log(c.padEnd(4), Object.entries(by).map(([y, v]) => `${y} ${(v * 100).toFixed(1)}%`).join(' · ')); }
// ② 매주 직전 7일 펀딩 상위 5종목(양수만)으로 갈아타기, 갈아탈 때마다 현물+선물 왕복 비용
const COST = Number(process.argv[2] || 0.003);   // 바꾸는 종목 1개당 왕복(현물 0.1%x2 + 선물 0.05%x2 = 0.3%)
const W = 7 * 1440, start = Date.parse('2020-03-01T00:00:00Z') / 60000, end = Date.parse('2026-10-14T00:00:00Z') / 60000;
const res = {}; let held = new Set(), eq = 1, peak = 1, mdd = 0;
for (let t = start; t < end; t += W) {
  const score = []; for (const [c, a] of Object.entries(F)) { const s = a.filter(([m]) => m > t - W && m <= t).reduce((x, [, r]) => x + r, 0); if (a.length && a[0][0] < t - 60 * 1440) score.push([c, s]); }
  const pick = new Set(score.filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]));
  const changed = [...pick].filter(c => !held.has(c)).length + [...held].filter(c => !pick.has(c)).length;
  let g = 0; for (const c of pick) g += F[c].filter(([m]) => m > t && m <= t + W).reduce((x, [, r]) => x + r, 0) / pick.size;
  const r = (pick.size ? g : 0) - changed / Math.max(1, pick.size || held.size) * COST / 2;
  eq *= 1 + r; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); held = pick;
  const y = yr(t); res[y] = (res[y] || 1) * (1 + r);
}
console.log(`② 펀딩 상위 5종목 주간 교체 (교체 비용 왕복 ${COST * 100}%) — 펀딩 수익만, 가격·베이시스 위험 미반영`);
console.log(Object.entries(res).map(([y, v]) => `${y} ${((v - 1) * 100).toFixed(1)}%`).join(' · '), `· 최대낙폭(펀딩 기준) ${(mdd * 100).toFixed(1)}%`);
