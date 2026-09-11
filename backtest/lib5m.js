// 김치 프리미엄 전략 백테스트 공용 라이브러리
//   - 데이터 수집/캐싱 (업비트 5분봉 · OKX SWAP 5분봉 · OKX 펀딩비 · 일별 환율)
//   - 파라미터를 받아 매매를 시뮬레이션하는 simulate()
//
// backtest5m.js(단일 실행)와 optimize5m.js(파라미터 탐색)가 이 파일을 함께 쓴다.
// 파라미터 조합을 수십 개 돌려야 하므로, 코인별 이동평균/표준편차는 여기서 "한 번만"
// 계산해 타입배열에 담아두고 simulate()는 그걸 재사용한다.

const fs = require('fs');
const path = require('path');

// 결과·캐시는 이 스크립트가 있는 폴더 기준으로 쌓인다 (둘 다 .gitignore 대상)
const OUT_DIR = __dirname;
const CACHE_DIR = path.join(OUT_DIR, 'cache5m');

// ---------------------------------------------------------------------------
// 고정 상수 (전략의 "구조"에 해당하는 값 — 탐색 대상이 아님)
// ---------------------------------------------------------------------------
const SEED = 10000;
const POSITION_FRACTION = 0.10;
const POSITION_SIZE = SEED * POSITION_FRACTION;

// 편도 수수료: 국내 현물 0.10% + 해외 무기한선물 0.05% = 0.15% (왕복 0.30%)
const FEE_RATE = 0.0015;

const MAX_WINDOW = 864;      // 3일치 5분봉
const MIN_DATA_POINTS = 10;
const BAR_MS = 300000;

// 5분봉 거래대금이 주문 규모의 이 배수에 못 미치면 그 가격엔 실제로 못 샀다고 본다
const MIN_BAR_VALUE_MULTIPLE = 5;

// 2026-09-12 코빗 /v2/orderbook 최우선 호가로 직접 측정한 스프레드(%).
// 과거 호가창은 구할 수 없으므로 (a) 거래 종목을 고르는 기준과
// (b) 왕복 거래비용의 근거로 쓴다.
const KORBIT_SPREAD_PCT = {
  XRP: 0.05, XLM: 0.08, ETH: 0.11, BTC: 0.13, TRX: 0.13, SOL: 0.14, DOGE: 0.17,
  BNB: 0.20, ADA: 0.32, SUI: 0.39, LINK: 0.43, ARB: 0.60, UNI: 0.70, HYPE: 0.98,
  SHIB: 1.39, AVAX: 1.73, NEAR: 1.86, DOT: 2.50, HBAR: 2.99, POL: 3.79, BCH: 4.77,
  SUSHI: 5.97, AAVE: 7.08, ICP: 8.70, XTZ: 9.74, IMX: 16.44, GRT: 25.46,
  DYDX: 32.80, LDO: 37.91, GMX: 38.29, INJ: 45.47,
};
const MAX_SPREAD_PERCENT = 1.0;

const ALL_COINS = [
  ['BTC', 'KRW-BTC', 'BTC-USDT-SWAP'], ['ETH', 'KRW-ETH', 'ETH-USDT-SWAP'],
  ['SOL', 'KRW-SOL', 'SOL-USDT-SWAP'], ['XRP', 'KRW-XRP', 'XRP-USDT-SWAP'],
  ['ADA', 'KRW-ADA', 'ADA-USDT-SWAP'], ['AVAX', 'KRW-AVAX', 'AVAX-USDT-SWAP'],
  ['DOT', 'KRW-DOT', 'DOT-USDT-SWAP'], ['LINK', 'KRW-LINK', 'LINK-USDT-SWAP'],
  ['DOGE', 'KRW-DOGE', 'DOGE-USDT-SWAP'], ['TRX', 'KRW-TRX', 'TRX-USDT-SWAP'],
  ['XLM', 'KRW-XLM', 'XLM-USDT-SWAP'], ['SHIB', 'KRW-SHIB', 'SHIB-USDT-SWAP'],
  ['BCH', 'KRW-BCH', 'BCH-USDT-SWAP'], ['UNI', 'KRW-UNI', 'UNI-USDT-SWAP'],
  ['AAVE', 'KRW-AAVE', 'AAVE-USDT-SWAP'], ['SUSHI', 'KRW-SUSHI', 'SUSHI-USDT-SWAP'],
  ['LDO', 'KRW-LDO', 'LDO-USDT-SWAP'], ['ICP', 'KRW-ICP', 'ICP-USDT-SWAP'],
  ['NEAR', 'KRW-NEAR', 'NEAR-USDT-SWAP'], ['HBAR', 'KRW-HBAR', 'HBAR-USDT-SWAP'],
  ['XTZ', 'KRW-XTZ', 'XTZ-USDT-SWAP'], ['DYDX', 'KRW-DYDX', 'DYDX-USDT-SWAP'],
  ['ARB', 'KRW-ARB', 'ARB-USDT-SWAP'], ['GMX', 'KRW-GMX', 'GMX-USDT-SWAP'],
  ['IMX', 'KRW-IMX', 'IMX-USDT-SWAP'], ['INJ', 'KRW-INJ', 'INJ-USDT-SWAP'],
  ['GRT', 'KRW-GRT', 'GRT-USDT-SWAP'], ['SUI', 'KRW-SUI', 'SUI-USDT-SWAP'],
  ['HYPE', 'KRW-HYPE', 'HYPE-USDT-SWAP'],
];

const COINS = ALL_COINS.filter(c => (KORBIT_SPREAD_PCT[c[0]] ?? 999) <= MAX_SPREAD_PERCENT);

// 거래 1건이 본전이 되려면 김프가 최소 이만큼(%p) 움직여야 한다
function breakEvenPp(coin) {
  return FEE_RATE * 2 * 100 + (KORBIT_SPREAD_PCT[coin] || 0);
}

// ---------------------------------------------------------------------------
// 탐색 대상 파라미터의 기본값
// ---------------------------------------------------------------------------
const DEFAULT_PARAMS = {
  // 진입: 현재 김프가 (평균 − ENTRY_SIGMA×σ) 아래
  ENTRY_SIGMA: 1.0,

  // 진입 추가 관문: 평균까지 회복했을 때 기대되는 이익이
  // 본전 문턱의 EDGE_MULTIPLE배는 되어야 한다. 0이면 이 조건을 끈다.
  // (수수료도 못 덮을 자리에 들어가는 걸 막는 장치)
  EDGE_MULTIPLE: 0,

  // 청산: 김프가 (평균 + EXIT_SIGMA_OFFSET×σ) 위로 올라오면 청산.
  // 0이면 기존처럼 평균 도달 즉시 청산, 양수면 조금 더 버틴다.
  EXIT_SIGMA_OFFSET: 0,

  // true면 신호 청산 시 최소한 본전은 넘겼을 때만 나간다 (손절·최대보유는 예외)
  REQUIRE_PROFIT_EXIT: false,

  MAX_SIGMA_PERCENT: 2.5, // σ가 이보다 크면 그 회차 신호 보류
  MAX_POSITIONS: 3,
  MAX_HOLD_DAYS: 7,       // 넘기면 다음 거래 가능한 봉에서 강제 정리
  STOP_LOSS_PP: 5.0,      // 김프가 진입 시점보다 이만큼 더 내려가면 손절
};

// ---------------------------------------------------------------------------
// 수집
// ---------------------------------------------------------------------------
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
  throw new Error('unreachable');
}

async function fetchUpbit5m(market, sinceMs, cacheFile) {
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const out = [];
  let to = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let guard = 0;
  while (guard++ < 20000) {
    const url = `https://api.upbit.com/v1/candles/minutes/5?market=${market}&count=200&to=${encodeURIComponent(to)}`;
    const data = await fetchJsonRetry(url);
    if (!Array.isArray(data) || data.length === 0) break;
    // 주의: 업비트의 timestamp 필드는 봉 시작 시각이 아니라 그 봉 안의 마지막 체결 시각이라
    // 매번 밀리초가 다르다. OKX 봉(정확히 5분 경계)과 맞추려면 candle_date_time_utc를 써야 한다.
    for (const c of data) {
      out.push({
        ts: Date.parse(c.candle_date_time_utc + 'Z'),
        close: c.trade_price,
        value: c.candle_acc_trade_price, // 그 5분간 체결 금액(원)
      });
    }
    const oldest = data[data.length - 1];
    if (Date.parse(oldest.candle_date_time_utc + 'Z') <= sinceMs) break;
    to = oldest.candle_date_time_utc.replace('T', ' ');
    await sleep(110);
  }
  out.sort((a, b) => a.ts - b.ts);
  const filtered = out.filter(r => r.ts >= sinceMs);
  fs.writeFileSync(cacheFile, JSON.stringify(filtered));
  return filtered;
}

async function fetchOkxSwap5m(instId, sinceMs, cacheFile) {
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const out = [];
  let after;
  let guard = 0;
  while (guard++ < 40000) {
    let url = `https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=5m&limit=100`;
    if (after) url += `&after=${after}`;
    const data = await fetchJsonRetry(url);
    if (!data || data.code !== '0' || !Array.isArray(data.data) || data.data.length === 0) break;
    for (const row of data.data) out.push({ ts: Number(row[0]), close: Number(row[4]) });
    const oldestTs = Number(data.data[data.data.length - 1][0]);
    if (oldestTs <= sinceMs) break;
    after = String(oldestTs);
    await sleep(130);
  }
  out.sort((a, b) => a.ts - b.ts);
  const filtered = out.filter(r => r.ts >= sinceMs);
  fs.writeFileSync(cacheFile, JSON.stringify(filtered));
  return filtered;
}

// 무기한선물은 8시간마다 펀딩비를 주고받는다. 우리는 숏이므로 양수면 받고 음수면 낸다.
async function fetchFundingHistory(instId, sinceMs, cacheFile) {
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const out = [];
  let after;
  let guard = 0;
  while (guard++ < 2000) {
    let url = `https://www.okx.com/api/v5/public/funding-rate-history?instId=${instId}&limit=100`;
    if (after) url += `&after=${after}`;
    const data = await fetchJsonRetry(url);
    if (!data || data.code !== '0' || !Array.isArray(data.data) || data.data.length === 0) break;
    for (const row of data.data) out.push({ ts: Number(row.fundingTime), rate: Number(row.fundingRate) });
    const oldestTs = Number(data.data[data.data.length - 1].fundingTime);
    if (oldestTs <= sinceMs) break;
    after = String(oldestTs);
    await sleep(130);
  }
  out.sort((a, b) => a.ts - b.ts);
  const filtered = out.filter(r => r.ts >= sinceMs);
  fs.writeFileSync(cacheFile, JSON.stringify(filtered));
  return filtered;
}

async function fetchFxDaily(startDate, endDate, cacheFile) {
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const url = `https://api.frankfurter.app/${startDate}..${endDate}?from=USD&to=KRW`;
  const data = await fetchJsonRetry(url);
  const rates = data.rates || {};
  const out = {};
  for (const d of Object.keys(rates)) out[d] = rates[d].KRW;
  fs.writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

// ---------------------------------------------------------------------------
// 데이터셋 구성
// ---------------------------------------------------------------------------
// 모든 코인을 공통 5분 격자에 올려두면, 파라미터 조합을 바꿔가며 여러 번
// 시뮬레이션할 때 매번 정렬/병합을 다시 하지 않아도 된다.
async function buildDataset(opts) {
  const yearsBack = opts.yearsBack;
  const log = opts.log || console.log;
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  const nowMs = Date.now();
  const sinceMs = nowMs - yearsBack * 365 * 86400000;
  log(`목표 기간: 최근 ${yearsBack}년 (5분봉) — ${new Date(sinceMs).toISOString().slice(0, 10)} ~ ${new Date(nowMs).toISOString().slice(0, 10)}`);

  const raw = {};
  const meta = [];
  for (const [name, upbitMarket, okxInst] of COINS) {
    process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] 수집 ${name} ... `);
    try {
      const tag = `${yearsBack}y`;
      const [krw, usdt, funding] = await Promise.all([
        fetchUpbit5m(upbitMarket, sinceMs, path.join(CACHE_DIR, `upbit_${name}_${tag}.json`)),
        fetchOkxSwap5m(okxInst, sinceMs, path.join(CACHE_DIR, `okx_${name}_${tag}.json`)),
        fetchFundingHistory(okxInst, sinceMs, path.join(CACHE_DIR, `funding_${name}_${tag}.json`)),
      ]);
      if (krw.length < 500 || usdt.length < 500) {
        log(`SKIP (부족: upbit ${krw.length} / okx ${usdt.length})`);
        continue;
      }
      raw[name] = { krw, usdt, funding };
      log(`OK (upbit ${krw.length} / okx ${usdt.length} / 펀딩 ${funding.length})`);
    } catch (e) {
      log(`SKIP (에러: ${e.message})`);
    }
  }

  const usedCoins = Object.keys(raw);
  if (!usedCoins.length) throw new Error('사용 가능한 코인이 없습니다');

  log('환율 수집 중...');
  const fx = await fetchFxDaily(
    new Date(sinceMs).toISOString().slice(0, 10),
    new Date(nowMs).toISOString().slice(0, 10),
    path.join(CACHE_DIR, `fx_${yearsBack}y.json`)
  );
  const fxDates = Object.keys(fx).sort();
  log(`환율 ${fxDates.length}일 확보`);

  function fxForTs(ts) {
    const d = new Date(ts).toISOString().slice(0, 10);
    let lo = 0, hi = fxDates.length - 1, ans = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fxDates[mid] <= d) { ans = fxDates[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    return ans ? fx[ans] : null;
  }

  // 1) 코인별 프리미엄 시계열 + 이동평균/표준편차 (여기서 딱 한 번 계산)
  log('프리미엄·이동평균 계산 중...');
  const perCoin = {};
  let gridMin = Infinity, gridMax = -Infinity;

  for (const name of usedCoins) {
    const { krw, usdt, funding } = raw[name];
    const krwByTs = new Map(krw.map(r => [r.ts, r]));
    const rows = [];
    let thinBars = 0;
    for (const u of usdt) {
      const kr = krwByTs.get(u.ts);
      if (kr === undefined) continue; // 같은 5분 슬롯에 양쪽 다 있을 때만
      const rate = fxForTs(u.ts);
      if (!rate) continue;
      const premium = ((kr.close / rate) / u.close - 1) * 100;
      const minValueKrw = POSITION_SIZE * rate * MIN_BAR_VALUE_MULTIPLE;
      const tradable = Number(kr.value) >= minValueKrw;
      if (!tradable) thinBars++;
      rows.push({ ts: u.ts, premium, tradable });
    }
    if (rows.length < MIN_DATA_POINTS) { log(`  ${name}: 매칭 부족(${rows.length}) — 제외`); continue; }

    // 슬라이딩 윈도우 평균/표준편차 (실거래 봇과 동일하게 "최근 864개 기록" 기준)
    const n = rows.length;
    const ma = new Float64Array(n);
    const sd = new Float64Array(n);
    let sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) {
      const p = rows[i].premium;
      sum += p; sumSq += p * p;
      if (i >= MAX_WINDOW) {
        const old = rows[i - MAX_WINDOW].premium;
        sum -= old; sumSq -= old * old;
      }
      const cnt = Math.min(i + 1, MAX_WINDOW);
      const m = sum / cnt;
      const varr = Math.max(0, sumSq / cnt - m * m);
      ma[i] = m;
      sd[i] = Math.sqrt(varr);
    }

    // 펀딩비 누적합 (구간 합을 O(log n)에 구하기 위한 준비)
    const fTs = new Float64Array(funding.length);
    const fCum = new Float64Array(funding.length + 1);
    for (let i = 0; i < funding.length; i++) {
      fTs[i] = funding[i].ts;
      fCum[i + 1] = fCum[i] + funding[i].rate;
    }

    perCoin[name] = {
      name, rows, ma, sd, fTs, fCum, thinBars,
      spreadPp: KORBIT_SPREAD_PCT[name] || 0,
      breakEven: breakEvenPp(name),
    };
    gridMin = Math.min(gridMin, rows[0].ts);
    gridMax = Math.max(gridMax, rows[n - 1].ts);
    meta.push({
      name, korbitSpreadPct: KORBIT_SPREAD_PCT[name], bars: n,
      from: new Date(rows[0].ts).toISOString().slice(0, 10),
      to: new Date(rows[n - 1].ts).toISOString().slice(0, 10),
      thinBars, thinPct: Math.round(thinBars / n * 1000) / 10,
      fundingEvents: funding.length,
    });
    log(`  ${name}: ${n}봉 (거래량 미달 ${thinBars} = ${(thinBars / n * 100).toFixed(1)}%)`);
  }

  const names = Object.keys(perCoin);
  if (!names.length) throw new Error('시뮬레이션할 코인이 없습니다');

  // 2) 공통 5분 격자에 인덱스 매핑
  const gridLen = Math.floor((gridMax - gridMin) / BAR_MS) + 1;
  log(`공통 격자: ${gridLen.toLocaleString('en-US')}칸 (${new Date(gridMin).toISOString().slice(0, 10)} ~ ${new Date(gridMax).toISOString().slice(0, 10)})`);

  for (const name of names) {
    const c = perCoin[name];
    const n = c.rows.length;
    const gi = new Int32Array(n);
    for (let i = 0; i < n; i++) gi[i] = Math.floor((c.rows[i].ts - gridMin) / BAR_MS);
    c.gridIdx = gi;
    c.premium = new Float64Array(n);
    c.tradable = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      c.premium[i] = c.rows[i].premium;
      c.tradable[i] = c.rows[i].tradable ? 1 : 0;
    }
    c.rows = null; // 메모리 절약: 이후로는 타입배열만 쓴다
  }

  return { gridMin, gridMax, gridLen, coins: names.map(n => perCoin[n]), meta };
}

// ---------------------------------------------------------------------------
// 시뮬레이션
// ---------------------------------------------------------------------------
function fundingBetween(c, t0, t1) {
  if (!c.fTs.length) return 0;
  // (t0, t1] 구간의 펀딩비 합
  const ub = (t) => {
    let lo = 0, hi = c.fTs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c.fTs[m] <= t) lo = m + 1; else hi = m; }
    return lo;
  };
  return POSITION_SIZE * (c.fCum[ub(t1)] - c.fCum[ub(t0)]);
}

/**
 * @param dataset buildDataset() 결과
 * @param params  DEFAULT_PARAMS를 덮어쓸 값
 * @param range   {fromRatio, toRatio} 전체 기간 중 사용할 구간 (train/validate 분할용)
 */
function simulate(dataset, params, range) {
  const P = Object.assign({}, DEFAULT_PARAMS, params || {});
  const r = range || { fromRatio: 0, toRatio: 1 };
  const startGrid = Math.floor(dataset.gridLen * r.fromRatio);
  const endGrid = Math.floor(dataset.gridLen * r.toRatio);

  const coins = dataset.coins;
  const K = coins.length;
  const ptr = new Int32Array(K);          // 코인별 현재 읽는 위치
  const openCoin = new Int8Array(K);      // 보유 여부
  const openTs = new Float64Array(K);
  const openPrem = new Float64Array(K);

  // 구간 시작 지점까지 포인터를 미리 밀어둔다 (평균/σ는 이미 전체 이력으로 계산돼 있음)
  for (let k = 0; k < K; k++) {
    const gi = coins[k].gridIdx;
    let i = 0;
    while (i < gi.length && gi[i] < startGrid) i++;
    ptr[k] = i;
  }

  const trades = [];
  let openCount = 0;
  let cumNet = 0, totalFunding = 0, totalSpread = 0, totalFees = 0;
  let blockedThin = 0, blockedEdge = 0, blockedSpreadGate = 0;
  const exitReasons = { SIGNAL: 0, STOP: 0, MAXHOLD: 0 };
  const equity = [];
  let lastDay = null;

  // 후보 버퍼 (매 틱 재사용)
  const candIdx = new Int32Array(K);
  const candZ = new Float64Array(K);

  for (let g = startGrid; g < endGrid; g++) {
    const ts = dataset.gridMin + g * BAR_MS;
    let candN = 0;

    // --- 이번 틱에 데이터가 있는 코인들 훑기 ---
    for (let k = 0; k < K; k++) {
      const c = coins[k];
      const gi = c.gridIdx;
      let i = ptr[k];
      if (i >= gi.length || gi[i] !== g) continue;
      ptr[k] = i + 1;

      if (i + 1 < MIN_DATA_POINTS) continue;

      const prem = c.premium[i];
      const ma = c.ma[i];
      const sd = c.sd[i];
      const tradable = c.tradable[i];
      if (sd > P.MAX_SIGMA_PERCENT) continue; // 변동성 가드

      // --- 보유 중이면 청산 판단 먼저 ---
      if (openCoin[k]) {
        if (!tradable) continue; // 못 파는 구간
        const move = prem - openPrem[k];
        const heldMs = ts - openTs[k];
        let reason = null;
        if (prem > ma + P.EXIT_SIGMA_OFFSET * sd) {
          // 본전도 못 넘겼는데 나가는 걸 막는 옵션
          if (!P.REQUIRE_PROFIT_EXIT || move >= c.breakEven) reason = 'SIGNAL';
        }
        if (!reason && move <= -P.STOP_LOSS_PP) reason = 'STOP';
        if (!reason && heldMs >= P.MAX_HOLD_DAYS * 86400000) reason = 'MAXHOLD';
        if (!reason) continue;

        const gross = POSITION_SIZE * move / 100;
        const fees = POSITION_SIZE * FEE_RATE * 2;
        const spread = POSITION_SIZE * c.spreadPp / 100;
        const fund = fundingBetween(c, openTs[k], ts);
        const net = gross - fees - spread + fund;

        cumNet += net; totalFunding += fund; totalSpread += spread; totalFees += fees;
        exitReasons[reason]++;
        trades.push({
          coin: c.name, entryTs: openTs[k], exitTs: ts,
          entryPremium: Math.round(openPrem[k] * 10000) / 10000,
          exitPremium: Math.round(prem * 10000) / 10000,
          movePp: Math.round(move * 10000) / 10000,
          holdHours: Math.round(heldMs / 3600000 * 100) / 100,
          gross: Math.round(gross * 100) / 100,
          fees: Math.round(fees * 100) / 100,
          spreadCost: Math.round(spread * 100) / 100,
          funding: Math.round(fund * 100) / 100,
          netProfit: Math.round(net * 100) / 100,
          exitReason: reason,
        });
        openCoin[k] = 0; openCount--;
        continue;
      }

      // --- 미보유면 진입 후보 판단 ---
      if (prem >= ma - P.ENTRY_SIGMA * sd) continue; // 진입선 위
      if (!tradable) { blockedThin++; continue; }

      // 실거래 봇은 실제 매수호가로 김프를 다시 계산해 그래도 진입선 아래일 때만 들어간다.
      // 종가를 중간값으로 보면 매수호가는 스프레드의 절반만큼 위에 있다.
      if (prem + c.spreadPp / 2 >= ma - P.ENTRY_SIGMA * sd) { blockedSpreadGate++; continue; }

      // 평균까지 회복해도 비용을 못 덮는 자리면 들어가지 않는다
      if (P.EDGE_MULTIPLE > 0 && (ma - prem) < c.breakEven * P.EDGE_MULTIPLE) { blockedEdge++; continue; }

      candIdx[candN] = k;
      candZ[candN] = sd > 0 ? (ma - prem) / sd : 0;
      candN++;
    }

    // --- 남은 자리를 저평가 정도가 큰 순서로 채운다 (실거래 봇과 동일) ---
    if (candN > 0 && openCount < P.MAX_POSITIONS) {
      const order = Array.from({ length: candN }, (_, i) => i).sort((a, b) => candZ[b] - candZ[a]);
      for (const oi of order) {
        if (openCount >= P.MAX_POSITIONS) break;
        const k = candIdx[oi];
        if (openCoin[k]) continue;
        const c = coins[k];
        let i = ptr[k] - 1;
        openCoin[k] = 1; openCount++;
        openTs[k] = ts; openPrem[k] = c.premium[i];
      }
    }

    if ((g & 0x3FF) === 0) {
      const day = new Date(ts).toISOString().slice(0, 10);
      if (day !== lastDay) {
        equity.push({ date: day, cum: Math.round(cumNet * 100) / 100, open: openCount });
        lastDay = day;
      }
    }
  }

  const total = trades.length;
  const wins = trades.filter(t => t.netProfit > 0).length;
  let peak = 0, maxDD = 0;
  for (const e of equity) { if (e.cum > peak) peak = e.cum; const dd = peak - e.cum; if (dd > maxDD) maxDD = dd; }

  const byCoin = {};
  for (const t of trades) {
    if (!byCoin[t.coin]) byCoin[t.coin] = { trades: 0, wins: 0, net: 0 };
    byCoin[t.coin].trades++;
    if (t.netProfit > 0) byCoin[t.coin].wins++;
    byCoin[t.coin].net += t.netProfit;
  }
  for (const k of Object.keys(byCoin)) byCoin[k].net = Math.round(byCoin[k].net * 100) / 100;

  const days = (endGrid - startGrid) * BAR_MS / 86400000;

  return {
    params: P,
    range: { from: new Date(dataset.gridMin + startGrid * BAR_MS).toISOString().slice(0, 10),
             to: new Date(dataset.gridMin + endGrid * BAR_MS).toISOString().slice(0, 10), days: Math.round(days) },
    totalTrades: total,
    wins,
    winRate: total ? Math.round(wins / total * 1000) / 10 : null,
    netProfit: Math.round(cumNet * 100) / 100,
    returnPct: Math.round(cumNet / SEED * 10000) / 100,
    annualizedPct: days > 0 ? Math.round(cumNet / SEED * 100 * (365 / days) * 100) / 100 : null,
    avgNetPerTrade: total ? Math.round(cumNet / total * 100) / 100 : null,
    avgHoldHours: total ? Math.round(trades.reduce((s, t) => s + t.holdHours, 0) / total * 100) / 100 : null,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    totalSpreadCost: Math.round(totalSpread * 100) / 100,
    totalFunding: Math.round(totalFunding * 100) / 100,
    exitReasons,
    blocked: { 거래량미달: blockedThin, 스프레드관문: blockedSpreadGate, 기대수익부족: blockedEdge },
    stillOpen: openCount,
    byCoin,
    trades,
    equity,
  };
}

module.exports = {
  OUT_DIR, CACHE_DIR, SEED, POSITION_SIZE, FEE_RATE, MAX_WINDOW, MIN_DATA_POINTS,
  MIN_BAR_VALUE_MULTIPLE, MAX_SPREAD_PERCENT, KORBIT_SPREAD_PCT, COINS, ALL_COINS,
  DEFAULT_PARAMS, breakEvenPp, buildDataset, simulate,
};
