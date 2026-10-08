// 페이퍼 봇 일일 보고 — 매일 07:45 KST (run.js 가 부른다).
// 수동으로 한 번 보내기: node src/paper/report.js turtle | luna
//
// 잔액은 «일일 계산» 때 찍어 둔 스냅샷(paper_equity)을 쓴다. 전략마다 가장 최근 것과 그 직전 것을 견준다.
//   터틀·ma120 : 매일 00:02 KST 에 찍힌다 → 07:45 보고의 «오늘» 은 오늘 00:02 값
//   루나       : 매일 09:05 KST 에 찍힌다 → 07:45 보고의 «오늘» 은 어제 09:05 값 (그래서 날짜를 같이 적는다)
//
// 숫자는 전부 달러 기준이다 (2026-10-08). 터틀은 빗썸 원화로 사고팔지만 성과는 «달러 장부» 로 본다 —
// 현금은 달러로 들고 있다고 치고 코인만 그날 환율로 달러 평가한다 (turtle.js usdEquity). 원화는 괄호 안 참고값이다.
if (require.main === module) {
  const b = process.argv[2];
  if (!['turtle', 'luna'].includes(b)) { console.error('사용: node src/paper/report.js turtle|luna'); process.exit(1); }
  process.env.PAPER_BOT = b;
}
const L = require('./lib');

const md = day => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
const signed = v => (v >= 0 ? '+' : '-') + L.usd(Math.abs(v));

async function report() {
  const bot = L.BOT, krw = bot === 'turtle';
  const st = L.kv.get(bot) || {};
  const seed = krw ? st.seedUsd : null;
  const open = L.db.prepare("SELECT * FROM paper_trades WHERE status='OPEN'").all();
  const closed = L.db.prepare("SELECT COUNT(*) n, SUM(pnl > 0) w, SUM(pnl) s FROM paper_trades WHERE status='CLOSED'").get();
  const lines = [`${krw ? '🐢 [터틀 트레이딩]' : '🌙 [제2의 루나]'} 📋 일일 보고 ${L.kstDay()}`];
  const strategies = L.db.prepare('SELECT DISTINCT strategy FROM paper_equity ORDER BY strategy').all().map(r => r.strategy);
  // 터틀은 스냅샷의 달러 장부 값(detail.usd), 루나는 잔액 자체가 달러다
  const val = r => krw ? Number(JSON.parse(r.detail || '{}').usd) : r.equity;
  for (const name of strategies) {
    const [cur, prev] = L.db.prepare('SELECT day, equity, detail FROM paper_equity WHERE strategy = ? ORDER BY day DESC LIMIT 2').all(name);
    if (!cur) continue;
    const c = val(cur);
    lines.push(`**${name}**: ${L.usd(c)}${krw ? ` (${L.won(cur.equity)})` : ''}`);
    if (prev) {
      const p = val(prev), diff = c - p;
      lines.push(`　어제(${md(prev.day)}) ${L.usd(p)} → 오늘(${md(cur.day)}) ${L.usd(c)} · 차익 ${signed(diff)} (${L.pct(diff / p)})`);
    } else lines.push(`　오늘(${md(cur.day)})이 첫 기록이라 어제 잔액이 없습니다`);
    if (seed) lines.push(`　시작 ${L.usd(seed)} 대비 ${signed(c - seed)} (${L.pct(c / seed - 1)})`);
  }
  lines.push(`보유 ${open.length}건: ${open.map(t => `${t.book || ''} ${t.coin}`.trim()).join(', ') || '없음'}`);
  // 터틀의 건별 실현손익은 원화로 기록된다 — 달러 성과는 위 «시작 대비» 줄이 기준이다
  lines.push(`청산 ${closed.n || 0}건 · 승 ${closed.w || 0}${krw ? '' : ` · 누적 ${L.usd(closed.s || 0)}`}`);
  lines.push('대시보드: https://kimchi-premium-dashboard-mu.vercel.app');
  await L.notify(lines.join('\n'));
  return { reported: true };
}

module.exports = { report };
if (require.main === module) report().then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e); process.exit(1); });
