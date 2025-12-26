/** @odoo-module */

/**
 * PDC POS Offline Database
 *
 * IndexedDB wrapper aligned with Odoo 18 native patterns.
 * Extends Odoo's approach with transactions store for offline order persistence.
 *
 * @see https://github.com/odoo/odoo/blob/18.0/addons/point_of_sale/static/src/app/models/utils/indexed_db.js
 */

const INDEXED_DB_VERSION = 2;  // Increment for schema changes
const MAX_RETRY_ATTEMPTS = 5;

export class OfflineDB {
    constructor() {
        this.dbName = 'PDCPOSOfflineDB';
        this.dbVersion = INDEXED_DB_VERSION;
        this.db = null;
        this.retryCount = 0;
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
            request.onsuccess = () => {
                this.db = request.result;
                this.retryCount = 0;
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
                    const now = new Date();
                    const lastAccessed = new Date(session.lastAccessed);
                    const hoursSinceAccess = (now - lastAccessed) / (1000 * 60 * 60);

                    // Sessions expire after 24 hours of inactivity
                    if (hoursSinceAccess < 24) {
                        resolve(session);
                    } else {
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
     */
    async getPendingTransactions() {
        const tx = this.getNewTransaction(['transactions'], 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('synced');

        return new Promise((resolve, reject) => {
            const request = index.getAll(IDBKeyRange.only(false));
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get pending transaction count
     */
    async getPendingTransactionCount() {
        const tx = this.getNewTransaction(['transactions'], 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('synced');

        return new Promise((resolve, reject) => {
            const request = index.count(IDBKeyRange.only(false));
            request.onsuccess = () => resolve(request.result);
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
     */
    async clearOldTransactions(daysToKeep = 30) {
        const tx = this.getNewTransaction(['transactions']);
        const store = tx.objectStore('transactions');
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

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
        const storeNames = ['sessions', 'users', 'config', 'transactions', 'orders'];

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
}

// Create singleton instance
export const offlineDB = new OfflineDB();
