/**
 * SCENARIO 1: Login → Offline → Resume
 *
 * Tests the complete user session flow:
 * 1. User logs in online
 * 2. Models cached
 * 3. Network goes offline
 * 4. User rings items and completes transactions
 * 5. Network restored
 * 6. Transactions sync without duplicates
 *
 * Total Tests: 10 (TC-1.1 to TC-1.10)
 * Duration: ~5 minutes
 * Priority: P0 (Critical)
 */

import { test, expect, Page } from '@playwright/test';

test.describe('SCENARIO 1: Login → Offline → Resume', () => {
  let page;
  let testUser;

  test.beforeAll(async ({ browser }) => {
    // Load test fixtures
    testUser = {
      username: 'test_user_1',
      password: 'test_pass_123',
      userId: 1001,
      models: {
        products: 25,
        categories: 5,
        paymentMethods: 3,
        taxes: 2,
      }
    };
  });

  test.beforeEach(async ({ browser }) => {
    // Create fresh page context
    const context = await browser.newContext();
    page = await context.newPage();

    // Clear all storage
    await context.clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Navigate to app
    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'networkidle' });
  });

  test.afterEach(async () => {
    await page.close();
  });

  // ============================================================
  // TC-1.1: User Login (Online)
  // ============================================================
  test('TC-1.1: User can login successfully (online)', async () => {
    // Wait for login form
    await page.waitForSelector('[data-testid="login-form"]');
    expect(await page.locator('[data-testid="login-form"]').isVisible()).toBe(true);

    // Enter credentials
    await page.fill('[data-testid="username-input"]', testUser.username);
    await page.fill('[data-testid="password-input"]', testUser.password);

    // Submit form
    await page.click('[data-testid="login-button"]');

    // Wait for dashboard
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 10000 });
    expect(await page.locator('[data-testid="pos-dashboard"]').isVisible()).toBe(true);

    // Verify session stored
    const sessionToken = await page.evaluate(() => sessionStorage.getItem('pos_session'));
    expect(sessionToken).toBeTruthy();

    // Verify user ID stored
    const userId = await page.evaluate(() => localStorage.getItem('user_id'));
    expect(userId).toEqual(testUser.userId.toString());

    // Verify no errors
    const errors = await page.locator('[data-testid="error-message"]').count();
    expect(errors).toBe(0);
  });

  // ============================================================
  // TC-1.2: Models Fully Cached
  // ============================================================
  test('TC-1.2: Models fully cached after login', async () => {
    // Login first
    await page.fill('[data-testid="username-input"]', testUser.username);
    await page.fill('[data-testid="password-input"]', testUser.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="pos-dashboard"]');

    // Wait for models to cache
    await page.waitForTimeout(3000);

    // Verify IndexedDB has models
    const modelStats = await page.evaluate(() => {
      return new Promise(async (resolve) => {
        const request = indexedDB.open('PDCPOSOfflineDB', 4);

        request.onsuccess = (event) => {
          const db = event.target.result;
          const stores = ['pos_products', 'pos_categories', 'pos_payment_methods', 'pos_taxes'];
          const stats = {};

          let completed = 0;
          for (const storeName of stores) {
            try {
              const tx = db.transaction(storeName, 'readonly');
              const store = tx.objectStore(storeName);
              const countRequest = store.count();

              countRequest.onsuccess = () => {
                stats[storeName] = countRequest.result;
                completed++;
                if (completed === stores.length) {
                  resolve(stats);
                }
              };
            } catch (e) {
              stats[storeName] = 0;
              completed++;
              if (completed === stores.length) {
                resolve(stats);
              }
            }
          }
        };
      });
    });

    // Verify models cached
    expect(modelStats.pos_products).toBeGreaterThan(0);
    expect(modelStats.pos_categories).toBeGreaterThan(0);
    expect(modelStats.pos_payment_methods).toBeGreaterThan(0);
  });

  // ============================================================
  // TC-1.3: Network Goes Offline
  // ============================================================
  test('TC-1.3: Network goes offline (detection)', async () => {
    // Login first
    await page.fill('[data-testid="username-input"]', testUser.username);
    await page.fill('[data-testid="password-input"]', testUser.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="pos-dashboard"]');

    // Go offline
    await page.context().setOffline(true);

    // Wait for detection
    await page.waitForTimeout(2000);

    // Verify offline state
    const isOffline = await page.evaluate(() => {
      const monitor = window.__connectionMonitor;
      return monitor ? monitor.isOffline() : navigator.onLine === false;
    });

    expect(isOffline).toBe(true);

    // Verify server unreachable
    const connectionStatus = await page.locator('[data-testid="connection-status"]').textContent();
    expect(connectionStatus).toContain('Offline');
  });

  // ============================================================
  // TC-1.4: UI Switches to Offline Mode
  // ============================================================
  test('TC-1.4: UI switches to offline mode', async () => {
    // Login and go offline
    await page.fill('[data-testid="username-input"]', testUser.username);
    await page.fill('[data-testid="password-input"]', testUser.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="pos-dashboard"]');

    await page.context().setOffline(true);
    await page.waitForTimeout(2000);

    // Verify offline banner appears
    const offlineBanner = page.locator('[data-testid="offline-banner"]');
    await expect(offlineBanner).toBeVisible({ timeout: 5000 });

    // Verify ring item button still enabled
    const ringButton = page.locator('[data-testid="ring-item-btn"]');
    expect(await ringButton.isEnabled()).toBe(true);

    // Verify sync button disabled
    const syncButton = page.locator('[data-testid="sync-btn"]');
    expect(await syncButton.isEnabled()).toBe(false);

    // Verify offline badge visible
    const badge = page.locator('[data-testid="offline-badge"]');
    await expect(badge).toBeVisible();
  });

  // ============================================================
  // TC-1.5: Ring Items (Offline)
  // ============================================================
  test('TC-1.5: Can ring items while offline', async () => {
    // Login and go offline
    await page.fill('[data-testid="username-input"]', testUser.username);
    await page.fill('[data-testid="password-input"]', testUser.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="pos-dashboard"]');

    await page.context().setOffline(true);
    await page.waitForTimeout(2000);

    // Search for product
    await page.fill('[data-testid="product-search"]', 'Apple');
    await page.waitForSelector('[data-testid="product-result"]');

    // Click product
    const productItem = page.locator('[data-testid="product-result"]:first-child');
    await productItem.click();

    // Verify item in cart
    const cartItem = page.locator('[data-testid="cart-item"]').first();
    await expect(cartItem).toBeVisible();

    // Verify quantity can be changed
    const quantityInput = cartItem.locator('[data-testid="quantity-input"]');
    await quantityInput.fill('2');

    // Verify total updated
    const total = page.locator('[data-testid="cart-total"]');
    const totalText = await total.textContent();
    expect(totalText).toMatch(/^\$[\d.]+$/);
  });

  // ============================================================
  // TC-1.6: Complete Transaction (Offline)
  // ============================================================
  test('TC-1.6: Can complete transaction while offline', async () => {
    // Login and go offline
    await page.fill('[data-testid="username-input"]', testUser.username);
    await page.fill('[data-testid="password-input"]', testUser.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="pos-dashboard"]');

    await page.context().setOffline(true);
    await page.waitForTimeout(2000);

    // Ring item
    await page.fill('[data-testid="product-search"]', 'Apple');
    await page.waitForSelector('[data-testid="product-result"]');
    await page.locator('[data-testid="product-result"]:first-child').click();

    // Select payment method
    await page.click('[data-testid="payment-method-cash"]');

    // Complete transaction
    await page.click('[data-testid="complete-transaction"]');

    // Verify receipt displayed
    const receipt = page.locator('[data-testid="receipt"]');
    await expect(receipt).toBeVisible({ timeout: 5000 });

    // Verify transaction ID generated
    const txId = receipt.locator('[data-testid="transaction-id"]');
    const txIdText = await txId.textContent();
    expect(txIdText).toMatch(/^OFFLINE-\d+$/);

    // Verify transaction in IndexedDB
    const pending = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('PDCPOSOfflineDB', 4);
        request.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction('pending_transactions', 'readonly');
          const store = tx.objectStore('pending_transactions');
          const countRequest = store.count();
          countRequest.onsuccess = () => resolve(countRequest.result);
        };
      });
    });

    expect(pending).toBe(1);
  });

  // ============================================================
  // TC-1.7: Multiple Transactions Queued
  // ============================================================
  test('TC-1.7: Multiple transactions queued correctly', async () => {
    // Login and go offline
    await page.fill('[data-testid="username-input"]', testUser.username);
    await page.fill('[data-testid="password-input"]', testUser.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="pos-dashboard"]');

    await page.context().setOffline(true);
    await page.waitForTimeout(2000);

    // Complete 5 transactions
    for (let i = 0; i < 5; i++) {
      // Clear cart
      await page.click('[data-testid="clear-cart-btn"]');
      await page.waitForTimeout(500);

      // Ring item
      await page.fill('[data-testid="product-search"]', 'Product' + i);
      await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
      await page.locator('[data-testid="product-result"]:first-child').click();

      // Complete
      await page.click('[data-testid="payment-method-cash"]');
      await page.click('[data-testid="complete-transaction"]');
      await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });
    }

    // Verify 6 pending (1 from TC-1.6 + 5 new)
    const pending = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('PDCPOSOfflineDB', 4);
        request.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction('pending_transactions', 'readonly');
          const store = tx.objectStore('pending_transactions');
          const countRequest = store.count();
          countRequest.onsuccess = () => resolve(countRequest.result);
        };
      });
    });

    expect(pending).toBe(6);
  });

  // ============================================================
  // TC-1.8: Network Restored
  // ============================================================
  test('TC-1.8: Network connectivity restored', async () => {
    // Setup
    await page.fill('[data-testid="username-input"]', testUser.username);
    await page.fill('[data-testid="password-input"]', testUser.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="pos-dashboard"]');

    await page.context().setOffline(true);
    await page.waitForTimeout(2000);

    // Restore network
    await page.context().setOffline(false);
    await page.waitForTimeout(2000);

    // Verify online state
    const isOnline = await page.evaluate(() => navigator.onLine);
    expect(isOnline).toBe(true);

    // Verify offline banner disappears
    const offlineBanner = page.locator('[data-testid="offline-banner"]');
    await expect(offlineBanner).not.toBeVisible({ timeout: 5000 });
  });

  // ============================================================
  // TC-1.9: Sync Starts Automatically
  // ============================================================
  test('TC-1.9: Sync starts automatically after network restore', async () => {
    // Setup with pending transactions
    await page.fill('[data-testid="username-input"]', testUser.username);
    await page.fill('[data-testid="password-input"]', testUser.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="pos-dashboard"]');

    // Go offline and create transaction
    await page.context().setOffline(true);
    await page.waitForTimeout(2000);

    await page.fill('[data-testid="product-search"]', 'TestItem');
    await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
    await page.locator('[data-testid="product-result"]:first-child').click();
    await page.click('[data-testid="payment-method-cash"]');
    await page.click('[data-testid="complete-transaction"]');
    await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

    // Restore network
    await page.context().setOffline(false);
    await page.waitForTimeout(3000);

    // Verify sync indicator appears
    const syncIndicator = page.locator('[data-testid="sync-progress"]');
    await expect(syncIndicator).toBeVisible({ timeout: 10000 });

    // Wait for sync to complete
    await page.waitForLoadState('networkidle');
  });

  // ============================================================
  // TC-1.10: All Transactions Synced (No Duplicates)
  // ============================================================
  test('TC-1.10: All transactions synced without duplicates', async () => {
    // Setup
    const syncStartTime = Date.now();

    await page.fill('[data-testid="username-input"]', testUser.username);
    await page.fill('[data-testid="password-input"]', testUser.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForSelector('[data-testid="pos-dashboard"]');

    // Go offline and create 2 transactions
    await page.context().setOffline(true);
    await page.waitForTimeout(2000);

    const txCount = 2;
    for (let i = 0; i < txCount; i++) {
      await page.fill('[data-testid="product-search"]', 'Item' + i);
      await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
      await page.locator('[data-testid="product-result"]:first-child').click();
      await page.click('[data-testid="payment-method-cash"]');
      await page.click('[data-testid="complete-transaction"]');
      await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

      // Clear for next iteration
      if (i < txCount - 1) {
        await page.click('[data-testid="clear-cart-btn"]');
        await page.waitForTimeout(500);
      }
    }

    // Restore network and wait for sync
    await page.context().setOffline(false);
    await page.waitForTimeout(3000);

    // Wait for sync indicator to appear and complete
    const syncIndicator = page.locator('[data-testid="sync-progress"]');
    try {
      await expect(syncIndicator).toBeVisible({ timeout: 5000 });
      await expect(syncIndicator).not.toBeVisible({ timeout: 30000 });
    } catch (e) {
      // Sync may complete before we see indicator
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify pending count = 0
    const pending = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('PDCPOSOfflineDB', 4);
        request.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction('pending_transactions', 'readonly');
          const store = tx.objectStore('pending_transactions');
          const countRequest = store.count();
          countRequest.onsuccess = () => resolve(countRequest.result);
        };
      });
    });

    expect(pending).toBe(0);

    // Verify all transactions on server (via API call)
    const response = await page.context().request.get(
      'http://localhost:8000/api/transactions',
      {
        headers: {
          'Authorization': 'Bearer ' + (await page.evaluate(() => sessionStorage.getItem('pos_session')))
        }
      }
    );

    expect(response.ok()).toBe(true);
    const transactions = await response.json();

    // Find transactions created during this test
    const testTxs = transactions.filter(t => {
      const txTime = new Date(t.created_at).getTime();
      return txTime >= syncStartTime;
    });

    // Verify count
    expect(testTxs.length).toBe(txCount);

    // Verify no duplicates (all unique IDs)
    const ids = testTxs.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(txCount);

    // Verify all have synced timestamp
    expect(testTxs.every(t => t.synced_at)).toBe(true);
  });
});
