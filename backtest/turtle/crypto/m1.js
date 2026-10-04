// 1-minute drill-down cache for ambiguous hourly bars.
// perp/spot: Binance Vision daily 1m files (whole UTC day); upbit: REST minutes/1 for the specific hour.
'use strict';
const fs = require('fs'), zlib = require('zlib');
const HOUR = 3600e3;
function unzip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  const cd = buf.readUInt32LE(e + 16);
  const method = buf.readUInt16LE(cd + 10), csz = buf.readUInt32LE(cd + 20), loff = buf.readUInt32LE(cd + 42);
  const nl = buf.readUInt16LE(loff + 26), xl = buf.readUInt16LE(loff + 28);
  const data = buf.subarray(loff + 30 + nl + xl, loff + 30 + nl + xl + csz);
  return (method === 8 ? zlib.inflateRawSync(data) : data).toString();
}
function source(kind) { // kind: 'perp' | 'spot' | 'upbit'
  const dir = `data/m1/${kind}`;
  const mem = new Map();
  const missing = new Set();
  function fileFor(sym, hG) {
    const d = new Date(hG * HOUR).toISOString();
    return kind === 'upbit' ? `${dir}/${sym}/${d.slice(0, 13)}.json` : `${dir}/${sym}/${d.slice(0, 10)}.json`;
  }
  function get(sym, hG) {
    const fn = fileFor(sym, hG);
    let arr = mem.get(fn);
    if (arr === undefined) { try { arr = fs.existsSync(fn) ? JSON.parse(fs.readFileSync(fn)) : null; } catch (e) { arr = null; } mem.set(fn, arr); }
    if (arr === null) { missing.add(sym + '|' + hG); return null; }
    const t0 = hG * HOUR, t1 = t0 + HOUR;
    const rows = arr.filter(r => r[0] >= t0 && r[0] < t1);
    return rows.length ? rows : [];
  }
  return { kind, get, missing, fileFor, reset: () => mem.clear() };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchMissing(src, symMap) { // symMap: market sym -> exchange symbol
  const keys = [...src.missing]; const byFile = new Map();
  for (const k of keys) { const [sym, h] = k.split('|'); const fn = src.fileFor(sym, +h); if (!byFile.has(fn)) byFile.set(fn, [sym, +h]); }
  const jobs = [...byFile.entries()].filter(([fn]) => !fs.existsSync(fn));
  let done = 0, fail = 0;
  await Promise.all(Array.from({ length: src.kind === 'upbit' ? 1 : 8 }, async () => {
    while (jobs.length) {
      const [fn, [sym, h]] = jobs.shift();
      const d = new Date(h * HOUR).toISOString();
      fs.mkdirSync(fn.slice(0, fn.lastIndexOf('/')), { recursive: true });
      let rows = null;
      for (let i = 0; i < 5 && rows === null; i++) {
        try {
          if (src.kind === 'upbit') {
            const to = new Date((h + 1) * HOUR).toISOString().slice(0, 19) + 'Z';
            const r = await fetch(`https://api.upbit.com/v1/candles/minutes/1?market=KRW-${sym}&to=${encodeURIComponent(to)}&count=60`, { headers: { accept: 'application/json' } });
            if (r.status === 429) { await sleep(1500); continue; }
            if (!r.ok) throw new Error(r.status);
            const j = await r.json();
            rows = j.map(k => [Date.parse(k.candle_date_time_utc + 'Z'), k.opening_price, k.high_price, k.low_price, k.trade_price]).sort((a, b) => a[0] - b[0]);
            await sleep(130);
          } else {
            const path = src.kind === 'perp' ? 'futures/um' : 'spot';
            const ex = symMap ? symMap(sym) : sym;
            const r = await fetch(`https://data.binance.vision/data/${path}/daily/klines/${ex}/1m/${ex}-1m-${d.slice(0, 10)}.zip`);
            if (r.status === 404) { rows = []; break; }
            if (!r.ok) throw new Error(r.status);
            const txt = unzip(Buffer.from(await r.arrayBuffer()));
            rows = [];
            for (const line of txt.split('\n')) { const a = line.split(','); if (a.length < 5 || isNaN(+a[0])) continue; let t = +a[0]; if (t > 1e14) t = Math.floor(t / 1000); rows.push([t, +a[1], +a[2], +a[3], +a[4]]); }
          }
        } catch (e) { await sleep(1000 * (i + 1)); }
      }
      if (rows === null) { fail++; continue; }
      fs.writeFileSync(fn, JSON.stringify(rows)); done++;
    }
  }));
  src.missing.clear();
  return { done, fail };
}
module.exports = { source, fetchMissing };
