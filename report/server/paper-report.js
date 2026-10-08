// 페이퍼 봇 일일 보고 — 매일 07:45 KST (run.js 가 부른다).
// 수동으로 한 번 보내기: node src/paper/report.js turtle | luna
//
// 잔액은 «일일 계산» 때 찍어 둔 스냅샷(paper_equity)을 쓴다. 전략마다 가장 최근 것과 그 직전 것을 견준다.
//   터틀·ma120 : 매일 00:02 KST 에 찍힌다 → 07:45 보고의 «오늘» 은 오늘 00:02 값
//   루나       : 매일 09:05 KST 에 찍힌다 → 07:45 보고의 «오늘» 은 어제 09:05 값 (그래서 날짜를 같이 적는다)
if (require.main === module) {
  const b = process.argv[2];
  if (!['turtle', 'luna'].includes(b)) { console.error('사용: node src/paper/report.js turtle|luna'); process.exit(1); }
  process.env.PAPER_BOT = b;
}
const L = require('./lib');

const md = day => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
const signed = (v, fmt) => (v >= 0 ? '+' : '-') + fmt(Math.abs(v));

async function report() {
  const bot = L.BOT, krw = bot === 'turtle';
  const fmt = krw ? L.won : L.usd;
  const open = L.db.prepare("SELECT * FROM paper_trades WHERE status='OPEN'").all();
  const closed = L.db.prepare("SELECT COUNT(*) n, SUM(pnl > 0) w, SUM(pnl) s FROM paper_trades WHERE status='CLOSED'").get();
  const lines = [`${krw ? '🐢 [터틀 트레이딩]' : '🌙 [제2의 루나]'} 📋 일일 보고 ${L.kstDay()}`];
  const strategies = L.db.prepare('SELECT DISTINCT strategy FROM paper_equity ORDER BY strategy').all().map(r => r.strategy);
  for (const st of strategies) {
    const [cur, prev] = L.db.prepare('SELECT day, equity, detail FROM paper_equity WHERE strategy = ? ORDER BY day DESC LIMIT 2').all(st);
    if (!cur) continue;
    const d = JSON.parse(cur.detail || '{}');
    lines.push(`**${st}**: ${fmt(cur.equity)}${krw ? ` (${L.usd(d.usd || 0)})` : ''}`);
    if (prev) {
      const diff = cur.equity - prev.equity;
      lines.push(`　어제(${md(prev.day)}) ${fmt(prev.equity)} → 오늘(${md(cur.day)}) ${fmt(cur.equity)} · 차익 ${signed(diff, fmt)} (${L.pct(diff / prev.equity)})`);
    } else lines.push(`　오늘(${md(cur.day)})이 첫 기록이라 어제 잔액이 없습니다`);
  }
  lines.push(`보유 ${open.length}건: ${open.map(t => `${t.book || ''} ${t.coin}`.trim()).join(', ') || '없음'}`);
  lines.push(`청산 ${closed.n || 0}건 · 승 ${closed.w || 0} · 누적 ${fmt(closed.s || 0)}`);
  lines.push('대시보드: https://kimchi-premium-dashboard-mu.vercel.app');
  await L.notify(lines.join('\n'));
  return { reported: true };
}

module.exports = { report };
if (require.main === module) report().then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e); process.exit(1); });
