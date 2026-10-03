// Merge all outputs into results.json
import fs from 'fs';
const J = f => JSON.parse(fs.readFileSync(f));
const bt = J('bt_raw.json'), sw = J('bt_stocks_weekend.json'), liq = J('bt_liquidity_filter.json');
const condense = s => s.note ? s : ({ desc: s.desc, obs: s.obs, premiumStats: s.stats, premTradFiOpen: s.statsTradFiOpen, premTradFiClosed: s.statsTradFiClosed, halfLifeBars: s.halfLifeObs, results: Object.fromEntries(Object.entries(s.results).map(([k, r]) => [k, { period: r.period, trades: r.trades, winPct: r.winPct, avgGrossPct: r.avgGrossPct, avgNetPct: r.avgNetPct, annNetPctOnNotional: r.annNetPct, sharpe: r.sharpe, mddPct: r.mddPct, avgHoldH: r.avgHoldH, timeoutPct: r.timeoutPct, byYear: r.byYear, signalWhenTradFiClosed: r.signalWhenTradFiClosed, signalWhenTradFiOpen: r.signalWhenTradFiOpen }])) });
const hl = J('hl_hip3_snapshot.json');
const hlComm = Object.values(hl).flat().filter(r => /GOLD|SILVER|CL$|BRENT|NATGAS|COPPER|PLATINUM|PALLADIUM|:HO$|SP500|XYZ100|JP225|US500|USTECH/.test(r.n)).map(r => ({ market: r.n, maxLev: r.lev, oiUsdM: +(r.oi / 1e6).toFixed(2), vol24hUsdM: +(r.vol / 1e6).toFixed(2), fundingPerHour: +r.f }));
const res = {
  generated: new Date().toISOString(),
  note: 'All numbers computed from public APIs on 2026-10-03 (UTC). Unverified items are marked 확인 못함. Funding not included in backtest P&L.',
  assumptions: bt.assumptions,
  catalog_live: {
    binance_tradfi_perps_commodity: 'XAUUSDT(2025-12-11), XAGUSDT(2026-01-07), XPTUSDT/XPDUSDT(2026-01-30), COPPERUSDT(2026-03-06), CLUSDT/BZUSDT/NATGASUSDT(2026-04-01); contractType TRADIFI_PERPETUAL; no RBOB gasoline, no heating oil',
    binance_tradfi_counts: { equity: 175, kr_equity: 8, hk_equity: 15, cn_equity: 2, fx: 1, premarket: 4, commodity: 8 },
    binance_XAUUSDT_contract: { minQty: '0.001 oz', minNotional: 5, maintMarginPct: 2.5, requiredMarginPct: 5, impliedMaxLev: '20x (from requiredMarginPercent; actual brackets need auth - 확인 못함)' },
    binance_rwa_coin_perps: 'PAXGUSDT perp (2025-03-27), XAUTUSDT perp (2026-03-26)',
    bybit_linear_commodity_fx: 'XAUUSDT 150x, XAGUSDT 150x, CLUSDT 150x, BZUSDT 100x, EURUSD/GBPUSD/USDJPY 100x; also XAUTUSDT/PAXGUSDT perps, XAUT weekly futures; xStocks spot (TSLAX, NVDAX, AAPLX, ...)',
    hyperliquid_hip3_commodity_index: hlComm,
    ostium_feeds: 'CL, BRENT, DIESEL, XAU, XAG, XPT, XPD, HG, UNG, XLE, COCOA, COFFEE, COTTON, SUGAR, SPX, NDX, DJI, DAX, FTSE, NIK, HSI, FX, stocks; all RWA feeds isMarketOpen=false on Saturday 2026-10-03 (weekend closed)',
    gtrade_commodities: 'XAU, XAG, XPT, XPD, HG, WTI, BRENT, NATGAS; commodities-1 maxLev 250x, commodities-2 150x; WTI open fee 0.04%, XAU 0.035% (parsed from 1e10 precision fields - unit interpretation 확인 필요); isCommoditiesOpen=false on Saturday',
    gasoline_RBOB_anywhere: 'not found on Binance, Bybit, Hyperliquid HIP-3, Ostium, gTrade (2026-10-03)',
    market_snapshot: J('data/market_snapshot.json'),
    binance_funding_recent: J('data/funding_summary.json'),
  },
  backtest_A_gold: Object.fromEntries(Object.entries(bt.series).filter(([k]) => k.startsWith('A')).map(([k, v]) => [k, condense(v)])),
  backtest_A_liquidity_filter: liq,
  backtest_B_stocks: Object.fromEntries(Object.entries(sw.B_stock_premium).map(([k, v]) => [k, condense(v)])),
  weekend_gold: sw.weekend_gold,
  weekend_stocks: sw.weekend_stocks,
  backtest_C_oil_and_crossvenue: Object.fromEntries(Object.entries(bt.series).filter(([k]) => k.startsWith('C')).map(([k, v]) => [k, condense(v)])),
  sources: [
    'https://api.binance.com/api/v3/klines , https://fapi.binance.com/fapi/v1/{klines,exchangeInfo,fundingRate,openInterest,premiumIndex}',
    'https://api.bybit.com/v5/market/{kline,instruments-info,tickers}', 'https://www.okx.com/api/v5/market/history-candles', 'https://api-pub.bitfinex.com/v2/candles',
    'https://api.hyperliquid.xyz/info (perpDexs, metaAndAssetCtxs, candleSnapshot)', 'https://query1.finance.yahoo.com/v8/finance/chart/{GC=F,TSLA,NVDA,AAPL,SPY}',
    'https://metadata-backend.ostium.io/PricePublish/latest-prices', 'https://backend-arbitrum.gains.trade/trading-variables',
    'https://www.paxos.com/pax-gold', 'https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals',
    'https://cointelegraph.com/news/binance-changes-off-hours-pricing-method-commodity-perpetual-futures',
    'https://www.coindesk.com/business/2026/07/15/ostium-suffers-usd18-million-exploit-as-oracle-attack-wave-continues-to-hit-defi',
    'https://cointelegraph.com/markets/trade-xyz-sk-hynix-perp-liquidations-price-anomaly', 'https://beincrypto.com/hyperliquid-sk-hynix-perp-oracle-liquidations/ (403, headline/snippet only)',
    'https://biz.chosun.com/en/en-finance/2026/07/30/NESEWJYAKFETNLIUOVA647GRQI/ (snippet)', 'https://www.news2day.co.kr/article/20261001500221',
    'https://www.newsis.com/view/NISX20261001_0003810086 (snippet)', 'Google News RSS / Bing News RSS headlines (news_rss.json, news_bing.json)'
  ]
};
fs.writeFileSync('results.json', JSON.stringify(res, null, 1));
console.log('results.json', fs.statSync('results.json').size);
