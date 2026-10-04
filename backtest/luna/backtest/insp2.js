const {prep}=require('./data_prep');const {run,I}=require('./lib');const St=require('./strategies');
const D=prep();const S=D.syms.LUNAUSDT;
for(let i=D.dates.indexOf('2022-05-04');i<=D.dates.indexOf('2022-05-16');i++)console.log(D.dates[i],S.o[i],S.h[i],S.l[i],S.c[i],(S.v[i]/1e6).toFixed(0)+'M','LL55',I(S,'LL',55)[i],'N',I(S,'N',20)[i]?.toFixed(2),'ADV',(I(S,'ADV',20)[i]/1e6).toFixed(0), 'fl',S.fLast[i]);
const r=run(D,St.turtle(),{});
// count open positions around may 2022
for(const d of ['2022-05-08','2022-05-09','2022-05-10','2022-05-11']){const i=D.dates.indexOf(d);console.log(d,'npos',r.npos[i],'gross',r.gross[i].toFixed(2));}
console.log(r.trades.filter(t=>t.entryDate<='2022-05-10'&&t.exitDate>='2022-05-09').map(t=>t.sym+' '+t.entryDate).join(', '));
