/** @odoo-module */

import { connectionMonitor } from "./connection_monitor";
import { offlineDB } from "./offline_db";

export class SyncManager {
    constructor(pos) {
        this.pos = pos;
        // NOTE: syncQueue removed - we use IndexedDB for persistence
        // and _cachedPendingCount for sync status
        this._cachedPendingCount = 0;
        this.isSyncing = false;
        this.syncInterval = null;
        // NOTE: syncErrors now persisted to IndexedDB instead of in-memory array
        // Use getSyncErrors() to retrieve errors, saveSyncError() to add new ones
        this._lastSyncError = null;  // Cache of most recent error for quick access
    }
    
    async init() {
        // Initialize cached pending count from IndexedDB
        await this.updatePendingCount();

        // Store bound handlers for proper cleanup (prevents memory leak)
        this._boundServerReachable = () => {
            this.startSync();
        };
        this._boundServerUnreachable = () => {
            this.stopSync();
        };

        // Listen for connection events
        connectionMonitor.on('server-reachable', this._boundServerReachable);
        connectionMonitor.on('server-unreachable', this._boundServerUnreachable);

        // Start monitoring
        connectionMonitor.start();

        // Check if we should start syncing immediately
        if (!connectionMonitor.isOffline()) {
            this.startSync();
        }
    }
    
    async startSync() {
        console.log('Starting sync manager...');
        
        // Initial sync
        await this.syncAll();
        
        // Set up periodic sync every 5 minutes
        this.syncInterval = setInterval(() => {
            this.syncAll();
        }, 5 * 60 * 1000);
    }
    
    stopSync() {
        console.log('Stopping sync manager...');
        
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
    
    async syncAll() {
        if (this.isSyncing || connectionMonitor.isOffline()) {
            return;
        }

        this.isSyncing = true;
        const syncResults = { success: [], failed: [] };

        // IMPROVED: Each phase runs independently - one failure doesn't stop others
        const phases = [
            { name: 'syncOfflineTransactions', fn: () => this.syncOfflineTransactions() },
            { name: 'syncSessionData', fn: () => this.syncSessionData() },
            { name: 'updateCachedData', fn: () => this.updateCachedData() },
            { name: 'cleanupOldData', fn: () => this.cleanupOldData() },
        ];

        for (const phase of phases) {
            try {
                await phase.fn();
                syncResults.success.push(phase.name);
            } catch (error) {
                console.error(`[PDC-Offline] Sync phase ${phase.name} failed:`, error);
                syncResults.failed.push({ phase: phase.name, error: error.message });

                // Persist error to IndexedDB
                const syncError = {
                    transaction_id: null,
                    error_message: error.message,
                    error_type: 'sync_phase',
                    timestamp: new Date().toISOString(),
                    attempts: 0,
                    context: { phase: phase.name }
                };
                await this.saveSyncError(syncError);
                // Continue with next phase - don't abort entire sync
            }
        }

        // Summary log
        if (syncResults.failed.length === 0) {
            console.log('[PDC-Offline] Sync completed successfully');
        } else {
            console.warn(`[PDC-Offline] Sync completed with ${syncResults.failed.length} failures:`,
                syncResults.failed.map(f => f.phase).join(', '));
        }

        this.isSyncing = false;
        // Update cached count after sync completes
        await this.updatePendingCount();
    }
    
    async syncOfflineTransactions() {
        // Get all pending offline transactions from queue (Odoo 18 pattern)
        const pendingTransactions = await this.getPendingTransactions();
        const MAX_ATTEMPTS = 5;

        for (const transaction of pendingTransactions) {
            try {
                await this.syncTransaction(transaction);
                // Delete transaction after successful sync (Odoo 18 pattern)
                await this.deleteTransaction(transaction.id);

                // Emit sync progress event
                this.pos.env.services.bus_service?.trigger('pos-sync-progress', {
                    synced: true,
                    transactionId: transaction.id,
                    type: transaction.type
                });
            } catch (error) {
                console.error('Failed to sync transaction:', transaction.id, error);

                // Increment attempt counter
                const attempts = await this.incrementTransactionAttempt(transaction.id);

                if (attempts >= MAX_ATTEMPTS) {
                    // Mark as synced but with error flag after max attempts
                    await this.markTransactionSynced(transaction.id);

                    // Persist error to IndexedDB
                    await this.saveSyncError({
                        transaction_id: transaction.id,
                        error_message: error.message,
                        error_type: 'transaction_sync',
                        timestamp: new Date().toISOString(),
                        attempts: attempts,
                        context: {
                            type: transaction.type,
                            data: transaction.data
                        }
                    });
                }
            }
        }
    }
    
    async syncTransaction(transaction) {
        // Sync based on transaction type
        switch (transaction.type) {
            case 'order':
                return await this.syncOrder(transaction.data);
            case 'payment':
                return await this.syncPayment(transaction.data);
            case 'session_update':
                return await this.syncSessionUpdate(transaction.data);
            default:
                console.warn('Unknown transaction type:', transaction.type);
        }
    }
    
    async syncOrder(orderData) {
        // Create order on server
        const order = await this.pos.env.services.orm.create('pos.order', [{
            ...orderData,
            offline_id: orderData.offline_id || null
        }]);
        
        return order;
    }
    
    async syncPayment(paymentData) {
        // Sync payment to server
        // This might involve calling the payment terminal API
        // or creating payment records
        return await this.pos.env.services.orm.create('pos.payment', [paymentData]);
    }
    
    async syncSessionUpdate(sessionData) {
        // Update session on server
        return await this.pos.env.services.orm.write('pos.session', 
            [sessionData.id], 
            sessionData.updates
        );
    }
    
    async syncSessionData() {
        if (!this.pos.session) return;

        const sessionId = this.pos.session.id;
        if (!sessionId) {
            console.warn('[PDC-Offline] No session ID available for sync');
            return;
        }

        try {
            // Get pending count first
            const pendingCount = await this.getPendingTransactionCount();

            // Sync current session state to server
            // Note: last_sync_date and offline_transactions_count must be defined
            // in pos_session.py as fields on pos.session model
            await this.pos.env.services.orm.write('pos.session',
                [sessionId],
                {
                    // Odoo expects datetime in 'YYYY-MM-DD HH:MM:SS' format
                    last_sync_date: new Date().toISOString().replace('T', ' ').slice(0, 19),
                    offline_transactions_count: pendingCount
                }
            );
        } catch (error) {
            // Log but don't throw - sync failure shouldn't break POS operation
            console.error('[PDC-Offline] Failed to sync session data:', error);
        }
    }
    
    async updateCachedData() {
        // Update critical cached data if online
        try {
            // Update user data
            const users = await this.pos.env.services.orm.searchRead(
                'res.users',
                [['id', 'in', this.pos.user_ids || [this.pos.user.id]]],
                ['id', 'name', 'login', 'pos_offline_pin_hash']
            );
            
            for (const user of users) {
                try {
                    await offlineDB.saveUser(user);
                } catch (error) {
                    // Handle ConstraintError with recovery attempt
                    if (error.name === 'ConstraintError') {
                        console.warn(`[PDC-Offline] ConstraintError for user '${user.login}':`, error.message);
                        console.log(`[PDC-Offline] Attempting recovery for user '${user.login}'...`);

                        try {
                            // Recovery: Try to fetch existing user by login and delete if needed
                            const tx = offlineDB.getNewTransaction(['users'], 'readwrite');
                            const store = tx.objectStore('users');
                            const index = store.index('login');

                            const existingUser = await new Promise((resolve, reject) => {
                                const req = index.get(user.login);
                                req.onsuccess = () => resolve(req.result);
                                req.onerror = () => reject(req.error);
                            });

                            if (existingUser) {
                                // Delete the conflicting record
                                await new Promise((resolve, reject) => {
                                    const req = store.delete(existingUser.id);
                                    req.onsuccess = () => {
                                        console.log(`[PDC-Offline] Deleted conflicting user record (id: ${existingUser.id}, login: ${user.login})`);
                                        resolve();
                                    };
                                    req.onerror = () => reject(req.error);
                                });

                                // Retry the save
                                await offlineDB.saveUser(user);
                                console.log(`[PDC-Offline] Successfully recovered user '${user.login}' after constraint error`);
                            }
                        } catch (recoveryError) {
                            console.error(`[PDC-Offline] Failed to recover from constraint error for user '${user.login}':`, recoveryError);
                        }
                    } else {
                        // Re-throw non-constraint errors
                        throw error;
                    }
                }
            }

            // Update config data
            await offlineDB.saveConfig('last_sync', new Date().toISOString());

        } catch (error) {
            console.error('[PDC-Offline] Failed to update cached data:', error);
        }
    }
    
    async cleanupOldData() {
        // Clean up old sessions and transactions (Odoo 18 aligned)
        await offlineDB.clearOldSessions(7); // Keep 7 days of sessions
        await offlineDB.clearOldTransactions(30); // Keep 30 days of synced transactions
        await offlineDB.clearOldSyncErrors(7); // Keep 7 days of sync errors
    }
    
    async addToSyncQueue(type, data) {
        const transaction = {
            id: `${type}_${Date.now()}`,
            type: type,
            data: data,
            created_at: new Date().toISOString(),
            synced: false,
            attempts: 0
        };

        // Store in IndexedDB for persistence
        await this.saveTransaction(transaction);

        // Update cached count after adding
        await this.updatePendingCount();

        // Try immediate sync if online
        if (!connectionMonitor.isOffline()) {
            setTimeout(() => this.syncAll(), 100);
        }
    }
    
    async saveTransaction(transaction) {
        // Save to IndexedDB transactions store (Odoo 18 aligned)
        return await offlineDB.saveTransaction(transaction);
    }

    async getPendingTransactions() {
        // Get all unsynced transactions from IndexedDB (Odoo 18 aligned)
        return await offlineDB.getPendingTransactions();
    }

    async getPendingTransactionCount() {
        // Optimized count query (Odoo 18 aligned)
        return await offlineDB.getPendingTransactionCount();
    }

    async markTransactionSynced(transactionId) {
        // Mark transaction as synced in IndexedDB (Odoo 18 aligned)
        return await offlineDB.markTransactionSynced(transactionId);
    }

    async incrementTransactionAttempt(transactionId) {
        // Track retry attempts (Odoo 18 aligned)
        return await offlineDB.incrementTransactionAttempt(transactionId);
    }

    async deleteTransaction(transactionId) {
        // Remove transaction after successful sync (Odoo 18 aligned)
        return await offlineDB.deleteTransaction(transactionId);
    }
    
    getSyncStatus() {
        return {
            isSyncing: this.isSyncing,
            pendingCount: this._cachedPendingCount,
            lastError: this._lastSyncError,
            isOnline: !connectionMonitor.isOffline()
        };
    }

    /**
     * Save a sync error to IndexedDB (persistent storage)
     * @param {Object} errorData - Error data to persist
     * @returns {Promise<Object>} The saved error object
     */
    async saveSyncError(errorData) {
        try {
            const savedError = await offlineDB.saveSyncError(errorData);
            // Update cached last error for quick access in getSyncStatus()
            this._lastSyncError = savedError;
            return savedError;
        } catch (err) {
            console.error('[PDC-Offline] Failed to save sync error:', err);
            // Fallback: at least cache it in memory
            this._lastSyncError = errorData;
            return errorData;
        }
    }

    /**
     * Get all sync errors from IndexedDB
     * @param {Object} options - Query options (limit, error_type)
     * @returns {Promise<Array>} Array of sync error objects
     */
    async getSyncErrors(options = {}) {
        try {
            return await offlineDB.getSyncErrors(options);
        } catch (err) {
            console.error('[PDC-Offline] Failed to get sync errors:', err);
            return [];
        }
    }

    /**
     * Get sync errors for a specific transaction
     * @param {string} transactionId - The transaction ID
     * @returns {Promise<Array>} Array of sync errors
     */
    async getSyncErrorsByTransaction(transactionId) {
        try {
            return await offlineDB.getSyncErrorsByTransaction(transactionId);
        } catch (err) {
            console.error('[PDC-Offline] Failed to get sync errors by transaction:', err);
            return [];
        }
    }

    /**
     * Clear all sync errors from IndexedDB
     * @returns {Promise<boolean>} True if cleared
     */
    async clearSyncErrors() {
        try {
            await offlineDB.clearAllSyncErrors();
            this._lastSyncError = null;
            return true;
        } catch (err) {
            console.error('[PDC-Offline] Failed to clear sync errors:', err);
            return false;
        }
    }

    /**
     * Get count of sync errors
     * @returns {Promise<number>} Number of sync errors
     */
    async getSyncErrorCount() {
        try {
            return await offlineDB.getSyncErrorCount();
        } catch (err) {
            console.error('[PDC-Offline] Failed to get sync error count:', err);
            return 0;
        }
    }

    /**
     * Update cached pending count from IndexedDB
     * Call this after any transaction changes
     */
    async updatePendingCount() {
        try {
            this._cachedPendingCount = await this.getPendingTransactionCount();
        } catch (err) {
            console.warn('[PDC-Offline] Failed to update pending count:', err);
        }
        return this._cachedPendingCount;
    }

    /**
     * Get comprehensive sync status with pending transaction count (Odoo 18 aligned)
     * Matches Odoo's network state: {warningTriggered, offline, loading, unsyncData}
     */
    async getNetworkState() {
        const pendingCount = await this.getPendingTransactionCount();
        const status = connectionMonitor.getStatus();

        return {
            warningTriggered: pendingCount > 0 && !status.serverReachable,
            offline: !status.online || !status.serverReachable,
            loading: this.isSyncing,
            unsyncData: await this.getPendingTransactions(),
            pendingCount: pendingCount,
            lastSync: await offlineDB.getConfig('last_sync'),
            errors: await this.getSyncErrors()  // Now reads from IndexedDB
        };
    }

    /**
     * Force immediate sync attempt (Odoo 18 pattern)
     */
    async forceSyncNow() {
        if (connectionMonitor.isOffline()) {
            console.warn('Cannot force sync while offline');
            return false;
        }

        // Reset sync interval
        this.stopSync();
        await this.syncAll();
        this.startSync();

        return true;
    }

    /**
     * CRITICAL: Cleanup method to prevent memory leaks
     * Clears all intervals, timeouts, and event listeners
     * Called when POS session is closed
     */
    destroy() {
        console.log('[PDC-Offline] Destroying SyncManager...');

        // Stop sync interval
        this.stopSync();

        // Remove connection monitor event listeners
        if (this._boundServerReachable) {
            connectionMonitor.off('server-reachable', this._boundServerReachable);
            this._boundServerReachable = null;
        }
        if (this._boundServerUnreachable) {
            connectionMonitor.off('server-unreachable', this._boundServerUnreachable);
            this._boundServerUnreachable = null;
        }

        // Clear any pending sync operations
        this.isSyncing = false;
        this._cachedPendingCount = 0;
        this._lastSyncError = null;

        console.log('[PDC-Offline] SyncManager destroyed successfully');
    }
}

// Export factory function
export function createSyncManager(pos) {
    return new SyncManager(pos);
}