/**
 * PDC POS Offline - Service Worker
 *
 * Enables true offline-first operation by caching all POS assets.
 * When server is completely down, the browser can still load the cached app.
 *
 * Cache Strategy: Cache-first with network fallback
 * - Try cache first (fast, works offline)
 * - Fall back to network if not cached
 * - Update cache in background when online
 */

const CACHE_NAME = 'pdc-pos-offline-v1';
const CACHE_VERSION = 1;

// Critical assets that must be cached for offline operation
const PRECACHE_URLS = [
    // Core Odoo assets
    '/web/static/src/core/',
    '/point_of_sale/static/src/',
    '/web/static/lib/',
    // Module assets
    '/pdc_pos_offline/static/src/js/',
    '/pdc_pos_offline/static/src/css/',
    // Entry points
    '/pos/ui',
    '/web/login',
];

// Assets to cache on first request (runtime caching)
const RUNTIME_CACHE_PATTERNS = [
    /\/web\/static\//,
    /\/point_of_sale\/static\//,
    /\/pdc_pos_offline\/static\//,
    /\.js$/,
    /\.css$/,
    /\.png$/,
    /\.jpg$/,
    /\.woff2?$/,
];

// Install event - precache critical assets
self.addEventListener('install', (event) => {
    console.log('[PDC-SW] Installing service worker v' + CACHE_VERSION);

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[PDC-SW] Precaching critical assets');
            // Note: We can't precache all URLs since they need authentication
            // We'll rely on runtime caching when user first loads the app
            return Promise.resolve();
        })
    );

    // Activate immediately without waiting for other tabs to close
    self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('[PDC-SW] Activating service worker');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('pdc-pos-offline-') && name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[PDC-SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );

    // Take control of all clients immediately
    self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and API calls
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip WebSocket and streaming requests
    if (url.pathname.includes('/websocket') || url.pathname.includes('/longpolling')) {
        return;
    }

    // Skip API/RPC calls - these need real-time server data
    if (url.pathname.includes('/web/dataset') ||
        url.pathname.includes('/jsonrpc') ||
        url.pathname.includes('/pdc_pos_offline/validate_pin') ||
        url.pathname.includes('/pdc_pos_offline/sync')) {
        return;
    }

    // Check if this is a cacheable asset
    const shouldCache = RUNTIME_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));

    if (shouldCache || url.pathname === '/pos/ui' || url.pathname === '/web/login') {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version, but also update cache in background
                    event.waitUntil(updateCache(event.request));
                    return cachedResponse;
                }

                // Not in cache, fetch from network and cache
                return fetchAndCache(event.request);
            }).catch((error) => {
                console.log('[PDC-SW] Fetch failed, serving offline fallback:', error);
                return caches.match('/pos/ui') || createOfflineFallback();
            })
        );
    }
});

// Fetch from network and add to cache
async function fetchAndCache(request) {
    try {
        const response = await fetch(request);

        // Only cache successful responses
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            // Clone response since it can only be consumed once
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.log('[PDC-SW] Network fetch failed:', error);
        throw error;
    }
}

// Update cache in background (stale-while-revalidate)
async function updateCache(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response);
        }
    } catch (error) {
        // Silently fail - we have cached version
    }
}

// Create offline fallback page
function createOfflineFallback() {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>POS Offline</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.1);
            border-radius: 16px;
            backdrop-filter: blur(10px);
        }
        h1 { margin-bottom: 10px; }
        p { opacity: 0.9; margin-bottom: 20px; }
        button {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            background: white;
            color: #667eea;
            font-size: 16px;
            cursor: pointer;
            font-weight: 600;
        }
        button:hover { background: #f0f0f0; }
        .icon { font-size: 64px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📡</div>
        <h1>Server Unavailable</h1>
        <p>The POS server is currently unreachable.<br>Please check your internet connection.</p>
        <button onclick="location.reload()">Retry Connection</button>
        <p style="margin-top: 20px; font-size: 12px; opacity: 0.7;">
            Tip: Open POS while online first to enable offline mode.
        </p>
    </div>
</body>
</html>
    `.trim();

    return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
}

// Handle messages from main app
self.addEventListener('message', (event) => {
    if (event.data.type === 'CACHE_ASSETS') {
        // Manually trigger asset caching
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(event.data.urls || []);
            })
        );
    }

    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(caches.delete(CACHE_NAME));
    }

    if (event.data.type === 'GET_CACHE_STATUS') {
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.keys().then((keys) => {
                    event.ports[0].postMessage({
                        cacheSize: keys.length,
                        cacheName: CACHE_NAME
                    });
                });
            })
        );
    }
});

console.log('[PDC-SW] Service Worker loaded');
