# Master Test Matrix - PDC POS Offline

## Executive Summary

**Total Test Cases**: 30 core + 10 edge cases = 40 tests
**Coverage**: 3 scenarios × 10 test cases per scenario
**Duration**: ~45 minutes (unit 5min + integration 10min + E2E 30min)
**Priority Distribution**: P0=24, P1=10, P2=6

---

## Scenario 1: Login → Offline → Resume (10 tests)

### Test Chain Dependency Map

```
TC-1.1 (Login)
    ↓
TC-1.2 (Cache)
    ├→ TC-1.3 (Offline)
    │   ├→ TC-1.4 (UI Switch)
    │   └→ TC-1.5 (Ring Items)
    │       └→ TC-1.6 (Complete TX)
    │           └→ TC-1.7 (Multiple TX)
    │               └→ TC-1.8 (Restore Network)
    │                   ├→ TC-1.9 (Sync Start)
    │                   └→ TC-1.10 (No Duplicates)
```

### TC-1.1: User Login (Online)
**Priority**: P0 | **Type**: Unit | **Duration**: 5s
**Prerequisites**: Fresh app, no cache

**Test Steps**:
1. Load app with working internet
2. Navigate to login screen
3. Enter test credentials (username: test_user_1, password: test_pass_123)
4. Click login button
5. Wait for dashboard to load

**Expected Outcomes**:
- Login form accepts credentials
- Session token saved to localStorage/IndexedDB
- Dashboard loads successfully
- No error messages
- Network requests succeed

**Failure Scenarios**:
- Network timeout
- Invalid credentials
- Server responds with 401/403
- Session token missing
- Dashboard fails to load

**Verification Points**:
```javascript
assert.equal(sessionStorage.getItem('pos_session'), 'valid_token')
assert.equal(localStorage.getItem('user_id'), 'test_user_1')
assert.ok(document.querySelector('.pos-dashboard'))
assert.notOk(document.querySelector('.error-message'))
```

---

### TC-1.2: Models Fully Cached
**Priority**: P0 | **Type**: Unit | **Duration**: 10s
**Prerequisites**: TC-1.1 passed

**Test Steps**:
1. Wait 3 seconds after login for models to cache
2. Check IndexedDB for models store
3. Verify presence of: products, categories, payment_methods, taxes, customers
4. Count total records
5. Validate schema

**Expected Outcomes**:
- IndexedDB models store populated
- All required model types present
- Records valid and complete
- No null/undefined values
- Timestamps present

**Failure Scenarios**:
- IndexedDB not available
- Models store creation fails
- Partial models synced
- Network timeout during cache
- Schema mismatch

**Verification Points**:
```javascript
const db = await OfflineDB.getInstance()
const products = await db.getAllProducts()
const categories = await db.getAllCategories()
const paymentMethods = await db.getAllPaymentMethods()

assert.ok(products.length > 0, 'Products cached')
assert.ok(categories.length > 0, 'Categories cached')
assert.ok(paymentMethods.length > 0, 'Payment methods cached')
assert.ok(products.every(p => p.id && p.name), 'Products valid')
```

---

### TC-1.3: Network Goes Offline
**Priority**: P0 | **Type**: Unit | **Duration**: 5s
**Prerequisites**: TC-1.2 passed

**Test Steps**:
1. Simulate network going offline (Playwright: page.context().setOffline(true))
2. Wait 2 seconds for detection
3. Verify connectionMonitor detects offline state
4. Check isOffline flag
5. Verify server-unreachable event fired

**Expected Outcomes**:
- Offline state detected within 2 seconds
- connectionMonitor.isOffline() returns true
- Event listeners notified
- SyncManager stops
- UI prepared for offline mode

**Failure Scenarios**:
- Detection takes >5 seconds
- Event not fired
- UI doesn't respond
- Old connection attempts continue

**Verification Points**:
```javascript
const monitor = ConnectionMonitor.getInstance()
await simulateOffline()
await page.waitForTimeout(2000)

assert.ok(monitor.isOffline(), 'Offline detected')
assert.notOk(monitor.isServerReachable(), 'Server unreachable')
```

---

### TC-1.4: UI Switches to Offline Mode
**Priority**: P0 | **Type**: E2E | **Duration**: 3s
**Prerequisites**: TC-1.3 passed

**Test Steps**:
1. Observe UI after offline detection
2. Look for offline indicator (banner/badge)
3. Check payment processing UI
4. Verify sync button disabled
5. Check transaction button still enabled

**Expected Outcomes**:
- Offline banner appears
- UI indicates offline mode
- Offline transaction support available
- Sync controls disabled
- Ringing items still possible

**Failure Scenarios**:
- Offline banner missing
- UI becomes unresponsive
- Essential controls disabled
- No visual feedback

**Verification Points**:
```javascript
const offlineBanner = await page.locator('[data-testid="offline-banner"]')
assert.ok(await offlineBanner.isVisible(), 'Offline banner visible')

const ringButton = await page.locator('[data-testid="ring-item-btn"]')
assert.ok(await ringButton.isEnabled(), 'Ring button enabled')

const syncButton = await page.locator('[data-testid="sync-btn"]')
assert.ok(!(await syncButton.isEnabled()), 'Sync button disabled')
```

---

### TC-1.5: Ring Items (Offline)
**Priority**: P0 | **Type**: E2E | **Duration**: 5s
**Prerequisites**: TC-1.4 passed

**Test Steps**:
1. Search for product (e.g., "Apple")
2. Click product to select
3. Verify item appears in cart
4. Increase quantity to 2
5. Change payment method
6. Verify cart updates

**Expected Outcomes**:
- Product added to cart
- Quantity updates work
- Payment method selection works
- Cart total calculated
- No network requests made
- All stored in IndexedDB

**Failure Scenarios**:
- Product search fails
- Cart not updating
- Network request made
- UI frozen during selection
- Data not persisted

**Verification Points**:
```javascript
await page.click('[data-testid="product-search"]')
await page.fill('[data-testid="product-search"]', 'Apple')
await page.click('text=Apple | $5.00')

const cartItem = await page.locator('[data-testid="cart-item-apple"]')
assert.ok(await cartItem.isVisible())

const quantity = await page.locator('[data-testid="quantity-input"]')
await quantity.fill('2')

const total = await page.locator('[data-testid="cart-total"]')
assert.ok((await total.textContent()).includes('10.00'))
```

---

### TC-1.6: Complete Transaction (Offline)
**Priority**: P0 | **Type**: E2E | **Duration**: 8s
**Prerequisites**: TC-1.5 passed

**Test Steps**:
1. Have items in cart (from TC-1.5)
2. Select payment method (Cash)
3. Click complete transaction
4. Verify receipt generated
5. Check transaction saved to IndexedDB
6. Verify transaction ID assigned
7. Check pending sync queue

**Expected Outcomes**:
- Transaction completes without network
- Receipt displayed
- Transaction ID generated (offline format)
- Data saved to pending_transactions store
- Queue count incremented
- Payment recorded

**Failure Scenarios**:
- Complete button disabled
- Receipt not generated
- Transaction not persisted
- ID generation fails
- Payment method fails

**Verification Points**:
```javascript
await page.click('[data-testid="payment-method-cash"]')
await page.click('[data-testid="complete-transaction"]')

await page.waitForSelector('[data-testid="receipt"]')
const receipt = await page.locator('[data-testid="receipt"]')
assert.ok(await receipt.isVisible())

const txId = await receipt.locator('[data-testid="transaction-id"]').textContent()
assert.match(txId, /^OFFLINE-\d+$/)

const db = await OfflineDB.getInstance()
const pending = await db.getPendingTransactions()
assert.equal(pending.length, 1)
```

---

### TC-1.7: Multiple Transactions Queued
**Priority**: P0 | **Type**: Integration | **Duration**: 30s
**Prerequisites**: TC-1.6 passed

**Test Steps**:
1. Complete 5 more transactions (repeat TC-1.6 × 5)
2. Each with different products
3. Each with different payment methods
4. Verify pending count reaches 6
5. Check IndexedDB queue integrity
6. Verify no duplicates
7. Validate order preservation

**Expected Outcomes**:
- All 6 transactions queued
- Pending count = 6
- Each transaction unique
- Order preserved (FIFO)
- All transactions valid
- No memory issues
- Queue readable

**Failure Scenarios**:
- Transactions lost
- Duplicates created
- Order scrambled
- Queue corrupted
- Memory limit exceeded
- Transactions incomplete

**Verification Points**:
```javascript
const db = await OfflineDB.getInstance()

for (let i = 0; i < 5; i++) {
  // Ring item, complete transaction
  await ringItem('Product' + i)
  await page.click('[data-testid="complete-transaction"]')
  await page.waitForSelector('[data-testid="receipt"]')
}

const pending = await db.getPendingTransactions()
assert.equal(pending.length, 6)
assert.deepEqual(
  pending.map(t => t.id),
  pending.map(t => t.id).sort() // Verify order
)
assert.ok(pending.every(t => t.completed_at))
```

---

### TC-1.8: Network Restored
**Priority**: P0 | **Type**: Unit | **Duration**: 3s
**Prerequisites**: TC-1.7 passed

**Test Steps**:
1. Restore network connectivity (Playwright: remove offline simulation)
2. Wait 2 seconds for detection
3. Verify connectionMonitor detects online state
4. Check isOffline flag
5. Verify server-reachable event fired

**Expected Outcomes**:
- Online state detected
- connectionMonitor.isOffline() returns false
- connectionMonitor.isServerReachable() returns true
- Server reachable event fired
- SyncManager ready to sync

**Failure Scenarios**:
- Detection takes >5 seconds
- Event not fired
- Old offline flag persists
- Server check fails

**Verification Points**:
```javascript
await simulateOnline()
await page.waitForTimeout(2000)

const monitor = ConnectionMonitor.getInstance()
assert.notOk(monitor.isOffline())
assert.ok(monitor.isServerReachable())
```

---

### TC-1.9: Sync Starts Automatically
**Priority**: P0 | **Type**: Unit | **Duration**: 5s
**Prerequisites**: TC-1.8 passed

**Test Steps**:
1. Wait 3 seconds after network restoration
2. Verify SyncManager starts
3. Check sync UI indicator appears
4. Monitor network requests
5. Verify pending transactions sent

**Expected Outcomes**:
- Sync starts automatically
- Sync UI shows progress
- Network requests made
- Pending count visible
- No user action needed

**Failure Scenarios**:
- Sync doesn't start
- UI not updated
- Network requests fail
- Pending count not shown
- Manual start required

**Verification Points**:
```javascript
const syncManager = SyncManager.getInstance()
assert.ok(syncManager.isSyncing, 'Sync in progress')

const syncIndicator = await page.locator('[data-testid="sync-progress"]')
assert.ok(await syncIndicator.isVisible())

await page.waitForLoadState('networkidle')
```

---

### TC-1.10: All Transactions Synced (No Duplicates)
**Priority**: P0 | **Type**: Integration | **Duration**: 15s
**Prerequisites**: TC-1.9 passed

**Test Steps**:
1. Wait for sync to complete
2. Check pending transaction count = 0
3. Query server for synced transactions
4. Verify all 6 transactions present
5. Verify no duplicates
6. Verify amounts correct
7. Verify payment methods correct
8. Clear offline cache and verify data persists on server

**Expected Outcomes**:
- All 6 transactions synced
- Pending count = 0
- No duplicates on server
- All amounts correct
- All items present
- Sync status UI updated
- Data persists after logout

**Failure Scenarios**:
- Sync incomplete
- Duplicates created
- Wrong amounts
- Missing items
- Sync timeout
- Server data mismatch

**Verification Points**:
```javascript
const db = await OfflineDB.getInstance()
const pending = await db.getPendingTransactions()
assert.equal(pending.length, 0)

const serverTxs = await api.getTransactions(testUser.id)
assert.equal(serverTxs.length, 6)
assert.ok(serverTxs.every(tx => tx.synced_at))

// Verify amounts
const totalAmount = serverTxs.reduce((sum, tx) => sum + tx.total, 0)
assert.equal(totalAmount, expectedTotal)

// Logout and verify persistence
await page.click('[data-testid="logout-btn"]')
await page.reload()
const serverTxs2 = await api.getTransactions(testUser.id)
assert.equal(serverTxs2.length, 6)
```

---

## Scenario 2: Offline Login (10 tests)

### Test Chain Dependency Map

```
TC-2.1 (No Internet Load)
    ├→ TC-2.2 (Offline Popup)
    │   ├→ TC-2.3 (Credentials Entry)
    │   │   ├→ TC-2.4 (Correct Credentials)
    │   │   │   └→ TC-2.6 (Resume Session)
    │   │   │       └→ TC-2.7 (Session Timeout)
    │   │   │           └→ TC-2.8 (Expired Cache)
    │   │   │
    │   │   └→ TC-2.5 (Wrong Credentials)
    │   │
    │   └→ TC-2.9 (Multiple Attempts)
    │
    └→ TC-2.10 (Network Recover)
```

### TC-2.1: App Loads Without Internet
**Priority**: P0 | **Type**: E2E | **Duration**: 5s
**Prerequisites**: No cached session, offline

**Test Steps**:
1. Ensure no cached login data
2. Clear all storage
3. Set offline mode
4. Load app URL
5. Wait 3 seconds
6. Check what displays

**Expected Outcomes**:
- App loads without crashing
- Offline login popup appears
- No network errors logged
- UI responsive
- Fallback login option visible

**Failure Scenarios**:
- App crashes
- Blank screen
- Network error messages
- Popup doesn't appear
- UI frozen

**Verification Points**:
```javascript
localStorage.clear()
sessionStorage.clear()
await page.context().setOffline(true)
await page.goto('http://localhost:8000/web/pos')
await page.waitForTimeout(3000)

const offlinePopup = await page.locator('[data-testid="offline-login-popup"]')
assert.ok(await offlinePopup.isVisible())

const errorMessages = await page.locator('.error').count()
assert.equal(errorMessages, 0)
```

---

### TC-2.2: Offline Login Popup Appears
**Priority**: P0 | **Type**: E2E | **Duration**: 2s
**Prerequisites**: TC-2.1 passed

**Test Steps**:
1. Verify popup is visible
2. Check popup title
3. Check username field present
4. Check password field present
5. Check submit button
6. Check offline indicator

**Expected Outcomes**:
- Popup centered on screen
- Title says "Offline Login"
- Username input visible
- Password input visible
- Submit button enabled
- Offline badge visible

**Failure Scenarios**:
- Popup invisible
- Fields missing
- Submit disabled
- Wrong title
- Not centered

**Verification Points**:
```javascript
const popup = await page.locator('[data-testid="offline-login-popup"]')
assert.ok(await popup.isVisible())

const title = await popup.locator('h2').textContent()
assert.equal(title, 'Offline Login')

const usernameField = await popup.locator('[name="username"]')
const passwordField = await popup.locator('[name="password"]')
const submitBtn = await popup.locator('[type="submit"]')

assert.ok(await usernameField.isVisible())
assert.ok(await passwordField.isVisible())
assert.ok(await submitBtn.isEnabled())
```

---

### TC-2.3: Enter Credentials
**Priority**: P1 | **Type**: E2E | **Duration**: 3s
**Prerequisites**: TC-2.2 passed

**Test Steps**:
1. Click username field
2. Type valid username
3. Click password field
4. Type valid password
5. Verify fields populated
6. Submit form

**Expected Outcomes**:
- Fields accept input
- Values visible in fields
- No validation errors during input
- Submit button clickable
- Form submittable

**Failure Scenarios**:
- Fields don't accept input
- Input lost/cleared
- Validation error before submit
- Submit disabled
- Keyboard not working

**Verification Points**:
```javascript
const usernameField = await page.locator('[name="username"]')
const passwordField = await page.locator('[name="password"]')
const submitBtn = await page.locator('[type="submit"]')

await usernameField.fill('test_user_1')
await passwordField.fill('test_pass_123')

assert.equal(await usernameField.inputValue(), 'test_user_1')
assert.equal(await passwordField.inputValue(), 'test_pass_123')

await submitBtn.click()
```

---

### TC-2.4: Correct Credentials (Offline)
**Priority**: P0 | **Type**: Unit | **Duration**: 5s
**Prerequisites**: TC-2.3 passed

**Test Steps**:
1. Credentials submitted
2. Check localStorage for cached user
3. Validate username matches
4. Validate credentials against cache
5. Verify token generated
6. Verify session stored

**Expected Outcomes**:
- Credentials found in cache
- Match succeeds
- Session token generated
- Session persisted
- Dashboard loads
- No network requests

**Failure Scenarios**:
- Credentials not found
- Match fails
- Token generation fails
- Session not stored
- Dashboard doesn't load

**Verification Points**:
```javascript
const cache = localStorage.getItem('offline_users')
const users = JSON.parse(cache)
const user = users.find(u => u.username === 'test_user_1')

assert.ok(user)
assert.equal(user.password_hash, hash('test_pass_123'))

await page.waitForSelector('[data-testid="pos-dashboard"]')
const session = sessionStorage.getItem('pos_session')
assert.ok(session)
```

---

### TC-2.5: Wrong Credentials (Offline)
**Priority**: P0 | **Type**: Unit | **Duration**: 3s
**Prerequisites**: TC-2.3 passed

**Test Steps**:
1. Submit wrong password
2. Wait for validation
3. Check error message
4. Verify dashboard not loaded
5. Verify popup stays open
6. Allow retry

**Expected Outcomes**:
- Error message displayed
- Dashboard not loaded
- Popup remains visible
- Fields cleared
- User can retry
- No crashes

**Failure Scenarios**:
- App crashes
- No error message
- Dashboard loads anyway
- Popup closes
- No retry allowed

**Verification Points**:
```javascript
const passwordField = await page.locator('[name="password"]')
await passwordField.fill('wrong_password')
await page.click('[type="submit"]')

const errorMsg = await page.locator('[data-testid="login-error"]')
assert.ok(await errorMsg.isVisible())
assert.match(
  await errorMsg.textContent(),
  /Invalid credentials|Wrong password/i
)

const dashboard = await page.locator('[data-testid="pos-dashboard"]')
assert.notOk(await dashboard.isVisible())

const popup = await page.locator('[data-testid="offline-login-popup"]')
assert.ok(await popup.isVisible())
```

---

### TC-2.6: Resume Previous Session
**Priority**: P1 | **Type**: Integration | **Duration**: 5s
**Prerequisites**: TC-2.4 passed (session exists)

**Test Steps**:
1. Clear browser tab/window
2. Go offline again
3. Load app
4. Check if previous session cookie exists
5. Auto-populate username
6. Allow quick re-login

**Expected Outcomes**:
- Previous username shown
- Password field empty
- Session recognized
- Dashboard accessible
- User can continue working

**Failure Scenarios**:
- Session not detected
- Username not prepopulated
- Requires full re-login
- Session data lost
- Cookies cleared

**Verification Points**:
```javascript
// First login
await login('test_user_1', 'test_pass_123')
await page.waitForSelector('[data-testid="pos-dashboard"]')

// Clear and reload
await page.context().clearCookies()
await page.reload()

// Check if session resumable
const usernameField = await page.locator('[name="username"]')
const currentValue = await usernameField.inputValue()
// May or may not be pre-filled depending on implementation
```

---

### TC-2.7: Session Timeout
**Priority**: P1 | **Type**: Unit | **Duration**: 35s
**Prerequisites**: TC-2.6 passed (session active)

**Test Steps**:
1. Complete login
2. Wait 30 minutes (simulated: 30s with accelerated clock)
3. Try to perform action
4. Check if session expired
5. Verify re-auth required

**Expected Outcomes**:
- Session expires after 30min
- Error message shown
- Dashboard access denied
- Offline login popup appears
- Must re-enter credentials

**Failure Scenarios**:
- Session doesn't expire
- Stale session accepted
- No warning shown
- UI doesn't respond

**Verification Points**:
```javascript
// Login and get session time
const sessionStart = Date.now()
await login('test_user_1', 'test_pass_123')

// Wait 30 seconds (simulate 30 min)
jest.useFakeTimers()
jest.advanceTimersByTime(30 * 60 * 1000)

// Try action
await page.click('[data-testid="ring-item-btn"]')

// Expect failure
const error = await page.locator('[data-testid="session-expired"]')
assert.ok(await error.isVisible())

const popup = await page.locator('[data-testid="offline-login-popup"]')
assert.ok(await popup.isVisible())
```

---

### TC-2.8: Cache Expired
**Priority**: P1 | **Type**: Unit | **Duration**: 5s
**Prerequisites**: Cached data older than 7 days

**Test Steps**:
1. Check cache timestamp
2. Simulate 7+ day old cache
3. Try offline login
4. Verify cache validity check
5. Handle expired cache

**Expected Outcomes**:
- Cache expiration detected
- User notified
- Cannot login with expired cache
- Fallback option offered
- Sync forced when online

**Failure Scenarios**:
- Expired cache accepted
- No warning given
- Stale data used
- No refresh option

**Verification Points**:
```javascript
const cache = localStorage.getItem('offline_user_data')
const data = JSON.parse(cache)
data.cached_at = Date.now() - (8 * 24 * 60 * 60 * 1000) // 8 days ago
localStorage.setItem('offline_user_data', JSON.stringify(data))

// Try offline login
await page.context().setOffline(true)
await page.goto('http://localhost:8000/web/pos')

const warning = await page.locator('[data-testid="cache-expired-warning"]')
assert.ok(await warning.isVisible())
```

---

### TC-2.9: Multiple Offline Login Attempts
**Priority**: P2 | **Type**: E2E | **Duration**: 10s
**Prerequisites**: Offline, fresh app

**Test Steps**:
1. Try wrong credentials 3 times
2. Check for rate limiting
3. Try correct credentials
4. Verify rate limit doesn't block valid login
5. Check attempt counter

**Expected Outcomes**:
- 3 failures allowed
- Error message on each failure
- 4th attempt rate-limited (optional)
- Correct credentials work regardless
- No permanent lockout
- UI responsive

**Failure Scenarios**:
- Locked out permanently
- Rate limit blocks valid login
- No error feedback
- Attempt limit too strict

**Verification Points**:
```javascript
const submitBtn = await page.locator('[type="submit"]')

// Try wrong password 3 times
for (let i = 0; i < 3; i++) {
  await page.fill('[name="username"]', 'test_user_1')
  await page.fill('[name="password"]', 'wrong_' + i)
  await submitBtn.click()

  const error = await page.locator('[data-testid="login-error"]')
  assert.ok(await error.isVisible())

  const error_count = i + 1
  console.log(`Attempt ${error_count} failed`)
}

// Try correct password
await page.fill('[name="username"]', 'test_user_1')
await page.fill('[name="password"]', 'test_pass_123')
await submitBtn.click()

await page.waitForSelector('[data-testid="pos-dashboard"]')
```

---

### TC-2.10: Recovery After Network Restore
**Priority**: P1 | **Type**: Integration | **Duration**: 10s
**Prerequisites**: TC-2.9 passed (offline login done)

**Test Steps**:
1. Logged in offline
2. Perform some actions
3. Restore network
4. Verify session still valid
5. Check automatic sync
6. Verify no re-login needed

**Expected Outcomes**:
- Session persists after network restore
- No re-login required
- Sync starts automatically
- Data synced to server
- No lost changes
- UI stays responsive

**Failure Scenarios**:
- Session invalidated
- Must re-login
- Data lost
- Sync fails
- UI frozen

**Verification Points**:
```javascript
// Login offline
await login('test_user_1', 'test_pass_123')

// Ring item
await ringItem('Apple')

// Restore network
await page.context().setOffline(false)
await page.waitForTimeout(2000)

// Verify session still valid
const dashboard = await page.locator('[data-testid="pos-dashboard"]')
assert.ok(await dashboard.isVisible())

// Verify sync happens
const syncIndicator = await page.locator('[data-testid="sync-progress"]')
assert.ok(await syncIndicator.isVisible())

// Wait for sync
await page.waitForLoadState('networkidle')

// Verify data synced
const serverTxs = await api.getTransactions(testUser.id)
assert.ok(serverTxs.some(tx => tx.items.some(i => i.name === 'Apple')))
```

---

## Scenario 3: Sync During Transaction (10 tests)

### Test Chain Dependency Map

```
TC-3.1 (Pending Queue)
    ├→ TC-3.2 (Restore Network)
    │   ├→ TC-3.3 (Sync Start)
    │   │   ├→ TC-3.4 (User TX During Sync)
    │   │   │   ├→ TC-3.5 (TX Queue Behavior)
    │   │   │   │   ├→ TC-3.6 (Sync Complete)
    │   │   │   │   │   └→ TC-3.7 (New TX Syncs)
    │   │   │   │   │
    │   │   │   │   └→ TC-3.8 (Sync Fails)
    │   │   │   │       ├→ TC-3.9 (Partial Recovery)
    │   │   │   │       └→ TC-3.10 (Retry Succeeds)
```

### TC-3.1: Multiple Pending Transactions
**Priority**: P0 | **Type**: Unit | **Duration**: 20s
**Prerequisites**: Offline mode, fresh DB

**Test Steps**:
1. Go offline
2. Complete 3 transactions
3. Verify pending count = 3
4. Check IndexedDB queue
5. Verify no sync attempted

**Expected Outcomes**:
- 3 transactions queued
- Pending count = 3
- All in offline queue
- No network requests
- Data persisted
- Sync not started

**Failure Scenarios**:
- Transactions lost
- Sync triggered offline
- Queue corrupted
- Count wrong

**Verification Points**:
```javascript
await page.context().setOffline(true)

// Complete 3 transactions
for (let i = 0; i < 3; i++) {
  await ringItem('Item' + i)
  await page.click('[data-testid="complete-transaction"]')
  await page.waitForSelector('[data-testid="receipt"]')
}

const db = await OfflineDB.getInstance()
const pending = await db.getPendingTransactions()
assert.equal(pending.length, 3)
assert.ok(pending.every(t => !t.synced_at))
```

---

### TC-3.2: Network Restored
**Priority**: P0 | **Type**: Unit | **Duration**: 3s
**Prerequisites**: TC-3.1 passed

**Test Steps**:
1. Restore network
2. Wait 2 seconds for detection
3. Verify online state
4. Check sync ready state

**Expected Outcomes**:
- Network restored
- Online detected
- SyncManager ready
- No errors
- Server reachable

**Verification Points**:
```javascript
await page.context().setOffline(false)
await page.waitForTimeout(2000)

const monitor = ConnectionMonitor.getInstance()
assert.notOk(monitor.isOffline())
assert.ok(monitor.isServerReachable())
```

---

### TC-3.3: Sync Starts
**Priority**: P0 | **Type**: Unit | **Duration**: 5s
**Prerequisites**: TC-3.2 passed

**Test Steps**:
1. Wait 3 seconds
2. Verify sync initiates
3. Check first transaction sent
4. Monitor sync progress
5. Verify pending count decreases

**Expected Outcomes**:
- Sync starts automatically
- Network requests made
- Pending count decreases
- Progress shown to user
- No manual trigger needed

**Failure Scenarios**:
- Sync doesn't start
- Progress not shown
- Pending count not updated
- Requests fail

**Verification Points**:
```javascript
await page.waitForTimeout(3000)

const syncManager = SyncManager.getInstance()
assert.ok(syncManager.isSyncing)

const indicator = await page.locator('[data-testid="sync-progress"]')
assert.ok(await indicator.isVisible())

// Monitor pending count
let initialPending = 3
let progressUpdated = false
// ... monitor for count decrease
```

---

### TC-3.4: User Creates Transaction During Sync
**Priority**: P0 | **Type**: E2E | **Duration**: 20s
**Prerequisites**: TC-3.3 passed (sync in progress)

**Test Steps**:
1. Sync in progress (3 TXs syncing)
2. User rings new item
3. Completes new transaction
4. Verify new TX queued (not synced)
5. Check ring controls still work
6. Verify no blocking

**Expected Outcomes**:
- New transaction created
- Added to queue
- Not synced (older TXs syncing)
- Ring controls responsive
- No UI freeze
- New TX separate

**Failure Scenarios**:
- UI frozen during sync
- New TX lost
- New TX synced immediately
- Ring controls disabled
- Sync blocked by new TX

**Verification Points**:
```javascript
// Wait for sync to be in progress
await page.waitForTimeout(5000)

const syncManager = SyncManager.getInstance()
assert.ok(syncManager.isSyncing)

// User rings item during sync
await ringItem('NewItem')
await page.click('[data-testid="complete-transaction"]')
await page.waitForSelector('[data-testid="receipt"]')

const db = await OfflineDB.getInstance()
const pending = await db.getPendingTransactions()
const newTx = pending.find(t => t.items.some(i => i.name === 'NewItem'))
assert.ok(newTx)
assert.notOk(newTx.synced_at)
```

---

### TC-3.5: Transaction Queue Behavior
**Priority**: P0 | **Type**: Integration | **Duration**: 15s
**Prerequisites**: TC-3.4 passed (new TX in queue)

**Test Steps**:
1. Verify queue has 4 TXs (3 syncing + 1 new)
2. Check sync continues with oldest first
3. Verify queue order maintained
4. Check new TX still pending
5. Monitor sync progress

**Expected Outcomes**:
- Queue contains 4 TXs
- FIFO order preserved
- Sync continues old first
- New TX waits in queue
- No queue corruption
- Progress tracking works

**Failure Scenarios**:
- Queue has wrong count
- Order scrambled
- TX lost from queue
- Queue deadlocked
- Progress stuck

**Verification Points**:
```javascript
const db = await OfflineDB.getInstance()
let pending = await db.getPendingTransactions()
assert.equal(pending.length, 4)

// Verify order (by creation time)
const ids = pending.map(t => t.created_at)
const sortedIds = [...ids].sort()
assert.deepEqual(ids, sortedIds)

// Verify sync still happening
const syncManager = SyncManager.getInstance()
assert.ok(syncManager.isSyncing)

// Poll and verify order maintained
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1000)
  pending = await db.getPendingTransactions()
  assert.ok(pending.length > 0)
}
```

---

### TC-3.6: Sync Completes
**Priority**: P0 | **Type**: Unit | **Duration**: 30s
**Prerequisites**: TC-3.5 passed

**Test Steps**:
1. Wait for sync to complete all 3 original TXs
2. Verify pending count = 1
3. Check synced_at timestamps
4. Verify sync stopped (initial 3 done)
5. Check new TX still pending

**Expected Outcomes**:
- Original 3 TXs synced
- New TX remains pending
- Pending count = 1
- Sync continues to new TX
- All timestamps correct
- No duplicates

**Failure Scenarios**:
- Sync stops incomplete
- Pending count wrong
- New TX lost
- Duplicates created
- Sync timeout

**Verification Points**:
```javascript
// Wait for initial 3 to sync
await page.waitForTimeout(30000)

const db = await OfflineDB.getInstance()
const pending = await db.getPendingTransactions()
assert.equal(pending.length, 1)

const synced = await db.getSyncedTransactions()
assert.equal(synced.filter(t => t.synced_at).length, 3)

// Verify new TX still pending
const newTx = pending[0]
assert.notOk(newTx.synced_at)
```

---

### TC-3.7: New Transaction Syncs
**Priority**: P0 | **Type**: Integration | **Duration**: 10s
**Prerequisites**: TC-3.6 passed

**Test Steps**:
1. Verify sync continues with new TX
2. Monitor sync progress
3. Wait for new TX to sync
4. Verify pending count = 0
5. Verify all 4 on server

**Expected Outcomes**:
- New TX syncs after initial 3
- All 4 TXs on server
- No duplicates
- Pending queue empty
- Sync completes

**Failure Scenarios**:
- New TX not synced
- Pending count wrong
- Duplicates created
- Server data mismatch

**Verification Points**:
```javascript
// Wait for new TX to sync
await page.waitForTimeout(10000)

const db = await OfflineDB.getInstance()
const pending = await db.getPendingTransactions()
assert.equal(pending.length, 0)

// Verify all 4 on server
const serverTxs = await api.getTransactions(testUser.id)
const relevantTxs = serverTxs.filter(t => t.created_at > syncStart)
assert.equal(relevantTxs.length, 4)

// Verify no duplicates
const txIds = new Set(relevantTxs.map(t => t.id))
assert.equal(txIds.size, 4)
```

---

### TC-3.8: Sync Fails Midway
**Priority**: P0 | **Type**: Unit | **Duration**: 15s
**Prerequisites**: TC-3.1 passed, network failure simulated

**Test Steps**:
1. Start with 3 pending TXs
2. Network restored
3. Sync starts
4. Simulate network failure mid-sync (after 1 TX synced)
5. Verify graceful handling
6. Check partial state

**Expected Outcomes**:
- Sync fails gracefully
- 1 TX synced, 2 still pending
- No duplicates
- Error logged
- Retry mechanism ready
- No data corruption

**Failure Scenarios**:
- Crash on failure
- Data lost
- Duplicates created
- Queue corrupted
- No retry possible

**Verification Points**:
```javascript
await page.context().setOffline(false)
await page.waitForTimeout(2000)

// Wait for first TX to sync
await page.waitForTimeout(5000)

// Simulate network failure
await page.context().setOffline(true)
await page.waitForTimeout(2000)

const db = await OfflineDB.getInstance()
const pending = await db.getPendingTransactions()
// Should have 2 still pending (1 synced, 1 failed)
assert.equal(pending.length, 2)

const synced = await db.getSyncedTransactions()
assert.ok(synced.length >= 1)
```

---

### TC-3.9: Partial Sync Recovery
**Priority**: P0 | **Type**: Integration | **Duration**: 10s
**Prerequisites**: TC-3.8 passed (partial sync state)

**Test Steps**:
1. Sync in failed state
2. Network restored again
3. Check recovery mechanism
4. Verify no duplicates of synced TX
5. Resume sync from where stopped
6. Verify 2 remaining TXs sync

**Expected Outcomes**:
- Recovery detects partial state
- No duplicate sync attempts
- Sync resumes correctly
- All 2 remaining sync
- Database consistent
- No data loss

**Failure Scenarios**:
- Duplicates created
- Data lost
- Sync stuck
- Database inconsistent
- Manual intervention needed

**Verification Points**:
```javascript
// Restore network
await page.context().setOffline(false)
await page.waitForTimeout(2000)

// Wait for recovery
await page.waitForTimeout(10000)

const db = await OfflineDB.getInstance()
const pending = await db.getPendingTransactions()
assert.equal(pending.length, 0)

const synced = await db.getSyncedTransactions()
assert.equal(synced.filter(t => t.synced_at).length, 3)

// Verify on server
const serverTxs = await api.getTransactions(testUser.id)
const relevantTxs = serverTxs.filter(t => t.created_at > syncStart)
const uniqueTxs = new Set(relevantTxs.map(t => t.id))
assert.equal(uniqueTxs.size, 3)
```

---

### TC-3.10: Retry Succeeds (No Duplicates)
**Priority**: P0 | **Type**: Integration | **Duration**: 15s
**Prerequisites**: TC-3.9 passed (recovered)

**Test Steps**:
1. Sync completed successfully (no pending)
2. Verify all 3 TXs on server
3. Check for duplicate TX IDs
4. Verify amounts correct
5. Verify payment methods
6. Test end-to-end integrity

**Expected Outcomes**:
- All 3 TXs on server
- No duplicates (unique IDs)
- Correct amounts
- Correct items
- Correct payments
- Complete integrity
- Ready for next sync

**Failure Scenarios**:
- Duplicates present
- Wrong amounts
- Missing items
- Inconsistent data
- Server state wrong

**Verification Points**:
```javascript
const db = await OfflineDB.getInstance()
const pending = await db.getPendingTransactions()
assert.equal(pending.length, 0)

const serverTxs = await api.getTransactions(testUser.id)
const relevantTxs = serverTxs.filter(t => t.created_at > syncStart)

// Verify 3 unique transactions
const uniqueIds = new Set(relevantTxs.map(t => t.id))
assert.equal(uniqueIds.size, 3)

// Verify amounts
const totalAmount = relevantTxs.reduce((sum, t) => sum + t.total, 0)
assert.equal(totalAmount, expectedTotal)

// Verify items
const allItems = relevantTxs.flatMap(t => t.items)
assert.equal(allItems.length, expectedItemCount)

// Verify all synced
assert.ok(relevantTxs.every(t => t.synced_at))
```

---

## Edge Cases (10 Critical Tests)

### E1: Browser Crash During Transaction

**Setup**: Transaction in progress (item added, not completed)
**Trigger**: Close browser tab abruptly
**Expected**: State recoverable from IndexedDB
**Test**: Reopen browser, verify transaction state

---

### E2: Multiple Tabs (Same User)

**Setup**: POS open in 2 tabs
**Trigger**: Ring item in Tab A, go offline Tab B
**Expected**: Sync works, no conflicts
**Test**: Verify queue integrity across tabs

---

### E3: Concurrent Writes

**Setup**: User ringing items while sync happening
**Trigger**: Multiple transaction writes simultaneously
**Expected**: Queue handling, no deadlocks
**Test**: Verify transaction order preserved

---

### E4: Network Flakiness

**Setup**: Network on/off cycles
**Trigger**: 3 rapid online→offline→online cycles
**Expected**: No data loss, recovery automatic
**Test**: Verify pending count and sync state

---

### E5: IndexedDB Quota

**Setup**: Fill IndexedDB to 90% capacity
**Trigger**: Create new transaction
**Expected**: Cleanup triggered, transaction still works
**Test**: Verify old synced data deleted

---

### E6: Corrupted IndexedDB Entry

**Setup**: Manual database corruption
**Trigger**: Invalid transaction record
**Expected**: Skip corrupted, sync others
**Test**: Verify recovery, no crashes

---

### E7: Server Session Expired

**Setup**: Offline 24 hours, server session expired
**Trigger**: Restore network, sync
**Expected**: Fallback to re-auth
**Test**: Verify automatic re-login option

---

### E8: Large Queue (1000+ Transactions)

**Setup**: Massive transaction backlog
**Trigger**: Sync large queue
**Expected**: Memory efficient, no crash
**Test**: Monitor memory, verify all sync

---

### E9: Service Worker Failure

**Setup**: Service Worker registration fails
**Trigger**: Offline mode enabled
**Expected**: Graceful degradation
**Test**: Verify offline still works

---

### E10: Mobile Background/Resume

**Setup**: App backgrounded on mobile
**Trigger**: Sync in progress, app sent to background
**Expected**: Memory cleanup, resume on foreground
**Test**: Verify state preserved after background

---

## Data Requirements

### Test User 1
```json
{
  "username": "test_user_1",
  "password": "test_pass_123",
  "password_hash": "sha256(test_pass_123)",
  "user_id": 1001,
  "company": "test_company",
  "allowed_terminals": ["POS001"]
}
```

### Test Products (10)
```json
{
  "product_id": 101,
  "name": "Apple",
  "price": 5.00,
  "category_id": 1,
  "tax_id": 1
}
```

### Test Categories (5)
```json
{
  "category_id": 1,
  "name": "Fruits",
  "parent_id": null
}
```

### Test Payment Methods (3)
- Cash (code: cash)
- Card (code: card)
- Check (code: check)

---

## Success Criteria

**SCENARIO 1**: All 10 tests pass
- Login, cache, offline detection, UI, ringing, transaction, queue, network, sync, no duplicates

**SCENARIO 2**: All 10 tests pass
- No internet load, popup, credentials, correct/wrong, resume, timeout, cache, attempts, recovery

**SCENARIO 3**: All 10 tests pass
- Pending, restore, sync start, user TX, queue, complete, new TX sync, fail, recover, retry

**OVERALL**: 30/30 tests pass, no flakes, <45min runtime

---

## Known Limitations & Workarounds

| Issue | Limitation | Workaround |
|-------|-----------|-----------|
| Network simulation | Playwright offline not 100% realistic | Use proxy to throttle/block |
| Clock manipulation | Fake timers may affect browser APIs | Use real timeouts where needed |
| IndexedDB size | Browser quota varies by device | Use smaller test data |
| Service Worker | Cannot fully test SW in jsdom | Use real browser (Playwright) |

---

**Last Updated**: 2026-01-07
**Version**: 1.0.0
**Status**: Ready for Implementation
