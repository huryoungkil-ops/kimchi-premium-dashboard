// 보고서 보완(2026-10-03): ① 수익 집중도 ② 신뢰구간 ③ 파라미터 민감도·워크포워드 ④ 자본 효율
// 사용: node deepcheck.js  → deepcheck_result.json
const fs = require('fs');
const lib = require('./lib5m');
const P0 = Object.assign({}, lib.LIVE_PARAMS);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function boot(a, n = 5000) { const out = []; for (let k = 0; k < n; k++) { let s = 0; for (let i = 0; i < a.length; i++) s += a[(Math.random() * a.length) | 0]; out.push(s / a.length); } out.sort((x, y) => x - y); return [out[(n * 0.025) | 0], out[(n * 0.975) | 0]]; }
const day = ts => new Date(ts + 9 * 3600e3).toISOString().slice(0, 10);

(async () => {
  const ds = await lib.buildDataset({ yearsBack: 6 });
  const base = lib.simulate(ds, P0, { fromRatio: 0, toRatio: 1 });
  const T = base.trades, out = { range: base.range };

  // ① 수익 집중도 — 청산일 기준 일별 손익
  const byDay = {}; for (const t of T) { const d = day(t.exitTs); byDay[d] = (byDay[d] || 0) + t.netProfit; }
  const days = Object.entries(byDay).sort((a, b) => b[1] - a[1]);
  const total = days.reduce((s, [, v]) => s + v, 0);
  const share = k => days.slice(0, k).reduce((s, [, v]) => s + v, 0) / total;
  const nd = days.length;
  out.concentration = { tradingDays: nd, total, top10DaysShare: share(10), top1pctShare: share(Math.ceil(nd * 0.01)), top5pctShare: share(Math.ceil(nd * 0.05)), top10pctShare: share(Math.ceil(nd * 0.10)),
    top15: days.slice(0, 15).map(([d, v]) => ({ d, v: Math.round(v * 100) / 100, n: T.filter(t => day(t.exitTs) === d).length })),
    worst10: days.slice(-10).map(([d, v]) => ({ d, v: Math.round(v * 100) / 100 })),
    // 진입일 기준도(기회가 열린 날)
  };
  const byEntry = {}; for (const t of T) { const d = day(t.entryTs); byEntry[d] = (byEntry[d] || 0) + t.netProfit; }
  const ed = Object.entries(byEntry).sort((a, b) => b[1] - a[1]);
  out.concentration.entryTop10 = ed.slice(0, 10).map(([d, v]) => ({ d, v: Math.round(v) }));
  out.concentration.entryTop5pctShare = ed.slice(0, Math.ceil(ed.length * 0.05)).reduce((s, [, v]) => s + v, 0) / total;
  // 상위 5% 날을 빼면?
  out.concentration.withoutTop5pctAnnual = (total - share(Math.ceil(nd * 0.05)) * total) / 10000 / 6.01 * 100;

  // ② 신뢰구간 — 거래당 손익
  const pnl = T.map(t => t.netProfit);
  out.ci = { trades: pnl.length, meanPerTrade: mean(pnl), sd: sd(pnl), t: mean(pnl) / (sd(pnl) / Math.sqrt(pnl.length)), boot95: boot(pnl) };
  const yrs = {}; for (const t of T) { const y = day(t.exitTs).slice(0, 4); (yrs[y] = yrs[y] || []).push(t.netProfit); }
  out.ci.byYear = Object.fromEntries(Object.entries(yrs).map(([y, a]) => [y, { n: a.length, mean: mean(a), t: mean(a) / (sd(a) / Math.sqrt(a.length)), boot95: boot(a, 2000) }]));
  // 일별 손익 샤프(연환산)
  const allDays = []; { const s = new Date(base.range.from), e = new Date(base.range.to); for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) allDays.push(byDay[d.toISOString().slice(0, 10)] || 0); }
  out.ci.dailySharpe = mean(allDays) / sd(allDays) * Math.sqrt(365);
  // 페이퍼 27건
  const paperRaw = JSON.parse(fs.readFileSync('../backup/data/paper-trades.json', 'utf8'));
  const paper = (Array.isArray(paperRaw) ? paperRaw : paperRaw.trades || paperRaw.rows).filter(t => t.status === 'CLOSED').map(t => t.netProfit);
  out.ci.paper = { n: paper.length, mean: mean(paper), sd: sd(paper), t: mean(paper) / (sd(paper) / Math.sqrt(paper.length)), boot95: boot(paper),
    // 2.5% 연 수익을 «0과 다르다»고 95%로 말하려면 필요한 거래 수 (같은 평균·표준편차 가정)
    tradesNeededFor95: Math.ceil((1.96 * sd(paper) / mean(paper)) ** 2) };

  // ③ 민감도 — 한 번에 하나씩
  const runs = [];
  const run = (label, extra, range = { fromRatio: 0, toRatio: 1 }) => { const r = lib.simulate(ds, Object.assign({}, P0, extra), range); return { label, trades: r.totalTrades, win: r.winRate, net: r.netProfit, cagr: r.cagrPct, mdd: r.maxDrawdownPctMTM }; };
  const grid = { ENTRY_SIGMA: [1.5, 1.75, 2.0, 2.25, 2.5], EXIT_SIGMA_OFFSET: [0, 0.25, 0.5, 1.0], EDGE_MULTIPLE: [1, 2, 3, 4, 5], MAX_HOLD_DAYS: [2, 3, 5, 7, 10], SOFT_HOLD_DAYS: [1, 2, 3, 99], MAX_POSITIONS: [1, 2, 4, 6] };
  for (const [k, vs] of Object.entries(grid)) for (const v of vs) runs.push(Object.assign({ param: k, value: v }, run(`${k}=${v}`, { [k]: v })));
  out.sensitivity = runs;

  // ③-2 워크포워드 — 직전 2년에서 고른 (ENTRY_SIGMA, EXIT_SIGMA_OFFSET, EDGE_MULTIPLE)로 다음 1년을 거래
  const g0 = new Date(base.range.from).getTime(), g1 = new Date(base.range.to).getTime();
  const ratio = s => Math.max(0, Math.min(1, (new Date(s).getTime() - g0) / (g1 - g0)));
  const combos = []; for (const a of [1.5, 2.0, 2.5]) for (const b of [0, 0.25, 0.5]) for (const c of [2, 3, 4]) combos.push({ ENTRY_SIGMA: a, EXIT_SIGMA_OFFSET: b, EDGE_MULTIPLE: c });
  const wf = [];
  for (const y of [2023, 2024, 2025, 2026]) {
    const tr = { fromRatio: ratio(`${y - 2}-01-01`), toRatio: ratio(`${y}-01-01`) }, te = { fromRatio: ratio(`${y}-01-01`), toRatio: ratio(`${y + 1}-01-01`) };
    let best = null; for (const c of combos) { const r = lib.simulate(ds, Object.assign({}, P0, c), tr); if (!best || r.netProfit > best.net) best = { c, net: r.netProfit }; }
    const oos = lib.simulate(ds, Object.assign({}, P0, best.c), te), live = lib.simulate(ds, P0, te);
    // 테스트 구간에서 사후 최고(과최적화 상한)
    let hind = null; for (const c of combos) { const r = lib.simulate(ds, Object.assign({}, P0, c), te); if (!hind || r.netProfit > hind.net) hind = { c, net: r.netProfit }; }
    wf.push({ year: y, chosen: best.c, trainNet: best.net, testNet: oos.netProfit, liveParamsNet: live.netProfit, hindsightBest: hind });
    console.error('wf', y, JSON.stringify(wf.at(-1)));
  }
  out.walkForward = wf;

  // ④ 자본 효율 — 시간 가중 운용률
  const hours = (g1 - g0) / 3600e3; const usedUsdHours = T.reduce((s, t) => s + (t.sizeUsd || 1000) * t.holdHours, 0);
  const util = usedUsdHours / hours / 10000; // 시드 대비 평균 운용 비율 (국내 다리 기준)
  out.capital = { avgUtilizationOfSeed: util, netAnnualOnSeedPct: total / 10000 / ((g1 - g0) / 3.156e10) * 100, netAnnualOnDeployedPct: total / (10000 * util) / ((g1 - g0) / 3.156e10) * 100,
    // 실제 필요 자본: 국내 다리 + 해외 증거금(1배 = 같은 금액) → 운용분의 2배가 묶인다
    note: '해외 1배 증거금까지 치면 운용 자본은 국내 다리의 2배' };
  fs.writeFileSync('deepcheck_result.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ concentration: out.concentration, ci: out.ci, capital: out.capital }, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
  console.log(runs.map(r => `${r.label} n${r.trades} win${r.win} net${Math.round(r.net)} cagr${r.cagr} mdd${r.mdd}`).join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
