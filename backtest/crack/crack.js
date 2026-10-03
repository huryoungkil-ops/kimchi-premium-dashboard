// 3-2-1 크랙 스프레드 심층 백테스트 (2026-10-03)
// 크랙 = 제품 바스켓(휘발유 2 + 난방유 1, 배럴 환산) 대 원유 3. 평균회귀 규칙은 김프 봇과 같다:
//   z = (s − N일 평균) / N일 표준편차 (당일까지만), |z| > 진입선이면 반대 방향으로 진입, 평균을 exit만큼 지나면 청산,
//   최대 H일 보유, 신호 다음 날(+delay) 종가 체결, 한 번에 한 포지션, 두 다리 같은 금액.
// 손익: 제품 바스켓 다리 수익률 − 원유 다리 수익률 (한쪽 다리 명목 대비 %), 일별 평가.
// 사용: node crack.js  → crack_result.json
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, 'data');

function csv(f) {
  const rows = fs.readFileSync(path.join(D, f), 'utf8').trim().split(/\r?\n/).slice(1);
  const m = new Map();
  for (const r of rows) { const [d, v] = r.split(','); const x = Number(v); if (d && Number.isFinite(x) && x > 0) m.set(d, x); }
  return m;
}
// 시리즈 묶기: 날짜 교집합
function join(...ms) {
  const dates = [...ms[0].keys()].filter(d => ms.every(m => m.has(d))).sort();
  return dates.map(d => ({ d, v: ms.map(m => m.get(d)) }));
}

// 데이터셋 정의: 원유(배럴당 $) vs 제품(갤런당 $ × 42)
const DATASETS = {
  fut321: () => join(csv('CL_F.csv'), csv('RB_F.csv'), csv('HO_F.csv')).map(r => ({ d: r.d, crude: r.v[0], prod: (2 * r.v[1] + r.v[2]) * 42 / 3 })),
  spot321: () => join(csv('DCOILWTICO.csv'), csv('DGASNYH.csv'), csv('DHOILNYH.csv')).map(r => ({ d: r.d, crude: r.v[0], prod: (2 * r.v[1] + r.v[2]) * 42 / 3 })),
  futGas: () => join(csv('CL_F.csv'), csv('RB_F.csv')).map(r => ({ d: r.d, crude: r.v[0], prod: r.v[1] * 42 })),
  futHO: () => join(csv('CL_F.csv'), csv('HO_F.csv')).map(r => ({ d: r.d, crude: r.v[0], prod: r.v[1] * 42 })),
  brent321: () => join(csv('BZ_F.csv'), csv('RB_F.csv'), csv('HO_F.csv')).map(r => ({ d: r.d, crude: r.v[0], prod: (2 * r.v[1] + r.v[2]) * 42 / 3 })),
};
// 틱: CL 0.01$/bbl, RB/HO 0.0001$/gal(=0.0042$/bbl)
const TICK = { crude: 0.01, prod: 0.0042 };

function backtest(data, o = {}) {
  const N = o.N ?? 60, ENTRY = o.entry ?? 2, EXIT = o.exit ?? 0.25, H = o.H ?? 20, DELAY = o.delay ?? 0;
  const BP = o.bp ?? 4, DIR = o.dir ?? 'both', STOPZ = o.stopZ ?? null, SPREAD = o.spread ?? 'log', SEASON = o.season ?? false;
  const n = data.length;
  // 스프레드 값
  const s = data.map(r => SPREAD === 'log' ? Math.log(r.prod / r.crude) : (r.prod - r.crude));
  // 계절 조정: 같은 달의 과거 5년 평균을 뺀다(과거만)
  let x = s;
  if (SEASON) {
    x = s.map((v, i) => {
      const mon = data[i].d.slice(5, 7), y = Number(data[i].d.slice(0, 4)); let sum = 0, c = 0;
      for (let j = i - 1; j >= 0 && Number(data[j].d.slice(0, 4)) >= y - 5; j--) if (data[j].d.slice(5, 7) === mon && data[j].d.slice(0, 4) !== String(y)) { sum += s[j]; c++; }
      return c > 20 ? v - sum / c : NaN;
    });
  }
  const z = new Array(n).fill(NaN);
  for (let i = N; i < n; i++) {
    let sum = 0, sq = 0, c = 0;
    for (let j = i - N + 1; j <= i; j++) { if (!Number.isFinite(x[j])) continue; sum += x[j]; sq += x[j] * x[j]; c++; }
    if (c < N * 0.8 || !Number.isFinite(x[i])) continue;
    const m = sum / c, sd = Math.sqrt(Math.max(1e-12, sq / c - m * m)); z[i] = (x[i] - m) / sd;
  }
  const cost = r => 2 * (BP / 1e4 + TICK.crude / r.crude) + 2 * (BP / 1e4 + TICK.prod / r.prod); // 두 다리 왕복 (%/100)
  const daily = new Array(n).fill(0), trades = [];
  let pos = null;
  for (let i = N; i < n - 1 - DELAY; i++) {
    const zi = z[i]; if (!Number.isFinite(zi)) continue;
    if (!pos) {
      let side = 0;
      if (zi < -ENTRY && DIR !== 'short') side = 1;        // 제품이 원유 대비 싸다 → 크랙 매수(제품 롱, 원유 숏)
      else if (zi > ENTRY && DIR !== 'long') side = -1;    // 크랙 매도
      if (side) pos = { side, i0: i + 1 + DELAY, sig: i, z0: zi };
    } else if (i >= pos.i0) {
      const held = i - pos.i0;
      let why = null;
      if (pos.side === 1 && zi > EXIT) why = 'SIGNAL'; else if (pos.side === -1 && zi < -EXIT) why = 'SIGNAL';
      else if (STOPZ && Math.abs(zi) > STOPZ && Math.sign(zi) === -pos.side) why = 'STOP';
      else if (held >= H) why = 'TIME';
      if (why) {
        const i1 = i + 1 + DELAY, a = data[pos.i0], b = data[i1];
        const gross = pos.side * ((b.prod / a.prod - 1) - (b.crude / a.crude - 1));
        const c = cost(a) / 2 + cost(b) / 2;
        // 일별 평가손익 (진입 다음 날부터 청산일까지)
        for (let k = pos.i0 + 1; k <= i1; k++) daily[k] += pos.side * ((data[k].prod / data[k - 1].prod - 1) - (data[k].crude / data[k - 1].crude - 1));
        daily[pos.i0] -= cost(a) / 2; daily[i1] -= cost(b) / 2;
        trades.push({ entry: a.d, exit: b.d, side: pos.side, days: i1 - pos.i0, z0: pos.z0, gross: gross * 100, net: (gross - c) * 100, why, crudeAtEntry: a.crude, crackUsd: a.prod - a.crude });
        pos = null; i = i1 - 1 - DELAY; // 청산 다음 날부터 다시 신호
      }
    }
  }
  return { trades, daily, dates: data.map(r => r.d), z };
}

const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function stats(r, from = null, to = null) {
  const idx = r.dates.map((d, i) => i).filter(i => (!from || r.dates[i] >= from) && (!to || r.dates[i] < to));
  const dl = idx.map(i => r.daily[i]);
  const tr = r.trades.filter(t => (!from || t.entry >= from) && (!to || t.entry < to));
  const years = dl.length / 252;
  let eq = 0, pk = 0, mdd = 0; for (const v of dl) { eq += v; pk = Math.max(pk, eq); mdd = Math.min(mdd, eq - pk); }
  const nets = tr.map(t => t.net).sort((a, b) => b - a), tot = nets.reduce((s, v) => s + v, 0);
  const top5 = nets.slice(0, Math.max(1, Math.ceil(nets.length * 0.05))).reduce((s, v) => s + v, 0);
  return {
    years: +years.toFixed(1), trades: tr.length, perYear: +(tr.length / years).toFixed(1), win: +(tr.filter(t => t.net > 0).length / Math.max(1, tr.length) * 100).toFixed(1),
    avgNet: +mean(tr.map(t => t.net)).toFixed(2), annual: +(eq / years * 100).toFixed(2), sharpe: +(mean(dl) / (sd(dl) || 1) * Math.sqrt(252)).toFixed(2),
    mdd: +(mdd * 100).toFixed(1), worst: +(Math.min(...tr.map(t => t.net), 0)).toFixed(1), best: +(Math.max(...tr.map(t => t.net), 0)).toFixed(1),
    top5Share: tot ? +(top5 / tot * 100).toFixed(0) : null, avgDays: +mean(tr.map(t => t.days)).toFixed(1),
    inMarket: +(tr.reduce((s, t) => s + t.days, 0) / Math.max(1, dl.length) * 100).toFixed(0),
  };
}

const out = {};
const F = DATASETS.fut321(), S = DATASETS.spot321();
const base = backtest(F);
out.range = [F[0].d, F.at(-1).d];
out.base = stats(base);

// 1) 스프레드 정의별
out.definitions = {};
for (const [k, fn] of Object.entries(DATASETS)) { const d = fn(); out.definitions[k] = Object.assign({ from: d[0].d }, stats(backtest(d))); }
out.definitions.fut321_dollar = stats(backtest(F, { spread: 'usd' }));
out.definitions.fut321_seasonal = stats(backtest(F, { season: true }));
out.definitions.spot321_seasonal = stats(backtest(S, { season: true }));

// 2) 방향
out.direction = { both: out.base, long: stats(backtest(F, { dir: 'long' })), short: stats(backtest(F, { dir: 'short' })) };

// 3) 파라미터 격자 (N × 진입선), 청산 0.25, H 20
out.gridNxEntry = {};
for (const N of [20, 40, 60, 90, 120, 250]) for (const e of [1.5, 2, 2.5, 3]) { const s = stats(backtest(F, { N, entry: e })); out.gridNxEntry[`${N}|${e}`] = { sharpe: s.sharpe, annual: s.annual, trades: s.trades, mdd: s.mdd }; }
out.gridExitH = {};
for (const ex of [0, 0.25, 0.5, 1]) for (const H of [5, 10, 20, 40, 60]) { const s = stats(backtest(F, { exit: ex, H })); out.gridExitH[`${ex}|${H}`] = { sharpe: s.sharpe, annual: s.annual, trades: s.trades, mdd: s.mdd }; }
// 현물판 격자도 (롤 영향 없는 확인)
out.gridSpotNxEntry = {};
for (const N of [20, 40, 60, 90, 120, 250]) for (const e of [1.5, 2, 2.5, 3]) { const s = stats(backtest(S, { N, entry: e })); out.gridSpotNxEntry[`${N}|${e}`] = { sharpe: s.sharpe, annual: s.annual }; }

// 4) 비용·지연·손절
out.costs = {}; for (const bp of [0, 4, 10, 20, 30, 50]) out.costs[bp] = stats(backtest(F, { bp }));
out.delay = {}; for (const dl of [0, 1, 2, 3, 5]) out.delay[dl] = stats(backtest(F, { delay: dl }));
out.stops = { none: out.base }; for (const st of [3, 3.5, 4, 5]) out.stops['z' + st] = stats(backtest(F, { stopZ: st }));

// 5) 연도별·5년 구간
out.yearly = {};
const years = [...new Set(F.map(r => r.d.slice(0, 4)))];
for (const y of years) { const s = stats(base, `${y}-01-01`, `${+y + 1}-01-01`); out.yearly[y] = { annual: s.annual, trades: s.trades, sharpe: s.sharpe, mdd: s.mdd }; }
out.blocks = {}; for (const [a, b] of [[2000, 2005], [2005, 2010], [2010, 2015], [2015, 2020], [2020, 2027]]) out.blocks[`${a}-${b - 1}`] = stats(base, `${a}-01-01`, `${b}-01-01`);

// 6) 롤링 워크포워드: 매년 직전 5년에서 (N, 진입선) 최고 샤프를 골라 그해 거래
out.walkForward = [];
let wfDaily = [];
for (let y = 2006; y <= 2026; y++) {
  let best = null;
  for (const N of [20, 40, 60, 90, 120]) for (const e of [1.5, 2, 2.5]) {
    const r = backtest(F, { N, entry: e }); const s = stats(r, `${y - 5}-01-01`, `${y}-01-01`);
    if (!best || s.sharpe > best.sharpe) best = { N, entry: e, sharpe: s.sharpe, r };
  }
  const t = stats(best.r, `${y}-01-01`, `${y + 1}-01-01`), b = stats(base, `${y}-01-01`, `${y + 1}-01-01`);
  out.walkForward.push({ year: y, chose: `${best.N}일/${best.entry}σ`, trainSharpe: best.sharpe, testAnnual: t.annual, baseAnnual: b.annual });
  best.r.dates.forEach((d, i) => { if (d >= `${y}-01-01` && d < `${y + 1}-01-01`) wfDaily.push(best.r.daily[i]); });
}
out.walkForwardSummary = { annual: +(mean(wfDaily) * 252 * 100).toFixed(2), sharpe: +(mean(wfDaily) / sd(wfDaily) * Math.sqrt(252)).toFixed(2),
  baseSame: (() => { const s = stats(base, '2006-01-01'); return { annual: s.annual, sharpe: s.sharpe }; })() };

// 7) 부트스트랩: 거래 단위 재표본으로 연수익·샤프 95% 구간 (블록 = 거래)
{
  const tr = base.trades.map(t => t.net), yrs = out.base.years, B = 5000, ann = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < tr.length; i++) s += tr[(Math.random() * tr.length) | 0]; ann.push(s / yrs); }
  ann.sort((a, b) => a - b);
  out.bootstrap = { annualP2_5: +ann[B * 0.025 | 0].toFixed(2), annualP50: +ann[B / 2 | 0].toFixed(2), annualP97_5: +ann[B * 0.975 | 0].toFixed(2), probLoss: +(ann.filter(v => v < 0).length / B * 100).toFixed(2), tStat: +(mean(tr) / (sd(tr) / Math.sqrt(tr.length))).toFixed(2) };
}

// 8) 거래 분석
const T = base.trades;
out.tradeDist = (() => { const bins = [-20, -10, -5, -2, 0, 2, 5, 10, 20, 100]; const c = new Array(bins.length - 1).fill(0); for (const t of T) for (let k = 0; k < bins.length - 1; k++) if (t.net >= bins[k] && t.net < bins[k + 1]) { c[k]++; break; } return { bins, counts: c }; })();
out.exitReasons = T.reduce((m, t) => (m[t.why] = (m[t.why] || 0) + 1, m), {});
out.bySide = { long: stats({ ...base, trades: T.filter(t => t.side === 1) }), short: stats({ ...base, trades: T.filter(t => t.side === -1) }) };
out.best10 = [...T].sort((a, b) => b.net - a.net).slice(0, 10).map(t => ({ entry: t.entry, exit: t.exit, side: t.side, days: t.days, net: +t.net.toFixed(1), crack: +t.crackUsd.toFixed(1) }));
out.worst10 = [...T].sort((a, b) => a.net - b.net).slice(0, 10).map(t => ({ entry: t.entry, exit: t.exit, side: t.side, days: t.days, net: +t.net.toFixed(1), crack: +t.crackUsd.toFixed(1) }));
out.byEntryMonth = {}; for (const t of T) { const m = t.entry.slice(5, 7); (out.byEntryMonth[m] = out.byEntryMonth[m] || []).push(t.net); }
for (const m in out.byEntryMonth) { const a = out.byEntryMonth[m]; out.byEntryMonth[m] = { n: a.length, avg: +mean(a).toFixed(2), win: +(a.filter(v => v > 0).length / a.length * 100).toFixed(0) }; }

// 9) 낙폭 구간 상위 5개
{
  let eq = 0, pk = 0, pkI = 0, cur = null; const dds = [];
  base.daily.forEach((v, i) => {
    eq += v;
    if (eq >= pk) { if (cur) { cur.recovered = base.dates[i]; dds.push(cur); cur = null; } pk = eq; pkI = i; }
    else { const dd = eq - pk; if (!cur) cur = { start: base.dates[pkI], trough: base.dates[i], depth: dd }; else if (dd < cur.depth) { cur.depth = dd; cur.trough = base.dates[i]; } }
  });
  if (cur) { cur.recovered = null; dds.push(cur); }
  out.drawdowns = dds.sort((a, b) => a.depth - b.depth).slice(0, 5).map(x => ({ start: x.start, trough: x.trough, recovered: x.recovered, depthPct: +(x.depth * 100).toFixed(1) }));
}

// 10) 다른 시장과의 상관 (월간): 원유 가격, S&P500 선물
{
  const es = csv('ES_F.csv'); const mret = {};
  base.dates.forEach((d, i) => { const m = d.slice(0, 7); mret[m] = (mret[m] || 0) + base.daily[i]; });
  const lastOf = (series) => { const o = {}; for (const [d, v] of series) o[d.slice(0, 7)] = v; return o; };
  const cm = lastOf(F.map(r => [r.d, r.crude])), em = lastOf([...es.entries()].sort());
  const months = Object.keys(mret).sort(); const a = [], b = [], c = [];
  for (let k = 1; k < months.length; k++) { const m = months[k], p = months[k - 1]; if (cm[m] && cm[p] && em[m] && em[p]) { a.push(mret[m]); b.push(cm[m] / cm[p] - 1); c.push(em[m] / em[p] - 1); } }
  const corr = (x, y) => { const mx = mean(x), my = mean(y); let s = 0, sx = 0, sy = 0; for (let i = 0; i < x.length; i++) { s += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return s / Math.sqrt(sx * sy); };
  out.correlation = { months: a.length, withCrude: +corr(a, b).toFixed(2), withSP500: +corr(a, c).toFixed(2) };
}

// 11) 계절성: 월별 평균 크랙($/bbl)
{
  const m = {}; for (const r of F) { const k = r.d.slice(5, 7); (m[k] = m[k] || []).push(r.prod - r.crude); }
  out.seasonalCrackUsd = Object.fromEntries(Object.entries(m).sort().map(([k, a]) => [k, +mean(a).toFixed(2)]));
}

// 12) 최근 가격 기준 계약 명목 (3:2:1 한 세트 = 원유 3계약·휘발유 2·난방유 1)
{
  const last = F.at(-1), raw = join(csv('CL_F.csv'), csv('RB_F.csv'), csv('HO_F.csv')).at(-1);
  out.contracts = { date: last.d, cl: raw.v[0], rb: raw.v[1], ho: raw.v[2], crackUsdPerBbl: +(last.prod - last.crude).toFixed(2),
    oneSetCrudeNotional: Math.round(3 * 1000 * raw.v[0]), oneSetProductNotional: Math.round((2 * raw.v[1] + raw.v[2]) * 42000) };
}

fs.writeFileSync(path.join(__dirname, 'crack_result.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ base: out.base, definitions: out.definitions, direction: out.direction, bootstrap: out.bootstrap, wf: out.walkForwardSummary, corr: out.correlation, contracts: out.contracts, exits: out.exitReasons }, null, 0));

// 13) 지금 신호 상태 (기본 설정)
{
  const i = base.z.length - 1; let k = i; while (k > 0 && !Number.isFinite(base.z[k])) k--;
  const last = base.trades.at(-1);
  out.now = { date: base.dates[k], z: +base.z[k].toFixed(2), crackUsd: +(F[k].prod - F[k].crude).toFixed(2), lastTrade: last };
  fs.writeFileSync(path.join(__dirname, 'crack_result.json'), JSON.stringify(out, null, 1));
  console.log('\nNOW', JSON.stringify(out.now));
}
