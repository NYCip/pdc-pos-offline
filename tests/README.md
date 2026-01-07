# PDC POS Offline - Complete Testing Framework

## Quick Start

### Installation
```bash
cd /home/epic/dev/pdc-pos-offline
npm install
```

### Run All Tests
```bash
# Run all tests (unit + integration + e2e)
npm run test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run E2E tests only (Playwright)
npm run test:e2e

# Run E2E tests in headed mode (visible browser)
npm run test:headed

# Run E2E tests with debugging
npm run test:debug
```

### Run Specific Scenario
```bash
# Scenario 1: Login → Offline → Resume
npx playwright test tests/e2e/scenario-1-login-offline-resume.spec.js

# Scenario 2: Offline Login
npx playwright test tests/e2e/scenario-2-offline-login.spec.js

# Scenario 3: Sync During Transaction
npx playwright test tests/e2e/scenario-3-sync-during-transaction.spec.js
```

---

## Test Structure

### File Organization
```
tests/
├── TESTING_FRAMEWORK.md          # Framework overview
├── TEST_MATRIX.md                # Detailed test matrix (30 tests)
├── README.md                      # This file
├── e2e/                           # Playwright E2E tests
│   ├── scenario-1-login-offline-resume.spec.js
│   ├── scenario-2-offline-login.spec.js
│   └── scenario-3-sync-during-transaction.spec.js
├── unit/                          # Jest unit tests (optional - in progress)
├── integration/                   # Jest integration tests (optional - in progress)
├── performance/                   # Performance/stress tests (optional)
├── helpers/
│   └── test-helpers.js            # Shared utilities and fixtures
├── fixtures/                      # Test data (optional)
│   ├── test-users.js
│   ├── test-transactions.js
│   └── test-products.js
└── playwright.config.js           # Playwright configuration
```

---

## Test Scenarios Overview

### SCENARIO 1: Login → Offline → Resume (10 Tests)
**Focus**: Complete user session flow from login through sync

1. **TC-1.1** - User login (online)
2. **TC-1.2** - Models cached after login
3. **TC-1.3** - Network goes offline
4. **TC-1.4** - UI switches to offline mode
5. **TC-1.5** - Ring items (offline)
6. **TC-1.6** - Complete transaction (offline)
7. **TC-1.7** - Multiple transactions queued
8. **TC-1.8** - Network restored
9. **TC-1.9** - Sync starts automatically
10. **TC-1.10** - All synced, no duplicates

**Duration**: ~5 minutes
**Priority**: P0 (Critical)
**File**: `tests/e2e/scenario-1-login-offline-resume.spec.js`

### SCENARIO 2: Offline Login (10 Tests)
**Focus**: Offline login with credential validation

1. **TC-2.1** - App loads without internet
2. **TC-2.2** - Offline login popup appears
3. **TC-2.3** - Enter credentials
4. **TC-2.4** - Correct credentials accepted
5. **TC-2.5** - Wrong credentials rejected
6. **TC-2.6** - Resume previous session
7. **TC-2.7** - Session timeout
8. **TC-2.8** - Cache expired handling
9. **TC-2.9** - Multiple login attempts
10. **TC-2.10** - Recovery after network restore

**Duration**: ~8 minutes
**Priority**: P0 (Critical)
**File**: `tests/e2e/scenario-2-offline-login.spec.js`

### SCENARIO 3: Sync During Transaction (10 Tests)
**Focus**: Sync behavior when user acts during sync

1. **TC-3.1** - Multiple pending transactions
2. **TC-3.2** - Network restored
3. **TC-3.3** - Sync starts automatically
4. **TC-3.4** - User creates transaction during sync
5. **TC-3.5** - Transaction queue order
6. **TC-3.6** - Sync completes original transactions
7. **TC-3.7** - New transaction syncs after
8. **TC-3.8** - Sync fails midway
9. **TC-3.9** - Partial sync recovery
10. **TC-3.10** - Retry without duplicates

**Duration**: ~10 minutes
**Priority**: P0 (Critical)
**File**: `tests/e2e/scenario-3-sync-during-transaction.spec.js`

---

## Test Helpers Reference

### Database Helpers
```javascript
import {
  clearOfflineDB,                    // Delete entire database
  getOfflineDBSize,                  // Get store counts
  getPendingTransactionCount,        // Count pending TXs
  getSyncedTransactionCount,         // Count synced TXs
  getPendingTransactions,            // Get all pending TXs
  getSyncedTransactions              // Get all synced TXs
} from './helpers/test-helpers.js';
```

### Browser Helpers
```javascript
import {
  simulateOffline,                   // Set offline mode
  simulateOnline,                    // Restore online
  clearAllStorage,                   // Clear cookies/storage
  waitForNetworkIdle,                // Wait for network
  waitForSyncCompletion,             // Wait for sync to finish
  loginUser,                         // Login helper
  ringItem,                          // Ring product
  completeTransaction,               // Complete transaction
  clearCart                          // Clear cart
} from './helpers/test-helpers.js';
```

### Fixtures
```javascript
import {
  TEST_USERS,                        // Test user accounts
  TEST_PRODUCTS,                     // Test product data
  TEST_CATEGORIES,                   // Test categories
  TEST_PAYMENT_METHODS,              // Payment methods
  TEST_TAXES                         // Tax rates
} from './helpers/test-helpers.js';
```

### Example Usage
```javascript
import { test, expect } from '@playwright/test';
import {
  loginUser,
  simulateOffline,
  ringItem,
  completeTransaction,
  getPendingTransactionCount
} from '../helpers/test-helpers.js';

test('Example test', async ({ page }) => {
  // Login
  await loginUser(page, 'test_user_1', 'test_pass_123');

  // Go offline
  await simulateOffline(page);

  // Ring item
  await ringItem(page, 'Apple');

  // Complete transaction
  await completeTransaction(page, 'cash');

  // Verify pending count
  const pending = await getPendingTransactionCount(page);
  expect(pending).toBe(1);
});
```

---

## Key Test Data

### Test Users
- **user1**: test_user_1 / test_pass_123 (userId: 1001)
- **user2**: test_user_2 / test_pass_456 (userId: 1002)

### Test Products (5)
- Apple: $5.00
- Banana: $3.50
- Orange: $4.00
- Water: $2.00
- Coffee: $4.50

### Payment Methods (3)
- Cash
- Card
- Check

---

## Configuration

### Playwright Configuration
Located in: `playwright.config.js`

Key settings:
- **browsers**: Chromium, Firefox, WebKit
- **timeout**: 30 seconds per test
- **retries**: 1 (on CI)
- **workers**: 3 (parallel)
- **video**: On failure only

### Running on Different Browsers
```bash
# Chromium only
npx playwright test --project=chromium

# Firefox only
npx playwright test --project=firefox

# WebKit only
npx playwright test --project=webkit

# All browsers
npx playwright test
```

---

## Expected Test Results

### Success Criteria
- **30/30 tests pass** (0 failures)
- **No flaky tests** (consistent results)
- **Total runtime**: ~45 minutes
- **Coverage**:
  - Statements: >80%
  - Branches: >75%
  - Functions: >80%

### Example Passing Output
```
SCENARIO 1: Login → Offline → Resume
  ✓ TC-1.1: User login (online) (2s)
  ✓ TC-1.2: Models cached (1s)
  ✓ TC-1.3: Network offline (1s)
  ✓ TC-1.4: UI offline mode (1s)
  ✓ TC-1.5: Ring items (2s)
  ✓ TC-1.6: Complete transaction (2s)
  ✓ TC-1.7: Multiple queued (5s)
  ✓ TC-1.8: Network restored (1s)
  ✓ TC-1.9: Sync starts (2s)
  ✓ TC-1.10: No duplicates (3s)

SCENARIO 2: Offline Login
  ✓ TC-2.1: Load no internet (1s)
  ✓ TC-2.2: Popup appears (1s)
  ✓ TC-2.3: Enter credentials (1s)
  ✓ TC-2.4: Correct creds (2s)
  ✓ TC-2.5: Wrong creds (2s)
  ✓ TC-2.6: Resume session (1s)
  ✓ TC-2.7: Timeout (35s) [SKIPPED]
  ✓ TC-2.8: Cache expired (2s)
  ✓ TC-2.9: Multiple attempts (5s)
  ✓ TC-2.10: Recover (4s)

SCENARIO 3: Sync During Transaction
  ✓ TC-3.1: Pending queue (5s)
  ✓ TC-3.2: Restore network (1s)
  ✓ TC-3.3: Sync starts (3s)
  ✓ TC-3.4: TX during sync (5s)
  ✓ TC-3.5: Queue order (5s)
  ✓ TC-3.6: Sync complete (8s)
  ✓ TC-3.7: New TX syncs (4s)
  ✓ TC-3.8: Sync fails (8s)
  ✓ TC-3.9: Partial recovery (8s)
  ✓ TC-3.10: Retry success (8s)

30 passed (45m 32s)
```

---

## Troubleshooting

### Common Issues

#### Issue: Tests timeout
**Solution**: Increase timeout in playwright.config.js
```javascript
use: {
  actionTimeout: 60000,  // Increase from 30000
  navigationTimeout: 60000
}
```

#### Issue: IndexedDB quota exceeded
**Solution**: Tests include cleanup, but if stuck:
```javascript
// In test beforeEach
await clearOfflineDB();
```

#### Issue: Service Worker cache stale
**Solution**: Clear SW before tests
```javascript
// In test setup
const registrations = await navigator.serviceWorker.getRegistrations();
await Promise.all(registrations.map(r => r.unregister()));
```

#### Issue: Flaky network simulation
**Solution**: Use real network throttling instead of offline mode
```javascript
// In test
await page.route('**/*', async (route) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  route.continue();
});
```

#### Issue: Tests fail on CI but pass locally
**Solution**: Run headless on CI
```bash
# CI command
CI=true npm run test:e2e
```

---

## Edge Cases Covered

### Browser/Device
- [ ] Browser crash during transaction
- [ ] Multiple tabs/windows
- [ ] Concurrent writes
- [ ] Network flakiness
- [ ] Mobile background

### Data/Storage
- [ ] IndexedDB quota exceeded
- [ ] Corrupted database entry
- [ ] Cache expiration
- [ ] Large queue (1000+ TXs)
- [ ] Session timeout

---

## Performance Baselines

These are expected performance metrics:

| Operation | Baseline | Acceptable |
|-----------|----------|-----------|
| App load (online) | <2000ms | <3000ms |
| App load (offline) | <500ms | <1000ms |
| Login | <3000ms | <5000ms |
| Ring item | <200ms | <500ms |
| Complete TX | <500ms | <1000ms |
| Sync 10 TXs | <5000ms | <10000ms |

---

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Offline POS Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results
          path: test-results/
```

---

## Debugging Tests

### Run Single Test
```bash
npx playwright test tests/e2e/scenario-1-login-offline-resume.spec.js -g "TC-1.1"
```

### Debug Mode
```bash
npx playwright test --debug
```

### View Trace
```bash
npx playwright show-trace trace.zip
```

### View HTML Report
```bash
npx playwright show-report
```

---

## Contributing

### Add New Test
1. Create test in appropriate scenario file
2. Use helpers from `test-helpers.js`
3. Follow naming convention: `TC-X.Y`
4. Add to TEST_MATRIX.md
5. Run tests locally before PR

### Add New Helper
1. Add to `tests/helpers/test-helpers.js`
2. Export from module
3. Add usage example
4. Document in README

---

## References

- **Framework Docs**: `TESTING_FRAMEWORK.md`
- **Test Matrix**: `TEST_MATRIX.md`
- **Playwright Docs**: https://playwright.dev
- **Source Code**: `/static/src/js/offline_*.js`
- **Offline Module**: `/static/src/js/pos_offline_patch.js`

---

## Support

For issues or questions:
1. Check TEST_MATRIX.md for detailed test descriptions
2. Check TESTING_FRAMEWORK.md for architecture
3. Review test file for example usage
4. Debug with `--debug` flag
5. Check Playwright docs for advanced usage

---

**Last Updated**: 2026-01-07
**Framework Version**: 1.0.0
**Status**: Ready for Implementation & Execution
