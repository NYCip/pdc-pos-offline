/** @odoo-module */

/**
 * Service Worker Registration for PDC POS Offline
 *
 * This module registers the service worker when the POS loads,
 * enabling true offline-first operation.
 */

// Use controller route for proper Service-Worker-Allowed header
const SW_PATH = '/pdc_pos_offline/sw.js';

export class ServiceWorkerManager {
    constructor() {
        this.registration = null;
        this.isSupported = 'serviceWorker' in navigator;
    }

    async register() {
        if (!this.isSupported) {
            console.warn('[PDC-Offline] Service Workers not supported in this browser');
            return false;
        }

        try {
            this.registration = await navigator.serviceWorker.register(SW_PATH, {
                scope: '/'
            });

            console.log('[PDC-Offline] Service Worker registered:', this.registration.scope);

            // Handle updates
            this.registration.addEventListener('updatefound', () => {
                const newWorker = this.registration.installing;
                console.log('[PDC-Offline] Service Worker update found');

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[PDC-Offline] New Service Worker available');
                        // Could notify user to refresh for updates
                    }
                });
            });

            return true;
        } catch (error) {
            console.error('[PDC-Offline] Service Worker registration failed:', error);
            return false;
        }
    }

    async unregister() {
        if (this.registration) {
            await this.registration.unregister();
            console.log('[PDC-Offline] Service Worker unregistered');
        }
    }

    /**
     * Tell service worker to cache specific assets
     * Call this after POS fully loads to cache current assets
     */
    async cacheCurrentAssets() {
        if (!navigator.serviceWorker.controller) return;

        // Collect all loaded script and style URLs
        const scripts = Array.from(document.querySelectorAll('script[src]'))
            .map(s => s.src)
            .filter(url => url.includes('/static/'));

        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map(l => l.href)
            .filter(url => url.includes('/static/'));

        const allAssets = [...scripts, ...styles, window.location.pathname];

        navigator.serviceWorker.controller.postMessage({
            type: 'CACHE_ASSETS',
            urls: allAssets
        });

        console.log('[PDC-Offline] Requested caching of', allAssets.length, 'assets');
    }

    /**
     * Get cache status from service worker
     */
    async getCacheStatus() {
        return new Promise((resolve) => {
            if (!navigator.serviceWorker.controller) {
                resolve({ cacheSize: 0, cacheName: null });
                return;
            }

            const channel = new MessageChannel();
            channel.port1.onmessage = (event) => resolve(event.data);

            navigator.serviceWorker.controller.postMessage(
                { type: 'GET_CACHE_STATUS' },
                [channel.port2]
            );

            // Timeout fallback
            setTimeout(() => resolve({ cacheSize: 0, cacheName: null }), 1000);
        });
    }
}

// Auto-register on module load
const swManager = new ServiceWorkerManager();

// Register when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => swManager.register());
} else {
    swManager.register();
}

export { swManager };
