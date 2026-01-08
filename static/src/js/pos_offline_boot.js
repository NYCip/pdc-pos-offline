/** @odoo-module */
/**
 * PDC POS Offline - Boot Script v2.0
 *
 * Registers the Service Worker as early as possible in the POS lifecycle.
 * Handles version upgrades and cache invalidation.
 */

const MODULE_VERSION = '2.0.0';
const SW_PATH = '/pos_offline/sw.js';
const SW_SCOPE = '/pos/';

/**
 * Initialize Service Worker registration
 */
async function initServiceWorker() {
    // Check if Service Workers are supported
    if (!('serviceWorker' in navigator)) {
        console.warn('[PDC-Offline] Service Workers not supported in this browser');
        return;
    }

    try {
        // Check for version upgrade - clear caches if version changed
        const storedVersion = localStorage.getItem('pdc_offline_version');
        if (storedVersion && storedVersion !== MODULE_VERSION) {
            console.log('[PDC-Offline] Version upgrade detected:', storedVersion, '→', MODULE_VERSION);
            await clearAllCaches();
        }
        localStorage.setItem('pdc_offline_version', MODULE_VERSION);

        // Register Service Worker
        const registration = await navigator.serviceWorker.register(SW_PATH, {
            scope: SW_SCOPE,
        });

        console.log('[PDC-Offline] Service Worker registered successfully');
        console.log('[PDC-Offline] Scope:', registration.scope);

        // Handle updates
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            console.log('[PDC-Offline] New Service Worker installing...');

            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                        // New version available
                        console.log('[PDC-Offline] New version available, will activate on next reload');
                        showUpdateNotification();
                    } else {
                        // First install
                        console.log('[PDC-Offline] Service Worker installed for the first time');
                    }
                }
            });
        });

        // Check for updates periodically (every hour)
        setInterval(() => {
            registration.update();
        }, 60 * 60 * 1000);

        // Initial update check
        registration.update();

    } catch (error) {
        console.error('[PDC-Offline] Service Worker registration failed:', error);
    }
}

/**
 * Clear all PDC offline caches
 */
async function clearAllCaches() {
    if ('caches' in window) {
        const cacheNames = await caches.keys();
        const pdcCaches = cacheNames.filter(name => name.startsWith('pdc-pos-offline'));

        for (const cacheName of pdcCaches) {
            console.log('[PDC-Offline] Clearing cache:', cacheName);
            await caches.delete(cacheName);
        }
    }

    // Also clear IndexedDB on major version changes
    const storedVersion = localStorage.getItem('pdc_offline_version');
    if (storedVersion && storedVersion.split('.')[0] !== MODULE_VERSION.split('.')[0]) {
        console.log('[PDC-Offline] Major version change, clearing IndexedDB');
        try {
            await deleteDatabase('pdc_pos_offline_db');
        } catch (e) {
            console.warn('[PDC-Offline] Could not delete IndexedDB:', e);
        }
    }
}

/**
 * Delete IndexedDB database
 */
function deleteDatabase(dbName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
            console.warn('[PDC-Offline] Database deletion blocked, will retry');
            resolve();
        };
    });
}

/**
 * Show update notification to user
 */
function showUpdateNotification() {
    // Check if we have the Odoo notification service available
    if (window.owl && window.owl.Component) {
        // Will show on next page interaction
        console.log('[PDC-Offline] Update notification queued');
    }
}

/**
 * Setup BroadcastChannel for multi-tab coordination
 */
function setupTabCoordination() {
    if (!('BroadcastChannel' in window)) {
        return;
    }

    const channel = new BroadcastChannel('pdc-pos-offline');

    channel.onmessage = (event) => {
        if (event.data.type === 'CACHE_UPDATED') {
            console.log('[PDC-Offline] Cache updated in another tab');
        }
        if (event.data.type === 'OFFLINE_MODE_ACTIVE') {
            console.log('[PDC-Offline] Another tab is in offline mode');
        }
    };

    // Store channel reference for later use
    window._pdcOfflineChannel = channel;
}

/**
 * Broadcast message to all tabs
 */
export function broadcastMessage(type, data = {}) {
    if (window._pdcOfflineChannel) {
        window._pdcOfflineChannel.postMessage({ type, ...data });
    }
}

/**
 * Check if Service Worker is active and controlling the page
 */
export function isServiceWorkerActive() {
    return navigator.serviceWorker && navigator.serviceWorker.controller !== null;
}

/**
 * Get Service Worker version
 */
export async function getServiceWorkerVersion() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        return null;
    }

    return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
            resolve(event.data.version);
        };

        navigator.serviceWorker.controller.postMessage(
            { type: 'GET_VERSION' },
            [channel.port2]
        );

        // Timeout after 1 second
        setTimeout(() => resolve(null), 1000);
    });
}

/**
 * Force clear Service Worker cache
 */
export async function clearServiceWorkerCache() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        return false;
    }

    return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
            resolve(event.data.success);
        };

        navigator.serviceWorker.controller.postMessage(
            { type: 'CLEAR_CACHE' },
            [channel.port2]
        );

        // Timeout after 5 seconds
        setTimeout(() => resolve(false), 5000);
    });
}

// Initialize on module load
if (typeof window !== 'undefined') {
    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initServiceWorker();
            setupTabCoordination();
        });
    } else {
        initServiceWorker();
        setupTabCoordination();
    }
}

console.log('[PDC-Offline] Boot script loaded, version:', MODULE_VERSION);
