// 1차 탐색: 학습(2020~2023)에서 고르고 검증(2024~2026)에서 확인. 기본 fresh=1, 스프레드 절반, 실거래 수수료
const { execFile } = require('child_process'), fs = require('fs');
const combos = [];
for (const es of [1.5, 2, 2.5]) for (const xo of [0, 0.25, 0.5]) for (const wh of [24, 72, 168]) for (const edge of [1, 3]) for (const uz of [null, 0])
  combos.push(`es=${es} xo=${xo} wh=${wh} edge=${edge}` + (uz == null ? '' : ` uz=${uz}`));
const jobs = []; for (const c of combos) { jobs.push([c, 'train', 'from=2020-01-01 to=2024-01-01']); jobs.push([c, 'test', 'from=2024-01-01 to=2026-10-15']); }
const out = 'data/grid1.jsonl'; fs.writeFileSync(out, '');
let i = 0; const PAR = 4, t0 = Date.now();
function next() { if (i >= jobs.length) return null; const [c, part, per] = jobs[i++];
  return new Promise(res => execFile('node', ['--max-old-space-size=6000', 'kimchi_bt.js', 'fresh=1', 'json=1', ...per.split(' '), ...c.split(' ')], { maxBuffer: 1 << 26 }, (e, so) => {
    const line = (so || '').split('\n').find(l => l.startsWith('JSON ')); fs.appendFileSync(out, JSON.stringify({ combo: c, part, ...(line ? JSON.parse(line.slice(5)) : { err: e && e.message }) }) + '\n');
    if (i % 20 === 0) console.log(`${i}/${jobs.length} · ${((Date.now() - t0) / 60000).toFixed(1)}분`); res(); })); }
(async () => { await Promise.all(Array.from({ length: PAR }, async () => { let p; while ((p = next())) await p; })); console.log('끝', ((Date.now() - t0) / 60000).toFixed(1) + '분'); })();
