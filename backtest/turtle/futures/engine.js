// Original Turtle Trading Rules backtest engine on Yahoo '=F' continuous daily OHLC.
const fs = require('fs'); const path = require('path'); const MK = require('./markets');
const SUPER = { rates: 'fin', stocks: 'fin', fx: 'fx', metals: 'hard', energy: 'hard', grains: 'ag', softs: 'ag', meats: 'ag' };
const COMM = 2.5, START = '2001-01-02';
const cache = {};

function load(spec, { adjust = true, rollThr = 1.5 } = {}) {
  const key = spec.s + adjust + rollThr; if (cache[key]) return cache[key];
  let L = fs.readFileSync(path.join(__dirname, 'data', spec.s + '.csv'), 'utf8').trim().split('\n').slice(1).map(l => { const r = l.split(','); return { d: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }; });
  L = L.filter(r => !(r.h === r.l && r.v === 0) && isFinite(r.c) && isFinite(r.o)); // drop stale settlement-only prints
  for (const r of L) { r.h = Math.max(r.h, r.o, r.c); r.l = Math.min(r.l, r.o, r.c); }
  const n = L.length;
  // roll detection on raw data: overnight gap >= rollThr * N(prev) in a contract-roll month
  const gap = new Map(); let N = null;
  for (let i = 1; i < n; i++) {
    const p = L[i - 1].c, r = L[i]; const tr = Math.max(r.h - r.l, Math.abs(r.h - p), Math.abs(r.l - p));
    if (adjust && N !== null && i > 20) { const g = r.o - p; const m = +r.d.slice(5, 7); if (Math.abs(g) >= rollThr * N && spec.roll.includes(m)) gap.set(i, g); }
    N = N === null ? tr : (19 * N + tr) / 20;
  }
  // difference back-adjustment: bar j shifted by sum of gaps on roll days > j
  const off = new Array(n).fill(0); let acc = 0;
  for (let i = n - 1; i >= 0; i--) { off[i] = acc; if (gap.has(i)) acc += gap.get(i); }
  const d = [], o = [], h = [], l = [], c = [], raw = [];
  for (let i = 0; i < n; i++) { const a = off[i]; d.push(L[i].d); o.push(L[i].o + a); h.push(L[i].h + a); l.push(L[i].l + a); c.push(L[i].c + a); raw.push(L[i].c); }
  const NN = new Array(n).fill(null); let s = 0;
  for (let i = 1; i < n; i++) {
    const tr = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    if (i <= 20) { s += tr; if (i === 20) NN[i] = s / 20; } else NN[i] = (19 * NN[i - 1] + tr) / 20;
  }
  const roll = new Array(n).fill(false); for (const k of gap.keys()) roll[k] = true;
  const act = new Array(n).fill(false);
  for (let i = 21; i < n; i++) { let ok = true; for (let k = i - 19; k <= i; k++) { if ((Date.parse(d[k]) - Date.parse(d[k - 1])) / 864e5 > 7) { ok = false; break; } } act[i] = ok; }
  const idx = new Map(d.map((x, i) => [x, i]));
  return cache[key] = { spec, d, o, h, l, c, raw, N: NN, roll, act, idx, nRolls: gap.size };
}
const hh = (a, i, n) => { let m = -Infinity; for (let k = i - n; k < i; k++) if (a[k] > m) m = a[k]; return m; };
const ll = (a, i, n) => { let m = Infinity; for (let k = i - n; k < i; k++) if (a[k] < m) m = a[k]; return m; };

function run(cfg) {
  const { capital = 1e6, books, micro = false, adjust = true, risk = 0.01, ddRule = true, ddRef = 'year', markets = null } = cfg;
  const data = MK.filter(sp => !markets || markets.includes(sp.s)).map(sp => {
    const D = Object.assign({}, load(sp, { adjust }));
    D.pv = micro && sp.micro ? sp.micro.pv : sp.pv; D.tick = sp.tick; D.lastI = undefined; return D;
  });
  const bySym = Object.fromEntries(data.map(D => [D.spec.s, D]));
  const dates = [...new Set(data.flatMap(D => D.d))].filter(x => x >= (cfg.start || START)).sort();
  let cash = capital, eq = capital, hwm = capital; const curve = []; const trades = [];
  const stats = { entrySignals: 0, entryTaken: 0, entryGranSkip: 0, addGranSkip: 0, addsTaken: 0, limitSkip: 0, s1Skips: 0, granByMkt: {}, rollCost: 0, costs: 0 };
  const B = books.map(b => ({ ...b, pos: {}, hypo: {}, lastWin: {} }));
  const notional = () => { if (!ddRule) return eq; const dd = 1 - eq / hwm; const k = Math.floor(dd / 0.10 + 1e-9); return k <= 0 ? eq : Math.min(eq, hwm * Math.pow(0.8, k)); };
  const unitsCount = (b, pred) => { let u = 0; for (const p of Object.values(b.pos)) if (p && pred(p)) u += p.u.length; return u; };
  const limitsOK = (b, D, dir) => {
    const g = D.spec.g, sg = SUPER[g];
    if (unitsCount(b, p => p.g === g && p.dir === dir) >= 6) return false;
    if (unitsCount(b, p => SUPER[p.g] === sg && p.dir === dir) >= 10) return false;
    if (unitsCount(b, p => p.dir === dir) >= 12) return false; return true;
  };
  const payFill = (D, ct) => { cash -= COMM * ct; stats.costs += ct * (COMM + D.tick * D.pv); return COMM * ct; };
  const exitPos = (b, D, p, px, date) => {
    const f = px - p.dir * D.tick; let pnl = 0, ct = 0;
    for (const u of p.u) { pnl += p.dir * (f - u.f) * u.ct * D.pv; ct += u.ct; }
    cash += pnl; p.cost += payFill(D, ct);
    trades.push({ b: b.name, m: D.spec.s, dir: p.dir, in: p.d0, out: date, units: p.u.length, ct, pnl: pnl - p.cost }); delete b.pos[D.spec.s];
  };
  const addUnits = (b, D, p, i) => {
    const o = D.o[i], h = D.h[i], l = D.l[i];
    while (p.u.length < b.maxUnits && ((p.dir > 0 && h >= p.next) || (p.dir < 0 && l <= p.next))) {
      if (!limitsOK(b, D, p.dir)) { stats.limitSkip++; break; }
      const ct = Math.floor(risk * b.share * notional() / (D.N[i - 1] * D.pv));
      if (ct < 1) { stats.addGranSkip++; break; }
      const trig = p.dir > 0 ? Math.max(o, p.next) : Math.min(o, p.next);
      p.u.push({ ct, f: trig + p.dir * D.tick }); p.cost += payFill(D, ct); stats.addsTaken++;
      p.stop = trig - p.dir * 2 * p.N; p.next = trig + p.dir * b.addStep * p.N;
    }
  };

  let curYear = null;
  for (const date of dates) {
    if (ddRef === 'year' && date.slice(0, 4) !== curYear) { curYear = date.slice(0, 4); hwm = eq; } // notional reference reset each Jan 1
    for (const D of data) {
      const i = D.idx.get(date); if (i === undefined || i < 60 || D.N[i - 1] == null) continue;
      const s = D.spec.s, o = D.o[i], h = D.h[i], l = D.l[i], Np = D.N[i - 1];
      for (const b of B) {
        if (b.type !== 'turtle') continue;
        let p = b.pos[s];
        if (p && D.roll[i]) { const ct = p.u.reduce((a, u) => a + u.ct, 0); const c = ct * 2 * (COMM + D.tick * D.pv); cash -= c; p.cost += c; stats.rollCost += c; stats.costs += c; }
        // S1 last-breakout filter: hypothetical trade (no adds) with 2N stop and exitLen exit
        let skip = false;
        if (b.skipRule) {
          const hy = b.hypo[s];
          if (hy) {
            const lvl = hy.dir > 0 ? Math.max(hy.stop, ll(D.l, i, b.exitLen)) : Math.min(hy.stop, hh(D.h, i, b.exitLen));
            let px = null; if (hy.dir > 0) { if (o <= lvl) px = o; else if (l <= lvl) px = lvl; } else { if (o >= lvl) px = o; else if (h >= lvl) px = lvl; }
            if (px !== null) { b.lastWin[s] = (px - hy.e) * hy.dir > 0; delete b.hypo[s]; }
          }
          skip = !!b.lastWin[s];
          if (!b.hypo[s]) {
            const H = hh(D.h, i, b.entryLen), Lo = ll(D.l, i, b.entryLen); const up = h > H, dn = l < Lo;
            if (up !== dn) {
              const dir = up ? 1 : -1; const e = dir > 0 ? Math.max(o, H) : Math.min(o, Lo); const nh = { dir, e, stop: e - dir * 2 * Np };
              if ((dir > 0 && l <= nh.stop) || (dir < 0 && h >= nh.stop)) b.lastWin[s] = false; else b.hypo[s] = nh;
            }
          }
        }
        if (p) {
          const chan = () => p.dir > 0 ? Math.max(p.stop, ll(D.l, i, b.exitLen)) : Math.min(p.stop, hh(D.h, i, b.exitLen));
          let lvl = chan();
          if ((p.dir > 0 && o <= lvl) || (p.dir < 0 && o >= lvl)) { exitPos(b, D, p, o, date); continue; }
          addUnits(b, D, p, i); lvl = chan();
          if ((p.dir > 0 && l <= lvl) || (p.dir < 0 && h >= lvl)) exitPos(b, D, p, lvl, date);
          continue;
        }
        if (!D.act[i] || (D.spec.from && date < D.spec.from)) continue;
        const H = hh(D.h, i, b.entryLen), Lo = ll(D.l, i, b.entryLen); let up = h > H, dn = l < Lo, tU = H, tD = Lo;
        if (b.skipRule && skip && (up || dn)) { stats.s1Skips++; const H55 = hh(D.h, i, b.failsafe), L55 = ll(D.l, i, b.failsafe); up = h > H55; dn = l < L55; tU = H55; tD = L55; }
        if (up === dn) continue;
        const dir = up ? 1 : -1; stats.entrySignals++;
        if (!limitsOK(b, D, dir)) { stats.limitSkip++; continue; }
        const ct = Math.floor(risk * b.share * notional() / (Np * D.pv));
        if (ct < 1) { stats.entryGranSkip++; stats.granByMkt[s] = (stats.granByMkt[s] || 0) + 1; continue; }
        stats.entryTaken++;
        const trig = dir > 0 ? Math.max(o, tU) : Math.min(o, tD);
        p = { dir, g: D.spec.g, N: Np, d0: date, u: [{ ct, f: trig + dir * D.tick }], stop: trig - dir * 2 * Np, next: trig + dir * b.addStep * Np, cost: 0 };
        p.cost += payFill(D, ct); b.pos[s] = p;
        addUnits(b, D, p, i);
        if ((dir > 0 && l <= p.stop) || (dir < 0 && h >= p.stop)) exitPos(b, D, p, p.stop, date); // conservative: same-day stop = loss
      }
    }
    // modern ensemble: Donchian breakouts on close for each lookback, exit on half-lookback; vol-scaled; trade next open
    for (const b of B) {
      if (b.type !== 'modern') continue;
      for (const D of data) {
        const i = D.idx.get(date); if (i === undefined || i < 210 || D.N[i - 1] == null) continue; const s = D.spec.s;
        const p = b.pos[s] = b.pos[s] || { ct: 0, f: 0, tgt: 0, sub: {}, u: [] };
        if (p.ct && D.roll[i]) { const c = Math.abs(p.ct) * 2 * (COMM + D.tick * D.pv); cash -= c; stats.rollCost += c; stats.costs += c; }
        if (p.tgt !== p.ct) {
          const dq = p.tgt - p.ct;
          cash += p.ct * (D.o[i] - p.f) * D.pv; p.f = D.o[i];
          const c = Math.abs(dq) * (COMM + D.tick * D.pv); cash -= c; stats.costs += c;
          if (p.ct === 0) { p.ep = { in: date, cash0: 0 }; }
          p.ct = p.tgt;
        } else if (p.ct) { cash += p.ct * (D.o[i] - p.f) * D.pv; p.f = D.o[i]; }
        let sig = 0; const c0 = D.c[i];
        for (const L of b.lookbacks) {
          let st = p.sub[L] || 0;
          if (c0 > hh(D.h, i, L)) st = 1; else if (c0 < ll(D.l, i, L)) st = -1;
          else if (st > 0 && c0 < ll(D.l, i, Math.round(L / 2))) st = 0; else if (st < 0 && c0 > hh(D.h, i, Math.round(L / 2))) st = 0;
          p.sub[L] = st; sig += st / b.lookbacks.length;
        }
        if ((!D.act[i] || (D.spec.from && date < D.spec.from)) && p.ct === 0) sig = 0;
        let t = Math.round(sig * risk * b.share * notional() / (D.N[i] * D.pv));
        if (sig !== 0 && t === 0) { stats.entryGranSkip++; stats.granByMkt[s] = (stats.granByMkt[s] || 0) + 1; }
        if (Math.sign(t) === Math.sign(p.ct) && Math.abs(t - p.ct) < Math.max(1, 0.25 * Math.abs(p.ct))) t = p.ct;
        if (t !== p.ct && p.ct !== 0 && Math.sign(t) !== Math.sign(p.ct)) trades.push({ b: b.name, m: s, out: date });
        p.tgt = t;
      }
    }
    for (const D of data) { const i = D.idx.get(date); if (i !== undefined) D.lastI = i; }
    let unreal = 0;
    for (const b of B) for (const [s, p] of Object.entries(b.pos)) {
      const D = bySym[s]; const i = D.lastI; if (i === undefined) continue;
      if (b.type === 'turtle') { for (const u of p.u) unreal += p.dir * (D.c[i] - u.f) * u.ct * D.pv; }
      else unreal += p.ct * (D.c[i] - p.f) * D.pv;
    }
    eq = cash + unreal; if (eq > hwm) hwm = eq; curve.push([date, eq]);
    if (eq <= 0) break;
  }
  return { curve, trades, stats, rolls: Object.fromEntries(data.map(D => [D.spec.s, D.nRolls])) };
}

// buy & hold excess return on a (roll-adjusted) future: daily return = dAdj / rawPrevClose
function buyHold(sym, adjust = true) {
  const D = load(MK.find(m => m.s === sym), { adjust }); const out = []; let e = 1;
  for (let i = 1; i < D.d.length; i++) { if (D.d[i] < START) continue; e *= 1 + (D.c[i] - D.c[i - 1]) / D.raw[i - 1]; out.push([D.d[i], e]); }
  return out;
}
module.exports = { run, load, buyHold, START };
