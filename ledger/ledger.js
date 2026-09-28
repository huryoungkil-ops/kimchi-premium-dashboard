/* 거래소별 가상 잔액 원장 — 대시보드(브라우저)와 node 검증 스크립트가 같이 쓴다.

   시드 $10,000을 봇 가동일(config.start)에 코빗·OKX에 절반씩 넣었다고 보고,
   청산된 거래를 두 다리로 나눠 각 거래소에 쌓는다.
     - 코빗: 원화 계좌. 현물 q개를 사고 판다. 수수료 0 (2027-08-24까지 원화마켓 무료).
     - OKX : USDT 계좌. 같은 q개를 무기한선물로 숏. 수수료(진입·청산 0.02%씩)는 전부 여기.
     - q = 투입금($1,000) × 진입 환율 / 진입 국내가
   코빗 잔고는 원화로 들고 있으므로 달러 표시는 «지금 환율»로 환산한다. 그래서 총액에는
   전략 손익 외에 «환율 효과»가 섞이며, 이를 따로 떼어 보여준다.

   리밸런싱(이체)은 config.transfers 에 한 줄 추가한다:
     { "time": "2026-10-01T00:00:00Z", "from": "korbit", "usd": 538.49, "fx": 1356.04 }
   from 이 korbit 이면 코빗→OKX, okx 면 OKX→코빗. fx 는 이체 시점 환율.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KimchiLedger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

  // 한 거래의 환율·해외가. 봇이 직접 기록한 값이 있으면 그걸, 없으면 백필 파일 값을 쓴다.
  function legInputs(t, backfill) {
    var b = (backfill && backfill[t.id]) || {};
    var pe = Number(t.entryPremium) / 100;
    var efp = num(t.entryForeignPrice) || num(b.entryForeignPrice);
    var efx = num(t.entryFx) || num(b.entryFx) || (efp ? Number(t.entryPrice) / (efp * (1 + pe)) : null);
    var xfx = num(t.exitFx) || num(b.exitFx);
    var xfp = num(t.exitForeignPrice) || num(b.exitForeignPrice);
    if (!xfp && xfx && t.exitPrice) xfp = Number(t.exitPrice) / (xfx * (1 + Number(t.exitPremium) / 100));
    var q = efx ? Number(t.positionSize) * efx / Number(t.entryPrice) : null;
    return { q: q, entryFx: efx, entryFp: efp, exitFx: xfx, exitFp: xfp };
  }

  function fees(t) { return Number(t.feeEntry || 0) + Number(t.feeExit || 0); }

  // 청산된 거래 하나의 다리별 손익.
  //   korbitKrw : 코빗 원화 잔고가 실제로 늘어난 양 (원장용)
  //   korbitUsd : 진입 때 $1,000어치였던 코인이 청산 때 몇 달러가 됐나 — 김프가 달러 기준이라
  //               보유 중 환율 변화도 이 거래의 몫이다. 봇의 «손익 계산» 노드와 같은 공식.
  //   okxUsd    : 숏 손익 − 수수료(진입·청산 모두 OKX)
  function closedLegs(t, backfill) {
    var L = legInputs(t, backfill);
    if (!L.q || !L.entryFp || !L.exitFp || !L.exitFx) return null;
    var korbitKrw = L.q * (Number(t.exitPrice) - Number(t.entryPrice));
    var korbitUsd = L.q * Number(t.exitPrice) / L.exitFx - Number(t.positionSize);
    var okxUsd = L.q * (L.entryFp - L.exitFp) - fees(t);
    return { q: L.q, korbitKrw: korbitKrw, korbitUsd: korbitUsd, okxUsd: okxUsd, exitFx: L.exitFx,
             netUsd: korbitUsd + okxUsd };
  }

  /* 원장 계산.
     opts.asOf  : 이 시각까지의 거래·이체만 반영 (ISO, 생략하면 전부)
     opts.fx    : 달러 환산에 쓸 환율 (필수)
     opts.live  : { COIN: { bid, foreignPrice } } — 보유 포지션의 지금 값. 없으면 원가로 둔다.
  */
  function compute(cfg, trades, backfill, opts) {
    opts = opts || {};
    var asOf = opts.asOf ? new Date(opts.asOf).getTime() : Infinity;
    var fx = Number(opts.fx);
    var live = opts.live || {};
    var half = cfg.seedUsd / 2;

    var k = { cashKrw: half * cfg.startFx, holdKrw: 0, realizedKrw: 0 };
    var o = { cashUsd: half, unrealUsd: 0, realizedUsd: 0 };
    var strategyUsd = 0;      // 거래 손익 합 (봇 공식과 같은 달러 기준)
    var unrealStrategy = 0;   // 보유 포지션 평가손익 (지금 환율)
    // 나머지(총액 − 시드 − 전략 손익)가 환율 효과: 거래에 묶이지 않은 원화 예수금이 환율 따라 움직인 몫
    var closedCount = 0, wins = 0, open = [], missing = [];

    (cfg.transfers || []).forEach(function (tr) {
      if (new Date(tr.time).getTime() > asOf) return;
      var usd = Number(tr.usd), tfx = Number(tr.fx);
      if (tr.from === 'korbit') { k.cashKrw -= usd * tfx; o.cashUsd += usd; }
      else { o.cashUsd -= usd; k.cashKrw += usd * tfx; }
    });

    trades.forEach(function (t) {
      if (t.status === 'VOID') return;
      var te = new Date(t.entryTime).getTime();
      if (te > asOf) return;
      var closedByAsOf = t.status === 'CLOSED' && new Date(t.exitTime).getTime() <= asOf;

      if (closedByAsOf) {
        var legs = closedLegs(t, backfill);
        if (!legs) { missing.push(t.id); return; }
        k.cashKrw += legs.korbitKrw; k.realizedKrw += legs.korbitKrw;
        o.cashUsd += legs.okxUsd;    o.realizedUsd += legs.okxUsd;
        strategyUsd += legs.netUsd;
        closedCount++; if (legs.netUsd > 0) wins++;
        return;
      }

      // 보유 중 (asOf 기준): 코빗은 현금이 코인으로 바뀌어 있고, OKX는 진입 수수료만 빠져 있다
      var L = legInputs(t, backfill);
      if (!L.q || !L.entryFp) { missing.push(t.id); return; }
      var cost = L.q * Number(t.entryPrice);
      k.cashKrw -= cost;
      o.cashUsd -= Number(t.feeEntry || 0);
      strategyUsd -= Number(t.feeEntry || 0);
      var lv = live[t.coin];
      var bid = lv && num(lv.bid), fp = lv && num(lv.foreignPrice);
      var value = bid ? L.q * bid : cost;
      var unreal = fp ? L.q * (L.entryFp - fp) : 0;
      k.holdKrw += value;
      o.unrealUsd += unreal;
      var korbitUnreal = value / fx - Number(t.positionSize);
      unrealStrategy += korbitUnreal + unreal;
      open.push({ coin: t.coin, q: L.q, valueKrw: value, costKrw: cost, korbitUnrealUsd: korbitUnreal,
                  okxUnrealUsd: unreal, priced: !!(bid && fp) });
    });

    var korbitUsd = (k.cashKrw + k.holdKrw) / fx;
    var okxUsd = o.cashUsd + o.unrealUsd;
    var total = korbitUsd + okxUsd;
    var target = total / 2;
    return {
      fx: fx,
      korbit: { cashKrw: k.cashKrw, holdKrw: k.holdKrw, totalKrw: k.cashKrw + k.holdKrw,
                cashUsd: k.cashKrw / fx, holdUsd: k.holdKrw / fx, totalUsd: korbitUsd,
                realizedKrw: k.realizedKrw, share: korbitUsd / total * 100 },
      okx: { cashUsd: o.cashUsd, unrealUsd: o.unrealUsd, totalUsd: okxUsd,
             realizedUsd: o.realizedUsd, share: okxUsd / total * 100 },
      total: total,
      pnl: total - cfg.seedUsd,
      pnlPct: (total / cfg.seedUsd - 1) * 100,
      strategyUsd: strategyUsd + unrealStrategy,
      fxEffectUsd: total - cfg.seedUsd - strategyUsd - unrealStrategy,
      // 50:50으로 맞추려면: 양수면 코빗→OKX, 음수면 OKX→코빗
      rebalanceUsd: korbitUsd - target,
      closedCount: closedCount, wins: wins, open: open, missing: missing
    };
  }

  return { compute: compute, closedLegs: closedLegs, legInputs: legInputs };
});
