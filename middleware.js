// 코인 연구소는 PIN 을 아는 사람만 본다 (2026-11-19 사용자 지시). 로그인 쿠키가 없으면 /login/ 으로 보낸다.
// 경매 연구소(auction-lab/site/middleware.js)와 같은 방식이다.
import { TOKEN_HASH } from './auth-config.mjs';
export const config = { matcher: ['/((?!login|api/login|favicon|apple-touch-icon).*)'] };
async function sha256(s){ const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
export default async function middleware(request){
  const url=new URL(request.url);
  if(url.pathname==='/auth-config.mjs') return new Response('Not found',{status:404});
  const m=(request.headers.get('cookie')||'').match(/(?:^|;\s*)coin_auth=([a-f0-9]{64})/);
  if(m && await sha256(m[1])===TOKEN_HASH) return; // 통과
  const to=new URL('/login/',url);
  if(url.pathname!=='/') to.searchParams.set('next',url.pathname+url.search);
  return Response.redirect(to,307);
}
