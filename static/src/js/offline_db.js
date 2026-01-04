/** @odoo-module */

/**
 * PDC POS Offline Database
 *
 * IndexedDB wrapper aligned with Odoo 18 native patterns.
 * Extends Odoo's approach with transactions store for offline order persistence.
 *
 * @see https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/static/src/app/models/utils/indexed_db.js
 */

const INDEXED_DB_VERSION = 3;  // Increment for schema changes (v3: added sync_errors store)
const MAX_RETRY_ATTEMPTS = 5;

export class OfflineDB {
    constructor() {
        this.dbName = 'PDCPOSOfflineDB';
        this.dbVersion = INDEXED_DB_VERSION;
        this.db = null;
        this.retryCount = 0;
        this._quotaWarningThreshold = 0.7; // 70% usage warning
        this._quotaCriticalThreshold = 0.9; // 90% - prevent new writes
        this._memoryPressureCleanupDone = false;

        // Initialize memory pressure listener (Wave 3)
        this._initMemoryPressureHandler();
    }

    /**
     * Listen for memory pressure events and cleanup aggressively
     * Critical for low-memory mobile devices
     */
    _initMemoryPressureHandler() {
        // Modern browsers support memory pressure API
        if ('memory' in performance) {
            // Check memory periodically on constrained devices
            const checkMemory = () => {
                const memInfo = performance.memory;
                if (memInfo && memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit > 0.8) {
                    console.warn('[PDC-Offline] High memory usage detected, triggering cleanup');
                    this._emergencyCleanup();
                }
            };
            // Check every 30 seconds on low memory devices
            if (navigator.deviceMemory && navigator.deviceMemory <= 2) {
                setInterval(checkMemory, 30000);
            }
        }

        // Listen for page visibility changes - cleanup when hidden (mobile backgrounding)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && !this._memoryPressureCleanupDone) {
                console.log('[PDC-Offline] Page hidden, performing light cleanup');
                this._lightCleanup();
            }
        });
    }

    /**
     * Aggressive cleanup for memory pressure
     * Deletes synced data older than 1 day
     */
    async _emergencyCleanup() {
        if (this._memoryPressureCleanupDone) return;
        this._memoryPressureCleanupDone = true;

        console.log('[PDC-Offline] Emergency cleanup triggered');
        try {
            // Delete synced transactions older than 1 day (normally 30 days)
            const oneDayAgo = Date.now() - (1 * 24 * 60 * 60 * 1000);
            await this.clearOldTransactions(oneDayAgo);
            // Delete synced orders older than 1 day
            await this.clearOldOrders(oneDayAgo);
            // Clear all sync errors
            await this.clearOldSyncErrors(Date.now());
            console.log('[PDC-Offline] Emergency cleanup complete');
        } catch (e) {
            console.error('[PDC-Offline] Emergency cleanup failed:', e);
        } finally {
            // Allow cleanup again after 5 minutes
            setTimeout(() => { this._memoryPressureCleanupDone = false; }, 300000);
        }
    }

    /**
     * Light cleanup when page goes to background
     */
    async _lightCleanup() {
        try {
            const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
            await this.clearOldSyncErrors(threeDaysAgo);
        } catch (e) {
            // Silently ignore
        }
    }

    /**
     * Check storage quota before writes
     * @returns {Promise<{ok: boolean, usage: number, quota: number, percentUsed: number}>}
     */
    async checkQuota() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return { ok: true, usage: 0, quota: 0, percentUsed: 0 };
        }

        try {
            const estimate = await navigator.storage.estimate();
            const percentUsed = estimate.usage / estimate.quota;
            return {
                ok: percentUsed < this._quotaCriticalThreshold,
                usage: estimate.usage,
                quota: estimate.quota,
                percentUsed: percentUsed
            };
        } catch (e) {
            return { ok: true, usage: 0, quota: 0, percentUsed: 0 };
        }
    }

    /**
     * Save with quota check - prevents QuotaExceededError
     */
    async saveWithQuotaCheck(storeName, data, saveMethod) {
        const quotaStatus = await this.checkQuota();

        if (!quotaStatus.ok) {
            console.warn(`[PDC-Offline] Storage quota critical (${Math.round(quotaStatus.percentUsed * 100)}%), attempting cleanup`);
            await this._emergencyCleanup();

            // Recheck after cleanup
            const recheckStatus = await this.checkQuota();
            if (!recheckStatus.ok) {
                throw new Error('QUOTA_EXCEEDED: Storage full, cannot save offline data');
            }
        } else if (quotaStatus.percentUsed > this._quotaWarningThreshold) {
            console.warn(`[PDC-Offline] Storage quota warning: ${Math.round(quotaStatus.percentUsed * 100)}% used`);
        }

        return saveMethod();
    }

    /**
     * Wave 6: Validate database structure after opening
     * Checks all required stores exist with correct indexes
     */
    async _validateDbStructure(db) {
        const requiredStores = ['sessions', 'users', 'config', 'transactions', 'orders', 'sync_errors'];
        const missingStores = [];

        for (const storeName of requiredStores) {
            if (!db.objectStoreNames.contains(storeName)) {
                missingStores.push(storeName);
            }
        }

        if (missingStores.length > 0) {
            console.error(`[PDC-Offline] Missing stores: ${missingStores.join(', ')}`);
            return false;
        }

        return true;
    }

    async init() {
        return new Promise((resolve, reject) => {
            // Support vendor-prefixed IndexedDB (aligned with Odoo 18)
            const indexedDB = window.indexedDB || window.mozIndexedDB ||
                              window.webkitIndexedDB || window.msIndexedDB;

            if (!indexedDB) {
                reject(new Error('IndexedDB not supported'));
                return;
            }

            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);

            // Wave 6 Fix: Handle blocked state (another tab holding connection)
            request.onblocked = (event) => {
                console.warn('[PDC-Offline] Database blocked - another tab may be open');
                // Notify user to close other tabs
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('pdc-db-blocked', {
                        detail: { message: 'Please close other POS tabs to continue' }
                    }));
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.retryCount = 0;

                // Wave 6 Fix: Validate database structure on open
                this._validateDbStructure(this.db).then(valid => {
                    if (!valid) {
                        console.error('[PDC-Offline] Database structure invalid, may need reset');
                    }
                });

                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Sessions store - for offline session persistence
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
                    sessionStore.createIndex('user_id', 'user_id', { unique: false });
                    sessionStore.createIndex('created', 'created', { unique: false });
                }

                // Users store - for offline PIN authentication
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id' });
                    userStore.createIndex('login', 'login', { unique: true });
                }

                // Config store - for offline settings
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }

                // Transactions store - for offline orders/payments (Odoo 18 aligned)
                if (!db.objectStoreNames.contains('transactions')) {
                    const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
                    txStore.createIndex('synced', 'synced', { unique: false });
                    txStore.createIndex('type', 'type', { unique: false });
                    txStore.createIndex('created_at', 'created_at', { unique: false });
                }

                // Orders store - for full order data persistence
                if (!db.objectStoreNames.contains('orders')) {
                    const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
                    orderStore.createIndex('state', 'state', { unique: false });
                    orderStore.createIndex('date_order', 'date_order', { unique: false });
                }

                // Sync errors store - for persistent sync error tracking (v3)
                if (!db.objectStoreNames.contains('sync_errors')) {
                    const syncErrorStore = db.createObjectStore('sync_errors', { keyPath: 'id', autoIncrement: true });
                    syncErrorStore.createIndex('transaction_id', 'transaction_id', { unique: false });
                    syncErrorStore.createIndex('timestamp', 'timestamp', { unique: false });
                    syncErrorStore.createIndex('error_type', 'error_type', { unique: false });
                }
            };
        });
    }

    /**
     * Get a new transaction with error handling (Odoo 18 pattern)
     */
    getNewTransaction(storeNames, mode = 'readwrite') {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const tx = this.db.transaction(storeNames, mode);
        tx.onerror = (event) => {
            console.error('Transaction error:', event.target.error);
        };
        return tx;
    }

    // ==================== SESSION OPERATIONS ====================

    async saveSession(sessionData) {
        const tx = this.getNewTransaction(['sessions']);
        const store = tx.objectStore('sessions');

        const data = {
            ...sessionData,
            created: sessionData.created || new Date().toISOString(),
            lastAccessed: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getSession(sessionId) {
        const tx = this.getNewTransaction(['sessions'], 'readonly');
        const store = tx.objectStore('sessions');

        return new Promise((resolve, reject) => {
            const request = store.get(sessionId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getActiveSession() {
        const tx = this.getNewTransaction(['sessions'], 'readonly');
        const store = tx.objectStore('sessions');

        return new Promise((resolve, reject) => {
            const request = store.openCursor(null, 'prev');
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const session = cursor.value;
                    // Sessions have NO timeout while offline - valid until:
                    // 1. User explicitly logs out
                    // 2. IndexedDB is cleared
                    // 3. Server returns and user logs out
                    // Simply return the most recent session if it has required data
                    if (session.user_id || session.user_data?.id) {
                        resolve(session);
                    } else {
                        // Skip invalid sessions (missing user data)
                        cursor.continue();
                    }
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async updateSessionAccess(sessionId) {
        const session = await this.getSession(sessionId);
        if (session) {
            session.lastAccessed = new Date().toISOString();
            await this.saveSession(session);
        }
    }

    async clearOldSessions(daysToKeep = 7) {
        const tx = this.getNewTransaction(['sessions']);
        const store = tx.objectStore('sessions');
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        return new Promise((resolve, reject) => {
            const request = store.openCursor();
            let deletedCount = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const created = new Date(cursor.value.created);
                    if (created < cutoffDate) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                } else {
                    resolve(deletedCount);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== USER OPERATIONS ====================

    async saveUser(userData) {
        const tx = this.getNewTransaction(['users']);
        const store = tx.objectStore('users');

        const data = {
            ...userData,
            cached_at: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getUser(userId) {
        const tx = this.getNewTransaction(['users'], 'readonly');
        const store = tx.objectStore('users');

        return new Promise((resolve, reject) => {
            const request = store.get(userId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getUserByLogin(login) {
        const tx = this.getNewTransaction(['users'], 'readonly');
        const store = tx.objectStore('users');
        const index = store.index('login');

        return new Promise((resolve, reject) => {
            const request = index.get(login);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllUsers() {
        const tx = this.getNewTransaction(['users'], 'readonly');
        const store = tx.objectStore('users');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== CONFIG OPERATIONS ====================

    async saveConfig(key, value) {
        const tx = this.getNewTransaction(['config']);
        const store = tx.objectStore('config');

        return new Promise((resolve, reject) => {
            const request = store.put({ key, value, updated: new Date().toISOString() });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getConfig(key) {
        const tx = this.getNewTransaction(['config'], 'readonly');
        const store = tx.objectStore('config');

        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== TRANSACTION OPERATIONS (Odoo 18 Aligned) ====================

    /**
     * Save a transaction to the offline queue
     * Aligned with Odoo 18's unsyncData pattern
     */
    async saveTransaction(transaction) {
        const tx = this.getNewTransaction(['transactions']);
        const store = tx.objectStore('transactions');

        const data = {
            id: transaction.id || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: transaction.type,  // 'order', 'payment', 'session_update'
            data: transaction.data,
            args: transaction.args || [],
            created_at: new Date().toISOString(),
            synced: false,
            attempts: 0,
            uuid: transaction.uuid || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
        };

        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all pending (unsynced) transactions
     * Using getAll + filter instead of IDBKeyRange.only(false) for compatibility
     */
    async getPendingTransactions() {
        const tx = this.getNewTransaction(['transactions'], 'readonly');
        const store = tx.objectStore('transactions');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const results = (request.result || []).filter(t => t.synced === false);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get pending transaction count
     * Using getAll + filter instead of IDBKeyRange.only(false) for compatibility
     */
    async getPendingTransactionCount() {
        const tx = this.getNewTransaction(['transactions'], 'readonly');
        const store = tx.objectStore('transactions');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const count = (request.result || []).filter(t => t.synced === false).length;
                resolve(count);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Mark a transaction as synced
     */
    async markTransactionSynced(transactionId) {
        const tx = this.getNewTransaction(['transactions']);
        const store = tx.objectStore('transactions');

        return new Promise(async (resolve, reject) => {
            const getRequest = store.get(transactionId);
            getRequest.onsuccess = () => {
                const transaction = getRequest.result;
                if (transaction) {
                    transaction.synced = true;
                    transaction.synced_at = new Date().toISOString();
                    const putRequest = store.put(transaction);
                    putRequest.onsuccess = () => resolve(true);
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    resolve(false);
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Increment retry attempt for a transaction
     */
    async incrementTransactionAttempt(transactionId) {
        const tx = this.getNewTransaction(['transactions']);
        const store = tx.objectStore('transactions');

        return new Promise((resolve, reject) => {
            const getRequest = store.get(transactionId);
            getRequest.onsuccess = () => {
                const transaction = getRequest.result;
                if (transaction) {
                    transaction.attempts = (transaction.attempts || 0) + 1;
                    transaction.last_attempt = new Date().toISOString();
                    const putRequest = store.put(transaction);
                    putRequest.onsuccess = () => resolve(transaction.attempts);
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    resolve(0);
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Delete a transaction (after successful sync or user action)
     */
    async deleteTransaction(transactionId) {
        const tx = this.getNewTransaction(['transactions']);
        const store = tx.objectStore('transactions');

        return new Promise((resolve, reject) => {
            const request = store.delete(transactionId);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear old synced transactions (cleanup)
     * Wave 12 Fix: Handle both days and timestamp parameters
     * @param {number} daysToKeep - Days to keep (default 30), or timestamp if > 365
     * @returns {Promise<number>} Number of deleted transactions
     */
    async clearOldTransactions(daysToKeep = 30) {
        const tx = this.getNewTransaction(['transactions']);
        const store = tx.objectStore('transactions');

        // Handle both days and timestamp (for emergency cleanup compatibility)
        const cutoffDate = new Date();
        if (daysToKeep > 365) {
            // Assume it's a timestamp (from _emergencyCleanup)
            cutoffDate.setTime(daysToKeep);
        } else {
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        }

        return new Promise((resolve, reject) => {
            const request = store.openCursor();
            let deletedCount = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const transaction = cursor.value;
                    const createdAt = new Date(transaction.created_at);
                    // Only delete synced transactions older than cutoff
                    if (transaction.synced && createdAt < cutoffDate) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                } else {
                    if (deletedCount > 0) {
                        console.log(`[PDC-Offline] Cleared ${deletedCount} old transactions`);
                    }
                    resolve(deletedCount);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== ORDER OPERATIONS ====================

    /**
     * Save order data for offline persistence
     */
    async saveOrder(orderData) {
        const tx = this.getNewTransaction(['orders']);
        const store = tx.objectStore('orders');

        const data = {
            ...orderData,
            JSONuiState: JSON.stringify(orderData.uiState || {}),
            saved_at: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all orders from cache
     */
    async getAllOrders() {
        const tx = this.getNewTransaction(['orders'], 'readonly');
        const store = tx.objectStore('orders');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get order by ID
     */
    async getOrder(orderId) {
        const tx = this.getNewTransaction(['orders'], 'readonly');
        const store = tx.objectStore('orders');

        return new Promise((resolve, reject) => {
            const request = store.get(orderId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete order from cache
     */
    async deleteOrder(orderId) {
        const tx = this.getNewTransaction(['orders']);
        const store = tx.objectStore('orders');

        return new Promise((resolve, reject) => {
            const request = store.delete(orderId);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear old orders from cache (cleanup)
     * Only deletes orders in terminal states (paid, done, invoiced) older than cutoff
     * Wave 12 Fix: Added missing method called by _emergencyCleanup()
     * @param {number} daysToKeep - Days to keep (default 30), or timestamp if < 365
     * @returns {Promise<number>} Number of deleted orders
     */
    async clearOldOrders(daysToKeep = 30) {
        const tx = this.getNewTransaction(['orders']);
        const store = tx.objectStore('orders');

        // Handle both days and timestamp (for emergency cleanup compatibility)
        const cutoffDate = new Date();
        if (daysToKeep > 365) {
            // Assume it's a timestamp (from _emergencyCleanup)
            cutoffDate.setTime(daysToKeep);
        } else {
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        }

        // Terminal order states that are safe to delete
        const terminalStates = ['paid', 'done', 'invoiced', 'cancel'];

        return new Promise((resolve, reject) => {
            const request = store.openCursor();
            let deletedCount = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const order = cursor.value;
                    const orderDate = new Date(order.date_order || order.saved_at);
                    // Only delete orders in terminal states older than cutoff
                    if (terminalStates.includes(order.state) && orderDate < cutoffDate) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                } else {
                    if (deletedCount > 0) {
                        console.log(`[PDC-Offline] Cleared ${deletedCount} old orders`);
                    }
                    resolve(deletedCount);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== SYNC ERROR OPERATIONS ====================

    /**
     * Save a sync error to IndexedDB for persistence across page reloads
     * @param {Object} errorData - Error data to persist
     * @param {string} errorData.transaction_id - ID of the related transaction (optional)
     * @param {string} errorData.error_message - Human-readable error message
     * @param {string} errorData.error_type - Type of error (e.g., 'sync_phase', 'transaction_sync', 'network')
     * @param {number} errorData.attempts - Number of sync attempts made (optional)
     * @param {Object} errorData.context - Additional context data (optional)
     * @returns {Promise<Object>} The saved error object with generated ID
     */
    async saveSyncError(errorData) {
        const tx = this.getNewTransaction(['sync_errors']);
        const store = tx.objectStore('sync_errors');

        const data = {
            transaction_id: errorData.transaction_id || null,
            error_message: errorData.error_message || 'Unknown error',
            error_type: errorData.error_type || 'unknown',
            timestamp: errorData.timestamp || new Date().toISOString(),
            attempts: errorData.attempts || 0,
            context: errorData.context || null
        };

        return new Promise((resolve, reject) => {
            const request = store.add(data);
            request.onsuccess = () => {
                data.id = request.result;
                resolve(data);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all sync errors from IndexedDB
     * @param {Object} options - Query options
     * @param {number} options.limit - Maximum number of errors to return (optional)
     * @param {string} options.error_type - Filter by error type (optional)
     * @returns {Promise<Array>} Array of sync error objects, sorted by timestamp descending
     */
    async getSyncErrors(options = {}) {
        const tx = this.getNewTransaction(['sync_errors'], 'readonly');
        const store = tx.objectStore('sync_errors');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                let results = request.result || [];

                // Filter by error_type if specified
                if (options.error_type) {
                    results = results.filter(e => e.error_type === options.error_type);
                }

                // Sort by timestamp descending (most recent first)
                results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                // Apply limit if specified
                if (options.limit && options.limit > 0) {
                    results = results.slice(0, options.limit);
                }

                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get sync error by ID
     * @param {number} errorId - The error ID
     * @returns {Promise<Object|null>} The sync error object or null
     */
    async getSyncError(errorId) {
        const tx = this.getNewTransaction(['sync_errors'], 'readonly');
        const store = tx.objectStore('sync_errors');

        return new Promise((resolve, reject) => {
            const request = store.get(errorId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get sync errors for a specific transaction
     * @param {string} transactionId - The transaction ID
     * @returns {Promise<Array>} Array of sync errors for the transaction
     */
    async getSyncErrorsByTransaction(transactionId) {
        const tx = this.getNewTransaction(['sync_errors'], 'readonly');
        const store = tx.objectStore('sync_errors');
        const index = store.index('transaction_id');

        return new Promise((resolve, reject) => {
            const request = index.getAll(transactionId);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear old sync errors beyond the specified age
     * @param {number} maxAgeDays - Maximum age in days (default: 7)
     * @returns {Promise<number>} Number of deleted errors
     */
    async clearOldSyncErrors(maxAgeDays = 7) {
        const tx = this.getNewTransaction(['sync_errors']);
        const store = tx.objectStore('sync_errors');
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

        return new Promise((resolve, reject) => {
            const request = store.openCursor();
            let deletedCount = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const errorTimestamp = new Date(cursor.value.timestamp);
                    if (errorTimestamp < cutoffDate) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                } else {
                    resolve(deletedCount);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a specific sync error
     * @param {number} errorId - The error ID to delete
     * @returns {Promise<boolean>} True if deleted
     */
    async deleteSyncError(errorId) {
        const tx = this.getNewTransaction(['sync_errors']);
        const store = tx.objectStore('sync_errors');

        return new Promise((resolve, reject) => {
            const request = store.delete(errorId);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all sync errors
     * @returns {Promise<boolean>} True if cleared
     */
    async clearAllSyncErrors() {
        const tx = this.getNewTransaction(['sync_errors']);
        const store = tx.objectStore('sync_errors');

        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get count of sync errors
     * @returns {Promise<number>} Number of sync errors
     */
    async getSyncErrorCount() {
        const tx = this.getNewTransaction(['sync_errors'], 'readonly');
        const store = tx.objectStore('sync_errors');

        return new Promise((resolve, reject) => {
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Read all data from all stores (Odoo 18 pattern)
     */
    async readAll(retry = 0) {
        if (!this.db && retry < MAX_RETRY_ATTEMPTS) {
            await this.init();
            return this.readAll(retry + 1);
        }

        const result = {};
        const storeNames = ['sessions', 'users', 'config', 'transactions', 'orders', 'sync_errors'];

        for (const storeName of storeNames) {
            if (this.db.objectStoreNames.contains(storeName)) {
                try {
                    const tx = this.getNewTransaction([storeName], 'readonly');
                    const store = tx.objectStore(storeName);
                    result[storeName] = await new Promise((resolve, reject) => {
                        const request = store.getAll();
                        request.onsuccess = () => resolve(request.result || []);
                        request.onerror = () => reject(request.error);
                    });
                } catch (error) {
                    console.warn(`Failed to read ${storeName}:`, error);
                    result[storeName] = [];
                }
            }
        }

        return result;
    }

    /**
     * Reset (delete) the entire database
     */
    async reset() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.dbName);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Check if database is initialized
     */
    isReady() {
        return this.db !== null;
    }

    /**
     * CRITICAL: Close IndexedDB connection to prevent memory leaks
     * Called when POS session is closed
     */
    close() {
        if (this.db) {
            console.log('[PDC-Offline] Closing IndexedDB connection...');
            this.db.close();
            this.db = null;
            console.log('[PDC-Offline] IndexedDB connection closed');
        }
    }
}

// Create singleton instance
export const offlineDB = new OfflineDB();
