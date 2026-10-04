// Strategy definitions (all signals on daily close t, executed at open t+1 = 00:00 UTC, i.e. the first 1h/4h bar open)
const { I } = require('./lib');

function common(S, i, f, ctx) {
  // shared filters: liquidity, listing age, funding, BTC regime
  const adv = I(S, 'ADV', 20)[i]; if (!(adv >= (f.minADV ?? 5e6))) return false;
  const age = I(S, 'AGE')[i];
  if (f.ageMax && !(age <= f.ageMax)) return false;
  if (f.ageMin && !(age >= f.ageMin)) return false;
  if (f.fundMin != null && S.hasF && S.fLast[i] < f.fundMin) return false; // skip if funding deeply negative
  if (f.btcRegime && !ctx.D.btcBear[i]) return false;
  return true;
}

function turtle(p = {}) {
  const P = Object.assign({ entry: 55, exit: 20, stopMult: 2, risk: 0.01, units: 4, nLen: 20 }, p);
  return {
    name: `turtle_E${P.entry}_X${P.exit}_S${P.stopMult}N_r${P.risk}_u${P.units}` + (P.tag || ''),
    params: P, riskPerUnit: P.risk, stopMult: P.stopMult, sizeStopMult: P.stopMult, maxUnits: P.units,
    entrySignal(S, i, ctx) {
      const LL = I(S, 'LL', P.entry)[i], N = I(S, 'N', P.nLen)[i];
      if (!(S.c[i] < LL) || !(N > 0)) return null;
      if (!common(S, i, P, ctx)) return null;
      const peak = I(S, 'HHin', 90)[i];
      return { sym: S.sym, score: I(S, 'RET', 20)[i] || 0, N, peakToEntry: peak > 0 ? 1 - S.c[i] / peak : null };
    },
    exitSignal(S, i) { return S.c[i] > I(S, 'HH', P.exit)[i]; },
    addSignal(S, i, pos) { return S.c[i] <= pos.lastFill - 0.5 * pos.N; },
  };
}

function trendB(p = {}) {
  const P = Object.assign({ ma: 120, brk: 20, exitHH: 20, exitMA: 50, btcRegime: true, risk: 0.01, stopMult: null }, p);
  return {
    name: `trend_MA${P.ma}_B${P.brk}_X${P.exitHH}/MA${P.exitMA}_btc${P.btcRegime ? 1 : 0}_r${P.risk}_stop${P.stopMult || 'none'}` + (P.tag || ''),
    params: P, riskPerUnit: P.risk, stopMult: P.stopMult, sizeStopMult: P.stopMult || 2, maxUnits: 1,
    entrySignal(S, i, ctx) {
      const MA = I(S, 'MA', P.ma)[i], LL = I(S, 'LL', P.brk)[i], N = I(S, 'N', 20)[i];
      if (!(S.c[i] < MA && S.c[i] < LL && N > 0)) return null;
      if (!common(S, i, P, ctx)) return null;
      const peak = I(S, 'HHin', 90)[i];
      return { sym: S.sym, score: I(S, 'RET', 20)[i] || 0, N, peakToEntry: peak > 0 ? 1 - S.c[i] / peak : null };
    },
    exitSignal(S, i) { return S.c[i] > I(S, 'HH', P.exitHH)[i] || S.c[i] > I(S, 'MA', P.exitMA)[i]; },
  };
}

function crashC(p = {}) {
  const P = Object.assign({ X: 0.4, lb: 30, atrMult: 1.5, volMult: 2, exitHH: 10, stopMult: 2, maxHold: 60, risk: 0.01 }, p);
  return {
    name: `crash_X${P.X}_lb${P.lb}_atr${P.atrMult}_vol${P.volMult}_ex${P.exitHH}_S${P.stopMult}N_h${P.maxHold}` + (P.tag || ''),
    params: P, riskPerUnit: P.risk, stopMult: P.stopMult, sizeStopMult: P.stopMult || 2, maxUnits: 1, maxHold: P.maxHold,
    entrySignal(S, i, ctx) {
      const hh = I(S, 'HHin', P.lb)[i], N = I(S, 'N', 20)[i], Nm = I(S, 'NMAprev', 60)[i], vm = I(S, 'VMAprev', 20)[i];
      if (!(S.c[i] <= (1 - P.X) * hh)) return null;
      if (!(N > P.atrMult * Nm)) return null;
      if (!(S.v[i] > P.volMult * vm)) return null;
      if (!common(S, i, P, ctx)) return null;
      return { sym: S.sym, score: I(S, 'RET', 20)[i] || 0, N, peakToEntry: 1 - S.c[i] / hh };
    },
    exitSignal(S, i) { return S.c[i] > I(S, 'HH', P.exitHH)[i]; },
  };
}

function relD(p = {}) {
  const P = Object.assign({ k: 5, lookback: 28, minADV: 20e6, ma: 120, risk: 0.01, stopMult: null, ageMin: 60 }, p);
  return {
    name: `relweak_k${P.k}_lb${P.lookback}_adv${P.minADV / 1e6}M_MA${P.ma}_btc${P.btcRegime ? 1 : 0}_stop${P.stopMult || 'none'}` + (P.tag || ''),
    params: P, riskPerUnit: P.risk, stopMult: P.stopMult, sizeStopMult: P.stopMult || 2, maxUnits: 1,
    exitSignal() { return false; },
    rebalance(i, list, ctx) {
      const dow = new Date(ctx.D.dates[i] + 'T00:00:00Z').getUTCDay();
      if (dow !== 0) return null; // Sunday close -> Monday 00:00 open
      const B = ctx.D.syms.BTCUSDT; const br = I(B, 'RET', P.lookback)[i];
      const elig = [];
      for (const S of list) {
        if (isNaN(S.c[i]) || require('./lib').nextBar(S, i) < 0) continue;
        if (!(S.c[i] < I(S, 'MA', P.ma)[i])) continue;
        if (!common(S, i, P, ctx)) continue;
        const r = I(S, 'RET', P.lookback)[i]; const N = I(S, 'N', 20)[i];
        if (isNaN(r) || !(N > 0)) continue;
        elig.push({ sym: S.sym, score: r - (br || 0), N, peakToEntry: null });
      }
      elig.sort((a, b) => a.score - b.score);
      if (P.btcRegime && !ctx.D.btcBear[i]) return { exits: [...ctx.pos.keys()], entries: [] };
      const target = elig.slice(0, P.k); const ts = new Set(target.map(x => x.sym));
      return { exits: [...ctx.pos.keys()].filter(s => !ts.has(s)), entries: target.filter(x => !ctx.pos.has(x.sym)) };
    },
  };
}
module.exports = { turtle, trendB, crashC, relD };
