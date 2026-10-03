// 투자 규모별 수익률 감소 — 포지션 크기를 키우면 수익률이 어떻게 줄어드는가.
//  ① 백테스트: 슬롯당 금액을 $1k~$100k로 고정하고, 봉 거래대금의 1/5까지만 체결(나머지는 못 산다).
//     시드는 슬롯 금액 × 10으로 같이 키워 «자본 대비 수익률»을 비교한다.
//     거래대금은 업비트 기준이라 코빗 실제 유동성보다 낙관적이다(상한으로 읽을 것).
//  ② 지금 코빗 호가창: 같은 금액을 시장가로 사고팔 때의 슬리피지(왕복, %)를 잰다.
// 사용: node capacity.js [년=6]
const lib = require('./lib5m');
const YEARS = Number(process.argv[2] || 6);
const SIZES = [1000, 3000, 10000, 30000, 100000];
const COINS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'LINK', 'TRX', 'XLM', 'SUI'];

async function bookSlippage() {
  const fx = (await (await fetch('https://open.er-api.com/v6/latest/USD')).json()).rates.KRW;
  const out = {};
  for (const coin of COINS) {
    try {
      const j = await (await fetch(`https://api.korbit.co.kr/v2/orderbook?symbol=${coin.toLowerCase()}_krw`)).json();
      const d = j.data || j;
      const asks = d.asks.map(x => [Number(x.price), Number(x.qty)]), bids = d.bids.map(x => [Number(x.price), Number(x.qty)]);
      const mid = (asks[0][0] + bids[0][0]) / 2;
      const walk = (lv, krw) => { let left = krw, q = 0; for (const [p, s] of lv) { const take = Math.min(left, p * s); q += take / p; left -= take; if (left <= 0) break; } return left > 0 ? null : krw / q; };
      out[coin] = SIZES.map(usd => {
        const krw = usd * fx, buy = walk(asks, krw), sell = walk(bids, krw);
        return buy && sell ? ((buy - mid) / mid + (mid - sell) / mid) * 100 : null; // 왕복 비용 %
      });
    } catch (e) { out[coin] = SIZES.map(() => null); }
  }
  return { fx, out };
}

(async () => {
  const ds = await lib.buildDataset({ yearsBack: YEARS });
  console.log(`\n=== 규모별 백테스트 (${YEARS}년) — 시드 = 슬롯 × 10, 슬롯 최대 4 ===`);
  console.log('슬롯$     시드$      거래  승률   누적손익$   연수익%(단리)  유동성제한  평균체결$');
  const res = [];
  for (const s of SIZES) {
    const r = lib.simulate(ds, Object.assign({}, lib.LIVE_PARAMS, { SIZING: 'equity', FIXED_SIZE_USD: s }), { fromRatio: 0, toRatio: 1 });
    const yrs = (new Date(r.range.to) - new Date(r.range.from)) / 3.156e10;
    const annual = r.netProfit / (s * 10) / yrs * 100;
    res.push({ s, trades: r.totalTrades, win: r.winRate, net: r.netProfit, annual, capped: r.cappedByLiquidity, avg: r.avgSizeUsd });
    console.log(String(s).padStart(6), String(s * 10).padStart(9), String(r.totalTrades).padStart(6), r.winRate.toFixed(1).padStart(6),
      r.netProfit.toFixed(0).padStart(11), annual.toFixed(2).padStart(13), String(r.cappedByLiquidity).padStart(11), r.avgSizeUsd.toFixed(0).padStart(10));
  }
  const { fx, out } = await bookSlippage();
  console.log(`\n=== 지금 코빗 호가창 왕복 슬리피지 % (환율 ${fx.toFixed(1)}) — null = 호가창 부족 ===`);
  console.log('코인   ' + SIZES.map(s => ('$' + s).padStart(9)).join(''));
  for (const [c, v] of Object.entries(out)) console.log(c.padEnd(6) + v.map(x => (x === null ? 'null' : x.toFixed(3)).padStart(9)).join(''));
  require('fs').writeFileSync(__dirname + '/capacity_result.json', JSON.stringify({ at: new Date().toISOString(), years: YEARS, backtest: res, slippage: { fx, sizes: SIZES, coins: out } }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
