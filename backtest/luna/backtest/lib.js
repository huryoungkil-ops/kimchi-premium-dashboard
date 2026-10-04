// Data loading + indicators + portfolio engine for "제2의 루나를 찾아라" short backtest
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const DAY = 86400000;
const iso = t => new Date(t).toISOString().slice(0, 10);

// Non-crypto / index / stable contracts excluded from the short universe
const EXCLUDE = new Set(['USDCUSDT', 'BUSDUSDT', 'TUSDUSDT', 'FDUSDUSDT', 'USDPUSDT', 'USD1USDT', 'DAIUSDT', 'PAXUSDT', 'USTUSDT',
  'DEFIUSDT', 'BTCDOMUSDT', 'FOOTBALLUSDT', 'BLUEBIRDUSDT', 'XAUUSDT', 'XAGUSDT', 'EURUSDT', 'GBPUSDT', 'AUDUSDT', 'JPYUSDT',
  'PAXGUSDT', 'XAUTUSDT']);

function loadAll() {
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'data/meta.json')));
  const files = fs.readdirSync(path.join(DIR, 'data/k')).filter(f => f.endsWith('.json'));
  const T0 = Date.parse('2019-09-08'), T1 = Date.parse('2026-10-04');
  const ND = Math.round((T1 - T0) / DAY) + 1;
  const dates = Array.from({ length: ND }, (_, i) => iso(T0 + i * DAY));
  const syms = {};
  const coverage = { files: files.length, withBars: 0, api: 0, vision: 0, none: [], excluded: [] };
  for (const f of files) {
    const sym = f.replace('.json', '');
    const J = JSON.parse(fs.readFileSync(path.join(DIR, 'data/k', f)));
    if (!J.k.length) { coverage.none.push(sym); continue; }
    if (EXCLUDE.has(sym)) { coverage.excluded.push(sym); continue; }
    // arrays aligned to calendar; bars with zero quote volume are treated as non-trading (NaN)
    const o = new Float64Array(ND).fill(NaN), h = new Float64Array(ND).fill(NaN), l = new Float64Array(ND).fill(NaN),
      c = new Float64Array(ND).fill(NaN), v = new Float64Array(ND).fill(NaN);
    let first = -1, last = -1, n = 0;
    for (const b of J.k) {
      const i = Math.round((b[0] - T0) / DAY);
      if (i < 0 || i >= ND) continue;
      if (!(b[5] > 0)) continue;
      o[i] = b[1]; h[i] = b[2]; l[i] = b[3]; c[i] = b[4]; v[i] = b[5];
      if (first < 0) first = i; last = i; n++;
    }
    if (n < 2) { coverage.none.push(sym); continue; }
    coverage.withBars++; coverage[J.src]++;
    // funding: per day sum excluding 00:00 event (fdMid) and 00:00 event (fd0); lastRate per day
    const fd0 = new Float64Array(ND), fdMid = new Float64Array(ND), fLast = new Float64Array(ND).fill(NaN);
    let hasF = false;
    const ff = path.join(DIR, 'data/f', f);
    if (fs.existsSync(ff)) {
      const F = JSON.parse(fs.readFileSync(ff));
      let prevT = null;
      for (const [t, r] of F) {
        const dtH = prevT ? Math.min(8, Math.max(1, Math.round((t - prevT) / 3600000))) : 8; prevT = t;
        const i = Math.floor((t - T0) / DAY); if (i < 0 || i >= ND) continue;
        const intra = t - (T0 + i * DAY);
        if (intra < 60000) fd0[i] += r; else fdMid[i] += r;
        fLast[i] = r * 8 / dtH; hasF = true; // normalised to 8h-equivalent
      }
      // forward fill last funding
      for (let i = 1; i < ND; i++) if (isNaN(fLast[i])) fLast[i] = fLast[i - 1];
    }
    syms[sym] = { sym, o, h, l, c, v, first, last, fd0, fdMid, fLast, hasF, src: J.src, meta: meta[sym] || null };
  }
  return { dates, ND, syms, coverage, T0 };
}

// ---------- indicators ----------
function atr(S, n = 20) { // Wilder ATR on available bars (gaps skipped)
  const { h, l, c } = S; const ND = c.length; const N = new Float64Array(ND).fill(NaN);
  let prevC = NaN, a = NaN, k = 0, sum = 0;
  for (let i = 0; i < ND; i++) {
    if (isNaN(c[i])) continue;
    const tr = isNaN(prevC) ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - prevC), Math.abs(l[i] - prevC));
    if (k < n) { sum += tr; k++; if (k === n) a = sum / n; }
    else a = (a * (n - 1) + tr) / n;
    N[i] = a; prevC = c[i];
  }
  return N;
}
// rolling over *available bars* (count-based) for arrays with NaN gaps
function rollBars(arr, n, fn, valid) {
  const ND = arr.length, out = new Float64Array(ND).fill(NaN); const buf = [];
  for (let i = 0; i < ND; i++) {
    if (isNaN(valid[i])) continue;
    buf.push(arr[i]); if (buf.length > n) buf.shift();
    if (buf.length === n) out[i] = fn(buf);
  }
  return out;
}
const fMean = b => { let s = 0; for (const x of b) s += x; return s / b.length; };
const fMin = b => { let m = Infinity; for (const x of b) if (x < m) m = x; return m; };
const fMax = b => { let m = -Infinity; for (const x of b) if (x > m) m = x; return m; };
// value of indicator at previous available bar (for "prior n-day low/high" excluding today)
function prevBar(arr, valid) {
  const out = new Float64Array(arr.length).fill(NaN); let p = NaN;
  for (let i = 0; i < arr.length; i++) { if (isNaN(valid[i])) continue; out[i] = p; p = arr[i]; }
  return out;
}
const cache = new Map();
function ind(S, key, f) { const k = S.sym + '|' + key; if (!cache.has(k)) cache.set(k, f()); return cache.get(k); }
function I(S, name, n) {
  switch (name) {
    case 'N': return ind(S, 'N' + n, () => atr(S, n));
    case 'MA': return ind(S, 'MA' + n, () => rollBars(S.c, n, fMean, S.c));
    case 'LL': return ind(S, 'LL' + n, () => prevBar(rollBars(S.l, n, fMin, S.c), S.c)); // prior n-bar low (excl today)
    case 'HH': return ind(S, 'HH' + n, () => prevBar(rollBars(S.h, n, fMax, S.c), S.c)); // prior n-bar high (excl today)
    case 'HHin': return ind(S, 'HHin' + n, () => rollBars(S.h, n, fMax, S.c)); // n-bar high incl today
    case 'ADV': return ind(S, 'ADV' + n, () => rollBars(S.v, n, fMean, S.c));
    case 'VMAprev': return ind(S, 'VMAp' + n, () => prevBar(rollBars(S.v, n, fMean, S.c), S.c));
    case 'NMAprev': return ind(S, 'NMAp' + n, () => prevBar(rollBars(I(S, 'N', 20), n, fMean, S.c), S.c));
    case 'AGE': return ind(S, 'AGE', () => { const a = new Float64Array(S.c.length).fill(NaN); let k = 0; for (let i = 0; i < a.length; i++) if (!isNaN(S.c[i])) a[i] = ++k; return a; });
    case 'RET': return ind(S, 'RET' + n, () => { const a = new Float64Array(S.c.length).fill(NaN); for (let i = n; i < a.length; i++) if (S.c[i] > 0 && S.c[i - n] > 0) a[i] = S.c[i] / S.c[i - n] - 1; return a; });
  }
}

// slippage per side by 20d average quote volume (USDT)
function slip(adv) {
  if (!(adv > 0)) return 0.005;
  if (adv >= 500e6) return 0.0005;
  if (adv >= 100e6) return 0.001;
  if (adv >= 20e6) return 0.002;
  if (adv >= 5e6) return 0.0035;
  return 0.005;
}
const FEE = 0.0005;

// next available bar index after i (within 3 days), else -1 (=> delisting/gap)
function nextBar(S, i) { for (let j = i + 1; j <= i + 1 && j < S.c.length; j++) if (!isNaN(S.c[j])) return j; return -1; }

/*
 Portfolio engine. strategy = {
   name, entrySignal(S,i,ctx)-> null | {score, stopN, N}, exitSignal(S,i,pos,ctx)->bool, addSignal(S,i,pos)->bool,
   maxUnits, riskPerUnit, stopMult (null=no hard stop), maxHold (days|null), rebalance (weekly fn) ...
 }
 opts = {maxPos, grossCap, lev (null|1|2|3), mmr, unitCap (max notional per unit / equity), excludeBTCETH, startIdx, fundingOn}
*/
function run(D, strat, opts) {
  const o = Object.assign({ maxPos: 10, grossCap: 1.5, lev: null, mmr: 0.01, unitCap: 0.25, excludeBTCETH: true, fundingOn: true, stopSlipMult: 2 }, opts || {});
  const { ND, dates, syms } = D;
  const list = Object.values(syms).filter(S => !(o.excludeBTCETH && (S.sym === 'BTCUSDT' || S.sym === 'ETHUSDT')));
  let cash = 1;           // equity units (start 1.0)
  const pos = new Map();  // sym -> position
  const trades = [];
  const eq = new Float64Array(ND).fill(NaN);
  let pending = [];       // orders to execute at next open: {type:'entry'|'add'|'exit', sym, ...}
  let fundingTot = 0, feeTot = 0, slipTot = 0, liqCount = 0, delistCount = 0;
  const gross = new Float64Array(ND), npos = new Int16Array(ND);
  const ctx = { D, o, pos, strat };

  function liquidate(p, i, liq) {
    // isolated margin lost entirely (margin = notional/lev at avg entry); position closed
    const loss = p.qty * p.avg / o.lev; cash -= loss;
    const pnl = -loss - p.entryFees + p.funding;
    trades.push({ sym: p.sym, entryDate: dates[p.entryIdx], exitDate: dates[i], entryPx: p.firstPx, avgPx: p.avg, exitPx: liq, units: p.units, notional0: p.notional0, maxNotional: p.maxNotional,
      pnl, pnlPctOfEq: pnl / p.eqAtEntry, funding: p.funding, fees: p.entryFees, ret: -1 / o.lev, reason: 'LIQUIDATED', days: i - p.entryIdx, mae: (syms[p.sym].h[i] - p.avg) / p.avg, peakToEntry: p.peakToEntry, entryAge: p.entryAge });
    pos.delete(p.sym); liqCount++;
  }

  function unreal(i) { let u = 0; for (const p of pos.values()) { const S = syms[p.sym]; const px = isNaN(S.c[i]) ? p.lastPx : S.c[i]; u += p.qty * (p.avg - px); } return u; }
  function closePos(p, i, px, reason, slipRate) {
    const S = syms[p.sym]; const fill = px * (1 + slipRate); // buy back higher
    const pnlGross = p.qty * (p.avg - fill);
    const fee = p.qty * fill * FEE;
    cash += pnlGross - fee; feeTot += fee; slipTot += p.qty * px * slipRate;
    p.realFees += fee;
    const pnl = pnlGross - fee - p.entryFees + p.funding; // net trade pnl incl entry fees & funding (equity units)
    trades.push({ sym: p.sym, entryDate: dates[p.entryIdx], exitDate: dates[i], entryPx: p.firstPx, avgPx: p.avg, exitPx: fill, units: p.units,
      notional0: p.notional0, maxNotional: p.maxNotional, pnl, pnlPctOfEq: pnl / p.eqAtEntry, funding: p.funding, fees: p.entryFees + fee,
      ret: (p.avg - fill) / p.avg, reason, days: i - p.entryIdx, mae: (p.maxHigh - p.avg) / p.avg, peakToEntry: p.peakToEntry, entryAge: p.entryAge });
    pos.delete(p.sym);
  }
  for (let i = 0; i < ND; i++) {
    // 0) delisting/gap: positions whose symbol has no bar today -> closed at last available close
    for (const p of [...pos.values()]) {
      const S = syms[p.sym];
      if (isNaN(S.c[i])) { closePos(p, p.lastIdx, p.lastPx, 'delist/gap@lastClose', 0.005); delistCount++; }
    }
    // 1) execute pending orders at open
    const exitsFirst = pending.filter(x => x.type === 'exit'); const rest = pending.filter(x => x.type !== 'exit'); pending = [];
    for (const od of exitsFirst) { const p = pos.get(od.sym); if (!p) continue; const S = syms[od.sym]; if (isNaN(S.o[i])) continue; closePos(p, i, S.o[i], od.reason, slip(I(S, 'ADV', 20)[i - 1])); }
    let eqOpen = cash + unreal(i - 1 < 0 ? 0 : i - 1);
    for (const od of rest) {
      const S = syms[od.sym]; if (isNaN(S.o[i])) continue;
      const sr = slip(I(S, 'ADV', 20)[i - 1]);
      const fill = S.o[i] * (1 - sr); // sell lower
      // gross cap check
      let g = 0; for (const p of pos.values()) { const SS = syms[p.sym]; g += p.qty * (isNaN(SS.o[i]) ? p.lastPx : SS.o[i]); }
      let notional = od.notional; const room = o.grossCap * eqOpen - g;
      if (room < notional) { if (room < 0.25 * od.notional) continue; notional = room; }
      if (od.type === 'entry') { if (pos.has(od.sym) || pos.size >= o.maxPos) continue; }
      const qty = notional / fill; const fee = qty * fill * FEE; cash -= fee; feeTot += fee; slipTot += qty * S.o[i] * sr;
      if (od.type === 'entry') {
        pos.set(od.sym, { sym: od.sym, qty, avg: fill, firstPx: fill, lastFill: fill, units: 1, N: od.N, stop: od.stopMult ? fill + od.stopMult * od.N : null,
          stopMult: od.stopMult, entryIdx: i, entryFees: fee, realFees: 0, funding: 0, notional0: notional / eqOpen, maxNotional: notional / eqOpen, eqAtEntry: eqOpen,
          maxHigh: S.h[i], lastPx: S.c[i], lastIdx: i, peakToEntry: od.peakToEntry, entryAge: od.age });
      } else { // add unit
        const p = pos.get(od.sym); if (!p) continue;
        p.avg = (p.avg * p.qty + fill * qty) / (p.qty + qty); p.qty += qty; p.units++; p.lastFill = fill; p.entryFees += fee;
        if (p.stopMult) p.stop = fill + p.stopMult * p.N; // turtle: all units' stop moved to last fill + 2N
        p.maxNotional = Math.max(p.maxNotional, p.qty * fill / eqOpen);
      }
    }
    // 2) intraday: stops & liquidation
    for (const p of [...pos.values()]) {
      const S = syms[p.sym]; if (isNaN(S.h[i])) continue;
      const liq = o.lev ? p.avg * (1 + 1 / o.lev - o.mmr) : Infinity;
      const sr = slip(I(S, 'ADV', 20)[i - 1]) * o.stopSlipMult;
      if (S.o[i] >= liq) { liquidate(p, i, liq); continue; }
      if (p.stop != null && S.h[i] >= p.stop && p.stop < liq) {
        const px = Math.max(S.o[i], p.stop);
        // funding for 00:00 event already charged before the stop
        if (o.fundingOn && p.entryIdx !== i) { const f = p.qty * S.o[i] * S.fd0[i]; p.funding += f; cash += f; fundingTot += f; }
        p.maxHigh = Math.max(p.maxHigh, px);
        closePos(p, i, px, S.o[i] >= p.stop ? 'stop(gap)' : 'stop', sr); continue;
      }
      if (S.h[i] >= liq) { liquidate(p, i, liq); continue; }
      p.maxHigh = Math.max(p.maxHigh, S.h[i]);
    }
    // 3) funding for the day (shorts receive positive funding)
    if (o.fundingOn) for (const p of pos.values()) {
      const S = syms[p.sym]; const px = S.c[i];
      const rate = (p.entryIdx === i ? 0 : S.fd0[i]) + S.fdMid[i];
      const f = p.qty * px * rate; p.funding += f; cash += f; fundingTot += f;
    }
    // 4) mark to market
    for (const p of pos.values()) { const S = syms[p.sym]; p.lastPx = S.c[i]; p.lastIdx = i; }
    const E = cash + unreal(i); eq[i] = E;
    let g = 0; for (const p of pos.values()) g += p.qty * p.lastPx; gross[i] = g / E; npos[i] = pos.size;
    if (E <= 0) { for (let k = i + 1; k < ND; k++) eq[k] = 0; break; }
    if (i === ND - 1) break;
    // 5) signals at close
    for (const p of pos.values()) {
      const S = syms[p.sym];
      if (nextBar(S, i) < 0) continue; // will be closed as delist next day
      const held = i - p.entryIdx + 1;
      if (strat.exitSignal(S, i, p, ctx) || (strat.maxHold && held >= strat.maxHold)) { pending.push({ type: 'exit', sym: p.sym, reason: strat.maxHold && held >= strat.maxHold ? 'timeStop' : 'exitSignal' }); continue; }
      if (strat.addSignal && p.units < (strat.maxUnits || 1) && strat.addSignal(S, i, p)) {
        const N = p.N; const notional = Math.min(E * strat.riskPerUnit / ((strat.sizeStopMult || 2) * N / S.c[i]), o.unitCap * E);
        pending.push({ type: 'add', sym: p.sym, notional });
      }
    }
    let cands = [];
    if (strat.rebalance) { const rb = strat.rebalance(i, list, ctx); if (rb) { for (const s of rb.exits) if (pos.has(s)) pending.push({ type: 'exit', sym: s, reason: 'rebalance' }); cands = rb.entries; } }
    else for (const S of list) {
      if (pos.has(S.sym) || isNaN(S.c[i]) || nextBar(S, i) < 0) continue;
      const sg = strat.entrySignal(S, i, ctx); if (sg) cands.push(sg);
    }
    const slots = o.maxPos - pos.size + pending.filter(x => x.type === 'exit').length;
    cands.sort((a, b) => a.score - b.score);
    for (const sg of cands.slice(0, Math.max(0, slots))) {
      const S = syms[sg.sym]; const N = sg.N;
      const notional = Math.min(E * strat.riskPerUnit / ((strat.sizeStopMult || 2) * N / S.c[i]), o.unitCap * E);
      pending.push({ type: 'entry', sym: sg.sym, notional, N, stopMult: strat.stopMult, peakToEntry: sg.peakToEntry, age: I(S, 'AGE')[i] });
    }
  }
  // close open positions at last mark (report as open)
  const open = [...pos.values()].map(p => ({ sym: p.sym, entryDate: dates[p.entryIdx], avg: p.avg, last: p.lastPx }));
  return { eq, trades, open, fundingTot, feeTot, slipTot, liqCount, delistCount, gross, npos };
}

// ---------- metrics ----------
function metrics(eq, dates, from, to, trades) {
  let i0 = dates.findIndex(d => d >= from), i1 = dates.length - 1; while (i1 > 0 && dates[i1] > to) i1--;
  while (i0 < i1 && isNaN(eq[i0])) i0++;
  const e = Array.from(eq.slice(i0, i1 + 1));
  const r = []; for (let k = 1; k < e.length; k++) r.push(e[k - 1] > 0 ? e[k] / e[k - 1] - 1 : 0);
  const yrs = r.length / 365; const tot = e.at(-1) / e[0];
  const cagr = tot > 0 ? Math.pow(tot, 1 / yrs) - 1 : -1;
  const m = r.reduce((a, b) => a + b, 0) / r.length; const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length);
  const dn = Math.sqrt(r.reduce((a, b) => a + Math.min(0, b) ** 2, 0) / r.length);
  let pk = e[0], mdd = 0, ddStart = 0, longest = 0, curStart = 0;
  for (let k = 0; k < e.length; k++) { if (e[k] >= pk) { pk = e[k]; longest = Math.max(longest, k - curStart); curStart = k; } else mdd = Math.min(mdd, e[k] / pk - 1); }
  longest = Math.max(longest, e.length - 1 - curStart);
  const out = { from: dates[i0], to: dates[i1], totalRet: tot - 1, cagr, vol: sd * Math.sqrt(365), sharpe: sd > 0 ? m / sd * Math.sqrt(365) : 0, sortino: dn > 0 ? m / dn * Math.sqrt(365) : 0, mdd, longestDDdays: longest };
  if (trades) {
    const T = trades.filter(t => t.exitDate >= dates[i0] && t.exitDate <= dates[i1]);
    const w = T.filter(t => t.pnl > 0), L = T.filter(t => t.pnl <= 0);
    const gw = w.reduce((a, t) => a + t.pnlPctOfEq, 0), gl = -L.reduce((a, t) => a + t.pnlPctOfEq, 0);
    const sorted = [...T].sort((a, b) => b.pnlPctOfEq - a.pnlPctOfEq); const net = T.reduce((a, t) => a + t.pnlPctOfEq, 0);
    Object.assign(out, { trades: T.length, winRate: T.length ? w.length / T.length : 0, payoff: (w.length && L.length) ? (gw / w.length) / (gl / L.length) : null,
      profitFactor: gl > 0 ? gw / gl : null, top10Share: net !== 0 ? sorted.slice(0, 10).reduce((a, t) => a + t.pnlPctOfEq, 0) / net : null,
      netPnlPctSum: net, avgDays: T.length ? T.reduce((a, t) => a + t.days, 0) / T.length : 0 });
  }
  return out;
}
function yearly(eq, dates) {
  const out = {}; let prev = null, py = null;
  for (let i = 0; i < dates.length; i++) { if (isNaN(eq[i])) continue; const y = dates[i].slice(0, 4); if (py === null) { py = y; prev = eq[i]; } if (y !== py) { out[py] = out[py] ?? null; } }
  const byY = {}; for (let i = 0; i < dates.length; i++) if (!isNaN(eq[i])) { const y = dates[i].slice(0, 4); byY[y] = byY[y] || { s: null, e: null }; if (byY[y].s === null) byY[y].s = i; byY[y].e = i; }
  const res = {}; let last = null;
  for (const y of Object.keys(byY).sort()) { const st = last === null ? eq[byY[y].s] : eq[last]; res[y] = eq[byY[y].e] / st - 1; last = byY[y].e; }
  return res;
}
module.exports = { loadAll, I, run, metrics, yearly, slip, FEE, iso, nextBar, DAY };
