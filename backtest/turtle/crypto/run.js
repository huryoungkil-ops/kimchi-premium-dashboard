// usage: node run.js <group>   groups: perp | perpExec | perpBE | spot | upbit | robust | filters
'use strict';
const fs = require('fs');
const E = require('./engine');
const L = require('./lib');
const M1 = require('./m1');
const group = process.argv[2];
const END = '2026-09-30';
const CL = JSON.parse(fs.readFileSync('../../classic/data/spot_BTC_1d.json')).map(r => [new Date(r[0]).toISOString().slice(0, 10), +r[4]]);
const BTCF = L.btcFilterArr(CL);

function universeSets() {
  const pu = JSON.parse(fs.readFileSync('data/perp_universe.json'));
  const sr = JSON.parse(fs.readFileSync('data/spot_rank.json'));
  return { pu, sr };
}
const { pu, sr } = universeSets();
const perpSyms = [...new Set(Object.values(pu).flat())];
const spotSyms = [...new Set(Object.keys(sr).flatMap(k => sr[k].slice(0, 20)))];
const UPBIT = 'BTC ETH XRP ADA DOGE SOL TRX LINK BCH ETC XLM DOT AVAX QTUM NEO SUI HBAR'.split(' ');

const SETS = {
  perp: () => ({ markets: L.loadSet('data/perp1h', perpSyms, 'data/fund'), uni: L.universeFromRank(pu, 20), start: '2019-12-01', base: { fee: 0.0005, slip: 0.001 }, src: M1.source('perp') }),
  perpBE: () => ({ markets: L.loadSet('data/perp1h', ['BTCUSDT', 'ETHUSDT'], 'data/fund'), uni: (() => { const s = new Set(['BTCUSDT', 'ETHUSDT']); return () => s; })(), start: '2019-12-01', base: { fee: 0.0005, slip: 0.001 }, src: M1.source('perp') }),
  spot: () => ({ markets: L.loadSet('data/spot1h', spotSyms, null), uni: L.universeFromRank(sr, 20), start: '2018-01-01', base: { fee: 0.001, slip: 0.001, longOnly: true, spotCash: true }, src: M1.source('spot') }),
  spotBE: () => ({ markets: L.loadSet('data/spot1h', ['BTCUSDT', 'ETHUSDT'], null), uni: (() => { const s = new Set(['BTCUSDT', 'ETHUSDT']); return () => s; })(), start: '2018-01-01', base: { fee: 0.001, slip: 0.001, longOnly: true, spotCash: true }, src: M1.source('spot') }),
  upbit: () => ({ markets: L.loadSet('data/upbit1h', UPBIT, null), uni: (() => { const s = new Set(UPBIT); return () => s; })(), start: '2018-01-01', base: { fee: 0.0005, slip: 0.001, longOnly: true, spotCash: true }, src: M1.source('upbit') }),
};

async function runCombo(set, cfg, parts) { // parts: [[cfgOverride, weight], ...]
  const sd = L.dayOf(set.start), ed = L.dayOf(END);
  let res;
  for (let it = 0; it < 6; it++) {
    set.src.reset(); set.src.missing.clear();
    res = parts.map(([c, w]) => E.run(set.markets, set.uni, Object.assign({}, set.base, cfg, c, { capital: w, minute: set.src }), sd, ed));
    if (!set.src.missing.size) break;
    const n = set.src.missing.size; const f = await M1.fetchMissing(set.src); console.error('  m1 fetch', n, JSON.stringify(f));
    if (!f.done) break;
  }
  return res.length === 1 ? res[0] : L.combine(res);
}
const COMB = [[{ system: 'S1' }, 0.5], [{ system: 'S2' }, 0.5]];
const S1 = [[{ system: 'S1' }, 1]], S2 = [[{ system: 'S2' }, 1]];

function summarize(name, r, set, isFrom) {
  const isTo = '2021-12-31', oosFrom = '2022-01-01';
  const st = r.stats;
  const att = st.attempts || 1;
  return {
    name,
    full: L.metrics(r.eq, r.trades, set.start, END),
    IS: L.metrics(r.eq, r.trades, set.start, isTo),
    OOS: L.metrics(r.eq, r.trades, oosFrom, END),
    yearly: L.yearly(r.eq),
    limits: { capDaysLongPct: (st.capDaysL || 0) / st.days, capDaysShortPct: (st.capDaysS || 0) / st.days, daysGe6UnitsOneDirPct: (st.daysGe6 || 0) / st.days, attempts: st.attempts, blockedPct: Object.fromEntries(Object.entries(st.blocked).map(([k, v]) => [k, v / att])), blockedAny: Object.values(st.blocked).reduce((a, b) => a + b, 0) / att },
    s1: { breakouts: st.s1Breakouts, skipped: st.skipped, failsafeEntries: st.failsafe },
    ddCuts: st.ddCuts, maxGross: st.maxGross, ambiguousBars: st.ambiguousBars, pathDiffBars: st.pathDiffBars, m1Resolved: st.m1Resolved || 0, m1Fallback: st.m1Fallback || 0,
    totals: { fees: st.fees, slip: st.slipCost, funding: st.funding },
    openTrades: r.trades.filter(t => t.open).length,
    monthly: L.monthly(r.eq),
  };
}

const out = [];
async function go(name, set, cfg, parts, keep) {
  const t0 = Date.now();
  const r = await runCombo(set, cfg, parts);
  const s = summarize(name, r, set);
  out.push(s);
  const f = s.full;
  console.log(`${name.padEnd(34)} CAGR ${(f.cagr * 100).toFixed(1).padStart(6)}% MDD ${(f.mdd * 100).toFixed(1).padStart(6)}% Sh ${f.sharpe.toFixed(2)} n=${f.trades} IS ${(s.IS ? s.IS.cagr * 100 : NaN).toFixed(1)}% OOS ${(s.OOS.cagr * 100).toFixed(1)}% blk ${(s.limits.blockedAny * 100).toFixed(0)}% ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (keep) { fs.writeFileSync(`out/${name}.trades.json`, JSON.stringify(r.trades)); fs.writeFileSync(`out/${name}.eq.json`, JSON.stringify(r.eq.map(x => [x.date, x.eq, x.gross, x.units]))); }
  return r;
}
fs.mkdirSync('out', { recursive: true });

(async () => {
if (group === 'perp') {
  const set = SETS.perp();
  await go('A_perp_S1', set, {}, S1, true);
  await go('A_perp_S2', set, {}, S2, true);
  await go('A_perp_COMB', set, {}, COMB, true);
}
if (group === 'perpExec') {
  const set = SETS.perp();
  await go('A_COMB_hourly_worst', set, { pathMode: 'worst' }, COMB);
  await go('A_COMB_hourly_best', set, { pathMode: 'best' }, COMB);
  await go('A_COMB_hourly_near', set, { pathMode: 'near' }, COMB);
  await go('A_COMB_daily_best', set, { pathMode: 'dailyBest' }, COMB);
  await go('A_S1_hourly_worst', set, { pathMode: 'worst' }, S1);
  await go('A_S1_hourly_best', set, { pathMode: 'best' }, S1);
  await go('A_S1_daily_best', set, { pathMode: 'dailyBest' }, S1);
  await go('A_S2_hourly_worst', set, { pathMode: 'worst' }, S2);
  await go('A_S2_hourly_best', set, { pathMode: 'best' }, S2);
  await go('A_S2_daily_best', set, { pathMode: 'dailyBest' }, S2);
  await go('A_COMB_hourly_OHLC', set, { pathMode: 'OHLC' }, COMB);
  await go('A_COMB_daily_worst', set, { pathMode: 'daily' }, COMB);
  await go('A_COMB_slip005', set, { slip: 0.0005 }, COMB);
  await go('A_COMB_slip02', set, { slip: 0.002 }, COMB);
  await go('A_S2_daily_worst', set, { pathMode: 'daily' }, S2);
  await go('A_S1_daily_worst', set, { pathMode: 'daily' }, S1);
}
if (group === 'perpBE') {
  const set = SETS.perpBE();
  await go('C_BE_perp_S1', set, {}, S1);
  await go('C_BE_perp_S2', set, {}, S2);
  await go('C_BE_perp_COMB', set, {}, COMB, true);
}
if (group === 'spot') {
  const set = SETS.spot();
  await go('B_spot_S1', set, {}, S1);
  await go('B_spot_S2', set, {}, S2, true);
  await go('B_spot_COMB', set, {}, COMB, true);
  await go('F_spot_COMB_btcMA', set, { btcFilter: BTCF }, COMB);
  await go('F_spot_S2_btcMA', set, { btcFilter: BTCF }, S2);
  const be = SETS.spotBE();
  await go('C_BE_spot_COMB', be, {}, COMB, true);
  await go('C_BE_spot_S2', be, {}, S2);
}
if (group === 'upbit') {
  const set = SETS.upbit();
  await go('B_upbit_S1', set, {}, S1);
  await go('B_upbit_S2', set, {}, S2, true);
  await go('B_upbit_COMB', set, {}, COMB, true);
  await go('F_upbit_COMB_btcMA', set, { btcFilter: BTCF }, COMB);
}
if (group === 'robust') {
  const set = SETS.perp();
  for (const en of [20, 40, 55, 100]) for (const ex of [10, 20]) await go(`E_GEN_${en}_${ex}`, set, { system: 'GEN', entry: en, exit: ex }, [[{}, 1]]);
  for (const rk of [0.005, 0.02]) await go(`E_COMB_risk${rk * 100}`, set, { risk: rk }, COMB);
  await go('E_COMB_add1N', set, { addN: 1 }, COMB);
  await go('E_COMB_whipsaw', set, { whipsaw: true }, COMB);
  await go('E_COMB_noLimits', set, { useLimits: false }, COMB);
  await go('E_COMB_dailyN', set, { weeklyN: false }, COMB);
  await go('E_COMB_noDDrule', set, { ddRule: false }, COMB);
}
if (group === 'filters') {
  const set = SETS.perp();
  await go('F_perp_COMB_btcMA', set, { btcFilter: BTCF }, COMB, true);
  await go('F_perp_S2_btcMA', set, { btcFilter: BTCF }, S2);
  await go('F_perp_ensemble', set, {}, [[{ system: 'GEN', entry: 20, exit: 10 }, 1 / 3], [{ system: 'GEN', entry: 55, exit: 20 }, 1 / 3], [{ system: 'GEN', entry: 100, exit: 50 }, 1 / 3]], true);
  await go('F_perp_ensemble_btcMA', set, { btcFilter: BTCF }, [[{ system: 'GEN', entry: 20, exit: 10 }, 1 / 3], [{ system: 'GEN', entry: 55, exit: 20 }, 1 / 3], [{ system: 'GEN', entry: 100, exit: 50 }, 1 / 3]]);
  await go('F_perp_longOnly_COMB', set, { longOnly: true }, COMB);
}
if (group === 'extra') {
  const all = SETS.perp();
  for (const k of [5, 10]) { const set = Object.assign({}, all, { uni: L.universeFromRank(pu, k) }); await go('C_perp_top' + k + '_COMB', set, {}, COMB); }
  const be = SETS.perpBE();
  await go('C_BE_perp_COMB_risk05', be, { risk: 0.005 }, COMB);
  await go('F_BE_perp_COMB_btcMA', be, { btcFilter: BTCF }, COMB);
  await go('C_BE_perp_COMB_worst', be, { pathMode: 'worst' }, COMB);
  await go('C_BE_perp_COMB_best', be, { pathMode: 'best' }, COMB);
  await go('C_BE_perp_COMB_dailyWorst', be, { pathMode: 'daily' }, COMB);
  await go('C_BE_perp_COMB_dailyBest', be, { pathMode: 'dailyBest' }, COMB);
  await go('C_BE_perp_COMB_slip02', be, { slip: 0.002 }, COMB);
  await go('C_BE_perp_longOnly_COMB', be, { longOnly: true }, COMB);
  const sb = SETS.spotBE();
  await go('C_BE_spot_COMB_worst', sb, { pathMode: 'worst' }, COMB);
  await go('C_BE_spot_COMB_best', sb, { pathMode: 'best' }, COMB);
  await go('C_BE_spot_COMB_dailyWorst', sb, { pathMode: 'daily' }, COMB);
  await go('C_BE_spot_COMB_slip02', sb, { slip: 0.002 }, COMB);
  await go('C_BE_spot_COMB_risk05', sb, { risk: 0.005 }, COMB);
  await go('C_BE_spot_S1', sb, {}, S1);
  await go('F_BE_spot_COMB_btcMA', sb, { btcFilter: BTCF }, COMB);
  const ub = Object.assign(SETS.upbit(), {}); const s2 = new Set(['BTC', 'ETH']);
  ub.markets = ub.markets.filter(m => s2.has(m.sym)); ub.uni = () => s2;
  await go('C_BE_upbit_COMB', ub, {}, COMB, true);
  await go('C_BE_upbit_S1', ub, {}, S1);
  await go('C_BE_upbit_S2', ub, {}, S2);
  await go('C_BE_upbit_COMB_worst', ub, { pathMode: 'worst' }, COMB);
  await go('C_BE_upbit_COMB_dailyWorst', ub, { pathMode: 'daily' }, COMB);
}
if (group === 'rec') {
  const sb = SETS.spotBE();
  await go('REC_spot_BE_COMB_r05', sb, { risk: 0.005 }, COMB, true);
  await go('REC_spot_BE_COMB_r05_worst', sb, { risk: 0.005, pathMode: 'worst' }, COMB);
  await go('REC_spot_BE_COMB_r05_dailyWorst', sb, { risk: 0.005, pathMode: 'daily' }, COMB);
  await go('REC_spot_BE_COMB_r05_slip02', sb, { risk: 0.005, slip: 0.002 }, COMB);
  await go('REC_spot_BE_COMB_r05_add1N', sb, { risk: 0.005, addN: 1 }, COMB);
  const ub = SETS.upbit(); const s2 = new Set(['BTC', 'ETH']); ub.markets = ub.markets.filter(m => s2.has(m.sym)); ub.uni = () => s2;
  await go('REC_upbit_BE_COMB_r05', ub, { risk: 0.005 }, COMB, true);
  await go('REC_upbit_BE_COMB_r05_worst', ub, { risk: 0.005, pathMode: 'worst' }, COMB);
  await go('REC_upbit_BE_COMB_r05_dailyWorst', ub, { risk: 0.005, pathMode: 'daily' }, COMB);
  const s5 = SETS.spot(); s5.uni = L.universeFromRank(sr, 5);
  await go('B_spot_top5_COMB_r05', s5, { risk: 0.005 }, COMB);
}
if (group === 'rec2') {
  const s5 = SETS.spot(); s5.uni = L.universeFromRank(sr, 5);
  await go('B_spot_top5_COMB_r05_worst', s5, { risk: 0.005, pathMode: 'worst' }, COMB);
  await go('B_spot_top5_COMB_r05_dailyWorst', s5, { risk: 0.005, pathMode: 'daily' }, COMB);
  await go('B_spot_top5_COMB_r1', s5, {}, COMB);
  const s10 = SETS.spot(); s10.uni = L.universeFromRank(sr, 10);
  await go('B_spot_top10_COMB_r05', s10, { risk: 0.005 }, COMB);
  const s20 = SETS.spot();
  await go('B_spot_top20_COMB_r05', s20, { risk: 0.005 }, COMB);
}
if (group === 'bench') {
  for (const [nm, from, closes, fee] of [['perp', '2019-12-01', CL, 0.001], ['spot', '2018-01-01', CL, 0.001]]) {
    const b = L.bench(closes, from, END, fee);
    for (const [k, eq] of [['BTC_BH', b.bh], ['BTC_MA120', b.ma]]) {
      out.push({ name: `${k}_${nm}`, full: L.metrics(eq, [], from, END), IS: L.metrics(eq, [], from, '2021-12-31'), OOS: L.metrics(eq, [], '2022-01-01', END), yearly: L.yearly(eq), monthly: L.monthly(eq) });
      const f = out[out.length - 1].full; console.log(k, nm, (f.cagr * 100).toFixed(1), (f.mdd * 100).toFixed(1), f.sharpe.toFixed(2));
    }
  }
  const up = JSON.parse(fs.readFileSync('data/upbit1h/BTC.json'));
  const m = E.buildMarket('KRW-BTC', up, null); const ucl = Array.from(m.dC, (c, i) => [new Date((m.d0 + i) * 864e5).toISOString().slice(0, 10), c]);
  const b = L.bench(ucl, '2018-04-01', END, 0.0005);
  for (const [k, eq] of [['BTC_BH', b.bh], ['BTC_MA120', b.ma]]) {
    out.push({ name: `${k}_upbitKRW`, full: L.metrics(eq, [], '2018-04-01', END), IS: L.metrics(eq, [], '2018-04-01', '2021-12-31'), OOS: L.metrics(eq, [], '2022-01-01', END), yearly: L.yearly(eq), monthly: L.monthly(eq) });
    const f = out[out.length - 1].full; console.log(k, 'upbit', (f.cagr * 100).toFixed(1), (f.mdd * 100).toFixed(1), f.sharpe.toFixed(2));
  }
}
fs.writeFileSync(`out/res_${group}.json`, JSON.stringify(out));
})();
