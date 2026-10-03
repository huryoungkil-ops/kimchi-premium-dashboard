import fs from 'fs';
const qs = process.argv.slice(2);
const all = fs.existsSync('news_bing.json') ? JSON.parse(fs.readFileSync('news_bing.json')) : {};
for (const q of qs) {
  const t = await (await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=en`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const items = [...t.matchAll(/<item>([^]*?)<[/]item>/g)].slice(0, 6).map(m => { const g = tag => { const a = m[1].indexOf('<' + tag + '>'); if (a < 0) return ''; const b = a + tag.length + 2; return m[1].slice(b, m[1].indexOf('</' + tag + '>', b)); }; let link = g('link').replace(/&amp;/g, '&'); const u = link.match(/[?&]url=([^&]+)/); if (u) link = decodeURIComponent(u[1]); return { title: g('title'), date: g('pubDate'), link, desc: g('description').slice(0, 400) }; });
  all[q] = items; console.log('\n##', q); items.forEach(i => console.log('-', i.date.slice(5, 16), '|', i.title.slice(0, 110), '\n  ', i.link, '\n  ', i.desc.slice(0, 300)));
}
fs.writeFileSync('news_bing.json', JSON.stringify(all, null, 1));
