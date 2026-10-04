// Original Turtle Trading Rules (Curtis Faith) — crypto implementation with hourly-path execution.
'use strict';
const HOUR = 3600e3, DAY = 864e5;

function buildMarket(sym, rows, funding) {
  rows = rows.filter(r => r[2] > 0 && r[3] > 0 && r[4] > 0 && r[1] > 0);
  rows.sort((a, b) => a[0] - b[0]);
  // bad-print / flash-wick filter: a wick extending >30% beyond the bar body is clipped to 30%
  // (a live bot should trigger stops on MARK price, which ignores such single-exchange prints)
  let clipped = 0;
  rows = rows.map(r => {
    const top = Math.max(r[1], r[4]), bot = Math.min(r[1], r[4]); let h = r[2], l = r[3];
    if (h > top * 1.3) { h = top * 1.3; clipped++; }
    if (l < bot * 0.7) { l = bot * 0.7; clipped++; }
    return [r[0], r[1], h, l, r[4], r[5]];
  });
  const h0 = Math.floor(rows[0][0] / HOUR), h1 = Math.floor(rows[rows.length - 1][0] / HOUR);
  const n = h1 - h0 + 1;
  const O = new Float64Array(n).fill(NaN), H = new Float64Array(n).fill(NaN), L = new Float64Array(n).fill(NaN), C = new Float64Array(n).fill(NaN);
  for (const r of rows) { const i = Math.floor(r[0] / HOUR) - h0; O[i] = r[1]; H[i] = r[2]; L[i] = r[3]; C[i] = r[4]; }
  const d0 = Math.floor(h0 / 24), d1 = Math.floor(h1 / 24), nd = d1 - d0 + 1;
  const dO = new Float64Array(nd).fill(NaN), dH = new Float64Array(nd).fill(NaN), dL = new Float64Array(nd).fill(NaN), dC = new Float64Array(nd).fill(NaN), dV = new Float64Array(nd).fill(0);
  for (const r of rows) {
    const d = Math.floor(r[0] / DAY) - d0;
    if (isNaN(dO[d])) { dO[d] = r[1]; dH[d] = r[2]; dL[d] = r[3]; }
    else { if (r[2] > dH[d]) dH[d] = r[2]; if (r[3] < dL[d]) dL[d] = r[3]; }
    dC[d] = r[4]; dV[d] += r[5] || 0;
  }
  for (let d = 1; d < nd; d++) if (isNaN(dC[d])) { dO[d] = dH[d] = dL[d] = dC[d] = dC[d - 1]; }
  const fund = new Map();
  if (funding) for (const [t, r] of funding) fund.set(Math.round(t / HOUR), r);
  return { sym, h0, h1, O, H, L, C, d0, d1, dO, dH, dL, dC, dV, fund, clipped };
}

// value at index d = known at START of day d (uses days < d)
function indicators(m, lookbacks) {
  const nd = m.dC.length;
  const N = new Float64Array(nd).fill(NaN);
  const tr = new Float64Array(nd);
  for (let d = 0; d < nd; d++) {
    const pc = d > 0 ? m.dC[d - 1] : m.dO[d];
    tr[d] = Math.max(m.dH[d] - m.dL[d], Math.abs(m.dH[d] - pc), Math.abs(m.dL[d] - pc));
  }
  let n = NaN;
  for (let d = 1; d < nd; d++) {
    if (d === 20) { let s = 0; for (let k = 1; k <= 20; k++) s += tr[k]; n = s / 20; } // 20-day SMA seed
    else if (d > 20) n = (19 * n + tr[d]) / 20;                                       // N = (19*PDN + TR)/20
    if (d + 1 < nd) N[d + 1] = n;
  }
  const hi = {}, lo = {};
  for (const lb of lookbacks) {
    const a = new Float64Array(nd).fill(NaN), b = new Float64Array(nd).fill(NaN);
    for (let d = lb; d < nd; d++) {
      let mx = -Infinity, mn = Infinity;
      for (let k = d - lb; k < d; k++) { if (m.dH[k] > mx) mx = m.dH[k]; if (m.dL[k] < mn) mn = m.dL[k]; }
      a[d] = mx; b[d] = mn;
    }
    hi[lb] = a; lo[lb] = b;
  }
  const mom = new Float64Array(nd).fill(0);
  for (let d = 64; d < nd; d++) mom[d] = (m.dC[d - 1] - m.dC[d - 64]) / (N[d] || 1);
  m.N = N; m.hi = hi; m.lo = lo; m.mom = mom;
}

function defaults() {
  return {
    system: 'S1', entry: 20, exit: 10, failsafe: 55,
    risk: 0.01, stopN: 2, addN: 0.5, maxUnits: 4,
    whipsaw: false,
    lim: { market: 4, close: 6, loose: 10, dir: 12 }, useLimits: true,
    corrClose: 0.7, corrLoose: 0.5, corrWin: 60,
    longOnly: false, spotCash: false,
    fee: 0.0005, slip: 0.001,
    weeklyN: true, ddRule: true, capital: 1.0,
    btcFilter: null, pathMode: 'resolved', minute: null,
  };
}

function makeCorr(markets, D, win) {
  const cache = new Map();
  return (a, b) => {
    if (a === b) return 1;
    const key = a.sym < b.sym ? a.sym + '|' + b.sym : b.sym + '|' + a.sym;
    let c = cache.get(key); if (c !== undefined) return c;
    const xs = [], ys = [];
    for (let d = D - win; d < D; d++) {
      const ia = d - a.d0, ib = d - b.d0;
      if (ia < 1 || ib < 1 || ia >= a.dC.length || ib >= b.dC.length) continue;
      xs.push(Math.log(a.dC[ia] / a.dC[ia - 1])); ys.push(Math.log(b.dC[ib] / b.dC[ib - 1]));
    }
    if (xs.length >= 20) {
      const k = xs.length, mx = xs.reduce((s, v) => s + v, 0) / k, my = ys.reduce((s, v) => s + v, 0) / k;
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < k; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
      c = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
    } else c = 0.8; // <20 shared days: conservatively 'closely correlated'
    cache.set(key, c);
    return c;
  };
}

const PRI = { stop: 0, exit: 0, wsStop: 0, entry: 1, add: 2, wsRe: 2, shOut: 3, shIn: 4, wsCancel: 5 };

function run(markets, universeFn, cfgIn, startDay, endDay) {
  const cfg = Object.assign(defaults(), cfgIn);
  if (cfg.whipsaw) { cfg.stopN = 0.5; cfg.risk = cfg.risk / 2; }
  const S = cfg.system;
  const ent = S === 'S1' ? 20 : S === 'S2' ? 55 : cfg.entry;
  const ext = S === 'S1' ? 10 : S === 'S2' ? 20 : cfg.exit;
  const st = {};
  for (const m of markets) st[m.sym] = { pos: null, shadow: null, lastShadowWin: null, Nw: NaN, wsRe: [], wsFlat: null };
  const mk = Object.fromEntries(markets.map(m => [m.sym, m]));
  let cash = cfg.capital, Y = cfg.capital, ddLevel = 0, notional = cfg.capital, curYear = null;
  const eq = [], trades = [];
  const stats = { attempts: 0, blocked: { market: 0, close: 0, loose: 0, dir: 0, cash: 0 }, fees: 0, slipCost: 0, funding: 0, skipped: 0, s1Breakouts: 0, failsafe: 0, ddCuts: 0, maxGross: 0, grossSum: 0, expoDays: 0, unitsHeldSum: 0, days: 0, ambiguousBars: 0, pathDiffBars: 0 };
  let corrFn = null;

  // counts units in direction dir: committed state of OTHER markets + the simulated (in-bar) state of market m itself
  function unitsDir(dir, m, simPos, filter) { let u = (simPos && simPos.dir === dir) ? simPos.units.length : 0; for (const s in st) { if (s === m.sym) continue; const p = st[s].pos; if (p && p.dir === dir && (!filter || filter(mk[s]))) u += p.units.length; } return u; }
  function limitCheck(m, dir, simPos) { // returns null if OK, else level name
    if (!cfg.useLimits) return null;
    if ((simPos ? simPos.units.length : 0) >= cfg.lim.market) return 'market';
    if (unitsDir(dir, m, simPos) >= cfg.lim.dir) return 'dir';
    if (unitsDir(dir, m, simPos, x => corrFn(x, m) > cfg.corrClose) >= cfg.lim.close) return 'close';
    if (unitsDir(dir, m, simPos, x => corrFn(x, m) > cfg.corrLoose) >= cfg.lim.loose) return 'loose';
    return null;
  }

  // Levels for a market state on day di (pure function of state)
  function levelsFor(s, m, di, inU, allowL, allowS) {
    const out = [];
    const N = cfg.weeklyN ? s.Nw : m.N[di];
    const p = s.pos;
    if (p) {
      const exitLv = p.dir > 0 ? m.lo[ext][di] : m.hi[ext][di];
      if (cfg.whipsaw) {
        let ws = p.dir > 0 ? -Infinity : Infinity; for (const u of p.units) ws = p.dir > 0 ? Math.max(ws, u.stop) : Math.min(ws, u.stop);
        out.push({ lv: ws, up: p.dir < 0, act: 'wsStop' });
      } else out.push({ lv: p.stop, up: p.dir < 0, act: 'stop' });
      out.push({ lv: exitLv, up: p.dir < 0, act: 'exit' });
      if (inU && p.units.length < cfg.maxUnits) {
        out.push({ lv: p.lastFill + p.dir * cfg.addN * p.N, up: p.dir > 0, act: 'add' });
        if (cfg.whipsaw) for (const r of s.wsRe) out.push({ lv: r, up: p.dir > 0, act: 'wsRe', ref: r });
      }
    } else if (inU && N > 0) {
      if (s.wsFlat) { // whipsaw: re-enter initial unit at original entry price until opposite exit breakout
        const w = s.wsFlat;
        if ((w.dir > 0 && allowL) || (w.dir < 0 && allowS)) out.push({ lv: w.lv, up: w.dir > 0, act: 'entry', dir: w.dir, tag: w.tag, re: true });
        out.push({ lv: w.dir > 0 ? m.lo[ext][di] : m.hi[ext][di], up: w.dir < 0, act: 'wsCancel' });
      }
      let lu, ld, tag;
      if (S === 'S1') {
        if (!s.shadow && s.lastShadowWin !== true) { lu = m.hi[20][di]; ld = m.lo[20][di]; tag = 'S1'; }
        else { lu = m.hi[cfg.failsafe][di]; ld = m.lo[cfg.failsafe][di]; tag = 'FS'; }
      } else { lu = m.hi[ent][di]; ld = m.lo[ent][di]; tag = S; }
      if (allowL) out.push({ lv: lu, up: true, act: 'entry', dir: 1, tag });
      if (allowS) out.push({ lv: ld, up: false, act: 'entry', dir: -1, tag });
    }
    if (S === 'S1' && N > 0) {
      const sh = s.shadow;
      if (!sh) { out.push({ lv: m.hi[20][di], up: true, act: 'shIn', dir: 1 }); out.push({ lv: m.lo[20][di], up: false, act: 'shIn', dir: -1 }); }
      else if (sh.dir > 0) { out.push({ lv: sh.entry - 2 * sh.N, up: false, act: 'shOut', loss2N: true }); out.push({ lv: m.lo[10][di], up: false, act: 'shOut' }); }
      else { out.push({ lv: sh.entry + 2 * sh.N, up: true, act: 'shOut', loss2N: true }); out.push({ lv: m.hi[10][di], up: true, act: 'shOut' }); }
    }
    return out.filter(x => isFinite(x.lv));
  }

  function clone(s) {
    return { pos: s.pos ? Object.assign({}, s.pos, { units: s.pos.units.map(u => Object.assign({}, u)) }) : null, shadow: s.shadow ? Object.assign({}, s.shadow) : null, lastShadowWin: s.lastShadowWin, Nw: s.Nw, wsRe: s.wsRe.slice(), wsFlat: s.wsFlat ? Object.assign({}, s.wsFlat) : null };
  }

  function simBar(m, s0, path, di, tH, inU, allowL, allowS) {
    const s = clone(s0);
    const ctx = { cash: 0, fees: 0, slip: 0, closed: [], blocked: [], attempts: 0, skipped: 0, s1b: 0, fs: 0 };
    const N = cfg.weeklyN ? s.Nw : m.N[di];
    function fill(side, qty, ref) { const px = ref * (1 + side * cfg.slip); const fee = Math.abs(qty * px) * cfg.fee; ctx.cash -= side * qty * px + fee; ctx.fees += fee; ctx.slip += Math.abs(qty) * ref * cfg.slip; return { px, fee }; }
    function sizeQ(ref, base) {
      let q = base;
      if (cfg.spotCash) { const avail = (cash + ctx.cash) * 0.998 / (ref * (1 + cfg.slip) * (1 + cfg.fee)); if (avail < q * 0.2) return 0; q = Math.min(q, avail); }
      return q;
    }
    function apply(ev, ref) {
      const p = s.pos;
      switch (ev.act) {
        case 'entry': {
          ctx.attempts++;
          const lc = limitCheck(m, ev.dir, s.pos); if (lc) { ctx.blocked.push(lc); return; }
          const q = sizeQ(ref, cfg.risk * notional / N); if (!q) { ctx.blocked.push('cash'); return; }
          const f = fill(ev.dir, q, ref);
          const stop = f.px - ev.dir * cfg.stopN * N;
          s.pos = { dir: ev.dir, q: ev.dir * q, units: [{ q, fill: f.px, stop }], stop, N, lastFill: f.px, t0: tH, sys: ev.tag, maxUnits: 1, R1: q * cfg.stopN * N, cashFlow: -ev.dir * q * f.px, feeAcc: f.fee, fundAcc: 0, lastPx: f.px, notional0: notional };
          if (ev.tag === 'FS' && !ev.re) ctx.fs++;
          s.wsRe = []; s.wsFlat = null;
          return;
        }
        case 'add': case 'wsRe': {
          ctx.attempts++;
          const lc = limitCheck(m, p.dir, s.pos); if (lc) { ctx.blocked.push(lc); if (ev.act === 'add') p.lastFill += p.dir * cfg.addN * p.N; return; } // blocked add: next ½N rung
          const q = sizeQ(ref, cfg.risk * notional / p.N); if (!q) { ctx.blocked.push('cash'); if (ev.act === 'add') p.lastFill += p.dir * cfg.addN * p.N; return; }
          const f = fill(p.dir, q, ref);
          p.units.push({ q, fill: f.px, stop: f.px - p.dir * cfg.stopN * p.N });
          p.q += p.dir * q; p.cashFlow += -p.dir * q * f.px; p.feeAcc += f.fee;
          if (ev.act === 'wsRe') s.wsRe = s.wsRe.filter(r => r !== ev.ref);
          if (ev.act === 'add') p.lastFill = f.px;
          if (!cfg.whipsaw) { p.stop = f.px - p.dir * cfg.stopN * p.N; for (const u of p.units) u.stop = p.stop; }
          p.maxUnits = Math.max(p.maxUnits, p.units.length);
          return;
        }
        case 'stop': case 'exit': {
          const side = -p.dir, qa = Math.abs(p.q);
          const f = fill(side, qa, ref);
          p.cashFlow += p.dir * qa * f.px; p.feeAcc += f.fee;
          ctx.closed.push({ p, exitT: tH, exit: f.px, reason: ev.act });
          s.pos = null; s.wsRe = []; s.wsFlat = null;
          return;
        }
        case 'wsStop': {
          const side = -p.dir;
          const hit = p.units.filter(u => p.dir > 0 ? u.stop >= ev.lv - 1e-12 : u.stop <= ev.lv + 1e-12);
          const keep = p.units.filter(u => !hit.includes(u));
          const qa = hit.reduce((a, u) => a + u.q, 0);
          const f = fill(side, qa, ref);
          p.cashFlow += p.dir * qa * f.px; p.feeAcc += f.fee; p.q -= p.dir * qa;
          if (!keep.length) {
            ctx.closed.push({ p, exitT: tH, exit: f.px, reason: 'stop' });
            s.wsFlat = { dir: p.dir, lv: p.units.reduce((a, u) => p.dir > 0 ? Math.min(a, u.fill) : Math.max(a, u.fill), p.dir > 0 ? Infinity : -Infinity), tag: p.sys };
            s.pos = null; s.wsRe = [];
          } else { p.units = keep; for (const u of hit) s.wsRe.push(u.fill); }
          return;
        }
        case 'wsCancel': s.wsFlat = null; return;
        case 'shIn': s.shadow = { dir: ev.dir, entry: ref, N }; ctx.s1b++; if (s0.lastShadowWin === true) ctx.skipped++; return;
        case 'shOut': { const sh = s.shadow; s.lastShadowWin = !ev.loss2N && (ref - sh.entry) * sh.dir > 0; s.shadow = null; return; }
      }
    }
    let cur = path[0];
    for (let k = 1; k < path.length; k++) {
      const b = path[k], gap = k === 1;
      if (b === cur) continue;
      const up = b > cur;
      const done = new Set();
      for (let guard = 0; guard < 60; guard++) {
        const lvs = levelsFor(s, m, di, inU, allowL, allowS).filter(x => x.up === up && (up ? x.lv > cur && x.lv <= b : x.lv < cur && x.lv >= b) && !done.has(x.act + '|' + x.dir + '|' + x.lv));
        if (!lvs.length) break;
        lvs.sort((x, y) => (up ? x.lv - y.lv : y.lv - x.lv) || PRI[x.act] - PRI[y.act]);
        const ev = lvs[0];
        done.add(ev.act + '|' + ev.dir + '|' + ev.lv);
        apply(ev, gap ? b : ev.lv); // gap through level: fill at the open
        if (!gap) cur = up ? Math.max(cur, ev.lv - 1e-12 * Math.abs(ev.lv)) : Math.min(cur, ev.lv + 1e-12 * Math.abs(ev.lv));
      }
      cur = b;
    }
    return { s, ctx };
  }

  for (let D = startDay; D <= endDay; D++) {
    const date = new Date(D * DAY), yr = date.getUTCFullYear();
    if (curYear !== yr) { const e = eq.length ? eq[eq.length - 1].eq : cfg.capital; curYear = yr; Y = e; ddLevel = 0; notional = Y; }
    if (date.getUTCDay() === 1 || D === startDay) {
      corrFn = makeCorr(markets, D, cfg.corrWin);
      for (const m of markets) { const di = D - m.d0; if (di >= 0 && di < m.N.length) st[m.sym].Nw = m.N[di]; }
    }
    const uni = universeFn(D);
    const f = cfg.btcFilter ? cfg.btcFilter[D] : 0;
    const allowL = !cfg.btcFilter || f > 0, allowS = !cfg.longOnly && (!cfg.btcFilter || f < 0);
    // delisting / data end: close at last price
    for (const m of markets) { const s = st[m.sym]; if (s.pos && D > m.d1) {
      const p = s.pos; let i = m.C.length - 1; while (i > 0 && isNaN(m.C[i])) i--; const ref = m.C[i];
      const px = ref * (1 - p.dir * cfg.slip), fee = Math.abs(p.q * px) * cfg.fee; cash += p.q * px - fee; stats.fees += fee; stats.slipCost += Math.abs(p.q) * ref * cfg.slip;
      p.cashFlow += p.q * px; p.feeAcc += fee; trades.push(mkTrade(m.sym, p, D * DAY, px, 'delist')); s.pos = null; } }
    const act = markets.filter(m => D >= m.d0 && D <= m.d1 && D - m.d0 >= 75 && (uni.has(m.sym) || st[m.sym].pos));
    act.sort((a, b) => Math.abs(b.mom[D - b.d0]) - Math.abs(a.mom[D - a.d0])); // buy strongest / sell weakest first
    const daily = cfg.pathMode.startsWith('daily');
    for (let hh = 0; hh < (daily ? 1 : 24); hh++) {
      const hG = D * 24 + hh;
      for (const m of act) {
        const s = st[m.sym], di = D - m.d0, inU = uni.has(m.sym);
        let o, h, l, c, pc;
        if (daily) {
          o = m.dO[di]; h = m.dH[di]; l = m.dL[di]; c = m.dC[di]; pc = di > 0 ? m.dC[di - 1] : o;
          if (s.pos) for (let k = 0; k < 24; k++) { const r = m.fund.get(D * 24 + k); if (r !== undefined) { const i = D * 24 + k - m.h0; const px = (i >= 0 && i < m.O.length && !isNaN(m.O[i])) ? m.O[i] : o; const pay = s.pos.q * px * r; cash -= pay; s.pos.fundAcc += pay; stats.funding += pay; } }
        } else {
          const i = hG - m.h0; if (i < 0 || i >= m.O.length || isNaN(m.O[i])) continue;
          o = m.O[i]; h = m.H[i]; l = m.L[i]; c = m.C[i];
          let j = i - 1; while (j >= 0 && isNaN(m.C[j])) j--; pc = j >= 0 ? m.C[j] : o;
          if (s.pos) { const r = m.fund.get(hG); if (r !== undefined) { const pay = s.pos.q * o * r; cash -= pay; s.pos.fundAcc += pay; stats.funding += pay; } }
        }
        const lo = Math.min(pc, o, l), hi = Math.max(pc, o, h);
        const lv0 = levelsFor(s, m, di, inU, allowL, allowS);
        let any = false; for (const x of lv0) if (x.lv >= lo && x.lv <= hi) { any = true; break; }
        if (!any) { if (s.pos) s.pos.lastPx = c; continue; }
        // nearest-extreme-first heuristic path (used when no finer data)
        const near = Math.abs(h - o) <= Math.abs(o - l) ? [pc, o, h, l, c] : [pc, o, l, h, c];
        const paths = cfg.pathMode === 'OHLC' ? [[pc, o, h, l, c]] : cfg.pathMode === 'near' ? [near] : [[pc, o, h, l, c], [pc, o, l, h, c]];
        let best = null; const res = [];
        for (const path of paths) {
          const r = simBar(m, s, path, di, hG * HOUR, inU, allowL, allowS);
          r.val = r.ctx.cash + (r.s.pos ? r.s.pos.q * c : 0);
          r.sig = JSON.stringify([r.s.pos, r.s.shadow, r.s.lastShadowWin, r.s.wsFlat, r.ctx.closed.length]);
          res.push(r);
          if (!best || ((cfg.pathMode === 'best' || cfg.pathMode === 'dailyBest') ? r.val > best.val : r.val < best.val)) best = r;
        }
        stats.ambiguousBars++;
        const diverge = res.length > 1 && (Math.abs(res[0].val - res[1].val) > 1e-12 || res[0].sig !== res[1].sig);
        if (diverge) {
          stats.pathDiffBars++;
          if (cfg.pathMode === 'resolved') { // drill down: real 1-minute path inside this hour
            const mins = daily ? null : cfg.minute.get(m.sym, hG);
            let path;
            if (mins && mins.length >= 30) { path = [pc]; for (const b of mins) { if (Math.abs(b[2] - b[1]) <= Math.abs(b[1] - b[3])) path.push(b[1], b[2], b[3], b[4]); else path.push(b[1], b[3], b[2], b[4]); } stats.m1Resolved = (stats.m1Resolved || 0) + 1;
              // clip minute path to the (wick-filtered) hourly range
              path = path.map(x => Math.min(Math.max(x, l), h)); path[0] = pc; }
            else { path = near; stats.m1Fallback = (stats.m1Fallback || 0) + 1; }
            best = simBar(m, s, path, di, hG * HOUR, inU, allowL, allowS);
          }
        } else if (res.length > 1) best = res[0];
        const cx = best.ctx;
        cash += cx.cash; stats.fees += cx.fees; stats.slipCost += cx.slip;
        stats.attempts += cx.attempts; for (const b of cx.blocked) stats.blocked[b]++;
        stats.skipped += cx.skipped; stats.s1Breakouts += cx.s1b; stats.failsafe += cx.fs;
        st[m.sym] = best.s; if (best.s.pos) best.s.pos.lastPx = c;
        for (const t of cx.closed) trades.push(mkTrade(m.sym, t.p, t.exitT, t.exit, t.reason));
      }
    }
    // daily close: equity, exposure, drawdown rule
    let e = cash, gross = 0, uh = 0, uL = 0, uS = 0;
    for (const sy in st) { const p = st[sy].pos; if (!p) continue; const m = mk[sy]; const di = D - m.d0; const px = (di >= 0 && di < m.dC.length) ? m.dC[di] : p.lastPx; p.lastPx = px; e += p.q * px; gross += Math.abs(p.q * px); uh += p.units.length; if (p.dir > 0) uL += p.units.length; else uS += p.units.length; }
    stats.days++; if (uL >= cfg.lim.dir) stats.capDaysL = (stats.capDaysL || 0) + 1; if (uS >= cfg.lim.dir) stats.capDaysS = (stats.capDaysS || 0) + 1; if (uL >= cfg.lim.close || uS >= cfg.lim.close) stats.daysGe6 = (stats.daysGe6 || 0) + 1; stats.maxGross = Math.max(stats.maxGross, gross / Math.max(e, 1e-9)); stats.grossSum += gross / Math.max(e, 1e-9); if (uh) stats.expoDays++; stats.unitsHeldSum += uh;
    eq.push({ D, date: date.toISOString().slice(0, 10), eq: e, gross: gross / Math.max(e, 1e-9), units: uh, uL, uS, notional, cFee: stats.fees, cSlip: stats.slipCost, cFund: stats.funding });
    if (cfg.ddRule) {
      if (e >= Y) ddLevel = 0;
      else { let k = ddLevel; while (k < 40 && Y - e >= 0.5 * Y * (1 - Math.pow(0.8, k + 1))) k++; if (k > ddLevel) { stats.ddCuts += k - ddLevel; ddLevel = k; } }
      notional = Y * Math.pow(0.8, ddLevel);
    } else notional = Y;
    if (e <= 0) notional = 0;
  }
  for (const sy in st) { const p = st[sy].pos; if (p) { const px = p.lastPx; const fee = Math.abs(p.q * px) * cfg.fee; const cf = p.cashFlow + p.q * px; trades.push(Object.assign(mkTrade(sy, Object.assign({}, p, { cashFlow: cf, feeAcc: p.feeAcc + fee }), endDay * DAY, px, 'open'), { open: true })); } }
  return { cfg, eq, trades, stats };
}

function mkTrade(sym, p, exitT, exitPx, reason) {
  const net = p.cashFlow - p.feeAcc - p.fundAcc;
  return { fills: p.units.map(u => [+u.fill.toPrecision(6), +u.q.toPrecision(4)]), sym, dir: p.dir, sys: p.sys, entryT: new Date(p.t0).toISOString().slice(0, 13).replace('T', ' '), exitT: new Date(exitT).toISOString().slice(0, 13).replace('T', ' '), units: p.maxUnits, entry: p.units[0].fill, exit: exitPx, reason, N: p.N, R1: p.R1, gross: p.cashFlow, fees: p.feeAcc, funding: p.fundAcc, net, R: (() => { const q0 = p.units[0].q, mq = p.units.reduce((a, u) => a + u.q, 0) / p.units.length; const r = p.R1 / q0 * mq; return r > 0 ? net / r : 0; })(), notional0: p.notional0 };
}

module.exports = { buildMarket, indicators, run, defaults, HOUR, DAY };
