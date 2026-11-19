/* 서비스 워커: 게임 파일을 캐시해서 오프라인에서도 실행. 배포할 때 VERSION을 올리면 새 캐시로 교체됩니다. */
const VERSION = '1.0.0';
const CACHE = 'catpost-' + VERSION;
const CORE = ['./', 'index.html', 'css/style.css', 'js/config.js', 'js/ops.js', 'js/game.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('catpost-') && k !== CACHE && k !== 'catpost-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 구글 폰트: 한 번 받으면 캐시
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('catpost-fonts').then(c => c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // 페이지: 네트워크 우선(최신 버전), 실패하면 캐시
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }
  // 정적 파일: 캐시 우선
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
