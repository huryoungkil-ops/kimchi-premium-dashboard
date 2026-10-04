// Final: recommended-variant checks, BTC 50% benchmark, merge into results.json
const fs=require('fs');const {prep,btcLong}=require('./data_prep');const {run,metrics,yearly}=require('./lib');const St=require('./strategies');
const D=prep();const r4=x=>x==null||!isFinite(x)?x:Math.round(x*10000)/10000;const R=o=>{const z={};for(const k in o)z[k]=typeof o[k]==='number'?r4(o[k]):o[k];return z;};
const FULL=['2019-09-08','2026-10-04'],IS=['2019-09-08','2021-12-31'],OOS=['2022-01-01','2026-10-04'];
const btc=btcLong(D);
function blend(a,b,wa,wb){const e=new Float64Array(D.ND).fill(NaN);let E=1;for(let i=0;i<D.ND;i++){if(i===0||isNaN(a[i-1])){e[i]=E;continue;}const ra=a[i]/a[i-1]-1,rb=(isNaN(b[i-1])||isNaN(b[i]))?0:b[i]/b[i-1]-1;E*=1+wa*ra+wb*rb;e[i]=E;}return e;}
const cash=new Float64Array(D.ND).fill(1);
const M=(eq,T)=>({full:R(metrics(eq,D.dates,...FULL,T)),is:R(metrics(eq,D.dates,...IS,T)),oos:R(metrics(eq,D.dates,...OOS,T)),yearly:R(yearly(eq,D.dates))});
const res={};
res['BTC120 50% + 50% cash']=M(blend(cash,btc.eq,0,0.5));
const rec={ 'C_rec_r1%':[St.crashC({exitHH:20}),{}], 'C_rec_r2%':[St.crashC({exitHH:20,risk:0.02}),{}], 'C_rec_r2%_fund':[St.crashC({exitHH:20,risk:0.02,fundMin:-0.0005}),{}],
  'C_rec_r2%_x3lev':[St.crashC({exitHH:20,risk:0.02}),{lev:3}], 'C_rec_r2%_maxPos20':[St.crashC({exitHH:20,risk:0.02}),{maxPos:20}],
  'B_trend_MA200_r1%':[St.trendB({ma:200,exitMA:1e5}),{}] };
const eqs={};
for(const [k,[s,o]] of Object.entries(rec)){const r=run(D,s,o);eqs[k]=r.eq;res[k]=Object.assign(M(r.eq,r.trades),{name:s.name,opts:o,fundingTot:r4(r.fundingTot),feeTot:r4(r.feeTot),slipTot:r4(r.slipTot),liq:r.liqCount,
  worst:[...r.trades].sort((a,b)=>a.pnlPctOfEq-b.pnlPctOfEq).slice(0,5).map(t=>`${t.sym} ${t.entryDate}->${t.exitDate} ${t.reason} px${(t.ret*100).toFixed(0)}% eq${(t.pnlPctOfEq*100).toFixed(2)}%`)});
  if(k==='C_rec_r2%'){const cols=['sym','entryDate','exitDate','reason','entryPx','exitPx','ret','pnlPctOfEq','funding','fees','notional0','days','mae','peakToEntry','entryAge'];
    fs.writeFileSync('out/trades_C_recommended_r2.csv',cols.join(',')+'\n'+r.trades.map(t=>cols.map(c=>typeof t[c]==='number'?+t[c].toPrecision(6):t[c]).join(',')).join('\n'));}}
res['C_rec_r2% + BTC120 50/50']=M(blend(eqs['C_rec_r2%'],btc.eq,0.5,0.5));
res['C_rec_r2% (100%) + BTC120 50% overlay']=M(blend(eqs['C_rec_r2%'],btc.eq,1,0.5));
// monthly csv for recommended
const names=['C_rec_r2%'];const lines=['month,C_rec_r2,BTC120_long,C_rec_r2_plus_BTC120_50_50'];const cb=blend(eqs['C_rec_r2%'],btc.eq,0.5,0.5);
for(let i=0;i<D.ND;i++){const m=D.dates[i].slice(0,7);if(i+1===D.ND||D.dates[i+1].slice(0,7)!==m)lines.push([m,r4(eqs['C_rec_r2%'][i]),r4(btc.eq[i]),r4(cb[i])].join(','));}
fs.writeFileSync('out/equity_monthly_recommended.csv',lines.join('\n'));
const main=JSON.parse(fs.readFileSync('results_main.json'));const grid=JSON.parse(fs.readFileSync('results_grid.json'));
fs.writeFileSync('results.json',JSON.stringify({...main,final:res,gridSummary:grid.summary,gridRowsFile:'out/grid.csv',
 assumptions:{signals:'daily close (UTC 00:00 bar close), execute next daily open (=00:00 UTC, first 1h/4h bar open)',fee:'0.05%/side taker',slippage:'per side by 20d ADV: >=500M 0.05%, >=100M 0.1%, >=20M 0.2%, >=5M 0.35%, else 0.5%; stops 2x',
 funding:'actual Binance funding history (API+Binance Vision), shorts receive positive / pay negative',delist:'closed at last available daily close with 0.5% slippage',liquidation:'isolated, liq at entry*(1+1/L-1%mmr), loses full margin',
 sizing:'notional = equity*risk/(stopMult*N/price) (risk = loss at stop), unit cap 25% equity, default maxPos 10, gross cap 150%',OI:'not testable - Binance openInterestHist only keeps 30 days'}},null,1));
for(const k in res)console.log(k.padEnd(38),'CAGR',(res[k].full.cagr*100).toFixed(1),'Sh',res[k].full.sharpe,'MDD',(res[k].full.mdd*100).toFixed(1),'|IS',(res[k].is.cagr*100).toFixed(1),'|OOS',(res[k].oos.cagr*100).toFixed(1),res[k].oos.sharpe,(res[k].oos.mdd*100).toFixed(1),'tr',res[k].full.trades??'','PF',res[k].full.profitFactor??'','win',res[k].full.winRate??'','payoff',res[k].full.payoff??'','top10',res[k].full.top10Share??'','fund',res[k].fundingTot??'','fee',res[k].feeTot??'','slip',res[k].slipTot??'','liq',res[k].liq??'','LDD',res[k].full.longestDDdays,'sortino',res[k].full.sortino,'vol',res[k].full.vol);
for(const k of ['C_rec_r2%','C_rec_r2% + BTC120 50/50','BTC120 50% + 50% cash'])console.log(k,JSON.stringify(Object.fromEntries(Object.entries(res[k].yearly).map(([y,v])=>[y,(v*100).toFixed(1)]))));
console.log(res['C_rec_r2%'].worst);
