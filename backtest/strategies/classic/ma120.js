// BTC 120일 이동평균 위에서만 보유 (가격이 120일선 위로 올라오면 매수 = «골든크로스», 아래로 내려가면 매도 = «데드크로스»)
// 신호: 그날 종가 vs 그날까지의 N일 평균. 체결: 다음 날 시가. 비용: 한쪽당 수수료 + 슬리피지.
// 비교: N = 50/100/120/150/200, 확인일(연속 k일 위/아래), 두 이평 교차(20/120, 50/200), BTC/ETH, 바이낸스 USDT / 업비트 KRW.
const L = require('./lib');
const IS = ['2017-01-01', '2021-12-31'], OOS = ['2022-01-01', '2026-09-30'];
const day = t => new Date(t).toISOString().slice(0, 10);

function run(bars, { N = 120, fast = 1, confirm = 1, fee = 0.001, slip = 0.0005 } = {}) {
  const c = bars.c, o = bars.o, T = bars.t, n = c.length;
  const slow = L.sma(c, N), f = fast > 1 ? L.sma(c, fast) : c;
  const rows = []; let pos = 0, above = 0, below = 0, trades = 0, entryPx = 0; const tr = [];
  for (let i = 0; i < n - 1; i++) {
    // i일 종가로 판단 → i+1일 시가에 체결. i+1일 수익은 시가→종가(새 포지션), 그다음부터 종가→종가
    if (Number.isFinite(slow[i]) && Number.isFinite(f[i])) {
      if (f[i] > slow[i]) { above++; below = 0; } else { below++; above = 0; }
    }
    let want = pos;
    if (pos === 0 && above >= confirm) want = 1; else if (pos === 1 && below >= confirm) want = 0;
    const j = i + 1; let r;
    if (want !== pos) {
      const cost = fee + slip; trades++;
      if (want === 1) { r = (c[j] / o[j]) * (1 - cost) - 1; entryPx = o[j] * (1 + slip); }
      else { r = (o[j] / c[i]) * (1 - cost) - 1; tr.push({ d: day(T[j]), pnl: o[j] * (1 - slip) / entryPx - 1 - 2 * fee }); }
      pos = want;
    } else r = pos ? c[j] / c[i] - 1 : 0;
    if (Number.isFinite(slow[i])) rows.push({ d: day(T[j]), r, exp: pos, bh: c[j] / c[i] - 1 });
  }
  return { rows, tr, trades };
}
function st(rows, from, to, key = 'r') {
  const R = rows.filter(x => x.d >= from && x.d <= to); if (R.length < 60) return null;
  let eq = 1, pk = 1, mdd = 0, s = 0, ss = 0, dn = 0;
  for (const x of R) { const v = x[key]; eq *= 1 + v; pk = Math.max(pk, eq); mdd = Math.min(mdd, eq / pk - 1); s += v; ss += v * v; if (v < 0) dn += v * v; }
  const n = R.length, m = s / n, sd = Math.sqrt(ss / n - m * m), yrs = n / 365;
  return { cagr: +((eq ** (1 / yrs) - 1) * 100).toFixed(1), sharpe: +(m / sd * Math.sqrt(365)).toFixed(2), sortino: +(m / Math.sqrt(dn / n) * Math.sqrt(365)).toFixed(2), mdd: +(mdd * 100).toFixed(1), exposure: key === 'r' ? +(R.reduce((a, x) => a + x.exp, 0) / n * 100).toFixed(0) : 100 };
}
function yearly(rows, key = 'r') { const m = {}; for (const x of rows) { const y = x.d.slice(0, 4); m[y] = (m[y] || 1) * (1 + x[key]); } for (const k in m) m[k] = +((m[k] - 1) * 100).toFixed(1); return m; }

const out = { note: '신호 = 종가 vs N일 평균, 다음 날 시가 체결. 바이낸스 비용 한쪽 0.10%+0.05%, 업비트 0.05%+0.05%.' };
const btc = L.load('spot_BTC_1d'), eth = L.load('spot_ETH_1d'), up = L.load('upbit_BTC_1d');
const cases = [];
for (const [name, bars, fee] of [['BTC (바이낸스)', btc, 0.001], ['BTC (업비트 원화)', up, 0.0005], ['ETH (바이낸스)', eth, 0.001]]) {
  for (const N of [50, 100, 120, 150, 200]) cases.push({ name, bars, fee, label: `${N}일선`, opt: { N, fee } });
  cases.push({ name, bars, fee, label: '120일선, 3일 확인', opt: { N: 120, confirm: 3, fee } });
  cases.push({ name, bars, fee, label: '20/120 이평 교차', opt: { N: 120, fast: 20, fee } });
  cases.push({ name, bars, fee, label: '50/200 골든크로스', opt: { N: 200, fast: 50, fee } });
}
out.results = cases.map(cs => {
  const r = run(cs.bars, cs.opt);
  const tw = r.tr.filter(x => x.pnl > 0).length;
  return { asset: cs.name, rule: cs.label, trades: r.trades, tradeWin: +(tw / Math.max(1, r.tr.length) * 100).toFixed(0),
    full: st(r.rows, '2017-01-01', '2026-09-30'), is: st(r.rows, ...IS), oos: st(r.rows, ...OOS),
    bhFull: st(r.rows, '2017-01-01', '2026-09-30', 'bh'), bhIS: st(r.rows, ...IS, 'bh'), bhOOS: st(r.rows, ...OOS, 'bh'),
    yearly: cs.label === '120일선' || cs.label === '200일선' || cs.label === '50/200 골든크로스' ? yearly(r.rows) : undefined,
    yearlyBH: cs.label === '120일선' ? yearly(r.rows, 'bh') : undefined };
});
// 비용 민감도 (BTC 바이낸스 120일선)
out.costSens = [0, 0.0005, 0.001, 0.002, 0.005].map(fee => ({ feePerSide: fee * 100, ...st(run(btc, { N: 120, fee, slip: 0 }).rows, '2017-01-01', '2026-09-30') }));
// 월간 자산곡선 (BTC 바이낸스 120일선 vs 보유)
{ const r = run(btc, { N: 120 }); let a = 1, b = 1; const m = {}; for (const x of r.rows) { a *= 1 + x.r; b *= 1 + x.bh; m[x.d.slice(0, 7)] = [+a.toFixed(3), +b.toFixed(3)]; } out.monthlyBTC120 = m;
  // 최근 상태
  const c = btc.c, s = L.sma(c, 120), i = c.length - 1; out.now = { date: day(btc.t[i]), close: c[i], sma120: +s[i].toFixed(0), above: c[i] > s[i], gapPct: +((c[i] / s[i] - 1) * 100).toFixed(1) }; }
require('fs').writeFileSync(__dirname + '/ma120_result.json', JSON.stringify(out, null, 1));
for (const x of out.results) console.log(`${x.asset.padEnd(12)} ${x.rule.padEnd(14)} 거래${String(x.trades).padStart(3)} 승률${x.tradeWin}% | 전체 ${x.full.cagr}%/${x.full.sharpe}/${x.full.mdd}% | IS ${x.is?.cagr}/${x.is?.sharpe}/${x.is?.mdd} (보유 ${x.bhIS?.sharpe}) | OOS ${x.oos.cagr}/${x.oos.sharpe}/${x.oos.mdd} (보유 ${x.bhOOS.cagr}/${x.bhOOS.sharpe}/${x.bhOOS.mdd}) 노출${x.full.exposure}%`);
console.log('비용', JSON.stringify(out.costSens)); console.log('NOW', JSON.stringify(out.now));
const b = out.results.find(x => x.asset === 'BTC (바이낸스)' && x.rule === '120일선'); console.log('연도 120', JSON.stringify(b.yearly), '보유', JSON.stringify(b.yearlyBH));
console.log('연도 200', JSON.stringify(out.results.find(x => x.asset === 'BTC (바이낸스)' && x.rule === '200일선').yearly), '골든', JSON.stringify(out.results.find(x => x.asset === 'BTC (바이낸스)' && x.rule === '50/200 골든크로스').yearly));
