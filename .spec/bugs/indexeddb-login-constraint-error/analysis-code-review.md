# IndexedDB Login Constraint Error - Code Review & Analysis

**Document**: Comprehensive Code-Level Analysis
**Date**: 2026-01-07
**Status**: Initial Analysis
**Bug ID**: indexeddb-login-constraint-error
**Wave**: 32 (IndexedDB Transaction Abort Resolution)

---

## Executive Summary

This document provides a detailed code-level analysis of the IndexedDB `ConstraintError` on the 'login' unique index that occurs during offline user synchronization in the `pdc-pos-offline` module.

**Key Findings**:
1. **Primary Root Cause**: Race condition in `saveUser()` method between check-and-put operations
2. **Secondary Issue**: Wave 32 retry logic explicitly excludes `ConstraintError` (design choice, possibly incorrect)
3. **Tertiary Issue**: Incomplete error handling in `sync_manager.js` masks the real failure
4. **Risk Assessment**: Medium severity, but affects reliability metrics and offline mode integrity
5. **Wave 32 Regression?**: Technically no (retry logic was designed to skip ConstraintError), but Wave 32 exposed the underlying bug by making other operations more reliable

---

## SECTION 1: `saveUser()` Implementation Analysis

### Location
**File**: `/home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js`
**Lines**: 496-527

### Code Review

```javascript
async saveUser(userData) {
    return this._executeWithRetry(async () => {
        const tx = this.getNewTransaction(['users'], 'readwrite');
        const store = tx.objectStore('users');

        // === ANALYSIS POINT 1: Existing user check (lines 501-507) ===
        const loginIndex = store.index('login');
        const existingUser = await new Promise((resolve, reject) => {
            const request = loginIndex.get(userData.login);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const data = {
            ...userData,
            cached_at: new Date().toISOString()
        };

        // === ANALYSIS POINT 2: ID overwrite logic (lines 514-518) ===
        // If user exists with same login but different id, update the existing record
        if (existingUser && existingUser.id !== userData.id) {
            console.warn(`[PDC-Offline] User with login '${userData.login}' already exists (id: ${existingUser.id}), updating instead of inserting`);
            data.id = existingUser.id; // Use existing id to avoid constraint violation
        }

        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            tx.onabort = () => reject(new Error('Transaction aborted'));
        });
    }, 'saveUser');
}
```

### Code-Level Issues Identified

#### Issue 1.1: Race Condition Between Check and Put

**Problem**: The check for existing user (line 503-507) and the subsequent put operation (line 521) happen in the same transaction, but there's a critical gap in the logic.

**Scenario**:
```
Time  | Operation              | Database State
------|------------------------|---------------------------
T0    | Read loginIndex        | {id: 1, login: 'admin'}
T1    | Check complete         | User 'admin' exists with id=1
T2    | data = {...userData}   | userData.id = 1
T3    | Condition check        | userData.id !== existingUser.id?
      |                        | (1 !== 1) = FALSE
T4    | Skip ID override       | data.id remains as userData.id (1)
T5    | put(data) called       | Attempt to insert {id: 1, login: 'admin', ...}
T6    | ConstraintError!       | Another record with login='admin' exists!
```

**Critical Flaw in Logic**:
The condition `if (existingUser && existingUser.id !== userData.id)` is backwards for the typical use case:
- If `userData.id === existingUser.id`: Should UPDATE (use same ID) ✓ Correct
- If `userData.id !== existingUser.id`: Should MERGE or WARN (use existing ID) ✓ Correct in code
- **But**: What if `userData.id === existingUser.id` but a DIFFERENT record also has that login?

**The Real Issue**:
```javascript
// Current logic:
if (existingUser && existingUser.id !== userData.id) {
    data.id = existingUser.id; // Only change ID if DIFFERENT
}
// This means: if IDs match, we proceed with put() using the same ID
// But put() checks the unique constraint on 'login'
// If another record exists with same login, constraint violation occurs!
```

#### Issue 1.2: Missing Null/Undefined Check

**Problem**: The code doesn't validate that `userData.login` is actually a non-null, non-undefined string.

```javascript
// Lines 503-507: loginIndex.get(userData.login)
// What if userData.login is:
// - null → Index.get(null) may behave unexpectedly
// - undefined → Index.get(undefined) may not find records properly
// - empty string → Could match records with empty login
// - whitespace → No trimming before comparison
```

**IndexedDB Behavior with Null/Undefined**:
- `get(null)` on a unique index can fail silently or return unexpected results
- `get(undefined)` similar issues
- Different browsers may handle this differently
- Creates security/data integrity risk

#### Issue 1.3: Compound Key Not Considered

**Problem**: The code only checks the 'login' field for uniqueness, but the real uniqueness constraint might need to include other fields.

```javascript
// Current index (line 250):
userStore.createIndex('login', 'login', { unique: true });

// Question: Is 'login' unique globally or per company/organization?
// In multi-company Odoo deployments:
// - User 'admin' in Company A
// - User 'admin' in Company B (different user!)
// - Both have login='admin', different IDs
// - IndexedDB unique constraint would FAIL because it only checks login

// Potential solution would require:
// userStore.createIndex('login_company', ['login', 'company_id'], { unique: true });
// But this is MORE COMPLEX and changes schema
```

---

## SECTION 2: Index Definition Analysis

### Location
**File**: `/home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js`
**Lines**: 247-251

### Code Review

```javascript
// Users store - for offline PIN authentication
if (!db.objectStoreNames.contains('users')) {
    const userStore = db.createObjectStore('users', { keyPath: 'id' });
    userStore.createIndex('login', 'login', { unique: true });
}
```

### Index Analysis

#### Issue 2.1: Overly Strict Uniqueness Constraint

**Problem**: The `unique: true` constraint on a simple 'login' field is too restrictive for offline caching.

**Why This is Problematic**:
1. **Offline Context**: Users might update their login in backend while offline-cached data exists
2. **Multi-device**: Same user might be cached on multiple devices with slightly different data
3. **Sync Scenarios**:
   - User A logs in, cached with login='alice', id=1
   - Backend changes login to 'alice_new', but local cache still has 'alice'
   - Next sync brings new record with login='alice_new', id=1
   - Now we try to update the existing user with login='alice_new'
   - But the PUT operation sees a conflict...

Actually, let me reconsider: The issue might be simpler:

**More Likely Scenario**:
```javascript
// Time T1: User admin (id=1, login='admin') cached
// IndexedDB: {id: 1, login: 'admin'}

// Time T2: Sync runs, tries to save same user again
// saveUser({id: 1, login: 'admin', ...other_fields})
//
// Step 1: Check if user with login='admin' exists
//   Result: YES (just cached above)
//   existingUser = {id: 1, login: 'admin'}
//
// Step 2: Check if existingUser.id !== userData.id
//   Check: 1 !== 1?
//   Result: FALSE → DO NOT override data.id
//   data.id remains = 1
//
// Step 3: Try to PUT {id: 1, login: 'admin', ...}
//   put() operation creates a duplicate check
//   IndexedDB sees: "login='admin' already exists (from Step 1 check)"
//   Throws ConstraintError!
```

**The Root Cause is NOW CLEAR**:
- The index lookup in line 503 finds the record
- The code doesn't DELETE the old record before inserting
- The put() operation tries to insert a new record with duplicate key
- IndexedDB's unique constraint fires

#### Issue 2.2: No Null Values in Index

**Current Definition**:
```javascript
userStore.createIndex('login', 'login', { unique: true });
// Does NOT specify: { unique: true, multiEntry: false }
```

**Problem**: If multiple users have `login: null` or `login: undefined`, the unique constraint fails silently on the first one.

**IndexedDB Spec**:
- Null/undefined values in unique indexes can cause issues
- Different implementations handle this differently
- Best practice: Don't allow nulls in unique indexes, or handle separately

---

## SECTION 3: Retry Logic Analysis

### Location
**File**: `/home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js`
**Lines**: 351-386

### Code Review

```javascript
/**
 * Execute a database operation with automatic retry on abort
 * Wave 32 Fix: Retry failed transactions with exponential backoff
 * @param {Function} operation - Async function that returns a Promise
 * @param {string} operationName - Name for logging
 * @returns {Promise} Result of the operation
 */
async _executeWithRetry(operation, operationName = 'operation') {
    let lastError;

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            // === ANALYSIS POINT: Error classification (lines 361-363) ===
            // Only retry on abort or quota errors
            const isAbortable = error.name === 'AbortError' ||
                              error.message?.includes('aborted') ||
                              error.name === 'QuotaExceededError';

            if (!isAbortable) {
                throw error; // Don't retry other errors
            }

            if (attempt < MAX_RETRY_ATTEMPTS - 1) {
                const delay = RETRY_DELAYS[attempt];
                console.warn(
                    `[PDC-Offline] ${operationName} attempt ${attempt + 1} failed (${error.message}), ` +
                    `retrying in ${delay}ms...`
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(
                    `[PDC-Offline] ${operationName} failed after ${MAX_RETRY_ATTEMPTS} attempts:`,
                    lastError
                );
            }
        }
    }

    throw lastError;
}
```

### Retry Logic Analysis

#### Issue 3.1: ConstraintError Explicitly Excluded

**Problem**: The retry logic only handles `AbortError` and `QuotaExceededError`, but NOT `ConstraintError`.

**Current Error Handling**:
```javascript
const isAbortable = error.name === 'AbortError' ||
                  error.message?.includes('aborted') ||
                  error.name === 'QuotaExceededError';

// ConstraintError.name === 'ConstraintError' (NOT in list!)
// Result: Falls through to throw immediately
```

**Critical Question**: Is this intentional or a bug?

**Analysis**:
- **If Intentional**: Rationale would be "ConstraintError won't resolve on retry"
  - Valid point: Retrying same operation won't fix uniqueness violation
  - But then it should be HANDLED specially, not just thrown

- **If Unintentional**: Oversight during Wave 32 development
  - Wave 32 focused on AbortError from page visibility changes
  - ConstraintError is a different category of error
  - Should have been handled separately

**Verdict**: **DESIGN FLAW**
- The error handling is incomplete
- ConstraintError should either:
  1. Be handled with specific logic (check-and-update), OR
  2. Be logged more gracefully with context, OR
  3. Be retried with a DIFFERENT operation (delete old + insert new)

#### Issue 3.2: Error Message Parsing is Fragile

**Problem**: Checking `error.message?.includes('aborted')` is unreliable.

```javascript
// What messages might contain 'aborted'?
// 1. 'Transaction aborted' (expected)
// 2. 'Error: aborted' (maybe)
// 3. 'User aborted operation' (catches too much)
// 4. 'Request aborted by other transaction' (might not include 'aborted')

// Better approach:
const isAbortable = error.name === 'AbortError' ||
                   error.name === 'InvalidStateError' ||
                   error.name === 'QuotaExceededError';
// Use error.name instead of message parsing
```

#### Issue 3.3: No Handling for Other Transient Errors

**Problem**: IndexedDB can throw other transient errors that should be retried:

```javascript
// Errors that SHOULD be retried but aren't:
// - InvalidStateError: Database state changed
// - NetworkError: Connection issue (unlikely but possible with sync)
// - UnknownError: Temporary database issue

// Current implementation only catches:
// - AbortError ✓
// - QuotaExceededError ✓
// - But misses other transient errors ✗
```

---

## SECTION 4: Sync Manager Error Handling Analysis

### Location
**File**: `/home/epic/dev/pdc-pos-offline/static/src/js/sync_manager.js`
**Lines**: 229-248

### Code Review

```javascript
async updateCachedData() {
    // Update critical cached data if online
    try {
        // Update user data
        const users = await this.pos.env.services.orm.searchRead(
            'res.users',
            [['id', 'in', this.pos.user_ids || [this.pos.user.id]]],
            ['id', 'name', 'login', 'pos_offline_pin_hash']
        );

        // === ANALYSIS POINT: Error is caught but not handled (lines 239-241) ===
        for (const user of users) {
            await offlineDB.saveUser(user);
        }

        // Update config data
        await offlineDB.saveConfig('last_sync', new Date().toISOString());

    } catch (error) {
        // === ANALYSIS POINT: Incomplete error handling (lines 246-247) ===
        console.error('Failed to update cached data:', error);
        // NO RETRY, NO RECOVERY, NO GRACEFUL DEGRADATION
    }
}
```

### Error Handling Analysis

#### Issue 4.1: Silent Failure in Sync

**Problem**: When `saveUser()` throws `ConstraintError`, it's caught but only logged.

```javascript
// What happens:
try {
    for (const user of users) {
        await offlineDB.saveUser(user);  // ← Throws ConstraintError
    }
} catch (error) {
    console.error('Failed to update cached data:', error);
    // Execution continues
    // Sync is marked as "completed successfully" (line 105 in syncAll)
}

// Result:
// - User data NOT cached (error prevented save)
// - Sync marked as SUCCESS
// - Offline mode uses stale user data
// - No indication to POS that caching failed
```

#### Issue 4.2: Loop Doesn't Continue on Error

**Problem**: The loop tries to save multiple users, but if ANY user fails, the whole sync fails.

```javascript
// Current code:
for (const user of users) {
    await offlineDB.saveUser(user);  // If this throws, loop stops
}

// Better approach:
for (const user of users) {
    try {
        await offlineDB.saveUser(user);
    } catch (error) {
        console.error(`[PDC-Offline] Failed to cache user ${user.id}:`, error);
        // Continue with next user
    }
}
```

#### Issue 4.3: No Retry Strategy

**Problem**: Unlike other sync phases, `updateCachedData()` doesn't retry on failure.

```javascript
// Other phases (lines 81-100):
try {
    await phase.fn();
    syncResults.success.push(phase.name);
} catch (error) {
    console.error(`[PDC-Offline] Sync phase ${phase.name} failed:`, error);
    syncResults.failed.push({ phase: phase.name, error: error.message });
    // Error logged but phase marked as FAILED
}

// Result: Sync still completes, but FAILURE is tracked

// But updateCachedData happens INSIDE syncAll, so:
try {
    await this.updateCachedData();  // ← Fails but only logs to console
    // No tracking of failure!
} catch (error) {
    // Only console.error, no sync result tracking
}
```

---

## SECTION 5: Wave 32 Regression Analysis

### Context
Wave 32 commit: `c73dab0` - "IndexedDB Transaction Abort Resolution (PRODUCTION)"

### Claim Review

**Wave 32 Claims**:
- Wrapped 58 database methods with exponential backoff retry logic
- Added transaction abort event handlers
- Implemented smart error discrimination
- Claimed 95%+ success rate for concurrent operations

### Is This a Wave 32 Regression?

**Answer**: Partially YES, but with nuance.

#### Regression Type 1: Design Oversight

**How Wave 32 Introduced the Bug**:
1. Wave 32 focused on `AbortError` (from page visibility changes)
2. Added `_executeWithRetry()` to wrap all database operations
3. But retry logic explicitly excludes `ConstraintError`
4. This was probably intentional (no point retrying constraint violation)
5. **BUT**: No alternative handling was provided for `ConstraintError`
6. **Result**: ConstraintError is now thrown immediately without any recovery attempt

**Timeline**:
- **Before Wave 32**: `saveUser()` didn't have retry logic, but probably didn't get heavily stressed
- **After Wave 32**: `saveUser()` wrapped in retry, but retry explicitly skips ConstraintError
- **Effect**: ConstraintError is now more visible/fatal because it's NOT handled by retry

#### Regression Type 2: Exposed Existing Bug

**More Accurate Assessment**:
The underlying bug (race condition in `saveUser()`) existed BEFORE Wave 32.
Wave 32 didn't CREATE the bug, but:
1. Made other operations more reliable (reducing competing errors)
2. Made ConstraintError more likely to occur (because other errors are fixed)
3. By explicitly NOT retrying ConstraintError, Wave 32 exposed the bug as a standalone issue

**Verdict**: Wave 32 is **NOT technically a regression** (didn't break working code), but it **exposed a pre-existing bug** that should have been fixed.

---

## SECTION 6: Root Cause Determination

### Primary Root Cause: Race Condition in saveUser()

**The Exact Problem**:

```javascript
// Step 1: Get existing user
const existingUser = await loginIndex.get(userData.login);
// Result: {id: 1, login: 'admin'} (found in index)

// Step 2: Check if IDs are different
if (existingUser && existingUser.id !== userData.id) {
    // Check: 1 !== 1? FALSE
    // No ID override
}

// Step 3: Try to PUT
const request = store.put(data);  // data.id = 1, data.login = 'admin'
// Problem: IndexedDB now checks unique constraint on 'login'
// It finds the EXISTING record with login='admin'
// Throws ConstraintError!
```

**Why This Happens**:
- IndexedDB's `put()` operation is not truly atomic with the index check
- The existing record is FOUND (and locked) during the check
- But when `put()` is called, the index constraint is re-evaluated
- The index sees TWO records with login='admin' (the old one + the new one being inserted)
- Constraint violation!

**Correct Implementation Would Be**:
```javascript
// Option A: Always use existing ID if login matches
const existingUser = await loginIndex.get(userData.login);
if (existingUser) {
    data.id = existingUser.id;  // Always use existing ID
}
// Then put() works because it's updating the same record

// Option B: Delete old, then insert new
if (existingUser) {
    await store.delete(existingUser.id);
}
const request = store.put(data);  // Now safe, no duplicate

// Option C: Check both ID AND login together
const existingById = await store.get(userData.id);
if (existingById) {
    // Record with this ID exists
    if (existingById.login === userData.login) {
        // Safe to update
    } else {
        // Login changed! Need to handle
    }
}
```

### Secondary Root Cause: Incomplete Error Handling

**The Real Issue**:
- `ConstraintError` is a VALID error that indicates a real problem
- But it's not handled at ANY level:
  1. Not retried by `_executeWithRetry()` (intentional)
  2. Not caught/handled in `updateCachedData()` (oversight)
  3. Not tracked in sync results (oversight)
  4. Only logged to console (insufficient)

**Result**: Error is silently swallowed, and sync marked as successful.

### Tertiary Root Cause: Insufficient Validation

**Issues With Data Validation**:
```javascript
// No validation that userData.login is valid
// No check for null/undefined/empty
// No normalization (trimming whitespace)
// No validation of userData.id type

// Better implementation:
if (!userData.login || typeof userData.login !== 'string') {
    throw new Error('Invalid userData.login: must be non-empty string');
}
if (!Number.isInteger(userData.id) || userData.id <= 0) {
    throw new Error('Invalid userData.id: must be positive integer');
}
```

---

## SECTION 7: Risk Assessment

### Severity: MEDIUM

**Why Medium (Not High)**:
- Sync continues successfully despite error
- Offline mode remains functional (with stale data)
- No data loss occurs
- Error is logged to console (visible to developers)

**Why Medium (Not Low)**:
- Affects reliability metrics (95% success rate may be inflated)
- User data may be stale/incorrect in offline mode
- Multiple users on same device may interfere
- No clear indication to users that sync failed
- Testing metrics are compromised

### Impact: MODERATE

**Affected Scenarios**:
1. **Multi-user Offline**: Multiple operators on same POS device
2. **User Data Updates**: User login/email changes while offline
3. **Device Sharing**: Multiple users accessing same terminal
4. **Sync Reliability**: Periodic caching of user data

**Not Affected**:
1. **Core POS Operations**: Orders, payments still work
2. **Online Mode**: Server-based auth not affected
3. **Data Loss**: Offline transactions safe (different store)

### Likelihood: MEDIUM-HIGH

**Triggers**:
- Multi-user POS scenarios (common in retail)
- Frequent user switches (common in high-volume stores)
- Multiple devices with same users (common in chains)
- Rapid sync cycles (more opportunities for race condition)

---

## SECTION 8: Code Quality Assessment

### Maintainability: POOR

**Issues**:
- Overly complex condition checking (lines 515-517)
- Race condition logic unclear to readers
- Error handling split between multiple files
- No comments explaining unique constraint strategy
- Magic behavior (silently overwriting IDs)

### Correctness: BROKEN

**Issues**:
- Race condition present
- Incomplete error handling
- No validation of inputs
- Unclear constraint handling strategy

### Security: MODERATE RISK

**Issues**:
- User login data logged to console (GDPR concern)
- No sanitization of login field
- No validation of input data types
- Potential for injection via malformed userData

### Performance: ACCEPTABLE

**Issues**:
- Retry logic may cause delays (5 attempts max)
- No caching of login index checks
- Full user reload for each sync (not incremental)

---

## SECTION 9: Recommended Fixes

### Fix Priority

**P1 (Critical)**:
1. Fix race condition in `saveUser()` logic
2. Add proper error handling for ConstraintError
3. Add input validation

**P2 (Important)**:
1. Improve error tracking in sync results
2. Add retry logic within `updateCachedData()`
3. Better logging and debugging info

**P3 (Nice-to-Have)**:
1. Add ConstraintError-specific tests
2. Document unique constraint strategy
3. Consider compound keys for multi-company support

### Recommended Fix Approach

#### FIX 1: Simplify saveUser() Logic

```javascript
async saveUser(userData) {
    // Validate input
    if (!userData.id || !userData.login) {
        throw new Error('Invalid user data: missing id or login');
    }

    return this._executeWithRetry(async () => {
        const tx = this.getNewTransaction(['users'], 'readwrite');
        const store = tx.objectStore('users');

        const data = {
            ...userData,
            cached_at: new Date().toISOString()
        };

        // Check if user with this login already exists
        const loginIndex = store.index('login');
        const existingUser = await new Promise((resolve, reject) => {
            const request = loginIndex.get(userData.login);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        // FIX: If same login exists, always use existing ID
        // This guarantees no constraint violation
        if (existingUser) {
            data.id = existingUser.id;
        }

        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            tx.onabort = () => reject(new Error('Transaction aborted'));
        });
    }, 'saveUser');
}
```

**Why This Fixes It**:
- If login exists, always use its ID → put() updates existing record
- If login new, put() creates new record
- No race condition because ID is determined deterministically
- Constraint always satisfied

#### FIX 2: Handle ConstraintError Separately

```javascript
async _executeWithRetry(operation, operationName = 'operation') {
    let lastError;

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            // Handle different error types
            const isAbortable = error.name === 'AbortError' ||
                              error.message?.includes('aborted') ||
                              error.name === 'QuotaExceededError';

            // FIX: ConstraintError should NOT be retried
            // It indicates a real data problem that won't resolve on retry
            const isConstraintError = error.name === 'ConstraintError';

            if (isConstraintError) {
                // Log with more context for debugging
                console.error(
                    `[PDC-Offline] ${operationName} encountered constraint violation:`,
                    error,
                    'This indicates duplicate data in the unique index'
                );
                throw error;  // Fail immediately, don't retry
            }

            if (!isAbortable) {
                throw error;  // Don't retry other errors
            }

            // Retry logic for abortable errors...
            if (attempt < MAX_RETRY_ATTEMPTS - 1) {
                const delay = RETRY_DELAYS[attempt];
                console.warn(
                    `[PDC-Offline] ${operationName} attempt ${attempt + 1} failed (${error.message}), ` +
                    `retrying in ${delay}ms...`
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}
```

#### FIX 3: Improve Sync Error Handling

```javascript
async updateCachedData() {
    try {
        // Update user data
        const users = await this.pos.env.services.orm.searchRead(
            'res.users',
            [['id', 'in', this.pos.user_ids || [this.pos.user.id]]],
            ['id', 'name', 'login', 'pos_offline_pin_hash']
        );

        // FIX: Handle errors per-user, not for entire batch
        const failedUsers = [];
        for (const user of users) {
            try {
                await offlineDB.saveUser(user);
            } catch (error) {
                console.error(`[PDC-Offline] Failed to cache user ${user.id} (${user.login}):`, error);
                failedUsers.push({ userId: user.id, error: error.message });
            }
        }

        // Log results
        if (failedUsers.length > 0) {
            console.warn(
                `[PDC-Offline] Failed to cache ${failedUsers.length} users:`,
                failedUsers
            );
            // Could also emit event: POS.bus.trigger('pos-cache-user-failed', failedUsers);
        }

        // Continue with config update even if some users failed
        await offlineDB.saveConfig('last_sync', new Date().toISOString());

    } catch (error) {
        console.error('[PDC-Offline] Critical error in updateCachedData:', error);
        // FIX: Throw error so it's tracked by syncAll
        throw error;
    }
}
```

---

## SECTION 10: Test Case Recommendations

### Test Case 1: Same User Sync Twice

```javascript
test('saveUser should handle updating same user without ConstraintError', async () => {
    const user = { id: 1, login: 'admin', name: 'Administrator' };

    // First save
    await offlineDB.saveUser(user);

    // Second save (should update, not insert)
    await offlineDB.saveUser({ ...user, name: 'Updated Name' });

    // Verify no error
    const result = await offlineDB.getUser(1);
    expect(result.name).toBe('Updated Name');
});
```

### Test Case 2: Two Users with Same Login

```javascript
test('saveUser should prevent duplicate logins', async () => {
    const user1 = { id: 1, login: 'alice', name: 'Alice' };
    const user2 = { id: 2, login: 'alice', name: 'Alice Copy' };

    await offlineDB.saveUser(user1);

    // Second user with same login should NOT cause ConstraintError
    // Instead, it should either:
    // A) Override ID to match first user, or
    // B) Use ID=2 and update login to something unique

    // Current behavior: ConstraintError
    // Expected: One of the above options
});
```

### Test Case 3: Multi-user Sync Stress Test

```javascript
test('syncManager should cache multiple users without errors', async () => {
    const users = Array.from({length: 10}, (_, i) => ({
        id: i + 1,
        login: `user${i}`,
        name: `User ${i}`
    }));

    // Simulate rapid sync cycles
    for (let cycle = 0; cycle < 5; cycle++) {
        for (const user of users) {
            await offlineDB.saveUser(user);
        }
    }

    // Verify all users cached without errors
    const cachedUsers = await offlineDB.getAllUsers();
    expect(cachedUsers.length).toBe(10);
});
```

### Test Case 4: Null/Undefined Login Validation

```javascript
test('saveUser should validate login field', async () => {
    const invalidUsers = [
        { id: 1, login: null },
        { id: 2, login: undefined },
        { id: 3, login: '' },
        { id: 4 }  // missing login
    ];

    for (const user of invalidUsers) {
        // Should throw error
        await expect(offlineDB.saveUser(user)).rejects.toThrow();
    }
});
```

---

## SECTION 11: Code Example: Problem Scenario

### Step-by-Step Execution Trace

```javascript
// SCENARIO: User data sync with ConstraintError

// == Setup ==
// IndexedDB contains: {id: 1, login: 'admin', name: 'Administrator'}

// == Code Execution ==
const userData = { id: 1, login: 'admin', name: 'Administrator', email: 'admin@example.com' };
await offlineDB.saveUser(userData);

// == Detailed Execution ==

// LINE 498-499: Create transaction
const tx = this.getNewTransaction(['users'], 'readwrite');
const store = tx.objectStore('users');

// LINE 502-507: Get existing user by login
const loginIndex = store.index('login');
const existingUser = await Promise((resolve, reject) => {
    // Query the 'login' index for 'admin'
    // Result: {id: 1, login: 'admin', name: 'Administrator'}
    resolve({id: 1, login: 'admin', name: 'Administrator'});
});

// LINE 509-512: Prepare new data
const data = {
    ...userData,  // {id: 1, login: 'admin', email: 'admin@example.com'}
    cached_at: new Date().toISOString()
};

// LINE 514-518: Check if ID mismatch
if (existingUser && existingUser.id !== userData.id) {
    // Check: {id: 1} && (1 !== 1)
    // Condition: true && false = FALSE
    // Action: Do nothing, don't override ID
    // data.id remains = 1
}

// LINE 520-525: Try to put data
return new Promise((resolve, reject) => {
    const request = store.put(data);
    // put() operation:
    // 1. Validates primary key: id=1 ✓ (valid)
    // 2. Validates unique index 'login': login='admin'
    //    IndexedDB checks: is there another record with login='admin'?
    //    Answer: YES (the existing record we just read!)
    //    ERROR: ConstraintError!

    request.onerror = () => reject(request.error);
    // ERROR THROWN: ConstraintError
});

// == Error Handling ==
// Caught by _executeWithRetry:
const isAbortable = error.name === 'AbortError' ||  // false
                   error.message?.includes('aborted') ||  // false
                   error.name === 'QuotaExceededError';  // false
// isAbortable = false

if (!isAbortable) {
    throw error;  // IMMEDIATELY THROW
}

// Error propagates to sync_manager.js:247
// Caught by try-catch:
catch (error) {
    console.error('Failed to update cached data:', error);
    // Only logged, no retry or recovery
}

// Sync marked as SUCCESS (line 105 in syncAll)
// User is NOT cached
// Offline mode uses stale data
```

---

## SECTION 12: Comparative Analysis

### Correct Implementation Comparison

#### BAD (Current): Conditional ID Override

```javascript
// Current problematic logic:
const existingUser = await loginIndex.get(userData.login);
if (existingUser && existingUser.id !== userData.id) {
    data.id = existingUser.id;  // Only if IDs differ
}
store.put(data);  // May have duplicate on put()
```

**Problem**: If IDs match, put() sees duplicate constraint violation.

#### GOOD: Always Use Existing ID

```javascript
// Fixed logic:
const existingUser = await loginIndex.get(userData.login);
if (existingUser) {
    data.id = existingUser.id;  // Always use existing ID
}
store.put(data);  // Always updates, never inserts with duplicate
```

**Benefit**: Deterministic behavior, no race conditions.

#### ALTERNATIVE: Atomic Transaction

```javascript
// Advanced approach (if supported by browser):
const tx = db.transaction(['users'], 'readwrite');
const store = tx.objectStore('users');

// All in single transaction - atomic
const existing = await store.index('login').get(userData.login);
if (existing) {
    await store.delete(existing.id);
}
await store.put({ ...data, id: userData.id });
```

**Benefit**: Explicitly handles the constraint issue.

---

## SECTION 13: Summary & Conclusions

### Primary Root Cause
**Race condition in `saveUser()` between index check and put operation.**

The condition `if (existingUser && existingUser.id !== userData.id)` is incomplete. When IDs match, the code proceeds with `put()` which attempts to insert a record with a duplicate login value, triggering the ConstraintError.

### Secondary Contributing Factors
1. **Wave 32 Design**: Retry logic explicitly excludes ConstraintError (possibly intentional, but lack of handling is problematic)
2. **Sync Manager**: Error handling in `updateCachedData()` is incomplete (only logs, doesn't retry or track failure)
3. **Data Validation**: No validation of login field (allows null/undefined/empty)
4. **Index Strategy**: Simple 'login' index may not be appropriate for multi-company deployments

### Is This a Wave 32 Regression?

**Technical Answer**: NO - Wave 32 didn't introduce the bug.

**Practical Answer**: PARTIAL YES - Wave 32:
1. Made other operations more reliable (reducing competing errors)
2. Exposed this bug by being more aggressive with retries elsewhere
3. Explicitly chose NOT to retry ConstraintError (design decision)
4. Should have provided alternative handling for ConstraintError

### Wave 32 Impact Assessment

**Wave 32 Claims vs Reality**:
- Claim: "95%+ success rate for concurrent operations"
- Reality: May be inflated because ConstraintError failures are counted as "sync successful"
- Actual concurrent operation success: May be lower once ConstraintError is fixed

### Risk Level
- **Severity**: MEDIUM (graceful degradation but stale data)
- **Impact**: MODERATE (affects offline reliability metrics)
- **Likelihood**: MEDIUM-HIGH (common in multi-user scenarios)
- **Overall**: FIX RECOMMENDED before production

### Fix Complexity
- **Complexity**: LOW - Simple logic fix
- **Risk of Fix**: LOW - Backward compatible
- **Testing**: MEDIUM - Requires multi-user scenarios
- **Effort**: 2-4 hours (fix + tests + review)

---

## Appendix: File References

### Affected Files
1. `/home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js`
   - Lines 250: Index definition
   - Lines 351-386: Retry logic
   - Lines 501-527: saveUser() implementation

2. `/home/epic/dev/pdc-pos-offline/static/src/js/sync_manager.js`
   - Lines 229-248: updateCachedData() and error handling
   - Lines 240-241: saveUser() call in loop

### Related Documentation
- [Original Bug Report](./report.md)
- Wave 32 Implementation: Commit `c73dab0`
- Module Version: 19.0.1.0.5

### Key Constants
```javascript
const INDEXED_DB_VERSION = 4;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAYS = [100, 200, 500, 1000, 2000];
```

---

**Document Status**: COMPLETE - Ready for Review and Implementation Planning

**Next Steps**:
1. Review this analysis for accuracy
2. Approve recommended fix approach
3. Create implementation task
4. Execute fixes in order (P1 → P2 → P3)
5. Add comprehensive test coverage
6. Deploy and monitor in staging/production
