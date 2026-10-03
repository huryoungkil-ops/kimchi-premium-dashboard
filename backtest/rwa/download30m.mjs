// 30m klines for tokenized stocks / stock perps so that bar closes align with Yahoo 1h bars (which close at :30 UTC)
import fs from 'fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = async u => { for (let i = 0; i < 5; i++) { try { const r = await fetch(u); if (r.status === 429) { await sleep(3000); continue; } return await r.json(); } catch (e) { await sleep(1500); } } throw new Error(u); };
const M = 1800e3, NOW = Date.now();
// store with key = CLOSE time (open + 30m)
const save = (n, a) => { const m = new Map(); a.forEach(r => m.set(r[0], r)); const s = [...m.values()].sort((x, y) => x[0] - y[0]); fs.writeFileSync(`data/${n}.json`, JSON.stringify(s)); console.log(n, s.length, new Date(s[0][0]).toISOString(), new Date(s.at(-1)[0]).toISOString()); };
async function bybit(n, sym) { let out = [], end = NOW; while (true) { const d = await j(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=30&end=${end}&limit=1000`); const l = d.result?.list || []; if (!l.length) break; out.push(...l.map(k => [+k[0] + M, +k[4], +k[6]])); end = +l.at(-1)[0] - M; if (l.length < 1000) break; await sleep(120); } save(n, out); }
async function binance(n, sym) { let out = [], st = 0; while (true) { const d = await j(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=30m&startTime=${st}&limit=1500`); if (!Array.isArray(d) || !d.length) break; out.push(...d.map(k => [k[0] + M, +k[4], +k[7]])); st = d.at(-1)[0] + M; if (d.length < 1500) break; } save(n, out); }
for (const s of ['TSLA', 'NVDA', 'AAPL']) await bybit(`by30_${s}X`, `${s}XUSDT`);
for (const s of ['TSLA', 'NVDA', 'SPY']) await binance(`bn30_perp_${s}`, `${s}USDT`);
