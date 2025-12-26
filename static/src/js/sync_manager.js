/** @odoo-module */

import { connectionMonitor } from "./connection_monitor";
import { offlineDB } from "./offline_db";

export class SyncManager {
    constructor(pos) {
        this.pos = pos;
        this.syncQueue = [];
        this.isSyncing = false;
        this.syncInterval = null;
        this.syncErrors = [];
    }
    
    init() {
        // Listen for connection events
        connectionMonitor.on('server-reachable', () => {
            this.startSync();
        });
        
        connectionMonitor.on('server-unreachable', () => {
            this.stopSync();
        });
        
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
        
        try {
            // 1. Sync offline transactions
            await this.syncOfflineTransactions();
            
            // 2. Sync session data
            await this.syncSessionData();
            
            // 3. Update cached data
            await this.updateCachedData();
            
            // 4. Clean up old data
            await this.cleanupOldData();
            
            console.log('Sync completed successfully');
        } catch (error) {
            console.error('Sync error:', error);
            this.syncErrors.push({
                timestamp: new Date().toISOString(),
                error: error.message
            });
        } finally {
            this.isSyncing = false;
        }
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
                    this.syncErrors.push({
                        transactionId: transaction.id,
                        timestamp: new Date().toISOString(),
                        error: error.message,
                        data: transaction.data
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
        
        // Sync current session state
        const sessionData = {
            id: this.pos.session.id,
            last_sync_date: new Date().toISOString(),
            offline_transactions_count: await this.getPendingTransactionCount()
        };
        
        try {
            await this.pos.env.services.orm.write('pos.session', 
                [sessionData.id], 
                sessionData
            );
        } catch (error) {
            console.error('Failed to sync session data:', error);
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
                await offlineDB.saveUser(user);
            }
            
            // Update config data
            await offlineDB.saveConfig('last_sync', new Date().toISOString());
            
        } catch (error) {
            console.error('Failed to update cached data:', error);
        }
    }
    
    async cleanupOldData() {
        // Clean up old sessions and transactions (Odoo 18 aligned)
        await offlineDB.clearOldSessions(7); // Keep 7 days of sessions
        await offlineDB.clearOldTransactions(30); // Keep 30 days of synced transactions
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
            pendingCount: this.syncQueue.length,
            lastError: this.syncErrors[this.syncErrors.length - 1],
            isOnline: !connectionMonitor.isOffline()
        };
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
            errors: this.syncErrors
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
}

// Export factory function
export function createSyncManager(pos) {
    return new SyncManager(pos);
}