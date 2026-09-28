// 원장 검증: node ledger/check.js [환율]
const L = require('./ledger.js');
const cfg = require('./config.json'), bf = require('./backfill.json');
const trades = require('../backup/data/paper-trades.json');
const fx = Number(process.argv[2]) || cfg.segment.fx;
console.log('id  코인   코빗(₩)      OKX($)   두다리($)  봇기록   차이');
let bot = 0;
trades.filter(t => t.status === 'CLOSED').forEach(t => {
  const g = L.closedLegs(t, bf); bot += t.netProfit;
  console.log(String(t.id).padEnd(4) + t.coin.padEnd(6) + g.korbitKrw.toFixed(0).padStart(10) + g.okxUsd.toFixed(2).padStart(10) +
    g.netUsd.toFixed(2).padStart(10) + t.netProfit.toFixed(2).padStart(9) + (g.netUsd - t.netProfit).toFixed(2).padStart(7));
});
const r = L.compute(cfg, trades, bf, { fx });
const seg = L.compute(cfg, trades, bf, { fx: cfg.segment.fx, asOf: cfg.segment.from });
console.log('\n환율', fx);
console.log('코빗  예수금 $' + r.korbit.cashUsd.toFixed(2), '코인 $' + r.korbit.holdUsd.toFixed(2), '합 $' + r.korbit.totalUsd.toFixed(2), r.korbit.share.toFixed(1) + '%');
console.log('OKX   예수금 $' + r.okx.cashUsd.toFixed(2), '미실현 $' + r.okx.unrealUsd.toFixed(2), '합 $' + r.okx.totalUsd.toFixed(2), r.okx.share.toFixed(1) + '%');
console.log('합계 $' + r.total.toFixed(2), '(' + r.pnlPct.toFixed(2) + '%)', '전략', r.strategyUsd.toFixed(2), '환율효과', r.fxEffectUsd.toFixed(2), '봇기록합', bot.toFixed(2));
console.log('리밸런싱', r.rebalanceUsd.toFixed(2), '| 09-28 기준 총액', seg.total.toFixed(2), '누락', r.missing);
