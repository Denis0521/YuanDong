const CACHE_NAME = 'learn-record-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  // 如果未來有分離的 css 或 js 檔案也要加進來
];

// 安裝時進行快取
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// 攔截網路請求，若沒網路則讀取快取
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 有快取就回傳快取，沒有就發起真實網路請求
        return response || fetch(event.request);
      })
  );
});