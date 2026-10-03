// Kimchi-bot rules applied to RWA spreads. Spread x_t (premium = A/B-1, or ln(A/B)).
// Long-spread entry when x < MA-2σ (MA,σ over previous W obs), exit when x > MA+0.25σ or held >= maxHold hours.
// Execution at NEXT observation. One position. Optional two-sided (mirror short).
import fs from 'fs';
const L = n => JSON.parse(fs.readFileSync(`data/${n}.json`));
const H = 3600e3;
const toMap = a => new Map(a.map(r => [r[0], r[1]]));
export function align(a, b) { const mb = toMap(b); const out = []; for (const r of a) { const v = mb.get(r[0]); if (v != null && r[1] > 0 && v > 0) out.push({ t: r[0], a: r[1], b: v }); } return out; }
export const isTradFiClosed = t => { const d = new Date(t); const wd = d.getUTCDay(), h = d.getUTCHours(); return wd === 6 || (wd === 5 && h >= 21) || (wd === 0 && h < 22); };
export function stats(xs) { const n = xs.length; const m = xs.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); const s = [...xs].sort((a, b) => a - b); const q = p => s[Math.min(n - 1, Math.floor(p * n))]; return { n, meanPct: +(m * 100).toFixed(4), sdPct: +(sd * 100).toFixed(4), p01: +(q(.01) * 100).toFixed(3), p50: +(q(.5) * 100).toFixed(3), p99: +(q(.99) * 100).toFixed(3), minPct: +(s[0] * 100).toFixed(3), maxPct: +(s[n - 1] * 100).toFixed(3) }; }
export function halfLife(xs) { const n = xs.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 1; i < n; i++) { const x = xs[i - 1], y = xs[i] - xs[i - 1]; sx += x; sy += y; sxx += x * x; sxy += x * y; } const k = n - 1; const b = (sxy - sx * sy / k) / (sxx - sx * sx / k); return b < 0 ? +(-Math.log(2) / Math.log(1 + b)).toFixed(1) : null; }
export function bt(rows, { W = 72, k = 2, exitK = 0.25, maxHoldH = 120, rtCost = 0.003, twoSided = false, spreadKind = 'ratio' } = {}) {
  const pnl = (x0, x1, dir) => dir * (spreadKind === 'ratio' ? ((1 + x1) / (1 + x0) - 1) : (x1 - x0));
  const n = rows.length; let pos = 0, ent = null, pending = null; const trades = [];
  const xs = rows.map(r => r.x); const equity = []; let realized = 0;
  for (let i = 0; i < n; i++) {
    if (pending) {
      if (pending.type === 'open') { pos = pending.dir; ent = { i, t: rows[i].t, x: xs[i], sigT: pending.sigT }; }
      else { const g = pnl(ent.x, xs[i], pos); const net = g - rtCost; trades.push({ tIn: ent.t, tOut: rows[i].t, dir: pos, xIn: ent.x, xOut: xs[i], gross: g, net, holdH: (rows[i].t - ent.t) / H, inClosed: isTradFiClosed(ent.sigT), timeout: pending.timeout }); realized += net; pos = 0; ent = null; }
      pending = null;
    }
    equity.push({ t: rows[i].t, eq: realized + (pos ? pnl(ent.x, xs[i], pos) - rtCost : 0) });
    if (i >= W && i < n - 1) {
      let s = 0; for (let j = i - W; j < i; j++) s += xs[j]; const m = s / W; let v = 0; for (let j = i - W; j < i; j++) v += (xs[j] - m) ** 2; const sd = Math.sqrt(v / (W - 1));
      if (sd > 0) {
        if (pos === 0) { if (xs[i] < m - k * sd) pending = { type: 'open', dir: 1, sigT: rows[i].t }; else if (twoSided && xs[i] > m + k * sd) pending = { type: 'open', dir: -1, sigT: rows[i].t }; }
        else { const held = (rows[i].t - ent.t) / H; const hit = (pos === 1 && xs[i] > m + exitK * sd) || (pos === -1 && xs[i] < m - exitK * sd); if (hit || held >= maxHoldH) pending = { type: 'close', timeout: !hit }; }
      }
    }
  }
  return summarize(trades, equity, rows);
}
export function summarize(trades, equity, rows) {
  const years = (rows.at(-1).t - rows[0].t) / (365.25 * 864e5);
  const nt = trades.length; const wins = trades.filter(t => t.net > 0).length; const tot = trades.reduce((a, t) => a + t.net, 0); const totG = trades.reduce((a, t) => a + t.gross, 0);
  const daily = new Map(); for (const e of equity) daily.set(Math.floor(e.t / 864e5), e.eq); const dv = [...daily.values()]; const dr = dv.slice(1).map((v, i) => v - dv[i]);
  const m = dr.reduce((a, b) => a + b, 0) / (dr.length || 1); const sd = Math.sqrt(dr.reduce((a, b) => a + (b - m) ** 2, 0) / ((dr.length - 1) || 1));
  let peak = 0, mdd = 0; for (const v of dv) { peak = Math.max(peak, v); mdd = Math.min(mdd, v - peak); }
  const byYear = {}; for (const t of trades) { const y = new Date(t.tOut).getUTCFullYear(); byYear[y] = byYear[y] || { n: 0, netPct: 0 }; byYear[y].n++; byYear[y].netPct += t.net * 100; }
  for (const y in byYear) byYear[y].netPct = +byYear[y].netPct.toFixed(2);
  const sub = f => { const a = trades.filter(f); return { n: a.length, avgNetPct: a.length ? +(a.reduce((x, t) => x + t.net, 0) / a.length * 100).toFixed(3) : null, win: a.length ? +(a.filter(t => t.net > 0).length / a.length * 100).toFixed(1) : null }; };
  return { period: new Date(rows[0].t).toISOString().slice(0, 10) + '~' + new Date(rows.at(-1).t).toISOString().slice(0, 10), years: +years.toFixed(2), trades: nt, winPct: nt ? +(wins / nt * 100).toFixed(1) : null, avgGrossPct: nt ? +(totG / nt * 100).toFixed(3) : null, avgNetPct: nt ? +(tot / nt * 100).toFixed(3) : null, totalNetPct: +(tot * 100).toFixed(2), annNetPct: +(tot * 100 / years).toFixed(2), sharpe: sd > 0 ? +(m / sd * Math.sqrt(365)).toFixed(2) : null, mddPct: +(mdd * 100).toFixed(2), avgHoldH: nt ? +(trades.reduce((a, t) => a + t.holdH, 0) / nt).toFixed(1) : null, timeoutPct: nt ? +(trades.filter(t => t.timeout).length / nt * 100).toFixed(1) : null, byYear, signalWhenTradFiClosed: sub(t => t.inClosed), signalWhenTradFiOpen: sub(t => !t.inClosed) };
}
export const R = { assumptions: { rule: 'enter long spread when x<MA-2σ (MA/σ over previous W obs), exit when x>MA+0.25σ or hold>=120h; execution at NEXT bar close; one position; twoSided mirrors the short side', costs: { 'cost0.30': '0.30% round trip = spot taker 0.10% + perp taker 0.05% on entry and exit', 'cost0.20': '0.20% RT = perp taker 0.05% x 4', 'cost0.10': '0.10% RT (maker-ish)' }, pnlBase: 'return on notional of one leg; annualized = total net / years (no compounding, no leverage)', funding: 'NOT included in P&L; see funding summary', prices: 'hourly close, no bid/ask or slippage beyond fee', tradfiClosed: 'Fri 21:00 UTC - Sun 22:00 UTC (approx, no holidays/DST)' }, series: {} };
export function run(name, rows, opts = {}, desc = '') {
  if (rows.length < 200) { console.log(name, 'too few rows', rows.length); R.series[name] = { desc, obs: rows.length, note: 'insufficient data' }; return; }
  const xs = rows.map(r => r.x); const closed = rows.filter(r => isTradFiClosed(r.t)).map(r => r.x), open = rows.filter(r => !isTradFiClosed(r.t)).map(r => r.x);
  const out = { desc, obs: rows.length, stats: stats(xs), statsTradFiOpen: open.length > 10 ? stats(open) : null, statsTradFiClosed: closed.length > 10 ? stats(closed) : null, halfLifeObs: halfLife(xs), results: {} };
  const cfgs = opts.cfgs || [['W72_cost0.30', { W: 72, rtCost: 0.003 }], ['W72_cost0.20', { W: 72, rtCost: 0.002 }], ['W72_cost0.10', { W: 72, rtCost: 0.001 }], ['W480_cost0.20', { W: 480, rtCost: 0.002 }], ['W72_cost0.20_twoSided', { W: 72, rtCost: 0.002, twoSided: true }], ['W72_gross', { W: 72, rtCost: 0 }]];
  for (const [k, c] of cfgs) out.results[k] = bt(rows, { ...c, spreadKind: opts.kind || 'ratio' });
  R.series[name] = out;
  console.log('\n' + name, out.obs, 'mean', out.stats.meanPct, 'sd', out.stats.sdPct, 'p01', out.stats.p01, 'p99', out.stats.p99, 'HL', out.halfLifeObs);
  for (const [k, v] of Object.entries(out.results)) console.log('   ', k.padEnd(24), `n${v.trades} win${v.winPct} avgG${v.avgGrossPct} avgN${v.avgNetPct} ann${v.annNetPct} S${v.sharpe} mdd${v.mddPct} hold${v.avgHoldH} TO${v.timeoutPct}`);
}
const MAIN = process.argv[1].endsWith('backtest.mjs');
if (MAIN) {
const prem = (a, b) => align(L(a), L(b)).map(r => ({ t: r.t, x: r.a / r.b - 1 }));
const lsp = (a, b) => align(L(a), L(b)).map(r => ({ t: r.t, x: Math.log(r.a / r.b) }));
// A: tokenized gold vs reference
run('A1_PAXGspot_vs_BNperpXAU', prem('bn_spot_PAXG', 'bn_perp_XAU'), {}, 'Binance PAXG/USDT spot / Binance XAUUSDT TradFi perp - 1');
run('A1b_XAUTspotBybit_vs_BNperpXAU', prem('by_spot_XAUT', 'bn_perp_XAU'), {}, 'Bybit XAUT/USDT spot / Binance XAUUSDT perp - 1');
run('A1c_PAXGperp_vs_XAUperp_BN', prem('bn_perp_PAXG', 'bn_perp_XAU'), {}, 'Binance PAXG perp / XAU perp - 1');
run('A2_PAXGspot_vs_GCF_1h', prem('bn_spot_PAXG', 'yh_GC_1h'), {}, 'Binance PAXG/USDT / COMEX GC=F front (Yahoo 1h) - 1; includes futures carry basis & USDT/USD');
{ const gc = L('yh_GC_1d'); const pm = toMap(L('bn_spot_PAXG')); const rows = []; for (const r of gc) { const d = new Date(r[0]); const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 20); const p = pm.get(t); if (p && r[1]) rows.push({ t, x: p / r[1] - 1 }); }
  run('A3_PAXG_vs_GCF_daily', rows, { cfgs: [['D20_cost0.30', { W: 20, rtCost: 0.003 }], ['D20_cost0.20', { W: 20, rtCost: 0.002 }], ['D20_cost0.20_twoSided', { W: 20, rtCost: 0.002, twoSided: true }], ['D20_gross', { W: 20, rtCost: 0 }]] }, 'PAXG 20:00UTC / GC=F daily close - 1, 2020-08~'); }
run('A4a_PAXG_BN_vs_XAUT_BFX', prem('bn_spot_PAXG', 'bfx_XAUT_UST'), {}, 'Binance PAXG/USDT / Bitfinex XAUT/USDT - 1');
run('A4b_PAXG_BN_vs_XAUT_OKX', prem('bn_spot_PAXG', 'okx_XAUT'), {}, 'Binance PAXG/USDT / OKX XAUT/USDT - 1');
run('A4c_PAXG_BN_vs_XAUT_Bybit', prem('bn_spot_PAXG', 'by_spot_XAUT'), {}, 'Binance PAXG/USDT / Bybit XAUT/USDT - 1');
run('A4d_PAXGperp_vs_XAUTperp_BN', prem('bn_perp_PAXG', 'bn_perp_XAUT'), {}, 'Binance PAXG perp / XAUT perp - 1 (same venue, both shortable)');
run('A4e_PAXGspot_vs_XAUTspot_BN', prem('bn_spot_PAXG', 'bn_spot_XAUT'), {}, 'Binance PAXG spot / XAUT spot - 1');
for (const s of ['TSLA', 'NVDA', 'AAPL']) run(`B1_${s}x_Bybit_vs_${s}`, prem(`by_spot_${s}X`, `yh_${s}_1h`), {}, `Bybit ${s}X/USDT (xStock) / ${s} (Yahoo 1h RTH bars) - 1`);
for (const s of ['TSLA', 'NVDA', 'SPY']) run(`B2_BNperp_${s}_vs_${s}`, prem(`bn_perp_${s}`, `yh_${s}_1h`), {}, `Binance ${s}USDT TradFi perp / ${s} (Yahoo 1h RTH) - 1`);
run('C1_BrentWTI_BNperp', lsp('bn_perp_BZ', 'bn_perp_CL'), { kind: 'log' }, 'ln(Binance BZUSDT / CLUSDT)');
run('C2_BrentWTI_HLxyz', lsp('hl_BRENT', 'hl_CL'), { kind: 'log' }, 'ln(Hyperliquid xyz:BRENTOIL / xyz:CL)');
run('C3_HLGOLD_vs_BNperpXAU', prem('hl_GOLD', 'bn_perp_XAU'), {}, 'Hyperliquid xyz:GOLD / Binance XAUUSDT - 1');
fs.writeFileSync('bt_raw.json', JSON.stringify(R, null, 1));
}
