// 6년 파라미터 탐색에 3시간을 쓰기 전에, 그럴 가치가 있는지 먼저 판단하는 두 가지 분석.
//
//   ① 잔차 구조 — 코인별 김프가 얼마나 "같이" 움직이는가.
//      다 같이 움직인다면 지금 전략은 개별 코인이 아니라 "한국 전체 김프"라는
//      느리고 추세적인 공통 요인에 베팅하고 있는 셈이다. 그렇다면 매 시점
//      전 종목 중앙값을 뺀 잔차로 진입하는 쪽이 회귀가 빠를 수 있다.
//
//   ② 평균회귀 반감기 — 김프가 평균에서 벗어난 뒤 절반쯤 돌아오는 데 얼마나 걸리는가.
//      OU 과정 dp = θ(μ − p)dt + σdW 를 이산 회귀로 추정한다.
//      반감기 안에 기대되는 회귀폭이 본전 문턱을 못 넘으면, 어떤 파라미터 조합으로도
//      이 전략은 이길 수 없다.
//
// 사용법: node analyze.js [연수]   (기본 1년, 캐시가 있어야 함)

const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = Number(process.argv[2] || 1);

// ---------------------------------------------------------------------------
// 공통: 최소제곱 단순회귀 y = a + b·x
// ---------------------------------------------------------------------------
function linreg(x, y) {
  const n = x.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; syy += y[i] * y[i]; }
  const den = n * sxx - sx * sx;
  const b = den === 0 ? 0 : (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  // 결정계수
  const meanY = sy / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) { const pred = a + b * x[i]; ssRes += (y[i] - pred) ** 2; ssTot += (y[i] - meanY) ** 2; }
  return { a, b, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

function stdev(arr) {
  const n = arr.length;
  let s = 0; for (const v of arr) s += v;
  const m = s / n;
  let q = 0; for (const v of arr) q += (v - m) ** 2;
  return { mean: m, sd: Math.sqrt(q / n) };
}

// ---------------------------------------------------------------------------
// ② OU 반감기 추정
//    p(t+1) − p(t) = θ·(μ − p(t))·Δt + noise
//    → Δp 를 p 에 회귀하면 기울기 b = −θ·Δt, 반감기 = ln2 / θ
// ---------------------------------------------------------------------------
function halfLife(series, barMinutes) {
  const n = series.length;
  if (n < 100) return null;
  const x = new Array(n - 1), y = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) { x[i] = series[i]; y[i] = series[i + 1] - series[i]; }
  const { b } = linreg(x, y);
  if (b >= 0) return { halfLifeHours: Infinity, theta: 0 }; // 회귀하지 않음(발산)
  const thetaPerBar = -b;                       // 한 봉당 회귀 속도
  const hl = Math.log(2) / thetaPerBar;         // 반감기(봉 수)
  return { halfLifeHours: hl * barMinutes / 60, theta: thetaPerBar, barsToHalf: hl };
}

(async () => {
  console.log(`=== 6년 탐색 전 사전 분석 (${YEARS}년치 데이터) ===\n`);

  const ds = await lib.buildDataset({ yearsBack: YEARS, log: () => {} });
  const coins = ds.coins;
  const barMinutes = ds.barMinutes;
  console.log(`종목 ${coins.length}개 · 봉 간격 ${barMinutes}분 · 격자 ${ds.gridLen.toLocaleString('en-US')}칸\n`);

  // =========================================================================
  // ① 잔차 구조
  // =========================================================================
  console.log('───────────────────────────────────────────────');
  console.log('① 김프가 얼마나 "같이" 움직이는가');
  console.log('───────────────────────────────────────────────');

  // 공통 격자 위에 코인별 프리미엄을 올린다 (없는 칸은 NaN)
  const G = ds.gridLen;
  const K = coins.length;
  const grid = [];
  for (let k = 0; k < K; k++) {
    const arr = new Float64Array(G).fill(NaN);
    const gi = coins[k].gridIdx, pr = coins[k].premium;
    for (let i = 0; i < gi.length; i++) if (gi[i] >= 0 && gi[i] < G) arr[gi[i]] = pr[i];
    grid.push(arr);
  }

  // 매 시점 전 종목 중앙값 = 공통 요인
  const common = new Float64Array(G).fill(NaN);
  const buf = new Array(K);
  for (let g = 0; g < G; g++) {
    let m = 0;
    for (let k = 0; k < K; k++) { const v = grid[k][g]; if (!Number.isNaN(v)) buf[m++] = v; }
    if (m < Math.max(3, Math.floor(K / 2))) continue; // 표본이 너무 적은 시점은 건너뜀
    const s = buf.slice(0, m).sort((a, b) => a - b);
    common[g] = m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
  }

  // 코인별: 원본 변동성 vs 잔차 변동성, 그리고 공통 요인이 설명하는 비중
  console.log('코인    원본 σ   잔차 σ   공통요인 설명력   변동성 감소');
  const residualSeries = {};
  for (let k = 0; k < K; k++) {
    const raw = [], res = [], com = [];
    for (let g = 0; g < G; g++) {
      const v = grid[k][g], c = common[g];
      if (Number.isNaN(v) || Number.isNaN(c)) continue;
      raw.push(v); com.push(c); res.push(v - c);
    }
    if (raw.length < 100) continue;
    const sRaw = stdev(raw), sRes = stdev(res);
    const { r2 } = linreg(com, raw);
    residualSeries[coins[k].name] = res;
    console.log(
      coins[k].name.padEnd(7)
      + sRaw.sd.toFixed(3).padStart(8)
      + sRes.sd.toFixed(3).padStart(9)
      + (r2 * 100).toFixed(1).padStart(14) + '%'
      + ((1 - sRes.sd / sRaw.sd) * 100).toFixed(1).padStart(12) + '%'
    );
  }
  console.log('\n해석: 공통요인 설명력이 높을수록 "개별 코인 사정"이 아니라 한국 전체 김프에 베팅 중이라는 뜻.');
  console.log('      잔차 σ가 원본보다 많이 작으면, 잔차로 거래할 때 노이즈가 줄어든다는 뜻.');

  // =========================================================================
  // ② 평균회귀 반감기 — 원본 vs 잔차
  // =========================================================================
  console.log('\n───────────────────────────────────────────────');
  console.log('② 평균에서 벗어난 김프가 얼마나 빨리 돌아오는가');
  console.log('───────────────────────────────────────────────');
  // 중요: 전략이 잡는 것은 "연간 전체 이탈"이 아니라 "3일 이동평균 대비 단기 이탈"이다.
  // 따라서 회귀 속도도 (프리미엄 − 3일 이동평균)에 대해 재야 하고,
  // 진입 시점의 이탈폭도 3일 이동 σ를 써야 한다. 연간 σ를 쓰면 몇 달에 걸친
  // 한국 전체 김프의 느린 흐름까지 포함되어 실제보다 몇 배 부풀려진다.
  console.log('코인    본전문턱   3일σ(중앙)  [원본이탈] 반감기 기대회귀폭  판정   [잔차] 반감기 기대회귀폭  판정');

  const verdicts = { raw: 0, res: 0, total: 0 };
  const detail = [];
  for (let k = 0; k < K; k++) {
    const name = coins[k].name;
    const res = residualSeries[name];
    if (!res) continue;

    // 이동평균 대비 이탈 계열과, 그 시점의 3일 이동 σ
    const dev = [], sds = [];
    const pr = coins[k].premium, ma = coins[k].ma, sd = coins[k].sd;
    for (let i = 0; i < pr.length; i++) {
      if (!Number.isFinite(sd[i]) || sd[i] <= 0) continue;
      dev.push(pr[i] - ma[i]);
      sds.push(sd[i]);
    }
    if (dev.length < 100) continue;
    const sortedSd = sds.slice().sort((a, b) => a - b);
    const medSd = sortedSd[Math.floor(sortedSd.length / 2)];

    const be = lib.breakEvenPp(name);

    // 진입은 평균−1σ 자리. 평균까지 완전히 회복하면 1σ를 벌지만,
    // 반감기가 지난 시점에는 그 절반(0.5σ)만 회복된 상태다.
    function evaluate(series, typicalDeviation) {
      const hl = halfLife(series, barMinutes);
      if (!hl || !Number.isFinite(hl.halfLifeHours)) return { hours: Infinity, move: 0, ok: false };
      const move = typicalDeviation * 0.5;
      return { hours: hl.halfLifeHours, move, ok: move > be };
    }

    const a = evaluate(dev, medSd);
    const b = evaluate(res, stdev(res).sd);
    verdicts.total++;
    if (a.ok) verdicts.raw++;
    if (b.ok) verdicts.res++;
    detail.push({ name, breakEven: be, medSd, rawHours: a.hours, rawMove: a.move, rawOk: a.ok, resHours: b.hours, resMove: b.move, resOk: b.ok });

    const fmtH = h => Number.isFinite(h) ? (h < 100 ? h.toFixed(1) + 'h' : (h / 24).toFixed(0) + 'd') : '∞';
    console.log(
      name.padEnd(7)
      + (be.toFixed(2) + '%p').padStart(9)
      + (medSd.toFixed(3) + '%p').padStart(12)
      + fmtH(a.hours).padStart(14)
      + (a.move.toFixed(3) + '%p').padStart(12)
      + (a.ok ? '  통과' : '  미달')
      + fmtH(b.hours).padStart(13)
      + (b.move.toFixed(3) + '%p').padStart(12)
      + (b.ok ? '  통과' : '  미달')
    );
  }

  console.log('\n기대회귀폭 = 진입 자리(평균−1σ)에서 반감기가 지났을 때 되돌아오는 폭(0.5σ).');
  console.log('이 값이 본전 문턱보다 작으면, 평균적인 진입 자리에서는 비용도 못 건진다는 뜻이다.');
  console.log(`\n원본 기준 통과: ${verdicts.raw}/${verdicts.total}종목`);
  console.log(`잔차 기준 통과: ${verdicts.res}/${verdicts.total}종목`);

  console.log('\n───────────────────────────────────────────────');
  if (verdicts.raw === 0 && verdicts.res === 0) {
    console.log('결론: 어느 쪽도 비용 문턱을 넘지 못한다. 6년 파라미터 탐색은 의미가 없다.');
    console.log('      비용을 줄이거나(지정가 주문 등) 전혀 다른 신호를 찾아야 한다.');
  } else if (verdicts.res > verdicts.raw) {
    console.log('결론: 잔차 기반이 원본보다 유리하다. 잔차 진입을 정식 옵션으로 넣고 6년 탐색을 진행할 가치가 있다.');
  } else if (verdicts.raw > 0) {
    console.log('결론: 원본 기준으로도 통과하는 종목이 있다. 6년 탐색을 진행할 가치가 있다.');
  } else {
    console.log('결론: 통과 종목이 적다. 대상을 좁혀서 진행하는 것을 검토할 것.');
  }
  console.log('───────────────────────────────────────────────');

  fs.writeFileSync(path.join(lib.OUT_DIR, `analyze_${YEARS}y.json`), JSON.stringify({ years: YEARS, verdicts, detail }, null, 2));
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
