/** @odoo-module */

/**
 * Service Worker Registration for PDC POS Offline
 *
 * DEPRECATED: Odoo 19 has native Service Worker at /pos/service-worker.js
 *
 * This module has been disabled to avoid conflicts with Odoo's native
 * Service Worker implementation. Odoo 19 handles offline caching and
 * PWA functionality natively for the POS application.
 *
 * See: https://www.odoo.com/documentation/19.0/developer/reference/frontend/services.html
 *
 * The PDC POS Offline module focuses only on:
 * - Offline PIN authentication
 * - Session persistence in IndexedDB
 * - Connection monitoring for online/offline transitions
 *
 * Asset caching is delegated to Odoo's native Service Worker.
 *
 * @deprecated Since 19.0.1.0.2 - Odoo 19 has native Service Worker
 */

// REMOVED: Auto-registration code that conflicted with Odoo's native SW
// The original code registered at '/' scope which could interfere with
// Odoo's /pos/service-worker.js

/**
 * ServiceWorkerManager - DEPRECATED
 *
 * This class is kept as a stub for backward compatibility in case
 * any code imports it, but all functionality has been removed.
 *
 * @deprecated Use Odoo's native Service Worker instead
 */
export class ServiceWorkerManager {
    constructor() {
        this.registration = null;
        this.isSupported = false; // Disabled - use Odoo's native SW
        console.info(
            '[PDC-Offline] Custom Service Worker disabled. ' +
            'Odoo 19 native Service Worker handles asset caching.'
        );
    }

    /**
     * @deprecated No longer registers - Odoo 19 has native SW
     * @returns {Promise<boolean>} Always returns false
     */
    async register() {
        // Intentionally disabled - Odoo 19 handles this natively
        console.info('[PDC-Offline] SW registration skipped - using Odoo native SW');
        return false;
    }

    /**
     * @deprecated No-op
     */
    async unregister() {
        // No-op - nothing to unregister
    }

    /**
     * @deprecated Odoo's native SW handles asset caching
     */
    async cacheCurrentAssets() {
        // No-op - Odoo's native SW handles this
    }

    /**
     * @deprecated No custom SW cache to check
     * @returns {Promise<{cacheSize: number, cacheName: null}>}
     */
    async getCacheStatus() {
        return { cacheSize: 0, cacheName: null };
    }
}

// Export stub instance for backward compatibility
// (in case other code imports swManager)
const swManager = new ServiceWorkerManager();

export { swManager };
