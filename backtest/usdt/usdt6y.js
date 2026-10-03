// USDT 한 다리 방식 6년 검증 (2026-10-03)
// 신호: 봇과 같은 김프 = 업비트 BTC 원화가 / 일별 환율 / OKX BTC − 1, 72h 평균−2σ 진입, 평균+0.25σ 청산,
//       2일 지나면 손실 0.5%p 이내 첫 순간 청산, 5일 강제 청산, 다음 5분봉 종가 체결, 한 번에 한 포지션.
// 거래 대상: USDT 원화 가격.
//   - 2024-06-07 이전: 업비트 KRW-USDT 마켓이 없어 «BTC로 역산한 USDT 가격»(업비트 BTC 원화 ÷ OKX BTCUSDT)으로 대신한다.
//     이 값의 변화는 «코인 두 다리»의 원화 손익과 같아서, 대용 구간은 «같은 베팅을 한 다리 비용으로 했다면»의 근사다.
//   - 2024-06-07 이후: 실제 업비트 KRW-USDT 종가. 대용치와 실제를 겹치는 기간에서 비교한다.
// 비용(왕복): 업비트 수수료 0.05%×2 + 1원 호가 0.074% = 0.174% / 수수료 0 거래소 0.074%.
// 비교: 같은 신호의 «코인 두 다리»(BTC) — 업비트 0.1% + OKX/바이낸스 0.1% + 스프레드 0.03% = 0.23%, 펀딩 미반영.
const fs = require('fs');
const load = f => { const j = require(f); return Array.isArray(j) ? j : Object.values(j); };
const up = load('../cache5m/upbit_BTC_6y.json'), okx = load('../cache5m/okx_BTC_6y.json'), fx = require('../cache5m/fx_6y.json');
const usdt = JSON.parse(fs.readFileSync(__dirname + '/cache_upbit_usdt_5m.json'));
const fxDates = Object.keys(fx).sort();
const fxAt = ts => { const d = new Date(ts).toISOString().slice(0, 10); let lo = 0, hi = fxDates.length - 1, a = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (fxDates[m] <= d) { a = fxDates[m]; lo = m + 1; } else hi = m - 1; } return a ? fx[a] : null; };
const om = new Map(okx.map(r => [r.ts, r.close])), um = new Map(usdt.map(r => [r.ts, r.close]));
const rows = [];
for (const r of up) { const o = om.get(r.ts), f = fxAt(r.ts); if (!o || !f) continue; const imp = r.close / o; rows.push({ ts: r.ts, prem: (imp / f - 1) * 100, imp, real: um.get(r.ts) ?? null, fx: f }); }
rows.sort((a, b) => a.ts - b.ts);
const REAL_FROM = usdt[0].ts;
const W = 864;

function run({ entrySigma = 2, exitOff = 0.25, edge = 3, cost, mode = 'oneLeg', signal = 'prem' }) {
  const trades = []; let s = 0, s2 = 0; const q = []; let pos = null;
  const val = r => signal === 'prem' ? r.prem : (r.real ? r.real : null);
  for (let i = 0; i < rows.length - 1; i++) {
    const r = rows[i], v = val(r);
    if (v === null) continue;
    if (q.length >= W * 0.8) {
      const m = s / q.length, sd = Math.sqrt(Math.max(1e-12, s2 / q.length - m * m));
      const e = rows[i + 1];
      if (!pos) {
        if (v < m - entrySigma * sd && (m - v) / (signal === 'prem' ? 1 : v / 100) >= edge * cost) pos = { e, v };
      } else {
        const held = r.ts - pos.e.ts, move = v - pos.v;
        let why = null;
        if (v > m + exitOff * sd) why = 'SIGNAL'; else if (held > 5 * 864e5) why = 'MAXHOLD'; else if (held > 2 * 864e5 && move >= -0.5 * (signal === 'prem' ? 1 : v / 100)) why = 'SOFT';
        if (why) {
          const x = e; // 다음 봉 체결
          const useReal = pos.e.real && x.real && pos.e.ts >= REAL_FROM;
          const pxIn = useReal ? pos.e.real : pos.e.imp, pxOut = useReal ? x.real : x.imp;
          const gross = (pxOut / pxIn - 1) * 100;
          trades.push({ entryTs: pos.e.ts, exitTs: x.ts, real: !!useReal, gross, net: gross - cost, holdH: (x.ts - pos.e.ts) / 36e5, why, impGross: (x.imp / pos.e.imp - 1) * 100 });
          pos = null;
        }
      }
    }
    q.push(v); s += v; s2 += v * v; if (q.length > W) { const o = q.shift(); s -= o; s2 -= o * o; }
  }
  return trades;
}
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const sdv = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function summarize(tr) {
  const by = {}; for (const t of tr) { const y = new Date(t.exitTs).toISOString().slice(0, 4); (by[y] = by[y] || []).push(t); }
  const yrs = Object.fromEntries(Object.entries(by).map(([y, a]) => [y, { n: a.length, win: a.filter(t => t.net > 0).length / a.length * 100, meanNet: mean(a.map(t => t.net)), sumNet: a.reduce((x, t) => x + t.net, 0), inMarketPct: a.reduce((x, t) => x + t.holdH, 0) / (365 * 24) * 100 }]));
  // 누적 곡선(한 포지션 전액, 복리 없이 합산)과 최대 낙폭
  let eq = 0, pk = 0, mdd = 0; for (const t of tr) { eq += t.net; pk = Math.max(pk, eq); mdd = Math.min(mdd, eq - pk); }
  const years = (rows.at(-1).ts - rows[0].ts) / 3.156e10;
  const n = tr.map(t => t.net);
  return { n: tr.length, win: tr.filter(t => t.net > 0).length / tr.length * 100, meanNet: mean(n), t: mean(n) / (sdv(n) / Math.sqrt(n.length)), sumNet: eq, perYear: eq / years, mddPp: mdd, years: yrs };
}
const out = {};
const C1 = 0.174, C0 = 0.074, C2 = 0.23;
const A = run({ cost: C1 }), B = run({ cost: C0 }), T = run({ cost: C2 });
out.oneLegUpbitFee = summarize(A); out.oneLegZeroFee = summarize(B);
// 두 다리(같은 신호, 역산 USDT 변화 = 두 다리 원화 손익) — 비용만 0.23%
out.twoLegBTC = summarize(T.map(t => Object.assign({}, t, { net: t.impGross - C2 })));
// 실제 USDT 구간에서 대용치와 실제 비교
const ov = A.filter(t => t.real);
const corr = (x, y) => { const mx = mean(x), my = mean(y); let a = 0, b = 0, c = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };
out.realVsProxy = { trades: ov.length, meanRealGross: mean(ov.map(t => t.gross)), meanProxyGross: mean(ov.map(t => t.impGross)), corr: corr(ov.map(t => t.gross), ov.map(t => t.impGross)) };
// 실제 USDT 구간만: 신호를 USDT 가격 자체(환율 없이)로 잡으면?
out.realOnly_premSignal = summarize(A.filter(t => t.real));
// 민감도
out.sens = {};
for (const es of [1.5, 2, 2.5]) for (const ed of [1, 3, 5]) { const s = summarize(run({ entrySigma: es, edge: ed, cost: C1 })); out.sens[`σ${es}_우위${ed}`] = { n: s.n, meanNet: s.meanNet, perYear: s.perYear, mdd: s.mddPp, t: s.t }; }
out.period = [new Date(rows[0].ts).toISOString(), new Date(rows.at(-1).ts).toISOString()]; out.realFrom = new Date(REAL_FROM).toISOString();
fs.writeFileSync(__dirname + '/usdt6y_result.json', JSON.stringify(out, null, 2));
const r2 = v => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
console.log(JSON.stringify(out, (k, v) => r2(v)));

// 실제 USDT 구간(2024-06-07~)만 따로: 한 다리(실제 USDT), 같은 거래의 대용치, 두 다리(BTC) — 연율은 그 구간 길이로 나눈다
{
  const yrsReal = (rows.at(-1).ts - REAL_FROM) / 3.156e10;
  const pick = (tr, f) => tr.filter(t => t.entryTs >= REAL_FROM).map(f);
  const sum = a => a.reduce((x, y) => x + y, 0);
  const rv = {
    years: yrsReal,
    oneLegReal_upbitFee: { n: pick(A, t => 1).length, perYear: sum(pick(A, t => t.net)) / yrsReal, meanNet: mean(pick(A, t => t.net)) },
    oneLegReal_zeroFee: { n: pick(B, t => 1).length, perYear: sum(pick(B, t => t.net)) / yrsReal, meanNet: mean(pick(B, t => t.net)) },
    proxySameTrades_upbitFee: { perYear: sum(pick(A, t => t.impGross - C1)) / yrsReal },
    twoLegBTC: { n: pick(T, t => 1).length, perYear: sum(pick(T, t => t.impGross - C2)) / yrsReal, meanNet: mean(pick(T, t => t.impGross - C2)) },
    proxyPeriodBefore: { years: (REAL_FROM - rows[0].ts) / 3.156e10, oneLegProxy_upbitFee_perYear: sum(A.filter(t => t.entryTs < REAL_FROM).map(t => t.net)) / ((REAL_FROM - rows[0].ts) / 3.156e10) },
  };
  out.realWindow = rv;
  fs.writeFileSync(__dirname + '/usdt6y_result.json', JSON.stringify(out, null, 2));
  console.log('\nREAL WINDOW', JSON.stringify(rv, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
}
