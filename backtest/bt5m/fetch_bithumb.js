// 빗썸 5분봉 2020-01-01 ~ 어제까지. 코인마다 data/bithumb/<COIN>.bin (Int32 분 · Float64 종가 · Float32 거래대금, 오래된 순)
const fs = require('fs'), path = require('path');
const N = Number(process.argv[2]) || 120, PAR = Number(process.argv[3]) || 4;
const START = Date.parse('2020-01-01T00:00:00+09:00');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOG = path.join(__dirname, 'data', 'fetch_bithumb.log');
const log = m => { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); };
let reqs = 0, errs = 0;
async function getJSON(url) {
  for (let i = 0; i < 8; i++) {
    try { reqs++; const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.status === 200) return await r.json();
      if (r.status === 404) return { notFound: true };
      errs++; await sleep(1000 * 2 ** Math.min(i, 5));
    } catch (e) { errs++; await sleep(1000 * 2 ** Math.min(i, 5)); }
  }
  throw new Error('실패 ' + url);
}
async function coin(c) {
  const f = path.join(__dirname, 'data', 'bithumb', c + '.bin');
  if (fs.existsSync(f)) return 'skip';
  const rows = new Map(); let to = null, guard = 0;
  for (;;) {
    const a = await getJSON(`https://api.bithumb.com/v1/candles/minutes/5?market=KRW-${c}&count=200${to ? '&to=' + encodeURIComponent(to) : ''}`);
    if (a.notFound || !Array.isArray(a) || !a.length) break;
    const before = rows.size;
    for (const x of a) rows.set(Math.round(Date.parse(x.candle_date_time_utc + 'Z') / 60000), [x.trade_price, x.candle_acc_trade_price]);
    const oldest = a[a.length - 1];
    if (rows.size === before || Date.parse(oldest.candle_date_time_utc + 'Z') < START || ++guard > 5000) break;
    to = oldest.candle_date_time_kst.replace('T', ' ');
  }
  const ks = [...rows.keys()].filter(k => k * 60000 >= START).sort((x, y) => x - y);
  const buf = Buffer.alloc(ks.length * 16);
  ks.forEach((k, i) => { const [p, v] = rows.get(k); buf.writeInt32LE(k, i * 16); buf.writeDoubleLE(p, i * 16 + 4); buf.writeFloatLE(v, i * 16 + 12); });
  fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f);
  return `${ks.length}봉 ${ks.length ? new Date(ks[0] * 60000).toISOString().slice(0, 10) : '-'}~`;
}
(async () => {
  const uni = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'universe.json'))).slice(0, N).map(x => x.coin);
  const queue = ['USDT', ...uni]; let done = 0; const t0 = Date.now();
  log(`시작 ${queue.length}종목 동시 ${PAR}`);
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (queue.length) { const c = queue.shift();
      try { const r = await coin(c); done++; log(`${c} ${r} · ${done}개 완료 · 요청 ${reqs} 오류 ${errs} · ${((Date.now() - t0) / 60000).toFixed(1)}분`); }
      catch (e) { log(`${c} 실패 ${e.message}`); } } }));
  log('끝');
})();
