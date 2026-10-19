// 제안 1 검증: «20일 수익률 상한»(펌프 제외) 필터. 기준 = 실전 페이퍼 봇과 같은 규칙
// (−40%·ATR 1.5배·거래대금 2배·$5M · 20일 고가 청산 · 2N 손절 · 60일 · 위험 2% · 바닥 진입 금지 −85%/하루 −50%)
const fs = require('fs'); const { prep } = require('./data_prep'); const { run, metrics, yearly } = require('./lib'); const St = require('./strategies');
const D = prep();
const FULL = ['2019-09-08', '2026-10-18'], IS = ['2019-09-08', '2021-12-31'], OOS = ['2022-01-01', '2026-10-18'], RECENT = ['2025-01-01', '2026-10-18'];
const pc = x => x == null ? '—' : (x * 100).toFixed(1);
const base = { exitHH: 20, risk: 0.02, maxDrop: 0.85, maxDay: -0.5 };
const V = [['기준(현 규칙)', null], ['+300% 넘으면 제외', 3], ['+200%', 2], ['+100%', 1], ['+50%', 0.5], ['+0% (오른 코인 전부 제외)', 0]];
const out = {};
for (const [k, m] of V) {
  const r = run(D, St.crashC({ ...base, maxRet20: m }), {});
  const M = (a) => metrics(r.eq, D.dates, ...a, r.trades);
  const f = M(FULL), is = M(IS), oos = M(OOS), rc = M(RECENT);
  const stops = r.trades.filter(t => /stop/.test(t.reason));
  out[k] = { m, full: f, is, oos, recent: rc, yearly: yearly(r.eq, D.dates), trades: r.trades, stops: stops.length };
  console.log(k.padEnd(24), `전체 연 ${pc(f.cagr)}% MDD ${pc(f.mdd)}% 샤프 ${f.sharpe.toFixed(2)} | 학습 ${pc(is.cagr)}% ${pc(is.mdd)}% | 검증 ${pc(oos.cagr)}% MDD ${pc(oos.mdd)}% 샤프 ${oos.sharpe.toFixed(2)} | 25~26 ${pc(rc.cagr)}% ${pc(rc.mdd)}% | 거래 ${f.trades} 승률 ${pc(f.winRate)}% 손절 ${stops.length} PF ${f.profitFactor?.toFixed(2)}`);
  console.log('   연도', Object.entries(out[k].yearly).map(([y, v]) => `${y} ${pc(v)}`).join(' · '));
}
// 기준 거래를 20일 수익률 구간별로
const T = out['기준(현 규칙)'].trades;
const B = [[-9, 0, '20일 ≤0%'], [0, 0.5, '0~50%'], [0.5, 1, '50~100%'], [1, 2, '100~200%'], [2, 99, '200%↑']];
console.log('\n기준 거래 · 진입 당시 20일 수익률 구간별');
for (const [a, b, n] of B) { const t = T.filter(x => x.ret20 > a && x.ret20 <= b); if (!t.length) { console.log(n, 0); continue; }
  const s = t.reduce((q, x) => q + x.pnlPctOfEq, 0); console.log(n.padEnd(10), `${t.length}건 · 승률 ${pc(t.filter(x => x.pnl > 0).length / t.length)}% · 손절 ${t.filter(x => /stop/.test(x.reason)).length}건 · 거래당 장부 ${(s / t.length * 100).toFixed(2)}% · 합 ${(s * 100).toFixed(1)}%`); }
fs.writeFileSync('out_eval.json', JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { ...v, trades: v.trades.map(t => ({ sym: t.sym, entryDate: t.entryDate, exitDate: t.exitDate, reason: t.reason, entryPx: t.entryPx, exitPx: t.exitPx, stopPx: t.stopPx, qty: t.qty, pnlPctOfEq: t.pnlPctOfEq, ret20: t.ret20, ret: t.ret })) }]))));
