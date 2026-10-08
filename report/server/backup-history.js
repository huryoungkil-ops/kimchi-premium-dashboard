// kimchi.db 의 «서버 밖» 사본 — 매일 한 번 (kimchi-backup.timer, 09:20 KST = 00:20 UTC, UTC 하루가 닫힌 직후).
// 김프 이력을 «UTC 하루 = 파일 하나» 로 대시보드 저장소 backup-kimchi 브랜치에 쌓고,
// 거래·거래 대상 목록은 매번 통째로 덮어쓴다. 디스크가 깨져도 이력과 거래 기록이 남는다.
// 서버 안 스냅샷은 따로 있다 — /etc/cron.d/kimchi-bot-backup (매일 03:30, /var/backups/kimchi-bot, 14일 보관).
// 그쪽은 같은 디스크라 디스크 고장을 못 막는다. 이 스크립트가 그 빈자리를 메운다.
// 브랜치에 없는 날짜를 전부 채우므로, 며칠 빠져도 다음 실행이 따라잡는다.
//   node scripts/backup-history.js            실행
//   node scripts/backup-history.js --dry-run  무엇을 올릴지만 찍는다
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
const BRANCH = 'backup-kimchi';
const COLS = ['checkedAt', 'coin', 'korbitPrice', 'usdKrwRate', 'okxPrice', 'okxPremium', 'binancePrice', 'binancePremium', 'source'];
const today = new Date().toISOString().slice(0, 10);
const nextDay = d => new Date(Date.parse(d + 'T00:00:00Z') + 86400e3).toISOString().slice(0, 10);

function offsite() {
  const repo = process.env.DASHBOARD_REPO_SSH, key = path.join(DATA, 'deploy_dashboard');
  if (!repo || !fs.existsSync(key)) throw new Error('저장소·배포 키 미설정');
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bak-'));
  try {
    const env = Object.assign({}, process.env, {
      GIT_SSH_COMMAND: `ssh -i ${key} -o IdentitiesOnly=yes -o UserKnownHostsFile=${path.join(DATA, 'known_hosts')} -o StrictHostKeyChecking=yes`,
      GIT_AUTHOR_NAME: 'bot', GIT_AUTHOR_EMAIL: 'bot@localhost', GIT_COMMITTER_NAME: 'bot', GIT_COMMITTER_EMAIL: 'bot@localhost', HOME: dir,
    });
    const git = (...a) => execFileSync('git', a, { cwd: dir, env, stdio: 'pipe', timeout: 180000 }).toString();
    const exists = execFileSync('git', ['ls-remote', '--heads', repo, BRANCH], { env, stdio: 'pipe', timeout: 60000 }).toString().trim();
    if (exists) execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', BRANCH, repo, dir], { env, stdio: 'pipe', timeout: 180000 });
    else { git('init', '-q'); git('checkout', '-q', '-b', BRANCH); }

    const hist = path.join(dir, 'premium-history');
    fs.mkdirSync(hist, { recursive: true });
    const have = new Set(fs.readdirSync(hist).map(f => f.slice(0, 10)));
    // n8n 에서 옮겨 온 행은 checkedAt 에 따옴표가 글자로 들어 있다 ("2026-09-28T…") — 벗겨서 다룬다
    const days = db.prepare(`SELECT DISTINCT substr(trim(checkedAt, '"'), 1, 10) d FROM premium_history ORDER BY d`).all()
      .map(r => r.d).filter(d => d < today && !have.has(d));
    const q = db.prepare(`SELECT ${COLS.map(c => c === 'checkedAt' ? `trim(checkedAt, '"') AS checkedAt` : c).join(', ')}
                          FROM premium_history WHERE (checkedAt >= ? AND checkedAt < ?) OR (checkedAt >= ? AND checkedAt < ?)
                          ORDER BY 1, coin`);
    let rowsTotal = 0;
    for (const d of days) {
      const n = nextDay(d);
      const rows = q.all(d, n, '"' + d, '"' + n);
      const csv = COLS.join(',') + '\n' + rows.map(r => COLS.map(c => r[c] == null ? '' : r[c]).join(',')).join('\n') + '\n';
      fs.writeFileSync(path.join(hist, `${d}.csv.gz`), zlib.gzipSync(csv, { level: 9 }));
      rowsTotal += rows.length;
    }
    const dump = t => JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all(), null, 1) + '\n';
    fs.writeFileSync(path.join(dir, 'trades.json'), dump('trades'));
    fs.writeFileSync(path.join(dir, 'universe.json'), dump('universe'));
    fs.writeFileSync(path.join(dir, 'README.md'),
      '# kimchi.db 백업 (카페24 봇이 매일 올린다)\n\n' +
      '- `premium-history/<UTC 날짜>.csv.gz` — 그날의 5분 김프 이력 전부. 닫힌 날만 올라온다.\n' +
      '- `trades.json` · `universe.json` — 거래 기록과 거래 대상 목록. 매번 통째로 덮어쓴다.\n\n' +
      '만드는 스크립트와 되살리는 방법은 main 브랜치 `report/README.md`.\n');
    git('add', '-A');
    if (!git('status', '--porcelain').trim()) return { days: [], rows: 0, pushed: false };
    if (DRY) return { days, rows: rowsTotal, pushed: false, dry: true };
    git('commit', '-q', '-m', days.length ? `김프 이력 백업 ${days[0]}${days.length > 1 ? ' ~ ' + days[days.length - 1] : ''} (${rowsTotal}행)` : `거래·거래 대상 갱신 ${today}`);
    git('push', '-q', repo, BRANCH);
    return { days: days.length, from: days[0], to: days[days.length - 1], rows: rowsTotal, pushed: true };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); db.close(); }
}

async function alert(text) {
  const url = process.env.DISCORD_STATUS_WEBHOOK;
  if (!url || process.env.SHADOW !== '0' || DRY) return;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1900) }) }).catch(() => {});
}

(async () => {
  const fails = [];
  for (const [name, fn] of [['서버 밖 사본', offsite]]) {
    try { console.log(name, JSON.stringify(fn())); }
    catch (e) { fails.push(`${name}: ${String(e.stderr || e.message || e).slice(0, 400)}`); console.error(name, '실패', e && e.stack || e); }
  }
  if (fails.length) {
    // 백업은 조용히 실패하면 필요한 날에야 알게 된다 — 실패는 반드시 알린다
    await alert('⚠️ 김프 봇 DB 백업 실패\n' + fails.join('\n'));
    process.exit(1);
  }
})();
