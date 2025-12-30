/** @odoo-module */

import { offlineDB } from "./offline_db";

export class SessionPersistence {
    constructor(pos) {
        this.pos = pos;
        this.sessionKey = 'pdc_pos_offline_session';
        this.initialized = false;
    }
    
    async init() {
        if (this.initialized) return;
        
        await offlineDB.init();
        this.initialized = true;
        
        // Clean up old sessions periodically
        await offlineDB.clearOldSessions();
    }
    
    /**
     * Extract serializable ID from Odoo relation field
     * Handles both raw IDs and model proxy objects
     */
    _extractId(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number') return value;
        if (typeof value === 'object' && value.id !== undefined) return value.id;
        if (Array.isArray(value)) return value.map(v => this._extractId(v));
        return null;
    }

    async saveSession() {
        if (!this.pos || !this.pos.session) return;

        // Safely extract IDs from relation fields (Odoo 19 may return proxy objects)
        const partnerId = this._extractId(this.pos.user?.partner_id);
        const employeeIds = this._extractId(this.pos.user?.employee_ids) || [];
        const currencyId = this._extractId(this.pos.config?.currency_id);
        const companyId = this._extractId(this.pos.config?.company_id);

        const sessionData = {
            id: this.pos.session.id,
            name: this.pos.session.name,
            user_id: this.pos.user?.id,
            config_id: this.pos.config?.id,
            state: this.pos.session.state,
            // Store essential data for offline operation (only serializable primitives)
            user_data: {
                id: this.pos.user?.id,
                name: this.pos.user?.name,
                login: this.pos.user?.login,
                pos_offline_pin_hash: this.pos.user?.pos_offline_pin_hash,
                employee_ids: employeeIds,
                partner_id: partnerId,
            },
            config_data: {
                id: this.pos.config?.id,
                name: this.pos.config?.name,
                // Store only serializable IDs, not proxy objects
                currency_id: currencyId,
                company_id: companyId,
            },
            // Store session cookie for recovery
            session_cookie: this.getSessionCookie(),
            // Add offline mode flag
            offline_capable: true,
        };

        await offlineDB.saveSession(sessionData);
        
        // Also save to localStorage for quick access
        localStorage.setItem(this.sessionKey, JSON.stringify({
            sessionId: sessionData.id,
            userId: sessionData.user_id,
            timestamp: new Date().toISOString()
        }));
    }
    
    async restoreSession() {
        try {
            // First check localStorage for quick reference
            const quickRef = localStorage.getItem(this.sessionKey);
            if (!quickRef) return null;
            
            const { sessionId } = JSON.parse(quickRef);
            
            // Get full session from IndexedDB
            const session = await offlineDB.getSession(sessionId);
            if (!session) return null;
            
            // Update last accessed time
            await offlineDB.updateSessionAccess(sessionId);
            
            return session;
        } catch (error) {
            console.error('Error restoring session:', error);
            return null;
        }
    }
    
    async clearSession() {
        localStorage.removeItem(this.sessionKey);
        // Note: We don't delete from IndexedDB to allow recovery
    }
    
    getSessionCookie() {
        // Get session cookie from browser
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'session_id') {
                return value;
            }
        }
        return null;
    }
    
    setSessionCookie(cookieValue) {
        if (!cookieValue) return;
        
        // Set session cookie with appropriate expiration
        const expires = new Date();
        expires.setDate(expires.getDate() + 7); // 7 days
        
        document.cookie = `session_id=${cookieValue}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
    }
    
    async isValidSession(session) {
        if (!session) return false;
        
        // Check if session is expired
        const now = new Date();
        const lastAccessed = new Date(session.lastAccessed);
        const hoursSinceAccess = (now - lastAccessed) / (1000 * 60 * 60);
        
        // Sessions expire after 24 hours of inactivity
        return hoursSinceAccess < 24;
    }
    
    async startAutoSave() {
        // Auto-save session every 5 minutes
        this.autoSaveInterval = setInterval(async () => {
            await this.saveSession();
        }, 5 * 60 * 1000);

        // Store bound handlers for cleanup (prevents memory leak)
        this._boundBeforeUnload = this._handleBeforeUnload.bind(this);
        this._boundVisibilityChange = this._handleVisibilityChange.bind(this);
        this._boundPageHide = this._handleBeforeUnload.bind(this);

        // Save on page unload (use synchronous approach)
        window.addEventListener('beforeunload', this._boundBeforeUnload);
        // Also listen to pagehide for mobile browsers
        window.addEventListener('pagehide', this._boundPageHide);

        // Save on visibility change (tab switching)
        document.addEventListener('visibilitychange', this._boundVisibilityChange);
    }

    _handleBeforeUnload(event) {
        // Synchronous save - async operations may not complete during unload
        this._syncSaveSession();
        // Use sendBeacon for reliable data transmission during page unload
        this._sendBeaconBackup();
    }

    _handleVisibilityChange() {
        if (document.hidden) {
            // Save session when tab becomes hidden
            this.saveSession().catch(err => {
                console.warn('[PDC-Offline] Failed to save session on visibility change:', err);
            });
        }
    }

    _syncSaveSession() {
        // Synchronous localStorage save for beforeunload reliability
        if (!this.pos || !this.pos.session) return;

        try {
            const quickData = {
                sessionId: this.pos.session.id,
                userId: this.pos.user?.id,
                timestamp: new Date().toISOString(),
                pendingSync: true
            };
            localStorage.setItem(this.sessionKey, JSON.stringify(quickData));
        } catch (err) {
            console.warn('[PDC-Offline] Sync save failed:', err);
        }
    }

    _sendBeaconBackup() {
        // Use navigator.sendBeacon for reliable async data during page unload
        if (!navigator.sendBeacon) return;

        try {
            const sessionData = {
                type: 'session_backup',
                timestamp: Date.now(),
                sessionId: this.pos?.session?.id,
                userId: this.pos?.user?.id
            };
            const blob = new Blob([JSON.stringify(sessionData)], { type: 'application/json' });
            navigator.sendBeacon('/pdc_pos_offline/session_beacon', blob);
        } catch (err) {
            console.warn('[PDC-Offline] sendBeacon failed:', err);
        }
    }

    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }

        // Clean up event listeners using stored references
        if (this._boundBeforeUnload) {
            window.removeEventListener('beforeunload', this._boundBeforeUnload);
            window.removeEventListener('pagehide', this._boundPageHide);
        }
        if (this._boundVisibilityChange) {
            document.removeEventListener('visibilitychange', this._boundVisibilityChange);
        }
    }
}

// Export singleton factory
export function createSessionPersistence(pos) {
    return new SessionPersistence(pos);
}