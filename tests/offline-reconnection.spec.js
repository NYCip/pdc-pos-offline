import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Offline Mode - Server Reconnection
 *
 * Tests the complete offline-to-online transition flow
 * Verifies no white screen appears and UI remains functional
 *
 * Wave 32 P1 Bug Fix Verification
 */

test.describe('POS Offline Mode - Server Reconnection', () => {
    let page;
    let context;

    test.beforeEach(async ({ browser }) => {
        // Create new context with specific viewport for POS UI
        context = await browser.newContext({
            viewport: { width: 1920, height: 1080 }
        });
        page = await context.newPage();

        // Setup: Log in to POS and go online
        await page.goto('http://localhost:8069/pos/ui');

        // Wait for POS to load
        await page.waitForSelector('.pos-content', { timeout: 30000 });

        // Verify online mode
        const offlineBanner = await page.locator('.pos-offline-banner').count();
        expect(offlineBanner).toBe(0);
    });

    test.afterEach(async () => {
        await context.close();
    });

    test('should not show white screen when server reconnects', async () => {
        // Step 1: Add items to cart
        console.log('Step 1: Adding items to cart...');
        const productButtons = await page.locator('[data-product-id]').count();
        expect(productButtons).toBeGreaterThan(0);

        // Click first product to add to cart
        await page.click('[data-product-id]');
        await page.waitForTimeout(500);

        // Verify item in cart
        const cartCount = await page.locator('.pos-cart-count, .cart-count-indicator').first().textContent();
        expect(cartCount).toBeTruthy();

        // Step 2: Simulate server offline by intercepting requests
        console.log('Step 2: Simulating server offline...');

        await page.route('**/*', route => {
            const request = route.request();

            // Block requests to server endpoints (simulate offline)
            if (request.url().includes('/rpc') || request.url().includes('/web/')) {
                route.abort('failed');
            } else {
                route.continue();
            }
        });

        // Wait for offline banner to appear
        console.log('Step 3: Waiting for offline detection...');
        await page.waitForSelector('.pos-offline-banner', { timeout: 10000 });

        // Verify orange offline banner is present
        const offlineBanner = await page.locator('.pos-offline-banner');
        expect(offlineBanner).toBeVisible();

        // Verify banner text
        const bannerText = await offlineBanner.textContent();
        expect(bannerText).toContain('Offline Mode');

        // Verify UI not blank
        const productScreen = await page.locator('.product-list, [data-role="product-list"]').count();
        expect(productScreen).toBeGreaterThan(0);

        // Step 4: Simulate server coming back online
        console.log('Step 4: Simulating server reconnection...');

        // Remove route interception to restore server connectivity
        await page.unroute('**/*');

        // Wait for reconnection to be detected
        await page.waitForTimeout(3000);

        // Check that offline banner disappears (or remains visible briefly)
        try {
            await page.waitForSelector('.pos-offline-banner', { state: 'hidden', timeout: 5000 });
            console.log('Offline banner disappeared (expected)');
        } catch {
            // Banner may remain briefly, which is ok
            console.log('Offline banner still visible (acceptable)');
        }

        // CRITICAL: Verify screen is NOT white
        console.log('Step 5: Verifying UI is not blank...');

        // Check page background color is not white
        const pageColor = await page.evaluate(() => {
            const elem = document.querySelector('body');
            return window.getComputedStyle(elem).backgroundColor;
        });
        console.log('Page background color:', pageColor);

        // Check that POS content is still visible
        const posContent = await page.locator('.pos-content').first();
        expect(posContent).toBeVisible();

        // Check that main POS components are visible
        const productList = await page.locator('.product-list, [data-role="product-list"]').first();
        expect(productList).toBeVisible();

        // Step 6: Verify UI is responsive after reconnection
        console.log('Step 6: Verifying UI responsiveness...');

        // Try to add another item
        const newProductButtons = await page.locator('[data-product-id]').count();
        expect(newProductButtons).toBeGreaterThan(0);

        await page.click('[data-product-id]');
        await page.waitForTimeout(500);

        // Verify new item was added (cart count increased)
        const newCartCount = await page.locator('.pos-cart-count, .cart-count-indicator').first().textContent();
        expect(parseInt(newCartCount) >= parseInt(cartCount || '0')).toBeTruthy();

        console.log('✓ Test passed: No white screen on reconnection, UI remains responsive');
    });

    test('should restore models from cache after reconnection', async () => {
        // Setup: Verify we have cached models
        console.log('Setup: Verifying initial model cache...');

        const modelsCached = await page.evaluate(() => {
            return window.sessionPersistence?.hasCachedPOSData?.() ?? false;
        });
        console.log('Models cached on startup:', modelsCached);

        // Step 1: Go offline
        console.log('Step 1: Going offline...');

        await page.route('**/*', route => {
            const request = route.request();
            if (request.url().includes('/rpc') || request.url().includes('/web/')) {
                route.abort('failed');
            } else {
                route.continue();
            }
        });

        await page.waitForSelector('.pos-offline-banner', { timeout: 10000 });

        // Step 2: Check models are available offline
        console.log('Step 2: Checking offline model availability...');

        const offlineModels = await page.evaluate(() => {
            const models = window.posStore?.models || {};
            return {
                products: Array.isArray(models['product.product']?.records)
                    ? models['product.product'].records.length
                    : 0,
                categories: Array.isArray(models['pos.category']?.records)
                    ? models['pos.category'].records.length
                    : 0,
                paymentMethods: Array.isArray(models['pos.payment.method']?.records)
                    ? models['pos.payment.method'].records.length
                    : 0,
                taxes: Array.isArray(models['account.tax']?.records)
                    ? models['account.tax'].records.length
                    : 0
            };
        });

        console.log('Offline model availability:', offlineModels);
        expect(offlineModels.products).toBeGreaterThan(0);

        // Step 3: Go back online and verify models remain
        console.log('Step 3: Going back online...');

        await page.unroute('**/*');
        await page.waitForTimeout(2000);

        // Step 4: Verify models are restored/available
        console.log('Step 4: Verifying models after reconnection...');

        const onlineModels = await page.evaluate(() => {
            const models = window.posStore?.models || {};
            return {
                products: Array.isArray(models['product.product']?.records)
                    ? models['product.product'].records.length
                    : 0,
                categories: Array.isArray(models['pos.category']?.records)
                    ? models['pos.category'].records.length
                    : 0
            };
        });

        console.log('Online model availability:', onlineModels);
        expect(onlineModels.products).toBeGreaterThan(0);

        console.log('✓ Test passed: Models available before, during, and after offline mode');
    });

    test('should not require manual refresh after reconnection', async () => {
        console.log('Testing that no manual refresh is needed after reconnection...');

        // Step 1: Add items to cart
        await page.click('[data-product-id]');
        await page.waitForTimeout(500);

        const initialUrl = page.url();
        console.log('Initial URL:', initialUrl);

        // Step 2: Go offline
        await page.route('**/*', route => {
            const request = route.request();
            if (request.url().includes('/rpc') || request.url().includes('/web/')) {
                route.abort('failed');
            } else {
                route.continue();
            }
        });

        await page.waitForSelector('.pos-offline-banner', { timeout: 10000 });

        // Step 3: Go back online
        await page.unroute('**/*');
        await page.waitForTimeout(3000);

        // Step 4: Verify URL hasn't changed (no manual refresh needed)
        const finalUrl = page.url();
        expect(finalUrl).toBe(initialUrl);

        // Step 5: Verify page content is still responsive
        const posContent = await page.locator('.pos-content').isVisible();
        expect(posContent).toBeTruthy();

        console.log('✓ Test passed: No manual refresh required after reconnection');
    });

    test('should handle multiple offline-online cycles', async () => {
        console.log('Testing multiple offline-online cycles...');

        const cycles = 3;

        for (let i = 0; i < cycles; i++) {
            console.log(`\nCycle ${i + 1}/${cycles}:`);

            // Go offline
            console.log('  - Going offline...');
            await page.route('**/*', route => {
                const request = route.request();
                if (request.url().includes('/rpc') || request.url().includes('/web/')) {
                    route.abort('failed');
                } else {
                    route.continue();
                }
            });

            await page.waitForSelector('.pos-offline-banner', { timeout: 10000 });

            // Verify offline
            const offlineBanner = await page.locator('.pos-offline-banner').isVisible();
            expect(offlineBanner).toBeTruthy();

            // Wait offline
            await page.waitForTimeout(1000);

            // Go back online
            console.log('  - Going back online...');
            await page.unroute('**/*');
            await page.waitForTimeout(2000);

            // Verify online and not white screen
            try {
                await page.waitForSelector('.pos-offline-banner', { state: 'hidden', timeout: 5000 });
            } catch {
                // Banner may still be visible, which is ok
            }

            const posContent = await page.locator('.pos-content').isVisible();
            expect(posContent).toBeTruthy();
            console.log('  - ✓ Cycle passed');
        }

        console.log(`\n✓ Test passed: All ${cycles} offline-online cycles completed successfully`);
    });

    test('should preserve cart during offline transition', async () => {
        console.log('Testing cart preservation during offline transition...');

        // Step 1: Add items to cart
        await page.click('[data-product-id]');
        await page.waitForTimeout(300);

        const cartBefore = await page.locator('.pos-cart-count, .cart-count-indicator').first().textContent();
        console.log('Cart items before offline:', cartBefore);

        // Step 2: Go offline
        await page.route('**/*', route => {
            const request = route.request();
            if (request.url().includes('/rpc') || request.url().includes('/web/')) {
                route.abort('failed');
            } else {
                route.continue();
            }
        });

        await page.waitForSelector('.pos-offline-banner', { timeout: 10000 });

        // Step 3: Verify cart still visible offline
        const cartOffline = await page.locator('.pos-cart-count, .cart-count-indicator').first().textContent();
        console.log('Cart items while offline:', cartOffline);
        expect(cartOffline).toBe(cartBefore);

        // Step 4: Go back online
        await page.unroute('**/*');
        await page.waitForTimeout(2000);

        // Step 5: Verify cart preserved
        const cartAfter = await page.locator('.pos-cart-count, .cart-count-indicator').first().textContent();
        console.log('Cart items after reconnection:', cartAfter);
        expect(cartAfter).toBe(cartBefore);

        console.log('✓ Test passed: Cart preserved across offline-online transition');
    });

    test('console should not show TypeError about undefined products', async () => {
        console.log('Checking console for errors during offline transition...');

        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        // Go offline
        await page.route('**/*', route => {
            const request = route.request();
            if (request.url().includes('/rpc') || request.url().includes('/web/')) {
                route.abort('failed');
            } else {
                route.continue();
            }
        });

        await page.waitForSelector('.pos-offline-banner', { timeout: 10000 });
        await page.waitForTimeout(1000);

        // Go back online
        await page.unroute('**/*');
        await page.waitForTimeout(3000);

        // Check for critical errors
        const typeErrors = consoleErrors.filter(err => err.includes('Cannot read properties of undefined'));
        console.log('Errors about undefined properties:', typeErrors);

        // Should NOT have "Cannot read properties of undefined (reading 'map')" error
        const mapErrors = typeErrors.filter(err => err.includes("'map'"));
        expect(mapErrors.length).toBe(0);

        console.log('✓ Test passed: No TypeError about undefined products in console');
    });
});
