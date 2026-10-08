// 위쪽 진입 — 김프가 평균보다 «높을 때» 들어가는 반대 방향 전략이 되는가.
//
// 지금 봇: 김프가 평균 − 2σ 아래 → 국내 현물 매수 + 해외 선물 숏 → 평균 + 0.25σ 에서 청산.
// 위쪽  : 김프가 평균 + 2σ 위   → 국내에서 코인을 «빌려» 매도 + 해외 선물 롱 → 평균 − 0.25σ 에서 청산.
// 국내 거래소가 2025년에 코인 대여를 열어 구조는 가능해졌다. 대신 빌린 동안 매일 수수료가 붙는다.
//
// 엔진은 고치지 않고 자료를 «거울상» 으로 뒤집어 같은 규칙을 그대로 돌린다:
//   김프·평균의 부호를 뒤집으면 «평균보다 2σ 아래» 가 «평균보다 2σ 위» 가 된다.
//   펀딩비도 뒤집는다 — 숏은 양수 펀딩을 받지만 롱은 낸다.
//   가격 손절(+50%)은 그대로 둔다 — 빌려 판 국내 다리가 가격 상승에 담보를 잃는 방향이 같다.
// 수수료·스프레드·거래량 관문·자리 수·청산 규칙은 지금 봇(LIVE_PARAMS)과 같다.
const fs = require('fs');
const path = require('path');
const lib = require('./lib5m');

const YEARS = 6, TRAIN_RATIO = 0.7;
const LIVE = lib.LIVE_PARAMS;
const BORROW = [0, 0.03, 0.05];   // 하루 대여 수수료(%). 0.03 = 업비트, 0.05 = 빗썸 (2025년 기사 기준). 코빗 요율은 미확인

const ready = lib.COINS.filter(c =>
  fs.existsSync(path.join(lib.CACHE_DIR, `upbit_${c[0]}_${YEARS}y.json`)) &&
  fs.existsSync(path.join(lib.CACHE_DIR, `okx_${c[0]}_${YEARS}y.json`)));
lib.COINS.length = 0;
for (const c of ready) lib.COINS.push(c);

const neg = a => { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = -a[i]; return o; };
const mirror = ds => Object.assign({}, ds, {
  coins: ds.coins.map(c => Object.assign({}, c, { premium: neg(c.premium), ma: neg(c.ma), fCum: neg(c.fCum) })),
});

const p = (s, n) => String(s).padStart(n);
const sg = x => (x >= 0 ? '+' : '') + x;
const ratio = r => r.maxDrawdownMTM > 0 ? r.annualizedPct / (r.maxDrawdownMTM / lib.SEED * 100) : 0;
const pick = r => ({ trades: r.totalTrades, winRate: r.winRate, annualizedPct: r.annualizedPct, avgNet: r.avgNetPerTrade,
  avgHoldHours: r.avgHoldHours, mddMtm: r.maxDrawdownMTM, ratio: +ratio(r).toFixed(2), net: r.netProfit,
  funding: r.totalFunding, borrow: r.totalBorrow, spread: r.totalSpreadCost, fees: r.totalFees, exits: r.exitReasons, byCoin: r.byCoin });

const HEAD = '설정'.padEnd(30) + p('거래', 6) + p('승률', 6) + p('연환산', 8) + p('건당', 7) + p('보유h', 7)
  + p('MDD평가', 8) + p('비율', 6) + '  |' + p('검증', 4) + p('승률', 6) + p('연환산', 8) + p('MDD평가', 8) + p('비율', 6);
function row(label, P, ds) {
  const r = lib.simulate(ds, P), va = lib.simulate(ds, P, { fromRatio: TRAIN_RATIO, toRatio: 1 });
  console.log(label.padEnd(32) + p(r.totalTrades, 6) + p(r.winRate + '%', 7) + p(sg(r.annualizedPct) + '%', 9)
    + p('$' + r.avgNetPerTrade, 8) + p(r.avgHoldHours, 7) + p('$' + r.maxDrawdownMTM, 9) + p(ratio(r).toFixed(2), 7)
    + '  |' + p(va.totalTrades, 5) + p(va.winRate + '%', 7) + p(sg(va.annualizedPct) + '%', 9) + p('$' + va.maxDrawdownMTM, 9) + p(ratio(va).toFixed(2), 7));
  return { r, va };
}
// 두 전략을 한 계좌에서 같이 돌렸을 때 — 날짜별 평가손익을 더해 낙폭을 다시 잰다
function combine(a, b) {
  const m = new Map();
  for (const e of a.equity) m.set(e.date, e.mtm);
  let peak = 0, dd = 0, last = 0;
  for (const e of b.equity) { const v = (m.get(e.date) ?? 0) + e.mtm; if (v > peak) peak = v; if (peak - v > dd) dd = peak - v; last = v; }
  const ann = a.annualizedPct + b.annualizedPct;
  return { annualizedPct: +ann.toFixed(2), mddMtm: +dd.toFixed(2), ratio: dd > 0 ? +(ann / (dd / lib.SEED * 100)).toFixed(2) : 0 };
}

(async () => {
  console.log(`=== 위쪽 진입 (종목 ${ready.map(c => c[0]).join('·')}, ${YEARS}년) ===`);
  const ds = await lib.buildDataset({ yearsBack: YEARS, log: () => {} });
  const up = mirror(ds);
  const out = { coins: ready.map(c => c[0]), years: YEARS, borrowDailyPct: BORROW, rows: [] };

  console.log('\n[1] 아래쪽(지금 봇) vs 위쪽 — 자리 4개, 자리당 $1,000\n' + HEAD);
  const down = row('아래쪽 (지금 봇)', LIVE, ds);
  out.rows.push({ label: '아래쪽', full: pick(down.r), valid: pick(down.va) });
  const ups = {};
  for (const b of BORROW) {
    const x = row(`위쪽 · 대여료 하루 ${b}%`, Object.assign({}, LIVE, { BORROW_DAILY_PCT: b }), up);
    ups[b] = x;
    out.rows.push({ label: `위쪽 대여료 ${b}%`, full: pick(x.r), valid: pick(x.va) });
  }

  console.log('\n[2] 위쪽의 돈이 어디서 나가나 (6년 합계, 대여료 0.05%)');
  const u = ups[0.05].r, d = down.r;
  const line = (n, r) => console.log(`  ${n.padEnd(8)} 순손익 $${p(r.netProfit, 9)} | 펀딩 $${p(r.totalFunding, 8)} | 대여료 -$${p(r.totalBorrow, 8)} | 스프레드 -$${p(r.totalSpreadCost, 8)} | 수수료 -$${p(r.totalFees, 7)}`);
  line('아래쪽', d); line('위쪽', u);
  console.log('  청산 사유  아래쪽', JSON.stringify(d.exitReasons), '\n             위쪽  ', JSON.stringify(u.exitReasons));
  console.log('  종목별 순손익(위쪽):', Object.entries(u.byCoin).map(([k, v]) => `${k} $${v.net}(${v.trades}건)`).join('  '));

  console.log('\n[3] 연도별 순손익 ($) — 위쪽은 대여료 0.05%');
  const byYear = r => { const o = {}; for (const t of r.trades) { const y = new Date(t.exitTs).getUTCFullYear(); o[y] = (o[y] || 0) + t.netProfit; } return o; };
  const yd = byYear(d), yu = byYear(u);
  out.byYear = {};
  for (const y of [...new Set([...Object.keys(yd), ...Object.keys(yu)])].sort()) {
    console.log(`  ${y}  아래쪽 ${p(sg(Math.round(yd[y] || 0)), 7)}   위쪽 ${p(sg(Math.round(yu[y] || 0)), 7)}`);
    out.byYear[y] = { down: Math.round(yd[y] || 0), up: Math.round(yu[y] || 0) };
  }

  console.log('\n[4] 양쪽을 같이 — 같은 돈($4,000)을 나눠 쓴다 (대여료 0.05%)');
  const half = { MAX_POSITIONS: 2 };
  out.both = {};
  for (const [name, rng] of [['전체 6년', undefined], ['검증 구간', { fromRatio: TRAIN_RATIO, toRatio: 1 }]]) {
    const d4 = lib.simulate(ds, LIVE, rng);
    const d2 = lib.simulate(ds, Object.assign({}, LIVE, half), rng);
    const u2 = lib.simulate(up, Object.assign({}, LIVE, half, { BORROW_DAILY_PCT: 0.05 }), rng);
    const c = combine(d2, u2);
    console.log(`  ${name}: 아래쪽 4자리  연 ${sg(d4.annualizedPct)}%  MDD평가 $${d4.maxDrawdownMTM}  비율 ${ratio(d4).toFixed(2)}`);
    console.log(`  ${' '.repeat(name.length)}  아래 2 + 위 2  연 ${sg(c.annualizedPct)}%  MDD평가 $${c.mddMtm}  비율 ${c.ratio}   (아래 ${sg(d2.annualizedPct)}% / 위 ${sg(u2.annualizedPct)}%)`);
    out.both[name] = { down4: pick(d4), down2: pick(d2), up2: pick(u2), combined: c };
  }

  console.log('\n[5] 위쪽 조건을 조여 보면 (대여료 0.05%)\n' + HEAD);
  for (const [label, o] of [['진입 2.5σ', { ENTRY_SIGMA: 2.5 }], ['진입 3σ', { ENTRY_SIGMA: 3 }], ['관문 5배', { EDGE_MULTIPLE: 5 }],
                            ['최대 보유 2일', { MAX_HOLD_DAYS: 2, SOFT_HOLD_DAYS: 1 }]]) {
    const x = row('위쪽 · ' + label, Object.assign({}, LIVE, { BORROW_DAILY_PCT: 0.05 }, o), up);
    out.rows.push({ label: '위쪽 ' + label, full: pick(x.r), valid: pick(x.va) });
  }

  fs.writeFileSync(path.join(__dirname, 'upside_result.json'), JSON.stringify(out, null, 1));
})();
