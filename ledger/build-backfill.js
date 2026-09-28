// 기능 추가(2026-09-28) 이전에 청산된 거래의 환율·해외가를 김프 이력에서 찾아 고정해 둔다.
// 이후 거래는 봇이 entryFx / exitFx / exitForeignPrice 를 직접 기록하므로 여기 필요 없다.
// 실행: node ledger/build-backfill.js  (저장소 루트에서)
const fs = require('fs'), path = require('path');
const dir = 'backup/data/premium-history';

const hist = {}; // coin -> [{t, fp, fx}]
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.csv')).sort()) {
  for (const l of fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').slice(1)) {
    const p = l.split(',');
    const t = new Date(p[0]).getTime(), fp = +p[4], fx = +p[5];
    if (!isFinite(t) || !(fp > 0) || !(fx > 0)) continue;
    (hist[p[1]] = hist[p[1]] || []).push({ t, fp, fx });
  }
}
function nearest(coin, iso) {
  const t = new Date(iso).getTime();
  let best = null, bd = Infinity;
  for (const r of hist[coin] || []) { const d = Math.abs(r.t - t); if (d < bd) { bd = d; best = r; } }
  return best && Object.assign({ gapMin: bd / 60000 }, best);
}

const trades = require(path.resolve('backup/data/paper-trades.json')).filter(r => r.status === 'CLOSED');
const out = {};
for (const t of trades) {
  const e = nearest(t.coin, t.entryTime), x = nearest(t.coin, t.exitTime);
  if (!e || !x || e.gapMin > 3 || x.gapMin > 3) { console.error('이력 없음/멀음', t.id, t.coin, e && e.gapMin, x && x.gapMin); process.exit(1); }
  const pe = t.entryPremium / 100, px = t.exitPremium / 100;
  // 봇의 김프 = 국내호가 / 환율 / 해외가 - 1. 같은 회차의 환율을 쓰므로 해외가를 역산하면 기록과 일치한다.
  const entryForeignPrice = t.entryForeignPrice > 0 ? t.entryForeignPrice : e.fp;
  const entryFx = t.entryPrice / (entryForeignPrice * (1 + pe));
  const exitFx = x.fx;
  const exitForeignPrice = t.exitPrice / (exitFx * (1 + px));
  out[t.id] = {
    coin: t.coin,
    entryFx: +entryFx.toFixed(4), exitFx: +exitFx.toFixed(4),
    entryForeignPrice: +entryForeignPrice.toPrecision(8), exitForeignPrice: +exitForeignPrice.toPrecision(8),
    // 검증용: 이력의 환율·해외가와 얼마나 어긋나는가 (%)
    check: { entryFxVsHist: +((entryFx / e.fx - 1) * 100).toFixed(3), exitFpVsHist: +((exitForeignPrice / x.fp - 1) * 100).toFixed(3) }
  };
}
fs.writeFileSync('ledger/backfill.json', JSON.stringify(out, null, 1) + '\n');
console.log(Object.keys(out).length + '건 기록');
for (const [id, v] of Object.entries(out)) console.log(id, v.coin.padEnd(5), v.entryFx, v.exitFx, JSON.stringify(v.check));
