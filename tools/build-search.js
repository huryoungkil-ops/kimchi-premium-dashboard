// 검색 색인 만들기 (2026-11-03): node tools/build-search.js <사이트 폴더> [제외 폴더,...]
//   사이트의 */index.html 에서 제목·설명·소제목(id 있는 h2/h3)·claude.ai 보고서 링크를 모아 <사이트>/lib/search-pages.json 으로 쓴다.
//   lib/lab-search.js(공용 검색창)가 이 파일을 읽는다. 페이지를 바꾸면 다시 돌린다.
const fs = require('fs'), path = require('path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const skip = new Set(['node_modules', '.git', 'lib', 'data', 'tools', 'research_notes', 'backtest', 'backup', 'reports', 'report'].concat((process.argv[3] || '').split(',').filter(Boolean)));
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const pages = [];
(function walk(dir, depth){
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) { if (!skip.has(f.name) && depth < 2) walk(path.join(dir, f.name), depth + 1); }
    else if (f.name === 'index.html') pages.push(path.join(dir, f.name));
  }
})(root, 0);
const out = [], seen = new Set();
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, path.dirname(file)).split(path.sep).join('/');
  const url = rel ? '/' + rel + '/' : '/';
  const title = strip((html.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1]).replace(/\s*·\s*허박사의.*$/, '') || url;
  const desc = strip((html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [, ''])[1]);
  const heads = [];
  html.replace(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (m, lv, attrs, inner) => {
    const id = (attrs.match(/\bid="([^"]+)"/) || [, ''])[1], t = strip(inner);
    if (t) heads.push({ id, t });
    return m;
  });
  out.push({ g: '📄 페이지', t: title, d: desc.slice(0, 120), u: url, k: (heads.map(h => h.t).join(' ') + ' ' + strip(html.replace(/<(script|style|nav|footer)\b[\s\S]*?<\/\1>/gi, ' ').replace(/^[\s\S]*?<\/header>/i, ''))).slice(0, 4000) });
  for (const h of heads) if (h.id && h.t.length > 1) out.push({ g: '🔖 페이지 안 소제목', t: h.t, d: title, u: url + '#' + h.id });
  html.replace(/<a\s[^>]*href="(https:\/\/claude\.ai\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
    const t = strip(inner);
    if (t && !seen.has(href)) { seen.add(href); out.push({ g: '📑 리서치 보고서', t, d: title + '에서 연결', u: href }); }
    return m;
  });
}
const dst = path.join(root, 'lib', 'search-pages.json');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, JSON.stringify(out));
console.log('pages', pages.length, '· entries', out.length, '→', dst);
