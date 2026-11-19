/* 운영 도우미: 저장 데이터, 오류 수집, 통계, 서비스 워커 업데이트 알림 */
(function(){
  'use strict';
  const C = window.CAT_CONFIG || {};
  const VERSION = C.version || 'dev';
  const SAVE_KEY = 'catpost_save_v1';
  const ERR_KEY = 'catpost_errors';
  const session = Math.random().toString(36).slice(2, 10);
  const debug = /[?&]debug=1/.test(location.search);

  // ---- 저장 데이터 (스키마 버전 포함, 깨진 데이터는 초기화) ----
  let cache = null;
  function read(){
    if (cache) return cache;
    let d = {};
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) d = JSON.parse(raw) || {};
      else { const old = +localStorage.getItem('catpost_best'); if (old) d.best = old; } // 프로토타입 저장값 이전
    } catch (e) { d = {}; }
    if (typeof d.best !== 'number' || !isFinite(d.best) || d.best < 0) d.best = 0;
    d.muted = !!d.muted; d.schema = 1;
    return (cache = d);
  }
  const save = {
    get: read,
    set(patch){ const d = Object.assign(read(), patch); try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) {} },
  };

  // ---- 전송 ----
  function send(url, body){
    if (!url) return;
    const json = JSON.stringify(Object.assign({ v: VERSION, session, t: Date.now() }, body));
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([json], { type: 'application/json' }))) return;
      fetch(url, { method: 'POST', body: json, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(()=>{});
    } catch (e) {}
  }

  // ---- 오류 수집 ----
  let errCount = 0;
  function report(kind, msg, stack){
    errCount++;
    if (errCount > 20) return; // 같은 세션에서 폭주 방지
    const rec = { kind, msg: String(msg).slice(0, 300), stack: String(stack || '').slice(0, 1200), ua: navigator.userAgent.slice(0, 160), url: location.pathname };
    try { const list = JSON.parse(localStorage.getItem(ERR_KEY) || '[]'); list.push(Object.assign({ v: VERSION, t: Date.now() }, rec)); localStorage.setItem(ERR_KEY, JSON.stringify(list.slice(-20))); } catch (e) {}
    send(C.errorEndpoint, { type: 'error', ...rec });
    toast('문제가 생겼어요. 계속 이상하면 새로고침해 주세요.', '새로고침', () => location.reload());
  }
  window.addEventListener('error', e => report('error', e.message, e.error && e.error.stack));
  window.addEventListener('unhandledrejection', e => report('promise', e.reason && e.reason.message || e.reason, e.reason && e.reason.stack));

  // ---- 토스트 ----
  function toast(text, action, fn){
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = '';
    const s = document.createElement('span'); s.textContent = text; el.appendChild(s);
    if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action; b.onclick = fn; el.appendChild(b); }
    el.hidden = false;
    clearTimeout(toast._t); if (!action) toast._t = setTimeout(() => { el.hidden = true; }, 4000);
  }

  // ---- 서비스 워커 (오프라인 실행 + 새 버전 알림) ----
  if ('serviceWorker' in navigator && window.isSecureContext && !debug) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        const ask = w => toast('새 버전이 나왔어요.', '업데이트', () => w.postMessage('skipWaiting'));
        if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing; if (!w) return;
          w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
        });
        setInterval(() => reg.update().catch(()=>{}), 30 * 60 * 1000);
      }).catch(e => console.warn('SW 등록 실패', e));
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    });
  }

  window.Ops = { version: VERSION, debug, save, track: (name, data) => send(C.analyticsEndpoint, { type: 'event', name, data: data || {} }), toast,
    errors(){ try { return JSON.parse(localStorage.getItem(ERR_KEY) || '[]'); } catch (e) { return []; } } };
})();
