/* ─────────────────────────────────────────────────────────────
   매수 후보 생중계 (2026-11-11 사용자 요청 — «기다리는 시간이 지루하다»)
   «생중계 시작» 을 누른 동안만 카페24 kimchi-watch 서버에 10초마다 묻는다. 서버는 그 순간
   두 거래소 시세·호가를 받아 봇과 같은 함수로 진입선에 가장 가까운 6종목의 관문 8개를 다시 잰다.
   누르지 않으면 서버는 아무것도 계산하지 않는다. 10분 뒤·탭을 떠나면 저절로 쉰다.
   ───────────────────────────────────────────────────────────── */
(function () {
  var API = 'https://kimchiwatch.180-70-116-114.sslip.io/watch';
  var EVERY = 10000, MAX_MS = 10 * 60000;
  var root = document.getElementById('lw');
  if (!root) return;

  var css = document.createElement('style');
  css.textContent = [
    '.lw{border:1px solid var(--line);border-radius:var(--radius);background:var(--bg-raised);box-shadow:var(--shadow);margin:0 0 18px;overflow:hidden}',
    '.lw-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:14px 16px}',
    '.lw-btn{font:600 14px var(--font-body);background:var(--danger);color:#fff;border:0;border-radius:999px;padding:9px 18px;cursor:pointer}',
    '.lw-btn.off{background:var(--ink-soft)}',
    '.lw-btn:focus-visible{outline:2px solid var(--ink);outline-offset:2px}',
    '.lw-intro{font-size:12.5px;color:var(--ink-soft);flex:1 1 260px;line-height:1.5}',
    '.lw-board{display:none;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:10px 16px;border-top:1px solid var(--line-soft);background:var(--bg);font-size:12.5px}',
    '.lw.on .lw-board{display:flex}',
    '.lw-live{font:700 12px var(--font-mono);color:var(--danger);display:inline-flex;align-items:center;gap:6px;letter-spacing:.06em}',
    '.lw-live i{width:9px;height:9px;border-radius:50%;background:var(--danger);animation:lwp 1.2s infinite}',
    '.lw.paused .lw-live{color:var(--ink-soft)} .lw.paused .lw-live i{background:var(--ink-soft);animation:none}',
    '@keyframes lwp{0%{box-shadow:0 0 0 0 rgba(154,59,40,.55)}70%{box-shadow:0 0 0 8px rgba(154,59,40,0)}100%{box-shadow:0 0 0 0 rgba(154,59,40,0)}}',
    '.lw-board b{font-family:var(--font-mono);font-weight:600}',
    '.lw-body{display:none;padding:4px 16px 16px}',
    '.lw.on .lw-body{display:block}',
    '.lw h3{font:600 14px var(--font-body);margin:16px 0 8px;color:var(--ink)}',
    '.lw-track{position:relative;border:1px solid var(--line-soft);border-radius:10px;padding:8px 44px 8px 10px;background:linear-gradient(90deg,var(--bg) 0,var(--bg) calc(100% - 44px),var(--good-soft) calc(100% - 44px))}',
    '.lw-track:after{content:"결승";position:absolute;right:6px;top:6px;font:600 10.5px var(--font-body);color:var(--good)}',
    '.lw-lane{position:relative;height:30px;border-bottom:1px dashed var(--line-soft)}',
    '.lw-lane:last-child{border-bottom:0}',
    '.lw-runner{position:absolute;top:4px;transform:translateX(-50%);transition:left 1.2s cubic-bezier(.3,.8,.3,1);white-space:nowrap;font:600 12px var(--font-mono);background:var(--bg-raised);border:1.5px solid var(--accent);border-radius:999px;padding:2px 8px}',
    '.lw-runner.go{border-color:var(--good);background:var(--good-soft)}',
    '.lw-runner small{font-weight:400;color:var(--ink-soft);margin-left:4px}',
    '.lw-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}',
    '.lw-card{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--bg-raised)}',
    '.lw-card.go{border-color:var(--good);box-shadow:0 0 0 2px var(--good-soft)}',
    '.lw-card.flash{animation:lwf .9s}',
    '@keyframes lwf{0%{background:var(--accent-soft)}100%{background:var(--bg-raised)}}',
    '.lw-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}',
    '.lw-coin{font:700 16px var(--font-mono)}',
    '.lw-rank{font-size:11.5px;color:var(--ink-soft)}',
    '.lw-prem{font:600 20px var(--font-mono)}',
    '.lw-tick{font:500 11.5px var(--font-mono);margin-left:4px}',
    '.lw-up{color:var(--danger)} .lw-dn{color:var(--good)}',
    '.lw-dist{font-size:12.5px;margin:4px 0 6px;color:var(--ink-soft)} .lw-dist b{color:var(--ink);font-family:var(--font-mono)}',
    '.lw-gates{display:flex;gap:4px;margin:6px 0;flex-wrap:wrap}',
    '.lw-g{font-size:10.5px;padding:2px 6px;border-radius:6px;border:1px solid var(--line);color:var(--ink-soft);cursor:help}',
    '.lw-g.ok{background:var(--good-soft);border-color:var(--good);color:var(--good)}',
    '.lw-g.no{background:var(--danger-soft);border-color:var(--danger);color:var(--danger)}',
    '.lw-say{font-size:13px;line-height:1.55;margin-top:6px}',
    '.lw-spark{display:block;width:100%;height:46px;margin-top:6px}',
    '.lw-feed{list-style:none;margin:0;padding:0;max-height:260px;overflow:auto;border:1px solid var(--line-soft);border-radius:10px}',
    '.lw-feed li{font-size:13px;padding:6px 10px;border-bottom:1px solid var(--line-soft);line-height:1.5}',
    '.lw-feed li:first-child{background:var(--accent-soft)}',
    '.lw-feed time{font:500 11px var(--font-mono);color:var(--ink-soft);margin-right:6px}',
    '.lw-calls{font-size:12px;color:var(--ink-soft);line-height:1.6;margin:0;padding-left:18px}',
    '.lw-note{font-size:11.5px;color:var(--ink-soft);margin-top:10px;line-height:1.5}',
    '@media (prefers-reduced-motion: reduce){.lw-runner{transition:none}.lw-live i,.lw-card.flash{animation:none}}'
  ].join('\n');
  document.head.appendChild(css);

  root.className = 'lw';
  root.innerHTML =
    '<div class="lw-head"><button type="button" class="lw-btn" id="lw-btn">🎙️ 매수 후보 생중계 시작</button>' +
    '<span class="lw-intro" id="lw-intro">누르는 동안만 서버가 두 거래소 호가를 새로 받아, 진입선에 가장 가까운 종목들이 봇의 관문 8개 중 어디에 걸려 있는지 10초마다 중계합니다. 10분 뒤나 다른 탭으로 가면 저절로 쉽니다.</span></div>' +
    '<div class="lw-board" id="lw-board"></div>' +
    '<div class="lw-body"><h3>🏁 결승선(봇이 사는 자리)까지 남은 거리</h3><div class="lw-track" id="lw-track"></div><p class="lw-note" style="margin-top:6px">자리는 «남은 거리 ÷ 그 코인의 평소 출렁임(σ)» 순서입니다 — 봇도 σ 기준으로 판단합니다. 많이 출렁이는 코인은 %p로는 멀어 보여도 실제로는 금방 닿을 수 있습니다.</p>' +
    '<h3>📣 실시간 중계</h3><ul class="lw-feed" id="lw-feed"></ul>' +
    '<h3>🎽 선수 소개 — 후보 6종목</h3><div class="lw-cards" id="lw-cards"></div>' +
    '<div id="lw-benchwrap"></div>' +
    '<h3>🧑‍⚖️ 심판 기록 — 최근 30분 봇이 보류한 이유</h3><ul class="lw-calls" id="lw-calls"></ul>' +
    '<p class="lw-note">결승선 = 시세 김프가 여기까지 내려오면 신호선(평균 − 1.5σ)·기대수익 문턱(비용 × 3배, 빈 장부 첫 자리는 2.5배)·실매수 가격 관문이 모두 열리는 값 (지금 호가 차 기준). 마지막 «두 거래소 재확인»은 실제 주문 크기로 호가를 먹어 본 값입니다. 판정 함수는 실전 봇과 같고, 이 화면은 주문하지 않습니다.</p></div>';

  var $ = function (id) { return document.getElementById(id); };
  var btn = $('lw-btn');
  var timer = null, tick = null, startAt = 0, nextAt = 0, running = false, pausedByHide = false;
  var prev = null, series = {}, feedN = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sg(v, d) { if (v == null) return '—'; d = d == null ? 2 : d; return (v >= 0 ? '+' : '') + Number(v).toFixed(d); }
  function hm(ms) { var d = new Date(ms + 9 * 3600e3); return d.toISOString().slice(11, 19); }
  function won(v) { if (v == null) return '—'; var d = v >= 1000 ? 0 : v >= 100 ? 1 : v >= 1 ? 3 : 5; return '₩' + Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: 0 }); }
  function ago(iso) { var s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 90 ? s + '초 전' : Math.round(s / 60) + '분 전'; }

  function say(text) {
    var li = document.createElement('li');
    li.innerHTML = '<time>' + hm(Date.now()) + '</time>' + text;
    var f = $('lw-feed'); f.insertBefore(li, f.firstChild);
    while (f.children.length > 60) f.removeChild(f.lastChild);
  }

  // 한 종목의 «지금 무엇이 발목을 잡나» 를 중계 말투로
  function comment(c, d) {
    var g = {}; c.gates.forEach(function (x) { g[x.key] = x; });
    if (c.verdict === 'go') return '🚨 <b>모든 관문 통과!</b> 다음 1분 회차에 봇이 실제로 주문할 수 있는 상태입니다' + (c.firstEdge ? ' (빈 장부 첫 자리 2.5배 규칙)' : '') + '.';
    if (!g.univ.ok) return '🪑 출전 자격이 없습니다 — ' + esc(g.univ.text) + '. 김프가 빠져도 봇은 보기만 합니다.';
    if (!g.hist.ok) return '🧘 몸 푸는 중 — 이력 ' + esc(g.hist.text) + '. 그 전엔 진입선에 닿아도 사지 않습니다.';
    if (!d.usdt.ok) return '⛔ USDT 웃돈 필터가 경기를 멈췄습니다 — 원화 시장 전체가 식어 있어 새 진입을 쉽니다.';
    if (c.verdict === 'recheck-fail') return '📺 비디오 판독 번복! 시세로는 통과였지만 실제 주문 크기로 두 거래소 호가를 먹어 보니 — ' + esc(c.reason) + '.';
    if (c.gap <= 0) return '🤔 결승선은 넘었는데 판정 보류 — ' + esc(c.reason || '') + '.';
    var bySig = c.lower - Math.max(0, (c.askPrem != null ? c.askPrem - c.premium : 0));
    var why;
    if (c.target < bySig - 0.005) why = '신호선(' + sg(c.lower) + '%)보다 <b>비용 문턱</b>이 더 깊습니다 — 스프레드 ' + (c.spread != null ? c.spread.toFixed(2) : '?') + '%(평상시 ' + (c.typSpread != null ? c.typSpread.toFixed(2) : '?') + '%)에 수수료를 더해 ' + (c.firstEdge || d.firstEdge ? '2.5' : '3') + '배는 남아야 합니다';
    else if (c.askPrem != null && c.askPrem - c.premium > 0.15) why = '호가가 얇아 <b>실제 살 값</b>이 시세보다 ' + (c.askPrem - c.premium).toFixed(2) + '%p 비쌉니다 — 그만큼 더 내려와야 합니다';
    else why = '−1.5σ 신호선이 결승선입니다';
    var lead = c.gapSig < 0.3 ? '🔥 코앞입니다! ' : c.gapSig < 0.8 ? '👀 사정권. ' : c.gapSig < 1.5 ? '' : '😴 아직 멀었습니다. ';
    return lead + '빗썸 가격이 <b>' + won(c.targetKrw) + '</b> 아래로 (지금 ' + won(c.priceKrw) + ') 내려오면 진입 조건 충족. ' + why + '.';
  }

  function spark(c) {
    var pts = (c.hist || []).slice(), live = series[c.coin] || [];
    var all = pts.concat(live);
    if (all.length < 2) return '';
    var t0 = all[0][0], t1 = all[all.length - 1][0] || t0 + 1;
    var vals = all.map(function (p) { return p[1]; }).concat([c.target, c.lower]);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), W = 300, H = 46;
    if (hi - lo < 0.05) { hi += 0.05; lo -= 0.05; }
    var X = function (t) { return ((t - t0) / Math.max(1, t1 - t0) * (W - 4) + 2).toFixed(1); };
    var Y = function (v) { return (H - 3 - (v - lo) / (hi - lo) * (H - 6)).toFixed(1); };
    var line = function (arr) { return arr.map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join(' '); };
    return '<svg class="lw-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-label="최근 3시간 김프와 결승선">' +
      '<line x1="0" x2="' + W + '" y1="' + Y(c.target) + '" y2="' + Y(c.target) + '" stroke="var(--good)" stroke-width="2" stroke-dasharray="5 3"/>' +
      '<line x1="0" x2="' + W + '" y1="' + Y(c.lower) + '" y2="' + Y(c.lower) + '" stroke="var(--watch)" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<polyline fill="none" stroke="var(--ink-soft)" stroke-width="1.3" points="' + line(pts) + '"/>' +
      (live.length ? '<polyline fill="none" stroke="var(--danger)" stroke-width="2.2" points="' + line((pts.length ? [pts[pts.length - 1]] : []).concat(live)) + '"/>' : '') +
      '</svg>';
  }

  function render(d) {
    var pmap = {}; if (prev) prev.candidates.forEach(function (c) { pmap[c.coin] = c; });
    var now = Date.now();
    d.candidates.concat(d.bench).forEach(function (c) { (series[c.coin] = series[c.coin] || []).push([now, c.premium]); if (series[c.coin].length > 80) series[c.coin].shift(); });

    $('lw-board').innerHTML =
      '<span class="lw-live"><i></i>' + (running ? 'LIVE' : '쉬는 중') + '</span>' +
      '<span>경과 <b id="lw-el">0:00</b></span><span>다음 갱신 <b id="lw-nx">—</b></span>' +
      '<span>자리 <b>' + d.slots.used + '/' + d.slots.max + '</b></span>' +
      '<span>USDT 필터 ' + (d.usdt.ok ? '✅ 통과' : '⛔ 막힘') + '</span>' +
      (d.firstEdge ? '<span>🎯 빈 장부 첫 자리 <b>' + d.firstEdge + '배</b> 적용 중</span>' : '') +
      '<span>감시 <b>' + d.watched + '</b>종목</span>' +
      '<span>봇 회차 ' + ago(d.lastRun) + '</span>' +
      (d.stopped ? '<span style="color:var(--danger)">🛑 비상정지 중</span>' : '') +
      '<span>환율 <b>' + d.fx + '</b></span>';

    // 레이스 트랙: 결승선까지 거리(σ) 0 → 오른쪽 끝, 3σ 이상 → 왼쪽 끝
    $('lw-track').innerHTML = d.candidates.map(function (c) {
      var x = Math.max(0, Math.min(1, 1 - c.gapSig / 3));
      return '<div class="lw-lane"><span class="lw-runner' + (c.verdict === 'go' ? ' go' : '') + '" style="left:' + (4 + x * 92).toFixed(1) + '%">' + esc(c.coin) +
        '<small>' + (c.gap > 0 ? c.gapSig.toFixed(1) + 'σ · ' + c.gap.toFixed(2) + '%p' : '도착') + '</small></span></div>';
    }).join('') || '<div class="lw-lane">후보 없음</div>';

    $('lw-cards').innerHTML = d.candidates.map(function (c, i) { return card(c, i, pmap[c.coin], d); }).join('');
    $('lw-benchwrap').innerHTML = d.bench.length ? '<h3>🪑 벤치 — 신호는 떴지만 출전 자격이 없는 종목</h3><div class="lw-cards">' + d.bench.map(function (c, i) { return card(c, i, null, d, true); }).join('') + '</div>' : '';
    $('lw-calls').innerHTML = d.calls.length ? d.calls.map(function (x) { return '<li><code>' + hm(Date.parse(x.at)).slice(0, 5) + '</code> ' + esc(x.text) + '</li>'; }).join('') : '<li>최근 30분 보류 기록 없음 — 신호선까지 내려온 종목이 없었다는 뜻입니다.</li>';

    events(d);
    prev = d;
  }

  function card(c, i, p, d, bench) {
    var tk = p ? c.premium - p.premium : null;
    var tick = tk == null || Math.abs(tk) < 0.005 ? '' : '<span class="lw-tick ' + (tk > 0 ? 'lw-up' : 'lw-dn') + '">' + (tk > 0 ? '▲' : '▼') + Math.abs(tk).toFixed(2) + '</span>';
    var gates = c.gates.map(function (g, k) {
      return '<span class="lw-g ' + (g.ok === true ? 'ok' : g.ok === false ? 'no' : '') + '" title="' + esc(g.name + ': ' + g.text) + '">' + (k + 1) + ' ' + esc(g.name) + '</span>';
    }).join('');
    return '<div class="lw-card' + (c.verdict === 'go' ? ' go' : '') + (p && Math.abs(tk) >= 0.05 ? ' flash' : '') + '">' +
      '<div class="lw-top"><span class="lw-coin">' + esc(c.coin) + '</span><span class="lw-rank">' + (bench ? '벤치' : (i + 1) + '번 레인') + ' · z ' + sg(c.z) + '</span></div>' +
      '<div><span class="lw-prem">' + sg(c.premium) + '%</span>' + tick + ' <span class="lw-rank">평균 ' + sg(c.ma) + '% · σ ' + c.sigma.toFixed(2) + '</span></div>' +
      '<div class="lw-dist">결승선 <b>' + sg(c.target) + '%</b> · ' + (c.gap > 0 ? '남은 거리 <b>' + c.gap.toFixed(2) + '%p</b> (' + c.gapSig.toFixed(2) + 'σ)' : '<b>결승선 통과</b>') + '</div>' +
      '<div class="lw-gates">' + gates + '</div>' +
      spark(c) +
      '<div class="lw-say">' + comment(c, d) + '</div></div>';
  }

  // 지난 갱신과 비교해 «사건» 만 중계한다 (한 번에 최대 5줄)
  function events(d) {
    var out = [];
    if (!prev) {
      var l = d.candidates[0];
      out.push('🎙️ 중계 시작합니다! 지금 감시 ' + d.watched + '종목, 자리 ' + d.slots.used + '/' + d.slots.max + '. ' +
        (l ? '결승선에 가장 가까운 선수는 <b>' + esc(l.coin) + '</b> — 남은 거리 ' + Math.max(0, l.gap).toFixed(2) + '%p.' : '후보가 없습니다.') +
        (d.usdt.ok ? '' : ' 다만 USDT 필터가 막혀 있어 지금은 아무도 못 삽니다.'));
      if (d.bench.length) out.push('🪑 벤치에는 ' + d.bench.map(function (c) { return '<b>' + esc(c.coin) + '</b>'; }).join(', ') + ' — 신호는 떴지만 출전 자격이 없습니다.');
      out.reverse().forEach(say); return;
    }
    var pm = {}; prev.candidates.forEach(function (c) { pm[c.coin] = c; });
    if (prev.candidates[0] && d.candidates[0] && prev.candidates[0].coin !== d.candidates[0].coin) out.push('🏃 <b>선두 교체!</b> ' + esc(d.candidates[0].coin) + '이(가) ' + esc(prev.candidates[0].coin) + '을(를) 제쳤습니다 — 남은 거리 ' + Math.max(0, d.candidates[0].gap).toFixed(2) + '%p.');
    d.candidates.forEach(function (c) {
      var p = pm[c.coin];
      if (!p) { out.push('📣 <b>' + esc(c.coin) + '</b> 후보권에 새로 들어옵니다 — 남은 거리 ' + Math.max(0, c.gap).toFixed(2) + '%p.'); return; }
      if (c.verdict === 'go' && p.verdict !== 'go') out.push('🚨 <b>' + esc(c.coin) + ' 모든 관문 통과!</b> 다음 회차 주문 대기.');
      var dg = c.gap - p.gap;
      if (dg <= -0.05) out.push('▼ <b>' + esc(c.coin) + '</b> ' + Math.abs(dg).toFixed(2) + '%p 다가섭니다 — 남은 거리 ' + Math.max(0, c.gap).toFixed(2) + '%p' + (c.gap < 0.2 && c.gap > 0 ? ' 🔥' : '') + '.');
      else if (dg >= 0.08) out.push('▲ <b>' + esc(c.coin) + '</b> ' + dg.toFixed(2) + '%p 멀어집니다 — 반등.');
      c.gates.forEach(function (g, k) {
        var pg = p.gates[k];
        if (pg && g.ok === true && pg.ok === false && g.key !== 'slot') out.push('✅ <b>' + esc(c.coin) + '</b> «' + esc(g.name) + '» 관문 열림 — ' + esc(g.text));
        if (pg && g.ok === false && pg.ok === true && g.key !== 'slot') out.push('❌ <b>' + esc(c.coin) + '</b> «' + esc(g.name) + '» 다시 닫힘 — ' + esc(g.text));
      });
    });
    prev.candidates.forEach(function (c) { if (!d.candidates.some(function (x) { return x.coin === c.coin; })) out.push('↩️ ' + esc(c.coin) + ' 후보권에서 밀려납니다.'); });
    d.held.forEach(function (h) { if (prev.held.indexOf(h) < 0) out.push('🎉 <b>' + esc(h) + ' 매수 체결!</b> 봇이 자리를 잡았습니다.'); });
    if (d.usdt.ok !== prev.usdt.ok) out.push(d.usdt.ok ? '🟢 USDT 필터 풀렸습니다 — 경기 재개!' : '⛔ USDT 필터가 닫혔습니다 — 새 진입 일시 중지.');
    if (!out.length && ++feedN % 6 === 0 && d.candidates[0]) out.push('⏱️ 큰 움직임 없이 탐색전입니다. 선두 ' + esc(d.candidates[0].coin) + ' 남은 거리 ' + Math.max(0, d.candidates[0].gap).toFixed(2) + '%p.');
    out.slice(0, 5).reverse().forEach(say);
  }

  function poll() {
    nextAt = Date.now() + EVERY;
    fetch(API + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d || !d.ok) throw new Error((d && d.error) || '응답 이상'); if (running) render(d); })
      .catch(function (e) { say('⚠️ 중계 신호가 잠깐 끊겼습니다 — ' + esc(e.message) + '. 10초 뒤 다시 잡습니다.'); });
  }
  function clock() {
    var el = $('lw-el'), nx = $('lw-nx');
    if (el) { var s = Math.floor((Date.now() - startAt) / 1000); el.textContent = Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
    if (nx) nx.textContent = running ? Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)) + '초' : '—';
    if (running && Date.now() - startAt > MAX_MS) stop('⏸️ 10분이 지나 중계를 쉽니다. 더 보시려면 다시 눌러 주세요.');
  }
  function start() {
    running = true; startAt = Date.now(); root.classList.add('on'); root.classList.remove('paused');
    btn.textContent = '⏹ 생중계 멈추기'; btn.classList.add('off');
    if (!prev) $('lw-feed').innerHTML = '';
    poll(); timer = setInterval(poll, EVERY); tick = setInterval(clock, 500);
  }
  function stop(msg) {
    running = false; clearInterval(timer); clearInterval(tick); root.classList.add('paused');
    btn.textContent = '🎙️ 생중계 다시 시작'; btn.classList.remove('off');
    var nx = $('lw-nx'); if (nx) nx.textContent = '—';
    var lv = root.querySelector('.lw-live'); if (lv) lv.lastChild.textContent = '쉬는 중';
    if (msg) say(msg);
  }
  btn.addEventListener('click', function () { if (running) stop('⏹ 중계를 멈췄습니다.'); else start(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && running) { pausedByHide = true; stop('⏸️ 다른 화면으로 가셔서 중계를 쉽니다.'); }
    else if (!document.hidden && pausedByHide) { pausedByHide = false; start(); say('▶️ 돌아오셨네요 — 중계 재개합니다.'); }
  });
})();
