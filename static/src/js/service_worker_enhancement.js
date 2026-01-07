/** @odoo-module */

/**
 * Service Worker Enhancement - Pre-Caching Module
 *
 * Enhances Odoo 19's native Service Worker with offline-specific pre-caching.
 * This runs in the Service Worker context and intercepts install/activate events.
 *
 * Architecture:
 * - Odoo 19 provides native SW at /pos/service-worker.js
 * - This module enhances it with pre-caching of critical offline assets
 * - Serves as a foundation for stale-while-revalidate strategy
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
 */

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const CACHE_VERSION = 'v1';
const CACHE_NAME = `pos-offline-cache-${CACHE_VERSION}`;

/**
 * Critical assets required for offline POS operation.
 * These are cached during Service Worker installation.
 *
 * Strategy:
 * 1. Keep list minimal (< 10 items) for fast install
 * 2. Include only essential offline functionality
 * 3. Additional assets cached on-demand via SWR
 */
const CRITICAL_ASSETS = [
    // Main POS entry points
    '/pos/',
    '/pos/ui',

    // PDC Offline module assets - we use relative paths to module
    // Odoo will rewrite these at runtime
    '/pdc_pos_offline/static/src/js/offline_db.js',
    '/pdc_pos_offline/static/src/js/offline_auth.js',
    '/pdc_pos_offline/static/src/js/connection_monitor.js',
    '/pdc_pos_offline/static/src/css/offline_pos.css',

    // Login fallback
    '/web/login',
];

/**
 * Network patterns that should use cache-first strategy
 * These are patterns we actively check for in offline mode
 */
const CACHE_PATTERNS = {
    images: /\.(png|jpg|jpeg|gif|webp|svg)$/i,
    fonts: /\.(woff|woff2|ttf|eot)$/i,
    scripts: /\.js$/i,
    styles: /\.css$/i,
};

// ============================================================================
// SERVICE WORKER EVENT HANDLERS
// ============================================================================

/**
 * Install Event - Pre-cache critical assets
 *
 * Called when SW is first registered or updated.
 * We use skipWaiting() to activate immediately.
 */
self.addEventListener('install', (event) => {
    console.log('[SW-Enhancement] Installing', CACHE_NAME);

    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_NAME);
                console.log('[SW-Enhancement] Pre-caching', CRITICAL_ASSETS.length, 'critical assets');

                // Attempt to cache all critical assets
                // Some may fail (network errors), but that's OK - they'll be cached on first use
                const results = await Promise.allSettled(
                    CRITICAL_ASSETS.map(url =>
                        cache.add(url).catch(err => {
                            console.warn(`[SW-Enhancement] Failed to pre-cache ${url}:`, err.message);
                            // Don't throw - continue with other assets
                        })
                    )
                );

                const succeeded = results.filter(r => r.status === 'fulfilled').length;
                console.log(`[SW-Enhancement] Pre-cached ${succeeded}/${CRITICAL_ASSETS.length} assets`);

                // Activate immediately - don't wait for other SWs
                return self.skipWaiting();
            } catch (error) {
                console.error('[SW-Enhancement] Install failed:', error);
                throw error;
            }
        })()
    );
});

/**
 * Activate Event - Clean up old caches
 *
 * Called when this SW becomes active.
 * Removes old cache versions and claims all clients.
 */
self.addEventListener('activate', (event) => {
    console.log('[SW-Enhancement] Activating');

    event.waitUntil(
        (async () => {
            try {
                // Get all cache names
                const cacheNames = await caches.keys();
                console.log('[SW-Enhancement] Found caches:', cacheNames);

                // Delete old versions of our cache
                const deletions = cacheNames
                    .filter(name => {
                        // Keep current cache, delete old versions
                        const isOldVersion = name.startsWith('pos-offline-cache-') &&
                                           name !== CACHE_NAME;
                        if (isOldVersion) {
                            console.log('[SW-Enhancement] Deleting old cache:', name);
                        }
                        return isOldVersion;
                    })
                    .map(name => caches.delete(name));

                await Promise.all(deletions);

                // Claim all clients immediately
                return self.clients.claim();
            } catch (error) {
                console.error('[SW-Enhancement] Activation failed:', error);
                // Don't rethrow - we want the SW to stay active
            }
        })()
    );
});

/**
 * Fetch Event - Stale-while-revalidate strategy
 *
 * Delegates to SWR class (defined in stale_while_revalidate.js).
 * Pattern:
 * 1. Return from cache immediately if available
 * 2. Fetch fresh version in background
 * 3. Update cache with fresh version
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip API requests - let them fail naturally when offline
    // This prevents caching of dynamic API responses
    if (request.url.includes('/api/') || request.url.includes('/rpc/')) {
        return;
    }

    // Try to use SWR strategy if available
    // This is only defined if stale_while_revalidate.js is loaded before this
    if (typeof StaleWhileRevalidateStrategy !== 'undefined') {
        try {
            const swr = new StaleWhileRevalidateStrategy(CACHE_NAME);
            event.respondWith(swr.handleFetch(request));
        } catch (error) {
            console.error('[SW-Enhancement] SWR strategy failed:', error);
            // Fall through to default fetch
        }
    }
});

/**
 * Message Event - Communication with page
 *
 * Allows the page to send commands to the Service Worker.
 */
self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};

    if (type === 'CACHE_ASSETS') {
        // Page is requesting we cache additional assets
        handleCacheAssetsRequest(payload, event);
    } else if (type === 'CLEAR_CACHE') {
        // Page is requesting we clear the cache
        handleClearCacheRequest(event);
    } else if (type === 'GET_CACHE_STATUS') {
        // Page is requesting cache status
        handleGetCacheStatusRequest(event);
    }
});

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

/**
 * Handle request to cache specific assets
 */
async function handleCacheAssetsRequest(assets, event) {
    if (!Array.isArray(assets) || assets.length === 0) {
        event.ports[0].postMessage({ success: false, error: 'No assets provided' });
        return;
    }

    try {
        const cache = await caches.open(CACHE_NAME);
        const results = await Promise.allSettled(
            assets.map(url => cache.add(url))
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = assets.length - succeeded;

        event.ports[0].postMessage({
            success: true,
            cached: succeeded,
            failed: failed,
        });

        console.log(`[SW-Enhancement] Cached ${succeeded}/${assets.length} assets`);
    } catch (error) {
        event.ports[0].postMessage({
            success: false,
            error: error.message
        });
        console.error('[SW-Enhancement] Cache assets request failed:', error);
    }
}

/**
 * Handle request to clear cache
 */
async function handleClearCacheRequest(event) {
    try {
        const deleted = await caches.delete(CACHE_NAME);
        event.ports[0].postMessage({ success: deleted });

        if (deleted) {
            console.log('[SW-Enhancement] Cache cleared');
        }
    } catch (error) {
        event.ports[0].postMessage({ success: false, error: error.message });
        console.error('[SW-Enhancement] Clear cache request failed:', error);
    }
}

/**
 * Handle request to get cache status
 */
async function handleGetCacheStatusRequest(event) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const requests = await cache.keys();

        event.ports[0].postMessage({
            success: true,
            cacheName: CACHE_NAME,
            assetCount: requests.length,
            assets: requests.map(r => r.url),
        });
    } catch (error) {
        event.ports[0].postMessage({
            success: false,
            error: error.message
        });
        console.error('[SW-Enhancement] Get cache status request failed:', error);
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Helper to check if a URL matches any cache pattern
 */
function shouldCache(url) {
    try {
        const pathname = new URL(url).pathname;

        for (const [type, pattern] of Object.entries(CACHE_PATTERNS)) {
            if (pattern.test(pathname)) {
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

// Export for testing
if (typeof module !== 'undefined') {
    module.exports = {
        CACHE_NAME,
        CRITICAL_ASSETS,
        CACHE_PATTERNS,
        shouldCache,
    };
}

console.log('[SW-Enhancement] Module loaded successfully');
