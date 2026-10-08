// kimchi.db 의 «서버 밖» 사본 — 매일 한 번 (kimchi-backup.timer, 09:20 KST = 00:20 UTC, UTC 하루가 닫힌 직후).
// 김프 이력을 «UTC 하루 = 파일 하나» 로 대시보드 저장소에 쌓고, 거래·거래 대상 목록은 매번 통째로 덮어쓴다.
// 서버 안 스냅샷은 따로 있다 — /etc/cron.d/kimchi-bot-backup (매일 03:30, /var/backups/kimchi-bot, 14일 보관).
// 그쪽은 같은 디스크라 디스크 고장을 못 막는다. 이 스크립트가 그 빈자리를 메운다.
//
// 브랜치는 «달마다 하나» 다 — backup-kimchi-2026-10. 오래된 것을 지우기 위해서다.
// git 은 파일을 지워도 이력에 남아 저장소가 줄지 않는다. 브랜치를 통째로 지워야 실제로 비워진다.
// 그래서 RETAIN_MONTHS 보다 오래된 달의 브랜치를 매번 지운다. 저장소는 그 이상 커지지 않는다.
// 이번 달·지난달 브랜치는 매번 빠진 날을 채우므로, 며칠 빠져도 다음 실행이 따라잡는다.
//   node scripts/backup-history.js            실행
//   node scripts/backup-history.js --dry-run  무엇을 올리고 지울지만 찍는다
require('../src/env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DRY = process.argv.includes('--dry-run');
const DATA = path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_PATH || path.join(DATA, 'kimchi.db');
const PREFIX = 'backup-kimchi-';
const RETAIN_MONTHS = Number(process.env.BACKUP_RETAIN_MONTHS) || 36;   // 이보다 오래된 달은 GitHub 에서 지운다 (3년 ≈ 600MB)
const COLS = ['checkedAt', 'coin', 'korbitPrice', 'usdKrwRate', 'okxPrice', 'okxPremium', 'binancePrice', 'binancePremium', 'source'];
const today = new Date().toISOString().slice(0, 10);
const nextDay = d => new Date(Date.parse(d + 'T00:00:00Z') + 86400e3).toISOString().slice(0, 10);
const monthsAgo = n => { const d = new Date(today.slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };
const thisMonth = today.slice(0, 7), lastMonth = monthsAgo(1), cutoff = monthsAgo(RETAIN_MONTHS);   // cutoff 보다 앞선 달을 지운다

function offsite() {
  const repo = process.env.DASHBOARD_REPO_SSH, key = path.join(DATA, 'deploy_dashboard');
  if (!repo || !fs.existsSync(key)) throw new Error('저장소·배포 키 미설정');
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bak-'));
  try {
    const env = Object.assign({}, process.env, {
      GIT_SSH_COMMAND: `ssh -i ${key} -o IdentitiesOnly=yes -o UserKnownHostsFile=${path.join(DATA, 'known_hosts')} -o StrictHostKeyChecking=yes`,
      GIT_AUTHOR_NAME: 'bot', GIT_AUTHOR_EMAIL: 'bot@localhost', GIT_COMMITTER_NAME: 'bot', GIT_COMMITTER_EMAIL: 'bot@localhost', HOME: home,
    });
    const sh = (cwd, ...a) => execFileSync('git', a, { cwd, env, stdio: 'pipe', timeout: 180000 }).toString();
    const remote = new Set(sh(home, 'ls-remote', '--heads', repo).split('\n')
      .map(l => l.split('refs/heads/')[1]).filter(b => b && b.startsWith(PREFIX)).map(b => b.slice(PREFIX.length)));

    // n8n 에서 옮겨 온 행은 checkedAt 에 따옴표가 글자로 들어 있다 ("2026-09-28T…") — 벗겨서 다룬다
    const allDays = db.prepare(`SELECT DISTINCT substr(trim(checkedAt, '"'), 1, 10) d FROM premium_history ORDER BY d`).all()
      .map(r => r.d).filter(d => d < today && d.slice(0, 7) >= cutoff);
    const byMonth = {};
    for (const d of allDays) (byMonth[d.slice(0, 7)] = byMonth[d.slice(0, 7)] || []).push(d);
    byMonth[thisMonth] = byMonth[thisMonth] || [];   // 닫힌 날이 아직 없어도 거래 기록은 올린다
    const q = db.prepare(`SELECT ${COLS.map(c => c === 'checkedAt' ? `trim(checkedAt, '"') AS checkedAt` : c).join(', ')}
                          FROM premium_history WHERE (checkedAt >= ? AND checkedAt < ?) OR (checkedAt >= ? AND checkedAt < ?)
                          ORDER BY 1, coin`);
    const dump = t => JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all(), null, 1) + '\n';

    const out = { added: {}, rows: 0, pruned: [] };
    for (const month of Object.keys(byMonth).sort()) {
      // 이미 올라간 옛 달은 다시 열지 않는다. 이번 달·지난달만 매번 확인한다.
      if (remote.has(month) && month !== thisMonth && month !== lastMonth) continue;
      const branch = PREFIX + month, dir = path.join(home, month);
      if (remote.has(month)) sh(home, 'clone', '-q', '--depth', '1', '--branch', branch, repo, dir);
      else { fs.mkdirSync(dir); sh(dir, 'init', '-q'); sh(dir, 'checkout', '-q', '-b', branch); }
      const hist = path.join(dir, 'premium-history');
      fs.mkdirSync(hist, { recursive: true });
      const have = new Set(fs.readdirSync(hist).map(f => f.slice(0, 10)));
      const days = byMonth[month].filter(d => !have.has(d));
      let rowsN = 0;
      for (const d of days) {
        const n = nextDay(d);
        const rows = q.all(d, n, '"' + d, '"' + n);
        const csv = COLS.join(',') + '\n' + rows.map(r => COLS.map(c => r[c] == null ? '' : r[c]).join(',')).join('\n') + '\n';
        fs.writeFileSync(path.join(hist, `${d}.csv.gz`), zlib.gzipSync(csv, { level: 9 }));
        rowsN += rows.length;
      }
      if (month === thisMonth) {
        fs.writeFileSync(path.join(dir, 'trades.json'), dump('trades'));
        fs.writeFileSync(path.join(dir, 'universe.json'), dump('universe'));
      }
      fs.writeFileSync(path.join(dir, 'README.md'),
        `# kimchi.db 백업 — ${month} (카페24 봇이 매일 올린다)\n\n` +
        '- `premium-history/<UTC 날짜>.csv.gz` — 그날의 5분 김프 이력 전부. 닫힌 날만 올라온다.\n' +
        '- `trades.json` · `universe.json` — 거래 기록과 거래 대상 목록 전체. 가장 최근 달의 브랜치 것이 최신이다.\n\n' +
        `달마다 브랜치가 하나씩 생기고, ${RETAIN_MONTHS}개월이 지난 달의 브랜치는 자동으로 지워진다.\n` +
        '만드는 스크립트와 되살리는 방법은 main 브랜치 `report/README.md`.\n');
      sh(dir, 'add', '-A');
      if (!sh(dir, 'status', '--porcelain').trim()) continue;
      out.added[month] = days.length; out.rows += rowsN;
      if (DRY) continue;
      sh(dir, 'commit', '-q', '-m', days.length ? `김프 이력 백업 ${days[0]}${days.length > 1 ? ' ~ ' + days[days.length - 1] : ''} (${rowsN}행)` : `거래·거래 대상 갱신 ${today}`);
      sh(dir, 'push', '-q', repo, branch);
    }

    // 보관 기간이 지난 달의 브랜치를 지운다. 이름이 정확히 backup-kimchi-YYYY-MM 인 것만 건드린다.
    const old = [...remote].filter(m => /^\d{4}-\d\d$/.test(m) && m < cutoff).sort();
    if (old.length && !DRY) {
      // push --delete 는 저장소 안에서만 돈다 («not a git repository» — 2026-10-08 시험에서 실제로 났다)
      const pd = path.join(home, 'prune');
      fs.mkdirSync(pd); sh(pd, 'init', '-q');
      for (const month of old) sh(pd, 'push', '-q', repo, '--delete', PREFIX + month);
    }
    out.pruned = old;
    out.keepFrom = cutoff;
    if (DRY) out.dry = true;
    return out;
  } finally { fs.rmSync(home, { recursive: true, force: true }); db.close(); }
}

async function alert(text) {
  const url = process.env.DISCORD_STATUS_WEBHOOK;
  if (!url || process.env.SHADOW !== '0' || DRY) return;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1900) }) }).catch(() => {});
}

(async () => {
  try { console.log('서버 밖 사본', JSON.stringify(offsite())); }
  catch (e) {
    console.error('서버 밖 사본 실패', e && e.stack || e);
    // 백업은 조용히 실패하면 필요한 날에야 알게 된다 — 실패는 반드시 알린다
    await alert('⚠️ 김프 봇 DB 백업 실패\n' + String(e.stderr || e.message || e).slice(0, 400));
    process.exit(1);
  }
})();
