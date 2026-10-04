// Parameter robustness grid for all four signal families
const fs = require('fs');
const { prep } = require('./data_prep');
const { run, metrics } = require('./lib');
const St = require('./strategies');
const D = prep();
const r4 = x => x == null || !isFinite(x) ? x : Math.round(x * 10000) / 10000;
const rows = [];
function go(fam, params, s, opts = {}) {
  const r = run(D, s, opts);
  const f = metrics(r.eq, D.dates, '2019-09-08', '2026-10-04', r.trades), is = metrics(r.eq, D.dates, '2019-09-08', '2021-12-31'), oos = metrics(r.eq, D.dates, '2022-01-01', '2026-10-04', r.trades);
  rows.push({ fam, ...params, maxPos: opts.maxPos || 10, cagr: r4(f.cagr), sharpe: r4(f.sharpe), mdd: r4(f.mdd), trades: f.trades, pf: r4(f.profitFactor), isCagr: r4(is.cagr), isSharpe: r4(is.sharpe), oosCagr: r4(oos.cagr), oosSharpe: r4(oos.sharpe), oosMdd: r4(oos.mdd), funding: r4(r.fundingTot) });
}
for (const entry of [20, 40, 55, 100]) for (const exit of [10, 20, 40]) for (const stopMult of [2, 3]) for (const maxPos of [10, 20])
  go('A_turtle', { entry, exit, stopMult }, St.turtle({ entry, exit, stopMult }), { maxPos });
for (const ma of [60, 120, 200]) for (const brk of [10, 20, 40]) for (const btcRegime of [false, true]) for (const exitMA of [50, 100000])
  go('B_trend', { ma, brk, btcRegime, exitMA: exitMA > 1000 ? 'none' : exitMA }, St.trendB({ ma, brk, btcRegime, exitMA }));
for (const X of [0.3, 0.4, 0.5]) for (const lb of [30, 90]) for (const atrMult of [1.2, 1.5, 2]) for (const exitHH of [10, 20])
  go('C_crash', { X, lb, atrMult, exitHH }, St.crashC({ X, lb, atrMult, exitHH }));
for (const k of [3, 5, 10]) for (const lookback of [14, 28, 56]) for (const btcRegime of [false, true])
  go('D_relweak', { k, lookback, btcRegime }, St.relD({ k, lookback, btcRegime }));
const summary = {};
for (const fam of ['A_turtle', 'B_trend', 'C_crash', 'D_relweak']) {
  const R = rows.filter(r => r.fam === fam);
  summary[fam] = { runs: R.length, oosCagrPositive: R.filter(r => r.oosCagr > 0).length, isCagrPositive: R.filter(r => r.isCagr > 0).length, bothPositive: R.filter(r => r.oosCagr > 0 && r.isCagr > 0).length,
    medianFullSharpe: r4(R.map(r => r.sharpe).sort((a, b) => a - b)[Math.floor(R.length / 2)]), medianOosSharpe: r4(R.map(r => r.oosSharpe).sort((a, b) => a - b)[Math.floor(R.length / 2)]),
    bestFull: R.reduce((a, b) => b.sharpe > a.sharpe ? b : a), worstFull: R.reduce((a, b) => b.sharpe < a.sharpe ? b : a) };
}
fs.writeFileSync('results_grid.json', JSON.stringify({ summary, rows }, null, 1));
const cols = Object.keys(rows[0]).concat(['ma', 'brk', 'btcRegime', 'exitMA', 'X', 'lb', 'atrMult', 'exitHH', 'k', 'lookback']).filter((v, i, a) => a.indexOf(v) === i);
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/grid.csv', cols.join(',') + '\n' + rows.map(r => cols.map(c => r[c] ?? '').join(',')).join('\n'));
console.log(JSON.stringify(summary, null, 1));
