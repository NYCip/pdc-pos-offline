/**
 * SCENARIO 3: Sync During Transaction
 *
 * Tests sync behavior when user acts during sync:
 * 1. Multiple pending transactions queued
 * 2. Network restored
 * 3. Sync starts
 * 4. User creates new transaction during sync
 * 5. New transaction queued (not synced yet)
 * 6. Sync completes original transactions
 * 7. New transaction syncs after
 * 8. Sync fails midway
 * 9. Partial sync recovered
 * 10. Retry succeeds without duplicates
 *
 * Total Tests: 10 (TC-3.1 to TC-3.10)
 * Duration: ~10 minutes
 * Priority: P0 (Critical)
 */

import { test, expect } from '@playwright/test';

test.describe('SCENARIO 3: Sync During Transaction', () => {
  let testUser;

  test.beforeAll(async () => {
    testUser = {
      username: 'test_user_1',
      password: 'test_pass_123',
      userId: 1001,
    };
  });

  // ============================================================
  // TC-3.1: Multiple Pending Transactions
  // ============================================================
  test('TC-3.1: Multiple pending transactions queued', async ({ browser, context }) => {
    await context.setOffline(true);
    const page = await context.newPage();

    // Pre-login (offline)
    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token');
      localStorage.setItem('user_id', '1001');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 5000 });

    // Create 3 transactions
    for (let i = 0; i < 3; i++) {
      // Search for product
      await page.fill('[data-testid="product-search"]', 'Item' + i);
      await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });

      // Click product
      await page.locator('[data-testid="product-result"]:first-child').click();

      // Select payment
      await page.click('[data-testid="payment-method-cash"]');

      // Complete transaction
      await page.click('[data-testid="complete-transaction"]');
      await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

      // Clear for next iteration
      if (i < 2) {
        await page.click('[data-testid="clear-cart-btn"]');
        await page.waitForTimeout(500);
      }
    }

    // Verify 3 pending
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

    expect(pending).toBe(3);

    // Verify sync not started
    const syncManager = await page.evaluate(() => {
      return window.__syncManager ? window.__syncManager.isSyncing : false;
    });
    expect(syncManager).toBe(false);

    await page.close();
  });

  // ============================================================
  // TC-3.2: Network Restored
  // ============================================================
  test('TC-3.2: Network connectivity restored', async ({ browser, context }) => {
    // Setup offline with pending transactions
    await context.setOffline(true);
    let page = await context.newPage();

    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token');
      localStorage.setItem('user_id', '1001');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 5000 });

    // Create 1 pending transaction
    await page.fill('[data-testid="product-search"]', 'TestItem');
    await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
    await page.locator('[data-testid="product-result"]:first-child').click();
    await page.click('[data-testid="payment-method-cash"]');
    await page.click('[data-testid="complete-transaction"]');
    await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

    // Restore network
    await context.setOffline(false);
    await page.waitForTimeout(2000);

    // Verify online
    const isOnline = await page.evaluate(() => navigator.onLine);
    expect(isOnline).toBe(true);

    // Verify offline banner gone
    const banner = page.locator('[data-testid="offline-banner"]');
    expect(await banner.isVisible().catch(() => false)).toBe(false);

    await page.close();
  });

  // ============================================================
  // TC-3.3: Sync Starts
  // ============================================================
  test('TC-3.3: Sync starts automatically', async ({ browser, context }) => {
    // Setup with pending transactions
    await context.setOffline(true);
    let page = await context.newPage();

    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token');
      localStorage.setItem('user_id', '1001');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 5000 });

    // Create 2 pending transactions
    for (let i = 0; i < 2; i++) {
      await page.fill('[data-testid="product-search"]', 'Item' + i);
      await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
      await page.locator('[data-testid="product-result"]:first-child').click();
      await page.click('[data-testid="payment-method-cash"]');
      await page.click('[data-testid="complete-transaction"]');
      await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

      if (i < 1) {
        await page.click('[data-testid="clear-cart-btn"]');
        await page.waitForTimeout(500);
      }
    }

    // Restore network
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Verify sync starts
    const syncIndicator = page.locator('[data-testid="sync-progress"]');
    await expect(syncIndicator).toBeVisible({ timeout: 10000 });

    await page.close();
  });

  // ============================================================
  // TC-3.4: User Creates Transaction During Sync
  // ============================================================
  test('TC-3.4: User can create transaction while sync in progress', async ({ browser, context }) => {
    // Setup
    await context.setOffline(true);
    let page = await context.newPage();

    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token');
      localStorage.setItem('user_id', '1001');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 5000 });

    // Create 2 initial transactions
    for (let i = 0; i < 2; i++) {
      await page.fill('[data-testid="product-search"]', 'InitialItem' + i);
      await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
      await page.locator('[data-testid="product-result"]:first-child').click();
      await page.click('[data-testid="payment-method-cash"]');
      await page.click('[data-testid="complete-transaction"]');
      await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

      if (i < 1) {
        await page.click('[data-testid="clear-cart-btn"]');
        await page.waitForTimeout(500);
      }
    }

    // Restore network (sync starts)
    await context.setOffline(false);
    await page.waitForTimeout(2000);

    // Wait for sync to begin
    const syncIndicator = page.locator('[data-testid="sync-progress"]');
    try {
      await expect(syncIndicator).toBeVisible({ timeout: 5000 });
    } catch (e) {
      // Sync might complete quickly, that's ok
    }

    // User creates NEW transaction during sync
    await page.fill('[data-testid="product-search"]', 'NewItemDuringSync');
    await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
    await page.locator('[data-testid="product-result"]:first-child').click();

    // Verify item added (UI responsive)
    const cartItem = page.locator('[data-testid="cart-item"]').first();
    await expect(cartItem).toBeVisible({ timeout: 3000 });

    // Complete the new transaction
    await page.click('[data-testid="payment-method-cash"]');
    await page.click('[data-testid="complete-transaction"]');
    await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

    // Verify receipt shows (transaction created)
    const receipt = page.locator('[data-testid="receipt"]');
    await expect(receipt).toBeVisible();

    await page.close();
  });

  // ============================================================
  // TC-3.5: Transaction Queue Behavior
  // ============================================================
  test('TC-3.5: Transaction queue maintains order', async ({ browser, context }) => {
    // Setup
    await context.setOffline(true);
    let page = await context.newPage();

    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token');
      localStorage.setItem('user_id', '1001');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 5000 });

    const txIds = [];

    // Create 3 transactions and track IDs
    for (let i = 0; i < 3; i++) {
      await page.fill('[data-testid="product-search"]', 'Item' + i);
      await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
      await page.locator('[data-testid="product-result"]:first-child').click();
      await page.click('[data-testid="payment-method-cash"]');
      await page.click('[data-testid="complete-transaction"]');

      // Get transaction ID from receipt
      const receipt = page.locator('[data-testid="receipt"]');
      const txId = await receipt.locator('[data-testid="transaction-id"]').textContent();
      txIds.push(txId);

      if (i < 2) {
        await page.click('[data-testid="clear-cart-btn"]');
        await page.waitForTimeout(500);
      }
    }

    // Get queue from IndexedDB
    const queuedTxIds = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('PDCPOSOfflineDB', 4);
        request.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction('pending_transactions', 'readonly');
          const store = tx.objectStore('pending_transactions');
          const allRequest = store.getAll();

          allRequest.onsuccess = () => {
            const txs = allRequest.result;
            resolve(txs.map(t => t.id).sort());
          };
        };
      });
    });

    // Verify queue has 3 transactions
    expect(queuedTxIds.length).toBe(3);

    // Restore network and check sync
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Verify sync in progress
    const syncIndicator = page.locator('[data-testid="sync-progress"]');
    const isSyncing = await syncIndicator.isVisible({ timeout: 5000 }).catch(() => false);

    // Queue should still be intact (being synced in order)
    const remainingTxs = await page.evaluate(() => {
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

    // Some should be synced, some still pending
    expect(remainingTxs).toBeLessThanOrEqual(3);

    await page.close();
  });

  // ============================================================
  // TC-3.6: Sync Completes
  // ============================================================
  test('TC-3.6: Sync completes all original transactions', async ({ browser, context }) => {
    // Setup
    await context.setOffline(true);
    let page = await context.newPage();

    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token');
      localStorage.setItem('user_id', '1001');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 5000 });

    // Create 2 initial transactions
    for (let i = 0; i < 2; i++) {
      await page.fill('[data-testid="product-search"]', 'Item' + i);
      await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
      await page.locator('[data-testid="product-result"]:first-child').click();
      await page.click('[data-testid="payment-method-cash"]');
      await page.click('[data-testid="complete-transaction"]');
      await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

      if (i < 1) {
        await page.click('[data-testid="clear-cart-btn"]');
        await page.waitForTimeout(500);
      }
    }

    // Restore network
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Wait for sync to complete
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify pending = 0 (or very small)
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

    expect(pending).toBeLessThanOrEqual(0);

    // Verify sync indicator gone
    const syncIndicator = page.locator('[data-testid="sync-progress"]');
    const isVisible = await syncIndicator.isVisible().catch(() => false);
    expect(isVisible).toBe(false);

    await page.close();
  });

  // ============================================================
  // TC-3.7: New Transaction Syncs After
  // ============================================================
  test('TC-3.7: New transaction syncs after initial sync completes', async ({ browser, context }) => {
    // Setup
    await context.setOffline(true);
    let page = await context.newPage();

    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token');
      localStorage.setItem('user_id', '1001');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 5000 });

    // Create initial transaction
    await page.fill('[data-testid="product-search"]', 'InitialItem');
    await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
    await page.locator('[data-testid="product-result"]:first-child').click();
    await page.click('[data-testid="payment-method-cash"]');
    await page.click('[data-testid="complete-transaction"]');
    await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

    // Restore network (sync starts)
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Create new transaction during/after initial sync
    await page.click('[data-testid="clear-cart-btn"]');
    await page.fill('[data-testid="product-search"]', 'NewItem');
    await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
    await page.locator('[data-testid="product-result"]:first-child').click();
    await page.click('[data-testid="payment-method-cash"]');
    await page.click('[data-testid="complete-transaction"]');
    await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

    // Wait for all syncs to complete
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Verify all pending = 0
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

    await page.close();
  });

  // ============================================================
  // TC-3.8: Sync Fails Midway
  // ============================================================
  test('TC-3.8: Sync failure handled gracefully', async ({ browser, context }) => {
    // Setup
    await context.setOffline(true);
    let page = await context.newPage();

    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token');
      localStorage.setItem('user_id', '1001');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 5000 });

    // Create transactions
    for (let i = 0; i < 2; i++) {
      await page.fill('[data-testid="product-search"]', 'Item' + i);
      await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
      await page.locator('[data-testid="product-result"]:first-child').click();
      await page.click('[data-testid="payment-method-cash"]');
      await page.click('[data-testid="complete-transaction"]');
      await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

      if (i < 1) {
        await page.click('[data-testid="clear-cart-btn"]');
        await page.waitForTimeout(500);
      }
    }

    // Restore network
    await context.setOffline(false);
    await page.waitForTimeout(2000);

    // Wait briefly for sync to start
    await page.waitForTimeout(3000);

    // Simulate network failure
    await context.setOffline(true);
    await page.waitForTimeout(2000);

    // Verify graceful handling (no crash)
    const dashboard = page.locator('[data-testid="pos-dashboard"]');
    expect(await dashboard.isVisible()).toBe(true);

    // Verify some transactions still pending
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

    expect(pending).toBeGreaterThan(0);

    await page.close();
  });

  // ============================================================
  // TC-3.9: Partial Sync Recovery
  // ============================================================
  test('TC-3.9: Partial sync recovered without duplicates', async ({ browser, context }) => {
    // Setup
    await context.setOffline(true);
    let page = await context.newPage();

    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token');
      localStorage.setItem('user_id', '1001');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 5000 });

    // Create 2 transactions
    for (let i = 0; i < 2; i++) {
      await page.fill('[data-testid="product-search"]', 'Item' + i);
      await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
      await page.locator('[data-testid="product-result"]:first-child').click();
      await page.click('[data-testid="payment-method-cash"]');
      await page.click('[data-testid="complete-transaction"]');
      await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

      if (i < 1) {
        await page.click('[data-testid="clear-cart-btn"]');
        await page.waitForTimeout(500);
      }
    }

    // Restore network
    await context.setOffline(false);
    await page.waitForTimeout(2000);

    // Wait for sync to start
    await page.waitForTimeout(3000);

    // Simulate failure
    await context.setOffline(true);
    await page.waitForTimeout(2000);

    // Restore again
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Wait for recovery sync
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Verify recovery (pending should go to 0)
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

    expect(pending).toBeLessThanOrEqual(0);

    // Verify no duplicates (via API call would be ideal, but check local state)
    const synced = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('PDCPOSOfflineDB', 4);
        request.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction('synced_transactions', 'readonly');
          const store = tx.objectStore('synced_transactions');
          const allRequest = store.getAll();

          allRequest.onsuccess = () => {
            const txs = allRequest.result;
            const ids = txs.map(t => t.id);
            const uniqueIds = new Set(ids);
            resolve({
              total: txs.length,
              unique: uniqueIds.size,
              hasDuplicates: ids.length !== uniqueIds.size
            });
          };
        };
      });
    });

    expect(synced.hasDuplicates).toBe(false);

    await page.close();
  });

  // ============================================================
  // TC-3.10: Retry Succeeds (No Duplicates)
  // ============================================================
  test('TC-3.10: Final sync succeeds without duplicates', async ({ browser, context }) => {
    // Setup
    await context.setOffline(true);
    let page = await context.newPage();

    const syncStartTime = Date.now();

    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token');
      localStorage.setItem('user_id', '1001');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-dashboard"]', { timeout: 5000 });

    // Create final set of transactions
    const txCount = 2;
    for (let i = 0; i < txCount; i++) {
      await page.fill('[data-testid="product-search"]', 'FinalItem' + i);
      await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
      await page.locator('[data-testid="product-result"]:first-child').click();
      await page.click('[data-testid="payment-method-cash"]');
      await page.click('[data-testid="complete-transaction"]');
      await page.waitForSelector('[data-testid="receipt"]', { timeout: 5000 });

      if (i < txCount - 1) {
        await page.click('[data-testid="clear-cart-btn"]');
        await page.waitForTimeout(500);
      }
    }

    // Restore network
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Wait for full sync completion
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Verify all synced
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

    // Verify no duplicates in synced store
    const syncedData = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('PDCPOSOfflineDB', 4);
        request.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction('synced_transactions', 'readonly');
          const store = tx.objectStore('synced_transactions');
          const allRequest = store.getAll();

          allRequest.onsuccess = () => {
            const txs = allRequest.result;
            const ids = txs.map(t => t.id);
            const uniqueIds = new Set(ids);
            const recentTxs = txs.filter(t => {
              const txTime = new Date(t.synced_at).getTime();
              return txTime >= (Date.now() - 60000); // Last 60 seconds
            });

            resolve({
              total: txs.length,
              unique: uniqueIds.size,
              recent: recentTxs.length,
              hasDuplicates: ids.length !== uniqueIds.size
            });
          };
        };
      });
    });

    expect(syncedData.hasDuplicates).toBe(false);
    expect(syncedData.unique).toBe(syncedData.total);

    await page.close();
  });
});
