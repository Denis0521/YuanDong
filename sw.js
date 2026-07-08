// 這裡的版本號已更新為 v2，會強迫瀏覽器抓取你最新修改的排版！
const CACHE_NAME = 'learn-record-v2';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// 安裝時進行快取
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting(); // 強制立即接管
});

// 啟用並清除舊快取
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 攔截網路請求，若沒網路則讀取快取
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});