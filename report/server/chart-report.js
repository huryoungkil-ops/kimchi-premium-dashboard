// 아침 상태 보고에 붙이는 차트 — 보유 종목 전부 + 진입선에 가장 가까운 후보 3종목의 최근 72시간.
// 봇 프로세스와 따로 돈다 (kimchi-chart.timer, 매일 07:42 KST — 07:40 상태 보고 바로 뒤). DB 는 읽기만 한다.
//   node scripts/chart-report.js            Discord 상태 채널로 보낸다
//   node scripts/chart-report.js --dry-run  차트 주소만 찍고 보내지 않는다
// 그림은 한스법칙 알림과 같은 QuickChart 로 그린다 (설치할 것이 없고 모양이 같다).
// 선은 signal_log 에 봇이 회차마다 적어 둔 평균·σ 를 그대로 쓴다 — 다시 계산하지 않는다.
require('../src/env');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { C } = require('../src/strategy');

const DRY = process.argv.includes('--dry-run');
const SHADOW = process.env.SHADOW !== '0';
const FOREIGN = process.env.FOREIGN || 'okx';
const MODE = process.env.MODE || 'paper';
const HOURS = 72, TOP_N = 3;
const STEP = Number(process.env.CHART_STEP) || 4;   // 5분 x 4 = 20분 간격 (216점). 3(288점)은 한도에 걸린다
const GUIDE_SIGMAS = [2.5, 3.0];           // 참고 눈금 — 봇 동작과는 무관
const QUICKCHART = 'https://quickchart.io/chart/create';
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'kimchi.db'), { readOnly: true });

const r3 = v => (v == null ? null : Math.round(v * 1000) / 1000);
const sign = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);
const kstLabel = iso => {
  const k = new Date(Date.parse(iso) + 9 * 3600e3).toISOString();
  return `${k.slice(5, 7)}/${k.slice(8, 10)} ${k.slice(11, 16)}`;
};

// ── 누구를 그릴지 ──
const last = db.prepare('SELECT MAX(checkedAt) m FROM signal_log WHERE foreign_ex = ?').get(FOREIGN).m;
if (!last) { console.log('signal_log 가 비어 있다'); process.exit(0); }
const since = new Date(Date.parse(last) - HOURS * 3600e3).toISOString();
const held = db.prepare(`SELECT * FROM trades WHERE mode = ? AND status = 'OPEN' ORDER BY id`).all(MODE);
const heldCoins = new Set(held.map(t => t.coin));
const uni = new Map(db.prepare('SELECT coin, tradable, spreadMedian FROM universe').all().map(u => [u.coin, u]));

// Top 3 — 거래 대상이고, 봇이 실제로 들어갈 수 있는 상태인 종목 중 진입선까지 남은 거리(σ)가 짧은 순.
// «들어갈 수 있는 상태»: σ 가 한도 안, 72시간 이력이 80% 이상, 그리고 진입선에 닿았을 때의
// 기대이익(2σ)이 본전 문턱(수수료+평소 스프레드)의 EDGE_MULTIPLE 배를 넘는다.
// 마지막 조건이 없으면 5분마다 크게 튀기만 하는 종목이 늘 상위에 올라온다.
const now = db.prepare('SELECT * FROM signal_log WHERE checkedAt = ? AND foreign_ex = ?').all(last, FOREIGN);
const scored = now
  .filter(s => uni.get(s.coin) && uni.get(s.coin).tradable && !heldCoins.has(s.coin))
  .filter(s => s.sigma > 0 && s.sigma <= C.MAX_SIGMA_PERCENT && s.dataPoints >= C.HISTORY_POINTS * C.MIN_HISTORY_COVERAGE)
  .map(s => {
    const spread = uni.get(s.coin).spreadMedian || 0;
    return Object.assign({}, s, {
      gap: (s.premium - (s.ma - C.ENTRY_SIGMA * s.sigma)) / s.sigma,
      edgeOk: C.ENTRY_SIGMA * s.sigma >= (C.FEE_ROUND_TRIP_PCT + spread) * C.EDGE_MULTIPLE,
    });
  })
  .sort((a, b) => (b.edgeOk - a.edgeOk) || (a.gap - b.gap));
const top = scored.slice(0, TOP_N);

const panels = held.map(t => ({ coin: t.coin, tag: '보유 중', trade: t }))
  .concat(top.map((s, i) => ({ coin: s.coin, tag: `후보 ${i + 1}`, cand: s })));

// ── 왜 사지 않았나 — 봇이 회차마다 runs.note 에 적어 둔 보류 사유를 종목별로 센다 ──
// 형식: «FIL 진입 보류: 스프레드 1.09% > 1% | ADA 진입 보류: 기대수익 0.87%p < 문턱 3.07%p»
const REASON_KIND = [
  [/^스프레드/, '호가 스프레드 1% 초과'],
  [/^기대수익/, `기대수익이 문턱(스프레드+수수료의 ${C.EDGE_MULTIPLE}배) 미달`],
  [/^실매수 기준/, '실제 살 수 있는 값으로는 진입선 위'],
  [/^크기/, '살 수 있는 물량이 너무 적음'],
];
const holds = {};
for (const r of db.prepare(`SELECT startedAt, note FROM runs WHERE startedAt > ? AND note LIKE '%진입 보류%' ORDER BY startedAt`).all(since)) {
  for (const part of r.note.split(' | ')) {
    const m = part.match(/^(\S+) 진입 보류: (.+)$/);
    if (!m) continue;
    const kind = (REASON_KIND.find(([re]) => re.test(m[2])) || [null, m[2]])[1];
    const h = holds[m[1]] = holds[m[1]] || { n: 0, kinds: {}, last: null };
    h.n++; h.kinds[kind] = (h.kinds[kind] || 0) + 1; h.last = { at: r.startedAt, text: m[2] };
  }
}
function whyNot(coin, gapSig) {
  const sigN = db.prepare(`SELECT COUNT(*) n FROM signal_log WHERE coin = ? AND foreign_ex = ? AND checkedAt > ? AND signal = 'ENTRY'`).get(coin, FOREIGN, since).n;
  const h = holds[coin];
  if (!sigN && !h) return '🔎 최근 3일 진입 신호 없음 — 아직 진입선에 닿은 적이 없습니다';
  const L = [`🔎 최근 3일 진입 신호 ${sigN}회${h ? ` · 호가 확인 뒤 보류 ${h.n}회` : ''}`];
  if (h) {
    L.push('보류 사유: ' + Object.entries(h.kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}회`).join(' · '));
    L.push(`마지막 보류 ${kstLabel(h.last.at)} — ${h.last.text}`);
  } else L.push('보류 기록 없음 — 신호가 떴을 때 자리가 없었거나 다른 종목이 먼저 검토됐습니다');
  if (gapSig > 0) L.push('지금은 진입선 위라 신호가 없습니다');
  return L.join('\n');
}

// ── 차트 한 장 ──
function build(p) {
  const all = db.prepare(`SELECT checkedAt, premium, ma, sigma FROM signal_log
                          WHERE coin = ? AND foreign_ex = ? AND checkedAt > ? ORDER BY checkedAt`).all(p.coin, FOREIGN, since);
  if (all.length < 12) return null;
  // QuickChart 무료 한도가 차트당 점 개수를 막는다 (864점·288점은 «Maximum chart data exceeded», 216점은 통과 — 2026-10-08 실측).
  // STEP 개마다 하나만 남기되 끝에서부터 세어 «방금 값»은 반드시 남긴다.
  const rows = all.filter((_, i) => (all.length - 1 - i) % STEP === 0);
  const line = f => rows.map(r => r3(f(r)));
  const ds = (label, data, color, width, dash) => Object.assign(
    { label, data, borderColor: color, backgroundColor: color, borderWidth: width, pointRadius: 0, fill: false },
    dash ? { borderDash: dash } : {});
  const datasets = [
    ds('김프', line(r => r.premium), '#2c3e50', 1.5),
    ds(`-${C.ENTRY_SIGMA}σ 진입선`, line(r => r.ma - C.ENTRY_SIGMA * r.sigma), '#e74c3c', 4),
    ...GUIDE_SIGMAS.map((g, i) => ds(`-${g}σ`, line(r => r.ma - g * r.sigma), i ? '#b9770e' : '#f39c12', 1, [6, 4])),
    ds('3일 평균', line(r => r.ma), '#2980b9', 1.5),
    ds(`청산선 (+${C.EXIT_SIGMA_OFFSET}σ)`, line(r => r.ma + C.EXIT_SIGMA_OFFSET * r.sigma), '#27ae60', 1.5),
  ];
  const cur = rows[rows.length - 1];
  const lower = cur.ma - C.ENTRY_SIGMA * cur.sigma, upper = cur.ma + C.EXIT_SIGMA_OFFSET * cur.sigma;
  let desc;
  if (p.trade) {
    const t = p.trade;
    const at = rows.findIndex(r => r.checkedAt >= t.entryTime);
    if (at >= 0) {
      const pts = rows.map(() => null); pts[at] = r3(t.entryPremium);
      datasets.push({ label: '진입', data: pts, borderColor: '#c0392b', backgroundColor: '#c0392b', showLine: false,
                      pointRadius: 7, pointStyle: 'triangle', pointRotation: 180, fill: false });
    }
    desc = `진입 ${sign(t.entryPremium)}% → 현재 ${sign(cur.premium)}% · 청산선까지 ${sign(upper - cur.premium)}%p`;
  } else {
    const gapPp = cur.premium - lower, gapSig = gapPp / cur.sigma;
    const prox = Math.max(0, Math.min(1, (cur.ma - cur.premium) / (C.ENTRY_SIGMA * cur.sigma)));
    desc = gapSig <= 0
      ? `현재 ${sign(cur.premium)}% · 진입선 아래 ${Math.abs(gapSig).toFixed(2)}σ (${Math.abs(gapPp).toFixed(2)}%p)`
      : `현재 ${sign(cur.premium)}% · 진입선까지 ${gapSig.toFixed(2)}σ (${gapPp.toFixed(2)}%p) · 근접도 ${(prox * 100).toFixed(0)}%`;
    if (!p.cand.edgeOk) desc += ' · ⚠️ 순이익 조건 미달 (스프레드 대비 σ 가 작다)';
    desc += '\n' + whyNot(p.coin, gapSig);
  }
  const chart = {
    type: 'line',
    data: { labels: rows.map(r => kstLabel(r.checkedAt)), datasets },
    options: {
      title: { display: true, text: `${p.coin} 김프 (최근 3일) — ${p.tag}`, fontSize: 16 },
      legend: { display: true, position: 'bottom' },
      elements: { line: { tension: 0 } },
      scales: { yAxes: [{ ticks: { beginAtZero: false }, scaleLabel: { display: true, labelString: '김프 (%)' } }], xAxes: [{ ticks: { maxTicksLimit: 8, maxRotation: 45 } }] },
    },
  };
  return { desc, body: { chart, width: 700, height: 380, backgroundColor: 'white', devicePixelRatio: 2, format: 'png' } };
}

async function main() {
  const embeds = [];
  for (const p of panels) {
    const b = build(p);
    if (!b) { console.log(p.coin, '이력 부족 — 건너뜀'); continue; }
    const r = await fetch(QUICKCHART, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b.body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { console.error(p.coin, '차트 생성 실패', r.status, JSON.stringify(j).slice(0, 200)); continue; }
    // 한도에 걸리면 주소는 그대로 주고 그림 자리에 오류 문구를 그려 준다 — 크기로 가려낸다
    const png = Buffer.from(await (await fetch(j.url)).arrayBuffer());
    if (png.length < 24 || png.readUInt32BE(20) !== b.body.height * b.body.devicePixelRatio) {
      console.error(p.coin, '차트가 그려지지 않았다 (QuickChart 오류 이미지)', j.url); process.exitCode = 1; continue;
    }
    console.log(p.coin, p.tag, '|', b.desc, '|', j.url);
    embeds.push({ title: `${p.coin} — ${p.tag}`, description: b.desc, image: { url: j.url },
                  color: p.trade ? 0xe74c3c : 0xf39c12 });
  }
  if (!embeds.length) return;
  const content = `📈 김프 3일 추이와 진입선 (${kstLabel(last)} KST 기준) — 보유 ${held.length}종목 · 진입 후보 ${top.length}종목\n` +
    `굵은 빨간 선이 봇의 진입선(−${C.ENTRY_SIGMA}σ), 주황 점선은 깊이를 보는 눈금입니다.`;
  const url = process.env.DISCORD_STATUS_WEBHOOK;
  if (DRY || SHADOW || !url) { console.log(DRY ? '--dry-run — 보내지 않음' : '섀도 또는 웹훅 없음 — 보내지 않음'); return; }
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, embeds }) });
  if (!r.ok) { console.error('Discord', r.status, await r.text()); process.exitCode = 1; }
}
main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
