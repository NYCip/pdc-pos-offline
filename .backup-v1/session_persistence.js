/** @odoo-module */

import { offlineDB } from "./offline_db";

export class SessionPersistence {
    constructor(pos) {
        this.pos = pos;
        this.sessionKey = 'pdc_pos_offline_session';
        this.initialized = false;
    }
    
    async init() {
        if (this.initialized) return;
        
        await offlineDB.init();
        this.initialized = true;
        
        // Clean up old sessions periodically
        await offlineDB.clearOldSessions();
    }
    
    /**
     * Extract serializable ID from Odoo relation field
     * Handles both raw IDs and model proxy objects
     */
    _extractId(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number') return value;
        if (typeof value === 'object' && value.id !== undefined) return value.id;
        if (Array.isArray(value)) return value.map(v => this._extractId(v));
        return null;
    }

    async saveSession() {
        if (!this.pos || !this.pos.session) return;

        // Safely extract IDs from relation fields (Odoo 19 may return proxy objects)
        const partnerId = this._extractId(this.pos.user?.partner_id);
        const employeeIds = this._extractId(this.pos.user?.employee_ids) || [];
        const currencyId = this._extractId(this.pos.config?.currency_id);
        const companyId = this._extractId(this.pos.config?.company_id);

        const sessionData = {
            id: this.pos.session.id,
            name: this.pos.session.name,
            user_id: this.pos.user?.id,
            config_id: this.pos.config?.id,
            state: this.pos.session.state,
            // Store essential data for offline operation (only serializable primitives)
            user_data: {
                id: this.pos.user?.id,
                name: this.pos.user?.name,
                login: this.pos.user?.login,
                pos_offline_pin_hash: this.pos.user?.pos_offline_pin_hash,
                employee_ids: employeeIds,
                partner_id: partnerId,
            },
            config_data: {
                id: this.pos.config?.id,
                name: this.pos.config?.name,
                // Store only serializable IDs, not proxy objects
                currency_id: currencyId,
                company_id: companyId,
            },
            // Store session cookie for recovery
            session_cookie: this.getSessionCookie(),
            // Add offline mode flag
            offline_capable: true,
        };

        await offlineDB.saveSession(sessionData);
        
        // Also save to localStorage for quick access
        localStorage.setItem(this.sessionKey, JSON.stringify({
            sessionId: sessionData.id,
            userId: sessionData.user_id,
            timestamp: new Date().toISOString()
        }));
    }
    
    async restoreSession() {
        try {
            // First check localStorage for quick reference
            const quickRef = localStorage.getItem(this.sessionKey);
            if (!quickRef) return null;

            const { sessionId } = JSON.parse(quickRef);

            // Get full session from IndexedDB
            const session = await offlineDB.getSession(sessionId);
            if (!session) return null;

            // Update last accessed time
            await offlineDB.updateSessionAccess(sessionId);

            return session;
        } catch (error) {
            console.error('Error restoring session:', error);
            return null;
        }
    }

    /**
     * Wave 32 Fix P2: Ensure models are cached and available
     * Called on server reconnection to restore product/category data
     * @returns {Promise<boolean>} True if models successfully ensured
     */
    async ensureModelsAvailable() {
        try {
            console.log('[PDC-Offline] Ensuring models are available...');

            // Check if models already in memory
            if (this._hasModelsInMemory()) {
                console.log('[PDC-Offline] Models already in memory, skipping restore');
                return true;
            }

            // Try to get cached models from IndexedDB
            const cachedData = await offlineDB.getAllPOSData();
            if (!cachedData || Object.keys(cachedData).length === 0) {
                console.warn('[PDC-Offline] No cached models available in IndexedDB');
                // Server should fetch models, but graceful fallback for component rendering
                return false;
            }

            // Restore models from cache to POS store
            await this._restoreModelsToStore(cachedData);
            console.log('[PDC-Offline] Models restored from cache to store');
            return true;

        } catch (error) {
            console.error('[PDC-Offline] ensureModelsAvailable error:', error);
            return false;
        }
    }

    /**
     * Check if models are already loaded with data in pos.models
     */
    _hasModelsInMemory() {
        if (!this.pos || !this.pos.models) return false;

        // Check if we have at least products with data
        try {
            const products = this.pos.models['product.product'];
            if (!products) return false;

            const productRecords = products.records || products;
            if (Array.isArray(productRecords) && productRecords.length > 0) {
                console.log(`[PDC-Offline] Found ${productRecords.length} products in memory`);
                return true;
            }
        } catch (e) {
            console.debug('[PDC-Offline] Error checking products in memory:', e);
        }

        return false;
    }

    /**
     * Restore cached models back to POS store
     * Called on reconnection to repopulate store.models
     */
    async _restoreModelsToStore(cachedData) {
        if (!this.pos || !this.pos.models) {
            console.warn('[PDC-Offline] Cannot restore models: pos.models not available');
            return;
        }

        try {
            // Map cache keys to model names
            const modelMap = {
                'product.product': 'products',
                'pos.category': 'categories',
                'pos.payment.method': 'paymentMethods',
                'account.tax': 'taxes'
            };

            let restoredCount = 0;

            for (const [modelName, cacheKey] of Object.entries(modelMap)) {
                const cachedRecords = cachedData[cacheKey] || [];
                if (Array.isArray(cachedRecords) && cachedRecords.length > 0) {
                    // Create model object with records array if needed
                    if (!this.pos.models[modelName]) {
                        this.pos.models[modelName] = {};
                    }

                    // Set records on model
                    this.pos.models[modelName].records = cachedRecords;
                    console.log(`[PDC-Offline] Restored ${cachedRecords.length} ${modelName} records`);
                    restoredCount++;
                }
            }

            console.log(`[PDC-Offline] Model restoration complete: ${restoredCount} models restored`);
        } catch (error) {
            console.error('[PDC-Offline] Error restoring models to store:', error);
        }
    }
    
    async clearSession() {
        localStorage.removeItem(this.sessionKey);
        // Note: We don't delete from IndexedDB to allow recovery
    }
    
    getSessionCookie() {
        // Get session cookie from browser
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'session_id') {
                return value;
            }
        }
        return null;
    }
    
    setSessionCookie(cookieValue) {
        if (!cookieValue) return;
        
        // Set session cookie with appropriate expiration
        const expires = new Date();
        expires.setDate(expires.getDate() + 7); // 7 days
        
        document.cookie = `session_id=${cookieValue}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
    }
    
    async isValidSession(session) {
        if (!session) return false;

        // Sessions have NO timeout while offline - valid until:
        // 1. User explicitly logs out
        // 2. IndexedDB is cleared
        // 3. Server returns and user logs out

        // Check that session has required data (user, config)
        const hasUser = session.user_id || session.user_data?.id;
        const hasConfig = session.config_id || session.config_data?.id;

        // For offline-created sessions (from OfflineAuth), check user_data exists
        if (session.offline_mode) {
            return !!(session.user_data && session.user_data.id);
        }

        // For regular sessions, require both user and config
        return !!(hasUser && hasConfig);
    }
    
    async startAutoSave() {
        // Auto-save session every 5 minutes
        this.autoSaveInterval = setInterval(async () => {
            await this.saveSession();
        }, 5 * 60 * 1000);

        // Store bound handlers for cleanup (prevents memory leak)
        this._boundBeforeUnload = this._handleBeforeUnload.bind(this);
        this._boundVisibilityChange = this._handleVisibilityChange.bind(this);
        this._boundPageHide = this._handleBeforeUnload.bind(this);

        // Save on page unload (use synchronous approach)
        window.addEventListener('beforeunload', this._boundBeforeUnload);
        // Also listen to pagehide for mobile browsers
        window.addEventListener('pagehide', this._boundPageHide);

        // Save on visibility change (tab switching)
        document.addEventListener('visibilitychange', this._boundVisibilityChange);
    }

    _handleBeforeUnload(event) {
        // Synchronous save - async operations may not complete during unload
        this._syncSaveSession();
        // Use sendBeacon for reliable data transmission during page unload
        this._sendBeaconBackup();
    }

    _handleVisibilityChange() {
        if (document.hidden) {
            // Save session when tab becomes hidden
            this.saveSession().catch(err => {
                console.warn('[PDC-Offline] Failed to save session on visibility change:', err);
            });
        }
    }

    _syncSaveSession() {
        // Synchronous localStorage save for beforeunload reliability
        if (!this.pos || !this.pos.session) return;

        try {
            const quickData = {
                sessionId: this.pos.session.id,
                userId: this.pos.user?.id,
                timestamp: new Date().toISOString(),
                pendingSync: true
            };
            localStorage.setItem(this.sessionKey, JSON.stringify(quickData));
        } catch (err) {
            console.warn('[PDC-Offline] Sync save failed:', err);
        }
    }

    _sendBeaconBackup() {
        // Use navigator.sendBeacon for reliable async data during page unload
        if (!navigator.sendBeacon) return;

        try {
            const sessionData = {
                type: 'session_backup',
                timestamp: Date.now(),
                sessionId: this.pos?.session?.id,
                userId: this.pos?.user?.id
            };
            const blob = new Blob([JSON.stringify(sessionData)], { type: 'application/json' });
            navigator.sendBeacon('/pdc_pos_offline/session_beacon', blob);
        } catch (err) {
            console.warn('[PDC-Offline] sendBeacon failed:', err);
        }
    }

    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }

        // Clean up event listeners using stored references
        if (this._boundBeforeUnload) {
            window.removeEventListener('beforeunload', this._boundBeforeUnload);
            window.removeEventListener('pagehide', this._boundPageHide);
        }
        if (this._boundVisibilityChange) {
            document.removeEventListener('visibilitychange', this._boundVisibilityChange);
        }
    }

    // ==================== POS DATA CACHING (v4 - Full Offline Support) ====================

    /**
     * Cache all POS data to IndexedDB for full offline operation
     * Called after successful online POS load
     *
     * IMPORTANT: Runs in background to not block UI
     * @returns {Promise<Object>} Summary of cached items
     */
    async cacheAllPOSData() {
        if (!this.pos || !this.pos.models) {
            console.warn('[PDC-Offline] Cannot cache POS data: pos.models not available');
            return null;
        }

        console.log('[PDC-Offline] Starting background POS data cache...');
        const startTime = Date.now();

        try {
            // Extract data from Odoo models
            const products = this._extractModelRecords('product.product');
            const categories = this._extractModelRecords('pos.category');
            const paymentMethods = this._extractModelRecords('pos.payment.method');
            const taxes = this._extractModelRecords('account.tax');

            console.log(`[PDC-Offline] Extracted: ${products.length} products, ${categories.length} categories, ${paymentMethods.length} payment methods, ${taxes.length} taxes`);

            // Cache to IndexedDB using convenience method (handles chunking)
            const summary = await offlineDB.cacheAllPOSData({
                products: products,
                categories: categories,
                paymentMethods: paymentMethods,
                taxes: taxes
            });

            const elapsed = Date.now() - startTime;
            console.log(`[PDC-Offline] POS data cache complete in ${elapsed}ms:`, summary);

            return summary;
        } catch (error) {
            console.error('[PDC-Offline] Failed to cache POS data:', error);
            throw error;
        }
    }

    /**
     * Extract serializable records from an Odoo model
     * Handles Odoo 19's reactive proxy objects and Wave 32 P1 format changes
     * @param {string} modelName - The model name (e.g., 'product.product')
     * @returns {Array} Array of plain objects
     */
    _extractModelRecords(modelName) {
        const model = this.pos.models?.[modelName];
        if (!model) {
            console.warn(`[PDC-Offline] Model ${modelName} not found in pos.models`);
            return [];
        }

        // Wave 32 Fix: Try multiple formats to handle potential model structure changes
        let records = null;

        // Format 1: model.records (standard Odoo format)
        if (Array.isArray(model.records)) {
            records = model.records;
            console.debug(`[PDC-Offline] Model ${modelName} found in .records format`);
        }
        // Format 2: model itself is array (direct format)
        else if (Array.isArray(model)) {
            records = model;
            console.debug(`[PDC-Offline] Model ${modelName} is direct array format`);
        }
        // Format 3: model.data (Wave 32 P1 alternative format)
        else if (Array.isArray(model.data)) {
            records = model.data;
            console.debug(`[PDC-Offline] Model ${modelName} found in .data format`);
        }
        // Format 4: model._records (internal format)
        else if (model._records && Array.isArray(model._records)) {
            records = model._records;
            console.debug(`[PDC-Offline] Model ${modelName} found in ._records format`);
        }
        // Format 5: If model is object with id property, wrap in array
        else if (model.id !== undefined && typeof model === 'object') {
            records = [model];
            console.debug(`[PDC-Offline] Model ${modelName} wrapped single record`);
        }

        if (!Array.isArray(records)) {
            console.warn(`[PDC-Offline] Model ${modelName} has no valid records. Debug info:`, {
                has_records: !!model.records,
                has_data: !!model.data,
                has__records: !!model._records,
                is_array: Array.isArray(model),
                is_object: typeof model === 'object',
                keys: Object.keys(model || {}).slice(0, 5)
            });
            return [];
        }

        console.log(`[PDC-Offline] Extracted ${records.length} records from ${modelName}`);

        // Convert reactive proxies to plain objects
        return records.map(record => this._toPlainObject(record, modelName));
    }

    /**
     * Convert Odoo reactive proxy to plain JSON-serializable object
     * @param {Object} record - Odoo model record (may be proxy)
     * @param {string} modelName - Model name for field selection
     * @returns {Object} Plain object safe for IndexedDB storage
     */
    _toPlainObject(record, modelName) {
        if (!record) return null;

        // Define which fields to extract per model (avoid huge objects)
        const fieldMappings = {
            'product.product': [
                'id', 'name', 'display_name', 'list_price', 'standard_price',
                'barcode', 'default_code', 'categ_id', 'pos_categ_ids',
                'taxes_id', 'available_in_pos', 'to_weight', 'uom_id',
                'tracking', 'description_sale', 'image_128', 'lst_price',
                'type', 'sale_ok', 'active'
            ],
            'pos.category': [
                'id', 'name', 'parent_id', 'child_id', 'sequence', 'image_128'
            ],
            'pos.payment.method': [
                'id', 'name', 'is_cash_count', 'use_payment_terminal',
                'split_transactions', 'type', 'image'
            ],
            'account.tax': [
                'id', 'name', 'amount', 'amount_type', 'type_tax_use',
                'price_include', 'include_base_amount', 'sequence'
            ]
        };

        const fields = fieldMappings[modelName] || Object.keys(record);
        const plainObj = {};

        for (const field of fields) {
            try {
                const value = record[field];
                plainObj[field] = this._serializeValue(value);
            } catch (e) {
                // Skip fields that throw on access (some computed fields)
                continue;
            }
        }

        return plainObj;
    }

    /**
     * Serialize a value to be JSON-safe
     * Handles Odoo relation fields (Many2one, One2many, etc.)
     */
    _serializeValue(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
            return value;
        }
        if (Array.isArray(value)) {
            // For relation arrays, extract IDs
            return value.map(v => {
                if (typeof v === 'number') return v;
                if (typeof v === 'object' && v !== null && v.id !== undefined) return v.id;
                return v;
            });
        }
        if (typeof value === 'object') {
            // For relation objects (Many2one), extract ID
            if (value.id !== undefined) return value.id;
            // For Date objects
            if (value instanceof Date) return value.toISOString();
            // Skip complex objects
            return null;
        }
        return null;
    }

    /**
     * Check if POS data is cached and up to date
     * @returns {Promise<boolean>}
     */
    async hasCachedPOSData() {
        return await offlineDB.hasCachedPOSData();
    }

    /**
     * Get cached POS data for offline operation
     * @returns {Promise<Object>} { products, categories, paymentMethods, taxes }
     */
    async getCachedPOSData() {
        return await offlineDB.getAllPOSData();
    }

    /**
     * Clear all cached POS data (for refresh)
     */
    async clearCachedPOSData() {
        return await offlineDB.clearAllPOSData();
    }
}

// Export singleton factory
export function createSessionPersistence(pos) {
    const instance = new SessionPersistence(pos);
    // Expose to window for recovery mechanisms and testing
    if (typeof window !== 'undefined') {
        window.sessionPersistence = instance;
    }
    return instance;
}