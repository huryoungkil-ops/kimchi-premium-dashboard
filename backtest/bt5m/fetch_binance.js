// 바이낸스 USDT-M 무기한 5분봉(월별 압축 파일 + 이번 달은 API)과 펀딩비. 코인마다 data/binance/<COIN>.bin (Int32 분 · Float64 종가, 1000배 종목은 코인 1개 값으로 환산), <COIN>.funding.json
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const N = Number(process.argv[2]) || 120, PAR = Number(process.argv[3]) || 6;
const D = p => path.join(__dirname, 'data', p);
const log = m => fs.appendFileSync(D('fetch_binance.log'), new Date().toISOString() + ' ' + m + '\n');
const run = (cmd, args, opt = {}) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 1 << 29, encoding: 'buffer', ...opt }, (e, out) => e ? rej(e) : res(out)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(u) { for (let i = 0; i < 6; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (r.ok) return r.json(); } catch (e) {} await sleep(1500 * (i + 1)); } throw new Error(u); }
const months = []; for (let y = 2020; y <= 2026; y++) for (let m = 1; m <= 12; m++) { const k = `${y}-${String(m).padStart(2, '0')}`; if (k <= '2026-09') months.push(k); }
async function month(sym, k) {
  const z = D(`zip/${sym}-5m-${k}.zip`);
  if (!fs.existsSync(z)) {
    try { await run('curl', ['-sf', '-o', z, `https://data.binance.vision/data/futures/um/monthly/klines/${sym}/5m/${sym}-5m-${k}.zip`]); }
    catch (e) { return []; }   // 그 달에 상장 전이면 없음
  }
  const csv = (await run('C:/Windows/System32/tar.exe', ['-xOf', z])).toString();
  const out = [];
  for (const line of csv.split('\n')) { const a = line.split(','); const t = Number(a[0]); if (!(t > 0)) continue; out.push([Math.round(t / 60000), Number(a[4])]); }
  return out;
}
async function coin(u) {
  const f = D(`binance/${u.coin}.bin`);
  if (fs.existsSync(f)) return 'skip';
  const rows = new Map();
  for (const k of months) for (const [t, c] of await month(u.symbol, k)) rows.set(t, c);
  // 이번 달(2026-10)은 API
  let start = Date.parse('2026-10-01T00:00:00Z');
  for (let i = 0; i < 10; i++) { const a = await getJSON(`https://fapi.binance.com/fapi/v1/klines?symbol=${u.symbol}&interval=5m&startTime=${start}&limit=1500`); if (!a.length) break;
    for (const x of a) rows.set(Math.round(x[0] / 60000), Number(x[4])); start = a.at(-1)[0] + 300000; if (a.length < 1500) break; }
  const ks = [...rows.keys()].sort((x, y) => x - y), buf = Buffer.alloc(ks.length * 12);
  ks.forEach((k, i) => { buf.writeInt32LE(k, i * 12); buf.writeDoubleLE(rows.get(k) / u.mult, i * 12 + 4); });
  fs.writeFileSync(f, buf);
  // 펀딩비
  const fund = []; start = Date.parse('2020-01-01T00:00:00Z');
  for (let i = 0; i < 40; i++) { const a = await getJSON(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${u.symbol}&startTime=${start}&limit=1000`); if (!a.length) break;
    for (const x of a) fund.push([Math.round(x.fundingTime / 60000), Number(x.fundingRate)]); start = a.at(-1).fundingTime + 1; if (a.length < 1000) break; await sleep(300); }
  fs.writeFileSync(D(`binance/${u.coin}.funding.json`), JSON.stringify(fund));
  for (const k of months) { try { fs.unlinkSync(D(`zip/${u.symbol}-5m-${k}.zip`)); } catch (e) {} }
  return `${ks.length}봉 ${ks.length ? new Date(ks[0] * 60000).toISOString().slice(0, 10) : '-'}~ · 펀딩 ${fund.length}`;
}
(async () => {
  const uni = JSON.parse(fs.readFileSync(D('universe.json'))).slice(0, N);
  const q = uni.slice(); let done = 0; const t0 = Date.now(); log(`시작 ${q.length}종목 동시 ${PAR}`);
  await Promise.all(Array.from({ length: PAR }, async () => { while (q.length) { const u = q.shift();
    try { const r = await coin(u); done++; log(`${u.coin} ${r} · ${done}개 · ${((Date.now() - t0) / 60000).toFixed(1)}분`); } catch (e) { log(`${u.coin} 실패 ${e.message}`); } } }));
  log('끝');
})();
