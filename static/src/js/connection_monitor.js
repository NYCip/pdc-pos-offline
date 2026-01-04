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
        this.checkInterval = 30000; // Check every 30 seconds (default)
        // Use /web/login for connectivity check - returns 200 for GET requests
        // Note: /web/webclient/version_info requires JSON-RPC (returns 415 for GET/HEAD)
        this.serverCheckUrl = '/web/login';
        this.isServerReachable = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10; // Increased from 3 for mobile resilience
        this._started = false; // Guard against multiple starts

        // Store bound handlers for proper cleanup (prevents memory leak)
        this._boundHandleOnline = this.handleOnline.bind(this);
        this._boundHandleOffline = this.handleOffline.bind(this);

        // Track pending timeouts/intervals for cleanup (prevents memory leak)
        this.intervalId = null;
        this._pendingTimeouts = new Set();
        this._abortController = null;

        // Mobile/network adaptive timeouts (Wave 3)
        this._baseTimeout = 5000;
        this._adaptiveTimeout = this._baseTimeout;
        this._initNetworkAdaptation();
    }

    /**
     * Initialize network-adaptive timeout based on connection type
     * Uses Network Information API when available
     */
    _initNetworkAdaptation() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            this._updateTimeoutsForNetwork(connection);
            // Wave 8 Fix: Store bound handler for cleanup
            this._boundNetworkChange = () => this._updateTimeoutsForNetwork(connection);
            connection.addEventListener('change', this._boundNetworkChange);
            this._networkConnection = connection; // Store reference for cleanup
        }
    }

    /**
     * Clean up network adapter listener
     * Called from stop() to prevent memory leaks
     */
    _cleanupNetworkAdaptation() {
        if (this._networkConnection && this._boundNetworkChange) {
            this._networkConnection.removeEventListener('change', this._boundNetworkChange);
            this._boundNetworkChange = null;
            this._networkConnection = null;
        }
    }

    /**
     * Adjust timeouts based on network type (mobile optimization)
     * Also resets backoff and triggers immediate recheck on network change
     */
    _updateTimeoutsForNetwork(connection) {
        const effectiveType = connection.effectiveType || '4g';
        const previousInterval = this.checkInterval;

        switch (effectiveType) {
            case 'slow-2g':
            case '2g':
                this._adaptiveTimeout = 15000; // 15s for 2G
                this.checkInterval = 60000;    // Check every 60s on slow networks
                break;
            case '3g':
                this._adaptiveTimeout = 10000; // 10s for 3G
                this.checkInterval = 45000;    // Check every 45s
                break;
            case '4g':
            default:
                this._adaptiveTimeout = 5000;  // 5s for 4G/WiFi
                this.checkInterval = 30000;    // Default 30s
        }

        // Wave 5 Fix: Reset backoff on network type change
        // This allows immediate retry when switching to better network
        if (previousInterval !== this.checkInterval) {
            this.reconnectAttempts = 0;
            console.log(`[PDC-Offline] Network changed to ${effectiveType}, reset backoff`);

            // Trigger immediate connectivity check on network change
            if (this._started) {
                setTimeout(() => this.checkConnectivity(), 100);
            }
        }

        console.log(`[PDC-Offline] Network adapted: ${effectiveType}, timeout=${this._adaptiveTimeout}ms, interval=${this.checkInterval}ms`);
    }

    /**
     * Calculate retry delay with jitter to prevent thundering herd
     * Uses full jitter algorithm: delay = random(0, baseDelay * 2^attempt)
     */
    _getRetryDelayWithJitter(attempt) {
        const baseDelay = 2000; // Start at 2 seconds
        const maxDelay = 300000; // Cap at 5 minutes
        const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        // Full jitter: random value between 0 and exponentialDelay
        return Math.floor(Math.random() * exponentialDelay);
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
        console.log('[PDC-Offline] Stopping ConnectionMonitor...');

        // Use stored bound references for proper cleanup
        window.removeEventListener('online', this._boundHandleOnline);
        window.removeEventListener('offline', this._boundHandleOffline);

        // Wave 8 Fix: Clean up network adapter listener
        this._cleanupNetworkAdaptation();

        // Clear main polling interval
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // Clear all pending retry timeouts (CRITICAL: prevents memory leak)
        this._pendingTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        this._pendingTimeouts.clear();

        // Abort any pending fetch requests
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }

        this._started = false; // Allow restart after stop
        console.log('[PDC-Offline] ConnectionMonitor stopped successfully');
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
            // Create new AbortController for this request
            this._abortController = new AbortController();
            const timeoutId = setTimeout(() => this._abortController.abort(), this._adaptiveTimeout);

            // Use HEAD request to /web/login - lightweight check for server availability
            const response = await fetch(this.serverCheckUrl, {
                method: 'HEAD',
                signal: this._abortController.signal,
                cache: 'no-cache',
                // Bypass service worker to get real server status
                headers: { 'X-PDC-Connectivity-Check': '1' }
            });

            clearTimeout(timeoutId);
            this._abortController = null;

            // Validate response is from actual server (not captive portal)
            // Captive portals often return 200 with redirect or HTML
            const contentType = response.headers.get('content-type') || '';
            const isRealServer = response.ok && !contentType.includes('text/html');

            this.isServerReachable = isRealServer;

            if (this.isServerReachable) {
                this.lastOnlineCheck = new Date();
                this.reconnectAttempts = 0; // Reset on success
            }
        } catch (error) {
            this.isServerReachable = false;
            this._abortController = null;

            // Retry logic with jitter to prevent thundering herd (Wave 3)
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const jitteredDelay = this._getRetryDelayWithJitter(this.reconnectAttempts);
                console.log(`[PDC-Offline] Retry ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${jitteredDelay}ms`);

                const retryTimeoutId = setTimeout(() => {
                    this._pendingTimeouts.delete(retryTimeoutId);
                    this.checkServerConnectivity();
                }, jitteredDelay);

                // Track timeout for cleanup (CRITICAL)
                this._pendingTimeouts.add(retryTimeoutId);
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

    /**
     * Immediately check connectivity (bypasses interval wait)
     * Use after RPC failures to quickly detect server state
     *
     * Debounced: Multiple calls within 2s only trigger one check
     * @returns {Promise<boolean>} True if server is reachable
     */
    async checkNow() {
        // Debounce: Ignore if last check was within 2 seconds
        const now = Date.now();
        if (this._lastCheckNow && (now - this._lastCheckNow) < 2000) {
            console.log('[PDC-Offline] checkNow debounced, using cached state');
            return this.isServerReachable;
        }
        this._lastCheckNow = now;

        console.log('[PDC-Offline] Immediate connectivity check triggered');
        await this.checkConnectivity();
        return this.isServerReachable;
    }

    /**
     * Force state to offline without server check
     * Use when RPC definitively fails (network error)
     */
    forceOffline() {
        if (this.isServerReachable) {
            console.log('[PDC-Offline] Forcing offline state');
            this.isServerReachable = false;
            this.trigger('server-unreachable');
        }
    }
}

// Create singleton instance
export const connectionMonitor = new ConnectionMonitor();
