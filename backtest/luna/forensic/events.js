const {L,iso}=require('./lib.js');const {analyze}=require('./evlib.js');const fs=require('fs');
const ex=f=>fs.existsSync(f);
const src=(sym)=>ex(`data/perp_${sym}_1d.json`)?`data/perp_${sym}_1d.json`:`data/scan/${sym}.json`;
const EV=[
 ['LUNA (Terra)','LUNAUSDT','2022-05-07',{endT:Date.parse('2022-05-12T15:30Z')}],
 ['FTT (FTX)','FTTUSDT','2022-11-06',{endT:Date.parse('2022-11-14T04:00Z'),W:10}],
 ['SRM (FTX 생태계)','SRMUSDT','2022-11-06',{endT:Date.parse('2022-11-15T04:30Z'),W:10}],
 ['CEL (Celsius) Gate 현물','CEL','2022-06-10',{file:'data/gate_CEL_1d.json',nofund:true,W:15}],
 ['WAVES/USDN','WAVESUSDT','2022-04-01',{}],
 ['OM (MANTRA)','OMUSDT','2025-04-13',{}],
 ['ZKJ (Polyhedra)','ZKJUSDT','2025-06-15',{}],
 ['MOVE (Movement)','MOVEUSDT','2024-12-10',{W:30,T:200}],
 ['ALPACA (상폐 펌프)','ALPACAUSDT','2025-04-24',{}],
 ['RAVE (RaveDAO)','RAVEUSDT','2026-04-17',{}],
 ['SIREN (3월 급락)','SIRENUSDT','2026-03-20',{W:10}],
 ['SIREN (6월 고래 매도)','SIRENUSDT','2026-06-10',{W:20}],
 ['LAB','LABUSDT','2026-07-06',{}],
 ['DEXE','DEXEUSDT','2026-07-20',{}],
 ['COAI','COAIUSDT','2025-10-15',{}],
 ['XPL (Plasma)','XPLUSDT','2025-09-28',{}],
];
const out=[];
for(const [name,sym,E,o] of EV){const f=o.file||src(sym);if(!ex(f)){out.push({name,sym,err:'no data'});continue;}
 const b=L(f);if(!Array.isArray(b)){out.push({name,sym,err:'bad data'});continue;}
 const fund=!o.nofund&&ex(`data/funding_${sym}.json`)?L(`data/funding_${sym}.json`):null;
 const r=analyze(b,Date.parse(E),{fund,endT:o.endT,W:o.W||90,T:o.T||60});out.push({name,sym,event:E,fundingData:!!fund,...r});}
fs.writeFileSync('results_events.json',JSON.stringify(out,null,1));
for(const r of out){if(r.err){console.log(r.name,r.err);continue;}
 console.log(`\n${r.name} peak ${r.peakDate} ${r.peakClose} -> trough ${r.troughDate} ${r.troughLow} drop ${r.dropPct}% in ${r.daysPeakToTrough}d; c50 ${r.firstClose50} c20 ${r.firstClose20}; rebound30d +${r.reboundFromTrough30dPct}%; MA120@peak ${r.belowMA120AtPeak}; fund ${r.fundingData}`);
 console.log('  systemD20',JSON.stringify(r.systemD20));for(const [k,s] of Object.entries(r.signals)){if(!s){console.log('  ',k,'none');continue;}const t=s.trade;console.log('  ',k,s.date,'entry',s.entry,'done',s.dropDonePct+'%','remain',s.remainingToTroughPct+'%','| exit',t.exitT,t.why,'gross',t.gross,'fund',t.funding,'net',t.net,'mae',t.mae);}}
