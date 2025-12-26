/** @odoo-module */

import { Component } from "@odoo/owl";

export class OfflineDB {
    constructor() {
        this.dbName = 'PDCPOSOfflineDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create stores if they don't exist
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
                    sessionStore.createIndex('user_id', 'user_id', { unique: false });
                    sessionStore.createIndex('created', 'created', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id' });
                    userStore.createIndex('login', 'login', { unique: true });
                }
                
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }
            };
        });
    }
    
    async saveSession(sessionData) {
        const tx = this.db.transaction(['sessions'], 'readwrite');
        const store = tx.objectStore('sessions');
        
        const data = {
            ...sessionData,
            created: new Date().toISOString(),
            lastAccessed: new Date().toISOString()
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getSession(sessionId) {
        const tx = this.db.transaction(['sessions'], 'readonly');
        const store = tx.objectStore('sessions');
        
        return new Promise((resolve, reject) => {
            const request = store.get(sessionId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getActiveSession() {
        const tx = this.db.transaction(['sessions'], 'readonly');
        const store = tx.objectStore('sessions');
        
        return new Promise((resolve, reject) => {
            const request = store.openCursor(null, 'prev'); // Get most recent
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    // Check if session is still valid (e.g., not expired)
                    const session = cursor.value;
                    const now = new Date();
                    const lastAccessed = new Date(session.lastAccessed);
                    const hoursSinceAccess = (now - lastAccessed) / (1000 * 60 * 60);
                    
                    // Sessions expire after 24 hours of inactivity
                    if (hoursSinceAccess < 24) {
                        resolve(session);
                    } else {
                        cursor.continue(); // Check next session
                    }
                } else {
                    resolve(null); // No valid session found
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    async updateSessionAccess(sessionId) {
        const session = await this.getSession(sessionId);
        if (session) {
            session.lastAccessed = new Date().toISOString();
            await this.saveSession(session);
        }
    }
    
    async saveUser(userData) {
        const tx = this.db.transaction(['users'], 'readwrite');
        const store = tx.objectStore('users');
        
        return new Promise((resolve, reject) => {
            const request = store.put(userData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getUser(userId) {
        const tx = this.db.transaction(['users'], 'readonly');
        const store = tx.objectStore('users');
        
        return new Promise((resolve, reject) => {
            const request = store.get(userId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getUserByLogin(login) {
        const tx = this.db.transaction(['users'], 'readonly');
        const store = tx.objectStore('users');
        const index = store.index('login');
        
        return new Promise((resolve, reject) => {
            const request = index.get(login);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async saveConfig(key, value) {
        const tx = this.db.transaction(['config'], 'readwrite');
        const store = tx.objectStore('config');
        
        return new Promise((resolve, reject) => {
            const request = store.put({ key, value, updated: new Date().toISOString() });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getConfig(key) {
        const tx = this.db.transaction(['config'], 'readonly');
        const store = tx.objectStore('config');
        
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    }
    
    async clearOldSessions(daysToKeep = 7) {
        const tx = this.db.transaction(['sessions'], 'readwrite');
        const store = tx.objectStore('sessions');
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        return new Promise((resolve, reject) => {
            const request = store.openCursor();
            let deletedCount = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const created = new Date(cursor.value.created);
                    if (created < cutoffDate) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                } else {
                    resolve(deletedCount);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// Create singleton instance
export const offlineDB = new OfflineDB();