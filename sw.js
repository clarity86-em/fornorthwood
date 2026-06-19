// 오프라인 캐시 서비스워커 — 네트워크 우선(network-first)
// 온라인이면 항상 최신 파일을 받고, 오프라인일 때만 캐시로 폴백한다.
// (이전의 cache-first 방식은 업데이트가 반영되지 않는 문제가 있었음)
const CACHE = 'fornorthwood-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/ui.js',
  './js/engine.js',
  './js/data.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 동일 출처만 처리

  // 네트워크 우선: 성공하면 캐시 갱신 후 반환, 실패(오프라인) 시 캐시 사용
  e.respondWith(
    fetch(req, { cache: 'no-cache' }) // 항상 서버에 재검증 → 최신 반영
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
