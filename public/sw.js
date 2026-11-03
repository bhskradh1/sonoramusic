// If running on lovableproject.com (dev preview), unregister immediately
if (self.location.hostname.includes('lovableproject.com')) {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.clients.claim())
        .then(() => {
          self.registration.unregister();
        })
    );
  });
  // Stop here — do not register any fetch handlers in dev
} else {

const CACHE_NAME = 'sonora-v2.0.0';
const STATIC_CACHE = 'sonora-static-v2.0.0';
const DYNAMIC_CACHE = 'sonora-dynamic-v2.0.0';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service Worker: Static files cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Error caching static files:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Only handle same-origin requests (leave Supabase, YouTube, etc. alone)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache media range requests
  if (request.headers.has('range')) {
    return;
  }

  // Never intercept Vite dev/HMR/module requests (prevents stale chunk mismatches)
  if (
    url.pathname.startsWith('/node_modules/.vite/') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/src/')
  ) {
    return;
  }

  // Audio resolver metadata and raw media responses contain signed URLs or
  // large binary bodies. Never copy them into Cache Storage; playlist audio is
  // persisted explicitly as Blobs in IndexedDB instead.
  if (url.pathname === '/api/youtube-audio') {
    event.respondWith(fetch(request));
    return;
  }

  // Handle different types of requests
  if (url.pathname === '/' || url.pathname === '/index.html') {
    // Handle main page
    event.respondWith(handleMainPage(request));
  } else if (url.pathname.startsWith('/api/')) {
    // Handle API requests
    event.respondWith(handleApiRequest(request));
  } else if (url.pathname.includes('.') && !url.pathname.includes('?')) {
    // Handle static assets
    event.respondWith(handleStaticAsset(request));
  } else {
    // Handle other requests
    event.respondWith(handleOtherRequest(request));
  }
});

// Handle main page requests: network first, but fall back to cache after 2.5s
// so the installed app opens fast even on a slow connection
async function handleMainPage(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const networkPromise = fetch(request).then((response) => {
    if (response.ok) cache.put('/index.html', response.clone());
    return response;
  });

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 2500));

  try {
    const winner = await Promise.race([networkPromise, timeout]);
    if (winner) return winner;
  } catch (error) {
    // network failed, fall through to cache
  }

  const cached = (await cache.match('/index.html')) || (await caches.match('/index.html'));
  if (cached) return cached;

  // Nothing cached yet: wait for the network
  return networkPromise;
}

// Handle API requests
async function handleApiRequest(request) {
  try {
    // Try network first for API requests
    const response = await fetch(request);
    if (response.ok) {
      // Cache successful API responses
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('Service Worker: API request failed:', error);
    // Return offline response for API requests
    return new Response(
      JSON.stringify({ error: 'Offline - Please check your connection' }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handle static assets
async function handleStaticAsset(request) {
  // Check cache first for static assets
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    // Try network
    const response = await fetch(request);
    if (response.ok) {
      // Cache the response
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('Service Worker: Static asset not found:', request.url);
    // Return a fallback response
    return new Response('Not found', { status: 404 });
  }
}

// Handle other requests
async function handleOtherRequest(request) {
  try {
    // Try network first
    const response = await fetch(request);
    if (response.ok) {
      // Cache successful responses
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('Service Worker: Request failed:', error);
    // Return offline page
    return caches.match('/index.html');
  }
}

// Background sync for music playback
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag);
  
  if (event.tag === 'background-audio-sync') {
    event.waitUntil(
      // Handle background audio sync
      handleBackgroundAudioSync()
    );
  }
});

// Handle background audio sync
async function handleBackgroundAudioSync() {
  try {
    // This would handle background audio synchronization
    // For now, just log the sync
    console.log('Service Worker: Background audio sync completed');
  } catch (error) {
    console.error('Service Worker: Background audio sync failed:', error);
  }
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'New music available!',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Open App',
        icon: '/icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icon-192x192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Sonora', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');

  const musicActions = ['previous', 'next', 'play', 'pause'];

  // Music control buttons: tell the open app what to do, don't open a new window.
  if (musicActions.includes(event.action)) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        list.forEach((client) =>
          client.postMessage({ type: 'MUSIC_ACTION', action: event.action })
        );
      })
    );
    return;
  }

  event.notification.close();

  // Tapping the notification body (or 'Open App') brings the app to the front.
  if (event.action === 'explore' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const client of list) {
          if ('focus' in client) return client.focus();
        }
        return clients.openWindow('/');
      })
    );
  }
});

// Message handling for communication with main app
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

} // end of production-only block
