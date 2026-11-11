/* ─────────────────────────────────────────────────────────────
   종목별 성과 극장 (2026-11-12 사용자 요청 — «실전 종목들이 시간에 따라 어떤 성과를 내는지»)
   버튼을 누를 때만 paper-ls-hist/ls-history.json 을 한 번 받아 그린다 (일주일에 한두 번 볼 화면).
   자료는 카페24 ls-history.timer(매시 25분, 매매와 무관한 읽기 전용)가 실제 체결 + 1시간봉 종가 +
   실제 펀딩·수수료로 다시 계산한 값이다. 종목 손익을 다 더하면 실제 자기자본 변화와 맞는다.
   보기 4가지: 🏁 경주 다시보기 · 📈 다리별 누적 · 🗓️ 날마다 · 🔎 종목 카드
   ───────────────────────────────────────────────────────────── */
(function () {
  var URL_ = 'https://raw.githubusercontent.com/huryoungkil-ops/kimchi-premium-dashboard/paper-ls-hist/ls-history.json';
  var root = document.getElementById('lp');
  if (!root) return;

  var css = document.createElement('style');
  css.textContent = [
    ':root{--lp-long:#2f6fb0;--lp-short:#c0701c}',
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--lp-long:#4f8cd6;--lp-short:#cf7d2e}}',
    ':root[data-theme="dark"]{--lp-long:#4f8cd6;--lp-short:#cf7d2e}',
    '.lp{border:1px solid var(--line);border-radius:var(--radius);background:var(--bg-raised);box-shadow:var(--shadow);margin:0 0 18px;overflow:hidden}',
    '.lp-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:14px 16px}',
    '.lp-btn{font:600 14px var(--font-body);background:var(--ink);color:var(--bg-raised);border:0;border-radius:999px;padding:9px 18px;cursor:pointer}',
    '.lp-btn:focus-visible,.lp-tab:focus-visible,.lp-ctl button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    '.lp-intro{font-size:12.5px;color:var(--ink-soft);flex:1 1 260px;line-height:1.5}',
    '.lp-body{display:none;padding:0 16px 18px;border-top:1px solid var(--line-soft)}',
    '.lp.on .lp-body{display:block}',
    '.lp-story{font-size:14px;line-height:1.7;margin:14px 0 10px}',
    '.lp-story b{font-family:var(--font-mono);font-weight:600}',
    '.lp-pos{color:var(--good)} .lp-neg{color:var(--danger)}',
    '.lp-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:0 0 14px}',
    '.lp-tile{border:1px solid var(--line-soft);border-radius:10px;padding:8px 10px;background:var(--bg)}',
    '.lp-tile .k{font-size:11.5px;color:var(--ink-soft)} .lp-tile .v{font:600 17px var(--font-mono);margin-top:2px} .lp-tile .s{font-size:11px;color:var(--ink-soft);margin-top:2px}',
    '.lp-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 12px}',
    '.lp-tab{font:600 13px var(--font-body);background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:6px 13px;cursor:pointer}',
    '.lp-tab[aria-selected="true"]{background:var(--accent-soft);border-color:var(--accent)}',
    '.lp-note{font-size:12px;color:var(--ink-soft);line-height:1.6;margin:8px 0 0}',
    '.lp-key{display:inline-flex;align-items:center;gap:5px;margin-right:12px;font-size:12px;color:var(--ink-soft)}',
    '.lp-key i{display:inline-block;width:12px;height:3px;border-radius:2px}',
    '.lp-key i.sq{width:10px;height:10px;border-radius:3px}',
    /* 경주 */
    '.lp-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 10px}',
    '.lp-ctl button{font:600 13px var(--font-body);background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:5px 11px;cursor:pointer}',
    '.lp-ctl button.on{background:var(--accent-soft);border-color:var(--accent)}',
    '.lp-ctl input[type=range]{flex:1 1 200px;accent-color:var(--accent)}',
    '.lp-clock{font:600 15px var(--font-mono);min-width:120px}',
    '.lp-score{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--ink-soft);margin:0 0 8px}',
    '.lp-score b{font-family:var(--font-mono);font-weight:600}',
    '.lp-race{position:relative;border:1px solid var(--line-soft);border-radius:10px;background:var(--bg);overflow:hidden}',
    '.lp-row{position:absolute;left:0;right:0;height:26px;display:grid;grid-template-columns:96px 1fr 78px;align-items:center;gap:6px;padding:0 8px;transition:top .45s ease,opacity .35s}',
    '.lp-name{font:600 12.5px var(--font-mono);white-space:nowrap;display:flex;align-items:center;gap:5px}',
    '.lp-tag{font:500 10px var(--font-body);padding:0 5px;border-radius:5px;border:1.5px solid;color:var(--ink-soft)}',
    '.lp-tag.L{border-color:var(--lp-long)} .lp-tag.S{border-color:var(--lp-short)} .lp-tag.N{border-color:var(--line)}',
    '.lp-track{position:relative;height:16px}',
    '.lp-track:before{content:"";position:absolute;left:50%;top:-6px;bottom:-6px;border-left:1px solid var(--line)}',
    '.lp-bar{position:absolute;top:0;height:16px;transition:width .35s linear,left .35s linear}',
    '.lp-bar.p{background:var(--good);border-radius:0 4px 4px 0} .lp-bar.n{background:var(--danger);border-radius:4px 0 0 4px}',
    '.lp-val{font:500 12px var(--font-mono);text-align:right}',
    '.lp-ticker{list-style:none;margin:8px 0 0;padding:0;font-size:12.5px;min-height:44px}',
    '.lp-ticker li{padding:3px 0;border-bottom:1px dashed var(--line-soft)}',
    '.lp-ticker time{font:500 11px var(--font-mono);color:var(--ink-soft);margin-right:6px}',
    /* 선 그림 */
    '.lp-chart{position:relative}',
    '.lp-chart svg{display:block;width:100%;overflow:visible}',
    '.lp-tip{position:absolute;pointer-events:none;background:var(--bg-raised);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.55;box-shadow:var(--shadow);display:none;white-space:nowrap;z-index:2}',
    '.lp-tip b{font-family:var(--font-mono);font-weight:600}',
    '.lp-h3{font:600 14px var(--font-body);margin:18px 0 4px}',
    /* 히트맵 */
    '.lp-heat-wrap{overflow-x:auto;border:1px solid var(--line-soft);border-radius:10px}',
    '.lp-heat{border-collapse:separate;border-spacing:2px;font-size:11px;background:var(--bg-raised)}',
    '.lp-heat th{font:500 10.5px var(--font-mono);color:var(--ink-soft);padding:2px 3px;white-space:nowrap}',
    '.lp-heat th.c{position:sticky;left:0;background:var(--bg-raised);text-align:left;font:600 11.5px var(--font-mono);color:var(--ink);z-index:1}',
    '.lp-heat td{width:22px;min-width:22px;height:20px;border-radius:4px;background:var(--bg)}',
    '.lp-heat td.L{box-shadow:inset 0 -3px 0 var(--lp-long)} .lp-heat td.S{box-shadow:inset 0 -3px 0 var(--lp-short)}',
    '.lp-heat td.t{width:auto;background:none;font:600 11.5px var(--font-mono);padding:0 6px;text-align:right;white-space:nowrap}',
    '.lp-scale{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-soft);margin:8px 0 0}',
    '.lp-scale span.g{display:inline-block;width:120px;height:10px;border-radius:5px;background:linear-gradient(90deg,var(--danger),var(--bg),var(--good))}',
    /* 카드 */
    '.lp-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}',
    '.lp-card{border:1px solid var(--line);border-radius:12px;padding:10px 11px;background:var(--bg-raised)}',
    '.lp-card .top{display:flex;justify-content:space-between;align-items:baseline;gap:6px}',
    '.lp-card .coin{font:700 15px var(--font-mono)} .lp-card .tot{font:600 15px var(--font-mono)}',
    '.lp-card .meta{font-size:11.5px;color:var(--ink-soft);margin:2px 0 4px}',
    '.lp-card svg{display:block;width:100%;height:58px}',
    '.lp-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}',
    '.lp-chip{font:500 10.5px var(--font-mono);padding:1px 6px;border-radius:6px;background:var(--bg);border:1px solid var(--line-soft)}',
    '.lp-sort{font:500 12px var(--font-body);margin:0 0 10px;color:var(--ink-soft)} .lp-sort select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:3px 6px}',
    '.lp-tbl{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px} .lp-tbl th,.lp-tbl td{padding:4px 6px;border-bottom:1px solid var(--line-soft);text-align:right} .lp-tbl th:first-child,.lp-tbl td:first-child{text-align:left}',
    '@media (max-width:560px){.lp-row{grid-template-columns:78px 1fr 64px;padding:0 4px}.lp-name{font-size:11.5px}}',
  ].join('\n');
  document.head.appendChild(css);

  root.className = 'lp';
  root.innerHTML =
    '<div class="lp-head"><button class="lp-btn" id="lp-btn" type="button" aria-expanded="false">📊 종목별 성과 펼치기</button>' +
    '<span class="lp-intro">지금까지 거쳐 간 모든 실전 종목이 시간에 따라 얼마를 벌고 잃었는지 보여 줍니다. 버튼을 누를 때만 자료를 한 번 받습니다. 자료는 한 시간마다 새로 계산됩니다.</span></div>' +
    '<div class="lp-body" id="lp-body"><p class="lp-note" id="lp-load">불러오는 중…</p></div>';

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var money = function (v, d) { if (v == null || isNaN(v)) return '—'; d = d == null ? (Math.abs(v) >= 100 ? 0 : 2) : d; var s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); return (v > 0.004 ? '+$' : v < -0.004 ? '−$' : '$') + s; };
  var cls = function (v) { return v > 0.004 ? 'lp-pos' : v < -0.004 ? 'lp-neg' : ''; };
  var kst = function (ms, withH) { var d = new Date(ms + 9 * 3600e3); var s = (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); return withH ? s + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':00' : s; };
  var sideOf = function (n) { return n > 0 ? 'L' : n < 0 ? 'S' : 'N'; };
  var SIDE = { L: '롱', S: '숏', N: '없음' };

  var D = null, M = null, loaded = false, view = 'race';
  var btn = $('lp-btn');
  btn.addEventListener('click', function () {
    var on = !root.classList.contains('on');
    root.classList.toggle('on', on);
    btn.setAttribute('aria-expanded', on);
    btn.textContent = on ? '📊 접기' : '📊 종목별 성과 펼치기';
    if (!on) { stopPlay(); return; }
    if (loaded) return;
    fetch(URL_ + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { D = j; M = model(j); loaded = true; render(); })
      .catch(function (e) { $('lp-load').textContent = '자료를 못 받았습니다 (' + e.message + '). 잠시 뒤 다시 눌러 주세요.'; root.classList.remove('on'); btn.textContent = '📊 다시 시도'; });
  });

  /* ── 자료 → 모형 ── */
  function model(j) {
    var N = j.n, H = j.step, coins = j.coins.map(function (c) {
      var tot = c.price.map(function (p, i) { return Math.round((p + c.fund[i] + c.fee[i]) * 100) / 100; });
      var held = { L: 0, S: 0 };
      c.notional.forEach(function (n) { if (n > 0) held.L++; else if (n < 0) held.S++; });
      return { coin: c.coin, sym: c.sym, tot: tot, price: c.price, fund: c.fund, fee: c.fee, not: c.notional, held: held, last: tot[N - 1] };
    });
    var total = new Array(N).fill(0), legL = new Array(N).fill(0), legS = new Array(N).fill(0), price = new Array(N).fill(0), fund = new Array(N).fill(0), fee = new Array(N).fill(0);
    coins.forEach(function (c) {
      var aL = 0, aS = 0;
      for (var h = 0; h < N; h++) {
        var d = c.tot[h] - (h ? c.tot[h - 1] : 0);
        var s = (h ? c.not[h - 1] : 0) || c.not[h];       // 그 시간 동안 들고 있던 쪽 (그 시간에 새로 열었으면 연 쪽)
        if (s > 0) aL += d; else if (s < 0) aS += d; else if (d) { if (c.not[h] >= 0) aL += d; else aS += d; }
        legL[h] += aL; legS[h] += aS; total[h] += c.tot[h]; price[h] += c.price[h]; fund[h] += c.fund[h]; fee[h] += c.fee[h];
      }
    });
    var maxAbs = 1; coins.forEach(function (c) { c.tot.forEach(function (v) { if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v); }); });
    // 거래일(UTC 0시 = KST 09시) 마다 마지막 시간봉
    var days = [], lastIdx = {};
    for (var h = 0; h < N; h++) { var k = new Date(j.t0 + h * H).toISOString().slice(0, 10); if (!(k in lastIdx)) days.push(k); lastIdx[k] = h; }
    var tEnd = function (h) { return j.t0 + (h + 1) * H; };
    var events = (j.events || []).map(function (e) { return { t: Date.parse(e.at), coin: String(e.sym || '').replace(/USDT$/, '').replace(/^1000/, ''), msg: e.msg, kind: e.kind }; });
    return { N: N, coins: coins, total: total, legL: legL, legS: legS, price: price, fund: fund, fee: fee, maxAbs: maxAbs, days: days, lastIdx: lastIdx, tEnd: tEnd, events: events };
  }

  /* ── 큰 틀 ── */
  function render() {
    var N = M.N, last = N - 1, w7 = Math.max(0, N - 1 - 168);
    var sorted = M.coins.slice().sort(function (a, b) { return b.last - a.last; });
    var best = sorted[0], worst = sorted[sorted.length - 1];
    var wk = M.coins.map(function (c) { return { c: c, d: c.tot[last] - c.tot[w7] }; }).sort(function (a, b) { return b.d - a.d; });
    var tot7 = M.total[last] - M.total[w7];
    var span = (N / 24).toFixed(1);
    var nowHeld = M.coins.filter(function (c) { return c.not[last] !== 0; }).length;
    var story = '실전을 시작한 지 <b>' + span + '일</b>, 거쳐 간 종목은 <b>' + M.coins.length + '개</b>(지금 보유 ' + nowHeld + '개)입니다. ' +
      '종목 손익을 모두 더하면 <b class="' + cls(M.total[last]) + '">' + money(M.total[last]) + '</b>' +
      '(가격 <b class="' + cls(M.price[last]) + '">' + money(M.price[last]) + '</b> · 펀딩 <b class="' + cls(M.fund[last]) + '">' + money(M.fund[last]) + '</b> · 수수료 <b class="' + cls(M.fee[last]) + '">' + money(M.fee[last]) + '</b>)입니다. ' +
      '가장 많이 번 종목은 <b>' + esc(best.coin) + '</b> <b class="lp-pos">' + money(best.last) + '</b>, 가장 많이 잃은 종목은 <b>' + esc(worst.coin) + '</b> <b class="lp-neg">' + money(worst.last) + '</b>입니다.<br>' +
      '<span style="color:var(--ink-soft)">최근 7일:</span> 전체 <b class="' + cls(tot7) + '">' + money(tot7) + '</b> · 가장 좋았던 <b>' + esc(wk[0].c.coin) + '</b> <b class="' + cls(wk[0].d) + '">' + money(wk[0].d) + '</b> · 가장 나빴던 <b>' + esc(wk[wk.length - 1].c.coin) + '</b> <b class="' + cls(wk[wk.length - 1].d) + '">' + money(wk[wk.length - 1].d) + '</b>';
    var tile = function (k, v, s) { return '<div class="lp-tile"><div class="k">' + k + '</div><div class="v ' + cls(v) + '">' + money(v) + '</div><div class="s">' + s + '</div></div>'; };
    var rc = D.recon || {};
    $('lp-body').innerHTML =
      '<p class="lp-story">' + story + '</p>' +
      '<div class="lp-tiles">' + tile('롱 다리 (모멘텀 쪽)', M.legL[last], '오르는 코인을 산 쪽') + tile('숏 다리 (캐리 쪽)', M.legS[last], '과열 코인을 판 쪽') +
      tile('펀딩 누적', M.fund[last], '받은 자릿세 − 낸 자릿세') + tile('수수료 누적', M.fee[last], '시장가 체결 비용') + '</div>' +
      '<div class="lp-tabs" role="tablist">' +
      [['race', '🏁 경주 다시보기'], ['legs', '📈 다리별 누적'], ['heat', '🗓️ 날마다'], ['cards', '🔎 종목 카드']].map(function (t) {
        return '<button class="lp-tab" role="tab" type="button" data-v="' + t[0] + '" aria-selected="' + (t[0] === view) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="lp-view"></div>' +
      '<p class="lp-note">자료 계산 ' + esc(new Date(D.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })) + ' · 실제 체결가와 1시간봉 종가로 다시 계산했고, 펀딩·수수료는 거래소에서 받은 실제 금액입니다' +
      (D.incomeOk ? '' : ' (이번엔 펀딩·수수료를 못 받아 0 으로 둠)') + '. 맞춰 보기: 종목 합계 ' + money(M.total[last]) + ' ↔ 실제 자기자본 변화 ' + money(rc.equityChange) + ' (그날 09시 기준이라 몇 달러 차이 날 수 있음). 롱·숏 다리는 그 시간에 들고 있던 쪽으로 나눴습니다.</p>';
    Array.prototype.forEach.call(root.querySelectorAll('.lp-tab'), function (b) {
      b.addEventListener('click', function () { view = b.getAttribute('data-v'); stopPlay(); Array.prototype.forEach.call(root.querySelectorAll('.lp-tab'), function (x) { x.setAttribute('aria-selected', x === b); }); show(); });
    });
    show();
  }
  function show() { ({ race: viewRace, legs: viewLegs, heat: viewHeat, cards: viewCards })[view]($('lp-view')); }

  /* ── 🏁 경주 다시보기 ── */
  var timer = null, cur = 0;
  function stopPlay() { if (timer) { clearInterval(timer); timer = null; } var p = $('lp-play'); if (p) { p.textContent = '▶ 재생'; p.classList.remove('on'); } }
  function viewRace(el) {
    var ROWS = Math.min(14, M.coins.length), RH = 28;
    el.innerHTML =
      '<div class="lp-ctl"><button type="button" id="lp-play">▶ 재생</button>' +
      '<button type="button" data-sp="2">보통</button><button type="button" data-sp="6" class="on">빠르게</button><button type="button" data-sp="24">아주 빠르게</button>' +
      '<span class="lp-clock" id="lp-clock"></span><input type="range" id="lp-scrub" min="0" max="' + (M.N - 1) + '" value="0" aria-label="시각 고르기"></div>' +
      '<div class="lp-score" id="lp-score"></div>' +
      '<div class="lp-race" id="lp-race" style="height:' + (ROWS * RH + 8) + 'px"></div>' +
      '<div style="margin-top:8px"><span class="lp-key"><i class="sq" style="background:var(--good)"></i>번 돈</span><span class="lp-key"><i class="sq" style="background:var(--danger)"></i>잃은 돈</span>' +
      '<span class="lp-key"><span class="lp-tag L">롱</span>그 시각 롱 보유</span><span class="lp-key"><span class="lp-tag S">숏</span>숏 보유</span><span class="lp-key"><span class="lp-tag N">끝</span>이미 정리</span></div>' +
      '<p class="lp-note">그 시각까지 쌓인 종목별 손익(가격+펀딩+수수료)입니다. 가장 많이 번 7개와 가장 많이 잃은 7개를 보여 줍니다. 막대 길이는 처음부터 끝까지 같은 눈금입니다.</p>' +
      '<ul class="lp-ticker" id="lp-tick" aria-live="polite"></ul>';
    var race = $('lp-race'), rows = {}, speed = 6;
    M.coins.forEach(function (c) {
      var r = document.createElement('div'); r.className = 'lp-row'; r.style.opacity = 0; r.style.top = (ROWS * RH) + 'px';
      r.innerHTML = '<span class="lp-name"><span class="lp-tag N">끝</span>' + esc(c.coin) + '</span><span class="lp-track"><span class="lp-bar"></span></span><span class="lp-val"></span>';
      race.appendChild(r); rows[c.sym] = r;
    });
    function draw(h) {
      cur = h; $('lp-scrub').value = h;
      $('lp-clock').textContent = kst(M.tEnd(h), true);
      $('lp-score').innerHTML = '전체 <b class="' + cls(M.total[h]) + '">' + money(M.total[h]) + '</b> · 롱 다리 <b class="' + cls(M.legL[h]) + '">' + money(M.legL[h]) + '</b> · 숏 다리 <b class="' + cls(M.legS[h]) + '">' + money(M.legS[h]) + '</b> · 펀딩 <b class="' + cls(M.fund[h]) + '">' + money(M.fund[h]) + '</b>';
      var live = M.coins.filter(function (c) { return c.tot[h] !== 0 || c.not[h] !== 0; }).sort(function (a, b) { return b.tot[h] - a.tot[h]; });
      var pick = live.length <= ROWS ? live : live.slice(0, ROWS / 2).concat(live.slice(live.length - ROWS / 2));
      var on = {}; pick.forEach(function (c, i) { on[c.sym] = i; });
      M.coins.forEach(function (c) {
        var r = rows[c.sym], i = on[c.sym];
        if (i == null) { r.style.opacity = 0; r.style.pointerEvents = 'none'; return; }
        var v = c.tot[h], w = Math.min(50, Math.abs(v) / M.maxAbs * 50), s = sideOf(c.not[h]);
        r.style.opacity = 1; r.style.top = (4 + i * RH) + 'px'; r.style.pointerEvents = '';
        var bar = r.querySelector('.lp-bar'); bar.className = 'lp-bar ' + (v >= 0 ? 'p' : 'n');
        bar.style.left = (v >= 0 ? 50 : 50 - w) + '%'; bar.style.width = w + '%';
        var tag = r.querySelector('.lp-tag'); tag.className = 'lp-tag ' + s; tag.textContent = s === 'N' ? '끝' : SIDE[s];
        var val = r.querySelector('.lp-val'); val.textContent = money(v); val.className = 'lp-val ' + cls(v);
        r.title = c.coin + ' · ' + kst(M.tEnd(h), true) + ' · ' + (s === 'N' ? '보유 없음' : SIDE[s] + ' $' + Math.abs(c.not[h])) + ' · 누적 ' + money(v) + ' (가격 ' + money(c.price[h]) + ' · 펀딩 ' + money(c.fund[h]) + ' · 수수료 ' + money(c.fee[h]) + ')';
      });
      var t = M.tEnd(h), ev = M.events.filter(function (e) { return e.t <= t; }).slice(-3).reverse();
      $('lp-tick').innerHTML = ev.length ? ev.map(function (e) { return '<li><time>' + kst(e.t) + ' ' + new Date(e.t).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }) + '</time>⚠️ ' + esc(e.msg) + '</li>'; }).join('') : '<li style="color:var(--ink-soft)">이 시각까지 손절·정지 사건 없음</li>';
    }
    $('lp-scrub').addEventListener('input', function () { stopPlay(); draw(+this.value); });
    Array.prototype.forEach.call(el.querySelectorAll('[data-sp]'), function (b) {
      b.addEventListener('click', function () { speed = +b.getAttribute('data-sp'); Array.prototype.forEach.call(el.querySelectorAll('[data-sp]'), function (x) { x.classList.toggle('on', x === b); }); });
    });
    $('lp-play').addEventListener('click', function () {
      if (timer) { stopPlay(); return; }
      if (cur >= M.N - 1) cur = 0;
      this.textContent = '⏸ 멈춤'; this.classList.add('on');
      timer = setInterval(function () { var n = Math.min(M.N - 1, cur + speed); draw(n); if (n >= M.N - 1) stopPlay(); }, 380);
    });
    draw(M.N - 1);
  }

  /* ── 선 그림 (공통) ── */
  function lineChart(el, series, opt) {
    var W = Math.max(300, el.clientWidth || 600), Hh = opt.h || 260, P = { l: 52, r: 74, t: 10, b: 24 };
    var N = M.N, lo = 0, hi = 0;
    series.forEach(function (s) { s.v.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; }); });
    var pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    var X = function (i) { return P.l + i / (N - 1) * (W - P.l - P.r); }, Y = function (v) { return P.t + (hi - v) / (hi - lo) * (Hh - P.t - P.b); };
    var step = Math.pow(10, Math.floor(Math.log10((hi - lo) / 4))), nice = [1, 2, 5, 10].map(function (m) { return m * step; }).filter(function (s) { return (hi - lo) / s <= 6; })[0] || step * 10;
    var g = '';
    for (var v = Math.ceil(lo / nice) * nice; v <= hi; v += nice) g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line-soft)" stroke-width="1"/><text x="' + (P.l - 6) + '" y="' + (Y(v) + 3.5) + '" text-anchor="end" font-size="10.5" fill="var(--ink-soft)" font-family="var(--font-mono)">' + money(v, 0) + '</text>';
    g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="var(--ink-soft)" stroke-width="1"/>';
    M.days.forEach(function (d, k) { if (k % Math.ceil(M.days.length / 7)) return; var i = M.lastIdx[d] - 23 < 0 ? 0 : M.lastIdx[d] - 23; g += '<text x="' + X(i) + '" y="' + (Hh - 6) + '" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)" font-family="var(--font-mono)">' + d.slice(5).replace('-', '/') + '</text>'; });
    var labels = series.map(function (s) { return { s: s, y: Y(s.v[N - 1]) }; }).sort(function (a, b) { return a.y - b.y; });
    for (var k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 13) labels[k].y = labels[k - 1].y + 13;
    series.forEach(function (s) {
      var d = s.v.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join('');
      g += '<path d="' + d + '" fill="none" stroke="' + s.c + '" stroke-width="' + (s.w || 2) + '" stroke-linejoin="round"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>';
    });
    labels.forEach(function (l) { g += '<text x="' + (W - P.r + 6) + '" y="' + (l.y + 3.5) + '" font-size="11" fill="var(--ink)">' + esc(l.s.n) + '</text>'; });
    g += '<line id="' + opt.id + '-x" y1="' + P.t + '" y2="' + (Hh - P.b) + '" stroke="var(--ink-soft)" stroke-width="1" style="display:none"/>';
    series.forEach(function (s, k) { g += '<circle id="' + opt.id + '-d' + k + '" r="4" fill="' + s.c + '" stroke="var(--bg-raised)" stroke-width="2" style="display:none"/>'; });
    el.innerHTML = '<div class="lp-chart"><svg viewBox="0 0 ' + W + ' ' + Hh + '" height="' + Hh + '" role="img" aria-label="' + esc(opt.label) + '">' + g +
      '<rect x="' + P.l + '" y="0" width="' + (W - P.l - P.r) + '" height="' + Hh + '" fill="transparent" id="' + opt.id + '-hit"/></svg><div class="lp-tip" id="' + opt.id + '-tip"></div></div>';
    var hit = $(opt.id + '-hit'), tip = $(opt.id + '-tip'), xl = $(opt.id + '-x'), svg = hit.ownerSVGElement;
    function move(ev) {
      var b = svg.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - b.left, sx = px * W / b.width;
      var i = Math.max(0, Math.min(N - 1, Math.round((sx - P.l) / (W - P.l - P.r) * (N - 1))));
      xl.setAttribute('x1', X(i)); xl.setAttribute('x2', X(i)); xl.style.display = '';
      series.forEach(function (s, k) { var c = $(opt.id + '-d' + k); c.setAttribute('cx', X(i)); c.setAttribute('cy', Y(s.v[i])); c.style.display = ''; });
      tip.innerHTML = '<div style="color:var(--ink-soft)">' + kst(M.tEnd(i), true) + '</div>' + series.map(function (s) { return '<div><span style="display:inline-block;width:10px;height:3px;background:' + s.c + ';vertical-align:middle;margin-right:5px"></span>' + esc(s.n) + ' <b class="' + cls(s.v[i]) + '">' + money(s.v[i]) + '</b></div>'; }).join('');
      tip.style.display = 'block';
      var left = X(i) * b.width / W; tip.style.left = Math.min(b.width - tip.offsetWidth - 4, Math.max(0, left + 12)) + 'px'; tip.style.top = '8px';
    }
    function out() { tip.style.display = 'none'; xl.style.display = 'none'; series.forEach(function (s, k) { $(opt.id + '-d' + k).style.display = 'none'; }); }
    hit.addEventListener('mousemove', move); hit.addEventListener('touchmove', move, { passive: true }); hit.addEventListener('mouseleave', out); hit.addEventListener('touchend', out);
  }

  /* ── 📈 다리별 누적 ── */
  function viewLegs(el) {
    el.innerHTML = '<div><span class="lp-key"><i style="background:var(--ink);height:3px"></i>전체</span><span class="lp-key"><i style="background:var(--lp-long)"></i>롱 다리</span><span class="lp-key"><i style="background:var(--lp-short)"></i>숏 다리</span></div>' +
      '<div id="lp-c1"></div>' +
      '<p class="lp-note">이 전략은 롱 다리(오르는 코인)와 숏 다리(펀딩이 높은 과열 코인)가 서로 다른 날 버는 것을 노립니다. 두 선이 반대로 움직이면 «헤지가 일하는 중», 같이 내려가면 둘 다 틀린 구간입니다.</p>' +
      '<div class="lp-h3">손익은 어디서 왔나 — 가격 · 펀딩(캐리) · 수수료</div>' +
      '<div><span class="lp-key"><i style="background:var(--ink)"></i>가격 손익</span><span class="lp-key"><i style="background:var(--accent)"></i>펀딩 누적</span><span class="lp-key"><i style="background:var(--ink-soft)"></i>수수료 누적 (점선)</span></div>' +
      '<div id="lp-c2"></div>' +
      '<p class="lp-note">펀딩 선이 꾸준히 오르면 «캐리»가 계획대로 자릿세를 거둬들이는 중입니다. 가격 선은 모멘텀과 숏 과열 판단이 맞았는지를 보여 줍니다.</p>';
    var draw = function () {
      lineChart($('lp-c1'), [{ n: '전체', v: M.total, c: 'var(--ink)', w: 2.6 }, { n: '롱 다리', v: M.legL, c: 'var(--lp-long)' }, { n: '숏 다리', v: M.legS, c: 'var(--lp-short)' }], { id: 'lpc1', h: 280, label: '롱·숏 다리별 누적 손익' });
      lineChart($('lp-c2'), [{ n: '가격', v: M.price, c: 'var(--ink)' }, { n: '펀딩', v: M.fund, c: 'var(--accent)' }, { n: '수수료', v: M.fee, c: 'var(--ink-soft)', dash: '5 4' }], { id: 'lpc2', h: 220, label: '가격·펀딩·수수료 누적' });
    };
    draw(); onResize(draw);
  }
  var resizeFn = null, rt = null;
  function onResize(fn) { resizeFn = fn; }
  window.addEventListener('resize', function () { if (!resizeFn || !loaded || !root.classList.contains('on') || (view !== 'legs')) return; clearTimeout(rt); rt = setTimeout(function () { if (view === 'legs' && $('lp-c1')) resizeFn(); }, 200); });

  /* ── 🗓️ 날마다 ── */
  function viewHeat(el) {
    var days = M.days, rows = M.coins.slice().sort(function (a, b) { return b.last - a.last; });
    var cells = rows.map(function (c) {
      return days.map(function (d, k) {
        var i = M.lastIdx[d], p = k ? M.lastIdx[days[k - 1]] : -1, v = c.tot[i] - (p >= 0 ? c.tot[p] : 0);
        var s = 0; for (var h = p + 1; h <= i; h++) if (c.not[h]) { s = c.not[h]; }
        return { v: Math.round(v * 100) / 100, s: sideOf(s), n: s };
      });
    });
    var mx = 1; cells.forEach(function (r) { r.forEach(function (x) { if (Math.abs(x.v) > mx) mx = Math.abs(x.v); }); });
    var col = function (v) { if (Math.abs(v) < 0.005) return ''; var p = Math.round(Math.sqrt(Math.abs(v) / mx) * 85 + 12); return 'background:color-mix(in srgb,' + (v > 0 ? 'var(--good)' : 'var(--danger)') + ' ' + p + '%,var(--bg))'; };
    var h = '<div class="lp-heat-wrap"><table class="lp-heat"><thead><tr><th class="c">종목</th>' + days.map(function (d) { return '<th>' + d.slice(5).replace('-', '/') + '</th>'; }).join('') + '<th>합계</th></tr></thead><tbody>';
    rows.forEach(function (c, r) {
      h += '<tr><th class="c">' + esc(c.coin) + '</th>' + cells[r].map(function (x, k) {
        return '<td class="' + (x.s === 'N' ? '' : x.s) + '" style="' + col(x.v) + '" title="' + esc(c.coin + ' · ' + days[k].slice(5).replace('-', '/') + ' 09시부터 하루 · ' + (x.s === 'N' ? '보유 없음' : SIDE[x.s] + ' 약 $' + Math.abs(x.n)) + ' · ' + money(x.v)) + '"></td>';
      }).join('') + '<td class="t ' + cls(c.last) + '">' + money(c.last) + '</td></tr>';
    });
    h += '</tbody></table></div>' +
      '<div class="lp-scale">하루 손익 <span>' + money(-mx, 0) + '</span><span class="g"></span><span>' + money(mx, 0) + '</span>' +
      '<span class="lp-key" style="margin-left:10px"><i style="background:var(--lp-long)"></i>밑줄 = 롱으로 보유</span><span class="lp-key"><i style="background:var(--lp-short)"></i>숏으로 보유</span></div>' +
      '<p class="lp-note">한 칸 = 한 종목의 하루(09시~다음 날 09시) 손익. 위에서부터 많이 번 순서입니다. 칸에 손가락이나 마우스를 올리면 금액이 나옵니다. 밑줄 색이 바뀌는 곳이 롱↔숏을 갈아탄 날입니다.</p>';
    el.innerHTML = h;
  }

  /* ── 🔎 종목 카드 ── */
  var sortKey = 'last';
  function viewCards(el) {
    var N = M.N, w7 = Math.max(0, N - 1 - 168);
    var keyOf = { last: function (c) { return c.last; }, week: function (c) { return c.tot[N - 1] - c.tot[w7]; }, fund: function (c) { return c.fund[N - 1]; }, held: function (c) { return c.held.L + c.held.S; } };
    var list = M.coins.slice().sort(function (a, b) { return keyOf[sortKey](b) - keyOf[sortKey](a); });
    var lo = 0, hi = 0; M.coins.forEach(function (c) { c.tot.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; }); });
    var W = 200, Hh = 58, X = function (i) { return i / (N - 1) * W; }, Y = function (v) { return 3 + (hi - v) / (hi - lo || 1) * (Hh - 6); };
    var card = function (c) {
      var bands = '', st = 0;
      for (var i = 1; i <= N; i++) {
        if (i === N || sideOf(c.not[i]) !== sideOf(c.not[st])) {
          var s = sideOf(c.not[st]); if (s !== 'N') bands += '<rect x="' + X(st).toFixed(1) + '" y="0" width="' + Math.max(1, X(i) - X(st)).toFixed(1) + '" height="' + Hh + '" fill="var(--lp-' + (s === 'L' ? 'long' : 'short') + ')" opacity=".16"/>';
          st = i;
        }
      }
      var path = c.tot.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join('');
      var d7 = c.tot[N - 1] - c.tot[w7], s = sideOf(c.not[N - 1]);
      return '<div class="lp-card"><div class="top"><span class="coin">' + esc(c.coin) + '</span><span class="tot ' + cls(c.last) + '">' + money(c.last) + '</span></div>' +
        '<div class="meta">' + (s === 'N' ? '지금 보유 없음' : '지금 ' + SIDE[s] + ' $' + Math.abs(c.not[N - 1])) + ' · 롱 ' + (c.held.L / 24).toFixed(1) + '일 · 숏 ' + (c.held.S / 24).toFixed(1) + '일 · 7일 <span class="' + cls(d7) + '">' + money(d7) + '</span></div>' +
        '<svg viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none" role="img" aria-label="' + esc(c.coin) + ' 누적 손익">' + bands +
        '<line x1="0" x2="' + W + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>' +
        '<path d="' + path + '" fill="none" stroke="var(--ink)" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>' +
        '<div class="lp-chips"><span class="lp-chip">가격 <span class="' + cls(c.price[N - 1]) + '">' + money(c.price[N - 1]) + '</span></span><span class="lp-chip">펀딩 <span class="' + cls(c.fund[N - 1]) + '">' + money(c.fund[N - 1]) + '</span></span><span class="lp-chip">수수료 <span class="' + cls(c.fee[N - 1]) + '">' + money(c.fee[N - 1]) + '</span></span></div></div>';
    };
    el.innerHTML = '<div class="lp-sort">정렬 <select id="lp-sortsel"><option value="last">누적 손익</option><option value="week">최근 7일</option><option value="fund">펀딩 수입</option><option value="held">보유 기간</option></select>' +
      '<span class="lp-key" style="margin-left:12px"><i class="sq" style="background:var(--lp-long);opacity:.5"></i>롱 보유 구간</span><span class="lp-key"><i class="sq" style="background:var(--lp-short);opacity:.5"></i>숏 보유 구간</span></div>' +
      '<div class="lp-cards">' + list.map(card).join('') + '</div>' +
      '<p class="lp-note">모든 카드의 세로 눈금이 같아서(' + money(lo, 0) + ' ~ ' + money(hi, 0) + ') 선의 높이를 그대로 견줄 수 있습니다. 배경 색 띠는 그 종목을 들고 있던 기간입니다.</p>' +
      '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:13px">표로 보기</summary><table class="lp-tbl"><thead><tr><th>종목</th><th>누적</th><th>가격</th><th>펀딩</th><th>수수료</th><th>최근 7일</th><th>롱·숏 일수</th></tr></thead><tbody>' +
      list.map(function (c) { var d7 = c.tot[N - 1] - c.tot[w7]; return '<tr><td>' + esc(c.coin) + '</td><td class="' + cls(c.last) + '">' + money(c.last) + '</td><td>' + money(c.price[N - 1]) + '</td><td>' + money(c.fund[N - 1]) + '</td><td>' + money(c.fee[N - 1]) + '</td><td class="' + cls(d7) + '">' + money(d7) + '</td><td>' + (c.held.L / 24).toFixed(1) + ' · ' + (c.held.S / 24).toFixed(1) + '</td></tr>'; }).join('') + '</tbody></table></details>';
    var sel = $('lp-sortsel'); sel.value = sortKey; sel.addEventListener('change', function () { sortKey = sel.value; viewCards(el); });
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPlay(); });
})();
