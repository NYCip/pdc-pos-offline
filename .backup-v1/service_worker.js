/**
 * PDC POS Offline - Service Worker
 *
 * DEPRECATED: This file is no longer used.
 *
 * Odoo 19 has a native Service Worker at /pos/service-worker.js that handles:
 * - Asset caching for offline operation
 * - PWA (Progressive Web App) functionality
 * - Background sync
 *
 * This custom Service Worker was causing conflicts:
 * 1. Registered with global '/' scope - conflicted with other modules
 * 2. Duplicated caching that Odoo already provides
 * 3. Potential cache inconsistencies between our SW and Odoo's SW
 *
 * The PDC POS Offline module now focuses solely on:
 * - Offline PIN authentication (when server unreachable)
 * - Session persistence in IndexedDB
 * - Connection monitoring for online/offline mode switching
 *
 * Asset caching is delegated to Odoo's native Service Worker.
 *
 * @deprecated Since 19.0.1.0.2 - Use Odoo's native /pos/service-worker.js
 * @see https://www.odoo.com/documentation/19.0/developer/reference/frontend/services.html
 *
 * This file is kept for historical reference only and is not loaded or executed.
 * The controller route at /pdc_pos_offline/sw.js has also been deprecated.
 */

// ============================================================================
// DEPRECATED CODE BELOW - KEPT FOR REFERENCE ONLY
// ============================================================================

/*
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
            return Promise.resolve();
        })
    );

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

    self.clients.claim();
});

// ... rest of fetch handlers were here ...
*/

console.warn('[PDC-SW] DEPRECATED: This Service Worker file is no longer active. Odoo 19 native SW is used instead.');
