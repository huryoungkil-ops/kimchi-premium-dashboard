const fs = require('fs'), zlib = require('zlib'); const sleep = ms => new Promise(r => setTimeout(r, ms));
function unzipFirst(buf) { const method = buf.readUInt16LE(8); let cs = buf.readUInt32LE(18); const nl = buf.readUInt16LE(26), xl = buf.readUInt16LE(28), st = 30 + nl + xl;
  if (cs === 0) { const cd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); cs = buf.readUInt32LE(cd + 20); } const d = buf.slice(st, st + cs); return method === 8 ? zlib.inflateRawSync(d) : d; }
async function day(sym, date) { const fn = `data/m1/${sym}-${date}.json`; if (fs.existsSync(fn)) return; let rows = [];
  for (let k = 0; k < 3; k++) { try { const r = await fetch(`https://data.binance.vision/data/futures/um/daily/markPriceKlines/${sym}/1m/${sym}-1m-${date}.zip`);
    if (r.status === 404) break; if (!r.ok) { await sleep(1000); continue; }
    const csv = unzipFirst(Buffer.from(await r.arrayBuffer())).toString(); for (const l of csv.split('\n')) { const p = l.split(','); if (p.length > 4 && !isNaN(+p[0])) rows.push([+p[0], +p[1], +p[2], +p[3], +p[4]]); } break; } catch (e) { await sleep(1000); } }
  if (!rows.length) { const t0 = Date.parse(date + 'T00:00:00Z'); for (let s = t0; s < t0 + 864e5; s += 1500 * 6e4) { try { const a = await (await fetch(`https://fapi.binance.com/fapi/v1/markPriceKlines?symbol=${sym}&interval=1m&startTime=${s}&limit=1500`)).json();
    if (Array.isArray(a)) rows.push(...a.filter(x => x[0] < t0 + 864e5).map(x => [x[0], +x[1], +x[2], +x[3], +x[4]])); } catch (e) {} await sleep(150); } }
  rows.sort((a, b) => a[0] - b[0]); fs.writeFileSync(fn, JSON.stringify(rows)); }
(async () => { const q = JSON.parse(fs.readFileSync('need.json')).map(x => x.split('|')); let n = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (q.length) { const [s, d] = q.shift(); await day(s, d); if (++n % 100 === 0) console.log(n); } })); })();
