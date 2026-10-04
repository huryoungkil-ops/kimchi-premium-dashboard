const fs = require('fs'); const { run, buyHold, load } = require('./engine'); const MK = require('./markets');
const S1 = { name: 'S1', type: 'turtle', entryLen: 20, exitLen: 10, skipRule: true, failsafe: 55, addStep: 0.5, maxUnits: 4, share: 0.5 };
const S2 = { name: 'S2', type: 'turtle', entryLen: 55, exitLen: 20, skipRule: false, addStep: 0.5, maxUnits: 4, share: 0.5 };
const MOD = { name: 'MOD', type: 'modern', lookbacks: [20, 55, 100, 200], share: 1 };
const V = {
  'orig_1M': { capital: 1e6, books: [S1, S2] },
  'orig_100k': { capital: 1e5, books: [S1, S2] },
  'orig_50k': { capital: 5e4, books: [S1, S2] },
  'micro_1M': { capital: 1e6, books: [S1, S2], micro: true },
  'micro_100k': { capital: 1e5, books: [S1, S2], micro: true },
  'micro_50k': { capital: 5e4, books: [S1, S2], micro: true },
  'orig_1M_rawNoRollAdj': { capital: 1e6, books: [S1, S2], adjust: false },
  'orig_1M_risk0.25pct': { capital: 1e6, books: [S1, S2], risk: 0.0025 },
  'orig_1M_ddRefHWM': { capital: 1e6, books: [S1, S2], ddRef: 'hwm' },
  'orig_1M_noDDrule': { capital: 1e6, books: [S1, S2], ddRule: false },
  'S2only_1M': { capital: 1e6, books: [{ ...S2, share: 1 }] },
  'S1only_1M': { capital: 1e6, books: [{ ...S1, share: 1 }] },
  'adds1N_1M': { capital: 1e6, books: [{ ...S1, addStep: 1 }, { ...S2, addStep: 1 }] },
  'modern_1M': { capital: 1e6, books: [MOD] },
  'modern_1M_risk0.25pct': { capital: 1e6, books: [MOD], risk: 0.0025 },
  'modern_100k_micro': { capital: 1e5, books: [MOD], micro: true },
  'modern_50k_micro': { capital: 5e4, books: [MOD], micro: true },
};
const BLOCKS = [['2001', '2004'], ['2005', '2009'], ['2010', '2014'], ['2015', '2019'], ['2020', '2026']];
function metrics(curve) {
  const r = []; for (let i = 1; i < curve.length; i++) r.push(curve[i][1] / curve[i - 1][1] - 1);
  const yrs = (Date.parse(curve.at(-1)[0]) - Date.parse(curve[0][0])) / 864e5 / 365.25;
  const cagr = curve.at(-1)[1] <= 0 ? -1 : Math.pow(curve.at(-1)[1] / curve[0][1], 1 / yrs) - 1;
  const m = r.reduce((a, b) => a + b, 0) / r.length; const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  let pk = curve[0][1], pkD = curve[0][0], mdd = 0, longest = 0, lStart = null, lEnd = null;
  for (const [d, e] of curve) { if (e >= pk) { const len = (Date.parse(d) - Date.parse(pkD)) / 864e5; if (len > longest) { longest = len; lStart = pkD; lEnd = d; } pk = e; pkD = d; } mdd = Math.min(mdd, e / pk - 1); }
  const tail = (Date.parse(curve.at(-1)[0]) - Date.parse(pkD)) / 864e5; if (tail > longest) { longest = tail; lStart = pkD; lEnd = 'ongoing'; }
  return { start: curve[0][0], end: curve.at(-1)[0], final: +curve.at(-1)[1].toFixed(0), cagr: +(cagr * 100).toFixed(2), vol: +(sd * Math.sqrt(252) * 100).toFixed(2), sharpe: +(m / sd * Math.sqrt(252)).toFixed(2), mdd: +(mdd * 100).toFixed(1), longestDD_days: Math.round(longest), longestDD: [lStart, lEnd] };
}
function yearly(curve) { const out = {}; let prev = curve[0][1]; let cur = null, last = null;
  for (const [d, e] of curve) { const y = d.slice(0, 4); if (cur && y !== cur) { out[cur] = +((last / prev - 1) * 100).toFixed(1); prev = last; } cur = y; last = e; }
  out[cur + (cur === '2026' ? '_YTD' : '')] = +((last / prev - 1) * 100).toFixed(1); return out; }
function blocks(curve) { const o = {}; for (const [a, b] of BLOCKS) { const seg = curve.filter(([d]) => d.slice(0, 4) >= a && d.slice(0, 4) <= b);
  const base = curve.filter(([d]) => d.slice(0, 4) < a).at(-1) || seg[0]; const s2 = [base, ...seg.filter(x => x !== base)]; const mm = metrics(s2);
  o[`${a}-${b.slice(2)}`] = { cagr: mm.cagr, vol: mm.vol, sharpe: mm.sharpe, mdd: mm.mdd }; } return o; }
function monthly(curve) { const o = {}; for (const [d, e] of curve) o[d.slice(0, 7)] = e; return o; }
function tradeStats(tr) { const t = tr.filter(x => x.pnl !== undefined); if (!t.length) return { trades: tr.length };
  const w = t.filter(x => x.pnl > 0), l = t.filter(x => x.pnl <= 0); const avg = a => a.reduce((s, x) => s + x.pnl, 0) / (a.length || 1);
  const byM = {}; for (const x of t) byM[x.m] = (byM[x.m] || 0) + x.pnl;
  return { trades: t.length, winRate: +(w.length / t.length * 100).toFixed(1), avgWin: Math.round(avg(w)), avgLoss: Math.round(avg(l)), winLossRatio: +(avg(w) / -avg(l)).toFixed(2), pnlByMarket: Object.fromEntries(Object.entries(byM).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)])) }; }

const res = { generated: new Date().toISOString(), variants: {} }; const curves = {};
for (const [k, cfg] of Object.entries(V)) {
  const t0 = Date.now(); const R = run(cfg); curves[k] = R.curve;
  const st = R.stats; const sig = st.entrySignals;
  res.variants[k] = { config: { ...cfg, books: cfg.books.map(b => b.name + (b.addStep === 1 ? '(1N adds)' : '') + (b.share ? `@${b.share}` : '')) }, metrics: metrics(R.curve), blocks: blocks(R.curve), yearly: yearly(R.curve), tradeStats: tradeStats(R.trades),
    granularity: { entrySignals: sig, entriesTaken: st.entryTaken, entrySkippedOneContractTooBig: st.entryGranSkip, pctSkipped: sig ? +(st.entryGranSkip / sig * 100).toFixed(1) : null, addsTaken: st.addsTaken, addsSkippedGranularity: st.addGranSkip, limitSkips: st.limitSkip, s1LastWinnerSkips: st.s1Skips, skippedByMarket: st.granByMkt },
    costs: { total: Math.round(st.costs), roll: Math.round(st.rollCost) } };
  if (k === 'orig_1M') res.rollsDetected = R.rolls;
  console.log(k, JSON.stringify(res.variants[k].metrics), 'trades', res.variants[k].tradeStats.trades, 'skip%', res.variants[k].granularity.pctSkipped, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
for (const [nm, adj] of [['ES_buyhold', true], ['NQ_buyhold', true]]) { const c = buyHold(nm.slice(0, 2), adj); curves[nm] = c; res.variants[nm] = { metrics: metrics(c), blocks: blocks(c), yearly: yearly(c), note: 'futures excess return (roll-adjusted, no T-bill income)' }; console.log(nm, JSON.stringify(res.variants[nm].metrics)); }
fs.writeFileSync('results.json', JSON.stringify(res, null, 1));
const keys = Object.keys(curves); const yrs = [...new Set(Object.values(res.variants).flatMap(v => Object.keys(v.yearly)))].sort();
fs.writeFileSync('yearly_returns.csv', ['year,' + keys.join(','), ...yrs.map(y => y + ',' + keys.map(k => res.variants[k].yearly[y] ?? '').join(','))].join('\n'));
const ms = keys.map(k => monthly(curves[k])); const mons = [...new Set(ms.flatMap(Object.keys))].sort();
fs.writeFileSync('monthly_equity.csv', ['month,' + keys.join(','), ...mons.map(m => m + ',' + ms.map((x, j) => x[m] !== undefined ? (keys[j].includes('buyhold') ? (x[m] * 1e6).toFixed(0) : x[m].toFixed(0)) : '').join(','))].join('\n'));
