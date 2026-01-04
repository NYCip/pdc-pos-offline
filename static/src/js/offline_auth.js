/** @odoo-module */

import { Component } from "@odoo/owl";
import { offlineDB } from "./offline_db";
import { useService } from "@web/core/utils/hooks";

/**
 * Feature detection for Web Crypto API
 * crypto.subtle is only available in secure contexts (HTTPS or localhost)
 * This check prevents crashes in HTTP non-localhost, old browsers, or privacy mode
 * @type {boolean}
 */
export const CRYPTO_AVAILABLE = (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.digest === 'function'
);

/**
 * SHA-256 hash using Web Crypto API
 * @param {string} message - The message to hash
 * @returns {Promise<string>} Hex-encoded hash
 * @throws {Error} If crypto.subtle is not available
 */
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a password with user ID as salt (matches server-side implementation)
 * This is the authoritative implementation - use this everywhere.
 *
 * SIMPLIFIED v2: Uses same password as Odoo login (no separate PIN)
 *
 * @param {string} password - The user's password
 * @param {number|string} userId - The user ID used as salt
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 * @throws {Error} CRYPTO_NOT_AVAILABLE if crypto.subtle is unavailable
 * @throws {Error} HASH_FAILED if hash computation fails
 */
export async function hashPassword(password, userId) {
    if (!CRYPTO_AVAILABLE) {
        console.error('[PDC-Offline] crypto.subtle not available - requires HTTPS');
        throw new Error('CRYPTO_NOT_AVAILABLE');
    }

    try {
        const salt = String(userId);
        const passwordWithSalt = `${password}${salt}`;
        return await sha256(passwordWithSalt);
    } catch (error) {
        console.error('[PDC-Offline] Hash computation failed:', error);
        throw new Error('HASH_FAILED');
    }
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use hashPassword instead
 */
export const hashPin = hashPassword;

export class OfflineAuth {
    constructor(env) {
        this.env = env;
        this.offlineUsers = new Map();
    }

    async init() {
        await offlineDB.init();
    }

    /**
     * Instance method wrapper for the standalone hashPassword function.
     * @param {string} password - The user's password
     * @param {number|string} userId - The user ID used as salt
     * @returns {Promise<string>} Hex-encoded SHA-256 hash
     */
    hashPassword(password, userId) {
        return hashPassword(password, userId);
    }

    /**
     * Legacy alias for backward compatibility
     * @deprecated Use hashPassword instead
     */
    hashPin(pin, userId) {
        return hashPassword(pin, userId);
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

    /**
     * Validate password against cached hash
     *
     * SIMPLIFIED v2: Uses same password as Odoo login
     *
     * @param {number} userId - User ID
     * @param {string} password - Password to validate
     * @returns {Promise<{success: boolean, error?: string, errorCode?: string}>} Validation result
     */
    async validatePassword(userId, password) {
        try {
            const passwordHash = await this.hashPassword(password, userId);

            // Check offline cache - use new field first, fallback to legacy
            const cachedUser = await offlineDB.getUser(userId);
            if (cachedUser) {
                // Try new field first
                if (cachedUser.pos_offline_auth_hash) {
                    return { success: cachedUser.pos_offline_auth_hash === passwordHash };
                }
                // Fallback to legacy PIN hash (for migration period)
                if (cachedUser.pos_offline_pin_hash) {
                    return { success: cachedUser.pos_offline_pin_hash === passwordHash };
                }
            }

            // If online, validate with server and cache result
            if (navigator.onLine && this.env?.services?.rpc) {
                try {
                    const result = await this.env.services.rpc('/pdc_pos_offline/validate_password', {
                        user_id: userId,
                        password: password,
                    });

                    if (result.success) {
                        // Cache user data for offline use
                        await this.cacheUserData(result.user_data);
                    }

                    return { success: result.success };
                } catch (rpcError) {
                    // Network could drop mid-request even if navigator.onLine was true
                    console.warn('[PDC-Offline] RPC failed, falling back to offline cache:', rpcError);

                    // Fall back to cached data if RPC fails
                    if (cachedUser && (cachedUser.pos_offline_auth_hash || cachedUser.pos_offline_pin_hash)) {
                        const hash = cachedUser.pos_offline_auth_hash || cachedUser.pos_offline_pin_hash;
                        return { success: hash === passwordHash };
                    }
                    return { success: false, error: 'Server unavailable and no cached credentials', errorCode: 'NO_CACHE' };
                }
            }

            return { success: false, error: 'No cached credentials available', errorCode: 'NO_CACHE' };
        } catch (error) {
            if (error.message === 'CRYPTO_NOT_AVAILABLE') {
                return {
                    success: false,
                    error: 'Offline login requires HTTPS. Your browser does not support required security features.',
                    errorCode: 'CRYPTO_NOT_AVAILABLE'
                };
            }
            if (error.message === 'HASH_FAILED') {
                return {
                    success: false,
                    error: 'Password validation failed due to a security error.',
                    errorCode: 'HASH_FAILED'
                };
            }
            console.error('[PDC-Offline] Password validation error:', error);
            return { success: false, error: 'Password validation failed', errorCode: 'VALIDATION_ERROR' };
        }
    }

    /**
     * Legacy alias for backward compatibility
     * @deprecated Use validatePassword instead
     */
    async validatePin(userId, pin) {
        return this.validatePassword(userId, pin);
    }

    async cacheUserData(userData) {
        await offlineDB.saveUser({
            ...userData,
            cached_at: new Date().toISOString()
        });
    }

    /**
     * Authenticate user offline using cached credentials
     *
     * SIMPLIFIED v2: Uses same password as Odoo login (no separate PIN)
     *
     * @param {string} login - Username/login
     * @param {string} password - User's password
     * @returns {Promise<{success: boolean, session?: object, error?: string, errorCode?: string}>}
     */
    async authenticateOffline(login, password) {
        try {
            // Get user by login from cache
            const user = await offlineDB.getUserByLogin(login);
            if (!user) {
                return {
                    success: false,
                    error: 'User not found in offline cache. You must log in online at least once to enable offline mode.',
                    errorCode: 'USER_NOT_CACHED'
                };
            }

            // Check if user has offline auth hash (SSO/OAuth users won't have one)
            if (!user.pos_offline_auth_hash && !user.pos_offline_pin_hash) {
                return {
                    success: false,
                    error: 'Offline login not available for this account. SSO/OAuth users must connect to the server.',
                    errorCode: 'NO_OFFLINE_HASH'
                };
            }

            // Validate password (no lockout - users can retry indefinitely)
            const validationResult = await this.validatePassword(user.id, password);
            if (!validationResult.success) {
                console.warn(`[PDC-Offline] Failed login attempt for user ${login}`);
                // Propagate error details from validatePassword if available
                return {
                    success: false,
                    error: validationResult.error || 'Incorrect password. Please try again.',
                    errorCode: validationResult.errorCode || 'INVALID_PASSWORD'
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
            return { success: false, error: error.message, errorCode: 'AUTH_ERROR' };
        }
    }

    /**
     * Pre-cache user data for offline authentication
     *
     * Called when online to ensure users are available for offline login
     *
     * @param {number[]} userIds - Array of user IDs to cache
     */
    async cacheUsersForOffline(userIds) {
        // Guard against undefined env.services during initialization
        if (!navigator.onLine || !this.env?.services?.rpc) return;

        try {
            for (const userId of userIds) {
                const userData = await this.env.services.rpc('/web/dataset/call_kw', {
                    model: 'res.users',
                    method: 'read',
                    args: [[userId], [
                        'id', 'name', 'login',
                        'pos_offline_auth_hash',  // New field
                        'pos_offline_pin_hash',   // Legacy field (for migration)
                        'employee_ids', 'partner_id'
                    ]],
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
