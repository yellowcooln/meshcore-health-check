// Asset revision is independent of the release version; bump for shell changes.
const CACHE_NAME = 'mesh-health-check-pwa-v1.4.0-region-all-5';
const CORE_ASSETS = [
  '/',
  '/app',
  '/privacy',
  '/manifest.webmanifest',
  '/styles.css',
  '/app.js',
  '/nearest-observers.js',
  '/landing.css',
  '/turnstile-landing.js',
  '/logo.png',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(new Request(request, { cache: 'no-store' }));
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return caches.match('/app');
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/share/')) {
    event.respondWith(fetch(new Request(event.request, { cache: 'no-store' })));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (
    url.pathname === '/manifest.webmanifest'
    || url.pathname === '/sw.js'
    || url.pathname.startsWith('/vendor/leaflet/')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.png')
  ) {
    event.respondWith(networkFirst(event.request));
  }
});
