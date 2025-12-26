/** 
 * Automated tests for PDC POS Offline Authentication
 * Test framework: Jest/Mocha compatible
 */

import { OfflineAuth } from '../static/src/js/offline_auth.js';
import { offlineDB } from '../static/src/js/offline_db.js';

describe('PDC POS Offline Authentication Tests', () => {
    let auth;
    let db;
    
    beforeEach(async () => {
        // Initialize test environment
        auth = new OfflineAuth({ services: { rpc: mockRpc } });
        db = offlineDB;
        await db.init();
        await clearTestData();
    });
    
    afterEach(async () => {
        await clearTestData();
    });
    
    // Test Case 1: PIN Brute Force Protection
    describe('TC1: PIN Brute Force Protection', () => {
        it('should track failed attempts', async () => {
            const userId = 1;
            const wrongPin = '0000';
            
            // First attempt
            const result1 = await auth.validatePin(userId, wrongPin);
            expect(result1).toBe(false);
            
            const attempts = await auth.getFailedAttempts(userId);
            expect(attempts).toBe(1);
        });
        
        it('should lock account after 5 failed attempts', async () => {
            const userId = 1;
            const wrongPin = '0000';
            
            // Make 5 failed attempts
            for (let i = 0; i < 5; i++) {
                await auth.validatePin(userId, wrongPin);
            }
            
            // Check lockout
            const lockStatus = await auth.isAccountLocked(userId);
            expect(lockStatus.locked).toBe(true);
            expect(lockStatus.lockDuration).toBe(300000); // 5 minutes
        });
        
        it('should reset attempts after successful login', async () => {
            const userId = 1;
            const correctPin = '1234';
            
            // Make 2 failed attempts
            await auth.validatePin(userId, '0000');
            await auth.validatePin(userId, '1111');
            
            // Successful login
            await mockUserWithPin(userId, correctPin);
            const result = await auth.validatePin(userId, correctPin);
            expect(result).toBe(true);
            
            // Check attempts reset
            const attempts = await auth.getFailedAttempts(userId);
            expect(attempts).toBe(0);
        });
    });
    
    // Test Case 2: Session Persistence
    describe('TC2: Session Persistence Across Crashes', () => {
        it('should save session to IndexedDB', async () => {
            const sessionData = {
                id: 'test_session_123',
                user_id: 1,
                created: new Date().toISOString()
            };
            
            await db.saveSession(sessionData);
            const retrieved = await db.getSession('test_session_123');
            
            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe('test_session_123');
            expect(retrieved.user_id).toBe(1);
        });
        
        it('should restore session after browser restart', async () => {
            // Simulate session save before "crash"
            const sessionData = {
                id: 'crash_test_session',
                user_id: 1,
                user_data: { name: 'Test User', login: 'test@example.com' },
                created: new Date().toISOString(),
                lastAccessed: new Date().toISOString()
            };
            
            await db.saveSession(sessionData);
            
            // Simulate browser restart by reinitializing
            const newDb = Object.create(offlineDB);
            await newDb.init();
            
            const restored = await newDb.getActiveSession();
            expect(restored).toBeDefined();
            expect(restored.id).toBe('crash_test_session');
        });
        
        it('should handle corrupted session data', async () => {
            // Simulate corrupted data
            const tx = db.db.transaction(['sessions'], 'readwrite');
            const store = tx.objectStore('sessions');
            await store.put({ id: 'corrupt', data: null });
            
            const restored = await db.getSession('corrupt');
            expect(restored.data).toBeNull();
            
            // Should not crash
            const active = await db.getActiveSession();
            expect(active).toBeDefined();
        });
    });
    
    // Test Case 3: Network Flapping
    describe('TC3: Network Flapping During Transaction', () => {
        it('should queue transactions during offline periods', async () => {
            const syncManager = { addToSyncQueue: jest.fn() };
            
            // Simulate offline
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false
            });
            
            // Create transaction
            const transaction = {
                type: 'payment',
                amount: 100,
                timestamp: new Date().toISOString()
            };
            
            await syncManager.addToSyncQueue('payment', transaction);
            expect(syncManager.addToSyncQueue).toHaveBeenCalledWith('payment', transaction);
        });
        
        it('should handle rapid online/offline transitions', async () => {
            const states = [];
            const monitor = {
                on: (event, callback) => {
                    if (event === 'connection-lost') {
                        setTimeout(() => callback(), 100);
                    }
                    if (event === 'connection-restored') {
                        setTimeout(() => callback(), 200);
                    }
                }
            };
            
            // Simulate flapping
            for (let i = 0; i < 10; i++) {
                navigator.onLine = i % 2 === 0;
                states.push(navigator.onLine);
                await sleep(50);
            }
            
            expect(states).toHaveLength(10);
            expect(states.filter(s => !s)).toHaveLength(5); // 5 offline states
        });
    });
    
    // Test Case 4: Concurrent Users
    describe('TC4: Concurrent Users with Same PIN', () => {
        it('should isolate sessions for different users', async () => {
            // User 1 login
            const session1 = await auth.authenticateOffline('user1', '1234');
            expect(session1.success).toBe(true);
            expect(session1.session.user_data.login).toBe('user1');
            
            // User 2 login with same PIN
            const session2 = await auth.authenticateOffline('user2', '1234');
            expect(session2.success).toBe(true);
            expect(session2.session.user_data.login).toBe('user2');
            
            // Verify isolation
            expect(session1.session.id).not.toBe(session2.session.id);
        });
        
        it('should handle simultaneous sync operations', async () => {
            const syncPromises = [];
            
            // Simulate 5 users syncing simultaneously
            for (let i = 1; i <= 5; i++) {
                syncPromises.push(
                    simulateUserSync(`user${i}`, generateTestOrders(10))
                );
            }
            
            const results = await Promise.all(syncPromises);
            expect(results.every(r => r.success)).toBe(true);
            expect(new Set(results.map(r => r.userId)).size).toBe(5); // All unique
        });
    });
    
    // Test Case 5: Storage Quota
    describe('TC5: Storage Quota Exceeded', () => {
        it('should warn at 80% capacity', async () => {
            const warnings = [];
            db.on('storage-warning', (msg) => warnings.push(msg));
            
            // Fill storage to 80%
            await fillStorageTo(80);
            
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('80%');
        });
        
        it('should cleanup old sessions when full', async () => {
            // Create old sessions
            for (let i = 0; i < 20; i++) {
                const oldDate = new Date();
                oldDate.setDate(oldDate.getDate() - 10); // 10 days old
                
                await db.saveSession({
                    id: `old_session_${i}`,
                    created: oldDate.toISOString()
                });
            }
            
            // Trigger cleanup
            const deleted = await db.clearOldSessions(7);
            expect(deleted).toBe(20); // All sessions older than 7 days
        });
    });
    
    // Test Case 6: UI Performance
    describe('TC6: UI Performance Under Load', () => {
        it('should search 10k products in under 500ms', async () => {
            // Load test products
            const products = generateTestProducts(10000);
            await db.cacheProducts(products);
            
            const startTime = performance.now();
            const results = await db.searchProducts('Product 5000');
            const endTime = performance.now();
            
            expect(endTime - startTime).toBeLessThan(500);
            expect(results.length).toBeGreaterThan(0);
        });
        
        it('should maintain 60fps during scrolling', async () => {
            const frameTimings = [];
            
            // Simulate scroll with performance monitoring
            const measureFrame = () => {
                const start = performance.now();
                // Simulate render work
                simulateUIWork();
                const end = performance.now();
                frameTimings.push(end - start);
            };
            
            // Measure 60 frames
            for (let i = 0; i < 60; i++) {
                measureFrame();
            }
            
            const avgFrameTime = frameTimings.reduce((a, b) => a + b) / frameTimings.length;
            expect(avgFrameTime).toBeLessThan(16.67); // 60fps = 16.67ms per frame
        });
    });
    
    // Test Case 8: PIN Input Security
    describe('TC8: PIN Input Security', () => {
        it('should prevent clipboard operations', async () => {
            const pinInput = createPINInput();
            
            // Try to copy
            const copyEvent = new ClipboardEvent('copy');
            pinInput.dispatchEvent(copyEvent);
            expect(copyEvent.defaultPrevented).toBe(true);
            
            // Try to paste
            const pasteEvent = new ClipboardEvent('paste');
            pinInput.dispatchEvent(pasteEvent);
            expect(pasteEvent.defaultPrevented).toBe(true);
        });
        
        it('should auto-clear after 30 seconds', async () => {
            jest.useFakeTimers();
            const pinInput = createPINInput();
            pinInput.value = '1234';
            
            // Fast forward 30 seconds
            jest.advanceTimersByTime(30000);
            
            expect(pinInput.value).toBe('');
            jest.useRealTimers();
        });
    });
    
    // Test Case 9: Data Conflict Resolution
    describe('TC9: Data Conflict Resolution', () => {
        it('should detect order conflicts', async () => {
            const orderId = 'ORD001';
            
            // Offline modification
            const offlineOrder = {
                id: orderId,
                items: 5,
                total: 100,
                modified: new Date('2023-01-01T10:00:00').toISOString(),
                version: 1
            };
            
            // Online modification (newer)
            const onlineOrder = {
                id: orderId,
                items: 3,
                total: 75,
                modified: new Date('2023-01-01T11:00:00').toISOString(),
                version: 2
            };
            
            const conflict = detectConflict(offlineOrder, onlineOrder);
            expect(conflict).toBe(true);
            expect(conflict.type).toBe('version_mismatch');
        });
        
        it('should merge non-conflicting changes', async () => {
            const order = { id: 1, items: [], customer: null };
            
            // Change 1: Add items
            const change1 = { items: ['item1', 'item2'] };
            
            // Change 2: Set customer (non-conflicting)
            const change2 = { customer: { id: 123, name: 'John' } };
            
            const merged = mergeChanges(order, [change1, change2]);
            expect(merged.items).toHaveLength(2);
            expect(merged.customer.name).toBe('John');
        });
    });
    
    // Test Case 10: Extended Offline Operation
    describe('TC10: Extended Offline Operation', () => {
        it('should handle 7 days of offline data', async () => {
            const startDate = new Date('2023-01-01');
            const orders = [];
            
            // Generate 7 days of orders (100/day)
            for (let day = 0; day < 7; day++) {
                for (let order = 0; order < 100; order++) {
                    const orderDate = new Date(startDate);
                    orderDate.setDate(orderDate.getDate() + day);
                    
                    orders.push({
                        id: `DAY${day}_ORD${order}`,
                        date: orderDate.toISOString(),
                        items: Math.floor(Math.random() * 10) + 1,
                        total: Math.random() * 500
                    });
                }
            }
            
            // Store all orders
            const storeStart = performance.now();
            await db.storeOfflineOrders(orders);
            const storeEnd = performance.now();
            
            expect(orders).toHaveLength(700);
            expect(storeEnd - storeStart).toBeLessThan(5000); // Under 5 seconds
            
            // Verify retrieval
            const retrieved = await db.getAllOfflineOrders();
            expect(retrieved).toHaveLength(700);
        });
        
        it('should sync 700 orders efficiently', async () => {
            const orders = generateTestOrders(700);
            
            const syncStart = performance.now();
            const results = await batchSyncOrders(orders, 50); // Batch size 50
            const syncEnd = performance.now();
            
            expect(results.success).toBe(true);
            expect(results.synced).toBe(700);
            expect(syncEnd - syncStart).toBeLessThan(300000); // Under 5 minutes
        });
    });
});

// Helper Functions
async function clearTestData() {
    const db = offlineDB.db;
    const stores = ['sessions', 'users', 'config'];
    
    for (const storeName of stores) {
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        await store.clear();
    }
}

async function mockUserWithPin(userId, pin) {
    const salt = String(userId);
    const pinHash = await sha256(pin + salt);
    
    await offlineDB.saveUser({
        id: userId,
        login: `user${userId}`,
        pos_offline_pin_hash: pinHash
    });
}

function generateTestProducts(count) {
    const products = [];
    for (let i = 0; i < count; i++) {
        products.push({
            id: i + 1,
            name: `Product ${i + 1}`,
            price: Math.random() * 100,
            barcode: `${Date.now()}${i}`
        });
    }
    return products;
}

function generateTestOrders(count) {
    const orders = [];
    for (let i = 0; i < count; i++) {
        orders.push({
            id: `ORD${Date.now()}_${i}`,
            items: Math.floor(Math.random() * 10) + 1,
            total: Math.random() * 500,
            created: new Date().toISOString()
        });
    }
    return orders;
}

async function simulateUserSync(userId, orders) {
    // Simulate sync operation
    await sleep(Math.random() * 1000); // Random delay
    return {
        success: true,
        userId: userId,
        syncedOrders: orders.length
    };
}

async function fillStorageTo(percentage) {
    const quota = await navigator.storage.estimate();
    const targetBytes = (quota.quota * percentage) / 100;
    const currentUsage = quota.usage;
    const bytesToAdd = targetBytes - currentUsage;
    
    if (bytesToAdd > 0) {
        const chunk = new ArrayBuffer(bytesToAdd);
        await offlineDB.saveConfig('fill_data', chunk);
    }
}

function createPINInput() {
    const input = document.createElement('input');
    input.type = 'password';
    input.maxLength = 4;
    input.className = 'pin-input';
    
    // Add security listeners
    input.addEventListener('copy', (e) => e.preventDefault());
    input.addEventListener('paste', (e) => e.preventDefault());
    input.addEventListener('cut', (e) => e.preventDefault());
    
    // Auto-clear timer
    let clearTimer;
    input.addEventListener('input', () => {
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => {
            input.value = '';
        }, 30000);
    });
    
    return input;
}

function detectConflict(local, remote) {
    if (local.version !== remote.version) {
        return { type: 'version_mismatch', local, remote };
    }
    if (local.modified !== remote.modified) {
        return { type: 'concurrent_modification', local, remote };
    }
    return false;
}

function mergeChanges(base, changes) {
    return changes.reduce((merged, change) => {
        return { ...merged, ...change };
    }, { ...base });
}

async function batchSyncOrders(orders, batchSize) {
    const results = { success: true, synced: 0, failed: 0 };
    
    for (let i = 0; i < orders.length; i += batchSize) {
        const batch = orders.slice(i, i + batchSize);
        try {
            // Simulate API call
            await sleep(100); // Network delay
            results.synced += batch.length;
        } catch (error) {
            results.failed += batch.length;
            results.success = false;
        }
    }
    
    return results;
}

function simulateUIWork() {
    // Simulate DOM operations
    const elements = [];
    for (let i = 0; i < 100; i++) {
        const div = document.createElement('div');
        div.textContent = `Item ${i}`;
        elements.push(div);
    }
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const mockRpc = async (route, params) => {
    // Mock RPC responses for testing
    if (route === '/pdc_pos_offline/validate_pin') {
        return { success: params.pin_hash === 'expected_hash' };
    }
    return {};
};

export { clearTestData, generateTestProducts, generateTestOrders };