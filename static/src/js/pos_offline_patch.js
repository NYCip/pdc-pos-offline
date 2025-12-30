/** @odoo-module */

import { patch } from "@web/core/utils/patch";
// Odoo 19: PosStore moved from app/store/ to app/services/
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { connectionMonitor } from "./connection_monitor";
import { offlineDB } from "./offline_db";
import { createOfflineAuth } from "./offline_auth";
import { createSessionPersistence } from "./session_persistence";
import { createSyncManager } from "./sync_manager";
import { OfflineLoginPopup } from "./offline_login_popup";
// Odoo 19: ErrorPopup and ConfirmPopup removed - use AlertDialog and ConfirmationDialog
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

patch(PosStore.prototype, {
    async setup() {
        // CRITICAL FIX: Call super.setup() FIRST before accessing this.env
        // In Odoo 19, this.env may not be available until after base class initialization

        let superSetupCompleted = false;
        let networkError = null;

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

        // Initialize offline components
        try {
            await this.offlineAuth.init();
            await this.sessionPersistence.init();
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
            // Odoo 19: Use AlertDialog instead of ErrorPopup
            if (this.dialog) {
                this.dialog.add(AlertDialog, {
                    title: 'No Cached Users',
                    body: 'No users found in offline cache. Please login online first to enable offline mode.',
                });
            }
            console.error('[PDC-Offline] No cached users for offline mode');
            return { success: false, error: 'No cached users' };
        }

        // Default to first cached user if only one exists
        const defaultUsername = cachedUsers.length === 1 ? cachedUsers[0].login : '';

        // Odoo 19: Show OfflineLoginPopup using dialog service
        // Guard: if dialog service not available, fail gracefully
        if (!this.dialog) {
            console.error('[PDC-Offline] Cannot show offline login - dialog service not available');
            return { success: false, error: 'Dialog service not available' };
        }
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

            // Odoo 19: Use AlertDialog instead of ErrorPopup (with info styling)
            if (this.dialog) {
                this.dialog.add(AlertDialog, {
                    title: 'Order Saved Offline',
                    body: 'This order will be synchronized when the connection is restored.'
                });
            }
            console.log('[PDC-Offline] Order saved offline, will sync when connection restored');

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

            // Odoo 19: Use AlertDialog for success message
            if (this.dialog) {
                this.dialog.add(AlertDialog, {
                    title: 'Back Online',
                    body: 'Connection restored. All offline transactions have been synchronized.',
                });
            }
            console.log('[PDC-Offline] Back online - transactions synchronized');
        }
    }
});
