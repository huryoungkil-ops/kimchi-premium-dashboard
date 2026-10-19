// 제안 2 검증: 2N 손절을 «5분마다 마크가격 확인 후 시장가» vs «거래소에 마크가격 STOP 주문을 미리 걸기» 로 비교.
// 일봉 백테스트의 손절 거래마다 그날(과 다음날) 마크가격 1분봉(Binance Vision)을 받아 두 방식의 체결가를 잰다.
//   STOP 주문: 마크 1분봉 고가가 손절선에 처음 닿는 분 → 체결 max(그 분 시가, 손절선)
//   5분 확인 : 진입 후 매 5분 정각의 마크(그 분 시가)가 손절선 이상인 첫 시점 → 체결 그 마크 (봇의 max(mark, stop))
// 같은 슬리피지를 양쪽에 붙이므로 차이는 «손절선을 얼마나 넘어서 잘렸나» 만 본다.
const fs = require('fs'), zlib = require('zlib');
const variant = process.argv[2] || '기준(현 규칙)';
const E = JSON.parse(fs.readFileSync('out_eval.json'))[variant];
const stops = E.trades.filter(t => /stop/.test(t.reason));
fs.mkdirSync('data/m1', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function unzipFirst(buf) { const method = buf.readUInt16LE(8); let cs = buf.readUInt32LE(18); const nl = buf.readUInt16LE(26), xl = buf.readUInt16LE(28), st = 30 + nl + xl;
  if (cs === 0) { const cd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); cs = buf.readUInt32LE(cd + 20); } const d = buf.slice(st, st + cs); return method === 8 ? zlib.inflateRawSync(d) : d; }
async function day(sym, date) {
  const fn = `data/m1/${sym}-${date}.json`; if (fs.existsSync(fn)) return JSON.parse(fs.readFileSync(fn));
  let rows = [];
  for (let k = 0; k < 3; k++) { try {
    const r = await fetch(`https://data.binance.vision/data/futures/um/daily/markPriceKlines/${sym}/1m/${sym}-1m-${date}.zip`);
    if (r.status === 404) break; if (!r.ok) { await sleep(1000); continue; }
    const csv = unzipFirst(Buffer.from(await r.arrayBuffer())).toString();
    for (const l of csv.split('\n')) { const p = l.split(','); if (p.length > 4 && !isNaN(+p[0])) rows.push([+p[0], +p[1], +p[2], +p[3], +p[4]]); } break; } catch (e) { await sleep(1000); } }
  if (!rows.length) { // 아직 Vision 에 없는 최근 날짜는 API
    const t0 = Date.parse(date + 'T00:00:00Z');
    for (let s = t0; s < t0 + 864e5; s += 1500 * 6e4) { try { const a = await (await fetch(`https://fapi.binance.com/fapi/v1/markPriceKlines?symbol=${sym}&interval=1m&startTime=${s}&limit=1500`)).json();
      if (Array.isArray(a)) rows.push(...a.filter(x => x[0] < t0 + 864e5).map(x => [x[0], +x[1], +x[2], +x[3], +x[4]])); } catch (e) {} await sleep(200); } }
  rows.sort((a, b) => a[0] - b[0]); fs.writeFileSync(fn, JSON.stringify(rows)); return rows;
}
(async () => {
  const res = [];
  let q = [...stops];
  await Promise.all(Array.from({ length: 6 }, async () => { while (q.length) { const t = q.shift();
    const d1 = t.exitDate, d2 = new Date(Date.parse(d1) + 864e5).toISOString().slice(0, 10);
    const M = [...await day(t.sym, d1), ...await day(t.sym, d2)];
    if (!M.length) { res.push({ ...t, miss: true }); continue; }
    const start = t.entryDate === d1 ? Date.parse(d1 + 'T00:06:00Z') : Date.parse(d1 + 'T00:00:00Z');
    const S = t.stopPx; let A = null, B = null;
    for (const [ts, o, h] of M) { if (ts < start) continue;
      if (A == null && h >= S) A = { ts, px: Math.max(o, S) };
      if (B == null && (ts / 6e4) % 5 === 0 && o >= S) B = { ts, px: o };
      if (A && B) break; }
    res.push({ sym: t.sym, date: d1, stop: S, notional: Math.abs(t.pnlPctOfEq / t.ret), A, B, ret20: t.ret20 }); } }));
  const ok = res.filter(r => r.A && r.B), onlyA = res.filter(r => r.A && !r.B), none = res.filter(r => !r.A), miss = res.filter(r => r.miss);
  const ov = r => (r.B.px / r.A.px - 1);
  const avgA = ok.reduce((s, r) => s + (r.A.px / r.stop - 1), 0) / ok.length, avgB = ok.reduce((s, r) => s + (r.B.px / r.stop - 1), 0) / ok.length;
  const sorted = ok.map(ov).sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
  const save = ok.reduce((s, r) => s + ov(r) * r.notional, 0);   // 장부 대비 합(%)
  const lag = ok.reduce((s, r) => s + (r.B.ts - r.A.ts) / 6e4, 0) / ok.length;
  console.log(`[${variant}] 손절 ${stops.length}건 · 1분 마크 자료 있음 ${res.length - miss.length} · 두 방식 모두 발동 ${ok.length} · STOP 주문만 발동(5분 확인은 그날 못 잡음) ${onlyA.length} · 마크가 손절선에 안 닿음(일봉 고가는 거래가) ${none.length - miss.length}`);
  console.log(`손절선 대비 체결: STOP 주문 평균 +${(avgA * 100).toFixed(2)}% · 5분 확인 평균 +${(avgB * 100).toFixed(2)}% · 차이 중앙값 ${(med * 100).toFixed(2)}% · 상위 10% ${(sorted[Math.floor(sorted.length * 0.9)] * 100).toFixed(2)}% · 최대 ${(sorted.at(-1) * 100).toFixed(1)}% · 평균 지연 ${lag.toFixed(1)}분`);
  console.log(`STOP 주문으로 아끼는 돈: 장부 대비 누적 ${(save * 100).toFixed(2)}%p (손절 1건당 ${(save / ok.length * 100).toFixed(3)}%p)`);
  const byY = {}; for (const r of ok) { const y = r.date.slice(0, 4); byY[y] = (byY[y] || 0) + ov(r) * r.notional; } console.log('연도별 아낌(장부 %p)', Object.entries(byY).map(([y, v]) => `${y} ${(v * 100).toFixed(2)}`).join(' · '));
  console.log('5분 확인이 가장 늦게 잡은 5건', ok.sort((a, b) => ov(b) - ov(a)).slice(0, 5).map(r => `${r.sym} ${r.date} +${(ov(r) * 100).toFixed(1)}%`).join(' · '));
  fs.writeFileSync(`out_stopsim.json`, JSON.stringify(res));
})();
