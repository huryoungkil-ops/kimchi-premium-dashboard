// 김프 분해: 봇식 김프(원화가/일별 환율/바이낸스 − 1) = USDT 프리미엄(업비트 USDT/환율) × 코인 고유 괴리(원화가/(업비트USDT×바이낸스))
// 72h 이동평균 대비 이탈(dev)로 분산 기여, 종목 간 상관, 신호 동시 발생, 반감기를 잰다.
const fs = require('fs');
const C = process.env.EXCH_CACHE || './cache/'; // 거래소 5분봉 캐시 [ts, 종가, 거래대금] (리서치 때 공개 API로 수집)
const fxDaily = JSON.parse(fs.readFileSync('fx.json')).rates;
const fxDays = Object.keys(fxDaily).sort();
const fxAt = ts => { const d = new Date(ts + 9 * 3600e3).toISOString().slice(0, 10); let v = null; for (const k of fxDays) { if (k <= d) v = fxDaily[k].KRW; else break; } return v; };
const load = n => new Map(JSON.parse(fs.readFileSync(C + n)).map(r => [r[0], r[1]]));
const COINS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'LINK', 'TRX', 'XLM', 'SUI'];
const EX = process.argv[2] || 'upbit';
const usdt = load('upbit_USDT.json');
const W = 72 * 12; // 72h of 5m bars
function rollDev(arr) { // arr of {ts, v}; returns dev = v - MA(prev W), sd
  const out = []; let s = 0, s2 = 0; const q = [];
  for (const p of arr) {
    if (q.length >= W * 0.8) { const m = s / q.length, sd = Math.sqrt(Math.max(1e-12, s2 / q.length - m * m)); out.push({ ts: p.ts, dev: p.v - m, sd }); }
    q.push(p.v); s += p.v; s2 += p.v * p.v; if (q.length > W) { const o = q.shift(); s -= o; s2 -= o * o; }
  }
  return out;
}
const series = {};
for (const c of COINS) {
  let kr; try { kr = load(`${EX}_${c}.json`); } catch { continue; }
  const bn = load(`binance_${c}.json`);
  const rows = [];
  for (const [ts, k] of kr) { const b = bn.get(ts), u = usdt.get(ts), fx = fxAt(ts); if (!b || !u || !fx || !k) continue;
    rows.push({ ts, prem: (k / fx / b - 1) * 100, us: (u / fx - 1) * 100, coin: (k / (u * b) - 1) * 100 }); }
  rows.sort((a, b) => a.ts - b.ts);
  const dp = rollDev(rows.map(r => ({ ts: r.ts, v: r.prem }))), du = rollDev(rows.map(r => ({ ts: r.ts, v: r.us }))), dc = rollDev(rows.map(r => ({ ts: r.ts, v: r.coin })));
  series[c] = { n: rows.length, dp, du, dc, rows };
}
const corr = (x, y) => { const n = x.length; const mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sx * sy); };
const varr = x => { const m = x.reduce((a, b) => a + b) / x.length; return x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length; };
const halfLife = x => { const a = x.slice(0, -1), b = x.slice(1); const phi = corr(a, b); return phi > 0 && phi < 1 ? -Math.log(2) / Math.log(phi) * 5 : null; }; // minutes
// 1h 평균으로도(5분 잡음 제거)
const hourly = devs => { const m = new Map(); for (const d of devs) { const h = Math.floor(d.ts / 3600e3); const e = m.get(h) || [0, 0]; e[0] += d.dev; e[1]++; m.set(h, e); } return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([h, e]) => ({ ts: h, dev: e[0] / e[1] })); };
const res = { ex: EX, coins: {} };
for (const [c, s] of Object.entries(series)) {
  const P = s.dp.map(d => d.dev), U = s.du.map(d => d.dev), K = s.dc.map(d => d.dev);
  const n = Math.min(P.length, U.length, K.length);
  const hp = hourly(s.dp), hu = hourly(s.du), hk = hourly(s.dc);
  // 신호 시점: dev < -2sd (봇식 김프)
  let sig = 0, usdtShareSum = 0, usdtNeg = 0;
  const uMap = new Map(s.du.map(d => [d.ts, d.dev]));
  for (const d of s.dp) if (d.dev < -2 * d.sd && uMap.has(d.ts)) { sig++; const u = uMap.get(d.ts); usdtShareSum += Math.max(-1, Math.min(2, u / d.dev)); if (u < 0) usdtNeg++; }
  res.coins[c] = {
    bars: s.n, varShareUsdt5m: varr(U.slice(-n)) / varr(P.slice(-n)), corrPremUsdt5m: corr(P.slice(-n), U.slice(-n)),
    varShareUsdt1h: varr(hu.map(x => x.dev)) / varr(hp.map(x => x.dev)), corrPremUsdt1h: corr(hp.slice(-Math.min(hp.length, hu.length)).map(x => x.dev), hu.slice(-Math.min(hp.length, hu.length)).map(x => x.dev)),
    hlPremMin: halfLife(P), hlUsdtMin: halfLife(U), hlCoinMin: halfLife(K),
    hlPrem1hMin: halfLife(hp.map(x => x.dev)) * 12, hlCoin1hMin: halfLife(hk.map(x => x.dev)) * 12, hlUsdt1hMin: halfLife(hu.map(x => x.dev)) * 12,
    signals: sig, usdtShareAtSignal: sig ? usdtShareSum / sig : null, usdtSameSignAtSignal: sig ? usdtNeg / sig : null,
  };
}
// 종목 간 상관(1h 평균 이탈): 봇식 vs 코인 고유
const keys = Object.keys(series);
const hm = (c, k) => new Map(hourly(series[c][k]).map(x => [x.ts, x.dev]));
function avgPairCorr(k) { const ms = keys.map(c => hm(c, k)); let s = 0, n = 0; for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const xs = [], ys = []; for (const [t, v] of ms[i]) if (ms[j].has(t)) { xs.push(v); ys.push(ms[j].get(t)); } if (xs.length > 100) { s += corr(xs, ys); n++; } } return s / n; }
res.avgPairCorrPrem1h = avgPairCorr('dp'); res.avgPairCorrCoin1h = avgPairCorr('dc');
// 신호 동시 발생: 같은 5분봉에 몇 종목이 동시에 -2σ 아래인가
const sigBars = new Map();
for (const c of keys) for (const d of series[c].dp) if (d.dev < -2 * d.sd) sigBars.set(d.ts, (sigBars.get(d.ts) || 0) + 1);
const dist = {}; let tot = 0, multi = 0; for (const v of sigBars.values()) { dist[v] = (dist[v] || 0) + 1; }
for (const c of keys) for (const d of series[c].dp) if (d.dev < -2 * d.sd) { tot++; if (sigBars.get(d.ts) >= 2) multi++; }
res.signalCoOccurrence = { coinSignals: tot, withOtherCoinSameBar: multi / tot, barsByCount: dist };
// 기간
const any = series.BTC.rows; res.period = [new Date(any[0].ts).toISOString(), new Date(any[any.length - 1].ts).toISOString()];
fs.writeFileSync(`decomp_${EX}.json`, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v, 1));
