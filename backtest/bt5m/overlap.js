// 김프 거래(체결 있는 봉만) ↔ USDT 웃돈: 진입 순간의 USDT 웃돈 z, 보유 중 USDT 웃돈 변화가 김프 손익을 얼마나 설명하나
const fs = require('fs');
const R = JSON.parse(fs.readFileSync('data/res_fresh.json'));
const buf = fs.readFileSync('data/bithumb/USDT.bin'), hourly = new Map();
for (let i = 0; i < buf.length / 16; i++) { const m = buf.readInt32LE(i * 16); hourly.set(Math.floor(m / 60) * 60, buf.readDoubleLE(i * 16 + 4)); }
const fxh = new Map(JSON.parse(fs.readFileSync('data/fx.json')).hourly.map(([m, c]) => [Math.floor(m / 60) * 60, c]));
const hs = [...hourly.keys()].sort((a, b) => a - b); const P = new Map(); let lc = null, lf = null;
for (let t = hs[0]; t <= hs.at(-1); t += 60) { lc = hourly.get(t) ?? lc; lf = fxh.get(t) ?? lf; if (lc && lf) P.set(t, (lc / lf - 1) * 100); }
const ts = [...P.keys()], Z = new Map();
for (let i = 336; i < ts.length; i++) { const w = ts.slice(i - 335, i + 1).map(t => P.get(t)), m = w.reduce((a, b) => a + b, 0) / w.length, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length); Z.set(ts[i], (P.get(ts[i]) - m) / sd); }
const hr = m => Math.floor(m / 60) * 60 - 60;   // 직전에 마감한 시간봉
const T = R.trades.filter(t => Z.has(hr(t.in)) && P.has(hr(t.out)));
const bucket = { 'z<-2 (USDT 매수 신호 구간)': [], '-2~-1': [], '-1~0': [], '0 이상': [] };
for (const t of T) { const z = Z.get(hr(t.in)); (z < -2 ? bucket['z<-2 (USDT 매수 신호 구간)'] : z < -1 ? bucket['-2~-1'] : z < 0 ? bucket['-1~0'] : bucket['0 이상']).push(t); }
console.log(`2024~ 김프 거래 ${T.length}건 — 진입 순간 USDT 웃돈 z 분포와 거래당 수익`);
for (const [k, a] of Object.entries(bucket)) console.log(k.padEnd(24), String(a.length).padStart(5) + '건', (a.length / T.length * 100).toFixed(0).padStart(4) + '%', '거래당 ' + (a.reduce((x, t) => x + t.ret, 0) / (a.length || 1) * 100).toFixed(3) + '%', '승률 ' + (a.filter(t => t.pnl > 0).length / (a.length || 1) * 100).toFixed(0) + '%');
// 김프 변화 = USDT 웃돈 변화(시장 전체) + 나머지(코인 고유)
let sm = 0, sc = 0, sx = 0, sxy = 0, sxx = 0, n = 0;
for (const t of T) { const dk = t.xp - t.ep, du = P.get(hr(t.out)) - P.get(hr(t.in)); sm += du; sc += dk - du; n++; sx += du; sxy += du * dk; sxx += du * du; }
console.log(`보유 중 김프 변화 평균 ${((sm + sc) / n).toFixed(3)}%p = USDT 웃돈 몫 ${(sm / n).toFixed(3)}%p + 코인 고유 몫 ${(sc / n).toFixed(3)}%p`);
