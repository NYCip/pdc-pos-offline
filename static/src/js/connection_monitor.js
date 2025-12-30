/** @odoo-module */

/**
 * ConnectionMonitor - Odoo 19 compatible network connectivity monitor
 *
 * Uses a custom EventEmitter pattern since OWL EventBus has different API
 * (addEventListener/removeEventListener vs on/off/trigger)
 */

class SimpleEventEmitter {
    constructor() {
        this._listeners = {};
    }

    on(event, callback) {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this._listeners[event]) return;
        const index = this._listeners[event].indexOf(callback);
        if (index > -1) {
            this._listeners[event].splice(index, 1);
        }
    }

    once(event, callback) {
        const onceWrapper = (...args) => {
            this.off(event, onceWrapper);
            callback(...args);
        };
        this.on(event, onceWrapper);
    }

    trigger(event, ...args) {
        if (!this._listeners[event]) return;
        for (const callback of this._listeners[event]) {
            try {
                callback(...args);
            } catch (e) {
                console.error(`Error in event listener for ${event}:`, e);
            }
        }
    }
}

export class ConnectionMonitor extends SimpleEventEmitter {
    constructor() {
        super();
        this.online = navigator.onLine;
        this.lastOnlineCheck = new Date();
        this.checkInterval = 30000; // Check every 30 seconds
        // Use /web/login for connectivity check - returns 200 for GET requests
        // Note: /web/webclient/version_info requires JSON-RPC (returns 415 for GET/HEAD)
        this.serverCheckUrl = '/web/login';
        this.isServerReachable = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this._started = false; // Guard against multiple starts

        // Store bound handlers for proper cleanup (prevents memory leak)
        this._boundHandleOnline = this.handleOnline.bind(this);
        this._boundHandleOffline = this.handleOffline.bind(this);
    }

    start() {
        // Prevent duplicate event listeners from multiple start() calls
        if (this._started) {
            console.log('[PDC-Offline] ConnectionMonitor already started, skipping');
            return;
        }
        this._started = true;

        // Monitor online/offline events using stored bound references
        window.addEventListener('online', this._boundHandleOnline);
        window.addEventListener('offline', this._boundHandleOffline);

        // Periodic connectivity check
        this.intervalId = setInterval(() => {
            this.checkConnectivity();
        }, this.checkInterval);

        // Initial check
        this.checkConnectivity();
    }

    stop() {
        // Use stored bound references for proper cleanup
        window.removeEventListener('online', this._boundHandleOnline);
        window.removeEventListener('offline', this._boundHandleOffline);

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this._started = false; // Allow restart after stop
    }

    handleOnline() {
        console.log('Network connection restored');
        this.online = true;
        this.trigger('connection-restored');
        this.checkServerConnectivity();
    }

    handleOffline() {
        console.log('Network connection lost');
        this.online = false;
        this.isServerReachable = false;
        this.trigger('connection-lost');
    }

    async checkConnectivity() {
        const wasOnline = this.online;
        const wasServerReachable = this.isServerReachable;

        // Check basic network connectivity
        this.online = navigator.onLine;

        if (this.online) {
            // Check if server is actually reachable
            await this.checkServerConnectivity();
        } else {
            this.isServerReachable = false;
        }

        // Trigger events based on state changes
        if (!wasOnline && this.online) {
            this.trigger('connection-restored');
        } else if (wasOnline && !this.online) {
            this.trigger('connection-lost');
        }

        if (!wasServerReachable && this.isServerReachable) {
            this.trigger('server-reachable');
            this.reconnectAttempts = 0;
        } else if (wasServerReachable && !this.isServerReachable) {
            this.trigger('server-unreachable');
        }
    }

    async checkServerConnectivity() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

            // Use HEAD request to /web/login - lightweight check for server availability
            const response = await fetch(this.serverCheckUrl, {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);

            this.isServerReachable = response.ok;

            if (this.isServerReachable) {
                this.lastOnlineCheck = new Date();
            }
        } catch (error) {
            this.isServerReachable = false;

            // Retry logic
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                setTimeout(() => {
                    this.checkServerConnectivity();
                }, 5000 * this.reconnectAttempts); // Exponential backoff
            }
        }
    }

    isOffline() {
        return !this.online || !this.isServerReachable;
    }

    getStatus() {
        return {
            online: this.online,
            serverReachable: this.isServerReachable,
            lastOnlineCheck: this.lastOnlineCheck,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * Get network state in Odoo 19 format
     * @returns {Object} Network state matching Odoo data_service pattern
     */
    getNetworkState() {
        return {
            warningTriggered: !this.isServerReachable && this.reconnectAttempts > 0,
            offline: this.isOffline(),
            loading: false,  // Will be set by sync_manager
            unsyncData: []   // Will be populated by sync_manager
        };
    }

    /**
     * Subscribe to network state changes
     * @param {Function} callback - Called with new network state
     * @returns {Function} Unsubscribe function
     */
    onNetworkStateChange(callback) {
        const handler = () => callback(this.getNetworkState());

        this.on('server-reachable', handler);
        this.on('server-unreachable', handler);
        this.on('connection-restored', handler);
        this.on('connection-lost', handler);

        return () => {
            this.off('server-reachable', handler);
            this.off('server-unreachable', handler);
            this.off('connection-restored', handler);
            this.off('connection-lost', handler);
        };
    }

    async waitForConnection(timeout = 30000) {
        return new Promise((resolve, reject) => {
            if (!this.isOffline()) {
                resolve();
                return;
            }

            const timeoutId = setTimeout(() => {
                this.off('server-reachable', handler);
                reject(new Error('Connection timeout'));
            }, timeout);

            const handler = () => {
                clearTimeout(timeoutId);
                resolve();
            };

            this.once('server-reachable', handler);
        });
    }
}

// Create singleton instance
export const connectionMonitor = new ConnectionMonitor();
