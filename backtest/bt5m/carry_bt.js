// 펀딩 캐리: 현물 롱 + 무기한선물 숏을 같은 금액으로 들고 펀딩을 받는다 (가격 방향 위험은 서로 상쇄).
//   손익 = 받은 펀딩 + (현물 수익률 − 선물 수익률) × 금액(베이시스 변화) − 매매 비용
//   선정: 리밸런싱 날 직전 7일 펀딩 합 상위 TOP 종목(양수만, 현물·선물 모두 60일 이상 상장)
//   자본 효율: 1배 격리면 선물 증거금 = 금액 → 자본의 절반만 현물에 들어간다(eff=0.5). 통합 증거금으로 현물을 담보로 쓰면 ~0.9.
//   비용: 현물 0.1% + 선물 0.05% (편도, 종목을 바꿀 때마다)
const fs = require('fs');
const arg = k => { const a = process.argv.find(x => x.startsWith(k + '=')); return a ? a.split('=')[1] : undefined; };
const TOP = Number(arg('top') || 5), REB = Number(arg('reb') || 7), EFF = Number(arg('eff') || 0.5), MINF = Number(arg('minf') || 0);
const ONLY = arg('only') ? arg('only').split(',') : null, FROM = arg('from') || '2020-03-01';
const SPOT_FEE = 0.001, PERP_FEE = 0.0005;
const DAY = 1440, d0 = Date.parse(FROM + 'T00:00:00Z') / 60000, d1 = Date.parse('2026-10-14T00:00:00Z') / 60000;
const uni = JSON.parse(fs.readFileSync('data/universe.json')).slice(0, 120).map(u => u.coin).filter(c => fs.existsSync(`data/spot/${c}.json`));
const C = {};
for (const c of (ONLY || uni)) {
  const sp = new Map(JSON.parse(fs.readFileSync(`data/spot/${c}.json`)).map(([m, cl, hi]) => [m, [cl, hi]]));
  const b = fs.readFileSync(`data/binance/${c}.bin`), pc = new Map();   // 그날 마지막 5분봉 종가
  for (let i = 0; i < b.length / 12; i++) { const m = b.readInt32LE(i * 12); pc.set(Math.floor(m / DAY) * DAY, b.readDoubleLE(i * 12 + 4)); }
  const fd = new Map(); for (const [m, r] of JSON.parse(fs.readFileSync(`data/binance/${c}.funding.json`))) { const d = Math.floor((m - 1) / DAY) * DAY; fd.set(d, (fd.get(d) || 0) + r); }
  const first = Math.max(Math.min(...sp.keys()), Math.min(...pc.keys()));
  C[c] = { sp, pc, fd, first };
}
let eq = 1, peak = 1, mdd = 0; const daily = []; let held = []; let nextReb = d0; const yr = {}; let fees = 0, fund = 0, basis = 0, trades = 0;
let liq100 = 0, liq50 = 0; const Y = {}, monthly = [], picks = {}, events = []; const yk = d => new Date(d * 60000).getUTCFullYear(); const yy = d => (Y[yk(d)] = Y[yk(d)] || { fund: 0, basis: 0, fees: 0, start: null });
for (let d = d0; d < d1; d += DAY) {
  // 리밸런싱
  if (d >= nextReb) {
    const score = [];
    for (const [c, o] of Object.entries(C)) { if (o.first > d - 60 * DAY || !o.sp.has(d - DAY) || !o.pc.has(d - DAY)) continue;
      let s = 0; for (let k = 1; k <= 7; k++) s += o.fd.get(d - k * DAY) || 0; score.push([c, s]); }
    const pick = score.filter(x => x[1] > MINF / 100).sort((a, b) => b[1] - a[1]).slice(0, TOP).map(x => x[0]);
    const out = held.filter(h => !pick.includes(h.c)), inn = pick.filter(c => !held.some(h => h.c === c));
    const w = EFF / TOP;   // 종목당 현물 금액 = 자본 × EFF / TOP
    for (const h of out) { const f = h.n * (SPOT_FEE + PERP_FEE); eq -= f; fees += f; yy(d).fees += f; trades++; }
    for (const c of inn) { const f = w * eq * (SPOT_FEE + PERP_FEE); eq -= f; fees += f; yy(d).fees += f; picks[c] = (picks[c] || 0) + 1; }
    held = pick.map(c => { const h = held.find(x => x.c === c); return h || { c, n: w * eq, entry: C[c].pc.get(d - DAY), peakRise: 0 }; });
    // 남는 종목도 목표 금액으로 다시 맞춘다(비용은 생략 — 차이가 작다)
    for (const h of held) h.n = w * eq;
    nextReb = d + REB * DAY;
  }
  // 하루 손익: 펀딩 + 베이시스
  let pnl = 0;
  for (const h of held) { const o = C[h.c], s0 = o.sp.get(d - DAY), s1 = o.sp.get(d), p0 = o.pc.get(d - DAY), p1 = o.pc.get(d);
    if (!(s0 && s1 && p0 && p1)) continue;
    const f = (o.fd.get(d) || 0) * h.n, bs = h.n * ((s1[0] / s0[0] - 1) - (p1 / p0 - 1));
    pnl += f + bs; fund += f; basis += bs; yy(d).fund += f; yy(d).basis += bs; h.n *= p1 / p0;   // 금액은 가격 따라 움직인다
    const rise = s1[1] / h.entry - 1; if (rise > h.peakRise) { if (h.peakRise < 0.5 && rise >= 0.5) liq50++; if (h.peakRise < 1 && rise >= 1) liq100++; if (h.peakRise < 0.5 && rise >= 0.5) events.push({ day: new Date(d * 60000).toISOString().slice(0, 10), coin: h.c, rise: +(rise * 100).toFixed(0) }); h.peakRise = rise; } }
  eq += pnl; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1);
  const y = new Date(d * 60000).getUTCFullYear(); (yr[y] = yr[y] || { a: daily.length ? daily.at(-1) : 1, b: 0, pk: 0, mdd: 0 }); const o = yr[y]; o.b = eq; o.pk = Math.max(o.pk || eq, eq); o.mdd = Math.min(o.mdd, eq / o.pk - 1);
  daily.push(eq); const dt = new Date((d + DAY) * 60000); if (dt.getUTCDate() === 1) monthly.push([new Date(d * 60000).toISOString().slice(0, 7), +eq.toFixed(4)]);
}
const years = (d1 - d0) / 525960;
console.log(`펀딩 캐리 · 상위 ${TOP} · ${REB}일마다 · 자본효율 ${EFF} · ${ONLY ? ONLY.join(',') : Object.keys(C).length + '종목'} · 최소 7일 펀딩 ${MINF}%`);
console.log(Object.entries(yr).map(([y, o]) => `${y} ${((o.b / o.a - 1) * 100).toFixed(1)}%(낙폭 ${(o.mdd * 100).toFixed(1)}%)`).join(' · '));
console.log(`연 ${((Math.pow(eq, 1 / years) - 1) * 100).toFixed(1)}% · 최대낙폭 ${(mdd * 100).toFixed(1)}% · 펀딩 +${(fund * 100).toFixed(1)}% · 베이시스 ${(basis * 100).toFixed(1)}% · 비용 −${(fees * 100).toFixed(1)}% (자본 대비 누적) · 보유 중 현물가 +50% 도달 ${liq50}번, +100% 도달 ${liq100}번`);

if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ args: process.argv.slice(2).join(' '), cagr: (Math.pow(eq, 1 / years) - 1) * 100, mdd: mdd * 100, years: Object.fromEntries(Object.entries(yr).map(([y, o]) => [y, { ret: (o.b / o.a - 1) * 100, mdd: o.mdd * 100, fund: Y[y] ? Y[y].fund * 100 : 0, basis: Y[y] ? Y[y].basis * 100 : 0, fees: Y[y] ? Y[y].fees * 100 : 0 }])), monthly, picks: Object.entries(picks).sort((a, b) => b[1] - a[1]), events, liq50, liq100, fund: fund * 100, basis: basis * 100, fees: fees * 100 }));
