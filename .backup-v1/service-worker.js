// PDC POS Offline Service Worker
const CACHE_NAME = 'pdc-pos-offline-v1';
const OFFLINE_URL = '/pdc_pos_offline/offline';

// Essential files to cache for offline operation
const ESSENTIAL_URLS = [
    '/web/static/src/core/assets.js',
    '/point_of_sale/static/src/app/',
    '/web/assets/',
    '/pdc_pos_offline/static/',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Cache essential files
            return cache.addAll(ESSENTIAL_URLS.map(url => new Request(url, {cache: 'reload'})));
        })
    );
    
    // Force activation
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    // Take control immediately
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone the response before caching
                const responseToCache = response.clone();
                
                caches.open(CACHE_NAME).then((cache) => {
                    // Cache successful responses
                    if (response.status === 200) {
                        cache.put(event.request, responseToCache);
                    }
                });
                
                return response;
            })
            .catch(() => {
                // Network failed, try cache
                return caches.match(event.request).then((response) => {
                    if (response) {
                        return response;
                    }
                    
                    // No cache match, return offline page for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match(OFFLINE_URL);
                    }
                    
                    // Return a basic error response
                    return new Response('Offline - Resource not cached', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: new Headers({
                            'Content-Type': 'text/plain'
                        })
                    });
                });
            })
    );
});

// Background sync for offline transactions
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-offline-transactions') {
        event.waitUntil(syncOfflineTransactions());
    }
});

async function syncOfflineTransactions() {
    // Get offline transactions from IndexedDB
    // Send them to server
    // Update local status
    console.log('Syncing offline transactions...');
}