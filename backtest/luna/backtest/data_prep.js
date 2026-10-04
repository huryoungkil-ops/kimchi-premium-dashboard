// Load futures universe + BTC spot regime (BTC 120MA from Binance spot so it is valid from day 1)
const fs = require('fs'); const path = require('path');
const { loadAll, DAY } = require('./lib');
function prep() {
  const D = loadAll();
  const spot = JSON.parse(fs.readFileSync(path.join(__dirname, '../../classic/data/spot_BTC_1d.json')));
  const map = new Map(spot.map(b => [new Date(b[0]).toISOString().slice(0, 10), b[4]]));
  const allDates = [...map.keys()].sort(); const closes = allDates.map(d => map.get(d));
  const ma = {}; for (let k = 119; k < closes.length; k++) { let s = 0; for (let j = k - 119; j <= k; j++) s += closes[j]; ma[allDates[k]] = s / 120; }
  D.btcSpotClose = D.dates.map(d => map.get(d) ?? NaN);
  // fall back to BTC perp close if spot cache ends earlier
  const B = D.syms.BTCUSDT;
  D.btcMA120 = D.dates.map((d, i) => ma[d] ?? NaN);
  // extend MA with perp closes when spot cache missing
  for (let i = 0; i < D.ND; i++) if (isNaN(D.btcMA120[i]) && i >= 119) { let s = 0, ok = true; for (let j = i - 119; j <= i; j++) { const v = isNaN(D.btcSpotClose[j]) ? B.c[j] : D.btcSpotClose[j]; if (isNaN(v)) ok = false; s += v; } if (ok) D.btcMA120[i] = s / 120; }
  D.btcClose = D.dates.map((d, i) => isNaN(D.btcSpotClose[i]) ? B.c[i] : D.btcSpotClose[i]);
  D.btcBear = D.dates.map((d, i) => D.btcClose[i] < D.btcMA120[i]);
  return D;
}
// BTC 120MA long sleeve on BTCUSDT perp: signal at close t (close>MA120), executed at open t+1; taker+slip 0.1%/side; pays funding when long
function btcLong(D, opts = {}) {
  const cost = opts.cost ?? 0.001; const B = D.syms.BTCUSDT; const ND = D.ND;
  const eq = new Float64Array(ND).fill(NaN); let E = 1, inPos = false, sig = false, fund = 0, switches = 0;
  for (let i = 0; i < ND; i++) {
    if (isNaN(B.c[i])) { eq[i] = E; continue; }
    if (i > 0 && sig !== inPos) { // execute at open
      E *= (1 - cost); switches++;
      if (sig) { inPos = true; E *= B.c[i] / B.o[i]; E *= (1 - B.fdMid[i]); fund -= B.fdMid[i]; }
      else { inPos = false; E *= B.o[i] / B.c[i - 1]; E *= (1 - B.fd0[i]); fund -= B.fd0[i]; }
    } else if (inPos && i > 0) { E *= B.c[i] / B.c[i - 1]; const f = B.fd0[i] + B.fdMid[i]; E *= (1 - f); fund -= f; }
    eq[i] = E; sig = D.btcClose[i] > D.btcMA120[i];
  }
  return { eq, fund, switches };
}
module.exports = { prep, btcLong };
