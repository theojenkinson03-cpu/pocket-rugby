// Offline support: serve the app from cache, refresh the cache in the background.
const CACHE = 'pocket-rugby-v3';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/ai.js',
  'js/audio.js',
  'js/cards.js',
  'js/cinema.js',
  'js/color.js',
  'js/commentary.js',
  'js/dice.js',
  'js/dice-view.js',
  'js/engine.js',
  'js/pitch.js',
  'js/store.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then(response => {
          if (response.ok && (response.type === 'basic' || response.type === 'cors')) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
