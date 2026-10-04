'use strict';
const fs = require('fs');
const E = require('./engine');
const DAY = 864e5;
const dayOf = s => Math.floor(Date.parse(s) / DAY);
const LB = [10, 20, 40, 50, 55, 100];

function loadSet(dir, syms, fundDir) {
  const out = [];
  for (const s of syms) {
    const fn = `${dir}/${s}.json`; if (!fs.existsSync(fn)) continue;
    const rows = JSON.parse(fs.readFileSync(fn)); if (rows.length < 24 * 80) continue;
    const fund = fundDir && fs.existsSync(`${fundDir}/${s}.json`) ? JSON.parse(fs.readFileSync(`${fundDir}/${s}.json`)) : null;
    const m = E.buildMarket(s, rows, fund); E.indicators(m, LB); out.push(m);
  }
  return out;
}

// universe from a {date: [syms]} map (selection dates); returns fn(day)->Set
function universeFromRank(rank, topN) {
  const keys = Object.keys(rank).sort().map(k => [dayOf(k), new Set(rank[k].slice(0, topN))]);
  const cache = new Map();
  return D => { let cur = new Set(); for (const [d, s] of keys) { if (d <= D) cur = s; else break; } return cur; };
}

// ---------- metrics ----------
function metrics(eq, trades, from, to) {
  const rows = eq.filter(r => r.date >= from && r.date <= to);
  if (rows.length < 2) return null;
  const startIdx = eq.indexOf(rows[0]);
  const base = startIdx > 0 ? eq[startIdx - 1].eq : rows[0].eq;
  const vals = rows.map(r => r.eq);
  const rets = []; let prev = base;
  for (const v of vals) { rets.push(v / prev - 1); prev = v; }
  const yrs = rows.length / 365.25;
  const tot = vals[vals.length - 1] / base;
  const cagr = Math.pow(tot, 1 / yrs) - 1;
  const mu = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / (rets.length - 1));
  const dd = Math.sqrt(rets.reduce((a, b) => a + Math.min(b, 0) ** 2, 0) / rets.length);
  let peak = base, mdd = 0, ddStart = 0, longest = 0, curStart = -1;
  vals.forEach((v, i) => {
    if (v >= peak) { if (curStart >= 0) longest = Math.max(longest, i - curStart); peak = v; curStart = -1; }
    else { if (curStart < 0) curStart = i; mdd = Math.min(mdd, v / peak - 1); }
  });
  if (curStart >= 0) longest = Math.max(longest, vals.length - curStart);
  // costs (fraction of equity, annualised)
  let cost = 0, fund = 0, pe = base, pf = startIdx > 0 ? eq[startIdx - 1] : { cFee: 0, cSlip: 0, cFund: 0 };
  for (const r of rows) { cost += ((r.cFee - pf.cFee) + (r.cSlip - pf.cSlip)) / pe; fund += (r.cFund - pf.cFund) / pe; pe = r.eq; pf = r; }
  const T = trades.filter(t => t.exitT.slice(0, 10) >= from && t.exitT.slice(0, 10) <= to);
  const wins = T.filter(t => t.net > 0), losses = T.filter(t => t.net <= 0);
  const sumW = wins.reduce((a, t) => a + t.net, 0), sumL = -losses.reduce((a, t) => a + t.net, 0);
  const netAll = sumW - sumL;
  const top10 = T.slice().sort((a, b) => b.net - a.net).slice(0, 10).reduce((a, t) => a + t.net, 0);
  const avgWR = wins.length ? wins.reduce((a, t) => a + t.R, 0) / wins.length : 0;
  const avgLR = losses.length ? losses.reduce((a, t) => a + t.R, 0) / losses.length : 0;
  return {
    from: rows[0].date, to: rows[rows.length - 1].date, totalReturn: tot - 1, cagr, vol: sd * Math.sqrt(365), sharpe: sd > 0 ? mu / sd * Math.sqrt(365) : 0, sortino: dd > 0 ? mu / dd * Math.sqrt(365) : 0,
    mdd, longestDDdays: longest, trades: T.length, winRate: T.length ? wins.length / T.length : 0, avgWinR: avgWR, avgLossR: avgLR, payoff: avgLR ? avgWR / -avgLR : 0,
    profitFactor: sumL > 0 ? sumW / sumL : null, top10Share: netAll !== 0 ? top10 / netAll : null,
    exposure: rows.filter(r => r.units > 0).length / rows.length, avgGross: rows.reduce((a, r) => a + r.gross, 0) / rows.length, maxGross: Math.max(...rows.map(r => r.gross)),
    costDragAnn: cost / yrs, fundingDragAnn: fund / yrs,
  };
}

function yearly(eq) {
  const out = {}; let prev = null, prevY = null;
  for (const r of eq) { const y = r.date.slice(0, 4); if (y !== prevY) { if (prevY) out[prevY].end = prev; out[y] = { start: prev === null ? r.eq : prev }; prevY = y; } prev = r.eq; }
  out[prevY].end = prev;
  const res = {}; for (const y in out) res[y] = out[y].end / out[y].start - 1; return res;
}
function monthly(eq) { const out = []; for (let i = 0; i < eq.length; i++) { const r = eq[i]; if (i === eq.length - 1 || eq[i + 1].date.slice(0, 7) !== r.date.slice(0, 7)) out.push([r.date.slice(0, 7), r.eq]); } return out; }

// combine sub-accounts (sum equity by day)
function combine(results) {
  const eq = results[0].eq.map((r, i) => {
    const o = { D: r.D, date: r.date, eq: 0, gross: 0, units: 0, cFee: 0, cSlip: 0, cFund: 0 };
    let g = 0;
    for (const R of results) { const x = R.eq[i]; o.eq += x.eq; g += x.gross * x.eq; o.units += x.units; o.cFee += x.cFee; o.cSlip += x.cSlip; o.cFund += x.cFund; }
    o.gross = g / o.eq; return o;
  });
  const trades = [].concat(...results.map(r => r.trades));
  const stats = {}; for (const R of results) for (const k in R.stats) { const v = R.stats[k]; if (typeof v === 'number') stats[k] = (stats[k] || 0) + v; else { stats[k] = stats[k] || {}; for (const j in v) stats[k][j] = (stats[k][j] || 0) + v[j]; } }
  stats.maxGross = Math.max(...eq.map(r => r.gross));
  return { eq, trades, stats };
}

// benchmarks from a daily close series [[date, close]]
function bench(closes, from, to, fee) {
  const idx = closes.findIndex(r => r[0] >= from);
  const bh = [], ma = []; let e1 = 1, e2 = 1, inPos = false, cum = 0;
  for (let i = idx; i < closes.length && closes[i][0] <= to; i++) {
    const r = closes[i][1] / closes[i - 1][1] - 1;
    // signal from close of i-1 vs SMA120 of closes i-120..i-1, executed at close i-1
    let s = 0; for (let k = i - 120; k < i; k++) s += closes[k][1]; const sma = s / 120;
    const want = closes[i - 1][1] > sma;
    if (want !== inPos) { e2 *= (1 - fee); inPos = want; }
    if (i === idx) e1 *= (1 - fee);
    e1 *= 1 + r; if (inPos) e2 *= 1 + r;
    bh.push({ date: closes[i][0], eq: e1, units: 1, gross: 1, cFee: 0, cSlip: 0, cFund: 0 }); ma.push({ date: closes[i][0], eq: e2, units: inPos ? 1 : 0, gross: inPos ? 1 : 0, cFee: 0, cSlip: 0, cFund: 0 });
  }
  return { bh, ma };
}
function btcFilterArr(closes) { // per global day D: +1 if BTC close(D-1) > SMA120 (through D-1), else -1
  const arr = {}; for (let i = 121; i < closes.length; i++) { let s = 0; for (let k = i - 120; k < i; k++) s += closes[k][1]; arr[dayOf(closes[i][0])] = closes[i - 1][1] > s / 120 ? 1 : -1; } return arr;
}

module.exports = { loadSet, universeFromRank, metrics, yearly, monthly, combine, bench, btcFilterArr, dayOf, LB };
