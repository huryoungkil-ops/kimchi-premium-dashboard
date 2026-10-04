const fs=require('fs');
const L=f=>JSON.parse(fs.readFileSync(f));
const day=86400e3;
const iso=t=>new Date(t).toISOString().slice(0,16).replace('T',' ');
// bars: [t,o,h,l,c,v,qv]; keep traded bars
const clean=b=>b.filter(k=>k[5]>0);
function signals(b){ // daily bars; returns per-index flags
  const n=b.length,res=[];
  for(let i=0;i<n;i++){const r={};
    if(i>=20){let m=Infinity;for(let j=i-20;j<i;j++)m=Math.min(m,b[j][3]);r.d20=b[i][4]<m;}
    if(i>=55){let m=Infinity;for(let j=i-55;j<i;j++)m=Math.min(m,b[j][3]);r.d55=b[i][4]<m;}
    if(i>=120){let s=0;for(let j=i-120;j<i;j++)s+=b[j][4];r.ma120=b[i][4]<s/120;r.ma120v=s/120;}
    if(i>=21){const tr=k=>Math.max(k[2]-k[3],Math.abs(k[2]-b[b.indexOf(k)-1][4]),Math.abs(k[3]-b[b.indexOf(k)-1][4]));
      let s=0;for(let j=i-20;j<i;j++){const k=b[j],p=b[j-1];s+=Math.max(k[2]-k[3],Math.abs(k[2]-p[4]),Math.abs(k[3]-p[4]));}
      const k=b[i],p=b[i-1];const t=Math.max(k[2]-k[3],Math.abs(k[2]-p[4]),Math.abs(k[3]-p[4]));
      r.atrx=t>2.5*(s/20)&&k[4]<p[4];}
    res.push(r);}
  return res;}
function priceAt(b,t){let lo=0,hi=b.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(b[m][0]<=t)lo=m;else hi=m-1;}return b[lo][4];}
function fundingSum(f,t0,t1,b=null,entry=null){ // short P&L (fraction of entry notional) from funding: short receives +rate * P_t/P_entry
  let s=0,n=0;for(const [t,r] of f)if(t>t0&&t<=t1){const w=b?priceAt(b,t)/entry:1;s+=r*w;n++;}return {sum:s,n};}
// simulate short: entry at bar i+1 open; exit when close > max high of prior N bars (donchian exit) or end
function simShort(b,i,{exitN=10,cost=0.003,fund=null,maxHold=60,endT=null}={}){
  if(i+1>=b.length)return null;const e=b[i+1][1],t0=b[i+1][0];let mae=0,exitP=null,exitT=null,why='end';
  for(let j=i+1;j<b.length&&j<=i+maxHold;j++){mae=Math.max(mae,b[j][2]/e-1);
    if(endT&&b[j][0]>=endT){exitP=b[j][4];exitT=b[j][0];why='delist';break;}
    if(j>=i+2){let h=-Infinity;for(let q=Math.max(0,j-exitN);q<j;q++)h=Math.max(h,b[q][2]);if(b[j][4]>h){exitP=b[j][4];exitT=b[j][0]+day;why='donchian'+exitN;break;}}
    exitP=b[j][4];exitT=b[j][0]+day;if(j===i+maxHold)why='maxhold';}
  const gross=(e-exitP)/e;const fs_=fund?fundingSum(fund,t0,exitT,b,e):{sum:null,n:0};
  return {entryT:iso(t0),entry:e,exitT:iso(exitT),exit:exitP,why,gross:+gross.toFixed(4),funding:fs_.sum==null?null:+fs_.sum.toFixed(4),net:+(gross-2*cost+(fs_.sum||0)).toFixed(4),mae:+mae.toFixed(4)};}
module.exports={priceAt,L,day,iso,clean,signals,fundingSum,simShort};
