/** @odoo-module */

import { Component } from "@odoo/owl";
import { offlineDB } from "./offline_db";
import { useService } from "@web/core/utils/hooks";

// Brute force protection constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const FAILED_ATTEMPTS_KEY_PREFIX = 'auth_failed_';
const LOCKOUT_KEY_PREFIX = 'auth_lockout_';

export class OfflineAuth {
    constructor(env) {
        this.env = env;
        this.offlineUsers = new Map();
        // In-memory cache for lockout state (faster checks)
        this._lockoutCache = new Map();
        this._failedAttemptsCache = new Map();
    }

    async init() {
        await offlineDB.init();
        // Load any existing lockout state from IndexedDB
        await this._loadLockoutState();
    }

    /**
     * Load lockout state from IndexedDB into memory cache
     */
    async _loadLockoutState() {
        try {
            const users = await offlineDB.getAllUsers();
            for (const user of users) {
                const lockoutKey = LOCKOUT_KEY_PREFIX + user.id;
                const failedKey = FAILED_ATTEMPTS_KEY_PREFIX + user.id;

                const lockoutData = await offlineDB.getConfig(lockoutKey);
                const failedData = await offlineDB.getConfig(failedKey);

                if (lockoutData) {
                    this._lockoutCache.set(user.id, lockoutData);
                }
                if (failedData) {
                    this._failedAttemptsCache.set(user.id, failedData);
                }
            }
        } catch (error) {
            console.warn('[PDC-Offline] Failed to load lockout state:', error);
        }
    }

    /**
     * Check if a user is currently locked out due to failed attempts
     * @param {number} userId - The user ID to check
     * @returns {Object} - { locked: boolean, remainingMs: number, remainingMinutes: number }
     */
    async isUserLockedOut(userId) {
        const lockoutKey = LOCKOUT_KEY_PREFIX + userId;

        // Check in-memory cache first
        let lockoutData = this._lockoutCache.get(userId);

        // If not in cache, check IndexedDB
        if (!lockoutData) {
            lockoutData = await offlineDB.getConfig(lockoutKey);
            if (lockoutData) {
                this._lockoutCache.set(userId, lockoutData);
            }
        }

        if (!lockoutData || !lockoutData.lockedUntil) {
            return { locked: false, remainingMs: 0, remainingMinutes: 0 };
        }

        const now = Date.now();
        const lockedUntil = new Date(lockoutData.lockedUntil).getTime();

        if (now >= lockedUntil) {
            // Lockout has expired, clear it
            await this._clearLockout(userId);
            return { locked: false, remainingMs: 0, remainingMinutes: 0 };
        }

        const remainingMs = lockedUntil - now;
        const remainingMinutes = Math.ceil(remainingMs / 60000);

        return { locked: true, remainingMs, remainingMinutes };
    }

    /**
     * Record a failed authentication attempt
     * @param {number} userId - The user ID that failed authentication
     * @returns {Object} - { attemptsRemaining: number, locked: boolean }
     */
    async recordFailedAttempt(userId) {
        const failedKey = FAILED_ATTEMPTS_KEY_PREFIX + userId;

        // Get current failed attempts
        let failedData = this._failedAttemptsCache.get(userId) ||
                         await offlineDB.getConfig(failedKey) ||
                         { count: 0, attempts: [] };

        // Add this attempt
        failedData.count = (failedData.count || 0) + 1;
        failedData.attempts = failedData.attempts || [];
        failedData.attempts.push({
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        });

        // Keep only last 10 attempts for audit
        if (failedData.attempts.length > 10) {
            failedData.attempts = failedData.attempts.slice(-10);
        }

        failedData.lastAttempt = new Date().toISOString();

        // Save to IndexedDB and cache
        await offlineDB.saveConfig(failedKey, failedData);
        this._failedAttemptsCache.set(userId, failedData);

        console.warn(`[PDC-Offline] Failed login attempt ${failedData.count} for user ${userId}`);

        // Check if we should lock the user
        if (failedData.count >= MAX_FAILED_ATTEMPTS) {
            await this._lockUser(userId);
            return { attemptsRemaining: 0, locked: true };
        }

        return {
            attemptsRemaining: MAX_FAILED_ATTEMPTS - failedData.count,
            locked: false
        };
    }

    /**
     * Lock a user account after too many failed attempts
     * @param {number} userId - The user ID to lock
     */
    async _lockUser(userId) {
        const lockoutKey = LOCKOUT_KEY_PREFIX + userId;

        const lockoutData = {
            lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString(),
            lockedAt: new Date().toISOString(),
            reason: 'Too many failed authentication attempts'
        };

        await offlineDB.saveConfig(lockoutKey, lockoutData);
        this._lockoutCache.set(userId, lockoutData);

        console.warn(`[PDC-Offline] User ${userId} locked out until ${lockoutData.lockedUntil}`);
    }

    /**
     * Clear lockout and failed attempts after successful login
     * @param {number} userId - The user ID to clear
     */
    async _clearLockout(userId) {
        const lockoutKey = LOCKOUT_KEY_PREFIX + userId;
        const failedKey = FAILED_ATTEMPTS_KEY_PREFIX + userId;

        // Clear from IndexedDB
        await offlineDB.saveConfig(lockoutKey, null);
        await offlineDB.saveConfig(failedKey, { count: 0, attempts: [] });

        // Clear from cache
        this._lockoutCache.delete(userId);
        this._failedAttemptsCache.delete(userId);

        console.log(`[PDC-Offline] Cleared lockout for user ${userId}`);
    }

    /**
     * Reset failed attempts after successful authentication
     * @param {number} userId - The user ID
     */
    async resetFailedAttempts(userId) {
        await this._clearLockout(userId);
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

            // Check if user is locked out due to too many failed attempts
            const lockoutStatus = await this.isUserLockedOut(user.id);
            if (lockoutStatus.locked) {
                console.warn(`[PDC-Offline] Login attempt for locked user ${login}`);
                return {
                    success: false,
                    error: `Account temporarily locked. Please wait ${lockoutStatus.remainingMinutes} minute(s) before trying again.`,
                    locked: true,
                    remainingMinutes: lockoutStatus.remainingMinutes
                };
            }

            // Validate PIN
            const isValid = await this.validatePin(user.id, pin);
            if (!isValid) {
                // Record failed attempt and check if user should be locked
                const failureResult = await this.recordFailedAttempt(user.id);

                if (failureResult.locked) {
                    return {
                        success: false,
                        error: 'Too many failed attempts. Account locked for 15 minutes.',
                        locked: true,
                        remainingMinutes: 15
                    };
                }

                return {
                    success: false,
                    error: `Invalid PIN. ${failureResult.attemptsRemaining} attempt(s) remaining.`,
                    attemptsRemaining: failureResult.attemptsRemaining
                };
            }

            // Successful authentication - clear any failed attempts
            await this.resetFailedAttempts(user.id);

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