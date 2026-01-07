/**
 * Test Helpers - Shared utilities for all tests
 * Includes DB helpers, browser helpers, and fixture loaders
 */

// ============================================================
// Database Helpers
// ============================================================

export async function clearOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('PDCPOSOfflineDB');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineDBSize() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PDCPOSOfflineDB', 4);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const stores = [
        'pending_transactions',
        'synced_transactions',
        'pos_products',
        'pos_categories',
        'pos_payment_methods',
        'pos_taxes'
      ];

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
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingTransactionCount(page) {
  return await page.evaluate(() => {
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
}

export async function getSyncedTransactionCount(page) {
  return await page.evaluate(() => {
    return new Promise((resolve) => {
      const request = indexedDB.open('PDCPOSOfflineDB', 4);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction('synced_transactions', 'readonly');
        const store = tx.objectStore('synced_transactions');
        const countRequest = store.count();
        countRequest.onsuccess = () => resolve(countRequest.result);
      };
    });
  });
}

export async function getPendingTransactions(page) {
  return await page.evaluate(() => {
    return new Promise((resolve) => {
      const request = indexedDB.open('PDCPOSOfflineDB', 4);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction('pending_transactions', 'readonly');
        const store = tx.objectStore('pending_transactions');
        const allRequest = store.getAll();

        allRequest.onsuccess = () => {
          resolve(allRequest.result);
        };
      };
    });
  });
}

export async function getSyncedTransactions(page) {
  return await page.evaluate(() => {
    return new Promise((resolve) => {
      const request = indexedDB.open('PDCPOSOfflineDB', 4);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction('synced_transactions', 'readonly');
        const store = tx.objectStore('synced_transactions');
        const allRequest = store.getAll();

        allRequest.onsuccess = () => {
          resolve(allRequest.result);
        };
      };
    });
  });
}

// ============================================================
// Browser/Playwright Helpers
// ============================================================

export async function simulateOffline(page) {
  await page.context().setOffline(true);
  await page.waitForTimeout(1000);
}

export async function simulateOnline(page) {
  await page.context().setOffline(false);
  await page.waitForTimeout(1000);
}

export async function clearAllStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

export async function waitForNetworkIdle(page, timeout = 10000) {
  await page.waitForLoadState('networkidle', { timeout });
}

export async function waitForSyncCompletion(page, timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const syncIndicator = page.locator('[data-testid="sync-progress"]');
    const isVisible = await syncIndicator.isVisible().catch(() => false);

    if (!isVisible) {
      // Wait a bit more to ensure it's done
      await page.waitForTimeout(1000);
      return true;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`Sync did not complete within ${timeout}ms`);
}

export async function loginUser(page, username, password) {
  const usernameField = page.locator('[data-testid="username-input"]');
  const passwordField = page.locator('[data-testid="password-input"]');
  const loginBtn = page.locator('[data-testid="login-button"]');

  await usernameField.fill(username);
  await passwordField.fill(password);
  await loginBtn.click();

  // Wait for dashboard
  const dashboard = page.locator('[data-testid="pos-dashboard"]');
  await dashboard.waitFor({ state: 'visible', timeout: 10000 });
}

export async function ringItem(page, productName) {
  const searchField = page.locator('[data-testid="product-search"]');
  await searchField.fill(productName);

  // Wait for product to appear
  const productResult = page.locator('[data-testid="product-result"]').first();
  await productResult.waitFor({ state: 'visible', timeout: 5000 });

  // Click product
  await productResult.click();

  // Verify item added to cart
  const cartItem = page.locator('[data-testid="cart-item"]').first();
  await cartItem.waitFor({ state: 'visible', timeout: 3000 });
}

export async function completeTransaction(page, paymentMethod = 'cash') {
  // Select payment method
  const paymentBtn = page.locator(`[data-testid="payment-method-${paymentMethod}"]`);
  await paymentBtn.click();

  // Complete transaction
  const completeBtn = page.locator('[data-testid="complete-transaction"]');
  await completeBtn.click();

  // Wait for receipt
  const receipt = page.locator('[data-testid="receipt"]');
  await receipt.waitFor({ state: 'visible', timeout: 5000 });

  return receipt;
}

export async function clearCart(page) {
  const clearBtn = page.locator('[data-testid="clear-cart-btn"]');
  const isVisible = await clearBtn.isVisible().catch(() => false);

  if (isVisible) {
    await clearBtn.click();
    await page.waitForTimeout(500);
  }
}

// ============================================================
// Session/Auth Helpers
// ============================================================

export async function createOfflineSession(page, userId = 1001) {
  await page.evaluate(({ userId }) => {
    sessionStorage.setItem('pos_session', 'offline_session_' + userId);
    localStorage.setItem('user_id', userId.toString());
  }, { userId });
}

export async function getSessionToken(page) {
  return await page.evaluate(() => sessionStorage.getItem('pos_session'));
}

export async function clearSession(page) {
  await page.evaluate(() => {
    sessionStorage.removeItem('pos_session');
    localStorage.removeItem('user_id');
  });
}

// ============================================================
// Fixture/Data Helpers
// ============================================================

export const TEST_USERS = {
  user1: {
    username: 'test_user_1',
    password: 'test_pass_123',
    userId: 1001,
    company: 'test_company_1',
    terminal: 'POS001'
  },
  user2: {
    username: 'test_user_2',
    password: 'test_pass_456',
    userId: 1002,
    company: 'test_company_2',
    terminal: 'POS002'
  }
};

export const TEST_PRODUCTS = [
  { id: 101, name: 'Apple', price: 5.00, category_id: 1, tax_id: 1 },
  { id: 102, name: 'Banana', price: 3.50, category_id: 1, tax_id: 1 },
  { id: 103, name: 'Orange', price: 4.00, category_id: 1, tax_id: 1 },
  { id: 104, name: 'Water', price: 2.00, category_id: 2, tax_id: 1 },
  { id: 105, name: 'Coffee', price: 4.50, category_id: 2, tax_id: 2 },
];

export const TEST_CATEGORIES = [
  { id: 1, name: 'Fruits', parent_id: null },
  { id: 2, name: 'Beverages', parent_id: null },
];

export const TEST_PAYMENT_METHODS = [
  { id: 1, name: 'Cash', code: 'cash' },
  { id: 2, name: 'Card', code: 'card' },
  { id: 3, name: 'Check', code: 'check' },
];

export const TEST_TAXES = [
  { id: 1, name: 'Standard', rate: 0.07 },
  { id: 2, name: 'Reduced', rate: 0.04 },
];

// ============================================================
// Assertion Helpers
// ============================================================

export async function assertNoDuplicates(transactions) {
  const ids = transactions.map(t => t.id);
  const uniqueIds = new Set(ids);
  return uniqueIds.size === ids.length;
}

export async function assertAllSynced(transactions) {
  return transactions.every(t => t.synced_at && new Date(t.synced_at));
}

export async function assertOrderPreserved(transactions) {
  const times = transactions.map(t => new Date(t.created_at).getTime());
  for (let i = 1; i < times.length; i++) {
    if (times[i] < times[i - 1]) {
      return false;
    }
  }
  return true;
}

export async function assertValidTransaction(tx) {
  return (
    tx.id &&
    tx.created_at &&
    tx.items &&
    tx.items.length > 0 &&
    tx.total > 0 &&
    tx.payment_method
  );
}

// ============================================================
// Performance Helpers
// ============================================================

export class PerformanceTracker {
  constructor() {
    this.marks = {};
    this.measures = {};
  }

  mark(name) {
    this.marks[name] = performance.now();
  }

  measure(name, startMark, endMark) {
    if (!this.marks[startMark] || !this.marks[endMark]) {
      throw new Error(`Marks not found: ${startMark}, ${endMark}`);
    }

    const duration = this.marks[endMark] - this.marks[startMark];
    this.measures[name] = duration;
    return duration;
  }

  getDuration(name) {
    return this.measures[name];
  }

  getAllMeasures() {
    return this.measures;
  }

  reset() {
    this.marks = {};
    this.measures = {};
  }
}

// ============================================================
// Error/Exception Helpers
// ============================================================

export async function expectError(asyncFn, errorPattern) {
  try {
    await asyncFn();
    throw new Error('Expected function to throw error');
  } catch (error) {
    if (errorPattern && !errorPattern.test(error.message)) {
      throw new Error(
        `Error message did not match pattern. Expected: ${errorPattern}, Got: ${error.message}`
      );
    }
  }
}

export async function expectNoError(asyncFn) {
  try {
    await asyncFn();
  } catch (error) {
    throw new Error(`Unexpected error: ${error.message}`);
  }
}

// ============================================================
// Test Report Helpers
// ============================================================

export class TestReport {
  constructor() {
    this.testResults = [];
    this.startTime = Date.now();
  }

  addResult(testName, passed, duration, error = null) {
    this.testResults.push({
      name: testName,
      passed,
      duration,
      error,
      timestamp: new Date().toISOString()
    });
  }

  getSummary() {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = total - passed;
    const totalDuration = Date.now() - this.startTime;

    return {
      total,
      passed,
      failed,
      passRate: ((passed / total) * 100).toFixed(2) + '%',
      totalDuration: totalDuration / 1000 + 's',
      results: this.testResults
    };
  }

  print() {
    const summary = this.getSummary();
    console.log('\n=== TEST REPORT ===');
    console.log(`Total: ${summary.total}`);
    console.log(`Passed: ${summary.passed}`);
    console.log(`Failed: ${summary.failed}`);
    console.log(`Pass Rate: ${summary.passRate}`);
    console.log(`Total Duration: ${summary.totalDuration}`);

    if (summary.failed > 0) {
      console.log('\nFailed Tests:');
      summary.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.error}`);
        });
    }
  }
}

// Export all
export default {
  clearOfflineDB,
  getOfflineDBSize,
  getPendingTransactionCount,
  getSyncedTransactionCount,
  getPendingTransactions,
  getSyncedTransactions,
  simulateOffline,
  simulateOnline,
  clearAllStorage,
  waitForNetworkIdle,
  waitForSyncCompletion,
  loginUser,
  ringItem,
  completeTransaction,
  clearCart,
  createOfflineSession,
  getSessionToken,
  clearSession,
  TEST_USERS,
  TEST_PRODUCTS,
  TEST_CATEGORIES,
  TEST_PAYMENT_METHODS,
  TEST_TAXES,
  assertNoDuplicates,
  assertAllSynced,
  assertOrderPreserved,
  assertValidTransaction,
  PerformanceTracker,
  TestReport
};
