// node report.js <recommendedName>  -> results.json, yearly_returns.csv, equity_monthly.csv, trades_<rec>.csv, summary table to stdout
'use strict';
const fs = require('fs');
const rec = process.argv[2];
const all = [];
for (const f of fs.readdirSync('out').filter(f => f.startsWith('res_'))) all.push(...JSON.parse(fs.readFileSync('out/' + f)));
const pct = v => v == null || !isFinite(v) ? '' : (v * 100).toFixed(1);
const f2 = v => v == null || !isFinite(v) ? '' : v.toFixed(2);
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'number' ? +v.toPrecision(5) : v));
fs.writeFileSync('results.json', JSON.stringify({
  generated: new Date().toISOString(), recommended: rec,
  notes: 'Original Turtle rules (Faith 2006) on crypto. Execution: hourly bars, ambiguous hours resolved with real 1m bars (Binance Vision / Upbit API). Costs: perp 0.05%/side + 0.1% slip + actual funding; Binance spot 0.1%+0.1%; Upbit 0.05%+0.1%. IS = start..2021-12-31, OOS = 2022-01-01..2026-09-30.',
  runs: all.map(r => strip(Object.assign({}, r, { monthly: undefined }))),
}, null, 1));
// yearly
const years = [...new Set(all.flatMap(r => Object.keys(r.yearly || {})))].sort();
fs.writeFileSync('yearly_returns.csv', 'run,' + years.join(',') + '\n' + all.map(r => r.name + ',' + years.map(y => pct(r.yearly[y])).join(',')).join('\n'));
// monthly equity of main runs
const main = all.filter(r => r.monthly);
const months = [...new Set(main.flatMap(r => r.monthly.map(m => m[0])))].sort();
const mm = main.map(r => new Map(r.monthly));
fs.writeFileSync('equity_monthly.csv', 'month,' + main.map(r => r.name).join(',') + '\n' + months.map(m => m + ',' + mm.map(x => x.has(m) ? x.get(m).toFixed(4) : '').join(',')).join('\n'));
// trades of recommended
if (rec && fs.existsSync(`out/${rec}.trades.json`)) {
  const t = JSON.parse(fs.readFileSync(`out/${rec}.trades.json`));
  const cols = ['sym', 'dir', 'sys', 'entryT', 'exitT', 'units', 'entry', 'exit', 'reason', 'N', 'gross', 'fees', 'funding', 'net', 'R', 'open'];
  fs.writeFileSync(`trades_${rec}.csv`, cols.join(',') + '\n' + t.sort((a, b) => a.entryT < b.entryT ? -1 : 1).map(x => cols.map(c => x[c] === undefined ? '' : typeof x[c] === 'number' ? +x[c].toPrecision(6) : x[c]).join(',')).join('\n'));
  fs.copyFileSync(`out/${rec}.eq.json`, `equity_daily_${rec}.json`);
}
console.log('name | CAGR | vol | Sh | So | MDD | DDdays | n | win | avgW R | avgL R | PF | top10 | expo | gross | cost/yr | fund/yr | IS CAGR | IS Sh | IS MDD | OOS CAGR | OOS Sh | OOS MDD | capL% | capS% | blk');
for (const r of all) {
  const f = r.full, i = r.IS, o = r.OOS;
  console.log([r.name, pct(f.cagr), pct(f.vol), f2(f.sharpe), f2(f.sortino), pct(f.mdd), f.longestDDdays, f.trades, pct(f.winRate), f2(f.avgWinR), f2(f.avgLossR), f2(f.profitFactor), pct(f.top10Share), pct(f.exposure), f2(f.avgGross), pct(f.costDragAnn), pct(f.fundingDragAnn), i ? pct(i.cagr) : '', i ? f2(i.sharpe) : '', i ? pct(i.mdd) : '', pct(o.cagr), f2(o.sharpe), pct(o.mdd), r.limits ? pct(r.limits.capDaysLongPct) : '', r.limits ? pct(r.limits.capDaysShortPct) : '', r.limits ? pct(r.limits.blockedAny) : ''].join(' | '));
}
