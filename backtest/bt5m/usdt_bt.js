// USDT 웃돈 한 다리 — 페이퍼 봇(src/paper/usdt.js)과 같은 규칙을 빗썸 5분봉에서 만든 시간봉으로 되돌린다.
//   prem = 빗썸 원화 USDT 시간봉 종가 ÷ 환율 − 1, 최근 336시간 평균·σ(268개 이상), prem < 평균 − 2σ → 다음 시간봉 종가에 전부 매수,
//   보유 중 prem > 평균 → 다음 시간봉 종가에 전부 매도. 편도 0.09%.
//   환율: Yahoo 시간봉이 있는 2023-12-29 부터는 시간봉, 그 전은 전날 일별 종가(봇 규칙상 «하루 1회 환율은 쓰면 안 됨» → 참고용).
const fs = require('fs');
const FEE = Number(process.env.FEE || 0.0009), WIN = Number(process.env.WIN || 336), MIN_N = Math.round(WIN * 0.8), K = Number(process.env.K || 2), XO = Number(process.env.XO || 0);
const FROM = Date.parse((process.env.FROM || '2023-01-01') + 'T00:00:00Z') / 60000, TO = Date.parse((process.env.TO || '2027-01-01') + 'T00:00:00Z') / 60000;
const buf = fs.readFileSync('data/bithumb/USDT.bin'), n = buf.length / 16;
const hourly = new Map();
for (let i = 0; i < n; i++) { const m = buf.readInt32LE(i * 16), c = buf.readDoubleLE(i * 16 + 4); hourly.set(Math.floor(m / 60) * 60, c); }
const fx = JSON.parse(fs.readFileSync('data/fx.json'));
const fxH = new Map(fx.hourly.map(([m, c]) => [Math.floor(m / 60) * 60, c])), H0 = fx.hourly[0][0];
const daily = fx.daily;   // [분(그날 시작), 종가]
// tStart: 시간봉 시작 시각. 봇처럼 같은 시각에 시작한 환율 시간봉(둘 다 tStart+60 에 마감)을 쓴다.
function fxAt(tStart) {
  const t = tStart + 60;
  if (tStart >= H0) { for (let k = 0; k < 72; k++) { const v = fxH.get(tStart - k * 60); if (v) return [v, 'h']; } }
  let lo = 0, hi = daily.length - 1, a = null;   // 그날 종가가 확정된(시작+1일 ≤ t) 마지막 일봉
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (daily[mid][0] + 1440 <= t) { a = daily[mid][1]; lo = mid + 1; } else hi = mid - 1; }
  return [a, 'd'];
}
const hs = [...hourly.keys()].sort((x, y) => x - y), t0 = hs[0], t1 = hs.at(-1);
const ps = []; let lastC = null;
for (let t = t0; t <= t1; t += 60) { if (t >= TO) break; const c = hourly.get(t) ?? lastC; lastC = c; const [f, src] = fxAt(t); if (c && f) ps.push({ t, c, fx: f, src, prem: c / f - 1 }); }
// 시뮬레이션
let krw = 1e8, usdt = 0, mode = 'krw', pending = null, trade = null; const done = [], eq = [];
const win = []; let sum = 0, sum2 = 0;
for (let i = 0; i < ps.length; i++) {
  const cur = ps[i];
  if (pending === 'buy' && mode === 'krw') { usdt = krw / (cur.c * (1 + FEE)); trade = { t: cur.t, c: cur.c, prem: cur.prem, fx: cur.fx, cost: krw, src: cur.src }; krw = 0; mode = 'usdt'; }
  else if (pending === 'sell' && mode === 'usdt') { krw = usdt * cur.c * (1 - FEE); usdt = 0; mode = 'krw';
    done.push({ in: trade.t, out: cur.t, ret: krw / trade.cost - 1, premPart: Math.log((1 + cur.prem) / (1 + trade.prem)), fxPart: Math.log(cur.fx / trade.fx), src: trade.src }); trade = null; }
  pending = null; if (cur.t < FROM) { if (mode === 'usdt') {} }
  win.push(cur.prem); sum += cur.prem; sum2 += cur.prem ** 2;
  while (win.length && ps[i - win.length + 1].t <= cur.t - WIN * 60) { const v = win.shift(); sum -= v; sum2 -= v * v; }
  if (win.length >= MIN_N) { const ma = sum / win.length, sd = Math.sqrt(Math.max(0, sum2 / win.length - ma * ma));
    if (mode === 'krw' && cur.prem < ma - K * sd) pending = 'buy'; if (mode === 'usdt' && cur.prem > ma + XO * sd) pending = 'sell'; }
  eq.push([cur.t, krw + usdt * cur.c, cur.src]);
}
// 연도별
const yr = {}; let peak = 0, mdd = 0;
for (const [t, v] of eq) { const y = new Date(t * 60000 + 9 * 3600e3).toISOString().slice(0, 4); (yr[y] = yr[y] || { a: v, b: v, pk: v, mdd: 0 }); const o = yr[y]; o.b = v; o.pk = Math.max(o.pk, v); o.mdd = Math.min(o.mdd, v / o.pk - 1); peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); }
let prev = null; console.log(`USDT 웃돈 (빗썸) ${new Date(ps[0].t * 6e4).toISOString().slice(0, 10)} ~ ${new Date(ps.at(-1).t * 6e4).toISOString().slice(0, 10)} · 편도 ${FEE * 100}%`);
console.log('연도  수익률   최대낙폭  거래  승률  보유시간  환율');
for (const [y, o] of Object.entries(yr)) { const start = prev ?? o.a, ds = done.filter(d => new Date(d.out * 6e4 + 9 * 3600e3).toISOString().slice(0, 4) === y);
  const held = ds.reduce((a, d) => a + (d.out - d.in), 0) / (365 * 1440);
  console.log(y, ((o.b / start - 1) * 100).toFixed(1).padStart(7) + '%', (o.mdd * 100).toFixed(1).padStart(7) + '%', String(ds.length).padStart(5), (ds.length ? (ds.filter(d => d.ret > 0).length / ds.length * 100).toFixed(0) : '-').padStart(4) + '%', (held * 100).toFixed(0).padStart(6) + '%', '  ' + [...new Set(eq.filter(e => new Date(e[0] * 6e4 + 9 * 3600e3).toISOString().slice(0, 4) === y).map(e => e[2]))].join('+'));
  prev = o.b; }
const tot = eq.at(-1)[1] / eq[0][1] - 1, yrs = (eq.at(-1)[0] - eq[0][0]) / 525960;
console.log(`전체 ${(tot * 100).toFixed(1)}% · 연 ${((Math.pow(1 + tot, 1 / yrs) - 1) * 100).toFixed(1)}% · 최대낙폭 ${(mdd * 100).toFixed(1)}% · 거래 ${done.length} · 거래당 웃돈 몫 ${(done.reduce((a, d) => a + d.premPart, 0) / done.length * 100).toFixed(3)}%p · 환율 몫 ${(done.reduce((a, d) => a + d.fxPart, 0) / done.length * 100).toFixed(3)}%p`);
const h = done.filter(d => d.src === 'h'), hy = h.length ? (eq.at(-1)[0] - h[0].in) / 525960 : 0;
if (h.length) console.log(`시간별 환율 구간만 (${new Date(h[0].in * 6e4).toISOString().slice(0, 10)}~): 거래 ${h.length} · 단순합 ${(h.reduce((a, d) => a + d.ret, 0) * 100).toFixed(1)}% → 연 ${(h.reduce((a, d) => a + d.ret, 0) / hy * 100).toFixed(1)}%`);
