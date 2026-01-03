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

patch(PosStore.prototype, {
    async setup() {
        // CRITICAL FIX: Call super.setup() FIRST before accessing this.env
        // In Odoo 19, this.env may not be available until after base class initialization

        let superSetupCompleted = false;
        let networkError = null;

        // CRITICAL: Initial server reachability check BEFORE attempting super.setup()
        // This provides fast detection when server is already down at POS startup
        let serverReachable = true;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
            const response = await fetch('/web/login', {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-cache'
            });
            clearTimeout(timeoutId);
            serverReachable = response.ok;
        } catch (initialCheckError) {
            console.log('[PDC-Offline] Initial server check failed:', initialCheckError.message);
            serverReachable = false;
        }

        // If server is NOT reachable at startup, try offline mode immediately
        if (!serverReachable) {
            console.log('[PDC-Offline] Server unreachable at startup, attempting offline restore');

            // Initialize offline components first
            this.offlineAuth = createOfflineAuth(null); // env not available yet
            this.sessionPersistence = createSessionPersistence(this);

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
                this.session = { id: session.id, name: session.name };
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

                // CRITICAL: Set up connection monitor listeners for runtime offline detection
                // This triggers offline login when server becomes unreachable WHILE POS is running
                // Store bound handlers for proper cleanup in destroy()
                this._boundOnServerUnreachable = async () => {
                    console.log('[PDC-Offline] Server unreachable detected during runtime');
                    if (!this.isOfflineMode) {
                        // First try to restore existing session
                        const restored = await this.attemptOfflineRestore();
                        if (restored) {
                            console.log('[PDC-Offline] Session restored from cache');
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
            } else {
                // Fallback: DOM-based alert
                this._showDOMAlert('No Cached Users', 'No users found in offline cache. Please login online first to enable offline mode.');
            }
            console.error('[PDC-Offline] No cached users for offline mode');
            return { success: false, error: 'No cached users' };
        }

        // Default to first cached user if only one exists
        const defaultUsername = cachedUsers.length === 1 ? cachedUsers[0].login : '';

        // If dialog service is not available (server down at startup), use DOM-based login
        if (!this.dialog) {
            console.log('[PDC-Offline] Dialog service not available, using DOM-based login');
            return this._showDOMOfflineLogin(cachedUsers, defaultUsername);
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
     */
    async _showDOMOfflineLogin(cachedUsers, defaultUsername) {
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
                        <p>Server is unreachable. Enter your offline PIN to continue.</p>
                    </div>
                    <form class="pdc-offline-login-form">
                        <div class="form-group">
                            <label for="pdc-username">Username</label>
                            <select id="pdc-username" required>
                                ${cachedUsers.map(u => `<option value="${escapeHtml(u.login)}" ${u.login === defaultUsername ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.login)})</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="pdc-pin">4-Digit PIN</label>
                            <input type="password" id="pdc-pin" pattern="[0-9]{4}" maxlength="4" inputmode="numeric" placeholder="••••" required autocomplete="off">
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
                .pdc-offline-login-form input[type="password"] {
                    text-align: center; letter-spacing: 8px; font-size: 24px;
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
            const pinInput = overlay.querySelector('#pdc-pin');
            const retryBtn = overlay.querySelector('#pdc-retry');

            // Focus PIN input
            setTimeout(() => pinInput.focus(), 100);

            // Handle form submission
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = overlay.querySelector('#pdc-username').value;
                const pin = pinInput.value;

                if (pin.length !== 4) {
                    errorDiv.textContent = 'PIN must be 4 digits';
                    errorDiv.style.display = 'block';
                    return;
                }

                try {
                    // Use authenticateOffline() which returns {success, error, session} object
                    // and includes brute-force protection (unlike validatePin which returns boolean)
                    const authResult = await this.offlineAuth.authenticateOffline(username, pin);

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
                        // Display detailed error message from authenticateOffline
                        // (includes lockout status and remaining attempts)
                        errorDiv.textContent = authResult.error || 'Invalid PIN';
                        errorDiv.style.display = 'block';
                        pinInput.value = '';
                        pinInput.focus();

                        // If account is locked, disable the form
                        if (authResult.locked) {
                            pinInput.disabled = true;
                            form.querySelector('button[type="submit"]').disabled = true;
                            // Re-enable after lockout period (in case user waits)
                            setTimeout(() => {
                                pinInput.disabled = false;
                                form.querySelector('button[type="submit"]').disabled = false;
                                errorDiv.style.display = 'none';
                            }, (authResult.remainingMinutes || 15) * 60 * 1000);
                        }
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
     * Simple DOM-based alert - fallback when dialog service unavailable
     */
    _showDOMAlert(title, message) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:white;border-radius:12px;padding:32px;max-width:400px;text-align:center;">
                <h3 style="margin:0 0 16px 0;">${title}</h3>
                <p style="margin:0 0 24px 0;color:#666;">${message}</p>
                <button onclick="this.closest('div').parentElement.remove()" style="padding:12px 24px;background:#667eea;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;">OK</button>
            </div>
        `;
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
            // Queue order for sync
            const orderData = order.exportAsJSON();
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
