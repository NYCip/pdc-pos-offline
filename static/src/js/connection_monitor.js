/** @odoo-module */

import { EventBus } from "@web/core/utils/event_bus";

export class ConnectionMonitor extends EventBus {
    constructor() {
        super();
        this.online = navigator.onLine;
        this.lastOnlineCheck = new Date();
        this.checkInterval = 30000; // Check every 30 seconds
        this.serverCheckUrl = '/web/health'; // Simple endpoint to check server connectivity
        this.isServerReachable = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
    }
    
    start() {
        // Monitor online/offline events
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));
        
        // Periodic connectivity check
        this.intervalId = setInterval(() => {
            this.checkConnectivity();
        }, this.checkInterval);
        
        // Initial check
        this.checkConnectivity();
    }
    
    stop() {
        window.removeEventListener('online', this.handleOnline.bind(this));
        window.removeEventListener('offline', this.handleOffline.bind(this));
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
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