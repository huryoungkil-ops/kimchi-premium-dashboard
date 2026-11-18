// PIN 확인 → 180일짜리 쿠키 (coin_auth). 틀리면 1.2초 늦춰 대입을 늦춘다.
import { createHash } from 'node:crypto';
import { SALT, TOKEN_HASH } from '../auth-config.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
export async function POST(request){
  const form=await request.formData(); const pin=String(form.get('pin')||'').replace(/\D/g,'');
  let next=String(form.get('next')||'/'); if(!next.startsWith('/')||next.startsWith('//')) next='/';
  const token=sha(SALT+':'+pin);
  if(sha(token)===TOKEN_HASH) return new Response(null,{status:303,headers:{Location:next,'Set-Cookie':`coin_auth=${token}; Max-Age=15552000; Path=/; HttpOnly; Secure; SameSite=Lax`}});
  await new Promise(r=>setTimeout(r,1200));
  return new Response(null,{status:303,headers:{Location:'/login/?e=1'+(next!=='/'?'&next='+encodeURIComponent(next):'')}});
}
