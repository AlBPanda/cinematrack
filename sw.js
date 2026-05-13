const CACHE_NAME = 'cinetrack-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// Yeni versiyon yüklendiğinde hemen devreye gir
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Eski önbellekleri (cache) temizle
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
});

// Network First (Önce İnternet) Stratejisi
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).then(response => {
      // İnternet varsa, en güncel dosyayı al ve önbelleği güncelle
      return caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch(() => {
      // İnternet yoksa (çevrimdışıysa) önbellekteki dosyayı göster
      return caches.match(event.request);
    })
  );
});
