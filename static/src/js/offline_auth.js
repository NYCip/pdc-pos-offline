/** @odoo-module */

import { Component } from "@odoo/owl";
import { offlineDB } from "./offline_db";
import { useService } from "@web/core/utils/hooks";

export class OfflineAuth {
    constructor(env) {
        this.env = env;
        this.offlineUsers = new Map();
    }
    
    async init() {
        await offlineDB.init();
    }
    
    hashPin(pin, userId) {
        // Client-side PIN hashing to match server-side
        const salt = String(userId);
        const pinWithSalt = `${pin}${salt}`;
        
        // Simple hash function for client-side (in production, use crypto API)
        return this.sha256(pinWithSalt);
    }
    
    async sha256(message) {
        // Use Web Crypto API for secure hashing
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }
    
    async validatePin(userId, pin) {
        try {
            // First check offline cache
            const cachedUser = await offlineDB.getUser(userId);
            if (cachedUser && cachedUser.pos_offline_pin_hash) {
                const pinHash = await this.hashPin(pin, userId);
                return cachedUser.pos_offline_pin_hash === pinHash;
            }
            
            // If online, validate with server and cache result
            if (navigator.onLine) {
                const pinHash = await this.hashPin(pin, userId);
                const result = await this.env.services.rpc('/pdc_pos_offline/validate_pin', {
                    user_id: userId,
                    pin_hash: pinHash,
                });
                
                if (result.success) {
                    // Cache user data for offline use
                    await this.cacheUserData(result.user_data);
                }
                
                return result.success;
            }
            
            return false;
        } catch (error) {
            console.error('PIN validation error:', error);
            return false;
        }
    }
    
    async cacheUserData(userData) {
        await offlineDB.saveUser({
            ...userData,
            cached_at: new Date().toISOString()
        });
    }
    
    async authenticateOffline(login, pin) {
        try {
            // Get user by login from cache
            const user = await offlineDB.getUserByLogin(login);
            if (!user) {
                return { success: false, error: 'User not found in offline cache' };
            }
            
            // Validate PIN
            const isValid = await this.validatePin(user.id, pin);
            if (!isValid) {
                return { success: false, error: 'Invalid PIN' };
            }
            
            // Create offline session
            const sessionData = {
                id: `offline_${Date.now()}`,
                user_id: user.id,
                user_data: user,
                offline_mode: true,
                authenticated_at: new Date().toISOString()
            };
            
            await offlineDB.saveSession(sessionData);
            
            return {
                success: true,
                session: sessionData
            };
        } catch (error) {
            console.error('Offline authentication error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async cacheUsersForOffline(userIds) {
        // Pre-cache user data for offline authentication
        if (!navigator.onLine) return;
        
        try {
            for (const userId of userIds) {
                const userData = await this.env.services.rpc('/web/dataset/call_kw', {
                    model: 'res.users',
                    method: 'read',
                    args: [[userId], ['id', 'name', 'login', 'pos_offline_pin_hash', 'employee_ids', 'partner_id']],
                });
                
                if (userData && userData.length > 0) {
                    await offlineDB.saveUser(userData[0]);
                }
            }
        } catch (error) {
            console.error('Error caching users:', error);
        }
    }
}

// Export singleton factory
export function createOfflineAuth(env) {
    return new OfflineAuth(env);
}