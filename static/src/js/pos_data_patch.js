/** @odoo-module */
/**
 * PDC POS Offline - PosData Patch v2.0
 *
 * This is the ONLY integration point with native Odoo 19 POS.
 * Patches PosData.loadInitialData() to:
 * 1. Cache data to IndexedDB on successful online load
 * 2. Load data from IndexedDB cache when offline
 *
 * Uses native Odoo 19 authentication - no custom auth logic needed.
 * The cached hr.employee data includes _pin (SHA-1 hash) which the
 * native select_cashier_mixin.js uses for PIN validation.
 */

import { PosData } from "@point_of_sale/app/services/data_service";
import { patch } from "@web/core/utils/patch";
import { offlineDB } from "./offline_db";
import { broadcastMessage } from "./pos_offline_boot";

// Models to cache for offline operation
const MODELS_TO_CACHE = [
    'hr.employee',
    'res.users',
    'product.product',
    'pos.category',
    'pos.payment.method',
    'account.tax',
    'pos.config',
    'res.company',
    'res.currency',
];

patch(PosData.prototype, {
    /**
     * Override loadInitialData to add offline caching/restoration
     */
    async loadInitialData() {
        try {
            // Attempt normal online load
            console.log('[PDC-Offline] Attempting online data load...');
            const data = await super.loadInitialData();

            // SUCCESS: Cache data for offline use
            console.log('[PDC-Offline] Online load successful, caching data...');
            await this._cacheDataForOffline(data);

            // Broadcast to other tabs
            if (typeof broadcastMessage === 'function') {
                broadcastMessage('CACHE_UPDATED', { timestamp: Date.now() });
            }

            return data;

        } catch (error) {
            // Check if this is a network error AND we should try offline
            if (this._isOfflineError(error)) {
                console.log('[PDC-Offline] Network error detected, loading from cache...');

                try {
                    const cachedData = await this._loadFromOfflineCache();

                    // Mark that we're in offline mode
                    this._offlineMode = true;
                    this._offlineSince = Date.now();

                    // Broadcast to other tabs
                    if (typeof broadcastMessage === 'function') {
                        broadcastMessage('OFFLINE_MODE_ACTIVE', { since: this._offlineSince });
                    }

                    console.log('[PDC-Offline] Successfully loaded from cache');
                    return cachedData;

                } catch (cacheError) {
                    console.error('[PDC-Offline] Cache load failed:', cacheError);
                    // Re-throw original error with helpful message
                    throw new Error(
                        `POS cannot start: Server unreachable and no offline cache available.\n` +
                        `Original error: ${error.message}\n` +
                        `Please connect to the server and open POS at least once to enable offline mode.`
                    );
                }
            }

            // Non-network error (auth, server error, etc.) - propagate
            throw error;
        }
    },

    /**
     * Check if error indicates offline/network failure
     */
    _isOfflineError(error) {
        // Browser offline
        if (!navigator.onLine) {
            return true;
        }

        // Network service indicates offline
        if (this.network && this.network.offline) {
            return true;
        }

        // Common network error messages
        const networkErrorPatterns = [
            'Failed to fetch',
            'NetworkError',
            'Network request failed',
            'net::ERR_',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'The network connection was lost',
            'A server with the specified hostname could not be found',
        ];

        const errorMessage = error.message || String(error);
        return networkErrorPatterns.some(pattern =>
            errorMessage.toLowerCase().includes(pattern.toLowerCase())
        );
    },

    /**
     * Cache POS data to IndexedDB for offline use
     */
    async _cacheDataForOffline(data) {
        try {
            console.log('[PDC-Offline] Caching data for offline use...');

            // Cache hr.employee (critical for login)
            // These include _pin (SHA-1 hash) for native authentication
            if (data['hr.employee'] && data['hr.employee'].length > 0) {
                await offlineDB.saveEmployees(data['hr.employee']);
                console.log(`[PDC-Offline] Cached ${data['hr.employee'].length} employees`);
            }

            // Cache other models
            for (const modelName of MODELS_TO_CACHE) {
                if (modelName === 'hr.employee') continue; // Already handled

                if (data[modelName] && data[modelName].length > 0) {
                    try {
                        await offlineDB.saveModelData(modelName, data[modelName]);
                    } catch (modelError) {
                        // Non-critical - log and continue
                        console.warn(`[PDC-Offline] Failed to cache ${modelName}:`, modelError);
                    }
                }
            }

            console.log('[PDC-Offline] Data caching complete');

        } catch (error) {
            // Caching failure is not critical - POS can still work online
            console.error('[PDC-Offline] Data caching failed:', error);
        }
    },

    /**
     * Load POS data from IndexedDB cache
     */
    async _loadFromOfflineCache() {
        console.log('[PDC-Offline] Loading data from offline cache...');

        const cachedData = {};

        // Load hr.employee (critical for authentication)
        const employees = await offlineDB.getEmployees();
        if (employees && employees.length > 0) {
            // Return in the exact format native Odoo expects
            cachedData['hr.employee'] = employees;
            console.log(`[PDC-Offline] Loaded ${employees.length} cached employees`);
        }

        // Load other models
        for (const modelName of MODELS_TO_CACHE) {
            if (modelName === 'hr.employee') continue; // Already handled

            const records = await offlineDB.getModelData(modelName);
            if (records && records.length > 0) {
                cachedData[modelName] = records;
            }
        }

        // Validate minimum data for operation
        if (!cachedData['hr.employee']?.length && !cachedData['res.users']?.length) {
            throw new Error(
                'No cached user data available.\n' +
                'Please open POS while connected to the server at least once.'
            );
        }

        // Log what we loaded
        const modelCounts = Object.entries(cachedData)
            .map(([model, records]) => `${model}: ${records.length}`)
            .join(', ');
        console.log(`[PDC-Offline] Loaded cached data: ${modelCounts}`);

        return cachedData;
    },

    /**
     * Check if currently in offline mode
     */
    isOfflineMode() {
        return this._offlineMode === true;
    },

    /**
     * Get offline mode start time
     */
    getOfflineSince() {
        return this._offlineSince || null;
    },
});

console.log('[PDC-Offline] PosData patch loaded - v2.0');
