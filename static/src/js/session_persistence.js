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
    
    async saveSession() {
        if (!this.pos || !this.pos.session) return;
        
        const sessionData = {
            id: this.pos.session.id,
            name: this.pos.session.name,
            user_id: this.pos.user.id,
            config_id: this.pos.config.id,
            state: this.pos.session.state,
            // Store essential data for offline operation
            user_data: {
                id: this.pos.user.id,
                name: this.pos.user.name,
                login: this.pos.user.login,
                pos_offline_pin_hash: this.pos.user.pos_offline_pin_hash,
                employee_ids: this.pos.user.employee_ids,
                partner_id: this.pos.user.partner_id,
            },
            config_data: {
                id: this.pos.config.id,
                name: this.pos.config.name,
                // Store only essential config data
                currency_id: this.pos.config.currency_id,
                company_id: this.pos.config.company_id,
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
        
        // Save on page unload
        window.addEventListener('beforeunload', async () => {
            await this.saveSession();
        });
        
        // Save on visibility change (tab switching)
        document.addEventListener('visibilitychange', async () => {
            if (document.hidden) {
                await this.saveSession();
            }
        });
    }
    
    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }
}

// Export singleton factory
export function createSessionPersistence(pos) {
    return new SessionPersistence(pos);
}