/** @odoo-module */

import { Component } from "@odoo/owl";
import { offlineDB } from "./offline_db";
import { useService } from "@web/core/utils/hooks";

/**
 * SHA-256 hash using Web Crypto API
 * @param {string} message - The message to hash
 * @returns {Promise<string>} Hex-encoded hash
 */
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a PIN with user ID as salt (matches server-side implementation)
 * This is the authoritative implementation - use this everywhere.
 * @param {string} pin - The 4-digit PIN
 * @param {number|string} userId - The user ID used as salt
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function hashPin(pin, userId) {
    const salt = String(userId);
    const pinWithSalt = `${pin}${salt}`;
    return sha256(pinWithSalt);
}

export class OfflineAuth {
    constructor(env) {
        this.env = env;
        this.offlineUsers = new Map();
    }

    async init() {
        await offlineDB.init();
    }

    /**
     * Instance method wrapper for the standalone hashPin function.
     * Maintained for backward compatibility with existing code.
     * @param {string} pin - The 4-digit PIN
     * @param {number|string} userId - The user ID used as salt
     * @returns {Promise<string>} Hex-encoded SHA-256 hash
     */
    hashPin(pin, userId) {
        return hashPin(pin, userId);
    }

    /**
     * Generate a cryptographically secure session token
     * Uses Web Crypto API's getRandomValues for 256 bits of entropy
     * @returns {string} Secure token in format 'offline_<64-char-hex>'
     */
    async _generateSecureToken() {
        const randomBytes = new Uint8Array(32); // 256 bits
        crypto.getRandomValues(randomBytes);
        const hexToken = Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return `offline_${hexToken}`;
    }

    async validatePin(userId, pin) {
        try {
            const pinHash = await this.hashPin(pin, userId);

            // First check offline cache
            const cachedUser = await offlineDB.getUser(userId);
            if (cachedUser && cachedUser.pos_offline_pin_hash) {
                return cachedUser.pos_offline_pin_hash === pinHash;
            }

            // If online, validate with server and cache result
            if (navigator.onLine && this.env?.services?.rpc) {
                try {
                    const result = await this.env.services.rpc('/pdc_pos_offline/validate_pin', {
                        user_id: userId,
                        pin_hash: pinHash,
                    });

                    if (result.success) {
                        // Cache user data for offline use
                        await this.cacheUserData(result.user_data);
                    }

                    return result.success;
                } catch (rpcError) {
                    // Network could drop mid-request even if navigator.onLine was true
                    console.warn('[PDC-Offline] RPC failed, falling back to offline cache:', rpcError);

                    // Fall back to cached data if RPC fails
                    if (cachedUser && cachedUser.pos_offline_pin_hash) {
                        return cachedUser.pos_offline_pin_hash === pinHash;
                    }
                    return false;
                }
            }

            return false;
        } catch (error) {
            console.error('[PDC-Offline] PIN validation error:', error);
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

            // Validate PIN (no lockout - users can retry indefinitely)
            const isValid = await this.validatePin(user.id, pin);
            if (!isValid) {
                console.warn(`[PDC-Offline] Failed login attempt for user ${login}`);
                return {
                    success: false,
                    error: 'Incorrect PIN. Please try again.'
                };
            }

            // Create offline session with cryptographically secure token
            // Note: Sessions have NO timeout while offline - valid until server returns
            const sessionToken = await this._generateSecureToken();
            const sessionData = {
                id: sessionToken,
                user_id: user.id,
                user_data: user,
                offline_mode: true,
                authenticated_at: new Date().toISOString(),
                // No expires_at - sessions persist indefinitely while offline
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
        // Guard against undefined env.services during initialization
        if (!navigator.onLine || !this.env?.services?.rpc) return;

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
