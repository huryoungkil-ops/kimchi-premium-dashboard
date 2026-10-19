// 장중 낙폭: 지금 규칙(STOP 주문 방식) 숏 장부를 1시간봉으로 다시 평가한다.
//   일봉 장부 eq[d] 에 «그날 장중 가격과 종가의 차이» 만큼 미실현 손익을 더해 시간별 장부를 만든다.
//   close: 매시 종가로 평가(실제로 화면에서 보게 될 값) · high: 들고 있는 숏 전부가 그 시간 고가에 동시에 있었다고 가정(가장 나쁜 쪽)
//   손절된 날은 1분 마크봉으로 찾은 손절 시각 전까지만 그 자리를 넣는다. 펀딩·수수료의 장중 배분은 무시(작다).
const fs = require('fs'), zlib = require('zlib'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = JSON.parse(fs.readFileSync('out_trades_order.json')); const { dates, eq } = J; const di = Object.fromEntries(dates.map((d, i) => [d, i]));
const END = dates.at(-1); fs.mkdirSync('data/h1', { recursive: true });
function unzipFirst(buf) { const method = buf.readUInt16LE(8); let cs = buf.readUInt32LE(18); const nl = buf.readUInt16LE(26), xl = buf.readUInt16LE(28), st = 30 + nl + xl;
  if (cs === 0) { const cd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); cs = buf.readUInt32LE(cd + 20); } const d = buf.slice(st, st + cs); return method === 8 ? zlib.inflateRawSync(d) : d; }
async function hourly(sym, from, to) {   // [[t,o,h,l,c]] from 00:00 of from to 24:00 of to
  const fn = `data/h1/${sym}_${from}_${to}.json`; if (fs.existsSync(fn)) return JSON.parse(fs.readFileSync(fn));
  const t0 = Date.parse(from + 'T00:00:00Z'), t1 = Date.parse(to + 'T00:00:00Z') + 864e5; let rows = [];
  for (let s = t0; s < t1; s += 1500 * 36e5) { try { const a = await (await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1h&startTime=${s}&endTime=${t1 - 1}&limit=1500`)).json();
    if (Array.isArray(a)) rows.push(...a.map(x => [x[0], +x[1], +x[2], +x[3], +x[4]])); } catch (e) {} await sleep(120); }
  if (!rows.length) { // 상장폐지 종목: Vision 월별 1시간봉
    for (let m = new Date(t0); m < new Date(t1); m.setUTCMonth(m.getUTCMonth() + 1, 1)) { const ym = m.toISOString().slice(0, 7);
      try { const r = await fetch(`https://data.binance.vision/data/futures/um/monthly/klines/${sym}/1h/${sym}-1h-${ym}.zip`); if (!r.ok) continue;
        for (const l of unzipFirst(Buffer.from(await r.arrayBuffer())).toString().split('\n')) { const p = l.split(','); if (p.length > 4 && !isNaN(+p[0]) && +p[0] >= t0 && +p[0] < t1) rows.push([+p[0], +p[1], +p[2], +p[3], +p[4]]); } } catch (e) {} } }
  rows.sort((a, b) => a[0] - b[0]); fs.writeFileSync(fn, JSON.stringify(rows)); return rows;
}
function stopTime(t) { const fn = `data/m1/${t.sym}-${t.exitDate}.json`; if (!fs.existsSync(fn)) return null;
  const start = t.entryDate === t.exitDate ? Date.parse(t.exitDate + 'T00:06:00Z') : 0;
  for (const [ts, o, h] of JSON.parse(fs.readFileSync(fn))) if (ts >= start && h >= t.stopPx) return ts; return null; }
(async () => {
  const P = [...J.trades.map(t => ({ ...t, open: false })), ...J.open.map(o => ({ sym: o.sym, entryDate: o.entryDate, exitDate: END, reason: 'open', avg: o.avg, qty: o.qty, open: true }))];
  let q = [...P], n = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (q.length) { const t = q.shift(); t.H = await hourly(t.sym, t.entryDate, t.exitDate); if (++n % 40 === 0) console.log(`1시간봉 ${n}/${P.length}`); } }));
  const miss = P.filter(t => !t.H.length).length;
  // 시간별 조정치: adj[hourTs] = {c, h}
  const adjC = new Map(), adjH = new Map(); const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  for (const t of P) { if (!t.H.length) continue;
    const byDay = {}; for (const b of t.H) (byDay[new Date(b[0]).toISOString().slice(0, 10)] ||= []).push(b);
    const stopTs = /stop/.test(t.reason) ? stopTime(t) : null;
    for (const [d, bars] of Object.entries(byDay)) {
      if (!(d in di) || d < t.entryDate || d > t.exitDate) continue;
      const exitDay = d === t.exitDate && !t.open;
      if (exitDay && !/stop/.test(t.reason)) {   // 신호·기간 청산은 그날 00:00 시가에 끝났다 — 단 상장폐지·공백 청산은 그날 종가
        if (!/delist/.test(t.reason)) continue; }
      const ref = exitDay ? (/stop/.test(t.reason) ? t.exitPx : bars.at(-1)[4]) : bars.at(-1)[4];   // eq[d] 안에 들어 있는 이 자리의 기준 가격
      for (const b of bars) {
        if (exitDay && /stop/.test(t.reason)) { const cut = stopTs ?? Date.parse(d + 'T00:00:00Z') + 864e5; if (b[0] + 36e5 > cut) { if (b[0] < cut) { add(adjH, b[0], t.qty * (ref - Math.max(b[2], 0))); add(adjC, b[0], 0); } continue; } }
        add(adjC, b[0], t.qty * (ref - b[4])); add(adjH, b[0], t.qty * (ref - b[2]));
      } } }
  // 시간별 장부
  const pathC = [], pathH = [];
  for (let i = 0; i < dates.length; i++) { if (!(eq[i] > 0)) continue; const t0 = Date.parse(dates[i] + 'T00:00:00Z');
    for (let h = 0; h < 24; h++) { const ts = t0 + h * 36e5; pathC.push([ts, eq[i] + (adjC.get(ts) || 0)]); pathH.push([ts, eq[i] + (adjH.get(ts) || 0)]); } }
  const daily = dates.map((d, i) => [Date.parse(d + 'T23:00:00Z'), eq[i]]).filter(x => x[1] > 0);
  function mdd(path, from = '2019', to = '9999') { let pk = -Infinity, m = 0, at = null, pkAt = null, cur = null;
    for (const [ts, v] of path) { const d = new Date(ts).toISOString(); if (d < from || d > to) continue; if (v > pk) { pk = v; cur = ts; } const dd = v / pk - 1; if (dd < m) { m = dd; at = ts; pkAt = cur; } }
    return { m, at: at && new Date(at).toISOString().slice(0, 13).replace('T', ' ') + '시', pk: pkAt && new Date(pkAt).toISOString().slice(0, 10) }; }
  const pc = x => (x * 100).toFixed(1) + '%';
  console.log(`자리 ${P.length}개 (1시간봉 없음 ${miss})`);
  for (const [lab, f, t] of [['전체 2019~2026', '2019', '9999'], ['2022~', '2022', '9999'], ['2025~', '2025', '9999']]) {
    const a = mdd(daily, f, t), b = mdd(pathC, f, t), c = mdd(pathH, f, t);
    console.log(`${lab.padEnd(14)} 일봉 종가 ${pc(a.m)} (${a.at}) · 1시간 종가 ${pc(b.m)} (${b.at}, 고점 ${b.pk}) · 1시간 고가 동시 가정 ${pc(c.m)} (${c.at})`); }
  console.log('연도별 최대낙폭 (일봉 종가 / 1시간 종가 / 1시간 고가)');
  for (let y = 2020; y <= 2026; y++) { const f = `${y}`, t = `${y}-12-31T99`; const a = mdd(daily, f, t), b = mdd(pathC, f, t), c = mdd(pathH, f, t); console.log(`  ${y}  ${pc(a.m)} / ${pc(b.m)} / ${pc(c.m)}`); }
  // 하루 안에서 가장 크게 출렁인 날 (장중 최저 vs 전날 종가)
  const worstDays = []; for (let i = 1; i < dates.length; i++) { if (!(eq[i - 1] > 0)) continue; const t0 = Date.parse(dates[i] + 'T00:00:00Z'); let lo = Infinity;
    for (let h = 0; h < 24; h++) lo = Math.min(lo, eq[i] + (adjC.get(t0 + h * 36e5) || 0)); worstDays.push([dates[i], lo / eq[i - 1] - 1, eq[i] / eq[i - 1] - 1]); }
  worstDays.sort((a, b) => a[1] - b[1]); console.log('장중 가장 많이 빠졌던 날 (전날 종가 대비 장중 최저 → 그날 종가)', worstDays.slice(0, 5).map(w => `${w[0]} ${pc(w[1])} → ${pc(w[2])}`).join(' · '));
})();
