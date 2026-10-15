// 김프 실거래 봇(빗썸 × Binance, src/strategy.js·bot.js 규칙)을 2020-01부터 5분봉으로 되돌린다.
//   김프 = 빗썸 종가 ÷ 환율(전날 일별, 봇은 open.er-api 하루 1회) ÷ Binance 선물 종가 − 1
//   72시간 평균·σ(80% 이상 채워져야), 진입 평균−2σ / 청산 평균+0.25σ, σ>2.5%면 신호 없음
//   진입 관문: 스프레드 ≤1%, 기대이익(평균−김프) ≥ 3 × (왕복 수수료 0.18% + 스프레드), 매수호가 기준 김프 < 진입선
//   후보 z 상위 8 → 순기대이익 순, 자리 최대 6, 크기 = 자산 10% (호가 깊이 30% 상한, 최소 $500), 보유 명목 ≤ 자산 × 0.397
//   강제청산: 해외가 +50% · 5일 · 2일 지나 손실 0.5%p 이내. 하루 실현손실 > 자산 0.1% 면 그날 진입 중단
//   체결: 판단 다음 봉(5분 뒤) 종가 ± 스프레드 절반. 수수료 빗썸 0.04% + Binance 0.05% (편도). 펀딩 반영(숏은 양수면 받음)
//   거래 대상: 24시간 빗썸 거래대금 ≥ 1,900만원(과거 그대로 계산) + 스프레드 ≤0.8%·호가 깊이 ≥800만원(지금 중앙값 — 과거는 모름)
const fs = require('fs'), path = require('path');
const arg = k => { const a = process.argv.find(x => x.startsWith(k + '=')); return a ? a.split('=')[1] : undefined; };
const DELAY = Number(arg('delay') ?? 1), SPREAD_MULT = Number(arg('spread') ?? 0.5), KR_FEE = Number(arg('krfee') ?? 0.0004), BN_FEE = Number(arg('bnfee') ?? 0.0005);
const FROM = arg('from') || '2020-01-01', TO = arg('to') || '2026-10-15', LIMIT = Number(arg('coins') || 120), BUDGET_FRAC = Number(arg('budget') ?? 0.397);
const FRESH = arg('fresh') === '1', MINVOL = Number(arg('minvol') ?? 19e6);
const MAXPOS = Number(arg('maxpos') ?? 6), SIZE_PCT = Number(arg('size') ?? 0.10), UNIV = arg('univ') || 'live';
const ENTRY_SIGMA = 2, EXIT_OFF = 0.25, MAX_SIGMA = 2.5, W = 864, MIN_COV = 0.8, EDGE = 3, CHECK = 8;
const FEE_RT_PCT = BN_FEE * 2 * 100 + KR_FEE * 2 * 100;
const D = p => path.join(__dirname, 'data', p);
const M0 = Date.parse(FROM + 'T00:00:00Z') / 60000, M1 = Date.parse(TO + 'T00:00:00Z') / 60000, S = Math.floor((M1 - M0) / 5);

// ---------- 환율: 전날 일별 종가 ----------
const fxd = JSON.parse(fs.readFileSync(D('fx.json'))).daily;
const fxSlot = new Float64Array(S); { let j = 0, last = NaN;
  for (let s = 0; s < S; s++) { const m = M0 + s * 5; while (j < fxd.length && fxd[j][0] + 1440 <= m) { last = fxd[j][1]; j++; } fxSlot[s] = last; } }

// ---------- 종목 ----------
const snap = Object.fromEntries(JSON.parse(fs.readFileSync(D('spread_snapshot.json'))).map(r => [r.coin, r]));
const uni = JSON.parse(fs.readFileSync(D('universe.json'))).slice(0, LIMIT);
const C = [];
for (const u of uni) {
  const fb = D(`bithumb/${u.coin}.bin`), fn = D(`binance/${u.coin}.bin`);
  if (!fs.existsSync(fb) || !fs.existsSync(fn)) continue;
  const sp = snap[u.coin] ? snap[u.coin].spreadMedian : null;
  if (sp == null) continue;
  const bk = new Float64Array(S).fill(NaN), bv = new Float32Array(S), bn = new Float64Array(S).fill(NaN);
  let b = fs.readFileSync(fb);
  for (let i = 0; i < b.length / 16; i++) { const s = (b.readInt32LE(i * 16) - M0) / 5; if (s >= 0 && s < S && Number.isInteger(s)) { bk[s] = b.readDoubleLE(i * 16 + 4); bv[s] = b.readFloatLE(i * 16 + 12); } }
  b = fs.readFileSync(fn);
  for (let i = 0; i < b.length / 12; i++) { const s = (b.readInt32LE(i * 12) - M0) / 5; if (s >= 0 && s < S && Number.isInteger(s)) bn[s] = b.readDoubleLE(i * 12 + 4); }
  // 빗썸은 마지막 체결가를 계속 쓴다(봇의 시세와 같다). Binance 는 1시간까지만 이어 붙인다.
  let last = NaN; for (let s = 0; s < S; s++) { if (bk[s] > 0) last = bk[s]; else bk[s] = last; }
  let lb = NaN, gap = 0; for (let s = 0; s < S; s++) { if (bn[s] > 0) { lb = bn[s]; gap = 0; } else if (++gap <= 12) bn[s] = lb; }
  const fund = new Map(); try { for (const [m, r] of JSON.parse(fs.readFileSync(D(`binance/${u.coin}.funding.json`)))) { const s = Math.round((m - M0) / 5); if (s >= 0 && s < S) fund.set(s, r); } } catch (e) {}
  C.push({ coin: u.coin, sp, depth: snap[u.coin].depthKrw || 0, bk, bv, bn, fund, cnt: 0, sum: 0, sum2: 0, vol: 0, prem: new Float32Array(S).fill(NaN) });
}
for (const c of C) for (let s = 0; s < S; s++) { const f = fxSlot[s]; if (c.bk[s] > 0 && c.bn[s] > 0 && f > 0) c.prem[s] = (c.bk[s] / f / c.bn[s] - 1) * 100; }

// ---------- USDT 웃돈 z (선택: uz=-1 이면 z < -1 인 동안 김프 진입 안 함). 빗썸 USDT 2023-12~ 만 있음 ----------
const UZ = arg('uz') != null ? Number(arg('uz')) : null, uzSlot = new Float32Array(S).fill(NaN);
if (UZ != null) { const b = fs.readFileSync(D('bithumb/USDT.bin')), h = new Map(); for (let i = 0; i < b.length / 16; i++) h.set(Math.floor(b.readInt32LE(i * 16) / 60) * 60, b.readDoubleLE(i * 16 + 4));
  const fh = new Map(JSON.parse(fs.readFileSync(D('fx.json'))).hourly.map(([m, c]) => [Math.floor(m / 60) * 60, c])); const ks = [...h.keys()].sort((a, b) => a - b);
  const ps = []; let lc = null, lf = null; for (let t = ks[0]; t <= ks.at(-1); t += 60) { lc = h.get(t) ?? lc; lf = fh.get(t) ?? lf; if (lc && lf) ps.push([t, (lc / lf - 1) * 100]); }
  const zh = new Map(); for (let i = 336; i < ps.length; i++) { const w = ps.slice(i - 335, i + 1).map(x => x[1]), m = w.reduce((a, b) => a + b, 0) / w.length, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length); zh.set(ps[i][0], (ps[i][1] - m) / sd); }
  for (let s = 0; s < S; s++) { const m = M0 + s * 5, hz = zh.get(Math.floor(m / 60) * 60 - 60); if (hz != null) uzSlot[s] = hz; } }
// ---------- 시뮬레이션 ----------
let cash = 20156.42, peak = cash, mdd = 0; const SEED = cash;
const open = new Map(), trades = [], pendIn = [], pendOut = [];
const eqDaily = []; let dayKey = null, dayStartEq = cash, dayLoss = 0;
const kstDay = s => new Date((M0 + s * 5 + 540) * 60000).toISOString().slice(0, 10);
function sigOf(c, s) {
  if (c.cnt < 10) return null;
  const ma = c.sum / c.cnt, sd = Math.sqrt(Math.max(0, c.sum2 / c.cnt - ma * ma)), p = c.prem[s];
  if (!isFinite(p)) return null;
  return { p, ma, sd, cov: Math.min(1, c.cnt / W), tooVol: sd > MAX_SIGMA, lower: ma - ENTRY_SIGMA * sd, upper: ma + EXIT_OFF * sd };
}
function mtm(s) {
  let v = 0;
  for (const t of open.values()) { const c = t.c, fx = fxSlot[s], bid = c.bk[s] * (1 - c.sp / 100 * SPREAD_MULT), fp = c.bn[s];
    if (bid > 0 && fp > 0) v += t.q * bid / fx - t.size + t.q * (t.fp - fp) + t.funding; else v += t.lastMtm || 0; }
  return v;
}
for (let s = 0; s < S; s++) {
  // 체결 (지난 판단분)
  for (let k = pendOut.length - 1; k >= 0; k--) if (pendOut[k].at <= s) { const o = pendOut.splice(k, 1)[0], t = open.get(o.coin); if (!t) continue;
    const c = t.c, fx = fxSlot[s], bid = c.bk[s] * (1 - c.sp / 100 * SPREAD_MULT), fp = c.bn[s];
    if (!(bid > 0 && fp > 0 && fx > 0) || (FRESH && !(c.bv[s] > 0))) { o.at = s + 1; pendOut.push(o); continue; }
    const fee = t.q * bid / fx * KR_FEE + t.q * fp * BN_FEE;
    const pnl = t.q * bid / fx - t.size + t.q * (t.fp - fp) + t.funding - t.feeIn - fee;
    cash += pnl; open.delete(o.coin); if (pnl < 0) dayLoss += -pnl;
    trades.push({ coin: o.coin, in: t.s, out: s, pnl, ret: pnl / t.size, reason: o.reason, funding: t.funding, fees: t.feeIn + fee, size: t.size, ep: t.entryPrem, xp: (bid / fx / fp - 1) * 100 }); }
  for (let k = pendIn.length - 1; k >= 0; k--) if (pendIn[k].at <= s) { const e = pendIn.splice(k, 1)[0], c = e.c;
    if (open.has(c.coin) || open.size >= MAXPOS) continue;
    const fx = fxSlot[s], ask = c.bk[s] * (1 + c.sp / 100 * SPREAD_MULT), fp = c.bn[s];
    if (!(ask > 0 && fp > 0 && fx > 0) || (FRESH && !(c.bv[s] > 0))) continue;
    const q = e.size * fx / ask, feeIn = e.size * KR_FEE + q * fp * BN_FEE;
    open.set(c.coin, { c, s, size: e.size, q, fx, fp, ask, entryPrem: (ask / fx / fp - 1) * 100, feeIn, funding: 0 }); }
  // 펀딩
  for (const t of open.values()) { const r = t.c.fund.get(s); if (r != null && t.c.bn[s] > 0) t.funding += r * t.q * t.c.bn[s]; }
  // 이동 창 갱신
  for (const c of C) { const p = c.prem[s]; if (isFinite(p)) { c.cnt++; c.sum += p; c.sum2 += p * p; }
    if (s >= W) { const o = c.prem[s - W]; if (isFinite(o)) { c.cnt--; c.sum -= o; c.sum2 -= o * o; } }
    c.vol += c.bv[s]; if (s >= 288) c.vol -= c.bv[s - 288]; }
  // 잔액·일자
  const eq = cash + mtm(s); if (eq > peak) peak = eq; if (eq / peak - 1 < mdd) mdd = eq / peak - 1;
  const dk = kstDay(s); if (dk !== dayKey) { if (dayKey) eqDaily.push([dayKey, eq]); dayKey = dk; dayStartEq = eq; dayLoss = 0; }
  // 청산 판단
  const pendingOut = new Set(pendOut.map(o => o.coin));
  for (const t of open.values()) { if (pendingOut.has(t.c.coin)) continue; const c = t.c, g = sigOf(c, s); if (!g) continue;
    const held = (s - t.s) * 5 / 1440, rise = c.bn[s] > 0 ? (c.bn[s] / t.fp - 1) * 100 : 0;
    let reason = rise >= 50 ? 'PRICESTOP' : held >= 5 ? 'MAXHOLD' : (held >= 2 && g.p - t.entryPrem >= -0.5) ? 'SOFT' : null;
    if (!reason && !g.tooVol && g.p > g.upper && (!FRESH || c.bv[s] > 0)) { const bid = c.bk[s] * (1 - c.sp / 100 * SPREAD_MULT), ep = (bid / fxSlot[s] / c.bn[s] - 1) * 100; if (ep > g.upper) reason = 'SIGNAL'; }
    if (reason) pendOut.push({ coin: c.coin, at: s + DELAY, reason }); }
  // 진입 판단
  if (dayLoss > dayStartEq * 0.001) continue;
  if (UZ != null && uzSlot[s] < UZ) continue;
  const slots = MAXPOS - open.size - pendIn.length; if (slots <= 0) continue;
  const cands = [];
  for (const c of C) { if (open.has(c.coin)) continue; const g = sigOf(c, s); if (!g || g.tooVol || !(g.p < g.lower) || g.cov < MIN_COV) continue;
    const fx = fxSlot[s];
    const tradable = UNIV === 'all' ? true : (c.vol >= MINVOL && (!FRESH || c.bv[s] > 0) && c.sp <= 0.8 && c.depth >= 8e6);
    if (!tradable) continue;
    cands.push({ c, g, z: (g.ma - g.p) / g.sd, fx }); }
  if (!cands.length) continue;
  cands.sort((a, b) => b.z - a.z);
  const ok = [];
  for (const k of cands.slice(0, CHECK)) { const c = k.c, g = k.g; if (c.sp > 1) continue;
    const be = FEE_RT_PCT + c.sp, gain = g.ma - g.p; if (gain < be * EDGE) continue;
    const ask = c.bk[s] * (1 + c.sp / 100), ep = (ask / k.fx / c.bn[s] - 1) * 100; if (!(ep < g.lower)) continue;
    ok.push({ ...k, net: gain - be }); }
  ok.sort((a, b) => b.net - a.net);
  let notional = [...open.values()].reduce((a, t) => a + t.size, 0) + pendIn.reduce((a, e) => a + e.size, 0);
  for (const k of ok.slice(0, slots)) {
    let size = eq * SIZE_PCT; const cap = k.c.depth * 0.3 / k.fx; if (cap < size) size = cap;
    size = Math.min(size, eq * BUDGET_FRAC - notional);
    if (size < 500) continue;
    pendIn.push({ c: k.c, size, at: s + DELAY }); notional += size; }
}
eqDaily.push([dayKey, cash + mtm(S - 1)]);

// ---------- 결과 ----------
const yrs = {}; let prevEnd = SEED, pk = SEED;
for (const [d, v] of eqDaily) { const y = d.slice(0, 4); const o = yrs[y] || (yrs[y] = { start: prevEnd, end: v, mdd: 0, pk: prevEnd }); o.end = v; o.pk = Math.max(o.pk, v); o.mdd = Math.min(o.mdd, v / o.pk - 1); prevEnd = v; }
console.log(`김프 빗썸×Binance · ${C.length}종목 · ${FROM}~${TO} · 지연 ${DELAY}봉 · 스프레드 ×${SPREAD_MULT} · 수수료 빗썸 ${KR_FEE * 100}% Binance ${BN_FEE * 100}% · 거래대상 ${UNIV} · 체결있는봉만 ${FRESH} · 24h거래대금≥${MINVOL / 1e6}백만`);
console.log('연도   수익률  최대낙폭  거래  승률  평균보유  펀딩   수수료');
for (const [y, o] of Object.entries(yrs)) { const ts = trades.filter(t => kstDay(t.out).startsWith(y));
  console.log(y, ((o.end / o.start - 1) * 100).toFixed(1).padStart(7) + '%', (o.mdd * 100).toFixed(1).padStart(7) + '%', String(ts.length).padStart(5), (ts.length ? ts.filter(t => t.pnl > 0).length / ts.length * 100 : 0).toFixed(0).padStart(4) + '%',
    (ts.length ? ts.reduce((a, t) => a + (t.out - t.in) * 5 / 60, 0) / ts.length : 0).toFixed(1).padStart(6) + '시간', ('$' + ts.reduce((a, t) => a + t.funding, 0).toFixed(0)).padStart(7), ('$' + ts.reduce((a, t) => a + t.fees, 0).toFixed(0)).padStart(7)); }
const end = eqDaily.at(-1)[1], years = (S * 5) / 525960;
// 최대낙폭은 하루 마감 잔액으로 잰다 (5분 평가에는 빗썸 마지막 체결가가 묵어 생기는 잡음이 섞인다)
let dpk = SEED, dmdd = 0; for (const [, v] of eqDaily) { dpk = Math.max(dpk, v); dmdd = Math.min(dmdd, v / dpk - 1); }
console.log(`전체 ${((end / SEED - 1) * 100).toFixed(1)}% · 연 ${((Math.pow(end / SEED, 1 / years) - 1) * 100).toFixed(1)}% · 최대낙폭 ${(dmdd * 100).toFixed(1)}% (5분 평가 ${(mdd * 100).toFixed(1)}%) · 거래 ${trades.length} · 승률 ${(trades.filter(t => t.pnl > 0).length / trades.length * 100).toFixed(0)}% · 청산사유 ${JSON.stringify(trades.reduce((a, t) => (a[t.reason] = (a[t.reason] || 0) + 1, a), {}))}`);
const byCoin = {}; for (const t of trades) { const o = byCoin[t.coin] || (byCoin[t.coin] = { n: 0, pnl: 0 }); o.n++; o.pnl += t.pnl; }
const bc = Object.entries(byCoin).sort((a, b) => b[1].pnl - a[1].pnl);
console.log('종목별 상위', bc.slice(0, 8).map(([k, o]) => `${k} ${o.n}건 $${o.pnl.toFixed(0)}`).join(' · '));
console.log('종목별 하위', bc.slice(-5).map(([k, o]) => `${k} ${o.n}건 $${o.pnl.toFixed(0)}`).join(' · '));
if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ yrs, trades: trades.map(t => ({ ...t, in: M0 + t.in * 5, out: M0 + t.out * 5 })), eqDaily }));
