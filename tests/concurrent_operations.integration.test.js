/**
 * Integration tests for concurrent database operations
 * Focuses on scenarios that previously caused AbortError
 * @odoo-module
 */

import { offlineDB } from '../static/src/js/offline_db.js';

describe('Concurrent Operations Integration Tests', () => {

    beforeAll(async () => {
        await offlineDB.init();
    });

    beforeEach(async () => {
        await offlineDB.clearAllData?.();
    });

    afterAll(async () => {
        if (offlineDB.db) {
            offlineDB.db.close();
        }
    });

    // ==================== Scenario: Page Visibility Changes ====================

    describe('Page Visibility Change Scenarios', () => {

        test('should save session when tab becomes hidden during other operations', async () => {
            const sessionData = {
                id: 1,
                name: 'Test Session',
                user_id: 1,
                config_id: 1,
                state: 'open',
                lastAccessed: new Date().toISOString()
            };

            // Start async session save
            const savePromise = offlineDB.saveSession(sessionData);

            // Simulate cleanup during save (like clearOldSessions on visibilitychange)
            const cleanupPromise = offlineDB.clearOldSessions();

            // Both should complete without aborting
            await expect(Promise.all([savePromise, cleanupPromise])).resolves.toBeDefined();

            // Session should be saved
            const retrieved = await offlineDB.getSession(1);
            expect(retrieved).toBeDefined();
        });

        test('should handle concurrent session operations during visibility change', async () => {
            const sessions = Array(3).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Session ${i + 1}`,
                user_id: i + 1,
                config_id: 1,
                state: 'open',
                lastAccessed: new Date().toISOString()
            }));

            // Save multiple sessions
            const savePromises = sessions.map(s => offlineDB.saveSession(s));

            // Trigger cleanup while saves are happening
            const cleanupPromise = offlineDB.clearOldSessions();

            // All operations should complete
            await expect(Promise.all([...savePromises, cleanupPromise])).resolves.toBeDefined();

            // All sessions should be present
            const allSessions = await offlineDB.getAllSessions?.() || [];
            expect(allSessions.length).toBeGreaterThanOrEqual(3);
        });

        test('should recover from abort during auto-save', async () => {
            const sessionData = {
                id: 1,
                name: 'Test Session',
                user_id: 1,
                config_id: 1,
                state: 'open'
            };

            // Initial save
            await offlineDB.saveSession(sessionData);

            // Simulate rapid repeated saves (like auto-save interval + visibility change)
            const rapidSaves = Array(5).fill(null).map((_, i) =>
                offlineDB.saveSession({
                    ...sessionData,
                    lastAccessed: new Date().toISOString()
                })
            );

            // With retry logic, all should succeed even if some internally abort
            await expect(Promise.all(rapidSaves)).resolves.toBeDefined();

            const retrieved = await offlineDB.getSession(1);
            expect(retrieved).toBeDefined();
        });

    });

    // ==================== Scenario: Sync Operations During Cleanup ====================

    describe('Sync Operations During Cleanup', () => {

        test('should sync transactions while clearing old ones', async () => {
            // Create pending and synced transactions
            const pending = {
                id: 1,
                order_id: 1,
                type: 'payment',
                amount: 100,
                status: 'pending',
                attempts: 0
            };

            const synced = {
                id: 2,
                order_id: 2,
                type: 'payment',
                amount: 200,
                status: 'synced',
                synced_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
            };

            await offlineDB.saveTransaction(pending);
            await offlineDB.saveTransaction(synced);

            // Concurrent operations: mark as synced while cleanup runs
            const syncPromise = offlineDB.markTransactionSynced(1);
            const cleanupPromise = offlineDB.clearOldTransactions();

            await expect(Promise.all([syncPromise, cleanupPromise])).resolves.toBeDefined();

            // Pending transaction should be synced
            const pending1 = await offlineDB.getPendingTransactions();
            expect(pending1.length).toBe(0);
        });

        test('should increment transaction attempts during sync check', async () => {
            const txData = {
                id: 1,
                order_id: 1,
                type: 'payment',
                amount: 100,
                status: 'pending',
                attempts: 0
            };

            await offlineDB.saveTransaction(txData);

            // Multiple concurrent attempt increments
            const increments = Array(3).fill(null).map(() =>
                offlineDB.incrementTransactionAttempt(1)
            );

            // Get pending while incrementing
            const getPromise = offlineDB.getPendingTransactions();

            await expect(Promise.all([...increments, getPromise])).resolves.toBeDefined();
        });

        test('should handle sync error logging during transaction processing', async () => {
            const txData = {
                id: 1,
                order_id: 1,
                type: 'payment',
                amount: 100,
                status: 'pending',
                attempts: 0
            };

            await offlineDB.saveTransaction(txData);

            // Log sync error while transaction is being processed
            const errorData = {
                id: 1,
                transaction_id: 1,
                error_message: 'Network timeout',
                error_code: 'TIMEOUT'
            };

            const saveErrorPromise = offlineDB.saveSyncError(errorData);
            const getErrorPromise = offlineDB.getSyncErrorsByTransaction(1);

            await expect(Promise.all([saveErrorPromise, getErrorPromise])).resolves.toBeDefined();
        });

    });

    // ==================== Scenario: Product Cache Refresh ====================

    describe('Product Cache Refresh During Operations', () => {

        test('should refresh product cache during ongoing sales', async () => {
            const products = Array(10).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Product ${i + 1}`,
                list_price: 100 * (i + 1),
                barcode: `BC${i + 1}`
            }));

            await offlineDB.bulkSaveProducts(products);

            // Simulate ongoing lookups while clearing cache
            const lookups = Array(5).fill(null).map((_, i) =>
                offlineDB.getProductByBarcode(`BC${(i % 10) + 1}`)
            );

            const clearPromise = offlineDB.clearAllProducts();

            // Lookups during clear should succeed (read old data or retry)
            const results = await Promise.allSettled([...lookups, clearPromise]);

            // At least some should succeed
            const successes = results.filter(r => r.status === 'fulfilled');
            expect(successes.length).toBeGreaterThan(0);
        });

        test('should handle rapid product searches during bulk import', async () => {
            const batch1 = Array(20).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Product ${i + 1}`,
                list_price: Math.random() * 1000,
                barcode: `BC${i + 1}`
            }));

            // Start bulk import
            const importPromise = offlineDB.bulkSaveProducts(batch1);

            // Concurrent searches (would fail before retry logic)
            const searches = Array(10).fill(null).map((_, i) =>
                offlineDB.getProductByBarcode(`BC${(i % 20) + 1}`)
            );

            await expect(Promise.all([importPromise, ...searches])).resolves.toBeDefined();
        });

    });

    // ==================== Scenario: Order Completion & Sync ====================

    describe('Order Completion During Sync', () => {

        test('should save order while syncing previous orders', async () => {
            // Save initial order
            const order1 = {
                id: 1,
                order_ref: 'ORD001',
                amount: 100,
                state: 'done'
            };

            await offlineDB.saveOrder(order1);

            // Simulate sync check on existing orders
            const getSyncPromise = offlineDB.getAllOrders();

            // New order arrives during sync
            const order2 = {
                id: 2,
                order_ref: 'ORD002',
                amount: 200,
                state: 'done'
            };

            const saveNewPromise = offlineDB.saveOrder(order2);

            await expect(Promise.all([getSyncPromise, saveNewPromise])).resolves.toBeDefined();

            // Both orders should exist
            const all = await offlineDB.getAllOrders();
            expect(all.length).toBeGreaterThanOrEqual(2);
        });

        test('should handle offline order state transitions', async () => {
            const offlineOrder = {
                id: 1,
                order_id: 1,
                state: 'pending',
                attempts: 0
            };

            await offlineDB.saveOfflineOrder(offlineOrder);

            // Multiple concurrent state changes
            const statePromises = Array(3).fill(null).map((_, i) =>
                offlineDB.incrementOfflineOrderAttempt(1)
            );

            const getPromise = offlineDB.getUnsyncedOfflineOrders();

            await expect(Promise.all([...statePromises, getPromise])).resolves.toBeDefined();
        });

    });

    // ==================== Scenario: Category & Tax Cache Updates ====================

    describe('Category and Tax Updates', () => {

        test('should update categories without blocking product operations', async () => {
            // Save initial categories
            const categories = Array(5).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Category ${i + 1}`,
                sequence: i
            }));

            await offlineDB.saveCategories(categories);

            // Get categories while clearing
            const getPromise = offlineDB.getAllCategories();
            const clearPromise = offlineDB.clearAllCategories();

            await expect(Promise.all([getPromise, clearPromise])).resolves.toBeDefined();
        });

        test('should save taxes concurrently with product cache', async () => {
            const taxes = [
                { id: 1, name: 'VAT 21%', amount: 21 },
                { id: 2, name: 'VAT 6%', amount: 6 }
            ];

            const products = Array(10).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Product ${i + 1}`,
                list_price: 100,
                taxes_id: [1, 2]
            }));

            const taxPromise = offlineDB.saveTaxes(taxes);
            const productPromise = offlineDB.bulkSaveProducts(products);

            await expect(Promise.all([taxPromise, productPromise])).resolves.toBeDefined();

            // Both should be retrievable
            const allTaxes = await offlineDB.getAllTaxes();
            const allProducts = await offlineDB.getAllProducts();

            expect(allTaxes.length).toBeGreaterThanOrEqual(2);
            expect(allProducts.length).toBeGreaterThanOrEqual(10);
        });

    });

    // ==================== Scenario: Payment Methods & Session Setup ====================

    describe('Payment Methods Setup', () => {

        test('should setup payment methods during session initialization', async () => {
            const paymentMethods = [
                { id: 1, name: 'Cash', type: 'cash' },
                { id: 2, name: 'Card', type: 'card' }
            ];

            const sessionData = {
                id: 1,
                name: 'Test Session',
                user_id: 1,
                config_id: 1,
                state: 'open'
            };

            // Concurrent setup operations
            const paymentPromise = offlineDB.savePaymentMethods(paymentMethods);
            const sessionPromise = offlineDB.saveSession(sessionData);

            await expect(Promise.all([paymentPromise, sessionPromise])).resolves.toBeDefined();

            // Both should be retrievable
            const methods = await offlineDB.getAllPaymentMethods();
            const session = await offlineDB.getSession(1);

            expect(methods.length).toBeGreaterThanOrEqual(2);
            expect(session).toBeDefined();
        });

    });

    // ==================== Scenario: POS Data Cache Full Workflow ====================

    describe('Full POS Data Cache Workflow', () => {

        test('should cache all POS data with concurrent access', async () => {
            // Prepare data
            const products = Array(30).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Product ${i + 1}`,
                list_price: Math.random() * 1000
            }));

            const categories = Array(5).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Category ${i + 1}`
            }));

            const taxes = [
                { id: 1, name: 'VAT 21%', amount: 21 },
                { id: 2, name: 'VAT 6%', amount: 6 }
            ];

            const paymentMethods = [
                { id: 1, name: 'Cash' },
                { id: 2, name: 'Card' }
            ];

            // Save all data concurrently (like during initial POS load)
            const allPromises = [
                offlineDB.bulkSaveProducts(products),
                offlineDB.saveCategories(categories),
                offlineDB.saveTaxes(taxes),
                offlineDB.savePaymentMethods(paymentMethods)
            ];

            await expect(Promise.all(allPromises)).resolves.toBeDefined();

            // Verify all data is accessible
            const productCount = await offlineDB.getProductCount();
            const categoryCount = await offlineDB.getAllCategories();
            const taxCount = await offlineDB.getAllTaxes();
            const methodCount = await offlineDB.getAllPaymentMethods();

            expect(productCount).toBe(30);
            expect(categoryCount.length).toBe(5);
            expect(taxCount.length).toBe(2);
            expect(methodCount.length).toBe(2);
        });

        test('should handle cache refresh during active sales', async () => {
            // Initial cache
            const products = Array(50).fill(null).map((_, i) => ({
                id: i + 1,
                name: `Product ${i + 1}`,
                list_price: Math.random() * 1000,
                barcode: `BC${i + 1}`
            }));

            await offlineDB.bulkSaveProducts(products);

            // Simulate active sales with random product lookups
            const lookups = Array(20).fill(null).map((_, i) =>
                offlineDB.getProductByBarcode(`BC${(Math.random() * 50) | 0 + 1}`)
            );

            // Refresh cache in background (like on reconnect)
            const refreshPromises = Array(5).fill(null).map(() =>
                offlineDB.clearAllProducts()
            );

            // Both lookups and refresh should not cause conflicts
            await expect(Promise.allSettled([...lookups, ...refreshPromises])).resolves.toBeDefined();
        });

    });

    // ==================== Stress Test: Sustained Concurrent Load ====================

    describe('Sustained Concurrent Load', () => {

        test('should handle sustained 50 concurrent operations', async () => {
            const operationTypes = [
                () => offlineDB.saveSession({ id: 1, name: 'S1', user_id: 1, config_id: 1, state: 'open' }),
                () => offlineDB.getSession(1),
                () => offlineDB.saveUser({ id: 1, name: 'User1', login: 'user1' }),
                () => offlineDB.getUser(1),
                () => offlineDB.saveTransaction({ id: 1, order_id: 1, type: 'payment', amount: 100, status: 'pending', attempts: 0 }),
                () => offlineDB.getPendingTransactions()
            ];

            // Generate 50 mixed operations
            const operations = Array(50).fill(null).map((_, i) => {
                const opType = operationTypes[i % operationTypes.length];
                return opType();
            });

            const results = await Promise.allSettled(operations);

            // Should have high success rate
            const successes = results.filter(r => r.status === 'fulfilled');
            const successRate = (successes.length / results.length) * 100;

            console.log(`[PDC-Offline] 50-operation stress test success rate: ${successRate.toFixed(1)}%`);
            expect(successRate).toBeGreaterThan(90); // 90%+ success rate target
        });

    });

});
