# Task Breakdown: PDC POS Offline v2

**Option:** B (Stabilization + Testing)
**Target:** Fix critical bugs + 70% test coverage
**Estimate:** 15-20 tasks

---

## Phase 1: Critical Bug Fixes

### Task 1.1: Fix validatePin() Method Call
**Priority:** CRITICAL
**File:** `static/src/js/pos_offline_patch.js` (line ~439)

**Problem:**
```javascript
// Current (broken):
const authResult = await this.offlineAuth.validatePin(user.id, pin);
if (authResult.success) { ... }

// validatePin() returns boolean, not {success, error}
```

**Solution:**
```javascript
// Use authenticateOffline() which returns proper object
const authResult = await this.offlineAuth.authenticateOffline(user.login, pin);
if (authResult.success) { ... }
```

**Acceptance Criteria:**
- [ ] DOM login flow works correctly
- [ ] Returns proper session object on success
- [ ] Shows error message on failure

---

### Task 1.2: Consolidate hashPin() Implementation
**Priority:** CRITICAL
**Files:**
- `static/src/js/offline_auth.js`
- `static/src/js/offline_login_popup.js`

**Problem:** Same hashPin() implemented in both files.

**Solution:**
1. Keep implementation in `offline_auth.js`
2. Export as module function
3. Import in `offline_login_popup.js`

**Acceptance Criteria:**
- [ ] Single hashPin() implementation
- [ ] Both files use same function
- [ ] Unit test passes

---

### Task 1.3: Remove Session Timeout Logic
**Priority:** HIGH
**Files:**
- `static/src/js/offline_auth.js`
- `static/src/js/session_persistence.js`

**Problem:** Hardcoded 8-hour expiry conflicts with "no timeout" decision.

**Solution:**
1. Remove expiry check in `createOfflineSession()`
2. Remove `isValidSession()` time check
3. Session valid until server returns

**Acceptance Criteria:**
- [ ] No session expiry while offline
- [ ] Session persists across browser restarts
- [ ] Session invalidated only when server returns + logout

---

### Task 1.4: Remove Brute-Force Lockout
**Priority:** HIGH
**Files:**
- `static/src/js/offline_auth.js`
- `static/src/js/offline_login_popup.js`

**Problem:** Lockout logic exists but decision is "no lockout."

**Solution:**
1. Remove `MAX_FAILED_ATTEMPTS` constant
2. Remove `recordFailedAttempt()` method
3. Remove `isUserLockedOut()` method
4. Remove lockout state from IndexedDB
5. Update UI to remove attempts counter

**Acceptance Criteria:**
- [ ] No lockout after failed attempts
- [ ] UI doesn't show attempts remaining
- [ ] User can retry indefinitely

---

### Task 1.5: Remove loadOfflineData() Stub
**Priority:** MEDIUM
**File:** `static/src/js/pos_offline_patch.js`

**Problem:** Stub function with TODO comments, never called.

**Solution:** Remove the function entirely (Odoo native handles data caching).

**Acceptance Criteria:**
- [ ] Function removed
- [ ] No broken references
- [ ] Module loads without errors

---

## Phase 2: Code Cleanup

### Task 2.1: Persist syncErrors to IndexedDB
**Priority:** MEDIUM
**File:** `static/src/js/sync_manager.js`

**Problem:** `syncErrors` is in-memory, lost on page reload.

**Solution:**
1. Add `sync_errors` store to OfflineDB
2. Save errors with timestamp
3. Clear old errors (>7 days)

**Acceptance Criteria:**
- [ ] Errors persist across page reload
- [ ] Errors viewable for debugging
- [ ] Auto-cleanup of old errors

---

### Task 2.2: Scope Service Worker
**Priority:** LOW
**File:** `static/src/js/sw_register.js`

**Problem:** SW registered with global `/` scope.

**Solution:**
1. Change scope to `/pos/ui`
2. Or remove entirely (Odoo 19 has native SW)

**Acceptance Criteria:**
- [ ] No SW conflicts with other modules
- [ ] Asset caching still works

---

### Task 2.3: Update Config Field Usage
**Priority:** LOW
**File:** `models/pos_config.py`

**Problem:** `offline_max_attempts` field unused (lockout removed).

**Solution:** Remove unused fields from model.

**Acceptance Criteria:**
- [ ] Unused fields removed
- [ ] Views updated
- [ ] Migration handles existing data

---

## Phase 3: Test Coverage (Target: 70%+)

### Task 3.1: Offline Login Flow Tests
**Priority:** P1
**Type:** Integration (Playwright)
**File:** `tests/test_offline_e2e.spec.js`

**Test Cases:**
- [ ] T-1: Valid PIN login creates session
- [ ] T-2: Invalid PIN shows error, allows retry
- [ ] T-3: Empty PIN shows validation error
- [ ] T-4: Non-numeric PIN rejected

---

### Task 3.2: Session Restore Tests
**Priority:** P1
**Type:** Integration (Playwright)
**File:** `tests/test_offline_e2e.spec.js`

**Test Cases:**
- [ ] T-5: Browser close/reopen restores session
- [ ] T-6: Session valid indefinitely while offline
- [ ] T-7: Multiple browser tabs share session
- [ ] T-8: Clear IndexedDB requires re-login

---

### Task 3.3: Connection Detection Tests
**Priority:** P1
**Type:** Unit + Integration
**Files:**
- `tests/test_offline_auth.js` (unit)
- `tests/test_offline_e2e.spec.js` (integration)

**Test Cases:**
- [ ] T-9: Detect server unreachable (blocked requests)
- [ ] T-10: Detect server recovery
- [ ] T-11: Handle network flapping (debounce)
- [ ] T-12: Correct event emission

---

### Task 3.4: Sync Tests
**Priority:** P2
**Type:** Integration
**File:** `tests/test_offline_e2e.spec.js`

**Test Cases:**
- [ ] T-13: Orders sync when online
- [ ] T-14: Failed sync retries
- [ ] T-15: Sync errors logged
- [ ] T-16: "Back Online" notification shown

---

### Task 3.5: Edge Case Tests
**Priority:** P2
**Type:** Unit + Integration
**Files:** Multiple

**Test Cases:**
- [ ] T-17: Corrupted IndexedDB handled gracefully
- [ ] T-18: First-use offline shows error message
- [ ] T-19: Expired cache (stale products) detected
- [ ] T-20: Multiple rapid login attempts

---

### Task 3.6: Python Backend Tests
**Priority:** P1
**Type:** Unit
**File:** `tests/test_backend.py`

**Test Cases:**
- [ ] T-21: PIN hash generation correct
- [ ] T-22: PIN validation (4 digits only)
- [ ] T-23: PIN change updates hash
- [ ] T-24: RPC endpoints return correct data
- [ ] T-25: Rate limiting works

---

## Phase 4: Documentation

### Task 4.1: Update CLAUDE.md
**Priority:** MEDIUM
**File:** `CLAUDE.md`

**Updates:**
- [ ] Document v2 decisions
- [ ] Update architecture diagram
- [ ] Remove lockout references
- [ ] Add test running instructions

---

### Task 4.2: Create User README
**Priority:** LOW
**File:** `README.md`

**Content:**
- [ ] Installation instructions
- [ ] Configuration guide
- [ ] PIN setup steps
- [ ] Troubleshooting FAQ

---

## Task Summary

| Phase | Tasks | Priority |
|-------|-------|----------|
| 1. Critical Fixes | 5 | CRITICAL/HIGH |
| 2. Cleanup | 3 | MEDIUM/LOW |
| 3. Testing | 6 | P1/P2 |
| 4. Documentation | 2 | MEDIUM/LOW |
| **Total** | **16** | |

---

## Execution Order

```
Week 1: Critical Fixes
├── Task 1.1: validatePin() fix (CRITICAL)
├── Task 1.2: hashPin() consolidation (CRITICAL)
├── Task 1.3: Remove session timeout (HIGH)
├── Task 1.4: Remove lockout (HIGH)
└── Task 1.5: Remove loadOfflineData stub (MEDIUM)

Week 2: Testing P1
├── Task 3.1: Offline login tests
├── Task 3.2: Session restore tests
├── Task 3.3: Connection detection tests
└── Task 3.6: Python backend tests

Week 3: Testing P2 + Cleanup
├── Task 3.4: Sync tests
├── Task 3.5: Edge case tests
├── Task 2.1: Persist syncErrors
├── Task 2.2: Scope Service Worker
└── Task 2.3: Update config fields

Week 4: Documentation + Release
├── Task 4.1: Update CLAUDE.md
├── Task 4.2: Create README
└── Final testing + deployment
```

---

## Definition of Done

Each task is complete when:

1. [ ] Code changes implemented
2. [ ] Unit tests pass
3. [ ] Integration tests pass (if applicable)
4. [ ] No console errors
5. [ ] Code reviewed (self-review minimum)
6. [ ] Deployed to staging
7. [ ] Manual smoke test passes

---

## Release Checklist

Before v2.0.0 release:

- [ ] All Phase 1 tasks complete
- [ ] All P1 tests passing
- [ ] Test coverage > 70%
- [ ] No critical/high bugs open
- [ ] Documentation updated
- [ ] Staging tested for 24 hours
- [ ] Production deployment plan ready
