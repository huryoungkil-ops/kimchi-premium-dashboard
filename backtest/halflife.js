// 평균회귀 반감기(OU θ) 추정 — 6년 탐색 전에 재기로 한 두 가지 중 하나.
//
// 왜 재는가: 이 전략은 "김프가 평소보다 낮을 때 들어가 평균으로 돌아오면 정리한다".
// 그런데 돌아오는 데 걸리는 시간이 최대보유기간(7일)보다 훨씬 길면, 회귀가
// 오기 전에 강제청산당한다. 그러면 어떤 파라미터 조합을 골라도 이길 수 없다.
// 파라미터를 120개씩 훑기 전에 "애초에 이길 수 있는 종목인가"를 먼저 본다.
//
// 무엇을 재는가: 두 종류의 편차에 AR(1)을 적합해 반감기를 구한다.
//   원본 편차  d_t = 김프_t − (3일 이동평균)        ← 지금 전략이 실제로 거래하는 값
//   잔차 편차  dr_t = (김프_t − 전종목 중앙값_t) − (그 값의 3일 이동평균)
// 둘을 나란히 놓는 이유는 「다음 작업」 1번(잔차 기반 진입) 때문이다. 코인별 김프가
// 0.995 상관으로 같이 움직이므로 지금은 사실상 "한국 전체 김프"에 베팅하는 셈인데,
// 공통 요인을 뺀 잔차가 더 빨리 회귀한다면 잔차로 갈아탈 근거가 된다.
//
// 이동평균·표준편차는 두 계열 모두 같은 코드로(공통 격자 위에서) 계산한다.
// 그래야 차이가 "중앙값을 뺐다"는 것 하나에서만 나온다.
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const W = lib.MAX_WINDOW;          // 3일 = 864봉
const MIN_IN_WINDOW = Math.floor(W * 0.5);  // 창 안에 이만큼은 값이 있어야 통계를 낸다
const MIN_COINS_FOR_MEDIAN = 4;    // 중앙값을 낼 때 최소 이만큼의 종목이 동시에 있어야 한다
const BASE = JSON.parse(fs.readFileSync(path.join(lib.OUT_DIR, 'run6y_result.json'), 'utf8')).best;
const ENTRY_SIGMA = BASE.ENTRY_SIGMA;
const MAX_HOLD_DAYS = lib.DEFAULT_PARAMS.MAX_HOLD_DAYS;

// 5분봉 한 개 단위로만 재면 호가 튐(microstructure noise)이 회귀를 실제보다
// 빠르게 보이게 만든다. 표본 간격을 넓혀가며 같은 답이 나오는지 확인한다.
// 간격을 넓혀도 값이 더 안 커지면 그때가 수렴한 추정치다.
const STEPS = [
  { bars: 1, label: '5분' },
  { bars: 12, label: '1시간' },
  { bars: 72, label: '6시간' },
  { bars: 288, label: '24시간' },
  { bars: 576, label: '48시간' },
];
// 판정에는 가장 보수적인(= 가장 느린) 추정치를 쓴다.
const slowest = (obj) => {
  let best = null;
  for (const s of STEPS) {
    const v = obj[s.label];
    if (Number.isFinite(v) && (best === null || v > best)) best = v;
  }
  return best === null ? Infinity : best;
};

const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
);
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

// ---------------------------------------------------------------------------
// 공통 격자 위의 이동평균·표준편차. 값이 없는 칸(NaN)은 건너뛰고 개수로만 센다.
// 누적합을 쓰면 창을 옮길 때 O(1)이라 63만 칸도 즉시 끝난다.
// ---------------------------------------------------------------------------
function rollingStats(series) {
  const n = series.length;
  const ma = new Float64Array(n).fill(NaN);
  const sd = new Float64Array(n).fill(NaN);
  let sum = 0, sumSq = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    const v = series[i];
    if (Number.isFinite(v)) { sum += v; sumSq += v * v; cnt++; }
    const j = i - W;
    if (j >= 0) {
      const o = series[j];
      if (Number.isFinite(o)) { sum -= o; sumSq -= o * o; cnt--; }
    }
    if (cnt >= MIN_IN_WINDOW) {
      const m = sum / cnt;
      ma[i] = m;
      sd[i] = Math.sqrt(Math.max(0, sumSq / cnt - m * m));
    }
  }
  return { ma, sd };
}

// ---------------------------------------------------------------------------
// AR(1) 적합:  x_{t+step} = α + φ·x_t
//   반감기(봉) = −ln2 / ln(φ)
// φ가 1 이상이면 회귀하지 않는다는 뜻이라 반감기를 정의할 수 없다.
// ---------------------------------------------------------------------------
function fitAR1(series, stepBars) {
  const n = series.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, k = 0;
  for (let i = 0; i + stepBars < n; i += stepBars) {
    const x = series[i], y = series[i + stepBars];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sx += x; sy += y; sxx += x * x; sxy += x * y; k++;
  }
  if (k < 100) return null;
  const varX = sxx / k - (sx / k) * (sx / k);
  if (varX <= 0) return null;
  const phi = (sxy / k - (sx / k) * (sy / k)) / varX;
  if (!(phi > 0) || phi >= 1) return { phi, halfLifeBars: Infinity, samples: k };
  return { phi, halfLifeBars: -Math.LN2 / Math.log(phi) * stepBars, samples: k };
}

function median(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function fmtHours(h) {
  if (!Number.isFinite(h)) return '회귀없음';
  if (h < 48) return h.toFixed(1) + '시간';
  return (h / 24).toFixed(1) + '일';
}

(async () => {
  console.log(`=== 평균회귀 반감기 추정 (종목 ${ready.length}개, ${YEARS}년) ===`);
  console.log(`진입선 ${ENTRY_SIGMA}σ · 최대보유 ${MAX_HOLD_DAYS}일 · 창 ${W}봉(3일)\n`);

  const ds = await lib.buildDataset({ yearsBack: YEARS });
  const { gridLen, barMinutes } = ds;
  const barsPerDay = 1440 / barMinutes;

  // 1) 전 종목을 공통 격자에 올린다
  const prem = ds.coins.map(c => {
    const a = new Float64Array(gridLen).fill(NaN);
    for (let i = 0; i < c.premium.length; i++) a[c.gridIdx[i]] = c.premium[i];
    return a;
  });

  // 2) 매 시점 전 종목 중앙값 = 공통 요인("한국 전체 김프")
  const med = new Float64Array(gridLen).fill(NaN);
  const buf = [];
  let medCovered = 0;
  for (let i = 0; i < gridLen; i++) {
    buf.length = 0;
    for (let k = 0; k < prem.length; k++) {
      const v = prem[k][i];
      if (Number.isFinite(v)) buf.push(v);
    }
    if (buf.length >= MIN_COINS_FOR_MEDIAN) { med[i] = median(buf); medCovered++; }
  }
  console.log(`공통 격자 ${gridLen.toLocaleString('en-US')}칸 중 중앙값 산출 가능 ${(medCovered / gridLen * 100).toFixed(1)}%`
    + ` (동시에 ${MIN_COINS_FOR_MEDIAN}종목 이상)\n`);

  const rows = [];
  for (let k = 0; k < ds.coins.length; k++) {
    const c = ds.coins[k];
    const raw = prem[k];

    // 잔차 = 김프 − 전종목 중앙값
    const res = new Float64Array(gridLen).fill(NaN);
    for (let i = 0; i < gridLen; i++) {
      const a = raw[i], b = med[i];
      if (Number.isFinite(a) && Number.isFinite(b)) res[i] = a - b;
    }

    // 두 계열 모두 같은 방식으로 편차를 만든다
    const sRaw = rollingStats(raw);
    const sRes = rollingStats(res);
    const devRaw = new Float64Array(gridLen).fill(NaN);
    const devRes = new Float64Array(gridLen).fill(NaN);
    const sdRawVals = [], sdResVals = [];
    for (let i = 0; i < gridLen; i++) {
      if (Number.isFinite(raw[i]) && Number.isFinite(sRaw.ma[i])) {
        devRaw[i] = raw[i] - sRaw.ma[i];
        if (Number.isFinite(sRaw.sd[i])) sdRawVals.push(sRaw.sd[i]);
      }
      if (Number.isFinite(res[i]) && Number.isFinite(sRes.ma[i])) {
        devRes[i] = res[i] - sRes.ma[i];
        if (Number.isFinite(sRes.sd[i])) sdResVals.push(sRes.sd[i]);
      }
    }

    const sigRaw = sdRawVals.length ? median(sdRawVals) : NaN;
    const sigRes = sdResVals.length ? median(sdResVals) : NaN;
    const be = lib.breakEvenPp(c.name, BASE.FEE_SCENARIO, true);

    const fits = { raw: {}, res: {} };
    for (const s of STEPS) {
      const fr = fitAR1(devRaw, s.bars);
      const fe = fitAR1(devRes, s.bars);
      fits.raw[s.label] = fr ? fr.halfLifeBars / barsPerDay * 24 : null;
      fits.res[s.label] = fe ? fe.halfLifeBars / barsPerDay * 24 : null;
    }

    // 결론에 쓸 기준은 간격별 추정치 중 가장 느린 것
    const hlRaw = slowest(fits.raw);
    const hlRes = slowest(fits.res);

    // 최대보유기간 안에 기대되는 회귀폭.
    //   진입 시 편차 = −ENTRY_SIGMA×σ, 반감기 HL이면 t일 뒤 남는 편차는 0.5^(t/HL)배.
    //   즉 회복폭 = ENTRY_SIGMA×σ×(1 − 0.5^(보유일/HL))
    const recov = (hl, sig) => {
      if (!Number.isFinite(hl) || !Number.isFinite(sig)) return NaN;
      return ENTRY_SIGMA * sig * (1 - Math.pow(0.5, MAX_HOLD_DAYS / (hl / 24)));
    };
    const recRaw = recov(hlRaw, sigRaw);
    const recRes = recov(hlRes, sigRes);

    rows.push({
      coin: c.name, breakEven: +be.toFixed(3),
      sigmaRaw: +sigRaw.toFixed(3), sigmaRes: +sigRes.toFixed(3),
      halfLifeHoursRaw: fits.raw, halfLifeHoursRes: fits.res,
      hlRawH: hlRaw, hlResH: hlRes,
      recoverRaw: +recRaw.toFixed(3), recoverRes: +recRes.toFixed(3),
      passRaw: recRaw > be, passRes: recRes > be,
      // 잔차로 거래하려면 진입선을 몇 σ까지 내려야 본전 문턱을 넘는가.
      // (회귀는 거의 100% 일어나므로 회귀폭 ≈ 진입 편차로 보고 역산한다)
      needSigmaRes: +(be / sigRes).toFixed(2),
      needSigmaRaw: +(be / sigRaw).toFixed(2),
    });
  }

  // ---- 출력 ----
  const p = (s, n) => String(s).padStart(n);
  console.log('===== 반감기 (표본 간격별) — 원본 편차 =====');
  console.log('종목'.padEnd(8) + STEPS.map(s => p(s.label, 12)).join('') + p('σ(중앙값)', 12));
  for (const r of rows) {
    console.log(r.coin.padEnd(8)
      + STEPS.map(s => p(fmtHours(r.halfLifeHoursRaw[s.label]), 12)).join('')
      + p(r.sigmaRaw.toFixed(2) + '%p', 12));
  }

  console.log('\n===== 반감기 (표본 간격별) — 잔차 편차 (중앙값 제거) =====');
  console.log('종목'.padEnd(8) + STEPS.map(s => p(s.label, 12)).join('') + p('σ(중앙값)', 12));
  for (const r of rows) {
    console.log(r.coin.padEnd(8)
      + STEPS.map(s => p(fmtHours(r.halfLifeHoursRes[s.label]), 12)).join('')
      + p(r.sigmaRes.toFixed(2) + '%p', 12));
  }

  console.log(`\n===== 판정: ${MAX_HOLD_DAYS}일 안의 기대 회귀폭이 본전 문턱을 넘는가 (가장 느린 추정치 기준) =====`);
  console.log('종목'.padEnd(8) + p('문턱', 9) + p('원본 반감기', 13) + p('회귀폭', 9) + p('판정', 7)
    + p('잔차 반감기', 13) + p('회귀폭', 9) + p('판정', 7) + p('잔차 필요σ', 12));
  for (const r of rows) {
    console.log(r.coin.padEnd(8)
      + p(r.breakEven.toFixed(2) + '%p', 9)
      + p(fmtHours(r.hlRawH), 13) + p(r.recoverRaw.toFixed(2) + '%p', 9) + p(r.passRaw ? 'O' : 'X', 7)
      + p(fmtHours(r.hlResH), 13) + p(r.recoverRes.toFixed(2) + '%p', 9) + p(r.passRes ? 'O' : 'X', 7)
      + p(Number.isFinite(r.needSigmaRes) ? r.needSigmaRes.toFixed(1) + 'σ' : '-', 12));
  }

  const passRaw = rows.filter(r => r.passRaw).length;
  const passRes = rows.filter(r => r.passRes).length;
  const faster = rows.filter(r => Number.isFinite(r.hlResH) && Number.isFinite(r.hlRawH) && r.hlResH < r.hlRawH).length;
  console.log(`\n문턱 통과: 원본 ${passRaw}/${rows.length}종목, 잔차 ${passRes}/${rows.length}종목`);
  console.log(`잔차가 더 빨리 회귀한 종목: ${faster}/${rows.length}`);

  fs.writeFileSync(path.join(lib.OUT_DIR, 'halflife_result.json'),
    JSON.stringify({
      years: YEARS, base: BASE, entrySigma: ENTRY_SIGMA, maxHoldDays: MAX_HOLD_DAYS,
      windowBars: W, minCoinsForMedian: MIN_COINS_FOR_MEDIAN,
      medianCoveragePct: +(medCovered / gridLen * 100).toFixed(1),
      coins: rows,
      summary: { passRaw, passRes, faster, total: rows.length },
    }, null, 2));
  console.log('\n저장: halflife_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
