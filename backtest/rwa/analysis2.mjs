// B: tokenized stocks / stock perps vs underlying (RTH only) + weekend-gap tests for gold and stocks
import fs from 'fs';
import { run, R, stats } from './backtest.mjs';
const L = n => JSON.parse(fs.readFileSync(`data/${n}.json`));
const H = 3600e3;
const toMap = a => new Map(a.map(r => [r[0], r[1]]));
const corr = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return { corr: +(sxy / Math.sqrt(sxx * syy)).toFixed(3), beta: +(sxy / sxx).toFixed(3) }; };
const sdv = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const out = { B_stock_premium: {}, weekend_gold: {}, weekend_stocks: {} };

// ---- B: RTH premium. Yahoo 1h bar t=start; close time = t+1h except last bar of day (t+30m)
function yahooCloses(n) { const y = L(n); const res = []; for (let i = 0; i < y.length; i++) { const t = y[i][0]; const next = y[i + 1]; const sameDay = next && new Date(next[0]).toISOString().slice(0, 10) === new Date(t).toISOString().slice(0, 10); res.push([sameDay ? t + H : t + H / 2, y[i][1]]); } return res; }
for (const [tok, und, label] of [['by30_TSLAX', 'TSLA', 'Bybit TSLAx'], ['by30_AAPLX', 'AAPL', 'Bybit AAPLx'], ['by30_NVDAX', 'NVDA', 'Bybit NVDAx'], ['bn30_perp_TSLA', 'TSLA', 'Binance TSLA perp'], ['bn30_perp_NVDA', 'NVDA', 'Binance NVDA perp'], ['bn30_perp_SPY', 'SPY', 'Binance SPY perp']]) {
  const tm = toMap(L(tok)); const rows = []; for (const [t, c] of yahooCloses(`yh_${und}_1h`)) { const p = tm.get(t); if (p && c) rows.push({ t, x: p / c - 1 }); }
  const name = `B_${tok}_vs_${und}`;
  run(name, rows, { cfgs: [['RTH72_cost0.30', { W: 72, rtCost: 0.003 }], ['RTH72_cost0.20', { W: 72, rtCost: 0.002 }], ['RTH72_cost0.10', { W: 72, rtCost: 0.001 }], ['RTH72_twoSided_cost0.20', { W: 72, rtCost: 0.002, twoSided: true }], ['RTH72_gross', { W: 72, rtCost: 0 }]] }, `${label} / ${und} at Yahoo 1h RTH bar closes - 1 (crypto 30m close aligned)`);
  out.B_stock_premium[name] = R.series[name];
}

// ---- Weekend: stocks. token at Fri close (Yahoo daily close time) -> token at Mon open time, vs stock gap open/prevclose
for (const [tok, und] of [['by30_TSLAX', 'TSLA'], ['by30_AAPLX', 'AAPL'], ['by30_NVDAX', 'NVDA'], ['bn30_perp_TSLA', 'TSLA'], ['bn30_perp_NVDA', 'NVDA'], ['bn30_perp_SPY', 'SPY']]) {
  const tm = toMap(L(tok)); const d = L(`yhd_${und}`); const xs = [], ys = [], premOpen = [], premFri = [];
  for (let i = 1; i < d.length; i++) {
    const gapDays = (d[i][0] - d[i - 1][0]) / 864e5; if (gapDays < 2.5) continue; // weekend/holiday gaps only
    const friClose = d[i - 1][0] + 6.5 * H, monOpen = d[i][0];
    const pF = tm.get(friClose), pM = tm.get(monOpen); if (!pF || !pM) continue;
    xs.push(pM / pF - 1); ys.push(d[i][1] / d[i - 1][2] - 1); premOpen.push(pM / d[i][1] - 1); premFri.push(pF / d[i - 1][2] - 1);
  }
  if (xs.length < 5) { out.weekend_stocks[`${tok}`] = { n: xs.length, note: 'insufficient' }; continue; }
  const resid = xs.map((x, i) => x - ys[i]);
  out.weekend_stocks[`${tok}_vs_${und}`] = { n: xs.length, tokenWeekendRet_vs_MondayGap: corr(xs, ys), meanAbsGapPct: +(mean(ys.map(Math.abs)) * 100).toFixed(3), meanAbsTokenMinusGapPct: +(mean(resid.map(Math.abs)) * 100).toFixed(3), premAtFriClose: stats(premFri), premAtMonOpen: stats(premOpen) };
  console.log('weekend', tok, JSON.stringify(out.weekend_stocks[`${tok}_vs_${und}`]).slice(0, 300));
}

// ---- Weekend: gold. GC=F 1h gaps > 24h (weekends/holidays). Fri last close vs Sunday first close; token over identical timestamps
for (const tok of ['bn_spot_PAXG', 'by_spot_XAUT', 'bn_perp_XAU', 'hl_GOLD']) {
  const tm = toMap(L(tok)); const g = L('yh_GC_1h'); const xs = [], ys = [], pF = [], pS = [], pS24 = [], revert = [];
  const gm = toMap(g);
  for (let i = 1; i < g.length; i++) {
    if (g[i][0] - g[i - 1][0] < 24 * H) continue;
    const tF = g[i - 1][0], tS = g[i][0]; // bar open times; closes at +1h on both series (same convention)
    const a0 = tm.get(tF), a1 = tm.get(tS); if (!a0 || !a1) continue;
    xs.push(a1 / a0 - 1); ys.push(g[i][1] / g[i - 1][1] - 1); pF.push(a0 / g[i - 1][1] - 1); pS.push(a1 / g[i][1] - 1);
    const t24 = tS + 24 * H, a24 = tm.get(t24), g24 = gm.get(t24); if (a24 && g24) { pS24.push(a24 / g24 - 1); }
  }
  if (xs.length < 5) { out.weekend_gold[tok] = { n: xs.length }; continue; }
  const dPrem = pS.map((p, i) => p - pF[i]);
  out.weekend_gold[tok] = { n: xs.length, tokenWeekendRet_vs_GCreopenRet: corr(xs, ys), meanAbsGCgapPct: +(mean(ys.map(Math.abs)) * 100).toFixed(3), meanAbsTokenMinusGCPct: +(mean(xs.map((x, i) => Math.abs(x - ys[i]))) * 100).toFixed(3), premFriCloseMeanPct: +(mean(pF) * 100).toFixed(3), premSunReopenMeanPct: +(mean(pS) * 100).toFixed(3), premReopenPlus24hMeanPct: pS24.length ? +(mean(pS24) * 100).toFixed(3) : null, sdPremChangeOverWeekendPct: +(sdv(dPrem) * 100).toFixed(3) };
  console.log('weekend gold', tok, JSON.stringify(out.weekend_gold[tok]));
}
fs.writeFileSync('bt_stocks_weekend.json', JSON.stringify(out, null, 1));
