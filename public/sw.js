// Asset revision is independent of the release version; bump for shell changes.
const CACHE_NAME = 'mesh-health-check-pwa-v1.4.1-maplibre-25';
const CORE_ASSETS = [
  '/',
  '/app',
  '/privacy',
  '/manifest.webmanifest',
  '/styles.css',
  '/app.js',
  '/nearest-observers.js',
  '/location-refinement.js',
  '/landing.css',
  '/turnstile-landing.js',
  '/logo.png',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
  '/vendor/maplibre/maplibre-gl.css',
  '/map-renderer.js',
  '/vendor/maplibre/maplibre-gl.mjs',
  // MapLibre's self-contained worker uses an exact versioned URL since 6.13.
  '/vendor/maplibre/maplibre-gl-worker.mjs?v=6.15.0',
  '/vendor/maplibre-leaflet/leaflet-maplibre-gl.js',
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

async function cachedResponse(request) {
  try {
    return await caches.match(request);
  } catch {
    return undefined;
  }
}

async function storeResponse(request, response) {
  const asset = /\.(?:m?js|css)$/.test(new URL(request.url).pathname);
  if (!response.ok || response.redirected
    || (asset && /(?:text\/html|application\/xhtml\+xml)/i.test(response.headers.get('Content-Type') || ''))) {
    return;
  }
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    // Cache storage is best effort; never discard a successful network response.
  }
}

async function cacheFirst(request) {
  const cached = await cachedResponse(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  await storeResponse(request, response);
  return response;
}

async function networkFirst(request) {
  let response;
  try {
    response = await fetch(new Request(request, { cache: 'no-store' }));
  } catch (error) {
    const cached = await cachedResponse(request);
    if (cached) {
      return cached;
    }
    // Only document navigations may fall back to the dashboard shell.
    if (request.mode === 'navigate') {
      const shell = await cachedResponse('/app');
      if (shell) return shell;
    }
    throw error;
  }
  if ([500, 502, 503, 504].includes(response.status)) {
    const cached = await cachedResponse(request);
    if (cached) return cached;
  }
  await storeResponse(request, response);
  return response;
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
    || url.pathname.endsWith('.mjs')
    || url.pathname.endsWith('.png')
  ) {
    event.respondWith(networkFirst(event.request));
  }
});
