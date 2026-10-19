// 제안 2 정식 검증: 손절을 마크가격 1분봉으로 다시 판정해 포트폴리오 전체를 다시 돌린다.
//   order: 거래소 STOP_MARKET(마크 기준) — 1분봉 고가가 손절선에 닿는 순간 max(시가, 손절선)
//   poll : 지금 봇 — 5분 정각 마크(그 분 시가)가 손절선 이상이면 그 값
// 마크 1분봉은 data/m1 에 날짜별로 캐시. 없는 날은 받아 오고(마크가 일봉 고가보다 낮아 더 많은 날이 생길 수 있어) 바뀌지 않을 때까지 반복.
const fs = require('fs'), zlib = require('zlib'), { execFileSync } = require('child_process');
const { prep } = require('./data_prep'); const { run, metrics, yearly } = require('./lib'); const St = require('./strategies');
const D = prep();
const base = { exitHH: 20, risk: 0.02, maxDrop: 0.85, maxDay: -0.5, maxRet20: process.argv[2] ? Number(process.argv[2]) : null };
const cache = new Map();
function m1(sym, date) { const fn = `data/m1/${sym}-${date}.json`; if (!cache.has(fn)) cache.set(fn, fs.existsSync(fn) ? JSON.parse(fs.readFileSync(fn)) : undefined); return cache.get(fn); }
function mk(mode, need) { return (sym, date, stop, entryDay) => {
  const M = m1(sym, date); if (M === undefined) { need.add(sym + '|' + date); return undefined; } if (!M.length) return undefined;
  const start = entryDay ? Date.parse(date + 'T00:06:00Z') : 0;
  for (const [ts, o, h] of M) { if (ts < start) continue;
    if (mode === 'order' && h >= stop) return { px: Math.max(o, stop) };
    if (mode === 'poll' && (ts / 6e4) % 5 === 0 && o >= stop) return { px: o }; }
  return null; }; }
const pc = x => (x * 100).toFixed(1);
for (let pass = 0; pass < 6; pass++) {
  const need = new Set(); const R = {};
  R['일봉(백테스트 가정)'] = run(D, St.crashC(base), {});
  R['STOP 주문(마크)'] = run(D, St.crashC(base), { stopFn: mk('order', need) });
  R['5분 확인(지금 봇)'] = run(D, St.crashC(base), { stopFn: mk('poll', need) });
  if (need.size) { console.log(`pass ${pass}: 마크 1분봉 ${need.size}일 받는 중`); fs.writeFileSync('need.json', JSON.stringify([...need])); execFileSync('node', ['fetchm1.js'], { stdio: 'inherit' }); cache.clear(); continue; }
  for (const [k, r] of Object.entries(R)) {
    const f = metrics(r.eq, D.dates, '2019-09-08', '2026-10-18', r.trades), o = metrics(r.eq, D.dates, '2022-01-01', '2026-10-18', r.trades), c = metrics(r.eq, D.dates, '2025-01-01', '2026-10-18', r.trades);
    const st = r.trades.filter(t => /stop/.test(t.reason));
    const over = st.reduce((s, t) => s + (t.exitPx / (1 + 0) / t.stopPx - 1), 0) / st.length;
    console.log(k.padEnd(18), `전체 연 ${pc(f.cagr)}% MDD ${pc(f.mdd)}% 샤프 ${f.sharpe.toFixed(2)} | 2022~ 연 ${pc(o.cagr)}% MDD ${pc(o.mdd)}% | 2025~ 연 ${pc(c.cagr)}% MDD ${pc(c.mdd)}% | 거래 ${f.trades} 승률 ${pc(f.winRate)}% 손절 ${st.length}건 (손절선 대비 평균 +${(over * 100).toFixed(2)}%, 슬리피지 포함)`);
    console.log('   연도', Object.entries(yearly(r.eq, D.dates)).map(([y, v]) => `${y} ${pc(v)}`).join(' · '));
  }
  break;
}
if (process.env.WORST) { const need = new Set();
  for (const [k, f] of [['STOP 주문', mk('order', need)], ['5분 확인', mk('poll', need)]]) { const r = run(D, St.crashC(base), { stopFn: f }); const st = r.trades.filter(t => /stop/.test(t.reason));
    const w = [...st].sort((a, b) => a.pnlPctOfEq - b.pnlPctOfEq);
    console.log(k, '손절 1건 손실(장부 대비) 평균', (st.reduce((s, t) => s + t.pnlPctOfEq, 0) / st.length * 100).toFixed(2) + '%', '· 3% 넘은 손절', st.filter(t => t.pnlPctOfEq < -0.03).length + '건', '· 최악 3', w.slice(0, 3).map(t => `${t.sym} ${t.exitDate} ${(t.pnlPctOfEq * 100).toFixed(1)}%`).join(', ')); } }
// 장중 낙폭 계산용: 지금 규칙(STOP 주문 방식)의 거래와 일봉 장부를 내보낸다
if (process.env.EXPORT) { const need = new Set(); const r = run(D, St.crashC(base), { stopFn: mk('order', need) });
  fs.writeFileSync('out_trades_order.json', JSON.stringify({ dates: D.dates, eq: Array.from(r.eq), trades: r.trades.map(t => ({ sym: t.sym, entryDate: t.entryDate, exitDate: t.exitDate, reason: t.reason, avg: t.avgPx, qty: t.qty, exitPx: t.exitPx, stopPx: t.stopPx })),
    open: r.open })); console.log('내보냄', r.trades.length, '열린', r.open.length); }
