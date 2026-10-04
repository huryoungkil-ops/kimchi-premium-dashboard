// Main experiment runner: base variants, filters, leverage/liquidation, grid, combos, collapse capture, outputs
const fs = require('fs');
const { prep, btcLong } = require('./data_prep');
const { run, metrics, yearly, I } = require('./lib');
const St = require('./strategies');
const D = prep();
const FULL = ['2019-09-08', '2026-10-04'], IS = ['2019-09-08', '2021-12-31'], OOS = ['2022-01-01', '2026-10-04'];
const r4 = x => x == null || !isFinite(x) ? x : Math.round(x * 10000) / 10000;
const R = o => { const z = {}; for (const k in o) z[k] = typeof o[k] === 'number' ? r4(o[k]) : o[k]; return z; };
const out = { generated: new Date().toISOString(), coverage: {}, base: {}, variants: {}, leverage: {}, grid: {}, combos: {}, collapses: {}, worstTrades: {}, mae: {}, notes: [] };

// ---- coverage ----
const syms = Object.values(D.syms);
const lastDate = D.dates.at(-1);
const delisted = syms.filter(S => S.last < D.ND - 3);
out.coverage = {
  symbolFilesTried: D.coverage.files, withData: D.coverage.withBars, fromAPI: D.coverage.api, fromBinanceVisionZip: D.coverage.vision,
  noData: D.coverage.none, excludedNonCrypto: D.coverage.excluded, delistedOrStale: delisted.length, active: syms.length - delisted.length,
  withFunding: syms.filter(S => S.hasF).length,
  activeByYearEnd: Object.fromEntries(['2019-12-31', '2020-12-31', '2021-12-31', '2022-12-31', '2023-12-31', '2024-12-31', '2025-12-31', '2026-10-04'].map(d => { const i = D.dates.indexOf(d); return [d, syms.filter(S => S.first <= i && S.last >= i).length]; })),
  delistedByYear: (() => { const z = {}; for (const S of delisted) { const y = D.dates[S.last].slice(0, 4); z[y] = (z[y] || 0) + 1; } return z; })(),
};

function evalRun(strat, opts, keepTrades) {
  const r = run(D, strat, opts);
  const res = { name: strat.name, opts: opts || {}, full: R(metrics(r.eq, D.dates, ...FULL, r.trades)), is: R(metrics(r.eq, D.dates, ...IS, r.trades)), oos: R(metrics(r.eq, D.dates, ...OOS, r.trades)),
    yearly: R(yearly(r.eq, D.dates)), fundingTot: r4(r.fundingTot), feeTot: r4(r.feeTot), slipTot: r4(r.slipTot), liquidations: r.liqCount, delistCloses: r.delistCount,
    avgGross: r4(avg(r.gross)), avgPositions: r4(avg(r.npos)) };
  // gross P&L attribution of funding: funding / sum(|pnl|)
  return keepTrades ? Object.assign(res, { _r: r }) : res;
}
function avg(a) { let s = 0, n = 0; for (const x of a) if (isFinite(x)) { s += x; n++; } return n ? s / n : 0; }

// ---- base strategies ----
const BASE = {
  A_turtle: St.turtle(),
  B_trend: St.trendB(),
  C_crash: St.crashC(),
  D_relweak: St.relD(),
};
const baseRuns = {};
for (const [k, s] of Object.entries(BASE)) { baseRuns[k] = evalRun(s, {}, true); }

// ---- variants (filters, universe, sizing) ----
const V = [
  ['A_turtle', 'inclBTCETH', St.turtle(), { excludeBTCETH: false }],
  ['A_turtle', 'maxPos20', St.turtle(), { maxPos: 20 }],
  ['A_turtle', 'maxPos30_gross2', St.turtle(), { maxPos: 30, grossCap: 2 }],
  ['A_turtle', 'grossCap1.0', St.turtle(), { grossCap: 1.0 }],
  ['B_trend', 'grossCap1.0', St.trendB(), { grossCap: 1.0 }],
  ['A_turtle', 'risk0.5%', St.turtle({ risk: 0.005 }), {}],
  ['A_turtle', 'units1', St.turtle({ units: 1 }), {}],
  ['A_turtle', 'btcRegime', St.turtle({ btcRegime: true }), {}],
  ['A_turtle', 'age<180d', St.turtle({ ageMax: 180, tag: '_young' }), {}],
  ['A_turtle', 'age>=180d', St.turtle({ ageMin: 180, tag: '_old' }), {}],
  ['A_turtle', 'fund>=-0.05%', St.turtle({ fundMin: -0.0005, tag: '_fund' }), {}],
  ['A_turtle', 'fund+btcRegime+maxPos20', St.turtle({ fundMin: -0.0005, btcRegime: true, tag: '_fund' }), { maxPos: 20 }],
  ['A_turtle', 'noFunding(cost check)', St.turtle(), { fundingOn: false }],
  ['B_trend', 'inclBTCETH', St.trendB(), { excludeBTCETH: false }],
  ['B_trend', 'noBtcRegime', St.trendB({ btcRegime: false }), {}],
  ['B_trend', 'stop3N', St.trendB({ stopMult: 3 }), {}],
  ['B_trend', 'stop2N', St.trendB({ stopMult: 2 }), {}],
  ['B_trend', 'maxPos20', St.trendB(), { maxPos: 20 }],
  ['B_trend', 'risk0.5%', St.trendB({ risk: 0.005 }), {}],
  ['B_trend', 'age<180d', St.trendB({ ageMax: 180, tag: '_young' }), {}],
  ['B_trend', 'age>=180d', St.trendB({ ageMin: 180, tag: '_old' }), {}],
  ['B_trend', 'fund>=-0.05%', St.trendB({ fundMin: -0.0005, tag: '_fund' }), {}],
  ['B_trend', 'noFunding(cost check)', St.trendB(), { fundingOn: false }],
  ['C_crash', 'btcRegime', St.crashC({ btcRegime: true }), {}],
  ['C_crash', 'age<180d', St.crashC({ ageMax: 180, tag: '_young' }), {}],
  ['C_crash', 'age>=180d', St.crashC({ ageMin: 180, tag: '_old' }), {}],
  ['C_crash', 'fund>=-0.05%', St.crashC({ fundMin: -0.0005, tag: '_fund' }), {}],
  ['C_crash', 'noStop', St.crashC({ stopMult: null }), {}],
  ['C_crash', 'inclBTCETH', St.crashC(), { excludeBTCETH: false }],
  ['D_relweak', 'btcRegime', St.relD({ btcRegime: true }), {}],
  ['D_relweak', 'k10', St.relD({ k: 10 }), {}],
  ['D_relweak', 'stop2N', St.relD({ stopMult: 2 }), {}],
  ['D_relweak', 'fund>=-0.05%', St.relD({ fundMin: -0.0005, tag: '_fund' }), {}],
  ['D_relweak', 'inclBTCETH', St.relD(), { excludeBTCETH: false }],
];
for (const [b, label, s, o] of V) { out.variants[b] = out.variants[b] || {}; const e = evalRun(s, o); out.variants[b][label] = { name: e.name, full: e.full, is: e.is, oos: e.oos, fundingTot: e.fundingTot, liquidations: e.liquidations }; }

// ---- leverage / liquidation (isolated margin, mmr 1%; liq at entry*(1+1/L-1%)) ----
for (const k of Object.keys(BASE)) {
  out.leverage[k] = {};
  for (const L of [1, 2, 3, 5]) {
    const e = evalRun(BASE[k], { lev: L, grossCap: Math.min(1.5, L) }, true);
    const liqT = e._r.trades.filter(t => t.reason === 'LIQUIDATED');
    out.leverage[k]['x' + L] = { full: e.full, oos: e.oos, liquidations: liqT.length, liqLossSumPctEq: r4(liqT.reduce((a, t) => a + t.pnlPctOfEq, 0)),
      examples: liqT.slice(0, 15).map(t => `${t.sym} ${t.entryDate}->${t.exitDate}`) };
  }
}
// MAE-based squeeze stats on base runs (unlevered, stops as specified): how many trades saw adverse excursion beyond liq distance
for (const k of Object.keys(BASE)) {
  const T = baseRuns[k]._r.trades; const n = T.length;
  out.mae[k] = { trades: n, 'mae>=99%(1x liq)': T.filter(t => t.mae >= 0.99).length, 'mae>=49%(2x liq)': T.filter(t => t.mae >= 0.49).length, 'mae>=32.3%(3x liq)': T.filter(t => t.mae >= 0.323).length,
    'mae>=19%(5x liq)': T.filter(t => t.mae >= 0.19).length, stopGapFills: T.filter(t => t.reason === 'stop(gap)').length, stops: T.filter(t => t.reason.startsWith('stop')).length };
}

// ---- BTC long sleeve and combos ----
const btc = btcLong(D);
out.btcLong120 = { full: R(metrics(btc.eq, D.dates, ...FULL)), is: R(metrics(btc.eq, D.dates, ...IS)), oos: R(metrics(btc.eq, D.dates, ...OOS)), yearly: R(yearly(btc.eq, D.dates)), fundingPaidSum: r4(btc.fund), switches: btc.switches };
function blend(eqA, eqB, wA, wB) { // daily-rebalanced blend of returns (wA+wB may exceed 1 = overlay)
  const e = new Float64Array(D.ND).fill(NaN); let E = 1;
  for (let i = 0; i < D.ND; i++) { if (i === 0 || isNaN(eqA[i - 1]) || isNaN(eqA[i])) { e[i] = E; continue; }
    const ra = eqA[i] / eqA[i - 1] - 1, rb = (isNaN(eqB[i - 1]) || isNaN(eqB[i])) ? 0 : eqB[i] / eqB[i - 1] - 1; E *= 1 + wA * ra + wB * rb; e[i] = E; }
  return e;
}
const comboEq = {};
for (const k of Object.keys(BASE)) {
  const a = baseRuns[k]._r.eq;
  for (const [lab, wa, wb] of [['50/50', 0.5, 0.5], ['overlay 1+1', 1, 1]]) {
    const e = blend(a, btc.eq, wa, wb); comboEq[k + ' + BTC120 ' + lab] = e;
    out.combos[k + ' + BTC120 ' + lab] = { full: R(metrics(e, D.dates, ...FULL)), is: R(metrics(e, D.dates, ...IS)), oos: R(metrics(e, D.dates, ...OOS)), yearly: R(yearly(e, D.dates)) };
  }
  // correlation of daily returns
  const ra = [], rb = []; for (let i = 1; i < D.ND; i++) if (a[i - 1] > 0 && btc.eq[i - 1] > 0) { ra.push(a[i] / a[i - 1] - 1); rb.push(btc.eq[i] / btc.eq[i - 1] - 1); }
  out.combos[k + ' corr_vs_BTC120'] = r4(corr(ra, rb));
}
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n; let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); }

// ---- collapse capture ----
const FAMOUS = [['LUNAUSDT', '2022-04-01', '2022-05-31'], ['FTTUSDT', '2022-10-15', '2022-11-30'], ['SRMUSDT', '2022-10-15', '2022-12-31'], ['RAYUSDT', '2022-10-15', '2022-11-30'],
  ['WAVESUSDT', '2022-03-25', '2022-07-31'], ['ANCUSDT', '2022-04-01', '2022-05-31'], ['OMUSDT', '2025-04-01', '2025-05-31'], ['1000LUNCUSDT', '2022-09-01', '2023-12-31'],
  ['YFIIUSDT', '2020-09-01', '2020-12-31'], ['ALPACAUSDT', '2025-01-01', '2025-05-31']];
function eventStats(sym, a, b) {
  const S = D.syms[sym]; if (!S) return null; const ia = D.dates.indexOf(a), ib = D.dates.indexOf(b);
  let pk = -1; for (let i = ia; i <= ib; i++) if (!isNaN(S.c[i]) && (pk < 0 || S.c[i] > S.c[pk])) pk = i;
  if (pk < 0) return null; let tr = pk; for (let i = pk; i <= ib; i++) if (!isNaN(S.c[i]) && S.c[i] < S.c[tr]) tr = i;
  return { sym, peakDate: D.dates[pk], peak: S.c[pk], troughDate: D.dates[tr], trough: S.c[tr], decline: 1 - S.c[tr] / S.c[pk] };
}
// automated: every symbol's worst 180-day peak->trough decline >= 80%
const auto = [];
for (const S of syms) {
  let best = null;
  for (let i = S.first; i <= S.last; i++) { if (isNaN(S.c[i])) continue; let mn = i; for (let j = i; j <= Math.min(S.last, i + 180); j++) if (!isNaN(S.c[j]) && S.c[j] < S.c[mn]) mn = j; const d = 1 - S.c[mn] / S.c[i]; if (!best || d > best.d) best = { i, mn, d }; }
  if (best && best.d >= 0.8) auto.push({ sym: S.sym, peakDate: D.dates[best.i], troughDate: D.dates[best.mn], peak: S.c[best.i], trough: S.c[best.mn], decline: best.d });
}
function capture(trades, ev) {
  const T = trades.filter(t => t.sym === ev.sym && t.entryDate >= ev.peakDate && t.entryDate <= ev.troughDate);
  if (!T.length) return { caught: false };
  const cap = T.reduce((a, t) => a + (t.avgPx - t.exitPx) / (ev.peak - ev.trough), 0);
  return { caught: true, trades: T.length, firstEntry: T[0].entryDate, entryDrawdownFromPeak: r4(1 - T[0].entryPx / ev.peak), capturedShareOfDecline: r4(cap), pnlPctEq: r4(T.reduce((a, t) => a + t.pnlPctOfEq, 0)) };
}
const famousEv = FAMOUS.map(f => eventStats(...f)).filter(Boolean);
const CAP = Object.fromEntries(Object.keys(BASE).map(k => [k, baseRuns[k]._r.trades]));
CAP['A_turtle_maxPos30'] = run(D, St.turtle(), { maxPos: 30, grossCap: 2 }).trades;
CAP['B_trend_maxPos20'] = run(D, St.trendB(), { maxPos: 20 }).trades;
CAP['C_crash_maxPos20'] = run(D, St.crashC(), { maxPos: 20 }).trades;
out.collapses.famous = famousEv.map(ev => Object.assign(R(ev), Object.fromEntries(Object.keys(CAP).map(k => [k, capture(CAP[k], ev)]))));
out.collapses.CEL = 'CELUSDT never listed as a Binance USDT-M perpetual (not in Binance Vision futures symbol list) - not shortable on Binance perps';
out.collapses.autoCount = auto.length;
out.collapses.autoCaptureRate = Object.fromEntries(Object.keys(CAP).map(k => { const c = auto.map(ev => capture(CAP[k], ev)); const caught = c.filter(x => x.caught);
  return [k, { events: auto.length, caught: caught.length, medianCapturedShare: r4(median(caught.map(x => x.capturedShareOfDecline))), medianEntryDD: r4(median(caught.map(x => x.entryDrawdownFromPeak))), sumPnlPctEq: r4(caught.reduce((a, x) => a + x.pnlPctEq, 0)) }]; }));
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
for (const k of Object.keys(BASE)) {
  // with larger slot count too
}
// ---- worst trades (squeezes) ----
for (const k of Object.keys(BASE)) {
  const T = [...baseRuns[k]._r.trades].sort((a, b) => a.pnlPctOfEq - b.pnlPctOfEq);
  out.worstTrades[k] = T.slice(0, 10).map(t => ({ sym: t.sym, entry: t.entryDate, exit: t.exitDate, reason: t.reason, units: t.units, priceRet: r4(t.ret), pnlPctEq: r4(t.pnlPctOfEq), mae: r4(t.mae) }));
  out.base[k] = Object.assign({}, baseRuns[k]); delete out.base[k]._r;
  out.base[k].bestTrades = T.slice(-10).reverse().map(t => ({ sym: t.sym, entry: t.entryDate, exit: t.exitDate, reason: t.reason, priceRet: r4(t.ret), pnlPctEq: r4(t.pnlPctOfEq) }));
  out.base[k].openAtEnd = baseRuns[k]._r.open;
  out.base[k].exitReasons = T.reduce((a, t) => (a[t.reason] = (a[t.reason] || 0) + 1, a), {});
}

// ---- files: trade logs, yearly & monthly equity ----
fs.mkdirSync('out', { recursive: true });
for (const k of Object.keys(BASE)) {
  const T = baseRuns[k]._r.trades; const cols = ['sym', 'entryDate', 'exitDate', 'reason', 'units', 'entryPx', 'avgPx', 'exitPx', 'ret', 'pnlPctOfEq', 'funding', 'fees', 'notional0', 'maxNotional', 'days', 'mae', 'peakToEntry', 'entryAge'];
  fs.writeFileSync(`out/trades_${k}.csv`, cols.join(',') + '\n' + T.map(t => cols.map(c => typeof t[c] === 'number' ? +t[c].toPrecision(6) : t[c]).join(',')).join('\n'));
}
const series = Object.assign({}, Object.fromEntries(Object.keys(BASE).map(k => [k, baseRuns[k]._r.eq])), { BTC120_long: btc.eq }, comboEq);
const names = Object.keys(series);
const monthly = ['month,' + names.map(n => `"${n}"`).join(',')]; let lastM = null;
for (let i = 0; i < D.ND; i++) { const m = D.dates[i].slice(0, 7); const nextM = i + 1 < D.ND ? D.dates[i + 1].slice(0, 7) : null; if (m !== nextM) monthly.push(m + ',' + names.map(n => r4(series[n][i])).join(',')); }
fs.writeFileSync('out/equity_monthly.csv', monthly.join('\n'));
const years = Object.keys(yearly(series.A_turtle, D.dates));
fs.writeFileSync('out/returns_yearly.csv', 'year,' + names.map(n => `"${n}"`).join(',') + '\n' + years.map(y => y + ',' + names.map(n => r4(yearly(series[n], D.dates)[y])).join(',')).join('\n'));
fs.writeFileSync('out/auto_collapse_events.json', JSON.stringify(auto.map(R), null, 1));
fs.writeFileSync('results_main.json', JSON.stringify(out, null, 1));
console.log('done');
