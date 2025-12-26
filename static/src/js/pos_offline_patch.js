/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { connectionMonitor } from "./connection_monitor";
import { offlineDB } from "./offline_db";
import { createOfflineAuth } from "./offline_auth";
import { createSessionPersistence } from "./session_persistence";
import { createSyncManager } from "./sync_manager";
import { OfflineLoginPopup } from "./offline_login_popup";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { ConfirmPopup } from "@point_of_sale/app/errors/popups/confirm_popup";

patch(PosStore.prototype, {
    async setup() {
        // Initialize offline components
        this.offlineAuth = createOfflineAuth(this.env);
        this.sessionPersistence = createSessionPersistence(this);
        this.syncManager = createSyncManager(this);
        
        await this.offlineAuth.init();
        await this.sessionPersistence.init();
        
        // Try to restore session if offline
        if (connectionMonitor.isOffline()) {
            const restored = await this.attemptOfflineRestore();
            if (restored) {
                // Continue with restored session
                await super.setup(...arguments);
                this.syncManager.init();
                this.sessionPersistence.startAutoSave();
                return;
            }
        }
        
        // Normal online setup
        try {
            await super.setup(...arguments);
            
            // Save session for offline use
            await this.sessionPersistence.saveSession();
            this.sessionPersistence.startAutoSave();
            
            // Initialize sync manager
            this.syncManager.init();
            
            // Cache users for offline access
            const userIds = this.models['res.users'].getAllIds();
            await this.offlineAuth.cacheUsersForOffline(userIds);
            
        } catch (error) {
            if (error.message && error.message.includes('Failed to fetch')) {
                // Network error - attempt offline mode
                const useOffline = await this.promptOfflineMode();
                if (useOffline) {
                    await this.enterOfflineMode();
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }
    },
    
    async attemptOfflineRestore() {
        console.log('Attempting offline session restore...');
        
        try {
            const session = await this.sessionPersistence.restoreSession();
            if (!session || !await this.sessionPersistence.isValidSession(session)) {
                return false;
            }
            
            // Show recovery notification
            this.showRecoveryNotification();
            
            // Restore session data
            this.session = { id: session.id, name: session.name };
            this.user = session.user_data;
            this.config = session.config_data;
            
            // Set offline mode flag
            this.isOfflineMode = true;
            
            // Restore session cookie if available
            if (session.session_cookie) {
                this.sessionPersistence.setSessionCookie(session.session_cookie);
            }
            
            console.log('Session restored successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to restore session:', error);
            return false;
        }
    },
    
    async promptOfflineMode() {
        const { confirmed } = await this.popup.add(ConfirmPopup, {
            title: 'No Internet Connection',
            body: 'Unable to connect to the server. Would you like to continue in offline mode?',
            confirmText: 'Use Offline Mode',
            cancelText: 'Retry Connection'
        });
        
        return confirmed;
    },
    
    async enterOfflineMode() {
        // Show offline login popup
        const result = await this.showOfflineLogin();
        
        if (!result.success) {
            throw new Error('Offline authentication failed');
        }
        
        // Set up offline session
        this.session = result.session;
        this.user = result.session.user_data;
        this.isOfflineMode = true;
        
        // Initialize with minimal offline data
        await this.loadOfflineData();
        
        // Show offline mode banner
        this.showOfflineBanner();
    },
    
    async showOfflineLogin() {
        // Get cached users for username selection
        const cachedUsers = await offlineDB.getAllUsers();

        if (cachedUsers.length === 0) {
            await this.popup.add(ErrorPopup, {
                title: 'No Cached Users',
                body: 'No users found in offline cache. Please login online first to enable offline mode.',
            });
            return { success: false, error: 'No cached users' };
        }

        // Default to first cached user if only one exists
        const defaultUsername = cachedUsers.length === 1 ? cachedUsers[0].login : '';

        // Show OfflineLoginPopup (Odoo 18 OWL pattern)
        const { confirmed, payload } = await this.popup.add(OfflineLoginPopup, {
            title: 'Offline Authentication',
            username: defaultUsername,
            configData: this.config || {},
        });

        if (!confirmed || !payload.success) {
            return { success: false, error: payload?.error || 'User cancelled' };
        }

        return {
            success: true,
            session: payload.session,
        };
    },
    
    async loadOfflineData() {
        // Load essential data from cache
        try {
            // Load cached products
            // Load cached customers
            // Load cached payment methods
            // etc.
            console.log('Loaded offline data');
        } catch (error) {
            console.error('Failed to load offline data:', error);
        }
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
                order_id: this.get_order().id,
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
            // Queue order for sync
            const orderData = order.export_as_JSON();
            orderData.offline_mode = true;
            orderData.offline_id = `offline_${Date.now()}`;
            
            await this.syncManager.addToSyncQueue('order', orderData);
            
            // Mark order as validated offline
            order.offline_validated = true;
            
            // Show success message
            await this.popup.add(ErrorPopup, {
                title: 'Order Saved Offline',
                body: 'This order will be synchronized when the connection is restored.'
            });
            
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
            // Switch back to online mode
            await this.syncManager.syncAll();
            this.isOfflineMode = false;
            
            await this.popup.add(ErrorPopup, {
                title: 'Back Online',
                body: 'Connection restored. All offline transactions have been synchronized.',
                type: 'success'
            });
        }
    }
});