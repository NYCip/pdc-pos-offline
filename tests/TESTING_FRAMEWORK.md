# PDC POS Offline - Complete Testing Framework

## Overview

This testing framework covers 3 critical scenarios with comprehensive test coverage across offline POS functionality. The framework includes 30+ test cases covering edge cases, failure scenarios, and synchronization logic.

## Test Architecture

```
tests/
├── unit/                              # Unit tests (Jest)
│   ├── offline-db.unit.test.js        # IndexedDB operations
│   ├── connection-monitor.unit.test.js # Network detection
│   ├── sync-manager.unit.test.js      # Sync orchestration
│   └── offline-auth.unit.test.js      # Offline authentication
├── integration/                       # Integration tests (Jest)
│   ├── auth-sync.integration.test.js  # Auth + Sync interaction
│   ├── transactions.integration.test.js # Transaction handling
│   └── cache-persistence.integration.test.js
├── e2e/                              # E2E tests (Playwright)
│   ├── scenario-1-login-offline-resume.spec.js
│   ├── scenario-2-offline-login.spec.js
│   ├── scenario-3-sync-during-transaction.spec.js
│   └── edge-cases.spec.js
├── performance/                      # Performance tests
│   ├── load-time.perf.test.js
│   ├── sync-performance.perf.test.js
│   └── stress-tests.perf.test.js
├── fixtures/                         # Test data
│   ├── test-users.js
│   ├── test-transactions.js
│   └── test-products.js
├── helpers/                          # Test utilities
│   ├── browser-helpers.js            # Playwright utilities
│   ├── db-helpers.js                 # IndexedDB utilities
│   └── sync-helpers.js               # Sync testing helpers
└── TESTING_FRAMEWORK.md             # This file
```

## Critical Scenarios

### SCENARIO 1: Login → Offline → Resume (Complete Session)

**Objective**: Verify complete user session persistence and sync

#### Test Cases
1. **TC-1.1**: User logs in successfully (online)
2. **TC-1.2**: Models fully cached after login
3. **TC-1.3**: Network goes offline
4. **TC-1.4**: UI switches to offline mode
5. **TC-1.5**: User can ring items (single item)
6. **TC-1.6**: User can complete transaction offline
7. **TC-1.7**: Multiple transactions queued
8. **TC-1.8**: Network restored
9. **TC-1.9**: Sync begins automatically
10. **TC-1.10**: All transactions synced without duplicates

#### Dependencies
- TC-1.1 → TC-1.2 (Login must succeed first)
- TC-1.2 → TC-1.3 (Cache needed before going offline)
- TC-1.3 → TC-1.4 (Offline detection must trigger UI switch)
- TC-1.4 → TC-1.5 (Offline mode must work)
- TC-1.5 → TC-1.6 (Item ringing before transaction)
- TC-1.8 → TC-1.9 (Network must be restored for sync)

---

### SCENARIO 2: Before Login → Offline Mode

**Objective**: Verify offline login fallback and session recovery

#### Test Cases
1. **TC-2.1**: App loads but no internet
2. **TC-2.2**: Offline login popup appears
3. **TC-2.3**: Can enter credentials
4. **TC-2.4**: Correct credentials match cache
5. **TC-2.5**: Wrong credentials rejected
6. **TC-2.6**: Previous session resumable
7. **TC-2.7**: Session timeout in offline mode
8. **TC-2.8**: Cache expired fallback behavior
9. **TC-2.9**: Multiple offline login attempts
10. **TC-2.10**: Recovery after network restored

#### Dependencies
- TC-2.1 → TC-2.2 (No internet must trigger popup)
- TC-2.3 → TC-2.4 (Must validate credentials)
- TC-2.6 → TC-2.7 (Session must exist for timeout)

---

### SCENARIO 3: Sync During Transaction

**Objective**: Verify sync integrity when user acts during sync

#### Test Cases
1. **TC-3.1**: Multiple transactions pending
2. **TC-3.2**: Network restored
3. **TC-3.3**: Sync starts
4. **TC-3.4**: User initiates NEW transaction during sync
5. **TC-3.5**: New transaction queued (not synced yet)
6. **TC-3.6**: Sync completes
7. **TC-3.7**: New transaction syncs
8. **TC-3.8**: Sync fails midway
9. **TC-3.9**: Partial sync state recovered
10. **TC-3.10**: Retry succeeds without duplicates

#### Dependencies
- TC-3.1 → TC-3.2 (Pending transactions required)
- TC-3.2 → TC-3.3 (Network must restore for sync)
- TC-3.3 → TC-3.4 (Sync must be in progress)
- TC-3.6 → TC-3.7 (New tx syncs after sync complete)
- TC-3.8 → TC-3.9 (Failure must recover)

---

## Test Matrix (30 Test Cases)

| # | Scenario | Test Case | Focus | Type | Priority |
|---|----------|-----------|-------|------|----------|
| 1 | S1 | TC-1.1 | Login success | Unit | P0 |
| 2 | S1 | TC-1.2 | Model cache | Unit | P0 |
| 3 | S1 | TC-1.3 | Offline detection | Unit | P0 |
| 4 | S1 | TC-1.4 | UI state switch | E2E | P0 |
| 5 | S1 | TC-1.5 | Ring items offline | E2E | P0 |
| 6 | S1 | TC-1.6 | Complete transaction | E2E | P0 |
| 7 | S1 | TC-1.7 | Queue multiple | Integration | P0 |
| 8 | S1 | TC-1.8 | Restore connectivity | Unit | P0 |
| 9 | S1 | TC-1.9 | Sync starts | Unit | P0 |
| 10 | S1 | TC-1.10 | No duplicates | Integration | P0 |
| 11 | S2 | TC-2.1 | No internet load | E2E | P0 |
| 12 | S2 | TC-2.2 | Offline popup | E2E | P0 |
| 13 | S2 | TC-2.3 | Credentials entry | E2E | P1 |
| 14 | S2 | TC-2.4 | Correct credentials | Unit | P0 |
| 15 | S2 | TC-2.5 | Wrong credentials | Unit | P0 |
| 16 | S2 | TC-2.6 | Session resume | Integration | P1 |
| 17 | S2 | TC-2.7 | Session timeout | Unit | P1 |
| 18 | S2 | TC-2.8 | Expired cache | Unit | P1 |
| 19 | S2 | TC-2.9 | Multiple attempts | E2E | P2 |
| 20 | S2 | TC-2.10 | Network recover | Integration | P1 |
| 21 | S3 | TC-3.1 | Pending queue | Unit | P0 |
| 22 | S3 | TC-3.2 | Connectivity restore | Unit | P0 |
| 23 | S3 | TC-3.3 | Sync start | Unit | P0 |
| 24 | S3 | TC-3.4 | User TX during sync | E2E | P0 |
| 25 | S3 | TC-3.5 | TX queue behavior | Integration | P0 |
| 26 | S3 | TC-3.6 | Sync complete | Unit | P0 |
| 27 | S3 | TC-3.7 | New TX syncs | Integration | P0 |
| 28 | S3 | TC-3.8 | Sync fails | Unit | P0 |
| 29 | S3 | TC-3.9 | Partial recovery | Integration | P0 |
| 30 | S3 | TC-3.10 | Retry no duplicates | Integration | P0 |

---

## Edge Cases (10 Critical)

### E1: Browser Crash/Page Reload
- Transaction in progress when browser crashes
- Verify state recovery from IndexedDB
- No duplicate transactions after reload

### E2: Multiple Tabs/Windows
- Same user in 2+ tabs
- One goes offline, one stays online
- Verify no race conditions in sync

### E3: Concurrent Writes
- User ringing items while sync happens
- Database transaction queue handling
- Memory limits on transaction queue

### E4: Network Interruption (Flaky)
- Network goes offline during sync
- Server response timeout
- Partial response received
- Connection reestablished

### E5: Quota Exceeded
- IndexedDB quota limit hit
- Cleanup behavior triggered
- Can still ring items after cleanup

### E6: Corrupted IndexedDB
- Detect corrupted transaction record
- Skip corrupted, sync others
- Recovery mechanism

### E7: Session Expired (Server-side)
- User offline, cache valid
- Network restored
- Session expired on server
- Fallback behavior

### E8: Large Transaction Queue
- 1000+ pending transactions
- Memory impact
- Sync queue processing order

### E9: Service Worker Issues
- SW registration fails
- Offline functionality degrades gracefully
- No crashes

### E10: Mobile Background/Resume
- App backgrounded while syncing
- Page visibility change
- Memory cleanup triggered
- Sync resumes on foreground

---

## Setup and Teardown

### Pre-Test Setup (Each Test)

```javascript
// 1. Clear IndexedDB
await clearOfflineDB()

// 2. Clear LocalStorage/SessionStorage
localStorage.clear()
sessionStorage.clear()

// 3. Reset connection monitor state
connectionMonitor.reset()

// 4. Load test user credentials
const testUser = await loadFixture('test-user-1')

// 5. Seed initial data if needed
await seedTestDatabase(testUser)
```

### Post-Test Cleanup (Each Test)

```javascript
// 1. Stop all timers/intervals
clearAllIntervals()

// 2. Stop connection monitor
connectionMonitor.stop()

// 3. Stop sync manager
syncManager.stopSync()

// 4. Clear service worker registration
if (navigator.serviceWorker) {
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map(r => r.unregister()))
}

// 5. Clear database
await clearOfflineDB()

// 6. Close browser context (Playwright)
await context.close()
```

### Database Setup Helpers

```javascript
// Load fixture with credentials
async function loadFixture(fixtureName) {
  return fixtures[fixtureName]
}

// Seed initial data
async function seedTestDatabase(user) {
  await offlineDB.saveUserSession(user)
  await offlineDB.saveModels(user.models)
  await offlineDB.saveProducts(user.products)
}

// Verify no data
async function verifyEmptyDatabase() {
  const hasData = await offlineDB.hasPersistedData()
  expect(hasData).toBe(false)
}
```

---

## Performance Baselines

### Load Times
- App load (online): <2000ms
- App load (offline, cached): <500ms
- Login (online): <3000ms
- Login (offline): <1000ms

### Transaction Processing
- Ring single item: <200ms
- Complete transaction: <500ms
- Queue transaction (offline): <100ms

### Sync Operations
- Sync 10 transactions: <5000ms
- Sync 100 transactions: <30000ms
- Sync rate: 5-10 transactions/second

### Memory Usage
- App baseline: <50MB
- Per transaction: <1MB
- Max IndexedDB: 50MB

---

## Critical Verification Points

### SCENARIO 1 Verification
- [ ] Login successful (online)
- [ ] All models cached to IndexedDB
- [ ] Offline detection fires correctly
- [ ] UI shows "offline" indicator
- [ ] Can ring items without network
- [ ] Transaction creation works
- [ ] Multiple transactions persist
- [ ] Network restoration detected
- [ ] Sync starts automatically
- [ ] All transactions sync
- [ ] No duplicate transactions
- [ ] No data loss
- [ ] Transaction IDs preserved
- [ ] Payment methods persisted
- [ ] UI responsive throughout

### SCENARIO 2 Verification
- [ ] App loads without internet
- [ ] Offline login popup shown
- [ ] Credentials input functional
- [ ] Credentials validated against cache
- [ ] Wrong credentials rejected
- [ ] Previous session detected
- [ ] Session resumable
- [ ] Session timeout enforced
- [ ] Cache expiration checked
- [ ] Fallback behavior works
- [ ] Multiple attempts handled
- [ ] Recovery after network works

### SCENARIO 3 Verification
- [ ] Multiple pending transactions exist
- [ ] Network connectivity restored
- [ ] Sync begins
- [ ] New transaction queued
- [ ] User can interact during sync
- [ ] Sync completes
- [ ] New transaction syncs
- [ ] Partial sync detected
- [ ] Recovery mechanism works
- [ ] Retry succeeds
- [ ] No duplicates created
- [ ] Transaction order preserved

---

## Test Execution Order

1. **Phase 1**: Unit Tests (Fast, isolated)
   - OfflineDB operations
   - ConnectionMonitor logic
   - SyncManager orchestration
   - Offline Auth

2. **Phase 2**: Integration Tests (Moderate, dependencies)
   - Auth + Sync interaction
   - Transaction lifecycle
   - Cache persistence

3. **Phase 3**: E2E Tests (Slow, full system)
   - Scenario 1 (Login → Offline → Resume)
   - Scenario 2 (Offline Login)
   - Scenario 3 (Sync During Transaction)
   - Edge cases

4. **Phase 4**: Performance Tests (Optional)
   - Load time benchmarks
   - Sync performance
   - Stress tests

---

## Reporting

### Test Report Structure
- Total tests run: X
- Passed: X (X%)
- Failed: X
- Skipped: X
- Duration: X seconds

### Failure Report
- Test name
- Error message
- Stack trace
- Screenshot (E2E)
- Console logs
- Network requests
- IndexedDB state

### Coverage Report
- Line coverage: X%
- Branch coverage: X%
- Function coverage: X%
- Uncovered lines: [list]

---

## Continuous Integration

### GitHub Actions Workflow
```yaml
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
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e
```

### Pre-commit Hook
```bash
#!/bin/bash
npm run test:unit
npm run test:integration
npx playwright test --ignore='**/performance'
```

---

## Troubleshooting

### Common Issues

**Issue**: IndexedDB quota exceeded
**Solution**: Clear old data, run cleanup before test

**Issue**: Sync timeout
**Solution**: Increase timeout for slow networks, mock server

**Issue**: Service Worker cache stale
**Solution**: Clear all caches, unregister SW, reload

**Issue**: Playwright timeout
**Solution**: Increase timeout, add waitForLoadState

**Issue**: Race condition in sync
**Solution**: Use locks, await completion before assertion

---

## References

- ConnectionMonitor: `/static/src/js/connection_monitor.js`
- OfflineDB: `/static/src/js/offline_db.js`
- SyncManager: `/static/src/js/sync_manager.js`
- Session Persistence: `/static/src/js/session_persistence.js`
- Offline Auth: `/static/src/js/offline_auth.js`

---

**Last Updated**: 2026-01-07
**Framework Version**: 1.0.0
**Status**: Ready for implementation
