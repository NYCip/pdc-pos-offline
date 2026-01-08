/**
 * PDC POS Offline - Service Worker v2.0
 *
 * Caches the POS web application for offline loading.
 * Solves "Page Not Found" error when browser refreshes while server is offline.
 *
 * Caching Strategy:
 * - Cache-First: /pos/ui (main entry point)
 * - Stale-While-Revalidate: /web/assets/* (JS/CSS bundles)
 * - Network-First: /web/dataset/* (RPC calls)
 * - Network-Only: Everything else
 */

const SW_VERSION = '2.0.0';
const CACHE_NAME = `pdc-pos-offline-${SW_VERSION}`;

// Core assets to pre-cache (always same URLs)
const PRECACHE_URLS = [
    '/pos/ui',
];

// Patterns for assets to cache at runtime
const CACHEABLE_PATTERNS = [
    /^\/pos\/ui/,
    /^\/web\/assets\/.*\.(js|css)$/,
    /^\/web\/static\/lib\//,
    /^\/web\/webclient\//,
    /^\/point_of_sale\/static\//,
    /^\/pos_hr\/static\//,
    /^\/pdc_pos_offline\/static\//,
];

// API endpoints - network first
const API_PATTERNS = [
    /^\/web\/dataset\//,
    /^\/web\/session\//,
    /^\/pos\/.*\/get_/,
    /^\/pos\/.*\/load_/,
];

/**
 * Install event - Pre-cache core assets
 */
self.addEventListener('install', (event) => {
    console.log('[PDC-Offline SW] Installing version', SW_VERSION);

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[PDC-Offline SW] Pre-caching core assets');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => {
                // Take control immediately
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[PDC-Offline SW] Pre-cache failed:', error);
            })
    );
});

/**
 * Activate event - Clean old caches and take control
 */
self.addEventListener('activate', (event) => {
    console.log('[PDC-Offline SW] Activating version', SW_VERSION);

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('pdc-pos-offline-') && name !== CACHE_NAME)
                        .map(name => {
                            console.log('[PDC-Offline SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                // Claim all clients immediately
                return self.clients.claim();
            })
    );
});

/**
 * Fetch event - Route requests to appropriate strategy
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) {
        return;
    }

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Determine strategy based on URL
    const strategy = getStrategy(url.pathname);

    switch (strategy) {
        case 'cache-first':
            event.respondWith(cacheFirst(event.request));
            break;
        case 'stale-while-revalidate':
            event.respondWith(staleWhileRevalidate(event.request));
            break;
        case 'network-first':
            event.respondWith(networkFirst(event.request));
            break;
        default:
            // Network only - don't intercept
            break;
    }
});

/**
 * Determine caching strategy for a URL
 */
function getStrategy(pathname) {
    // Main POS entry - cache first
    if (pathname === '/pos/ui' || pathname.startsWith('/pos/ui?')) {
        return 'cache-first';
    }

    // API calls - network first
    if (API_PATTERNS.some(pattern => pattern.test(pathname))) {
        return 'network-first';
    }

    // Static assets - stale while revalidate
    if (CACHEABLE_PATTERNS.some(pattern => pattern.test(pathname))) {
        return 'stale-while-revalidate';
    }

    // Everything else - network only
    return 'network-only';
}

/**
 * Cache-First Strategy
 * Best for: Main entry point that rarely changes
 */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
        console.log('[PDC-Offline SW] Cache hit:', request.url);
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            console.log('[PDC-Offline SW] Caching:', request.url);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.error('[PDC-Offline SW] Network failed for:', request.url);
        return generateOfflineResponse(request);
    }
}

/**
 * Stale-While-Revalidate Strategy
 * Best for: Assets that change but can tolerate staleness
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    // Start network fetch in background
    const networkPromise = fetch(request)
        .then(response => {
            if (response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    // Return cached immediately if available
    if (cached) {
        return cached;
    }

    // Wait for network if no cache
    const networkResponse = await networkPromise;
    if (networkResponse) {
        return networkResponse;
    }

    // Both failed
    console.error('[PDC-Offline SW] No cache or network for:', request.url);
    return generateOfflineResponse(request);
}

/**
 * Network-First Strategy
 * Best for: API calls that should be fresh when possible
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        return response;
    } catch (error) {
        // Network failed, try cache
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);

        if (cached) {
            console.log('[PDC-Offline SW] Network failed, using cache:', request.url);
            return cached;
        }

        // No network, no cache
        throw error;
    }
}

/**
 * Generate offline error response
 */
function generateOfflineResponse(request) {
    const url = new URL(request.url);

    // For main POS page, return offline HTML
    if (url.pathname === '/pos/ui' || url.pathname.startsWith('/pos/ui?')) {
        return new Response(generateOfflineHTML(), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
            },
        });
    }

    // For other requests, return error
    return new Response('Offline - Resource not cached', {
        status: 503,
        statusText: 'Service Unavailable',
    });
}

/**
 * Generate offline HTML page
 */
function generateOfflineHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>POS Offline - Setup Required</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        h1 {
            color: #333;
            margin-bottom: 16px;
            font-size: 24px;
        }
        p {
            color: #666;
            line-height: 1.6;
            margin-bottom: 24px;
        }
        .steps {
            text-align: left;
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 24px;
        }
        .steps ol {
            margin-left: 20px;
        }
        .steps li {
            color: #555;
            margin-bottom: 8px;
            line-height: 1.5;
        }
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 14px 32px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        button:active {
            transform: translateY(0);
        }
        .version {
            margin-top: 20px;
            color: #999;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📡</div>
        <h1>POS Offline Mode Not Ready</h1>
        <p>This POS terminal needs to be opened while connected to the server at least once to enable offline mode.</p>

        <div class="steps">
            <strong>To enable offline mode:</strong>
            <ol>
                <li>Connect to the network</li>
                <li>Open the POS and log in normally</li>
                <li>Wait for the page to fully load</li>
                <li>Offline mode will then be available automatically</li>
            </ol>
        </div>

        <button onclick="location.reload()">Retry Connection</button>

        <p class="version">PDC POS Offline v${SW_VERSION}</p>
    </div>
</body>
</html>`;
}

/**
 * Message handler for communication with main thread
 */
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: SW_VERSION });
    }

    if (event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            event.ports[0].postMessage({ success: true });
        });
    }
});

console.log('[PDC-Offline SW] Service Worker loaded, version:', SW_VERSION);
