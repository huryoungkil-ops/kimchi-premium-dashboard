import fs from 'fs';
const qs = [
 ['ko','토큰증권 법 국회 통과'],['ko','토큰증권 시행 2026'],['ko','토큰증권 자본시장법 전자증권법 개정 시행일'],['ko','해외 거래소 미신고 접속 차단 금융정보분석원 2026'],['ko','토큰화 주식 국내 투자자 해외 거래소'],['ko','가상자산 과세 2027 토큰'],
 ['en','PAXG depeg'],['en','PAXG premium discount gold'],['en','XAUT redemption minimum Tether Gold'],['en','Paxos PAXG redemption fee'],
 ['en','Ostium oracle exploit'],['en','gTrade Gains Network oracle incident'],['en','Hyperliquid HIP-3 trade.xyz incident'],['en','Hyperliquid HIP-3 oracle weekend'],['en','trade.xyz XYZ100 weekend'],
 ['en','Binance TradFi perpetual gold oil launch'],['en','Binance CLUSDT BZUSDT natural gas perpetual'],['en','Bybit TradFi gold perpetual'],
 ['en','xStocks weekend price dislocation'],['en','tokenized stocks weekend gap premium'],['en','Robinhood stock tokens EU weekend'],['en','Ondo Global Markets tokenized stocks'],
 ['en','BlackRock BUIDL collateral Binance'],['en','OUSG USYC collateral'],['en','Hyperliquid heating oil gasoline perpetual'],['en','tokenized gold redemption delay'],
];
const out = {};
for (const [lang, q] of qs) {
  const u = lang==='ko' ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko` : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  try { const t = await (await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}})).text();
    const items = [...t.matchAll(/<item>([^]*?)<[/]item>/g)].slice(0,8).map(m=>{const g=tag=>{const a=m[1].indexOf("<"+tag);if(a<0)return "";const b=m[1].indexOf(">",a)+1;const c=m[1].indexOf("</"+tag+">",b);return m[1].slice(b,c);};return {title:g("title"),date:g("pubDate"),link:g("link"),src:g("source")}});
    out[q]=items; console.log('\n##',q); items.forEach(i=>console.log('-',i.date.slice(5,16),'|',i.title.slice(0,140)));
  } catch(e){console.log(q,'ERR',e.message)}
}
fs.writeFileSync('news_rss.json',JSON.stringify(out,null,1));
