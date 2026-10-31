// 전략 공용 정의 — 홈(index.html)과 상세 페이지가 같이 쓴다 (2026-10-31)
//   S: 전략별 데이터 파일·파싱(현재 잔액·추이·시드·날짜 붙은 잔액 기록), periodRets: 기간별 수익률(MTD · MoM · YTD · YoY)
//   LAB.mount(key): 상세 페이지 맨 위 요약 칸 바로 아래에 «기간별 수익률» 칸을 붙인다.
(function(){
  var RAW = 'https://raw.githubusercontent.com/huryoungkil-ops/kimchi-premium-dashboard/';
  var SEED = 10000;
  var cls = function(v){ return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; };
  var get = function(p){ return fetch(RAW + p + '?t=' + Math.floor(Date.now() / 120000), { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); };

  // ---- 기간별 수익률 (2026-10-31) — 카드에 MTD · MoM · YTD · YoY ----
  //   rows: 날짜가 붙은 잔액 기록 [시각, 잔액]. 시작 전 시점의 잔액은 시드로 본다.
  //   MTD·YTD 는 실제 값. 최근 1개월(MoM)·최근 1년(YoY)은 기록이 그 기간보다 짧으면 시작 후 하루 평균 복리 수익을 늘려 잡은 «추정» (기록 7일 미만이면 표시 안 함).
  var eqRows = function(name){ return function(d){ return (d.equity || []).filter(function(e){ return e.strategy === name; }).map(function(e){ return [e.day, e.equity]; }); }; };
  function periodRets(s){
    var r = s.r, seed = r.seed || SEED, tNow = Date.now();
    var toT = function(v){ return typeof v === 'number' ? v : Date.parse(String(v).length === 10 ? v + 'T09:00:00+09:00' : v); };
    var rows = (r.rows || []).map(function(x){ return [toT(x[0]), s.relRows ? seed + x[1] : x[1]]; }).filter(function(x){ return isFinite(x[0]) && x[1] != null && isFinite(x[1]); }).sort(function(a, b){ return a[0] - b[0]; });
    var t0 = toT(r.start); if (!isFinite(t0)) t0 = rows.length ? rows[0][0] : NaN;
    if (!isFinite(t0) || !isFinite(r.now) || !(seed > 0)) return null;
    var at = function(T){ if (T <= t0) return seed; var v = seed; rows.forEach(function(x){ if (x[0] <= T) v = x[1]; }); return v; };
    var days = (tNow - t0) / 864e5, tot = r.now / seed - 1, k = new Date(tNow + 9 * 3600e3);
    var mStart = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 9 * 3600e3, yStart = Date.UTC(k.getUTCFullYear(), 0, 1) - 9 * 3600e3;
    var trail = function(n){ if (days >= n) return { v: r.now / at(tNow - n * 864e5) - 1 }; if (days < 7) return { v: null, why: '기록 7일 후' }; return { v: Math.pow(1 + tot, n / days) - 1, est: true }; };
    return [['MTD', '이번 달', { v: r.now / at(mStart) - 1 }], ['MoM', '최근 1개월', trail(30)], ['YTD', '올해', { v: r.now / at(yStart) - 1 }], ['YoY', '최근 1년', trail(365)]];
  }
  function retsHtml(s){
    var p = periodRets(s); if (!p) return '';
    var f = function(v){ return v == null ? '—' : v > 9.99 ? '>+999%' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%'; };
    return '<div class="rets">' + p.map(function(x){ var o = x[2];
      return '<span title="' + x[1] + (o.est ? ' — 기록이 짧아 지금까지의 하루 평균 수익을 늘려 잡은 추정치' : '') + '">' + x[0] + '<b class="' + cls(o.v) + '">' + f(o.v) + '</b>' + (o.est ? '<i>(추정)</i>' : o.why ? '<i>' + o.why + '</i>' : '') + '</span>'; }).join('') + '</div>';
  }

  // ---- 전략별로 «현재 잔액·추이·보유·청산» 뽑기 ----
  var S = [
    { key: 'kimchi', live: true, emoji: '🌶️', name: '김치프리미엄 · 실전', ex: '빗썸 × Binance', file: 'paper-kimchi/kimchi.json', relRows: true, rows: function(d){ var c = 0; return (d.trades || []).filter(function(t){ return t.status === 'CLOSED' && t.exitTime; }).sort(function(a, b){ return a.exitTime < b.exitTime ? -1 : 1; }).map(function(t){ c += t.netProfit || 0; return [t.exitTime, c]; }); }, limit: 15, parse: function(d){
        var SEED = d.seedUsd || 10000;   // 2026-10-15 실전: 빗썸 원화 + Binance USDT 실제 입금액 (봇이 같이 올린다)
        var tr = (d.trades || []).filter(function(t){ return t.status === 'CLOSED'; }).sort(function(a, b){ return (a.exitTime || '') < (b.exitTime || '') ? -1 : 1; });
        var byDay = {}, cum = 0; tr.forEach(function(t){ cum += t.netProfit || 0; byDay[(t.exitTime || '').slice(0, 10)] = SEED + cum; });
        var series = Object.keys(byDay).sort().map(function(k){ return byDay[k]; });
        var live = d.live || {}, now = SEED + ((d.stats || {}).pnl || 0) + (live.totalUnrealized || 0);
        series.unshift(SEED); series.push(now);
        var first = (d.trades || []).map(function(t){ return t.entryTime; }).filter(Boolean).sort()[0];
        return { now: now, series: series, open: (d.stats || {}).open, closed: tr.length, wins: tr.filter(function(t){ return t.netProfit > 0; }).length, start: first, updatedAt: d.updatedAt, seed: SEED, seedFromBot: !!d.seedUsd };
    } },
    // 롱숏 실전 (Binance futures02, 시드 $4,000) — 실제 운영 중(mode live)일 때만 카드·표·합계에 넣는다. 모의 주문 중이면 페이퍼 롱숏 카드에 상태만 붙인다.
    { key: 'lslive', href: '/ls', liveOnly: true, live: true, emoji: '⚖️', name: '롱숏 모멘텀+캐리 · 실전', ex: 'Binance futures02', file: 'paper-ls-live/ls-live.json', rows: function(d){ return (d.equity || []).map(function(e){ return [e.day + 'T09:06:00+09:00', e.perf != null ? e.perf : e.equity]; }); }, limit: 30, parse: function(d){
        var seed = d.seedUsd || 4000, acct = d.account || {}, now = d.perf != null ? d.perf : acct.equity;
        var series = [seed].concat((d.equity || []).map(function(e){ return e.perf != null ? e.perf : e.equity; }), now != null ? [now] : []);
        var ord = (d.orders || []).filter(function(o){ return o.mode === 'live' && o.status === 'FILLED' && o.reduceOnly; });
        // BTC 1배 비교: 봇이 평가액과 같이 남기는 실제 BTC 마크가격 (날짜 기록 → 장중 기록 순서)
        var bt = (d.equity || []).filter(function(e){ return e.btc; }).concat((d.marks || []).filter(function(m){ return m.btc; }));
        var btcHold = bt.length > 1 ? seed * bt[bt.length - 1].btc / bt[0].btc : null;
        return { now: now, series: series, open: (d.positions || []).length, closed: ord.length, wins: 0, noWinRate: true, start: (d.equity || [])[0] && d.equity[0].day + 'T09:06:00+09:00', updatedAt: d.updatedAt, seed: seed, mode: d.mode, btcHold: btcHold };
    } },
    // USDT 웃돈 실전 (디지털엑스 원화 USDT, 2026-10-19~, 상한 3,000만 원) — 봇이 매시 live-usdtdx 에 올린다. 원화 장부라 지금 환율로 달러 환산해 다른 실전과 같이 보인다.
    //   시드는 «상한»(rules.MAX_KRW)이 아니라 «실제로 넣은 원금»이다 — 10-30 1,980만 원 증액 (상한 1,000만 → 3,000만).
    //   증액 전 장부 점에는 그 뒤에 넣은 원금을 더해 곡선이 계단처럼 튀지 않게 한다.
    { key: 'usdt', href: '/usdt', live: true, emoji: '💵', name: 'USDT 웃돈 · 실전', ex: '디지털엑스 원화', file: 'live-usdtdx/usdtdx.json', limit: 75, parse: function(d){
        var st = d.state || {}, L = st.last || {}, fx = L.fx, FLOWS = ((d.acct && d.acct.flows) || [{ at: '2026-10-19T10:39:04Z', krw: 10000000 }, { at: '2026-10-30T00:00:00Z', krw: 19804942 }]).map(function(f){
          // 원금 기록은 봇이 올린다 (acct.flows, 10-30~). 일일 장부 점은 07:46 KST 에 찍히므로 그 뒤 입금은 다음 날 점부터 들어간다.
          return { at: f.at, krw: f.krw, day: new Date(Date.parse(f.at) + (9 * 60 - 466 + 1440) * 60e3).toISOString().slice(0, 10) }; });
        var seedKrw = FLOWS.reduce(function(t, f){ return t + f.krw; }, 0), later = function(day){ return FLOWS.reduce(function(t, f){ return t + (day < f.day ? f.krw : 0); }, 0); };   // 하루 장부 점은 그날 아침에 찍혀, 10-30 점은 입금 전이다
        var done = st.done || [], realized = done.reduce(function(t, x){ return t + (x.pnl || 0); }, 0);
        var T = st.trade, unreal = st.mode === 'usdt' && T && L.usdt ? st.qty * L.usdt - T.amt * (st.qty / T.qty) : 0;
        // 10-30~: 봇이 올리는 디지털엑스 계좌 실제 잔고가 있으면 그것을 쓴다 (예치금 이자 포함). 없으면 원금 + 거래 손익.
        var B = d.balance, nowKrw = B && B.krw != null ? B.krw + (B.usdt || 0) * (L.usdt || 0) : seedKrw + realized + unreal;
        var eq = (d.equity || []).filter(function(e){ return e.strategy === 'usdtdx'; }).map(function(e){ var x = e.detail || {}; return x.krw != null ? x.krw + later(e.day) : null; }).filter(function(v){ return v != null; });
        var toUsd = function(k){ return fx ? k / fx : null; };
        var series = [seedKrw].concat(eq, [nowKrw]).map(toUsd);
        return { now: toUsd(nowKrw), series: series, open: st.mode === 'usdt' ? 1 : 0, closed: done.length, wins: done.filter(function(t){ return t.pnl > 0; }).length, start: st.createdAt, updatedAt: d.updatedAt, seed: toUsd(seedKrw), seedKrw: seedKrw, rows: (d.equity || []).filter(function(e){ return e.strategy === 'usdtdx' && e.detail && e.detail.krw != null; }).map(function(e){ return [e.day + 'T07:46:00+09:00', toUsd(e.detail.krw + later(e.day))]; }), liveMode: !!d.live };
    } },
    { key: 'turtle', emoji: '🐢', name: '터틀 트레이딩', ex: '빗썸 원화', file: 'paper-turtle/turtle.json', rows: function(d){ var st = d.state || {}; return (d.equity || []).filter(function(e){ return e.strategy === 'turtle'; }).map(function(e){ var x = e.detail || {}; return [e.day, x.usd != null ? Number(x.usd) : e.equity / (x.fx || st.fx0)]; }); }, limit: 30, parse: function(d){
        var st = d.state || {}, eq = (d.equity || []).filter(function(e){ return e.strategy === 'turtle'; });
        var val = function(e){ var x = e.detail || {}; return x.usd != null ? Number(x.usd) : e.equity / (x.fx || st.fx0); };
        var series = [st.seedUsd || SEED].concat(eq.map(val)), now = series[series.length - 1];
        var tr = (d.trades || []).filter(function(t){ return t.strategy === 'turtle'; });
        var cl = tr.filter(function(t){ return t.status === 'CLOSED'; });
        return { now: now, series: series, open: tr.filter(function(t){ return t.status === 'OPEN'; }).length, closed: cl.length, wins: cl.filter(function(t){ return t.pnl > 0; }).length, start: (d.equity || [])[0] && (d.equity[0].day + 'T00:00:00+09:00'), updatedAt: d.updatedAt, seed: st.seedUsd || SEED };
    } },
    { key: 'luna', emoji: '🌙', name: '제2의 루나를 찾아라', ex: '바이낸스 선물', file: 'paper-luna/luna.json', rows: eqRows('luna'), limit: 30, parse: function(d){
        var st = d.state || {}, Sh = st.short || { pos: {} }, Bk = st.btc || {};
        var pos = Object.keys(Sh.pos || {}).map(function(k){ return Sh.pos[k]; });
        var now = (Sh.cash || 0) + pos.reduce(function(s, p){ return s + p.qty * (p.entry - (p.lastMark || p.entry)) + (p.funding || 0); }, 0) + (Bk.cash || 0) + (Bk.qty || 0) * (st.btcPx || 0);
        var eq = (d.equity || []).filter(function(e){ return e.strategy === 'luna'; }).map(function(e){ return e.equity; });
        var series = [st.seed || SEED].concat(eq, [now]);
        var cl = (d.trades || []).filter(function(t){ return t.status === 'CLOSED'; });
        return { now: now, series: series, open: pos.length + (Bk.qty > 0 ? 1 : 0), closed: cl.length, wins: cl.filter(function(t){ return t.pnl > 0; }).length, start: st.createdAt || ((d.equity || [])[0] && d.equity[0].day + 'T09:05:00+09:00'), updatedAt: d.updatedAt, seed: st.seed || SEED };
    } },
    { key: 'core', emoji: '🧭', name: 'BTC 추세 코어', ex: '업비트 원화', file: 'paper-core/core.json', rows: eqRows('core'), limit: 30, parse: function(d){
        var st = d.state || {}, B = (st.books || {}).core || {}, fx = st.fx || st.fx0;
        var now = B.krw != null && fx ? B.krw / fx : null;
        var eq = (d.equity || []).filter(function(e){ return e.strategy === 'core'; }).map(function(e){ return e.equity; });
        var series = [st.seedUsd || SEED].concat(eq, now != null ? [now] : []);
        var tr = (d.trades || []).filter(function(t){ return t.strategy === 'core'; }), cl = tr.filter(function(t){ return t.status === 'CLOSED'; });
        return { now: now, series: series, open: tr.filter(function(t){ return t.status === 'OPEN'; }).length, closed: cl.length, wins: cl.filter(function(t){ return t.pnl > 0; }).length, start: st.createdAt, updatedAt: d.updatedAt, seed: st.seedUsd || SEED };
    } },
    { key: 'top3', emoji: '🔝', name: '주간 Top3', ex: '바이낸스 현물', file: 'paper-top3/top3.json', rows: eqRows('T1'), limit: 30, parse: function(d){
        var st = d.state || {}, B = (st.books || {}).T1 || {}, now = B.equity;   // 본 규칙 T1 장부 (비교 장부는 상세 페이지)
        var eq = (d.equity || []).filter(function(e){ return e.strategy === 'T1'; }).map(function(e){ return e.equity; });
        var series = [st.seedUsd || SEED].concat(eq, now != null ? [now] : []);
        var tr = (d.trades || []).filter(function(t){ return t.strategy === 'T1'; }), cl = tr.filter(function(t){ return t.status === 'CLOSED'; });
        return { now: now, series: series, open: (B.target || []).length, closed: cl.length, wins: cl.filter(function(t){ return t.pnl > 0; }).length, start: st.createdAt, updatedAt: d.updatedAt, seed: st.seedUsd || SEED };
    } },
    { key: 'listing', emoji: '📉', name: '상장 공매도', ex: '바이낸스 선물', file: 'paper-listing/listing.json', rows: eqRows('B14'), limit: 30, parse: function(d){
        var st = d.state || {}, B = (st.books || {}).B14 || {}, now = B.equity;   // 본 장부 B14 (비교 장부는 상세 페이지)
        var eq = (d.equity || []).filter(function(e){ return e.strategy === 'B14'; }).map(function(e){ return e.equity; });
        var series = [st.seedUsd || SEED].concat(eq, now != null ? [now] : []);
        var tr = (d.trades || []).filter(function(t){ return t.strategy === 'B14'; }), cl = tr.filter(function(t){ return t.status === 'CLOSED'; });
        return { now: now, series: series, open: (B.open || []).length, closed: cl.length, wins: cl.filter(function(t){ return t.pnl > 0; }).length, start: st.createdAt, updatedAt: d.updatedAt, seed: st.seedUsd || SEED };
    } },
    { key: 'mix', emoji: '💰', name: '백만장자 배분', ex: '세 전략 섞기', file: 'paper-mix/mix.json', rows: eqRows('mix'), limit: 30, parse: function(d){
        var st = d.state || {}, B = (st.books || {}).mix || {}, now = B.total;   // 본 장부 (비교 장부는 상세 페이지)
        var eq = (d.equity || []).filter(function(e){ return e.strategy === 'mix'; }).map(function(e){ return e.equity; });
        var series = [st.seedUsd || SEED].concat(eq, now != null ? [now] : []);
        return { now: now, series: series, open: null, closed: 0, wins: 0, start: st.createdAt, updatedAt: d.updatedAt, seed: st.seedUsd || SEED };
    } },
    { key: 'kimlab', emoji: '🧪', name: '김프 실험실 · BASE', ex: '빗썸 × Binance 페이퍼', file: 'paper-kimlab/kimlab.json', rows: function(d){ return (d.series || []).map(function(x){ return [x[0], x[1].BASE]; }); }, limit: 30, parse: function(d){
        var B = (d.books || {}).BASE || {}, seed = d.seedUsd || 20156.42, now = B.equity;   // 대조 장부 BASE (변형 6개는 상세 페이지)
        var series = [seed].concat((d.series || []).map(function(r){ return r[1].BASE; }).filter(function(v){ return v != null; }), now != null ? [now] : []);
        return { now: now, series: series, open: (B.open || []).length, closed: B.closed || 0, wins: B.wins || 0, start: d.startedAt, updatedAt: d.updatedAt, seed: seed };
    } },
    { key: 'gold', emoji: '🥇', name: '금 김프 재고', ex: 'KRX 금 × XAUUSDT', file: 'paper-gold/gold.json', rows: eqRows('GOLD_INV'), limit: 75, parse: function(d){
        var st = d.state || {}, N = st.now || {}, seed = st.seedUsd || 20156.42, now = N.net;
        var eq = (d.equity || []).filter(function(e){ return e.strategy === 'GOLD_INV'; }).map(function(e){ return e.equity; });
        var series = [seed].concat(eq, now != null ? [now] : []);
        var tr = (d.trades || []).filter(function(t){ return t.strategy === 'GOLD_INV'; }), cl = tr.filter(function(t){ return t.status === 'CLOSED'; });
        return { now: now, series: series, open: st.gr > 0 ? 1 : 0, closed: cl.length, wins: cl.filter(function(t){ return t.pnl > 0; }).length, start: st.startedAt, updatedAt: d.updatedAt, seed: seed };
    } },
    { key: 'crowd', emoji: '🐑', name: '군중 역행 · OI 추세', ex: 'X2 + OI_UP 합계', file: 'paper-crowd/crowd.json', rows: function(d){ var by = {}; (d.equity || []).forEach(function(e){ if (e.strategy === 'CROWD_X2' || e.strategy === 'OI_UP') by[e.day] = (by[e.day] || 0) + e.equity; }); return Object.keys(by).sort().map(function(k){ return [k, by[k]]; }); }, limit: 1560, parse: function(d){
        var st = d.state || {}, seed = 2 * (st.seed || 10000), by = {};
        (d.equity || []).forEach(function(e){ if (e.strategy === 'CROWD_X2' || e.strategy === 'OI_UP') { by[e.day] = (by[e.day] || 0) + e.equity; } });
        var days = Object.keys(by).sort(), series = [seed].concat(days.map(function(k){ return by[k]; }));
        var tr = (d.trades || []).filter(function(t){ return t.strategy === 'CROWD_X2' || t.strategy === 'OI_UP'; }), cl = tr.filter(function(t){ return t.status === 'CLOSED'; });
        return { now: series[series.length - 1], series: series, open: tr.filter(function(t){ return t.status === 'OPEN'; }).length, closed: cl.length, wins: cl.filter(function(t){ return t.pnl > 0; }).length, start: st.startedAt, updatedAt: d.updatedAt, seed: seed };
    } },
  ];

  function load(s){ return get(s.file).then(function(d){ s.r = s.parse(d); if (s.rows && !s.r.rows) { try { s.r.rows = s.rows(d); } catch (e) {} } }); }

  function mount(key){
    var s = S.filter(function(x){ return x.key === key; })[0], host = document.querySelector('.tiles');
    if (!s || !host) return;
    var jobs = [load(s)];
    if (key === 'kimchi') jobs.push(fetch('/ledger/config.json', { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }));
    Promise.all(jobs).then(function(res){
      var c = res[1]; if (key === 'kimchi' && s.r && !s.r.seedFromBot && c && c.seedUsd) s.r.seed = Number(c.seedUsd);
      var p = periodRets(s); if (!p) return;
      var k = new Date(Date.now() + 9 * 3600e3), mStart = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 9 * 3600e3, yStart = Date.UTC(k.getUTCFullYear(), 0, 1) - 9 * 3600e3;
      var days = Math.floor((Date.now() - Date.parse(s.r.start)) / 864e5);
      var f = function(v){ return v == null ? '—' : v > 9.99 ? '>+999%' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%'; };
      var sec = document.createElement('section');
      sec.className = 'tiles'; sec.setAttribute('aria-label', '기간별 수익률'); sec.style.marginTop = '12px';
      sec.innerHTML = p.map(function(x){ var o = x[2];
        var sub = o.est ? '추정 — ' + days + '일 기록의 하루 평균 수익을 복리로 늘림' : o.why ? '기록 7일이 쌓이면 표시' : '실제' + (x[0] === 'MTD' || x[0] === 'YTD' ? (Date.parse(s.r.start) > (x[0] === 'MTD' ? mStart : yStart) ? ' · 시작(' + new Date(Date.parse(s.r.start) + 9 * 3600e3).toISOString().slice(5, 10) + ') 이후' : '') : '');
        return '<div class="tile"><div class="label">' + x[0] + ' · ' + x[1] + '</div><div class="value ' + cls(o.v) + '">' + f(o.v) + (o.est ? ' <small style="font-size:12px;font-weight:500;color:var(--ink-soft)">(추정)</small>' : '') + '</div><div class="sub">' + sub + '</div></div>'; }).join('');
      host.parentNode.insertBefore(sec, host.nextSibling);
    }).catch(function(){});
  }

  window.LAB = { S: S, eqRows: eqRows, periodRets: periodRets, retsHtml: retsHtml, mount: mount };
})();
