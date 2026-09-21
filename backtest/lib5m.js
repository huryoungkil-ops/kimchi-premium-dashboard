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

// 수수료 시나리오 (2026-09-12 조사 기준)
//
//   코빗은 2026-08-24 09시부터 2027-08-24 09시까지 원화마켓 전 종목 거래 수수료가
//   무료다(운영사 디지털엑스, 전 회원 자동 적용). 그 이전/이후의 유료 요율은 테이커 0.2%,
//   메이커 0%다. OKX 무기한선물은 일반 등급에서 메이커 0.02% / 테이커 0.05%.
//
//   이 전략은 본전 문턱이 얇아서 어느 요율을 쓰느냐로 결론이 뒤집힌다.
//   1년치 실측에서 기대 회귀폭이 종목당 0.17~0.25%p였는데,
//   왕복 0.30%면 12종목 전부 미달, 왕복 0.04%면 6종목이 통과한다.
//   그래서 고정하지 않고 시나리오로 둔다.
const FEE_SCENARIOS = {
  // 지금(코빗 무료 기간) 실제로 낼 수 있는 최선. 해외 다리는 지정가로 건다.
  // 무기한선물은 호가가 촘촘해 지정가 체결이 비교적 잘 된다.
  promo_maker: { label: '코빗무료 + OKX지정가', domestic: 0, foreign: 0.0002 },

  // 해외 다리도 시장가로 확실히 잡는 경우
  promo_taker: { label: '코빗무료 + OKX시장가', domestic: 0, foreign: 0.0005 },

  // 2027-08 무료 종료 후. 국내는 지정가(메이커 0%)를 전제로 한다.
  post_promo_maker: { label: '무료종료 + 양쪽지정가', domestic: 0, foreign: 0.0002 },

  // 무료 종료 후 국내를 시장가로 잡는 최악의 경우
  post_promo_taker: { label: '무료종료 + 양쪽시장가', domestic: 0.002, foreign: 0.0005 },

  // 참고: 이번 조사 전까지 쓰던 가정 (국내 0.1% 테이커 + 해외 0.05% 테이커)
  legacy: { label: '구 가정(왕복 0.30%)', domestic: 0.001, foreign: 0.0005 },
};
const DEFAULT_FEE_SCENARIO = 'promo_maker';

// 편도 수수료율 = 국내 + 해외
function feeRateOf(scenarioKey) {
  const s = FEE_SCENARIOS[scenarioKey || DEFAULT_FEE_SCENARIO];
  if (!s) throw new Error(`알 수 없는 수수료 시나리오: ${scenarioKey}`);
  return s.domestic + s.foreign;
}

const FEE_RATE = feeRateOf(DEFAULT_FEE_SCENARIO);

const WINDOW_DAYS = 3;        // 이동평균 기준 기간. 봉 간격이 바뀌어도 이 "기간"은 고정한다.
const BASE_BAR_MINUTES = 5;   // 거래소에서 받아오는 원본 봉 간격
const MAX_WINDOW = WINDOW_DAYS * 1440 / BASE_BAR_MINUTES; // 5분봉 기준 864개
const MIN_DATA_POINTS = 10;

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

// 거래 1건이 본전이 되려면 김프가 최소 이만큼(%p) 움직여야 한다.
// 왕복 수수료 + (시장가로 잡는다면) 호가 스프레드.
function breakEvenPp(coin, scenarioKey, paySpread) {
  const fee = feeRateOf(scenarioKey) * 2 * 100;
  const spread = (paySpread === false) ? 0 : (KORBIT_SPREAD_PCT[coin] || 0);
  return fee + spread;
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

  // 어느 수수료 체계로 계산할지 (FEE_SCENARIOS의 키)
  FEE_SCENARIO: DEFAULT_FEE_SCENARIO,

  // 국내 다리를 시장가로 잡으면 호가 스프레드를 그대로 부담한다.
  // false면 지정가로 스프레드를 피한다는 가정 — 체결 위험이 생기므로 낙관적인 상한이다.
  PAY_SPREAD: true,

  // 신호를 본 뒤 몇 봉 뒤에 체결되는가.
  // 봉 종가는 그 봉이 끝나야 알 수 있는 값이라, 같은 봉 종가에 체결시키면
  // 미래를 보고 매매하는 셈이 된다(look-ahead). 1이면 다음 봉 종가에 체결한다.
  // 0은 진단용이며, 실제로 낼 수 없는 성적이다.
  EXEC_DELAY_BARS: 1,

  // --- 펀딩비를 종목 선정에 반영 ---
  // 우리는 무기한선물 숏이라 펀딩비가 양수면 받고 음수면 낸다.
  // 96일 실측에서 대부분 종목이 연 +1~7%였지만 TRX는 연 -11.7%였다.
  // 며칠만 들고 있어도 펀딩비만으로 손실이 나는 종목은 애초에 거르는 게 낫다.
  //
  // 판단에는 "그 시점까지의 최근 펀딩비 평균"만 쓴다. 전체 기간 평균을 쓰면
  // 미래를 보고 종목을 고르는 셈이 된다.
  FUNDING_LOOKBACK: 21,      // 최근 몇 회(8시간 단위)를 볼 것인가. 21 = 7일
  MIN_FUNDING_8H: null,      // 이 값보다 낮으면 진입 제외. null이면 끔. 예: 0 = 음수 종목 배제
  FUNDING_RANK_WEIGHT: 0,    // 진입 순위에 펀딩비를 얼마나 반영할지. 0이면 끔

  MAX_SIGMA_PERCENT: 2.5, // σ가 이보다 크면 그 회차 신호 보류
  MAX_POSITIONS: 3,
  // --- 2단계 청산 ---
  // 오래 물린 포지션을 시장가로 던지면 회복될 것까지 손실로 확정시킨다.
  // 대신 일정 기간이 지나면 청산 조건만 느슨하게 풀어서, 손실이 충분히
  // 줄어든 순간에 빠져나오게 한다. 그래도 안 되면 마지막에 강제 정리한다.
  SOFT_HOLD_DAYS: null,     // 이 기간이 지나면 완화 조건을 켠다. null이면 끔
  SOFT_EXIT_LOSS_PP: 0,     // 완화 조건: 손실이 이 폭 이내로 줄면 청산 (0이면 본전 이상일 때)

  // 완화 청산을 «실제로 팔리는 가격» 기준으로 판정할 것인가.
  // 봉 종가는 대략 중간값이라, 실제 매도호가는 스프레드만큼 아래다. 종가로 판정하면
  // «손실이 줄었다»고 보고 나갔는데 실제로는 그만큼 더 손해를 확정하게 된다.
  // (2026-09-20 실거래에서 ADA가 판정 -0.22%p / 실제 -1.10%p로 나간 사례가 있다)
  // true면 스프레드를 뺀 값으로 판정한다. 손절·최대보유는 영향받지 않는다.
  SOFT_SPREAD_AWARE: false,

  MAX_HOLD_DAYS: 7,       // 넘기면 다음 거래 가능한 봉에서 강제 정리
  STOP_LOSS_PP: 5.0,      // 김프가 진입 시점보다 이만큼 더 내려가면 손절

  // --- 증거금 보호 손절 ---
  // 위 STOP_LOSS_PP는 '김프' 기준이라 청산 위험과는 무관하다.
  // 청산은 '가격'이 결정한다: 우리는 무기한선물 숏이라 코인 가격이 오르면 증거금이 깎이고,
  // 1배(증거금=명목)면 약 +100%에서 청산된다. 반대편 현물 이익은 다른 거래소에 있어
  // OKX 증거금을 지켜주지 못한다.
  // 가격이 이만큼 오르면 청산당하기 전에 양쪽 다리를 함께 닫는다.
  // 두 다리를 같이 닫으면 가격 변동은 서로 상쇄되므로 비용은 수수료와 남은 회귀분뿐이다.
  PRICE_STOP_PCT: null,   // 예: 50 = 진입가 대비 +50% 상승 시 청산. null이면 끔

  // --- 시장 국면 필터 ---
  // 3일 이동평균은 "평균이 고정돼 있다"고 가정하지만, 김프 수준 자체가 며칠씩
  // 내려가는 국면이 있다. 그때는 모든 종목이 동시에 자기 MA 아래로 내려가서
  // "이 종목이 싸다"는 신호가 정보를 잃는다 — 싼 게 아니라 전부 내려간 것이다.
  // 매 틱 전 종목의 (프리미엄-MA)/σ 평균(marketZ)을 재서, 이 값이 바닥 아래면
  // 그 회차 진입을 통째로 보류한다. null이면 끔.
  MARKET_Z_FLOOR: null,

  // --- 분할 진입(물타기) ---
  // null이면 신호가 뜬 순간 전액을 한 번에 넣는다(기존 동작).
  // 배열을 주면 계단식으로 나눠 넣는다. 예:
  //   [{sigma:1.0,fraction:1/3},{sigma:1.5,fraction:1/3},{sigma:2.0,fraction:1/3}]
  // 1차는 -1.0σ에서 1/3, 더 벌어져 -1.5σ에 닿으면 1/3 추가, -2.0σ에서 나머지.
  // 평단(가중평균 진입 김프)이 낮아지는 대신, 2·3차가 안 채워지면 그 자리는
  // 작은 크기로만 굴러간다. 수수료·스프레드는 명목금액 비례라 분할 자체는 공짜다.
  // 보유 기간 타이머(SOFT/MAXHOLD)는 1차 진입 시각부터 센다.
  TRANCHES: null,

  // --- 잔차 기반 진입 ---
  // true면 진입·청산 "신호"만 잔차(김프 − 매 시점 전종목 중앙값)로 판단한다.
  // 손익·수수료·스프레드·손절·보유시간은 그대로 실제 김프로 계산한다 —
  // 우리가 버는 것은 잔차가 아니라 그 종목의 실제 김프 변화이기 때문이다.
  // (잔차 자체를 벌려면 나머지 종목을 반대로 잡아 공통 요인을 헤지해야 하는데,
  //  그건 다리가 네 개인 다른 전략이다.)
  // 쓰기 전에 residual.js의 attachResidual(dataset)을 먼저 호출해야 한다.
  SIGNAL_RESIDUAL: false,

  // --- 진입 후보 순위 ---
  // 자리가 모자랄 때 누구를 먼저 넣을지 정하는 기준.
  //   'zscore'    (평균−김프)/σ — "이 종목 평소 대비 얼마나 싼가". 기존 방식
  //   'netEdge'   (평균−김프) − 본전문턱 — 자리 하나가 벌어올 기대 순이익(%p)
  //   'edgeRatio' (평균−김프) / 본전문턱 — 비용의 몇 배인가
  //
  // z-score는 비용을 모른다. 거래가 뜸한 종목은 마지막 체결가가 낡아 김프가 싸 보이는데
  // σ는 그만큼 커지지 않아서 z-score만 크게 나온다. 관문(EDGE_MULTIPLE)은 통과/탈락만
  // 보는 바닥이라 이걸 못 막는다 — 통과하기만 하면 순위 싸움에서 멀쩡한 종목을 밀어낸다.
  // 자리가 3~5개뿐이라 밀려난 자리는 그대로 손해다.
  //
  // 포지션 크기가 모두 같으므로, 자리당 기대 순이익이 큰 순서로 채우는 'netEdge'가
  // 목적함수에 맞는 기준이다.
  RANK_BY: 'zscore',

  // --- 진입 간격 제한 ---
  // 종목 간 김프 변화의 상관이 1일 기준 0.88이라, 김프가 빠지면 진입 신호가 전 종목에
  // 동시에 뜨고 자리가 같은 가격대에 한꺼번에 찬다(4자리 = 실효 베팅 1.1개).
  // 새 진입 뒤 이 시간 동안은 다음 새 진입을 받지 않는다. 공통 요인이 계속 빠지면
  // 다음 자리는 더 싼 가격에 들어가게 된다 — 종목 대신 «시간»으로 나누는 분산이다.
  // 0이면 끔. 물타기(TRANCHES)의 추가 체결은 새 진입이 아니므로 영향받지 않는다.
  ENTRY_GAP_HOURS: 0,
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
    const oldestMs = Date.parse(oldest.candle_date_time_utc + 'Z');
    if (oldestMs <= sinceMs) break;
    const nextTo = oldest.candle_date_time_utc.replace('T', ' ');
    if (nextTo === to) {   // 커서 정체 = 더 이상 과거 데이터가 없음
      console.warn("  " + market + ": 더 이상 과거로 가지 않아 중단 (" + new Date(oldestMs).toISOString().slice(0, 10) + "까지)");
      break;
    }
    to = nextTo;
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
    // 커서가 더 이상 과거로 가지 못하면 서버가 같은 구간을 반복해서 주는 것이다.
    // 그대로 두면 guard(40000회)까지 도느라 몇 시간씩 묶인다 (UNI 수집이 7시간 멈춘 원인).
    if (after !== undefined && Number(after) <= oldestTs) {
      console.warn("  " + instId + ": 더 이상 과거로 가지 않아 중단 (" + new Date(oldestTs).toISOString().slice(0, 10) + "까지)");
      break;
    }
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

  // 봉 간격. 5의 배수여야 한다(원본 5분봉을 묶어서 만들기 때문).
  // 간격이 바뀌어도 이동평균 기준 기간은 WINDOW_DAYS로 고정되므로, 봉 개수만 달라진다.
  const barMinutes = opts.barMinutes || BASE_BAR_MINUTES;
  if (barMinutes % BASE_BAR_MINUTES !== 0) {
    throw new Error(`barMinutes는 ${BASE_BAR_MINUTES}의 배수여야 합니다 (받은 값: ${barMinutes})`);
  }
  const groupSize = barMinutes / BASE_BAR_MINUTES; // 원본 몇 개를 한 봉으로 묶는가
  const barMs = barMinutes * 60000;
  const maxWindow = Math.round(WINDOW_DAYS * 1440 / barMinutes);
  if (barMinutes !== BASE_BAR_MINUTES) {
    log(`봉 간격 ${barMinutes}분 (원본 5분봉 ${groupSize}개씩 묶음, 이동평균 ${WINDOW_DAYS}일 = ${maxWindow}봉)`);
  }
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

    // (1) 원본 5분 슬롯에 국내·해외가 둘 다 있는 것만 남긴다
    const matched = [];
    for (const u of usdt) {
      const kr = krwByTs.get(u.ts);
      if (kr === undefined) continue;
      const rate = fxForTs(u.ts);
      if (!rate) continue;
      matched.push({ ts: u.ts, krwClose: kr.close, okxClose: u.close, rate, value: Number(kr.value) || 0 });
    }

    // (2) 봉 간격이 5분보다 크면 묶는다.
    //     가격은 구간의 마지막 봉 종가(= 그 구간의 종가), 거래대금은 구간 합계.
    let bars = matched;
    if (groupSize > 1) {
      const buckets = new Map();
      for (const m of matched) {
        const key = Math.floor(m.ts / barMs) * barMs;
        const b = buckets.get(key);
        if (!b) buckets.set(key, { ts: key, last: m, value: m.value });
        else { b.value += m.value; if (m.ts > b.last.ts) b.last = m; }
      }
      bars = Array.from(buckets.values()).sort((a, b) => a.ts - b.ts).map(b => ({
        ts: b.ts, krwClose: b.last.krwClose, okxClose: b.last.okxClose, rate: b.last.rate, value: b.value,
      }));
    }

    // (3) 프리미엄과 체결 가능 여부
    const rows = [];
    let thinBars = 0;
    for (const b of bars) {
      const premium = ((b.krwClose / b.rate) / b.okxClose - 1) * 100;
      const minValueKrw = POSITION_SIZE * b.rate * MIN_BAR_VALUE_MULTIPLE;
      const tradable = b.value >= minValueKrw;
      if (!tradable) thinBars++;
      rows.push({ ts: b.ts, premium, tradable, foreign: b.okxClose });
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
      if (i >= maxWindow) {
        const old = rows[i - maxWindow].premium;
        sum -= old; sumSq -= old * old;
      }
      const cnt = Math.min(i + 1, maxWindow);
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
  const gridLen = Math.floor((gridMax - gridMin) / barMs) + 1;
  log(`공통 격자: ${gridLen.toLocaleString('en-US')}칸 (${new Date(gridMin).toISOString().slice(0, 10)} ~ ${new Date(gridMax).toISOString().slice(0, 10)})`);

  for (const name of names) {
    const c = perCoin[name];
    const n = c.rows.length;
    const gi = new Int32Array(n);
    for (let i = 0; i < n; i++) gi[i] = Math.floor((c.rows[i].ts - gridMin) / barMs);
    c.gridIdx = gi;
    c.premium = new Float64Array(n);
    c.foreign = new Float64Array(n);   // OKX 무기한선물 가격(숏 다리)
    c.tradable = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      c.premium[i] = c.rows[i].premium;
      c.foreign[i] = c.rows[i].foreign;
      c.tradable[i] = c.rows[i].tradable ? 1 : 0;
    }
    c.rows = null; // 메모리 절약: 이후로는 타입배열만 쓴다
  }

  return { gridMin, gridMax, gridLen, barMs, barMinutes, maxWindow, coins: names.map(n => perCoin[n]), meta };
}

// ---------------------------------------------------------------------------
// 시뮬레이션
// ---------------------------------------------------------------------------
// ts 시점까지의 최근 lookback회 펀딩비 평균(8시간당). 데이터가 없으면 null.
// fCum은 누적합이라 구간 평균을 O(log n)에 구할 수 있다.
function trailingFunding(c, ts, lookback) {
  const m = c.fTs.length;
  if (!m) return null;
  // ts 이하인 마지막 펀딩 인덱스
  let lo = 0, hi = m;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (c.fTs[mid] <= ts) lo = mid + 1; else hi = mid; }
  const end = lo;                    // [0, end) 가 ts 이전
  if (end === 0) return null;        // 아직 펀딩 이력이 시작되기 전
  const start = Math.max(0, end - lookback);
  const cnt = end - start;
  if (cnt < 3) return null;          // 표본이 너무 적으면 판단하지 않는다
  return (c.fCum[end] - c.fCum[start]) / cnt;
}

function fundingBetween(c, t0, t1, size) {
  if (!c.fTs.length) return 0;
  // (t0, t1] 구간의 펀딩비 합
  const ub = (t) => {
    let lo = 0, hi = c.fTs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c.fTs[m] <= t) lo = m + 1; else hi = m; }
    return lo;
  };
  return (size === undefined ? POSITION_SIZE : size) * (c.fCum[ub(t1)] - c.fCum[ub(t0)]);
}

/**
 * @param dataset buildDataset() 결과
 * @param params  DEFAULT_PARAMS를 덮어쓸 값
 * @param range   {fromRatio, toRatio} 전체 기간 중 사용할 구간 (train/validate 분할용)
 */
function simulate(dataset, params, range) {
  const P = Object.assign({}, DEFAULT_PARAMS, params || {});
  // 신호를 잔차로 볼 것인가. 손익은 어느 쪽이든 실제 김프로 계산한다.
  const SIG = !!P.SIGNAL_RESIDUAL;
  const r = range || { fromRatio: 0, toRatio: 1 };
  const startGrid = Math.floor(dataset.gridLen * r.fromRatio);
  const endGrid = Math.floor(dataset.gridLen * r.toRatio);

  const BAR_MS = dataset.barMs;
  const coins = dataset.coins;
  const K = coins.length;

  // 이번 실행의 수수료 체계로 코인별 본전 문턱을 계산해둔다
  const DELAY = Math.max(0, P.EXEC_DELAY_BARS | 0);
  const feeRate = feeRateOf(P.FEE_SCENARIO);
  const breakEven = coins.map(c => breakEvenPp(c.name, P.FEE_SCENARIO, P.PAY_SPREAD));
  const ptr = new Int32Array(K);          // 코인별 현재 읽는 위치
  // 분할 진입을 지원하려면 코인별로 여러 체결을 들고 있어야 한다.
  // 종목이 10개 안팎이라 작은 배열로 둬도 비용이 없다.
  const tranches = [];                    // tranches[k] = [{ts, prem, size, foreign}, ...]
  for (let k = 0; k < K; k++) tranches.push([]);

  // 분할 계단. 지정하지 않으면 한 칸짜리 계단 = 기존의 전액 일괄 진입이다.
  const LADDER = P.TRANCHES || [{ sigma: P.ENTRY_SIGMA, fraction: 1 }];

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
  let blockedThin = 0, blockedEdge = 0, blockedSpreadGate = 0, blockedFunding = 0, blockedRegime = 0;
  // 순위 기준이 실제로 결과를 바꾸는 회차 수. 후보가 남은 자리보다 많을 때만 의미가 있다.
  let rankContested = 0, rankSkipped = 0;
  // 진입 간격 제한
  const GAP_MS = (P.ENTRY_GAP_HOURS || 0) * 3600000;
  let lastEntryTs = -Infinity;
  let blockedGap = 0;
  let addOns = 0;  // 2차 이후 추가 체결 횟수
  const exitReasons = { SIGNAL: 0, SOFT: 0, STOP: 0, MAXHOLD: 0, PRICESTOP: 0 };
  const equity = [];
  let lastDay = null;

  // 후보 버퍼 (매 틱 재사용)
  const candIdx = new Int32Array(K);
  const candZ = new Float64Array(K);

  for (let g = startGrid; g < endGrid; g++) {
    const ts = dataset.gridMin + g * BAR_MS;
    let candN = 0;
    let mzSum = 0, mzN = 0; // 이번 틱 전 종목의 (프리미엄-MA)/σ 평균 = 시장 국면

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
      if (sd > P.MAX_SIGMA_PERCENT) continue; // 변동성 가드 (실제 김프 기준)

      // 신호용 계열. 기본은 실제 김프 그대로, 잔차 모드면 잔차 계열을 쓴다.
      // 변동성 가드와 시장 국면(marketZ)은 실제 김프로 두는데, 그 둘은
      // "얼마나 위험한 구간인가"를 재는 것이라 신호 정의와 무관하기 때문이다.
      const sPrem = SIG ? c.resPremium[i] : prem;
      const sMa = SIG ? c.resMa[i] : ma;
      const sSd = SIG ? c.resSd[i] : sd;
      if (SIG && !(Number.isFinite(sPrem) && Number.isFinite(sMa) && sSd > 0)) continue;

      // 국면 측정은 보유 여부와 무관하게 값이 있는 종목 전부로 한다
      if (sd > 0) { mzSum += (prem - ma) / sd; mzN++; }

      // --- 보유 중이면 청산 판단 먼저 ---
      const tr = tranches[k];
      if (tr.length) {
        if (!tradable) continue; // 못 파는 구간

        // 여러 차수를 들고 있으면 평단은 금액 가중평균이다
        let totalSize = 0, wPrem = 0, wForeign = 0;
        for (let t = 0; t < tr.length; t++) {
          totalSize += tr[t].size; wPrem += tr[t].size * tr[t].prem; wForeign += tr[t].size * tr[t].foreign;
        }
        const avgPrem = wPrem / totalSize;
        const avgForeign = wForeign / totalSize;

        let move = prem - avgPrem;
        const heldMs = ts - tr[0].ts;   // 타이머는 1차 진입부터 센다
        let reason = null;

        // 증거금 보호가 최우선. 거래량이 말라도 이건 나가야 한다(청산당하는 것보다 낫다).
        if (P.PRICE_STOP_PCT !== null && avgForeign > 0) {
          const priceRise = (c.foreign[i] / avgForeign - 1) * 100;
          if (priceRise >= P.PRICE_STOP_PCT) reason = 'PRICESTOP';
        }

        if (!reason && sPrem > sMa + P.EXIT_SIGMA_OFFSET * sSd) {
          // 본전도 못 넘겼는데 나가는 걸 막는 옵션
          if (!P.REQUIRE_PROFIT_EXIT || move >= breakEven[k]) reason = 'SIGNAL';
        }
        // 완화 구간: 정규 청산선에는 못 미쳐도 손실이 충분히 줄었으면 나간다
        if (!reason && P.SOFT_HOLD_DAYS !== null
            && heldMs >= P.SOFT_HOLD_DAYS * 86400000) {
          // 실제로 팔리는 가격은 종가보다 스프레드만큼 아래다
          const softMove = P.SOFT_SPREAD_AWARE && P.PAY_SPREAD ? move - c.spreadPp : move;
          if (softMove >= -P.SOFT_EXIT_LOSS_PP) reason = 'SOFT';
        }
        if (!reason && move <= -P.STOP_LOSS_PP) reason = 'STOP';
        if (!reason && heldMs >= P.MAX_HOLD_DAYS * 86400000) reason = 'MAXHOLD';
        // --- 추가 진입(물타기) ---
        // 청산 사유가 없고 남은 차수가 있으면, 더 깊은 계단에 닿았는지 본다.
        // 실거래 봇과 같게 호가 스프레드 절반만큼 불리하게 잡고 판정한다.
        if (!reason && tr.length < LADDER.length) {
          const step = LADDER[tr.length];
          const halfSpreadAdd = P.PAY_SPREAD ? (c.spreadPp / 2) : 0;
          if (sPrem + halfSpreadAdd < sMa - step.sigma * sSd) {
            const ai = Math.min(i + DELAY, c.premium.length - 1);
            tr.push({ ts: ts + DELAY * BAR_MS, prem: c.premium[ai], size: POSITION_SIZE * step.fraction, foreign: c.foreign[ai] });
            addOns++;
          }
        }

        if (!reason) continue;

        // 신호는 이 봉에서 봤지만 실제 체결은 DELAY봉 뒤 가격으로 이뤄진다
        const xi = Math.min(i + DELAY, c.premium.length - 1);
        const execPrem = c.premium[xi];
        move = execPrem - avgPrem;
        const gross = totalSize * move / 100;
        const fees = totalSize * feeRate * 2;
        const spread = P.PAY_SPREAD ? (totalSize * c.spreadPp / 100) : 0;
        // 펀딩은 차수마다 진입 시각이 다르므로 각각 계산해 더한다
        let fund = 0;
        for (let t = 0; t < tr.length; t++) fund += fundingBetween(c, tr[t].ts, ts, tr[t].size);
        const net = gross - fees - spread + fund;

        cumNet += net; totalFunding += fund; totalSpread += spread; totalFees += fees;
        exitReasons[reason]++;
        trades.push({
          coin: c.name, entryTs: tr[0].ts, exitTs: ts,
          entryPremium: Math.round(avgPrem * 10000) / 10000,
          tranchesFilled: tr.length,
          sizeUsd: Math.round(totalSize * 100) / 100,
          exitPremium: Math.round(execPrem * 10000) / 10000,
          movePp: Math.round(move * 10000) / 10000,
          holdHours: Math.round(heldMs / 3600000 * 100) / 100,
          gross: Math.round(gross * 100) / 100,
          fees: Math.round(fees * 100) / 100,
          spreadCost: Math.round(spread * 100) / 100,
          funding: Math.round(fund * 100) / 100,
          netProfit: Math.round(net * 100) / 100,
          exitReason: reason,
          priceRisePct: avgForeign > 0 ? Math.round((c.foreign[xi] / avgForeign - 1) * 10000) / 100 : null,
        });
        tranches[k] = []; openCount--;
        continue;
      }

      // --- 미보유면 진입 후보 판단 ---
      if (sPrem >= sMa - LADDER[0].sigma * sSd) continue; // 진입선 위
      if (!tradable) { blockedThin++; continue; }

      // 실거래 봇은 실제 매수호가로 김프를 다시 계산해 그래도 진입선 아래일 때만 들어간다.
      // 종가를 중간값으로 보면 매수호가는 스프레드의 절반만큼 위에 있다.
      const halfSpread = P.PAY_SPREAD ? (c.spreadPp / 2) : 0;
      if (sPrem + halfSpread >= sMa - LADDER[0].sigma * sSd) { blockedSpreadGate++; continue; }

      // 평균까지 회복해도 비용을 못 덮는 자리면 들어가지 않는다
      if (P.EDGE_MULTIPLE > 0 && (sMa - sPrem) < breakEven[k] * P.EDGE_MULTIPLE) { blockedEdge++; continue; }

      // 펀딩비가 지속적으로 음수인 종목은 들고 있는 것만으로 손실이 난다
      const tf = (P.MIN_FUNDING_8H !== null || P.FUNDING_RANK_WEIGHT !== 0)
        ? trailingFunding(c, ts, P.FUNDING_LOOKBACK) : null;
      if (P.MIN_FUNDING_8H !== null && tf !== null && tf < P.MIN_FUNDING_8H) {
        blockedFunding++; continue;
      }

      candIdx[candN] = k;
      // 저평가 정도에 펀딩비 이득을 더해 순위를 매긴다.
      // tf는 8시간당 비율이라 %p 단위로 맞추려면 100을 곱한다.
      const gapPp = sMa - sPrem;               // 평균까지 회복하면 벌 폭(%p)
      let rank;
      if (P.RANK_BY === 'netEdge') {
        rank = gapPp - breakEven[k];           // 비용을 뺀 순기대이익
      } else if (P.RANK_BY === 'edgeRatio') {
        rank = breakEven[k] > 0 ? gapPp / breakEven[k] : gapPp;
      } else {
        rank = (sSd > 0 ? gapPp / sSd : 0);    // 기존 z-score
      }
      candZ[candN] = rank
        + (P.FUNDING_RANK_WEIGHT !== 0 && tf !== null ? P.FUNDING_RANK_WEIGHT * tf * 100 : 0);
      candN++;
    }

    // --- 시장 전체가 내려가는 국면이면 이번 회차 진입은 건너뛴다 ---
    if (P.MARKET_Z_FLOOR !== null && candN > 0 && mzN > 0) {
      if (mzSum / mzN < P.MARKET_Z_FLOOR) { blockedRegime += candN; candN = 0; }
    }

    // 후보가 남은 자리보다 많을 때만 순위 기준이 결과를 바꾼다
    if (candN > 0) {
      const free = P.MAX_POSITIONS - openCount;
      if (free > 0 && candN > free) { rankContested++; rankSkipped += candN - free; }
    }

    // --- 남은 자리를 저평가 정도가 큰 순서로 채운다 (실거래 봇과 동일) ---
    // 간격 제한이 켜져 있고 직전 진입에서 충분히 지나지 않았으면 이번 회차는 건너뛴다
    if (candN > 0 && GAP_MS > 0 && ts - lastEntryTs < GAP_MS && openCount < P.MAX_POSITIONS) {
      blockedGap += candN;
      candN = 0;
    }
    if (candN > 0 && openCount < P.MAX_POSITIONS) {
      const order = Array.from({ length: candN }, (_, i) => i).sort((a, b) => candZ[b] - candZ[a]);
      for (const oi of order) {
        if (openCount >= P.MAX_POSITIONS) break;
        // 간격 제한이 켜져 있으면 한 회차에 한 건만 받는다
        if (GAP_MS > 0 && ts - lastEntryTs < GAP_MS) break;
        const k = candIdx[oi];
        if (tranches[k].length) continue;
        const c = coins[k];
        const i = ptr[k] - 1;
        const ei = Math.min(i + DELAY, c.premium.length - 1);
        tranches[k].push({
          ts: ts + DELAY * BAR_MS,
          prem: c.premium[ei],          // 신호 다음 봉 종가에 체결
          size: POSITION_SIZE * LADDER[0].fraction,
          foreign: c.foreign[ei],
        });
        openCount++;
        lastEntryTs = ts;
      }
    }

    // 자본곡선은 하루 한 번 기록한다. (예전엔 1024봉마다 확인해서 3.5일에 한 번꼴로만
    // 찍혔고, 그 탓에 최대 낙폭이 0으로 나오는 문제가 있었다)
    const dayIdx = Math.floor(ts / 86400000);
    if (dayIdx !== lastDay) {
      // 청산 손익만 쌓으면 들고 있는 자리의 평가손실이 안 보인다. 동시에 여러 자리가
      // 같이 물리는 위험은 정확히 그 평가손실로 드러나므로 따로 계산해 둔다.
      let unreal = 0;
      for (let k = 0; k < K; k++) {
        const tr = tranches[k];
        if (!tr.length) continue;
        const idx = ptr[k] - 1;
        if (idx < 0) continue;
        const pr = coins[k].premium[idx];
        for (let t = 0; t < tr.length; t++) unreal += tr[t].size * (pr - tr[t].prem) / 100;
      }
      equity.push({
        date: new Date(ts).toISOString().slice(0, 10),
        cum: Math.round(cumNet * 100) / 100,
        mtm: Math.round((cumNet + unreal) * 100) / 100,
        open: openCount,
      });
      lastDay = dayIdx;
    }
  }

  const total = trades.length;
  const wins = trades.filter(t => t.netProfit > 0).length;
  let peak = 0, maxDD = 0;
  for (const e of equity) { if (e.cum > peak) peak = e.cum; const dd = peak - e.cum; if (dd > maxDD) maxDD = dd; }
  // 평가손익을 포함한 최대 낙폭 (하루 한 번 표본이라 장중 최저점은 놓칠 수 있다)
  let peakM = 0, maxDDM = 0;
  for (const e of equity) { if (e.mtm > peakM) peakM = e.mtm; const dd = peakM - e.mtm; if (dd > maxDDM) maxDDM = dd; }

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
    feeScenario: Object.assign({ key: P.FEE_SCENARIO, roundTripPct: Math.round(feeRate * 2 * 100 * 1000) / 1000 }, FEE_SCENARIOS[P.FEE_SCENARIO]),
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
    maxDrawdownMTM: Math.round(maxDDM * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    totalSpreadCost: Math.round(totalSpread * 100) / 100,
    totalFunding: Math.round(totalFunding * 100) / 100,
    exitReasons,
    blocked: { 거래량미달: blockedThin, 스프레드관문: blockedSpreadGate, 기대수익부족: blockedEdge, 펀딩비음수: blockedFunding, 하락국면: blockedRegime },
    rankBy: P.RANK_BY,
    blockedGap,
    rankContested,   // 후보가 자리보다 많았던 회차 (순위가 결과를 바꾼 횟수)
    rankSkipped,     // 그때 자리를 못 받고 밀려난 후보 누적
    addOns,
    avgTranches: total ? Math.round(trades.reduce((s, t) => s + t.tranchesFilled, 0) / total * 100) / 100 : null,
    avgSizeUsd: total ? Math.round(trades.reduce((s, t) => s + t.sizeUsd, 0) / total * 100) / 100 : null,
    stillOpen: openCount,
    byCoin,
    trades,
    equity,
  };
}

module.exports = {
  OUT_DIR, CACHE_DIR, SEED, POSITION_SIZE, FEE_RATE, MAX_WINDOW, MIN_DATA_POINTS,
  MIN_BAR_VALUE_MULTIPLE, MAX_SPREAD_PERCENT, KORBIT_SPREAD_PCT, COINS, ALL_COINS,
  DEFAULT_PARAMS, trailingFunding, FEE_SCENARIOS, DEFAULT_FEE_SCENARIO, feeRateOf, breakEvenPp, buildDataset, simulate,
};
