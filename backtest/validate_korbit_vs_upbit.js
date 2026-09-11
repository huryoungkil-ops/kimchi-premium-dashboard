// 검증: 코빗 김프 vs 업비트 김프 — 업비트를 코빗 대체재로 써도 되는가?
// 코빗 5분봉은 약 170일치만 존재하므로, 그 겹치는 구간으로 두 거래소의 김프를 직접 비교한다.
// 비교 항목: 평균 차이(bias), 차이의 표준편차, 상관계수, 그리고 "진입 신호가 같은 시점에 뜨는가"(신호 일치율)

const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const CACHE_DIR = path.join(OUT_DIR, 'cache_validate');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// 유동성 상위 위주로 대표 5종목
const COINS = [
  ['BTC', 'btc_krw', 'KRW-BTC', 'BTC-USDT-SWAP'],
  ['ETH', 'eth_krw', 'KRW-ETH', 'ETH-USDT-SWAP'],
  ['XRP', 'xrp_krw', 'KRW-XRP', 'XRP-USDT-SWAP'],
  ['SOL', 'sol_krw', 'KRW-SOL', 'SOL-USDT-SWAP'],
  ['DOGE', 'doge_krw', 'KRW-DOGE', 'DOGE-USDT-SWAP'],
];

const DAYS_BACK = 160; // 코빗 5분봉 보존 한계(약 170일)보다 여유 있게
const ENTRY_SIGMA = 1.0;
const MIN_DATA_POINTS = 10;
const MAX_SIGMA_PERCENT = 2.5;
const MAX_WINDOW = 864;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJsonRetry(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { await sleep(2000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

async function fetchKorbit5m(symbol, sinceMs, cacheFile) {
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const out = [];
  let end = Date.now();
  let guard = 0;
  while (guard++ < 1000) {
    const url = `https://api.korbit.co.kr/v2/candles?symbol=${symbol}&interval=5&limit=200&end=${end}`;
    const data = await fetchJsonRetry(url);
    const rows = (data && data.data) ? data.data : [];
    if (rows.length === 0) break;
    for (const r of rows) out.push({ ts: r.timestamp, close: Number(r.close) });
    const oldest = Math.min(...rows.map(r => r.timestamp));
    if (oldest <= sinceMs) break;
    end = oldest;
    await sleep(60);
  }
  out.sort((a, b) => a.ts - b.ts);
  const seen = new Set();
  const dedup = out.filter(r => { if (seen.has(r.ts)) return false; seen.add(r.ts); return true; }).filter(r => r.ts >= sinceMs);
  fs.writeFileSync(cacheFile, JSON.stringify(dedup));
  return dedup;
}

async function fetchUpbit5m(market, sinceMs, cacheFile) {
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const out = [];
  let to = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let guard = 0;
  while (guard++ < 1000) {
    const url = `https://api.upbit.com/v1/candles/minutes/5?market=${market}&count=200&to=${encodeURIComponent(to)}`;
    const data = await fetchJsonRetry(url);
    if (!Array.isArray(data) || data.length === 0) break;
    for (const c of data) {
      // 업비트 timestamp는 체결시각이라 5분 슬롯 시작시각으로 정규화
      const slot = Date.parse(c.candle_date_time_utc + 'Z');
      out.push({ ts: slot, close: c.trade_price });
    }
    const oldest = data[data.length - 1];
    const oldestSlot = Date.parse(oldest.candle_date_time_utc + 'Z');
    if (oldestSlot <= sinceMs) break;
    to = oldest.candle_date_time_utc.replace('T', ' ');
    await sleep(110);
  }
  out.sort((a, b) => a.ts - b.ts);
  const seen = new Set();
  const dedup = out.filter(r => { if (seen.has(r.ts)) return false; seen.add(r.ts); return true; }).filter(r => r.ts >= sinceMs);
  fs.writeFileSync(cacheFile, JSON.stringify(dedup));
  return dedup;
}

async function fetchOkx5m(instId, sinceMs, cacheFile) {
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const out = [];
  let after;
  let guard = 0;
  while (guard++ < 2000) {
    let url = `https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=5m&limit=100`;
    if (after) url += `&after=${after}`;
    const data = await fetchJsonRetry(url);
    if (!data || data.code !== '0' || !Array.isArray(data.data) || data.data.length === 0) break;
    for (const row of data.data) out.push({ ts: Number(row[0]), close: Number(row[4]) });
    const oldest = Number(data.data[data.data.length - 1][0]);
    if (oldest <= sinceMs) break;
    after = String(oldest);
    await sleep(130);
  }
  out.sort((a, b) => a.ts - b.ts);
  const seen = new Set();
  const dedup = out.filter(r => { if (seen.has(r.ts)) return false; seen.add(r.ts); return true; }).filter(r => r.ts >= sinceMs);
  fs.writeFileSync(cacheFile, JSON.stringify(dedup));
  return dedup;
}

async function fetchFxDaily(startDate, endDate, cacheFile) {
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const url = `https://api.frankfurter.app/${startDate}..${endDate}?from=USD&to=KRW`;
  const data = await fetchJsonRetry(url);
  const out = {};
  for (const d of Object.keys(data.rates || {})) out[d] = data.rates[d].KRW;
  fs.writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

function computeSignals(series) {
  // series: [{ts, premium}] 시간순. 실거래 로직과 동일한 슬라이딩 윈도우로 신호 계산
  const buf = [];
  let sum = 0, sumSq = 0;
  const signals = [];
  for (const p of series) {
    buf.push(p.premium); sum += p.premium; sumSq += p.premium * p.premium;
    if (buf.length > MAX_WINDOW) { const r = buf.shift(); sum -= r; sumSq -= r * r; }
    if (buf.length < MIN_DATA_POINTS) { signals.push({ ts: p.ts, signal: null }); continue; }
    const n = buf.length;
    const ma = sum / n;
    const sigma = Math.sqrt(Math.max(0, sumSq / n - ma * ma));
    let signal = null;
    if (sigma <= MAX_SIGMA_PERCENT) {
      if (p.premium < ma - ENTRY_SIGMA * sigma) signal = 'ENTRY';
      else if (p.premium > ma) signal = 'EXIT';
    }
    signals.push({ ts: p.ts, signal });
  }
  return signals;
}

async function main() {
  const nowMs = Date.now();
  const sinceMs = nowMs - DAYS_BACK * 86400000;
  console.log(`검증 기간: 최근 ${DAYS_BACK}일 (${new Date(sinceMs).toISOString().slice(0,10)} ~ ${new Date(nowMs).toISOString().slice(0,10)})\n`);

  const fx = await fetchFxDaily(new Date(sinceMs).toISOString().slice(0,10), new Date(nowMs).toISOString().slice(0,10), path.join(CACHE_DIR, 'fx.json'));
  const fxDates = Object.keys(fx).sort();
  function fxForTs(ts) {
    const d = new Date(ts).toISOString().slice(0, 10);
    let lo = 0, hi = fxDates.length - 1, ans = null;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (fxDates[m] <= d) { ans = fxDates[m]; lo = m + 1; } else hi = m - 1; }
    return ans ? fx[ans] : null;
  }

  const report = [];

  for (const [name, korbitSym, upbitMarket, okxInst] of COINS) {
    process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${name} 수집 중... `);
    let korbit, upbit, okx;
    try {
      korbit = await fetchKorbit5m(korbitSym, sinceMs, path.join(CACHE_DIR, `korbit_${name}.json`));
      upbit = await fetchUpbit5m(upbitMarket, sinceMs, path.join(CACHE_DIR, `upbit_${name}.json`));
      okx = await fetchOkx5m(okxInst, sinceMs, path.join(CACHE_DIR, `okx_${name}.json`));
    } catch (e) {
      console.log(`실패: ${e.message}`);
      continue;
    }
    console.log(`코빗 ${korbit.length}봉 / 업비트 ${upbit.length}봉 / OKX ${okx.length}봉`);

    const kMap = new Map(korbit.map(r => [r.ts, r.close]));
    const uMap = new Map(upbit.map(r => [r.ts, r.close]));
    const seriesK = [], seriesU = [], diffs = [];
    for (const o of okx) {
      const rate = fxForTs(o.ts);
      if (!rate) continue;
      const kc = kMap.get(o.ts), uc = uMap.get(o.ts);
      if (kc === undefined || uc === undefined) continue;
      const pK = ((kc / rate) / o.close - 1) * 100;
      const pU = ((uc / rate) / o.close - 1) * 100;
      seriesK.push({ ts: o.ts, premium: pK });
      seriesU.push({ ts: o.ts, premium: pU });
      diffs.push(pK - pU);
    }
    if (diffs.length < 100) { console.log(`  → 매칭된 봉이 너무 적음(${diffs.length}). 건너뜀`); continue; }

    const meanDiff = diffs.reduce((s, v) => s + v, 0) / diffs.length;
    const sdDiff = Math.sqrt(diffs.reduce((s, v) => s + (v - meanDiff) ** 2, 0) / diffs.length);
    const absMeanDiff = diffs.reduce((s, v) => s + Math.abs(v), 0) / diffs.length;

    const mk = seriesK.reduce((s, v) => s + v.premium, 0) / seriesK.length;
    const mu = seriesU.reduce((s, v) => s + v.premium, 0) / seriesU.length;
    let cov = 0, vk = 0, vu = 0;
    for (let i = 0; i < seriesK.length; i++) {
      const a = seriesK[i].premium - mk, b = seriesU[i].premium - mu;
      cov += a * b; vk += a * a; vu += b * b;
    }
    const corr = cov / Math.sqrt(vk * vu);

    // 신호 일치율
    const sigK = computeSignals(seriesK), sigU = computeSignals(seriesU);
    let entryK = 0, entryU = 0, entryBoth = 0, compared = 0;
    for (let i = 0; i < sigK.length; i++) {
      if (sigK[i].signal === null && sigU[i].signal === null) continue;
      compared++;
      const ek = sigK[i].signal === 'ENTRY', eu = sigU[i].signal === 'ENTRY';
      if (ek) entryK++;
      if (eu) entryU++;
      if (ek && eu) entryBoth++;
    }
    const jaccard = (entryK + entryU - entryBoth) > 0 ? entryBoth / (entryK + entryU - entryBoth) * 100 : null;

    const row = {
      coin: name,
      matchedBars: diffs.length,
      korbitAvgPremium: Number(mk.toFixed(3)),
      upbitAvgPremium: Number(mu.toFixed(3)),
      meanDiff_KminusU: Number(meanDiff.toFixed(3)),
      absMeanDiff: Number(absMeanDiff.toFixed(3)),
      sdDiff: Number(sdDiff.toFixed(3)),
      correlation: Number(corr.toFixed(4)),
      entrySignals_korbit: entryK,
      entrySignals_upbit: entryU,
      entrySignals_both: entryBoth,
      signalOverlapPct: jaccard === null ? null : Number(jaccard.toFixed(1)),
    };
    report.push(row);
    console.log(`  → 평균차이 ${row.meanDiff_KminusU}%p, 상관계수 ${row.correlation}, 진입신호 일치율 ${row.signalOverlapPct}%`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'validate_korbit_vs_upbit.json'), JSON.stringify(report, null, 2));
  console.log('\n===== 검증 결과 =====');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
