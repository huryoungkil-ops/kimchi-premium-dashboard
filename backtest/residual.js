// 잔차 기반 진입 — 「다음 작업」 1번의 실제 백테스트.
//
// 배경(halflife.js): 코인별 김프는 0.995 상관으로 같이 움직이므로 지금 전략은 사실상
// "한국 전체 김프"에 베팅하고 있다. 매 시점 전 종목 중앙값을 빼 잔차로 보면 회귀는
// 확실히 빨라진다(9종목 전부). 그런데 σ가 3~7배 줄어서, 1σ 진입 기준으로는 9종목 중
// 7종목이 본전 문턱도 못 넘는다. 남은 여지는 잔차 σ가 큰 XLM·XRP·DOGE·TRX 넷이다.
//
// 여기서는 그 계산이 실제 매매에서도 성립하는지 백테스트로 확인한다.
//
// ⚠️ 신호만 잔차로 보고, 손익은 실제 김프로 계산한다. 우리가 버는 것은 잔차가 아니라
//    그 종목의 실제 김프 변화이기 때문이다. 잔차 자체를 벌려면 나머지 종목을 반대로
//    잡아 공통 요인을 헤지해야 하는데, 그건 다리가 네 개인 다른 전략이다.
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const TRAIN_RATIO = 0.7;
const MIN_COINS_FOR_MEDIAN = 4;

// halflife.js에서 잔차 σ가 본전 문턱을 넘긴 종목들
const RESIDUAL_OK = ['XLM', 'XRP', 'DOGE', 'TRX'];

/**
 * 데이터셋의 각 코인에 잔차 계열(resPremium/resMa/resSd)을 붙인다.
 * 잔차 = 김프 − 그 시점 전 종목 중앙값.
 * 이동평균·표준편차는 lib5m이 원본에 쓰는 것과 같은 3일 창으로 계산한다.
 *
 * 중앙값은 **항상 전 종목**으로 낸다. 거래 대상을 줄이더라도 "공통 요인"의 추정은
 * 넓을수록 정확하기 때문이다.
 */
function attachResidual(dataset, opts) {
  const minCoins = (opts && opts.minCoins) || MIN_COINS_FOR_MEDIAN;
  const W = dataset.maxWindow;
  const gridLen = dataset.gridLen;
  const coins = dataset.coins;

  // 1) 격자 위에 전 종목을 올려 시점별 중앙값을 만든다
  const onGrid = coins.map(c => {
    const a = new Float64Array(gridLen).fill(NaN);
    for (let i = 0; i < c.premium.length; i++) a[c.gridIdx[i]] = c.premium[i];
    return a;
  });
  const med = new Float64Array(gridLen).fill(NaN);
  const buf = [];
  let covered = 0;
  for (let g = 0; g < gridLen; g++) {
    buf.length = 0;
    for (let k = 0; k < onGrid.length; k++) {
      const v = onGrid[k][g];
      if (Number.isFinite(v)) buf.push(v);
    }
    if (buf.length >= minCoins) {
      buf.sort((x, y) => x - y);
      const m = buf.length >> 1;
      med[g] = buf.length % 2 ? buf[m] : (buf[m - 1] + buf[m]) / 2;
      covered++;
    }
  }

  // 2) 코인별로 잔차와 그 이동통계를 행 인덱스 기준으로 만든다
  //    (simulate()가 코인 행 인덱스로 읽기 때문)
  for (const c of coins) {
    const n = c.premium.length;
    const res = new Float64Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      const m = med[c.gridIdx[i]];
      if (Number.isFinite(m)) res[i] = c.premium[i] - m;
    }
    const ma = new Float64Array(n).fill(NaN);
    const sd = new Float64Array(n).fill(NaN);
    let sum = 0, sumSq = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      const v = res[i];
      if (Number.isFinite(v)) { sum += v; sumSq += v * v; cnt++; }
      const j = i - W;
      if (j >= 0) {
        const o = res[j];
        if (Number.isFinite(o)) { sum -= o; sumSq -= o * o; cnt--; }
      }
      // 창의 절반 이상 값이 있어야 통계를 낸다
      if (cnt >= W / 2) {
        const m = sum / cnt;
        ma[i] = m;
        sd[i] = Math.sqrt(Math.max(0, sumSq / cnt - m * m));
      }
    }
    c.resPremium = res;
    c.resMa = ma;
    c.resSd = sd;
  }
  return { medianCoveragePct: +(covered / gridLen * 100).toFixed(1) };
}

module.exports = { attachResidual };

// ---------------------------------------------------------------------------
// 아래는 직접 실행했을 때의 실험
// ---------------------------------------------------------------------------
if (require.main === module) {
  const BASE = lib.LIVE_PARAMS;   // 지금 실거래 봇 설정 (lib5m.js)

  const ready = lib.COINS.filter(c =>
    fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
    fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
  );
  lib.COINS.length = 0;
  for (const c of ready) lib.COINS.push(c);

  const p = (s, n) => String(s).padStart(n);
  const HEAD = ''.padEnd(30) + '   거래   승률    연환산     건당       MDD  수익/MDD';
  function row(label, r) {
    return label.padEnd(30)
      + p(r.totalTrades, 7)
      + p(r.winRate === null ? '-' : r.winRate + '%', 8)
      + p((r.annualizedPct >= 0 ? '+' : '') + r.annualizedPct + '%', 10)
      + p('$' + r.avgNetPerTrade, 9)
      + p('$' + r.maxDrawdown, 10)
      + p((r.annualizedPct / (r.maxDrawdown || 1)).toFixed(2), 8);
  }

  (async () => {
    console.log(`=== 잔차 기반 진입 (종목 ${ready.length}개, ${YEARS}년) ===`);
    console.log(`기준 조합: ${JSON.stringify(BASE)}\n`);

    const ds = await lib.buildDataset({ yearsBack: YEARS });
    const info = attachResidual(ds);
    console.log(`\n중앙값 산출 가능 구간: ${info.medianCoveragePct}% (동시 ${MIN_COINS_FOR_MEDIAN}종목 이상)\n`);

    // 거래 대상만 줄인 얕은 복사본. 중앙값은 이미 전 종목으로 계산해 붙여놨다.
    const subset = (names) => Object.assign({}, ds, {
      coins: ds.coins.filter(c => names.includes(c.name)),
    });
    const dsFour = subset(RESIDUAL_OK);

    const cases = [
      ['원본 신호 · 전종목(현재)', ds, { SIGNAL_RESIDUAL: false }],
      ['잔차 신호 · 전종목', ds, { SIGNAL_RESIDUAL: true }],
      ['원본 신호 · 4종목', dsFour, { SIGNAL_RESIDUAL: false }],
      ['잔차 신호 · 4종목', dsFour, { SIGNAL_RESIDUAL: true }],
    ];

    const out = [];
    console.log('===== 전체 기간 =====');
    console.log(HEAD);
    for (const [label, dset, over] of cases) {
      const r = lib.simulate(dset, Object.assign({}, BASE, over));
      console.log(row('  ' + label, r));
      out.push({
        label, coins: dset.coins.map(c => c.name), residual: !!over.SIGNAL_RESIDUAL,
        full: { trades: r.totalTrades, winRate: r.winRate, ann: r.annualizedPct, mdd: r.maxDrawdown, avg: r.avgNetPerTrade },
        byCoin: r.byCoin,
      });
    }

    console.log('\n===== 학습(70%) / 검증(30%) =====');
    console.log(HEAD);
    for (let i = 0; i < cases.length; i++) {
      const [label, dset, over] = cases[i];
      const P = Object.assign({}, BASE, over);
      const tr = lib.simulate(dset, P, { fromRatio: 0, toRatio: TRAIN_RATIO });
      const va = lib.simulate(dset, P, { fromRatio: TRAIN_RATIO, toRatio: 1 });
      console.log(row('  [학습] ' + label, tr));
      console.log(row('  [검증] ' + label, va));
      out[i].train = { trades: tr.totalTrades, ann: tr.annualizedPct, mdd: tr.maxDrawdown };
      out[i].valid = { trades: va.totalTrades, ann: va.annualizedPct, mdd: va.maxDrawdown };
    }

    // 기준 조합(EDGE_MULTIPLE 등)은 "원본 신호"에 맞춰 고른 값이다. 그대로 잔차에
    // 씌우면 불공정하다 — 실제로 검증 구간에서 기대수익부족으로 5만 건 넘게 막힌다.
    // 잔차에 가장 유리한 조합까지 찾아준 뒤에 비교한다.
    console.log('\n===== 잔차 신호 · 4종목 · 진입선 × 기대수익 관문 =====');
    console.log(HEAD);
    const sweep = [];
    for (const edge of [0, 1, 2, 3, 5]) {
      for (const sig of [1.0, 1.5, 2.0]) {
        const P = Object.assign({}, BASE, { SIGNAL_RESIDUAL: true, ENTRY_SIGMA: sig, EDGE_MULTIPLE: edge });
        const r = lib.simulate(dsFour, P);
        const va = lib.simulate(dsFour, P, { fromRatio: TRAIN_RATIO, toRatio: 1 });
        console.log(row(`  관문 ${edge}배 · 진입 ${sig}σ`, r)
          + `  |검증 ${(va.annualizedPct >= 0 ? '+' : '') + va.annualizedPct}% (${va.totalTrades}건)`);
        sweep.push({
          edgeMultiple: edge, entrySigma: sig,
          trades: r.totalTrades, winRate: r.winRate, ann: r.annualizedPct,
          mdd: r.maxDrawdown, avg: r.avgNetPerTrade, avgHoldHours: r.avgHoldHours,
          validAnn: va.annualizedPct, validTrades: va.totalTrades,
        });
      }
    }
    const bestRes = sweep.reduce((a, b) => (b.ann > a.ann ? b : a));
    const baseAnn = out[0].full.ann;   // 원본 신호 · 전종목 · 현재 설정
    console.log(`\n잔차 최고 조합: 관문 ${bestRes.edgeMultiple}배 · 진입 ${bestRes.entrySigma}σ`
      + ` → 연 ${bestRes.ann}% (원본 전종목 현재 설정은 +${baseAnn}%)`);

    fs.writeFileSync(path.join(lib.OUT_DIR, 'residual_result.json'),
      JSON.stringify({ years: YEARS, base: BASE, residualCoins: RESIDUAL_OK, medianCoveragePct: info.medianCoveragePct, cases: out, entrySweep: sweep }, null, 2));
    console.log('\n저장: residual_result.json');
  })().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
