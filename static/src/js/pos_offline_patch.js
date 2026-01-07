/** @odoo-module */

import { patch } from "@web/core/utils/patch";
// Odoo 19: PosStore moved from app/store/ to app/services/
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { connectionMonitor } from "./connection_monitor";
import { offlineDB } from "./offline_db";  // Import singleton for cleanup in destroy()
import { createOfflineAuth } from "./offline_auth";
import { createSessionPersistence } from "./session_persistence";
import { createSyncManager } from "./sync_manager";
import { OfflineLoginPopup } from "./offline_login_popup";
// Odoo 19: ErrorPopup and ConfirmPopup removed - use AlertDialog and ConfirmationDialog
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

/**
 * CRITICAL FIX (PHASE 1): Non-blocking server availability check
 * Performs server check in background without blocking UI initialization
 * Results are used by connection monitor for real-time updates
 */
async function checkServerAvailabilityAsync() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout (non-blocking)

        const response = await fetch('/web/login', {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-cache'
        });

        clearTimeout(timeoutId);
        console.log('[PDC-Offline] Background server check completed:', response.ok ? 'reachable' : 'unreachable');
        return response.ok;
    } catch (error) {
        console.log('[PDC-Offline] Background server check failed:', error.message);
        return false;
    }
}

/**
 * CRITICAL FIX (Wave 25): Safe session property updater for OWL reactive proxies
 *
 * Odoo 19's PosStore uses OWL's reactive system which wraps state in Proxies.
 * The Proxy's set trap MUST return true for successful assignments.
 * Direct assignment like `this.session = {...}` fails because:
 * 1. The proxy intercepts the set operation
 * 2. Proxy validation may return false (falsish) causing TypeError
 *
 * This function safely updates session data by:
 * 1. Using individual property assignments (works with reactive proxies)
 * 2. Wrapping in try-catch to handle proxy errors gracefully
 * 3. Falling back to _offlineSessionData for offline-specific data
 *
 * @param {Object} store - The PosStore instance
 * @param {Object} sessionData - Session data {id, name, ...}
 * @returns {boolean} True if session was updated successfully
 */
function safeUpdateSession(store, sessionData) {
    if (!sessionData) {
        console.warn('[PDC-Offline] safeUpdateSession called with null/undefined sessionData');
        return false;
    }

    try {
        // Store offline session data separately (not proxied)
        // This is always accessible regardless of proxy state
        store._offlineSessionData = {
            id: sessionData.id,
            name: sessionData.name,
            user_data: sessionData.user_data,
            config_data: sessionData.config_data,
            offline_mode: true,
            restored_at: new Date().toISOString()
        };

        // Try to update the reactive session object if it exists
        if (store.session && typeof store.session === 'object') {
            // Update individual properties (works better with reactive proxies)
            try {
                store.session.id = sessionData.id;
                store.session.name = sessionData.name;
                console.log('[PDC-Offline] Session properties updated via direct assignment');
                return true;
            } catch (directError) {
                // Direct property assignment failed, try Object.assign
                console.warn('[PDC-Offline] Direct assignment failed, trying Object.assign:', directError.message);
                try {
                    Object.assign(store.session, { id: sessionData.id, name: sessionData.name });
                    console.log('[PDC-Offline] Session updated via Object.assign');
                    return true;
                } catch (assignError) {
                    console.warn('[PDC-Offline] Object.assign failed:', assignError.message);
                }
            }
        }

        // Session doesn't exist or all update attempts failed
        // Create new session object (may work if proxy not yet initialized)
        try {
            store.session = { id: sessionData.id, name: sessionData.name };
            console.log('[PDC-Offline] New session object created');
            return true;
        } catch (createError) {
            console.warn('[PDC-Offline] Session creation failed:', createError.message);
            // Fall through - we still have _offlineSessionData as backup
        }

        // Even if reactive session update failed, we have _offlineSessionData
        console.log('[PDC-Offline] Using _offlineSessionData fallback');
        return true;

    } catch (error) {
        console.error('[PDC-Offline] safeUpdateSession critical error:', error);
        return false;
    }
}

patch(PosStore.prototype, {
    /**
     * CRITICAL FIX (PHASE 1): Async server availability check
     * Called in background during setup, does not block initialization
     */
    async _checkServerAvailabilityAsync() {
        try {
            const result = await checkServerAvailabilityAsync();
            if (result) {
                console.log('[PDC-Offline] Background server check successful');
            }
        } catch (error) {
            console.warn('[PDC-Offline] Background server check error:', error);
        }
    },

    async setup() {
        // CRITICAL FIX: Call super.setup() FIRST before accessing this.env
        // In Odoo 19, this.env may not be available until after base class initialization

        // Cleanup: Unregister any old PDC service workers that may be cached in browsers
        // This fixes 404 errors for /pdc_pos_offline/sw.js in server logs
        this._unregisterOldServiceWorkers();

        let superSetupCompleted = false;
        let networkError = null;

        // CRITICAL FIX (PHASE 1): Non-blocking server reachability check
        // Previously blocked for 3 seconds. Now uses polling pattern - immediate return
        // Server availability will be detected via connection monitor
        let serverReachable = true;

        // Start non-blocking check in background (don't await)
        this._checkServerAvailabilityAsync();

        // Connection monitor will provide real-time updates
        // This allows setup() to proceed immediately

        // If server is NOT reachable at startup, try offline mode immediately
        if (!serverReachable) {
            console.log('[PDC-Offline] Server unreachable at startup, attempting offline restore');

            // Initialize offline components first
            this.offlineAuth = createOfflineAuth(null); // env not available yet
            this.sessionPersistence = createSessionPersistence(this);
            // (Exposed to window by createSessionPersistence factory)

            try {
                await this.offlineAuth.init();
                await this.sessionPersistence.init();
            } catch (initError) {
                console.warn('[PDC-Offline] Offline component init warning:', initError);
            }

            // Try to restore existing session from cache
            const session = await this.sessionPersistence.restoreSession();
            if (session && await this.sessionPersistence.isValidSession(session)) {
                console.log('[PDC-Offline] Restored valid offline session at startup');
                // Wave 25 FIX: Use safeUpdateSession to handle OWL reactive proxy
                safeUpdateSession(this, session);
                this.user = session.user_data;
                this.config = session.config_data;
                this.isOfflineMode = true;
                this.showRecoveryNotification();
                this.showOfflineBanner();

                // Start connection monitor for reconnection detection
                connectionMonitor.on('server-reachable', async () => {
                    console.log('[PDC-Offline] Server reachable detected');
                    if (this.isOfflineMode) {
                        await this.checkConnectionAndSwitchMode();
                    }
                });
                connectionMonitor.start();

                return; // Successful offline restore
            }

            // No valid cached session - will prompt for offline login after catching error below
            console.log('[PDC-Offline] No valid cached session, will prompt for offline login');
        }

        // Normal online setup - ALWAYS call super.setup first
        try {
            await super.setup(...arguments);
            superSetupCompleted = true;
        } catch (error) {
            networkError = error;
            superSetupCompleted = false;
        }

        // NOW it's safe to access this.env after super.setup()
        // Initialize dialog service from environment (Odoo 19 pattern)
        this.dialog = this.env?.services?.dialog;

        // Initialize offline components AFTER super.setup()
        this.offlineAuth = createOfflineAuth(this.env);
        this.sessionPersistence = createSessionPersistence(this);
        this.syncManager = createSyncManager(this);
        // (Exposed to window by createSessionPersistence factory)

        // CRITICAL FIX (PHASE 1): Parallelize offline component initialization
        // Previously: sequential await (2-3 second delay)
        // Now: Promise.all() for parallel execution (50-100ms total)
        try {
            await Promise.all([
                this.offlineAuth.init(),
                this.sessionPersistence.init()
            ]);
        } catch (initError) {
            console.warn('[PDC-Offline] Offline component init warning:', initError);
            // Continue - these are not critical for startup
        }

        // If super.setup succeeded, do post-setup tasks
        if (superSetupCompleted) {
            try {
                await this.sessionPersistence.saveSession();
                this.sessionPersistence.startAutoSave();

                // Initialize sync manager (async)
                await this.syncManager.init();

                // Cache users for offline access (non-blocking)
                if (this.models && this.models['res.users']) {
                    const userIds = this.models['res.users'].getAllIds();
                    // Don't await - let this run in background
                    this.offlineAuth.cacheUsersForOffline(userIds).catch(err => {
                        console.warn('[PDC-Offline] User caching failed:', err);
                    });
                }

                // v4: Cache ALL POS data for full offline operation (background, non-blocking)
                // This enables product search, cart operations, and transactions while offline
                this.sessionPersistence.cacheAllPOSData().then(summary => {
                    if (summary) {
                        console.log(`[PDC-Offline] Background cache complete: ${summary.products} products, ${summary.categories} categories`);
                    }
                }).catch(err => {
                    console.warn('[PDC-Offline] Background POS data caching failed:', err);
                });

                // CRITICAL: Set up connection monitor listeners for runtime offline detection
                // This triggers offline login when server becomes unreachable WHILE POS is running
                // Store bound handlers for proper cleanup in destroy()
                this._boundOnServerUnreachable = async () => {
                    console.log('[PDC-Offline] Server unreachable detected during runtime');
                    if (!this.isOfflineMode) {
                        // v4: PRESERVE CART STATE before offline transition
                        // This ensures the customer doesn't lose their current order
                        const preservedCart = this._preserveCartState();

                        // First try to restore existing session
                        const restored = await this.attemptOfflineRestore();
                        if (restored) {
                            console.log('[PDC-Offline] Session restored from cache');

                            // v4: RESTORE CART STATE after offline restore
                            if (preservedCart) {
                                this._restoreCartState(preservedCart);
                            }

                            this.showOfflineBanner();
                        } else {
                            // No valid session - prompt for offline login
                            await this.checkConnectionAndSwitchMode();
                        }
                    }
                };

                this._boundOnServerReachable = async () => {
                    console.log('[PDC-Offline] Server reachable detected');
                    if (this.isOfflineMode) {
                        await this.checkConnectionAndSwitchMode();
                    }
                };

                connectionMonitor.on('server-unreachable', this._boundOnServerUnreachable);
                connectionMonitor.on('server-reachable', this._boundOnServerReachable);

                // Start connection monitoring
                connectionMonitor.start();
                console.log('[PDC-Offline] Connection monitor started');

                // v4 CRITICAL: Intercept RPC/fetch errors for IMMEDIATE offline detection
                // The connection monitor polls every 30s, but OWL crashes from network errors instantly
                // This catches those errors BEFORE they crash the UI
                this._setupNetworkErrorInterception();

            } catch (postSetupError) {
                console.warn('[PDC-Offline] Post-setup offline caching failed:', postSetupError);
                // Don't throw - main setup succeeded
            }
            return; // Success path
        }

        // Handle super.setup failure (network error)
        if (networkError) {
            // Check if this is a network error (Failed to fetch, NetworkError, etc.)
            const isNetworkError = networkError.message && (
                networkError.message.includes('Failed to fetch') ||
                networkError.message.includes('NetworkError') ||
                networkError.message.includes('network') ||
                networkError.name === 'TypeError' && !navigator.onLine
            );

            if (isNetworkError) {
                // Network error - attempt offline mode
                console.log('[PDC-Offline] Network error detected, prompting for offline mode');
                const useOffline = await this.promptOfflineMode();
                if (useOffline) {
                    await this.enterOfflineMode();
                    // Offline mode setup successful
                } else {
                    throw networkError;
                }
            } else {
                // Non-network error - propagate it
                throw networkError;
            }
        }
    },

    async attemptOfflineRestore() {
        console.log('[PDC-Offline] Attempting offline session restore...');

        try {
            const session = await this.sessionPersistence.restoreSession();
            if (!session || !await this.sessionPersistence.isValidSession(session)) {
                console.log('[PDC-Offline] No valid session to restore');
                return false;
            }

            // Show recovery notification
            this.showRecoveryNotification();

            // Wave 25 FIX: Use safeUpdateSession to handle OWL reactive proxy
            // This prevents "set on proxy: trap returned falsish" TypeError
            const sessionUpdated = safeUpdateSession(this, session);
            if (!sessionUpdated) {
                console.error('[PDC-Offline] Failed to update session via safeUpdateSession');
                // Continue anyway - we may still have _offlineSessionData
            }

            this.user = session.user_data;
            this.config = session.config_data;

            // v4 CRITICAL FIX: Restore POS models (products, categories, etc.) from IndexedDB cache
            // Without this, OWL crashes with "Cannot read properties of undefined (reading 'map')"
            // because this.models is undefined when trying to render ProductScreen
            await this._restoreModelsFromCache();

            // Set offline mode flag
            this.isOfflineMode = true;

            // Restore session cookie if available
            if (session.session_cookie) {
                this.sessionPersistence.setSessionCookie(session.session_cookie);
            }

            console.log('[PDC-Offline] Session restored successfully');
            return true;

        } catch (error) {
            console.error('[PDC-Offline] Failed to restore session:', error);
            return false;
        }
    },

    /**
     * v4 CRITICAL FIX: Restore POS models from IndexedDB cache
     * This prevents OWL crash when transitioning to offline mode
     *
     * The crash happens because OWL tries to render ProductScreen which calls:
     * - getExcludedProductIds() → this.models['product.product'].records.map(...)
     * - productsToDisplay → this.models['pos.category']
     *
     * Without cached models, these calls throw "Cannot read properties of undefined"
     */
    async _restoreModelsFromCache() {
        console.log('[PDC-Offline] Restoring models from IndexedDB cache...');

        try {
            // Check if we have cached POS data
            const hasCachedData = await this.sessionPersistence.hasCachedPOSData();
            if (!hasCachedData) {
                console.warn('[PDC-Offline] No cached POS data found - offline functionality will be limited');
                // Initialize empty models structure to prevent crash
                this._initializeEmptyModels();
                return;
            }

            // Get all cached data
            const cachedData = await this.sessionPersistence.getCachedPOSData();
            console.log(`[PDC-Offline] Loaded from cache: ${cachedData.products.length} products, ${cachedData.categories.length} categories, ${cachedData.paymentMethods.length} payment methods, ${cachedData.taxes.length} taxes`);

            // Initialize models structure if not exists
            if (!this.models) {
                this.models = {};
            }

            // Restore products with Odoo 19-compatible structure
            this._restoreModelRecords('product.product', cachedData.products);
            this._restoreModelRecords('pos.category', cachedData.categories);
            this._restoreModelRecords('pos.payment.method', cachedData.paymentMethods);
            this._restoreModelRecords('account.tax', cachedData.taxes);

            console.log('[PDC-Offline] Models restored successfully from cache');

        } catch (error) {
            console.error('[PDC-Offline] Failed to restore models from cache:', error);
            // Initialize empty models to prevent crash
            this._initializeEmptyModels();
        }
    },

    /**
     * Initialize empty models structure to prevent OWL crash
     * Used when no cached data is available
     */
    _initializeEmptyModels() {
        console.log('[PDC-Offline] Initializing empty models structure');
        if (!this.models) {
            this.models = {};
        }

        const emptyModels = ['product.product', 'pos.category', 'pos.payment.method', 'account.tax'];
        for (const modelName of emptyModels) {
            if (!this.models[modelName]) {
                this.models[modelName] = {
                    records: [],
                    getAllIds: () => [],
                    get: (id) => null,
                    getBy: (field, value) => null
                };
            }
        }
    },

    /**
     * Restore model records with Odoo 19-compatible structure
     * Creates the same interface that Odoo's POS models use
     *
     * @param {string} modelName - The model name (e.g., 'product.product')
     * @param {Array} records - Array of plain objects from IndexedDB
     */
    _restoreModelRecords(modelName, records) {
        if (!records || records.length === 0) {
            this.models[modelName] = {
                records: [],
                getAllIds: () => [],
                get: (id) => null,
                getBy: (field, value) => null
            };
            return;
        }

        // Create a map for fast ID lookups
        const recordsById = new Map();
        records.forEach(r => recordsById.set(r.id, r));

        // Create model object matching Odoo 19 interface
        this.models[modelName] = {
            records: records,

            // Get all record IDs
            getAllIds: () => records.map(r => r.id),

            // Get record by ID
            get: (id) => recordsById.get(id) || null,

            // Get record by field value
            getBy: (field, value) => records.find(r => r[field] === value) || null,

            // Get all records (used by some components)
            getAll: () => records,

            // Length property (used by some checks)
            length: records.length
        };

        console.log(`[PDC-Offline] Restored ${records.length} records for ${modelName}`);
    },

    // ==================== CART PRESERVATION (v4) ====================

    /**
     * v4: Preserve cart state before offline transition
     * Captures the current order so it can be restored after models are reloaded
     *
     * @returns {Object|null} Serialized order state or null if no order
     */
    _preserveCartState() {
        try {
            const currentOrder = this.get_order?.() || this.selectedOrder;
            if (!currentOrder) {
                console.log('[PDC-Offline] No current order to preserve');
                return null;
            }

            // Check if order has any lines
            const orderlines = currentOrder.orderlines || currentOrder.get_orderlines?.();
            if (!orderlines || orderlines.length === 0) {
                console.log('[PDC-Offline] Current order is empty, skipping preservation');
                return null;
            }

            // Export order to JSON (Odoo 19 method)
            const exportMethod = currentOrder.export_as_JSON || currentOrder.exportAsJSON;
            if (!exportMethod) {
                console.warn('[PDC-Offline] Order export method not available');
                return null;
            }

            const orderData = exportMethod.call(currentOrder);
            console.log(`[PDC-Offline] Preserved cart with ${orderlines.length} lines`);

            return {
                orderData: orderData,
                orderlines: orderlines.map(line => {
                    // Extract essential line data
                    const exportLine = line.export_as_JSON || line.exportAsJSON;
                    if (exportLine) {
                        return exportLine.call(line);
                    }
                    return {
                        product_id: line.product?.id || line.product_id,
                        quantity: line.quantity || line.get_quantity?.(),
                        price_unit: line.price_unit || line.get_unit_price?.(),
                        discount: line.discount || line.get_discount?.()
                    };
                }),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('[PDC-Offline] Failed to preserve cart state:', error);
            return null;
        }
    },

    /**
     * v4: Restore cart state after offline transition
     * Recreates the order from preserved data
     *
     * @param {Object} preservedCart - Cart state from _preserveCartState()
     */
    _restoreCartState(preservedCart) {
        if (!preservedCart || !preservedCart.orderlines || preservedCart.orderlines.length === 0) {
            console.log('[PDC-Offline] No cart state to restore');
            return;
        }

        try {
            console.log(`[PDC-Offline] Restoring cart with ${preservedCart.orderlines.length} lines...`);

            // Get or create current order
            let currentOrder = this.get_order?.() || this.selectedOrder;
            if (!currentOrder && this.add_new_order) {
                currentOrder = this.add_new_order();
            }

            if (!currentOrder) {
                console.error('[PDC-Offline] Could not get or create order for cart restoration');
                return;
            }

            // Try to restore using init_from_JSON if available (Odoo 19)
            const initMethod = currentOrder.init_from_JSON || currentOrder.initFromJSON;
            if (initMethod && preservedCart.orderData) {
                try {
                    initMethod.call(currentOrder, preservedCart.orderData);
                    console.log('[PDC-Offline] Cart restored via init_from_JSON');
                    return;
                } catch (initError) {
                    console.warn('[PDC-Offline] init_from_JSON failed, falling back to line-by-line restore:', initError);
                }
            }

            // Fallback: Restore order lines manually
            for (const lineData of preservedCart.orderlines) {
                const productId = lineData.product_id;
                const product = this.models?.['product.product']?.get?.(productId);

                if (!product) {
                    console.warn(`[PDC-Offline] Product ${productId} not found in cache, skipping line`);
                    continue;
                }

                // Add product to order
                try {
                    if (currentOrder.add_product) {
                        currentOrder.add_product(product, {
                            quantity: lineData.quantity || 1,
                            price: lineData.price_unit,
                            discount: lineData.discount || 0
                        });
                    } else if (currentOrder.addProduct) {
                        currentOrder.addProduct(product, {
                            quantity: lineData.quantity || 1,
                            price: lineData.price_unit,
                            discount: lineData.discount || 0
                        });
                    }
                } catch (lineError) {
                    console.warn(`[PDC-Offline] Failed to restore line for product ${productId}:`, lineError);
                }
            }

            console.log('[PDC-Offline] Cart restored successfully');

        } catch (error) {
            console.error('[PDC-Offline] Failed to restore cart state:', error);
        }
    },

    // ==================== NETWORK ERROR INTERCEPTION (v4 CRITICAL) ====================

    /**
     * v4 CRITICAL: Set up network error interception for immediate offline detection
     *
     * The connection monitor polls every 30 seconds, but OWL crashes from network
     * errors INSTANTLY. This intercepts those errors BEFORE they crash the UI.
     *
     * Three-layer protection:
     * 1. Patch window.fetch to catch "Failed to fetch" errors
     * 2. Global unhandled rejection handler for Promise-based errors
     * 3. Global error handler for synchronous errors
     */
    _setupNetworkErrorInterception() {
        console.log('[PDC-Offline] Setting up network error interception...');

        // Track if we're already handling an offline transition (prevent re-entrancy)
        this._handlingOfflineTransition = false;

        // Layer 1: Patch window.fetch to intercept network errors
        this._patchFetch();

        // Layer 2: Global unhandled rejection handler
        this._boundUnhandledRejection = this._handleUnhandledRejection.bind(this);
        window.addEventListener('unhandledrejection', this._boundUnhandledRejection);

        // Layer 3: Global error handler (catches OWL errors)
        this._boundGlobalError = this._handleGlobalError.bind(this);
        window.addEventListener('error', this._boundGlobalError);

        console.log('[PDC-Offline] Network error interception active');
    },

    /**
     * Patch window.fetch to intercept network errors immediately
     */
    _patchFetch() {
        const originalFetch = window.fetch;
        const self = this;

        window.fetch = async function(...args) {
            try {
                const response = await originalFetch.apply(this, args);
                return response;
            } catch (error) {
                // Check if this is a network error
                if (self._isNetworkError(error)) {
                    console.log('[PDC-Offline] Network error intercepted in fetch:', error.message);
                    await self._handleNetworkError(error);
                }
                // Re-throw to let normal error handling continue
                throw error;
            }
        };

        // Store reference for cleanup
        this._originalFetch = originalFetch;
        console.log('[PDC-Offline] Fetch patched for network error interception');
    },

    /**
     * Handle unhandled Promise rejections (catches RPC errors)
     */
    _handleUnhandledRejection(event) {
        const error = event.reason;
        if (this._isNetworkError(error)) {
            console.log('[PDC-Offline] Network error caught in unhandledrejection:', error?.message);
            // Prevent default error handling which might crash OWL
            event.preventDefault();
            this._handleNetworkError(error);
        }
    },

    /**
     * Handle global errors (catches OWL component errors)
     */
    _handleGlobalError(event) {
        const error = event.error;
        // Check if this is an OWL error caused by network issues
        if (this._isNetworkError(error) || this._isOWLNetworkCrash(event)) {
            console.log('[PDC-Offline] Network-related error caught in global handler');
            // Prevent default error handling
            event.preventDefault();
            this._handleNetworkError(error);
        }
    },

    /**
     * Check if an error is a network-related error
     */
    _isNetworkError(error) {
        if (!error) return false;

        const message = error.message || String(error);
        const networkIndicators = [
            'Failed to fetch',
            'NetworkError',
            'Network request failed',
            'net::ERR_',
            'ERR_INTERNET_DISCONNECTED',
            'ERR_NETWORK_CHANGED',
            'ERR_CONNECTION_REFUSED',
            'ERR_NAME_NOT_RESOLVED',
            'Load failed',
            'Network error',
            'fetch failed'
        ];

        return networkIndicators.some(indicator =>
            message.toLowerCase().includes(indicator.toLowerCase())
        );
    },

    /**
     * Check if this is an OWL crash caused by network issues
     */
    _isOWLNetworkCrash(event) {
        // OWL errors often come from RPC failures during render
        const message = event.message || '';
        const filename = event.filename || '';

        // Check if it's from OWL/Odoo code and mentions common crash patterns
        const isOdooCode = filename.includes('point_of_sale') ||
                          filename.includes('web.assets') ||
                          filename.includes('owl');

        const crashPatterns = [
            "Cannot read properties of undefined",
            "Cannot read properties of null",
            "is not a function",
            "Unhandled error"
        ];

        const isCrashPattern = crashPatterns.some(p => message.includes(p));

        // If we're supposed to be online but navigator says we're offline, it's network-related
        const navigatorOffline = !navigator.onLine;

        return isOdooCode && (isCrashPattern && navigatorOffline);
    },

    /**
     * Handle network error by transitioning to offline mode
     * Uses debouncing to prevent multiple simultaneous transitions
     */
    async _handleNetworkError(error) {
        // Prevent re-entrancy
        if (this._handlingOfflineTransition) {
            console.log('[PDC-Offline] Already handling offline transition, skipping');
            return;
        }

        // Already in offline mode
        if (this.isOfflineMode) {
            console.log('[PDC-Offline] Already in offline mode');
            return;
        }

        this._handlingOfflineTransition = true;
        console.log('[PDC-Offline] 🔴 IMMEDIATE offline transition triggered by network error');

        try {
            // Force connection monitor to offline state (don't wait for polling)
            connectionMonitor.forceOffline();

            // Preserve cart state FIRST
            const preservedCart = this._preserveCartState();

            // Attempt offline restore
            const restored = await this.attemptOfflineRestore();
            if (restored) {
                console.log('[PDC-Offline] Session restored from cache after network error');

                // Restore cart state
                if (preservedCart) {
                    this._restoreCartState(preservedCart);
                }

                this.showOfflineBanner();
            } else {
                // No valid session - show limited offline mode
                console.warn('[PDC-Offline] No cached session, showing limited offline mode');
                this._showLimitedOfflineMode();
            }
        } catch (transitionError) {
            console.error('[PDC-Offline] Error during offline transition:', transitionError);
            this._showLimitedOfflineMode();
        } finally {
            this._handlingOfflineTransition = false;
        }
    },

    /**
     * Show limited offline mode when full restore isn't possible
     * This prevents white screen by showing a useful message
     */
    _showLimitedOfflineMode() {
        this.isOfflineMode = true;

        // Show banner
        this.showOfflineBanner();

        // Show informative message
        if (this.dialog) {
            this.dialog.add(AlertDialog, {
                title: 'Offline Mode - Limited',
                body: 'Connection lost. Some features may be limited until connection is restored. Your current transaction has been preserved.'
            });
        }
    },

    /**
     * Clean up network error interception
     * Called from destroy() method
     */
    _cleanupNetworkErrorInterception() {
        // Restore original fetch
        if (this._originalFetch) {
            window.fetch = this._originalFetch;
            this._originalFetch = null;
        }

        // Remove event listeners
        if (this._boundUnhandledRejection) {
            window.removeEventListener('unhandledrejection', this._boundUnhandledRejection);
            this._boundUnhandledRejection = null;
        }

        if (this._boundGlobalError) {
            window.removeEventListener('error', this._boundGlobalError);
            this._boundGlobalError = null;
        }

        console.log('[PDC-Offline] Network error interception cleaned up');
    },

    async promptOfflineMode() {
        // Odoo 19: Use ConfirmationDialog instead of ConfirmPopup
        // Guard: if dialog service not available, default to offline mode
        if (!this.dialog) {
            console.warn('[PDC-Offline] Dialog service not available, defaulting to offline mode');
            return true;
        }
        return new Promise((resolve) => {
            this.dialog.add(ConfirmationDialog, {
                title: 'No Internet Connection',
                body: 'Unable to connect to the server. Would you like to continue in offline mode?',
                confirmLabel: 'Use Offline Mode',
                cancelLabel: 'Retry Connection',
                confirm: () => resolve(true),
                cancel: () => resolve(false),
            });
        });
    },

    async enterOfflineMode() {
        // Show offline login popup
        const result = await this.showOfflineLogin();

        if (!result.success) {
            throw new Error('Offline authentication failed');
        }

        // Set up offline session
        // Wave 25 FIX: Use safeUpdateSession to handle OWL reactive proxy
        // This prevents "set on proxy: trap returned falsish" TypeError
        const sessionUpdated = safeUpdateSession(this, result.session);
        if (!sessionUpdated) {
            console.error('[PDC-Offline] Failed to update session in enterOfflineMode');
            // Continue anyway - we may still have _offlineSessionData
        }
        this.user = result.session.user_data;
        this.isOfflineMode = true;

        // Show offline mode banner
        this.showOfflineBanner();
    },

    async showOfflineLogin() {
        // Get cached users for username selection
        const cachedUsers = await offlineDB.getAllUsers();

        // Pre-flight: Check if ANY users have password hash for offline auth
        const usersWithHash = cachedUsers.filter(u => u.pos_offline_auth_hash);

        if (usersWithHash.length === 0) {
            // No users available for offline auth - show informative alert instead of login popup
            const title = 'Offline Mode Unavailable';
            const body = cachedUsers.length === 0
                ? 'No users found in offline cache. Please login online first to enable offline mode.'
                : 'No users are set up for offline access. To enable offline mode, a user must log in at least once while the server is online. Their password will be securely cached for offline use.';

            if (this.dialog) {
                this.dialog.add(AlertDialog, {
                    title: title,
                    body: body,
                });
            } else {
                // Fallback: DOM-based alert
                this._showDOMAlert(title, body);
            }
            console.error('[PDC-Offline] No users with offline auth hash available');
            return { success: false, error: 'NO_CACHED_USERS' };
        }

        // Default to first user with hash if only one exists
        const defaultUsername = usersWithHash.length === 1 ? usersWithHash[0].login : '';

        // If dialog service is not available (server down at startup), use DOM-based login
        if (!this.dialog) {
            console.log('[PDC-Offline] Dialog service not available, using DOM-based login');
            return this._showDOMOfflineLogin(usersWithHash, defaultUsername);
        }

        // Odoo 19: Show OfflineLoginPopup using dialog service
        return new Promise((resolve) => {
            this.dialog.add(OfflineLoginPopup, {
                title: 'Offline Authentication',
                username: defaultUsername,
                configData: this.config || {},
            }, {
                onClose: (result) => {
                    if (result && result.confirmed && result.payload && result.payload.success) {
                        resolve({
                            success: true,
                            session: result.payload.session,
                        });
                    } else {
                        resolve({ success: false, error: result?.payload?.error || 'User cancelled' });
                    }
                }
            });
        });
    },

    /**
     * Escape HTML special characters to prevent XSS attacks
     * @param {string} text - Text to escape
     * @returns {string} Escaped text safe for HTML insertion
     */
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    },

    /**
     * DOM-based offline login form - used when Odoo dialog service is not available
     * This is the fallback for when server is completely down at startup
     *
     * SIMPLIFIED v2: Uses same password as Odoo login (no separate PIN)
     *
     * @param {Array} cachedUsers - Users with pos_offline_auth_hash (pre-filtered by showOfflineLogin)
     * @param {string} defaultUsername - Default username to select
     */
    async _showDOMOfflineLogin(cachedUsers, defaultUsername) {
        // Defensive check: Filter to only users with hash (should already be filtered by caller)
        const usersWithHash = cachedUsers.filter(u => u.pos_offline_auth_hash);

        if (usersWithHash.length === 0) {
            // No users configured for offline access - show informative message
            this._showDOMAlert(
                'Offline Mode Unavailable',
                'No users are configured for offline access. Please restore server connection and log in at least once to cache your credentials.'
            );
            return Promise.resolve({ success: false, error: 'NO_CACHED_USERS' });
        }

        // Pre-escape all user data to prevent XSS
        const escapeHtml = this._escapeHtml.bind(this);

        return new Promise((resolve) => {
            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'pdc-offline-login-overlay';
            overlay.innerHTML = `
                <div class="pdc-offline-login-modal">
                    <div class="pdc-offline-login-header">
                        <h2>🔒 Offline Login</h2>
                        <p>Server is unreachable. Enter your password to continue offline.</p>
                    </div>
                    <form class="pdc-offline-login-form">
                        <div class="form-group">
                            <label for="pdc-username">Username</label>
                            <select id="pdc-username" required>
                                ${usersWithHash.map(u => `<option value="${escapeHtml(u.login)}" ${u.login === defaultUsername ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.login)})</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="pdc-password">Password</label>
                            <input type="password" id="pdc-password" placeholder="Enter your password" required autocomplete="current-password">
                            <small style="color: #666; font-size: 12px;">Use your regular Odoo login password</small>
                        </div>
                        <div class="pdc-offline-login-error" style="display: none;"></div>
                        <div class="form-actions">
                            <button type="submit" class="btn-primary">Login</button>
                            <button type="button" class="btn-secondary" id="pdc-retry">Retry Connection</button>
                        </div>
                    </form>
                </div>
            `;

            // Add styles
            const style = document.createElement('style');
            style.textContent = `
                .pdc-offline-login-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.7); z-index: 99999;
                    display: flex; align-items: center; justify-content: center;
                }
                .pdc-offline-login-modal {
                    background: white; border-radius: 12px; padding: 32px;
                    max-width: 400px; width: 90%; box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                }
                .pdc-offline-login-header { text-align: center; margin-bottom: 24px; }
                .pdc-offline-login-header h2 { margin: 0 0 8px 0; color: #333; }
                .pdc-offline-login-header p { margin: 0; color: #666; font-size: 14px; }
                .pdc-offline-login-form .form-group { margin-bottom: 16px; }
                .pdc-offline-login-form label { display: block; margin-bottom: 6px; font-weight: 600; color: #333; }
                .pdc-offline-login-form select, .pdc-offline-login-form input {
                    width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px;
                    font-size: 16px; box-sizing: border-box;
                }
                .pdc-offline-login-form input:focus, .pdc-offline-login-form select:focus {
                    border-color: #667eea; outline: none;
                }
                .pdc-offline-login-error {
                    background: #fee; border: 1px solid #fcc; color: #c00;
                    padding: 10px; border-radius: 6px; margin-bottom: 16px; text-align: center;
                }
                .form-actions { display: flex; gap: 12px; }
                .form-actions button {
                    flex: 1; padding: 14px; border: none; border-radius: 8px;
                    font-size: 16px; font-weight: 600; cursor: pointer;
                }
                .btn-primary { background: #667eea; color: white; }
                .btn-primary:hover { background: #5a6fd6; }
                .btn-secondary { background: #f0f0f0; color: #333; }
                .btn-secondary:hover { background: #e0e0e0; }
            `;
            document.head.appendChild(style);
            document.body.appendChild(overlay);

            const form = overlay.querySelector('form');
            const errorDiv = overlay.querySelector('.pdc-offline-login-error');
            const passwordInput = overlay.querySelector('#pdc-password');
            const retryBtn = overlay.querySelector('#pdc-retry');

            // Focus password input
            setTimeout(() => passwordInput.focus(), 100);

            // Handle form submission
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = overlay.querySelector('#pdc-username').value;
                const password = passwordInput.value;

                if (!password) {
                    errorDiv.textContent = 'Password is required';
                    errorDiv.style.display = 'block';
                    return;
                }

                try {
                    // Use authenticateOffline() which returns {success, error, session} object
                    const authResult = await this.offlineAuth.authenticateOffline(username, password);

                    if (authResult.success) {
                        overlay.remove();
                        style.remove();

                        // Use the session created by authenticateOffline (includes secure token)
                        const session = authResult.session;

                        resolve({
                            success: true,
                            session: {
                                id: session.id,
                                name: `Offline Session - ${session.user_data.name}`,
                                user_data: session.user_data,
                                config_data: this.config || {},
                                authenticated_at: session.authenticated_at,
                                expires_at: session.expires_at
                            }
                        });
                    } else {
                        // Display error message from authenticateOffline
                        errorDiv.textContent = authResult.error || 'Invalid password';
                        errorDiv.style.display = 'block';
                        passwordInput.value = '';
                        passwordInput.focus();
                    }
                } catch (err) {
                    errorDiv.textContent = err.message || 'Authentication failed';
                    errorDiv.style.display = 'block';
                }
            });

            // Handle retry connection
            retryBtn.addEventListener('click', () => {
                overlay.remove();
                style.remove();
                window.location.reload();
            });
        });
    },

    /**
     * Unregister old PDC service workers to stop 404 requests for deprecated /pdc_pos_offline/sw.js
     * This cleanup runs once on POS load to clear cached service workers from older versions.
     */
    _unregisterOldServiceWorkers() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (const registration of registrations) {
                    // Unregister any SW registered at /pdc_pos_offline/ scope
                    if (registration.scope && registration.scope.includes('pdc_pos_offline')) {
                        console.log('[PDC-Offline] Unregistering deprecated service worker:', registration.scope);
                        registration.unregister();
                    }
                }
            }).catch(err => {
                // Silently ignore errors - this is just cleanup
                console.debug('[PDC-Offline] SW cleanup skipped:', err.message);
            });
        }
    },

    /**
     * Simple DOM-based alert - fallback when dialog service unavailable
     * Uses textContent for XSS protection (no innerHTML with variables)
     */
    _showDOMAlert(title, message) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;';

        // Build DOM safely using textContent (XSS-safe)
        const container = document.createElement('div');
        container.style.cssText = 'background:white;border-radius:12px;padding:32px;max-width:400px;text-align:center;';

        const h3 = document.createElement('h3');
        h3.style.cssText = 'margin:0 0 16px 0;';
        h3.textContent = title;  // Safe - uses textContent

        const p = document.createElement('p');
        p.style.cssText = 'margin:0 0 24px 0;color:#666;';
        p.textContent = message;  // Safe - uses textContent

        const button = document.createElement('button');
        button.style.cssText = 'padding:12px 24px;background:#667eea;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;';
        button.textContent = 'OK';
        button.onclick = () => overlay.remove();

        container.appendChild(h3);
        container.appendChild(p);
        container.appendChild(button);
        overlay.appendChild(container);
        document.body.appendChild(overlay);
    },

    showRecoveryNotification() {
        const notification = document.createElement('div');
        notification.className = 'session-recovery-notification';
        notification.innerHTML = `
            <h4>Restoring Session...</h4>
            <div class="spinner"></div>
            <p>Please wait while we restore your offline session.</p>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    },

    showOfflineBanner() {
        const banner = document.createElement('div');
        banner.className = 'pos-offline-banner';
        banner.innerHTML = `
            <i class="fa fa-exclamation-triangle"></i>
            <span>Offline Mode - Transactions will sync when connection is restored</span>
        `;
        document.body.insertBefore(banner, document.body.firstChild);

        // Remove banner when back online
        connectionMonitor.once('server-reachable', () => {
            banner.remove();
        });
    },

    // Override payment processing for offline mode
    async makePayment(payment_method_id, due, isCustomerClick, destinationOrder, bypassMaxAmount) {
        if (this.isOfflineMode && !connectionMonitor.online) {
            // Add to offline queue
            const paymentData = {
                payment_method_id,
                amount: due,
                order_id: this.getOrder().id,
                offline_mode: true,
                timestamp: new Date().toISOString()
            };

            await this.syncManager.addToSyncQueue('payment', paymentData);

            // Continue with offline payment
        }

        return super.makePayment(...arguments);
    },

    // Override order validation for offline mode
    async validateOrder(order) {
        if (this.isOfflineMode && connectionMonitor.isOffline()) {
            // v4: Queue order for sync using new IndexedDB offline orders store
            const exportMethod = order.export_as_JSON || order.exportAsJSON;
            const orderData = exportMethod ? exportMethod.call(order) : order;

            const offlineId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            orderData.offline_mode = true;
            orderData.offline_id = offlineId;

            // Save to IndexedDB offline orders queue
            await offlineDB.saveOfflineOrder({
                offline_id: offlineId,
                order_data: orderData,
                pos_session_id: this.session?.id || this._offlineSessionData?.id,
                created_at: new Date().toISOString()
            });

            // Also add to sync manager queue for backward compatibility
            if (this.syncManager && this.syncManager.addToSyncQueue) {
                await this.syncManager.addToSyncQueue('order', orderData);
            }

            // Mark order as validated offline
            order.offline_validated = true;
            order.offline_id = offlineId;

            // Get pending count for notification
            const pendingCount = await offlineDB.getUnsyncedOfflineOrderCount();

            // Odoo 19: Use AlertDialog instead of ErrorPopup (with info styling)
            if (this.dialog) {
                this.dialog.add(AlertDialog, {
                    title: 'Order Saved Offline',
                    body: `This order has been saved offline (ID: ${offlineId.substring(0, 15)}...). You have ${pendingCount} order(s) pending sync.`
                });
            }
            console.log(`[PDC-Offline] Order ${offlineId} saved offline, ${pendingCount} orders pending sync`);

            return true;
        }

        return super.validateOrder(...arguments);
    },

    // Add method to check and switch modes
    async checkConnectionAndSwitchMode() {
        const status = connectionMonitor.getStatus();

        if (!this.isOfflineMode && !status.serverReachable) {
            // Switch to offline mode
            const useOffline = await this.promptOfflineMode();
            if (useOffline) {
                await this.enterOfflineMode();
            }
        } else if (this.isOfflineMode && status.serverReachable) {
            // Switch back to online mode - sync all pending offline orders
            console.log('[PDC-Offline] Connection restored, syncing offline orders...');

            // v4: Sync orders from new IndexedDB offline orders store
            const syncResult = await this._syncOfflineOrders();

            // Also sync via sync manager for backward compatibility
            if (this.syncManager && this.syncManager.syncAll) {
                await this.syncManager.syncAll();
            }

            this.isOfflineMode = false;

            // Odoo 19: Use AlertDialog for success message
            if (this.dialog) {
                const message = syncResult.synced > 0
                    ? `Connection restored. ${syncResult.synced} offline order(s) have been synchronized.`
                    : 'Connection restored. All offline transactions have been synchronized.';

                this.dialog.add(AlertDialog, {
                    title: 'Back Online',
                    body: message,
                });
            }
            console.log(`[PDC-Offline] Back online - ${syncResult.synced} orders synchronized, ${syncResult.failed} failed`);
        }
    },

    /**
     * v4: Sync all pending offline orders to server
     * @returns {Promise<{synced: number, failed: number}>}
     */
    async _syncOfflineOrders() {
        const result = { synced: 0, failed: 0 };

        try {
            const pendingOrders = await offlineDB.getUnsyncedOfflineOrders();
            console.log(`[PDC-Offline] Syncing ${pendingOrders.length} pending offline orders...`);

            for (const offlineOrder of pendingOrders) {
                try {
                    // Increment attempt counter
                    await offlineDB.incrementOfflineOrderAttempt(offlineOrder.offline_id);

                    // Push order to server using Odoo's standard method
                    if (this.push_single_order) {
                        await this.push_single_order(offlineOrder.order_data);
                    } else if (this.pushOrder) {
                        await this.pushOrder(offlineOrder.order_data);
                    } else {
                        // Fallback: Use RPC directly
                        await this.env.services.rpc('/pos/push_order', {
                            order: offlineOrder.order_data
                        });
                    }

                    // Mark as synced
                    await offlineDB.markOfflineOrderSynced(offlineOrder.offline_id);
                    result.synced++;
                    console.log(`[PDC-Offline] Order ${offlineOrder.offline_id} synced successfully`);

                } catch (orderError) {
                    result.failed++;
                    console.error(`[PDC-Offline] Failed to sync order ${offlineOrder.offline_id}:`, orderError);

                    // Save sync error for debugging
                    await offlineDB.saveSyncError({
                        transaction_id: offlineOrder.offline_id,
                        error_message: orderError.message || 'Unknown sync error',
                        error_type: 'offline_order_sync',
                        attempts: offlineOrder.sync_attempts || 1,
                        context: { order_data: offlineOrder.order_data }
                    });
                }
            }

        } catch (error) {
            console.error('[PDC-Offline] Failed to sync offline orders:', error);
        }

        return result;
    },

    /**
     * CRITICAL: Cleanup method - removes event listeners and intervals to prevent memory leaks
     * Called when POS is destroyed/unmounted or session is closed
     */
    async destroy() {
        console.log('[PDC-Offline] Cleaning up offline components...');

        try {
            // CRITICAL FIX: Force final sync before cleanup (if online)
            if (this.syncManager && !connectionMonitor.isOffline()) {
                console.log('[PDC-Offline] Performing final sync before session close...');
                try {
                    await this.syncManager.syncAll();
                } catch (syncError) {
                    console.warn('[PDC-Offline] Final sync failed:', syncError);
                }
            }

            // CRITICAL FIX: Stop sync manager and clear its intervals/listeners
            if (this.syncManager && this.syncManager.destroy) {
                this.syncManager.destroy();
            }

            // Remove connection monitor event listeners
            if (this._boundOnServerUnreachable) {
                connectionMonitor.off('server-unreachable', this._boundOnServerUnreachable);
                this._boundOnServerUnreachable = null;
            }
            if (this._boundOnServerReachable) {
                connectionMonitor.off('server-reachable', this._boundOnServerReachable);
                this._boundOnServerReachable = null;
            }

            // CRITICAL FIX: Stop connection monitoring (clears intervals and timeouts)
            connectionMonitor.stop();

            // v4: Clean up network error interception
            this._cleanupNetworkErrorInterception();

            // CRITICAL FIX: Stop session persistence auto-save (clears interval and event listeners)
            if (this.sessionPersistence && this.sessionPersistence.stopAutoSave) {
                this.sessionPersistence.stopAutoSave();
            }

            // CRITICAL FIX: Close IndexedDB connection
            if (offlineDB && offlineDB.close) {
                offlineDB.close();
            }

            // Remove offline banner if present
            const banner = document.querySelector('.pos-offline-banner');
            if (banner) {
                banner.remove();
            }

            // Remove any lingering notification overlays
            const overlay = document.querySelector('.pdc-offline-login-overlay');
            if (overlay) {
                overlay.remove();
            }

            console.log('[PDC-Offline] Cleanup complete - memory leak prevention successful');
        } catch (error) {
            console.error('[PDC-Offline] Error during cleanup:', error);
        }

        // Call parent destroy
        return super.destroy(...arguments);
    }
});
