// 진입선 배수(σ)와 이동평균 기간을 «시장 상황에 따라» 바꾸면 나아지는가.
//
// 동적 규칙을 만들기 전에, 그게 벌 수 있는 «상한»부터 잰다.
//   - 6년을 1년씩 6구간으로 자르고, 구간마다 가장 좋았던 (기간, σ) 조합을 찾는다.
//   - «구간마다 사후에 최적 조합을 골랐다면»(= 국면을 100% 맞히는 완벽한 동적 규칙)과
//     «지금 고정 조합(3일 · 2σ)을 그대로 썼다면»의 차이가 동적 규칙이 벌 수 있는 상한이다.
//   - 실제 동적 규칙은 국면을 틀리기도 하므로 이 상한보다 반드시 적게 번다.
//     상한이 작으면 만들 이유가 없고, 상한이 커도 «최적 조합이 해마다 제멋대로 바뀌면»
//     국면을 미리 알아볼 방법이 없으니 역시 과최적화 위험만 남는다.
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6;
const SLICES = 6;                  // 1년씩
const WINDOWS = [2, 3, 5, 7];      // 이동평균 기간(일)
const SIGMAS = [1.5, 2.0, 2.5];    // 진입선 배수
const FIXED = { win: 3, sig: 2.0 }; // 지금 봇

const LIVE = {
  EDGE_MULTIPLE: 3.0, EXIT_SIGMA_OFFSET: 0.25, REQUIRE_PROFIT_EXIT: false,
  MAX_POSITIONS: 4, RANK_BY: 'netEdge',
  SOFT_HOLD_DAYS: 2, SOFT_EXIT_LOSS_PP: 0.5, MAX_HOLD_DAYS: 5,
};

const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`))
);
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

const p = (s, n) => String(s).padStart(n);
const key = (w, s) => w + '일·' + s + 'σ';

(async () => {
  console.log(`=== 동적 σ · 동적 이동평균 — 벌 수 있는 상한 (종목 ${ready.length}개, ${YEARS}년) ===\n`);

  // res[key][slice] = { ann, mdd, trades }
  const res = {};
  let sliceDates = null;
  for (const w of WINDOWS) {
    const ds = await lib.buildDataset({ yearsBack: YEARS, windowDays: w, log: () => {} });
    for (const s of SIGMAS) {
      const P = Object.assign({}, LIVE, { ENTRY_SIGMA: s });
      const k = key(w, s);
      res[k] = [];
      for (let i = 0; i < SLICES; i++) {
        const r = lib.simulate(ds, P, { fromRatio: i / SLICES, toRatio: (i + 1) / SLICES });
        res[k].push({ ann: r.annualizedPct, mdd: r.maxDrawdownMTM, trades: r.totalTrades, from: r.range.from });
      }
      const all = lib.simulate(ds, P);
      res[k].full = { ann: all.annualizedPct, mdd: all.maxDrawdownMTM, trades: all.totalTrades };
      if (!sliceDates) sliceDates = res[k].map(x => x.from.slice(0, 7));
    }
    console.log(`  이동평균 ${w}일 완료`);
  }

  const keys = Object.keys(res);
  const fixedKey = key(FIXED.win, FIXED.sig);

  // 전체 기간 표
  console.log('\n===== 전체 6년 연환산 (행: 이동평균 기간 / 열: 진입선) =====');
  console.log(''.padEnd(8) + SIGMAS.map(s => p(s + 'σ', 10)).join(''));
  for (const w of WINDOWS) {
    console.log((w + '일').padEnd(8) + SIGMAS.map(s => {
      const v = res[key(w, s)].full.ann;
      return p((v >= 0 ? '+' : '') + v.toFixed(2) + '%' + (key(w, s) === fixedKey ? '*' : ''), 10);
    }).join(''));
  }
  console.log('(* = 지금 봇)');

  // 구간별 최적 조합
  console.log('\n===== 1년씩 잘랐을 때 — 구간마다 가장 좋았던 조합 =====');
  console.log('구간'.padEnd(10) + p('최적 조합', 12) + p('최적', 10) + p('지금(3일·2σ)', 14) + p('차이', 9) + p('지금 순위', 10));
  const bestCount = {};
  let gapSum = 0;
  const perSlice = [];
  for (let i = 0; i < SLICES; i++) {
    const ranked = keys.map(k => ({ k, ann: res[k][i].ann })).sort((a, b) => b.ann - a.ann);
    const best = ranked[0];
    const fixed = res[fixedKey][i].ann;
    const rank = ranked.findIndex(x => x.k === fixedKey) + 1;
    const gap = best.ann - fixed;
    gapSum += gap;
    bestCount[best.k] = (bestCount[best.k] || 0) + 1;
    perSlice.push({ slice: sliceDates[i], best: best.k, bestAnn: best.ann, fixedAnn: fixed, gap: +gap.toFixed(2), fixedRank: rank });
    console.log((sliceDates[i] + '~').padEnd(10) + p(best.k, 12)
      + p((best.ann >= 0 ? '+' : '') + best.ann.toFixed(2) + '%', 10)
      + p((fixed >= 0 ? '+' : '') + fixed.toFixed(2) + '%', 14)
      + p('+' + gap.toFixed(2) + '%p', 9)
      + p(rank + '/' + keys.length, 10));
  }
  const oracleGap = gapSum / SLICES;
  console.log(`\n완벽한 동적 규칙의 상한: 연 평균 +${oracleGap.toFixed(2)}%p (지금 고정 조합 대비)`);
  console.log('구간별 최적 조합이 몇 번 나왔나: ' + Object.entries(bestCount).map(([k, v]) => k + ' ' + v + '회').join(' · '));

  // 조합별 «해마다 몇 위였나» — 한결같이 좋은 조합이 있는가
  console.log('\n===== 조합별 구간 순위 (낮을수록 좋음) =====');
  const rankTable = keys.map(k => {
    const ranks = [];
    for (let i = 0; i < SLICES; i++) {
      const ranked = keys.map(kk => ({ kk, ann: res[kk][i].ann })).sort((a, b) => b.ann - a.ann);
      ranks.push(ranked.findIndex(x => x.kk === k) + 1);
    }
    return { k, ranks, avg: ranks.reduce((a, b) => a + b, 0) / ranks.length, worst: Math.max.apply(null, ranks),
             negYears: res[k].filter(x => x.ann < 0).length };
  }).sort((a, b) => a.avg - b.avg);
  console.log('조합'.padEnd(12) + sliceDates.map(d => p(d.slice(2), 7)).join('') + p('평균', 7) + p('최악', 6) + p('손실연도', 9));
  for (const r of rankTable) {
    console.log((r.k + (r.k === fixedKey ? '*' : '')).padEnd(12) + r.ranks.map(x => p(x, 7)).join('')
      + p(r.avg.toFixed(1), 7) + p(r.worst, 6) + p(r.negYears, 9));
  }

  fs.writeFileSync(path.join(lib.OUT_DIR, 'stability_result.json'),
    JSON.stringify({ years: YEARS, slices: SLICES, windows: WINDOWS, sigmas: SIGMAS, fixed: FIXED, live: LIVE,
                     results: res, perSlice, oracleGap: +oracleGap.toFixed(2), bestCount, rankTable }, null, 2));
  console.log('\n저장: stability_result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
