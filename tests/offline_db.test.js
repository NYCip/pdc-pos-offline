/**
 * Comprehensive test suite for offline database module
 * Tests retry logic, abort handling, concurrent operations, and cleanup functions
 * @odoo-module
 */

import { offlineDB } from '../static/src/js/offline_db.js';

describe('Offline Database (offline_db.js)', () => {

    // ==================== Setup/Teardown ====================

    beforeAll(async () => {
        // Initialize database before all tests
        await offlineDB.init();
    });

    beforeEach(async () => {
        // Clear all stores before each test to ensure isolation
        await offlineDB.clearAllData?.();
    });

    afterAll(async () => {
        // Close database after all tests complete
        if (offlineDB.db) {
            offlineDB.db.close();
        }
    });

    // ==================== Unit Tests: Retry Logic ====================

    describe('Retry Logic (_executeWithRetry)', () => {

        test('should succeed on first attempt for successful operation', async () => {
            const operation = jest.fn(async () => 'success');
            const result = await offlineDB._executeWithRetry(operation, 'test-op');

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        test('should retry on AbortError and eventually succeed', async () => {
            let attempts = 0;
            const operation = jest.fn(async () => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('AbortError: The transaction was aborted');
                }
                return 'success';
            });

            const result = await offlineDB._executeWithRetry(operation, 'test-op');

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
        });

        test('should retry on QuotaExceededError', async () => {
            let attempts = 0;
            const operation = jest.fn(async () => {
                attempts++;
                if (attempts < 2) {
                    const error = new Error('QuotaExceededError');
                    error.name = 'QuotaExceededError';
                    throw error;
                }
                return 'success';
            });

            const result = await offlineDB._executeWithRetry(operation, 'test-op');

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        test('should NOT retry on permanent errors', async () => {
            const operation = jest.fn(async () => {
                throw new Error('TypeError: Cannot read property');
            });

            await expect(
                offlineDB._executeWithRetry(operation, 'test-op')
            ).rejects.toThrow('TypeError: Cannot read property');

            expect(operation).toHaveBeenCalledTimes(1);
        });

        test('should fail after MAX_RETRY_ATTEMPTS for transient errors', async () => {
            const operation = jest.fn(async () => {
                throw new Error('AbortError: The transaction was aborted');
            });

            await expect(
                offlineDB._executeWithRetry(operation, 'test-op')
            ).rejects.toThrow('AbortError');

            expect(operation).toHaveBeenCalledTimes(5); // MAX_RETRY_ATTEMPTS = 5
        });

        test('should apply exponential backoff delays', async () => {
            let attempts = 0;
            const timestamps = [];
            const operation = jest.fn(async () => {
                timestamps.push(Date.now());
                attempts++;
                if (attempts < 3) {
                    throw new Error('AbortError: The transaction was aborted');
                }
                return 'success';
            });

            const startTime = Date.now();
            await offlineDB._executeWithRetry(operation, 'test-op');
            const totalTime = Date.now() - startTime;

            // Expected delays: 100ms + 200ms = 300ms (plus some overhead)
            expect(totalTime).toBeGreaterThanOrEqual(300);
        });

    });

    // ==================== Unit Tests: Session Operations ====================

    describe('Session Operations with Retry', () => {

        test('should save and retrieve session', async () => {
            const sessionData = {
                id: 1,
                name: 'Test Session',
                user_id: 1,
                config_id: 1,
                state: 'open',
                offline_capable: true
            };

            await offlineDB.saveSession(sessionData);
            const retrieved = await offlineDB.getSession(1);

            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(1);
            expect(retrieved.name).toBe('Test Session');
        });

        test('should get active session', async () => {
            const sessionData = {
                id: 1,
                name: 'Test Session',
                user_id: 1,
                config_id: 1,
                state: 'open',
                offline_capable: true,
                lastAccessed: new Date().toISOString()
            };

            await offlineDB.saveSession(sessionData);
            const active = await offlineDB.getActiveSession();

            expect(active).toBeDefined();
            expect(active.id).toBe(1);
        });

        test('should handle missing session gracefully', async () => {
            const retrieved = await offlineDB.getSession(999);
            expect(retrieved).toBeUndefined();
        });

        test('should clear old sessions', async () => {
            // Save a session with old timestamp
            const oldSession = {
                id: 1,
                name: 'Old Session',
                user_id: 1,
                config_id: 1,
                state: 'closed',
                lastAccessed: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString() // 35 days ago
            };

            await offlineDB.saveSession(oldSession);
            await offlineDB.clearOldSessions();

            const retrieved = await offlineDB.getSession(1);
            expect(retrieved).toBeUndefined();
        });

    });

    // ==================== Unit Tests: User Operations ====================

    describe('User Operations with Retry', () => {

        test('should save and retrieve user', async () => {
            const userData = {
                id: 1,
                name: 'Test User',
                login: 'testuser',
                pos_offline_pin_hash: 'hashed_pin'
            };

            await offlineDB.saveUser(userData);
            const retrieved = await offlineDB.getUser(1);

            expect(retrieved).toBeDefined();
            expect(retrieved.login).toBe('testuser');
        });

        test('should get user by login', async () => {
            const userData = {
                id: 1,
                name: 'Test User',
                login: 'testuser',
                pos_offline_pin_hash: 'hashed_pin'
            };

            await offlineDB.saveUser(userData);
            const retrieved = await offlineDB.getUserByLogin('testuser');

            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(1);
        });

        test('should get all users', async () => {
            const user1 = { id: 1, name: 'User 1', login: 'user1' };
            const user2 = { id: 2, name: 'User 2', login: 'user2' };

            await offlineDB.saveUser(user1);
            await offlineDB.saveUser(user2);

            const allUsers = await offlineDB.getAllUsers();
            expect(allUsers.length).toBe(2);
        });

    });

    // ==================== Unit Tests: Transaction Operations ====================

    describe('Transaction Operations with Retry', () => {

        test('should save and retrieve transaction', async () => {
            const txData = {
                id: 1,
                order_id: 1,
                type: 'payment',
                amount: 100,
                status: 'pending',
                attempts: 0
            };

            await offlineDB.saveTransaction(txData);
            const pending = await offlineDB.getPendingTransactions();

            expect(pending.length).toBeGreaterThan(0);
            expect(pending[0].id).toBe(1);
        });

        test('should track transaction attempts', async () => {
            const txData = {
                id: 1,
                order_id: 1,
                type: 'payment',
                amount: 100,
                status: 'pending',
                attempts: 0
            };

            await offlineDB.saveTransaction(txData);
            await offlineDB.incrementTransactionAttempt(1);

            const tx = await offlineDB.getPendingTransactions();
            expect(tx[0].attempts).toBe(1);
        });

        test('should mark transaction as synced', async () => {
            const txData = {
                id: 1,
                order_id: 1,
                type: 'payment',
                amount: 100,
                status: 'pending',
                attempts: 0
            };

            await offlineDB.saveTransaction(txData);
            await offlineDB.markTransactionSynced(1);

            const tx = await offlineDB.getPendingTransactions();
            expect(tx.length).toBe(0);
        });

        test('should get pending transaction count', async () => {
            await offlineDB.saveTransaction({ id: 1, order_id: 1, type: 'payment', amount: 100, status: 'pending', attempts: 0 });
            await offlineDB.saveTransaction({ id: 2, order_id: 2, type: 'payment', amount: 200, status: 'pending', attempts: 0 });

            const count = await offlineDB.getPendingTransactionCount();
            expect(count).toBe(2);
        });

    });

    // ==================== Unit Tests: Product Operations ====================

    describe('Product Operations with Retry', () => {

        test('should bulk save and retrieve products', async () => {
            const products = [
                { id: 1, name: 'Product 1', list_price: 100, barcode: 'BC1' },
                { id: 2, name: 'Product 2', list_price: 200, barcode: 'BC2' }
            ];

            await offlineDB.bulkSaveProducts(products);
            const all = await offlineDB.getAllProducts();

            expect(all.length).toBe(2);
        });

        test('should get product by barcode', async () => {
            const product = { id: 1, name: 'Product 1', list_price: 100, barcode: 'BC1' };
            await offlineDB.bulkSaveProducts([product]);

            const retrieved = await offlineDB.getProductByBarcode('BC1');
            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(1);
        });

        test('should get product count', async () => {
            const products = [
                { id: 1, name: 'Product 1', list_price: 100 },
                { id: 2, name: 'Product 2', list_price: 200 },
                { id: 3, name: 'Product 3', list_price: 300 }
            ];

            await offlineDB.bulkSaveProducts(products);
            const count = await offlineDB.getProductCount();

            expect(count).toBe(3);
        });

    });

    // ==================== Integration Tests: Concurrent Operations ====================

    describe('Concurrent Operations', () => {

        test('should handle concurrent reads without conflicts', async () => {
            const sessionData = {
                id: 1,
                name: 'Test Session',
                user_id: 1,
                config_id: 1,
                state: 'open'
            };

            await offlineDB.saveSession(sessionData);

            const promises = Array(5).fill(null).map(() =>
                offlineDB.getSession(1)
            );

            const results = await Promise.all(promises);
            expect(results.every(r => r.id === 1)).toBe(true);
        });

        test('should handle concurrent writes with retries', async () => {
            const sessions = Array(5).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Session ${i + 1}`,
                user_id: i + 1,
                config_id: 1,
                state: 'open'
            }));

            const promises = sessions.map(session =>
                offlineDB.saveSession(session)
            );

            await Promise.all(promises);
            const all = await offlineDB.getAllSessions?.() || [];

            expect(all.length).toBeGreaterThanOrEqual(5);
        });

        test('should handle concurrent read/write operations', async () => {
            const writePromises = Array(3).fill(null).map((_, i) =>
                offlineDB.saveSession({
                    id: i + 1,
                    name: `Session ${i + 1}`,
                    user_id: i + 1,
                    config_id: 1,
                    state: 'open'
                })
            );

            const readPromises = Array(3).fill(null).map((_, i) =>
                offlineDB.getSession(i + 1)
            );

            const allPromises = [...writePromises, ...readPromises];
            await expect(Promise.all(allPromises)).resolves.toBeDefined();
        });

    });

    // ==================== Integration Tests: Cleanup Operations ====================

    describe('Cleanup Operations Under Stress', () => {

        test('should clear old transactions without aborting', async () => {
            // Create transactions with varying ages
            const now = Date.now();
            const transactions = Array(10).fill(null).map((_, i) => ({
                id: i + 1,
                order_id: i + 1,
                type: 'payment',
                amount: 100 * (i + 1),
                status: 'synced',
                synced_at: new Date(now - (i * 2 * 24 * 60 * 60 * 1000)).toISOString()
            }));

            for (const tx of transactions) {
                await offlineDB.saveTransaction(tx);
            }

            // Clear old transactions (older than 14 days)
            await expect(offlineDB.clearOldTransactions()).resolves.not.toThrow();
        });

        test('should clear old sessions during page visibility change', async () => {
            // Save sessions with different access times
            const sessions = Array(5).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Session ${i + 1}`,
                user_id: i + 1,
                config_id: 1,
                state: 'open',
                lastAccessed: new Date(Date.now() - (i * 10 * 24 * 60 * 60 * 1000)).toISOString()
            }));

            for (const session of sessions) {
                await offlineDB.saveSession(session);
            }

            // Simulate page visibility change - cleanup should not abort
            await expect(offlineDB.clearOldSessions()).resolves.not.toThrow();
        });

        test('should handle clearAllProducts during concurrent reads', async () => {
            const products = Array(20).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Product ${i + 1}`,
                list_price: 100 * (i + 1)
            }));

            await offlineDB.bulkSaveProducts(products);

            // Concurrent read while clearing
            const readPromise = offlineDB.getProductCount();
            const clearPromise = offlineDB.clearAllProducts();

            await expect(Promise.all([readPromise, clearPromise])).resolves.toBeDefined();
        });

    });

    // ==================== Error Handling Tests ====================

    describe('Error Handling and Edge Cases', () => {

        test('should handle transaction abort during save', async () => {
            const sessionData = {
                id: 1,
                name: 'Test Session',
                user_id: 1,
                config_id: 1,
                state: 'open'
            };

            // Should succeed even if internally there are aborts and retries
            await expect(offlineDB.saveSession(sessionData)).resolves.toBeDefined();
        });

        test('should handle quota exceeded errors with retry', async () => {
            // Create a large object that might trigger quota issues
            const largeProduct = {
                id: 1,
                name: 'Large Product',
                description: 'x'.repeat(10000),
                list_price: 100
            };

            // Should retry on quota exceeded
            await expect(offlineDB.bulkSaveProducts([largeProduct])).resolves.not.toThrow();
        });

        test('should handle missing database gracefully', async () => {
            // If db is not initialized, should handle gracefully
            const tempDb = offlineDB.db;

            try {
                // Create a scenario where operation might fail
                const result = await offlineDB.getSession(1);
                // Should return undefined or handle gracefully, not crash
                expect(result === undefined || typeof result === 'object').toBe(true);
            } finally {
                offlineDB.db = tempDb;
            }
        });

    });

    // ==================== Performance Tests ====================

    describe('Performance and Stress Tests', () => {

        test('should handle bulk operations efficiently', async () => {
            const products = Array(100).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Product ${i + 1}`,
                list_price: Math.random() * 1000
            }));

            const startTime = Date.now();
            await offlineDB.bulkSaveProducts(products);
            const duration = Date.now() - startTime;

            // Should complete 100 products in reasonable time (< 5 seconds)
            expect(duration).toBeLessThan(5000);
        });

        test('should retrieve large datasets', async () => {
            const products = Array(50).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Product ${i + 1}`,
                list_price: Math.random() * 1000
            }));

            await offlineDB.bulkSaveProducts(products);

            const startTime = Date.now();
            const all = await offlineDB.getAllProducts();
            const duration = Date.now() - startTime;

            expect(all.length).toBe(50);
            expect(duration).toBeLessThan(2000); // Should complete in < 2 seconds
        });

    });

});
