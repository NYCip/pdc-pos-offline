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
        // Wave 30 P0 Fix: Multi-endpoint fallback for reliable connectivity detection
        // Try dedicated ping endpoint first, then fall back to /web/login
        this.serverCheckUrls = [
            '/pdc_pos_offline/ping',  // Preferred: Returns JSON, no auth required
            '/web/login',             // Fallback: Returns HTML but is reliable
        ];
        this.serverCheckUrl = this.serverCheckUrls[0];
        this.isServerReachable = true;
        // Manual override flag - allows user to force online mode
        this._manualOverride = false;
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

            // CRITICAL FIX (PHASE 2): Track timeout for cleanup
            // Trigger immediate connectivity check on network change
            if (this._started) {
                const timeoutId = setTimeout(() => {
                    this._pendingTimeouts.delete(timeoutId);
                    this.checkConnectivity();
                }, 100);
                this._pendingTimeouts.add(timeoutId);
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

    /**
     * Wave 30 P0 Fix: Manual override - force online state
     * Call this when user clicks "I'm Online - Retry Connection" button
     * CRITICAL FIX (PHASE 2): Track timeout in _pendingTimeouts to prevent memory leak
     */
    forceOnline() {
        console.log('[PDC-Offline] Manual override: forcing online state');
        this._manualOverride = true;
        this.isServerReachable = true;
        this.reconnectAttempts = 0;
        this.trigger('server-reachable');

        // CRITICAL FIX (PHASE 2): Track timeout for cleanup
        // Previously: This timeout was not tracked, could leak if forceOnline called multiple times
        const timeoutId = setTimeout(() => {
            this._pendingTimeouts.delete(timeoutId);
            this._manualOverride = false;
            this.checkServerConnectivity();
        }, 5000);

        // Track timeout in pending set for cleanup on stop()
        this._pendingTimeouts.add(timeoutId);
    }

    /**
     * Get connection quality indicator based on response time
     * @returns {string} 'excellent' | 'good' | 'slow' | 'poor' | 'offline'
     */
    getConnectionQuality() {
        if (this.isOffline()) return 'offline';
        if (!this._lastResponseTime) return 'unknown';

        if (this._lastResponseTime < 200) return 'excellent';
        if (this._lastResponseTime < 500) return 'good';
        if (this._lastResponseTime < 1500) return 'slow';
        return 'poor';
    }

    async checkServerConnectivity() {
        // Skip check if manual override is active
        if (this._manualOverride) {
            console.log('[PDC-Offline] Skipping check - manual override active');
            return;
        }

        const checkStart = Date.now();
        console.log(`[PDC-Offline] checkServerConnectivity() started, trying ${this.serverCheckUrls.length} endpoints`);

        // Wave 30 P0 Fix: Try multiple endpoints with fallback
        for (let i = 0; i < this.serverCheckUrls.length; i++) {
            const url = this.serverCheckUrls[i];
            try {
                // Wave 31 FIX: Capture controller reference to prevent race condition
                // The timeout callback was using this._abortController which could be
                // set to null or replaced before the timeout fires
                const controller = new AbortController();
                this._abortController = controller;
                const timeoutId = setTimeout(() => {
                    // Safe check: only abort if controller exists and not already aborted
                    if (controller && !controller.signal.aborted) {
                        controller.abort();
                    }
                }, this._adaptiveTimeout);

                // Use HEAD request for lightweight check
                const response = await fetch(url, {
                    method: 'HEAD',
                    signal: controller.signal,  // Use local reference, not this._abortController
                    cache: 'no-cache',
                    // Bypass service worker to get real server status
                    headers: { 'X-PDC-Connectivity-Check': '1' }
                });

                clearTimeout(timeoutId);
                this._abortController = null;

                const responseTime = Date.now() - checkStart;
                const contentType = response.headers.get('content-type') || '';

                // Wave 30 P0 FIX: Don't reject HTML responses!
                // /web/login returns text/html which is VALID
                // Instead check for redirects (captive portals redirect to their login)
                // Also check for captive portal indicators in headers
                const isCaptivePortal = response.redirected ||
                                        response.headers.get('x-captive-portal') ||
                                        (response.status === 302 || response.status === 307);
                const isRealServer = response.ok && !isCaptivePortal;

                console.log(`[PDC-Offline] Endpoint ${url}: status=${response.status}, ok=${response.ok}, ` +
                            `redirected=${response.redirected}, contentType=${contentType}, ` +
                            `responseTime=${responseTime}ms, isRealServer=${isRealServer}`);

                if (isRealServer) {
                    this.isServerReachable = true;
                    this._lastResponseTime = responseTime;
                    this.lastOnlineCheck = new Date();
                    this.reconnectAttempts = 0; // Reset on success
                    this.serverCheckUrl = url; // Remember which endpoint worked
                    console.log(`[PDC-Offline] ✅ Server REACHABLE via ${url} (${responseTime}ms)`);
                    return; // Success - exit loop
                } else {
                    console.warn(`[PDC-Offline] ⚠️ ${url} - invalid response (possible captive portal)`);
                    // Continue to next endpoint
                }
            } catch (endpointError) {
                console.warn(`[PDC-Offline] Endpoint ${url} failed: ${endpointError.message}`);
                // Continue to next endpoint
            }
        }

        // All endpoints failed - server is unreachable
        this.isServerReachable = false;
        this._abortController = null;

        const errorTime = Date.now() - checkStart;
        console.error(`[PDC-Offline] ❌ All ${this.serverCheckUrls.length} endpoints FAILED after ${errorTime}ms`);

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
        } else {
            console.error(`[PDC-Offline] Max retries (${this.maxReconnectAttempts}) exhausted - user intervention required`);
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
