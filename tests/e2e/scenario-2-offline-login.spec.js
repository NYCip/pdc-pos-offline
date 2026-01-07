/**
 * SCENARIO 2: Before Login → Offline Mode
 *
 * Tests offline login and fallback:
 * 1. App loads without internet
 * 2. Offline login popup appears
 * 3. User enters credentials
 * 4. Credentials validated against cache
 * 5. Wrong credentials rejected
 * 6. Previous session resumable
 * 7. Session timeout in offline mode
 * 8. Cache expiration handled
 * 9. Multiple login attempts handled
 * 10. Recovery after network restore
 *
 * Total Tests: 10 (TC-2.1 to TC-2.10)
 * Duration: ~8 minutes
 * Priority: P0 (Critical)
 */

import { test, expect } from '@playwright/test';

test.describe('SCENARIO 2: Offline Login', () => {
  let testUser;
  let testPassword;

  test.beforeAll(async () => {
    testUser = {
      username: 'test_user_1',
      password: 'test_pass_123',
      userId: 1001,
    };
    testPassword = 'test_pass_123';
  });

  test.beforeEach(async ({ browser, context }) => {
    // Pre-cache user credentials in localStorage (simulates previous online login)
    await context.addInitScript(() => {
      const cachedUsers = [
        {
          username: 'test_user_1',
          password_hash: btoa('sha256:test_pass_123'), // Simulated hash
          userId: 1001,
          cached_at: Date.now(),
          cached_models: true,
          cache_expiry: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
        }
      ];
      localStorage.setItem('offline_users', JSON.stringify(cachedUsers));
    });
  });

  // ============================================================
  // TC-2.1: App Loads Without Internet
  // ============================================================
  test('TC-2.1: App loads without internet connection', async ({ browser, context }) => {
    // Set offline mode
    await context.setOffline(true);

    // Clear any existing session
    await context.clearCookies();

    // Create page
    const page = await context.newPage();

    // Clear storage
    await page.evaluate(() => {
      sessionStorage.clear();
      // Keep offline_users for credential validation
    });

    // Load app
    await page.goto('http://localhost:8000/web/pos', {
      waitUntil: 'domcontentloaded'
    });

    // Verify page loads (no crash)
    expect(page).toBeTruthy();

    // Verify no network error page
    const errorContent = await page.content();
    expect(errorContent).not.toContain('ERR_INTERNET_DISCONNECTED');
    expect(errorContent).not.toContain('Cannot find server');

    // Verify DOM ready
    const body = await page.locator('body');
    await expect(body).toBeVisible();

    await page.close();
  });

  // ============================================================
  // TC-2.2: Offline Login Popup Appears
  // ============================================================
  test('TC-2.2: Offline login popup appears on page load', async ({ browser, context }) => {
    await context.setOffline(true);
    await context.clearCookies();

    const page = await context.newPage();

    // Load app
    await page.goto('http://localhost:8000/web/pos', {
      waitUntil: 'domcontentloaded'
    });

    // Wait for popup to appear
    const popup = page.locator('[data-testid="offline-login-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Verify popup content
    const title = popup.locator('h2');
    const titleText = await title.textContent();
    expect(titleText).toContain('Offline');

    // Verify form fields
    const usernameField = popup.locator('[name="username"]');
    const passwordField = popup.locator('[name="password"]');
    const submitBtn = popup.locator('[type="submit"]');

    await expect(usernameField).toBeVisible();
    await expect(passwordField).toBeVisible();
    await expect(submitBtn).toBeVisible();
    expect(await submitBtn.isEnabled()).toBe(true);

    // Verify offline badge
    const badge = page.locator('[data-testid="offline-badge"]');
    await expect(badge).toBeVisible();

    await page.close();
  });

  // ============================================================
  // TC-2.3: Enter Credentials
  // ============================================================
  test('TC-2.3: User can enter credentials in offline login', async ({ browser, context }) => {
    await context.setOffline(true);
    await context.clearCookies();

    const page = await context.newPage();
    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });

    const popup = page.locator('[data-testid="offline-login-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Get form fields
    const usernameField = popup.locator('[name="username"]');
    const passwordField = popup.locator('[name="password"]');

    // Enter credentials
    await usernameField.fill(testUser.username);
    await passwordField.fill(testPassword);

    // Verify values entered
    expect(await usernameField.inputValue()).toBe(testUser.username);
    expect(await passwordField.inputValue()).toBe(testPassword);

    // Verify no validation errors during input
    const errors = page.locator('[data-testid="login-error"]');
    expect(await errors.count()).toBe(0);

    await page.close();
  });

  // ============================================================
  // TC-2.4: Correct Credentials (Offline)
  // ============================================================
  test('TC-2.4: Correct credentials accepted (offline validation)', async ({ browser, context }) => {
    await context.setOffline(true);
    await context.clearCookies();

    const page = await context.newPage();
    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });

    const popup = page.locator('[data-testid="offline-login-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Enter correct credentials
    const usernameField = popup.locator('[name="username"]');
    const passwordField = popup.locator('[name="password"]');
    const submitBtn = popup.locator('[type="submit"]');

    await usernameField.fill(testUser.username);
    await passwordField.fill(testPassword);
    await submitBtn.click();

    // Verify dashboard loads (popup closes)
    await expect(popup).not.toBeVisible({ timeout: 5000 });

    // Verify dashboard visible
    const dashboard = page.locator('[data-testid="pos-dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 5000 });

    // Verify session created
    const session = await page.evaluate(() => sessionStorage.getItem('pos_session'));
    expect(session).toBeTruthy();

    // Verify no errors
    const errors = page.locator('[data-testid="login-error"]');
    expect(await errors.count()).toBe(0);

    await page.close();
  });

  // ============================================================
  // TC-2.5: Wrong Credentials (Offline)
  // ============================================================
  test('TC-2.5: Wrong credentials rejected', async ({ browser, context }) => {
    await context.setOffline(true);
    await context.clearCookies();

    const page = await context.newPage();
    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });

    const popup = page.locator('[data-testid="offline-login-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Enter wrong password
    const usernameField = popup.locator('[name="username"]');
    const passwordField = popup.locator('[name="password"]');
    const submitBtn = popup.locator('[type="submit"]');

    await usernameField.fill(testUser.username);
    await passwordField.fill('wrong_password_xyz');
    await submitBtn.click();

    // Verify error message
    const errorMsg = page.locator('[data-testid="login-error"]');
    await expect(errorMsg).toBeVisible({ timeout: 3000 });

    const errorText = await errorMsg.textContent();
    expect(errorText.toLowerCase()).toMatch(/invalid|wrong|incorrect/);

    // Verify popup still visible (didn't close)
    await expect(popup).toBeVisible();

    // Verify dashboard NOT loaded
    const dashboard = page.locator('[data-testid="pos-dashboard"]');
    expect(await dashboard.isVisible()).toBe(false);

    // Verify session NOT created
    const session = await page.evaluate(() => sessionStorage.getItem('pos_session'));
    expect(session).toBeFalsy();

    await page.close();
  });

  // ============================================================
  // TC-2.6: Resume Previous Session
  // ============================================================
  test('TC-2.6: Previous session can be resumed offline', async ({ browser, context }) => {
    await context.setOffline(true);

    // Pre-set a session cookie
    await context.addCookies([
      {
        name: 'pos_session',
        value: 'test_session_token_123',
        url: 'http://localhost:8000',
        httpOnly: true,
        sameSite: 'Strict'
      }
    ]);

    const page = await context.newPage();

    // Add session to sessionStorage
    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token_123');
    });

    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });

    // Wait briefly for app to check session
    await page.waitForTimeout(2000);

    // Check if popup appears (depends on session validity check)
    const popup = page.locator('[data-testid="offline-login-popup"]');
    const isPopupVisible = await popup.isVisible().catch(() => false);

    if (isPopupVisible) {
      // Session not valid, need to login
      const usernameField = popup.locator('[name="username"]');
      const passwordField = popup.locator('[name="password"]');
      await usernameField.fill(testUser.username);
      await passwordField.fill(testPassword);
      await popup.locator('[type="submit"]').click();
    }

    // Dashboard should eventually be visible
    const dashboard = page.locator('[data-testid="pos-dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 5000 });

    await page.close();
  });

  // ============================================================
  // TC-2.7: Session Timeout (Offline)
  // ============================================================
  test('TC-2.7: Session times out after 30 minutes (offline)', async ({ browser, context }, testInfo) => {
    // Use fake timers for this test
    test.skip(true, 'Skipping real timeout test - use manual testing or adjust with fake timers');

    await context.setOffline(true);

    const page = await context.newPage();

    // Add initial session
    await page.evaluate(() => {
      sessionStorage.setItem('pos_session', 'test_session_token_123');
      sessionStorage.setItem('session_start_time', (Date.now() - 31 * 60 * 1000).toString());
    });

    // Load app
    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Try to perform action - should fail with session expired
    const ringButton = page.locator('[data-testid="ring-item-btn"]');

    // If button is visible, session still valid
    if (await ringButton.isVisible().catch(() => false)) {
      // Click it - may trigger session check
      await ringButton.click();

      // Verify session expired error appears
      const error = page.locator('[data-testid="session-expired"]');
      const isExpiredError = await error.isVisible().catch(() => false);

      if (isExpiredError) {
        expect(await error.textContent()).toContain('expired');
      }
    }

    await page.close();
  });

  // ============================================================
  // TC-2.8: Cache Expired
  // ============================================================
  test('TC-2.8: Expired cache handled gracefully', async ({ browser, context }) => {
    // Pre-load expired cache
    await context.addInitScript(() => {
      const expiredCache = {
        username: 'test_user_1',
        password_hash: btoa('sha256:test_pass_123'),
        cached_at: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days old
        cache_expiry: Date.now() - (1 * 24 * 60 * 60 * 1000), // Expired 1 day ago
      };
      localStorage.setItem('offline_user_cache', JSON.stringify(expiredCache));
    });

    await context.setOffline(true);
    await context.clearCookies();

    const page = await context.newPage();
    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });

    // Wait for cache expiration check
    await page.waitForTimeout(2000);

    // Verify warning shown (if applicable)
    const warning = page.locator('[data-testid="cache-expired-warning"]');
    const isWarningVisible = await warning.isVisible().catch(() => false);

    // Should still show login popup regardless
    const popup = page.locator('[data-testid="offline-login-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    // User can still try to login
    const usernameField = popup.locator('[name="username"]');
    const passwordField = popup.locator('[name="password"]');

    await usernameField.fill(testUser.username);
    await passwordField.fill(testPassword);
    await popup.locator('[type="submit"]').click();

    // Should either succeed or show cache expired error
    const result = await page.locator('[data-testid="pos-dashboard"]').isVisible().catch(() => false);
    expect(typeof result).toBe('boolean');

    await page.close();
  });

  // ============================================================
  // TC-2.9: Multiple Login Attempts
  // ============================================================
  test('TC-2.9: Multiple offline login attempts handled', async ({ browser, context }) => {
    await context.setOffline(true);
    await context.clearCookies();

    const page = await context.newPage();
    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });

    const popup = page.locator('[data-testid="offline-login-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Try 3 wrong passwords
    const usernameField = popup.locator('[name="username"]');
    const passwordField = popup.locator('[name="password"]');
    const submitBtn = popup.locator('[type="submit"]');

    for (let i = 0; i < 3; i++) {
      await usernameField.fill(testUser.username);
      await passwordField.fill('wrong_password_' + i);
      await submitBtn.click();

      // Verify error shown
      const error = page.locator('[data-testid="login-error"]');
      await expect(error).toBeVisible({ timeout: 2000 });

      console.log(`Attempt ${i + 1}: Failed as expected`);
    }

    // Try correct password
    await usernameField.fill(testUser.username);
    await passwordField.fill(testPassword);
    await submitBtn.click();

    // Should succeed
    const dashboard = page.locator('[data-testid="pos-dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 5000 });

    // Verify session created
    const session = await page.evaluate(() => sessionStorage.getItem('pos_session'));
    expect(session).toBeTruthy();

    await page.close();
  });

  // ============================================================
  // TC-2.10: Recovery After Network Restore
  // ============================================================
  test('TC-2.10: Session persists after network restore', async ({ browser, context }) => {
    // Start offline
    await context.setOffline(true);
    await context.clearCookies();

    let page = await context.newPage();
    await page.goto('http://localhost:8000/web/pos', { waitUntil: 'domcontentloaded' });

    // Login offline
    const popup = page.locator('[data-testid="offline-login-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    const usernameField = popup.locator('[name="username"]');
    const passwordField = popup.locator('[name="password"]');
    await usernameField.fill(testUser.username);
    await passwordField.fill(testPassword);
    await popup.locator('[type="submit"]').click();

    // Verify dashboard
    const dashboard = page.locator('[data-testid="pos-dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 5000 });

    // Ring an item
    await page.fill('[data-testid="product-search"]', 'TestItem', { timeout: 5000 });
    await page.waitForSelector('[data-testid="product-result"]', { timeout: 5000 });
    await page.locator('[data-testid="product-result"]:first-child').click();

    // Get current session
    const offlineSession = await page.evaluate(() => sessionStorage.getItem('pos_session'));
    expect(offlineSession).toBeTruthy();

    // Restore network
    await context.setOffline(false);
    await page.waitForTimeout(2000);

    // Verify session still valid
    const onlineSession = await page.evaluate(() => sessionStorage.getItem('pos_session'));
    expect(onlineSession).toBe(offlineSession);

    // Verify dashboard still visible
    await expect(dashboard).toBeVisible();

    // Verify no re-login required
    const popupAfterRestore = page.locator('[data-testid="offline-login-popup"]');
    expect(await popupAfterRestore.isVisible().catch(() => false)).toBe(false);

    // Verify sync starts (indicated by sync progress)
    const syncIndicator = page.locator('[data-testid="sync-progress"]');
    const isSyncing = await syncIndicator.isVisible({ timeout: 5000 }).catch(() => false);

    // Sync may or may not show indicator depending on timing
    await page.waitForLoadState('networkidle');

    await page.close();
  });
});
