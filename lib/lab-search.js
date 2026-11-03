// 연구소 공용 검색창 (2026-11-03) — 모든 페이지 맨 위(header 아래)에 고정 검색창을 붙인다.
//   찾는 대상: /lib/search-pages.json(페이지·소제목·리서치 링크, tools/build-search.js가 만듦) + 아래 DATA(카탈로그·백테스트 JSON).
//   카탈로그·백테스트 항목은 홈의 해당 줄로 이동(/#go=c:ID · /#go=b:ID — 홈이 window.LAB_GO 로 처리).
(function(){
  var DATA = window.LAB_SEARCH_DATA || [];
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); };
  var squash = function(t){ return String(t || '').toLowerCase().replace(/[\s·・\-_.,()\[\]\/«»"'’:;|+~]/g, ''); };
  var pctf = function(v){ if (v == null || !isFinite(v)) return ''; var x = v * 100; return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1) + '%'; };

  var css = '.lab-search{position:sticky;top:0;z-index:50;margin:0 -8px 14px;padding:10px 8px;background:var(--bg,#fff)}' +
    '.lab-search .box{position:relative}' +
    '.lab-search input{width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:11px 40px;border:1px solid var(--line,#ddd);border-radius:999px;background:var(--bg-raised,#fff);color:var(--ink,#111);box-shadow:var(--shadow,none)}' +
    '.lab-search input:focus{outline:none;border-color:var(--accent,#2563eb)}' +
    '.lab-search .ico{position:absolute;left:15px;top:50%;transform:translateY(-50%);color:var(--ink-soft,#666);pointer-events:none;font-size:15px}' +
    '.lab-search .kbd{position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:11.5px;color:var(--ink-soft,#666);border:1px solid var(--line,#ddd);border-radius:5px;padding:0 6px}' +
    '.lab-search .res{position:absolute;left:0;right:0;top:calc(100% + 6px);max-height:min(70vh,520px);overflow:auto;background:var(--bg-raised,#fff);border:1px solid var(--line,#ddd);border-radius:14px;box-shadow:var(--shadow,0 8px 24px rgba(0,0,0,.12));padding:6px}' +
    '.lab-search .res[hidden]{display:none}' +
    '.lab-search .grp{font-size:12px;font-weight:700;color:var(--ink-soft,#666);padding:8px 10px 4px}' +
    '.lab-search .it{display:block;width:100%;text-align:left;font:inherit;background:transparent;border:0;border-radius:9px;padding:8px 10px;cursor:pointer;color:var(--ink,#111)}' +
    '.lab-search .it:hover,.lab-search .it.on{background:var(--accent-soft,#eef)}' +
    '.lab-search .it .nm{font-size:14px;line-height:1.35}' +
    '.lab-search .it .mt{display:block;font-size:12px;color:var(--ink-soft,#666);margin-top:2px}' +
    '.lab-search .it mark{background:var(--watch-soft,#fde68a);color:inherit;border-radius:3px;padding:0 1px}' +
    '.lab-search .none{padding:14px 10px;font-size:13.5px;color:var(--ink-soft,#666)}' +
    'tr.hit td,.hit-flash{animation:hitflash 2.6s ease-out}' +
    '@keyframes hitflash{0%,35%{background:var(--watch-soft,#fde68a)}100%{background:transparent}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var bar = document.createElement('div');
  bar.className = 'lab-search'; bar.setAttribute('role', 'search');
  bar.innerHTML = '<div class="box"><span class="ico" aria-hidden="true">🔍</span>' +
    '<input type="search" placeholder="' + esc(window.LAB_SEARCH_HINT || '전략·백테스트·페이지 찾기') + '" autocomplete="off" aria-label="연구소 검색">' +
    '<span class="kbd" aria-hidden="true">/</span><div class="res" role="listbox" hidden></div></div>';
  var head = document.querySelector('header.top');
  if (head && head.parentNode) head.parentNode.insertBefore(bar, head.nextSibling);
  else document.body.insertBefore(bar, document.body.firstChild);
  var qIn = bar.querySelector('input'), qRes = bar.querySelector('.res');

  // ---- 색인 ----
  var IDX = [], loaded = false;
  var add = function(g, name, meta, url, extra, idv){ IDX.push({ g:g, name:name || '', meta:meta || '', url:url, id:idv || '', hay: (function(t){ t = t.toLowerCase(); return t + ' ' + squash(t); })([idv, name, meta, extra].filter(Boolean).join(' ')) }); };
  function load(){
    if (loaded) return; loaded = true;
    var jobs = [fetch('/lib/search-pages.json', { cache:'no-store' }).then(function(r){ return r.ok ? r.json() : []; }).then(function(P){
      (P || []).forEach(function(p){ add(p.g || '📄 페이지', p.t, p.d, p.u, p.k); });
    }).catch(function(){})];
    DATA.forEach(function(D){
      jobs.push(fetch(D.url, { cache:'no-store' }).then(function(r){ return r.json(); }).then(function(J){
        (J[D.list || 'strategies'] || []).forEach(function(s){
          var m = s.holdout || s;
          var meta = D.kind === 'b'
            ? [s.id, s.status, m.cagr != null ? '연수익 ' + pctf(m.cagr) : '', m.calmar != null ? '칼마 ' + Number(m.calmar).toFixed(2) : ''].filter(Boolean).join(' · ')
            : [s.id, s.category, s.market, String(s.status || '').replace(/\*\*/g, '').slice(0, 90)].filter(Boolean).join(' · ');
          var extra = [s.plain, s.memo, s.market, s.category, s.group, s.guru, typeof s.source === 'string' ? s.source : s.source && s.source.label, s.status, (s.backtestIds || []).join(' ')].join(' ');
          add(D.group, s.name || s.id, meta, '/#go=' + D.kind + ':' + encodeURIComponent(s.id), extra, s.id);
        });
      }).catch(function(){}));
    });
    return Promise.all(jobs);
  }
  var ready = null;

  var items = [], on = -1;
  var mark = function(text, toks){ var out = esc(text); toks.forEach(function(t){ if (!t) return; out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); }); return out; };
  function draw(){
    var q = qIn.value.trim();
    if (!q) { qRes.hidden = true; items = []; return; }
    var toks = q.toLowerCase().split(/\s+/).filter(Boolean), hits = [];
    IDX.forEach(function(e){
      var sc = 0, nm = (e.id + ' ' + e.name).toLowerCase();
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i], ts = squash(t);
        if (e.hay.indexOf(t) < 0 && (!ts || e.hay.indexOf(ts) < 0)) return;
        sc += e.id.toLowerCase() === t ? 20 : (nm.indexOf(t) >= 0 || squash(nm).indexOf(ts) >= 0) ? 4 : 1;
      }
      hits.push({ e:e, sc:sc });
    });
    hits.sort(function(a, b){ return b.sc - a.sc; });
    var groups = [], by = {};
    hits.forEach(function(h){ var g = h.e.g; if (!by[g]) { by[g] = []; groups.push(g); } by[g].push(h.e); });
    var GO = ['📄 페이지', '🔖 페이지 안 소제목', '📑 리서치 보고서'];
    var gRank = function(g){ var i = GO.indexOf(g); return i < 0 ? -1 : i; };  // 카탈로그·백테스트가 먼저, 그다음 페이지·소제목·보고서
    groups.sort(function(a, b){ return gRank(a) - gRank(b); });
    items = []; var html = '';
    groups.forEach(function(g){
      var L = by[g], cap = 10;
      html += '<div class="grp">' + esc(g) + ' ' + L.length + '개' + (L.length > cap ? ' (위 ' + cap + '개 — 키워드를 더 넣으면 좁혀집니다)' : '') + '</div>';
      L.slice(0, cap).forEach(function(e){
        var i = items.length; items.push(e);
        html += '<button type="button" class="it" role="option" data-i="' + i + '"><span class="nm">' + mark(e.name, toks) + (/^https?:/.test(e.url) ? ' ↗' : '') + '</span>' + (e.meta ? '<span class="mt">' + mark(e.meta, toks) + '</span>' : '') + '</button>';
      });
    });
    if (!html) html = loaded && IDX.length ? '<div class="none">«' + esc(q) + '»에 맞는 항목이 없습니다. 다른 말로 찾아보세요.</div>' : '<div class="none">불러오는 중…</div>';
    on = items.length ? 0 : -1;
    qRes.innerHTML = html; qRes.hidden = false; setOn();
    Array.prototype.forEach.call(qRes.querySelectorAll('.it'), function(b){
      b.onmousedown = function(e){ e.preventDefault(); };
      b.onclick = function(){ pick(+b.getAttribute('data-i')); };
    });
  }
  function setOn(){ Array.prototype.forEach.call(qRes.querySelectorAll('.it'), function(b){ b.classList.toggle('on', +b.getAttribute('data-i') === on); }); var x = qRes.querySelector('.it.on'); if (x) x.scrollIntoView({ block:'nearest' }); }
  function pick(i){
    var e = items[i]; if (!e) return;
    qRes.hidden = true; qIn.blur();
    var u = e.url;
    if (/^https?:/.test(u)) { window.open(u, '_blank', 'noopener'); return; }
    var a = document.createElement('a'); a.href = u;
    if (a.pathname === location.pathname) {
      var m = /^#go=([cb]):(.+)$/.exec(a.hash);
      if (m && window.LAB_GO && window.LAB_GO[m[1]]) { window.LAB_GO[m[1]](decodeURIComponent(m[2])); try { history.replaceState(null, '', a.hash); } catch (er) {} return; }
      if (a.hash) {
        var el = document.getElementById(decodeURIComponent(a.hash.slice(1)));
        if (el) { el.scrollIntoView({ behavior:'smooth', block:'start' }); el.classList.remove('hit-flash'); void el.offsetWidth; el.classList.add('hit-flash'); try { history.replaceState(null, '', a.hash); } catch (er) {} return; }
      }
    }
    location.href = u;
  }
  qIn.addEventListener('focus', function(){ if (!ready) ready = load(); });
  qIn.addEventListener('input', function(){ if (!ready) ready = load(); draw(); ready.then(draw); });
  qIn.addEventListener('blur', function(){ setTimeout(function(){ qRes.hidden = true; }, 120); });
  qIn.addEventListener('keydown', function(e){
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); on = (on + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; setOn(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (on >= 0) pick(on); }
    else if (e.key === 'Escape') { qRes.hidden = true; qIn.blur(); }
  });
  document.addEventListener('keydown', function(e){
    var ae = document.activeElement || {};
    if (e.key === '/' && ae !== qIn && !/INPUT|TEXTAREA|SELECT/.test(ae.tagName || '') && !ae.isContentEditable) { e.preventDefault(); qIn.focus(); qIn.select(); }
  });
})();
