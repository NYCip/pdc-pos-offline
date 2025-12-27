/** @odoo-module **/
/**
 * Connection Monitor Service for POS Offline
 *
 * Wraps the ConnectionMonitor as a proper Odoo 19 service for
 * proper lifecycle management and dependency injection.
 *
 * Features:
 * - Network connectivity monitoring
 * - Server reachability checking
 * - Automatic reconnection with exponential backoff
 * - Event-based notifications for connection state changes
 * - Integration with Odoo 19 service registry
 */

import { registry } from "@web/core/registry";
import { reactive } from "@odoo/owl";
import { ConnectionMonitor } from "./connection_monitor";

/**
 * Connection Monitor Service
 *
 * Provides network connectivity monitoring as an Odoo 19 service.
 * Register as 'connection_monitor' in the service registry.
 */
export const connectionMonitorService = {
    dependencies: ["notification"],

    async start(env, { notification }) {
        // Create the connection monitor instance
        const monitor = new ConnectionMonitor();

        // Reactive state for UI updates
        const state = reactive({
            online: navigator.onLine,
            serverReachable: true,
            lastCheck: null,
            reconnectAttempts: 0,
            isChecking: false,
        });

        // Track subscription handlers for cleanup
        const subscriptions = [];

        /**
         * Update reactive state from monitor
         */
        function updateState() {
            const status = monitor.getStatus();
            state.online = status.online;
            state.serverReachable = status.serverReachable;
            state.lastCheck = status.lastOnlineCheck;
            state.reconnectAttempts = status.reconnectAttempts;
        }

        /**
         * Show notification for connection state changes
         */
        function notifyConnectionChange(isOnline, isServerReachable) {
            if (!isOnline) {
                notification.add("Network connection lost. Entering offline mode.", {
                    type: "warning",
                    title: "Offline Mode",
                    sticky: true,
                });
            } else if (!isServerReachable) {
                notification.add("Server unreachable. Some features may be limited.", {
                    type: "warning",
                    title: "Server Unreachable",
                });
            } else {
                notification.add("Connection restored. Synchronizing data...", {
                    type: "success",
                    title: "Back Online",
                });
            }
        }

        // Set up event listeners
        monitor.on('connection-lost', () => {
            updateState();
            console.log('[PDC-Offline-Service] Connection lost');
            notifyConnectionChange(false, false);
        });

        monitor.on('connection-restored', () => {
            updateState();
            console.log('[PDC-Offline-Service] Connection restored');
        });

        monitor.on('server-reachable', () => {
            updateState();
            console.log('[PDC-Offline-Service] Server reachable');
            notifyConnectionChange(true, true);
        });

        monitor.on('server-unreachable', () => {
            updateState();
            console.log('[PDC-Offline-Service] Server unreachable');
            notifyConnectionChange(true, false);
        });

        // Start the monitor
        monitor.start();
        updateState();

        return {
            // Reactive state for UI binding
            state,

            // Access to underlying monitor (for advanced usage)
            monitor,

            /**
             * Check if currently offline
             *
             * @returns {boolean}
             */
            isOffline() {
                return monitor.isOffline();
            },

            /**
             * Check if currently online
             *
             * @returns {boolean}
             */
            isOnline() {
                return !monitor.isOffline();
            },

            /**
             * Get detailed connection status
             *
             * @returns {Object} - Connection status details
             */
            getStatus() {
                return monitor.getStatus();
            },

            /**
             * Get network state in Odoo 19 format
             *
             * @returns {Object} - Network state matching Odoo 19 data_service pattern
             */
            getNetworkState() {
                return monitor.getNetworkState();
            },

            /**
             * Force a connectivity check
             *
             * @returns {Promise<void>}
             */
            async checkConnectivity() {
                state.isChecking = true;
                try {
                    await monitor.checkConnectivity();
                    updateState();
                } finally {
                    state.isChecking = false;
                }
            },

            /**
             * Wait for connection to be restored
             *
             * @param {number} timeout - Timeout in ms (default 30000)
             * @returns {Promise<void>}
             */
            async waitForConnection(timeout = 30000) {
                return monitor.waitForConnection(timeout);
            },

            /**
             * Subscribe to network state changes
             *
             * @param {Function} callback - Called with new network state
             * @returns {Function} - Unsubscribe function
             */
            onNetworkStateChange(callback) {
                const unsubscribe = monitor.onNetworkStateChange(callback);
                subscriptions.push(unsubscribe);
                return unsubscribe;
            },

            /**
             * Subscribe to a specific event
             *
             * @param {string} event - Event name
             * @param {Function} callback - Event handler
             * @returns {Function} - Unsubscribe function
             */
            on(event, callback) {
                monitor.on(event, callback);
                const unsubscribe = () => monitor.off(event, callback);
                subscriptions.push(unsubscribe);
                return unsubscribe;
            },

            /**
             * Clean up and stop monitoring
             * Called when service is destroyed
             */
            destroy() {
                monitor.stop();
                // Clean up all subscriptions
                for (const unsubscribe of subscriptions) {
                    try {
                        unsubscribe();
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                }
                subscriptions.length = 0;
            },
        };
    },
};

registry.category("services").add("connection_monitor", connectionMonitorService);
