// 종목을 여러 개 들면 위험이 분산되는가.
//
// 실거래에서 보유 4종목이 같은 날 같은 폭(-2.5%p 안팎)으로 같이 빠졌다.
// 손익을 만드는 건 «진입 후 김프 변화»이므로, 종목 간 김프 «변화»의 상관을 잰다.
// 상관이 ρ이면 같은 크기 포지션 N개의 실효 독립 베팅 수는 N / (1 + (N−1)ρ) 이다.
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const HORIZONS = [
  { bars: 12, label: '1시간' },
  { bars: 72, label: '6시간' },
  { bars: 288, label: '1일' },
];

const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
);
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

function pearson(a, b) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  if (n < 100) return null;
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null;
}

(async () => {
  const ds = await lib.buildDataset({ yearsBack: YEARS });
  const G = ds.gridLen;
  const prem = ds.coins.map(c => {
    const a = new Float64Array(G).fill(NaN);
    for (let i = 0; i < c.premium.length; i++) a[c.gridIdx[i]] = c.premium[i];
    return a;
  });
  const names = ds.coins.map(c => c.name);
  const out = {};

  console.log(`\n=== 종목 간 김프 «변화»의 상관 (${names.length}종목, ${YEARS}년) ===`);
  for (const h of HORIZONS) {
    const d = prem.map(a => {
      const r = new Float64Array(Math.floor(G / h.bars)).fill(NaN);
      for (let k = 1; k < r.length; k++) r[k] = a[k * h.bars] - a[(k - 1) * h.bars];
      return r;
    });
    const rs = [];
    for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) {
      const r = pearson(d[i], d[j]);
      if (r !== null) rs.push(r);
    }
    rs.sort((x, y) => x - y);
    const mean = rs.reduce((s, x) => s + x, 0) / rs.length;
    const neff = n => n / (1 + (n - 1) * mean);
    console.log(`${h.label.padEnd(6)} 평균 ρ ${mean.toFixed(3)}  (최소 ${rs[0].toFixed(2)} · 최대 ${rs[rs.length - 1].toFixed(2)})`
      + `  → 4자리의 실효 베팅 수 ${neff(4).toFixed(2)}개 · 위험 감소 ${((1 - Math.sqrt(mean + (1 - mean) / 4)) * 100).toFixed(1)}%`);
    out[h.label] = { meanRho: +mean.toFixed(3), min: +rs[0].toFixed(3), max: +rs[rs.length - 1].toFixed(3),
                     neff4: +neff(4).toFixed(2), riskReductionPct4: +((1 - Math.sqrt(mean + (1 - mean) / 4)) * 100).toFixed(1) };
  }

  fs.writeFileSync(path.join(lib.OUT_DIR, 'corr_result.json'),
    JSON.stringify({ years: YEARS, coins: names, horizons: out }, null, 2));
  console.log('\n저장: corr_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
