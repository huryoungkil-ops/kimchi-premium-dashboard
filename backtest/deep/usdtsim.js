// 같은 신호(봇식 김프 = 원화가/일별환율/바이낸스, 72h MA−2σ 진입, MA+0.25σ 청산, 5일 최대)로
// (A) 코인 두 다리(국내 현물 롱 + 바이낸스 숏)의 «실제 원화 손익»과
// (B) 업비트 USDT만 사고파는 한 다리의 원화 손익을 비교한다. 체결은 다음 5분봉 종가.
const fs = require('fs');
const C = process.env.EXCH_CACHE || './cache/'; // 거래소 5분봉 캐시 [ts, 종가, 거래대금] (리서치 때 공개 API로 수집)
const fxDaily = JSON.parse(fs.readFileSync('fx.json')).rates; const fxDays = Object.keys(fxDaily).sort();
const fxAt = ts => { const d = new Date(ts + 9 * 3600e3).toISOString().slice(0, 10); let v = null; for (const k of fxDays) { if (k <= d) v = fxDaily[k].KRW; else break; } return v; };
const load = n => new Map(JSON.parse(fs.readFileSync(C + n)).map(r => [r[0], r[1]]));
const usdt = load('upbit_USDT.json');
const COST_TWO = { BTC: 0.03 + 0.10 + 0.10, ETH: 0.03 + 0.10 + 0.10, XRP: 0.05 + 0.10 + 0.10, SOL: 0.06 + 0.10 + 0.10 }; // 업비트 슬리피지 + 업비트 수수료 왕복 + 바이낸스 왕복 (%)
const COST_USDT_UPBIT = 0.074 + 0.10, COST_USDT_ZERO = 0.074; // 1원 호가(7.4bp) + 업비트 수수료 / 수수료 0 거래소
const W = 864, out = {};
for (const coin of Object.keys(COST_TWO)) {
  const kr = load(`upbit_${coin}.json`), bn = load(`binance_${coin}.json`);
  const rows = []; for (const [ts, k] of kr) { const b = bn.get(ts), u = usdt.get(ts), fx = fxAt(ts); if (b && u && fx) rows.push({ ts, k, b, u, fx, p: (k / fx / b - 1) * 100 }); }
  rows.sort((a, b) => a.ts - b.ts);
  let s = 0, s2 = 0; const q = []; let pos = null; const A = [], B = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const r = rows[i];
    if (q.length >= W * 0.8) {
      const m = s / q.length, sd = Math.sqrt(Math.max(1e-12, s2 / q.length - m * m));
      if (!pos && r.p < m - 2 * sd) { const e = rows[i + 1]; pos = { i, e }; }
      else if (pos && (r.p > m + 0.25 * sd || r.ts - pos.e.ts > 5 * 864e5)) {
        const x = rows[i + 1], e = pos.e;
        // A: 1,000달러어치(진입 환율) — 원화 다리 손익(원) + 숏 손익(USDT → 청산 시 업비트 USDT 가격으로 원화 환산)
        const qty = 1000 * e.fx / e.k;
        const krwLeg = qty * (x.k - e.k), usdLeg = qty * (e.b - x.b) * x.u;
        const aPct = (krwLeg + usdLeg) / (1000 * e.fx) * 100 - COST_TWO[coin];
        const bRaw = (x.u / e.u - 1) * 100;
        A.push(aPct); B.push(bRaw);
        pos = null;
      }
    }
    q.push(r.p); s += r.p; s2 += r.p * r.p; if (q.length > W) { const o = q.shift(); s -= o; s2 -= o * o; }
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const corrAB = (() => { const ma = avg(A), mb = avg(B); let sab = 0, sa = 0, sb = 0; for (let i = 0; i < A.length; i++) { sab += (A[i] - ma) * (B[i] - mb); sa += (A[i] - ma) ** 2; sb += (B[i] - mb) ** 2; } return sab / Math.sqrt(sa * sb); })();
  out[coin] = { trades: A.length, twoLegNetPct: avg(A), usdtGrossPct: avg(B), usdtNetUpbit: avg(B) - COST_USDT_UPBIT, usdtNetZeroFee: avg(B) - COST_USDT_ZERO, corrTwoLegVsUsdt: corrAB, twoLegWin: A.filter(x => x > 0).length / A.length };
}
fs.writeFileSync('usdtsim.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v, 1));
