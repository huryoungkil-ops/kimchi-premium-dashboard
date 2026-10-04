// $N per contract (full & micro) and % of days (2015-2026) where 1 unit >= 1 contract
const fs=require('fs');const {load}=require('./engine');const M=require('./markets');const rows=[];
for(const m of M){const D=load(m);const nd=[];for(let i=0;i<D.d.length;i++)if(D.d[i]>='2015-01-01'&&D.N[i])nd.push(D.N[i]);
 const last=D.N[D.N.length-1];const med=[...nd].sort((a,b)=>a-b)[nd.length>>1];
 const r={sym:m.s,group:m.g,pv:m.pv,micro:m.micro?m.micro.n+'('+m.micro.pv+')':'-',lastDate:D.d.at(-1),dollarN_last:Math.round(last*m.pv),dollarN_median15_26:Math.round(med*m.pv)};
 for(const [lab,pv] of [['full',m.pv],['micro',m.micro?m.micro.pv:m.pv]])for(const A of [5e4,1e5,1e6])for(const rk of [0.01,0.005]){
  r[`${lab}_${A/1e3}k_${rk*100}%_ctLast`]=Math.floor(A*rk/(last*pv));
  r[`${lab}_${A/1e3}k_${rk*100}%_pctDaysOK`]=+(nd.filter(n=>A*rk/(n*pv)>=1).length/nd.length*100).toFixed(0);}
 rows.push(r);}
fs.writeFileSync('feasibility.json',JSON.stringify(rows,null,1));
console.log('sym  $N_last $N_med micro | full50k@1% full100k@1% full100k@.5% | micro50k@1% micro100k@.5% | %daysOK full100k@.5% micro50k@.5%');
for(const r of rows)console.log(r.sym.padEnd(4),String(r.dollarN_last).padStart(6),String(r.dollarN_median15_26).padStart(6),r.micro.padEnd(16),r['full_50k_1%_ctLast'],r['full_100k_1%_ctLast'],r['full_100k_0.5%_ctLast'],'|',r['micro_50k_1%_ctLast'],r['micro_100k_0.5%_ctLast'],'|',r['full_100k_0.5%_pctDaysOK'],r['micro_50k_0.5%_pctDaysOK']);
