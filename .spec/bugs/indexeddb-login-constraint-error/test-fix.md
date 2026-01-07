# Comprehensive Test Specifications: IndexedDB Login Constraint Error Fix

**Bug ID**: indexeddb-login-constraint-error
**Module**: pdc-pos-offline (Wave 32+)
**Severity**: Medium
**Test Status**: Specification Only (Implementation Ready)
**Date Created**: 2026-01-07
**Last Updated**: 2026-01-07

---

## Table of Contents

1. [Test Category 1: Upsert Logic](#test-category-1-upsert-logic)
2. [Test Category 2: Constraint Handling](#test-category-2-constraint-handling)
3. [Test Category 3: Error Recovery](#test-category-3-error-recovery)
4. [Test Category 4: Wave 32 Integration](#test-category-4-wave-32-integration)
5. [Test Category 5: Integration & Multi-User](#test-category-5-integration--multi-user)
6. [E2E Browser Tests](#e2e-browser-tests)
7. [Performance Regression Tests](#performance-regression-tests)
8. [Test Mapping to Bug Aspects](#test-mapping-to-bug-aspects)

---

## Test Category 1: Upsert Logic

Tests validating the improved user save logic with constraint compliance.

### Test 1.1: New User Insert (No Existing Login)

**Objective**: Verify that a new user with unique login can be inserted without constraint violations.

**Setup**:
- Clear users store in IndexedDB
- Prepare user data with unique login

**Test Steps**:
1. Call `offlineDB.saveUser({ id: 1, login: 'admin', name: 'Admin User' })`
2. Verify no error is thrown
3. Retrieve user via `getUserByLogin('admin')`
4. Verify user is cached correctly

**Expected Result**:
- No ConstraintError thrown
- User successfully inserted with ID 1
- User retrievable by login

**Verification**:
```javascript
const user = await offlineDB.getUserByLogin('admin');
expect(user).toBeDefined();
expect(user.id).toBe(1);
expect(user.login).toBe('admin');
```

**Code Example (Jest)**:
```javascript
test('should insert new user with unique login without constraint error', async () => {
    const userData = {
        id: 1,
        login: 'admin',
        name: 'Administrator',
        pos_offline_pin_hash: 'hash123'
    };

    // Should complete without throwing
    const result = await offlineDB.saveUser(userData);
    expect(result).toBeDefined();

    // Verify user is cached
    const cached = await offlineDB.getUserByLogin('admin');
    expect(cached).toBeDefined();
    expect(cached.id).toBe(1);
    expect(cached.login).toBe('admin');
});
```

---

### Test 1.2: Existing User Update (Same Login, Same ID)

**Objective**: Verify that updating a user with the same login and ID doesn't violate constraints.

**Setup**:
- Save initial user: `{ id: 1, login: 'admin', name: 'Admin' }`
- Prepare updated user with same login and ID

**Test Steps**:
1. Insert initial user with `saveUser()`
2. Update same user: `{ id: 1, login: 'admin', name: 'Administrator Updated' }`
3. Call `saveUser()` with updated data
4. Verify no ConstraintError
5. Retrieve and verify updated data

**Expected Result**:
- No ConstraintError thrown
- User record updated with new name
- Login index still valid and unique
- User retrievable by login

**Verification**:
```javascript
const user = await offlineDB.getUserByLogin('admin');
expect(user.name).toBe('Administrator Updated');
```

**Code Example (Jest)**:
```javascript
test('should update existing user with same login without constraint error', async () => {
    const initialUser = {
        id: 1,
        login: 'admin',
        name: 'Admin',
        pos_offline_pin_hash: 'hash123'
    };

    await offlineDB.saveUser(initialUser);

    const updatedUser = {
        id: 1,
        login: 'admin',
        name: 'Administrator Updated',
        pos_offline_pin_hash: 'newhash456'
    };

    // Should update without throwing
    const result = await offlineDB.saveUser(updatedUser);
    expect(result).toBeDefined();

    // Verify update
    const cached = await offlineDB.getUserByLogin('admin');
    expect(cached.name).toBe('Administrator Updated');
    expect(cached.pos_offline_pin_hash).toBe('newhash456');
});
```

---

### Test 1.3: Existing User Update (Same Login, Different ID - CRITICAL)

**Objective**: Verify handling when same login exists with different ID (the core bug scenario).

**Setup**:
- Cache user: `{ id: 1, login: 'admin', name: 'Old Admin' }`
- Prepare new data: `{ id: 2, login: 'admin', name: 'New Admin' }`

**Test Steps**:
1. Save initial user with ID 1 and login 'admin'
2. Attempt to save new user with ID 2 but same login 'admin'
3. This is the exact scenario causing ConstraintError
4. Verify fix handles this correctly

**Expected Result** (After Fix):
- No ConstraintError thrown
- Code should use existing user ID (1) instead of new ID (2)
- Final user record has ID 1 with updated data
- Only one user with login 'admin' in database

**Verification**:
```javascript
const user = await offlineDB.getUserByLogin('admin');
expect(user.id).toBe(1); // Should keep original ID
expect(user.name).toBe('New Admin'); // But update data
const allUsers = await offlineDB.getAllUsers();
const adminUsers = allUsers.filter(u => u.login === 'admin');
expect(adminUsers.length).toBe(1); // Only one admin
```

**Code Example (Jest)**:
```javascript
test('should handle same login with different ID by merging to existing user', async () => {
    // Scenario: User ID changed in Odoo but login stayed same
    const oldUserData = {
        id: 1,
        login: 'admin',
        name: 'Admin Old Version',
        pos_offline_pin_hash: 'hash123'
    };

    await offlineDB.saveUser(oldUserData);

    // Later, same user comes from server with different ID
    const newUserData = {
        id: 2,
        login: 'admin',
        name: 'Admin Updated Version',
        pos_offline_pin_hash: 'newhash456'
    };

    // This should NOT throw ConstraintError
    const result = await offlineDB.saveUser(newUserData);
    expect(result).toBeDefined();

    // Verify: Should have ID 1, updated data, no duplicates
    const cached = await offlineDB.getUserByLogin('admin');
    expect(cached.id).toBe(1); // Keeps original ID
    expect(cached.name).toBe('Admin Updated Version'); // Updates name

    const allUsers = await offlineDB.getAllUsers();
    const adminCount = allUsers.filter(u => u.login === 'admin').length;
    expect(adminCount).toBe(1); // Only one user with this login
});
```

---

### Test 1.4: Multiple Users with Different Logins

**Objective**: Verify that multiple users can be cached without cross-contamination.

**Setup**:
- Prepare 5 users with different logins

**Test Steps**:
1. Save user A: `{ id: 1, login: 'usera', name: 'User A' }`
2. Save user B: `{ id: 2, login: 'userb', name: 'User B' }`
3. Save user C: `{ id: 3, login: 'userc', name: 'User C' }`
4. Save user D: `{ id: 4, login: 'userd', name: 'User D' }`
5. Save user E: `{ id: 5, login: 'usere', name: 'User E' }`
6. Verify all users cached correctly
7. Verify retrieval by each login

**Expected Result**:
- All 5 users inserted without ConstraintError
- No constraint conflicts between different logins
- Each user retrievable by their login
- getAllUsers returns 5 records

**Verification**:
```javascript
const allUsers = await offlineDB.getAllUsers();
expect(allUsers.length).toBe(5);
for (let i = 1; i <= 5; i++) {
    const user = await offlineDB.getUserByLogin(`user${String.fromCharCode(96 + i)}`);
    expect(user).toBeDefined();
    expect(user.id).toBe(i);
}
```

**Code Example (Jest)**:
```javascript
test('should cache multiple users with different logins without conflicts', async () => {
    const users = [
        { id: 1, login: 'usera', name: 'User A', pos_offline_pin_hash: 'hash1' },
        { id: 2, login: 'userb', name: 'User B', pos_offline_pin_hash: 'hash2' },
        { id: 3, login: 'userc', name: 'User C', pos_offline_pin_hash: 'hash3' },
        { id: 4, login: 'userd', name: 'User D', pos_offline_pin_hash: 'hash4' },
        { id: 5, login: 'usere', name: 'User E', pos_offline_pin_hash: 'hash5' }
    ];

    // Save all users
    for (const user of users) {
        const result = await offlineDB.saveUser(user);
        expect(result).toBeDefined();
    }

    // Verify all cached
    const allUsers = await offlineDB.getAllUsers();
    expect(allUsers.length).toBe(5);

    // Verify each retrievable by login
    for (const user of users) {
        const cached = await offlineDB.getUserByLogin(user.login);
        expect(cached).toBeDefined();
        expect(cached.id).toBe(user.id);
        expect(cached.name).toBe(user.name);
    }
});
```

---

### Test 1.5: Rapidly Updating Same User

**Objective**: Verify that rapid successive updates to same user don't cause constraint violations.

**Setup**:
- Initial user: `{ id: 1, login: 'admin', name: 'Admin v1' }`
- 10 rapid update cycles

**Test Steps**:
1. Save initial user
2. Perform 10 rapid updates with same login, different data
3. Each update: name changes to "Admin v2", "Admin v3", etc.
4. Verify no ConstraintError during any update
5. Verify final state is correct

**Expected Result**:
- All 10 updates complete successfully
- No ConstraintError during rapid updates
- Final state matches last update
- No orphaned/duplicate records

**Verification**:
```javascript
for (let i = 1; i <= 10; i++) {
    const user = await offlineDB.getUserByLogin('admin');
    expect(user.name).toBe(`Admin v${i}`);
}
const allUsers = await offlineDB.getAllUsers();
const adminCount = allUsers.filter(u => u.login === 'admin').length;
expect(adminCount).toBe(1);
```

**Code Example (Jest)**:
```javascript
test('should handle rapid successive updates to same user without constraint error', async () => {
    const initialUser = {
        id: 1,
        login: 'admin',
        name: 'Admin v1',
        pos_offline_pin_hash: 'hash1'
    };

    await offlineDB.saveUser(initialUser);

    // Rapid updates
    for (let i = 2; i <= 10; i++) {
        const updatedUser = {
            id: 1,
            login: 'admin',
            name: `Admin v${i}`,
            pos_offline_pin_hash: `hash${i}`
        };

        const result = await offlineDB.saveUser(updatedUser);
        expect(result).toBeDefined();
    }

    // Verify final state
    const cached = await offlineDB.getUserByLogin('admin');
    expect(cached.name).toBe('Admin v10');

    // Verify no duplicates
    const allUsers = await offlineDB.getAllUsers();
    const adminCount = allUsers.filter(u => u.login === 'admin').length;
    expect(adminCount).toBe(1);
});
```

---

## Test Category 2: Constraint Handling

Tests focusing on edge cases and constraint violation scenarios.

### Test 2.1: Undefined Login Value

**Objective**: Verify graceful handling of undefined login values.

**Setup**:
- User data with undefined login: `{ id: 1, login: undefined, name: 'User' }`

**Test Steps**:
1. Attempt to save user with undefined login
2. Verify error handling (should either reject or handle gracefully)
3. Verify no database corruption

**Expected Result**:
- Either throws validation error before DB operation
- Or handles gracefully and doesn't corrupt index
- Database remains in consistent state

**Verification**:
```javascript
try {
    await offlineDB.saveUser(userData);
    // If no error, verify no index entry for undefined
    const allUsers = await offlineDB.getAllUsers();
    expect(allUsers.some(u => u.login === undefined)).toBe(false);
} catch (error) {
    // Expected - validation error
    expect(error).toBeDefined();
}
```

**Code Example (Jest)**:
```javascript
test('should handle undefined login value gracefully', async () => {
    const userData = {
        id: 1,
        login: undefined,
        name: 'Test User',
        pos_offline_pin_hash: 'hash123'
    };

    // Should either throw or handle gracefully
    try {
        await offlineDB.saveUser(userData);

        // If it succeeds, verify no corruption
        const allUsers = await offlineDB.getAllUsers();
        const hasUndefinedLogin = allUsers.some(u => u.login === undefined);
        expect(hasUndefinedLogin).toBe(false);
    } catch (error) {
        // Expected - validation error
        expect(error).toBeDefined();
    }
});
```

---

### Test 2.2: Null Login Value

**Objective**: Verify handling of null login values.

**Setup**:
- User data with null login: `{ id: 1, login: null, name: 'User' }`

**Test Steps**:
1. Attempt to save user with null login
2. Verify error handling
3. Verify database consistency

**Expected Result**:
- Handled appropriately (error or graceful degradation)
- No index corruption
- Database remains valid

**Verification**:
```javascript
// Similar to Test 2.1 but with null
const users = await offlineDB.getAllUsers();
expect(users.some(u => u.login === null)).toBe(false);
```

**Code Example (Jest)**:
```javascript
test('should handle null login value gracefully', async () => {
    const userData = {
        id: 1,
        login: null,
        name: 'Test User',
        pos_offline_pin_hash: 'hash123'
    };

    try {
        await offlineDB.saveUser(userData);
        const allUsers = await offlineDB.getAllUsers();
        expect(allUsers.some(u => u.login === null)).toBe(false);
    } catch (error) {
        expect(error).toBeDefined();
    }
});
```

---

### Test 2.3: Empty String Login

**Objective**: Verify handling of empty string login values.

**Setup**:
- User data with empty login: `{ id: 1, login: '', name: 'User' }`

**Test Steps**:
1. Save user with empty string login
2. Attempt to save another user with empty string login
3. Verify constraint enforcement

**Expected Result**:
- First user may be cached (or rejected)
- Second user with same empty login throws ConstraintError
- OR: Empty logins are normalized/rejected

**Verification**:
```javascript
const user1 = await offlineDB.saveUser({ id: 1, login: '', name: 'User 1' });
// Should either fail here or reject second attempt
try {
    const user2 = await offlineDB.saveUser({ id: 2, login: '', name: 'User 2' });
    // If both succeed, only one should exist (merged)
    const allUsers = await offlineDB.getAllUsers();
    const emptyLoginUsers = allUsers.filter(u => u.login === '');
    expect(emptyLoginUsers.length).toBeLessThanOrEqual(1);
} catch (error) {
    // Expected - ConstraintError
    expect(error.name).toMatch(/Constraint|Unique/);
}
```

**Code Example (Jest)**:
```javascript
test('should enforce constraint on empty string login', async () => {
    // First user with empty login
    const user1 = {
        id: 1,
        login: '',
        name: 'User 1',
        pos_offline_pin_hash: 'hash1'
    };

    try {
        await offlineDB.saveUser(user1);

        // Second user with same empty login should fail
        const user2 = {
            id: 2,
            login: '',
            name: 'User 2',
            pos_offline_pin_hash: 'hash2'
        };

        try {
            await offlineDB.saveUser(user2);
            // If both succeed, verify only one exists
            const allUsers = await offlineDB.getAllUsers();
            const emptyCount = allUsers.filter(u => u.login === '').length;
            expect(emptyCount).toBeLessThanOrEqual(1);
        } catch (error) {
            // Expected - constraint error
            expect(error.name).toMatch(/Constraint|Unique/);
        }
    } catch (error) {
        // If first fails, that's also acceptable
        expect(error).toBeDefined();
    }
});
```

---

### Test 2.4: Duplicate Login Insertion (Race Condition)

**Objective**: Verify that simultaneous saves with same login don't bypass constraint.

**Setup**:
- Clear users store
- Prepare two save operations with same login

**Test Steps**:
1. Initiate save operation 1: `{ id: 1, login: 'admin', name: 'User A' }`
2. Initiate save operation 2: `{ id: 2, login: 'admin', name: 'User B' }` (in parallel)
3. Both operations attempt simultaneous save
4. Verify constraint is enforced

**Expected Result**:
- One operation succeeds
- One operation fails with ConstraintError
- OR: Both operations succeed but one user ID is used (merged)
- Database consistency maintained

**Verification**:
```javascript
const promises = [
    offlineDB.saveUser({ id: 1, login: 'admin', name: 'User A' }),
    offlineDB.saveUser({ id: 2, login: 'admin', name: 'User B' })
];

const results = await Promise.allSettled(promises);
const fulfilled = results.filter(r => r.status === 'fulfilled').length;
const rejected = results.filter(r => r.status === 'rejected').length;

// Either: 1 success + 1 failure
// Or: 2 successes (merged to same ID)
expect(fulfilled + rejected).toBe(2);

const users = await offlineDB.getAllUsers();
const adminCount = users.filter(u => u.login === 'admin').length;
expect(adminCount).toBe(1);
```

**Code Example (Jest)**:
```javascript
test('should handle concurrent saves with same login via constraint', async () => {
    const save1 = offlineDB.saveUser({
        id: 1,
        login: 'admin',
        name: 'User A',
        pos_offline_pin_hash: 'hash1'
    });

    const save2 = offlineDB.saveUser({
        id: 2,
        login: 'admin',
        name: 'User B',
        pos_offline_pin_hash: 'hash2'
    });

    // Wait for both to complete
    const results = await Promise.allSettled([save1, save2]);

    // Verify: Either 1 fails + 1 succeeds, or both succeed (merged)
    const fulfilled = results.filter(r => r.status === 'fulfilled').length;
    const rejected = results.filter(r => r.status === 'rejected').length;

    expect(fulfilled).toBeGreaterThan(0);
    expect(fulfilled + rejected).toBe(2);

    // Verify only one user exists with this login
    const allUsers = await offlineDB.getAllUsers();
    const adminUsers = allUsers.filter(u => u.login === 'admin');
    expect(adminUsers.length).toBe(1);
});
```

---

### Test 2.5: Concurrent User Saves to Different Stores

**Objective**: Verify that concurrent saves to different object stores don't interfere.

**Setup**:
- Save user to 'users' store
- Save session to 'sessions' store
- Both in parallel

**Test Steps**:
1. Initiate saveUser() for users store
2. Initiate saveSession() for sessions store
3. Both complete in parallel
4. Verify no cross-store constraint issues

**Expected Result**:
- Both operations complete successfully
- No interference between stores
- Constraints within each store enforced independently

**Verification**:
```javascript
const results = await Promise.all([
    offlineDB.saveUser({ id: 1, login: 'admin', name: 'Admin' }),
    offlineDB.saveSession({ id: 1, name: 'Session 1', user_id: 1 })
]);

expect(results[0]).toBeDefined();
expect(results[1]).toBeDefined();

const user = await offlineDB.getUser(1);
const session = await offlineDB.getSession(1);
expect(user).toBeDefined();
expect(session).toBeDefined();
```

**Code Example (Jest)**:
```javascript
test('should handle concurrent saves to different stores without interference', async () => {
    const userSave = offlineDB.saveUser({
        id: 1,
        login: 'admin',
        name: 'Administrator',
        pos_offline_pin_hash: 'hash123'
    });

    const sessionSave = offlineDB.saveSession({
        id: 1,
        name: 'Test Session',
        user_id: 1,
        config_id: 1,
        state: 'open'
    });

    // Wait for both
    const [userResult, sessionResult] = await Promise.all([userSave, sessionSave]);

    expect(userResult).toBeDefined();
    expect(sessionResult).toBeDefined();

    // Verify both saved correctly
    const user = await offlineDB.getUser(1);
    const session = await offlineDB.getSession(1);

    expect(user.login).toBe('admin');
    expect(session.state).toBe('open');
});
```

---

## Test Category 3: Error Recovery

Tests for error handling and recovery mechanisms.

### Test 3.1: ConstraintError Recovery

**Objective**: Verify graceful error recovery when ConstraintError occurs.

**Setup**:
- Setup scenario that would cause ConstraintError
- Implement recovery mechanism

**Test Steps**:
1. Trigger condition that causes ConstraintError
2. Verify error is caught
3. Verify recovery mechanism (retry, fallback, or logging)
4. Verify application continues functioning

**Expected Result**:
- Error caught and handled
- Appropriate logging
- No unhandled promise rejection
- Database consistency maintained
- Subsequent operations work normally

**Verification**:
```javascript
const errorLogger = jest.fn();
// Patch error logging to track

try {
    await offlineDB.saveUser(problematicUserData);
} catch (error) {
    errorLogger(error);
}

expect(errorLogger).toHaveBeenCalled();

// Verify database still functional
const user = await offlineDB.getUser(1);
expect(user).toBeDefined();
```

**Code Example (Jest)**:
```javascript
test('should handle ConstraintError gracefully without breaking database', async () => {
    // Setup condition for constraint error
    const user1 = {
        id: 1,
        login: 'admin',
        name: 'Admin User',
        pos_offline_pin_hash: 'hash123'
    };

    await offlineDB.saveUser(user1);

    // Attempt to save with same login but different ID
    // (this should be handled by improved upsert, not throw)
    const user2 = {
        id: 2,
        login: 'admin',
        name: 'Another Admin',
        pos_offline_pin_hash: 'hash456'
    };

    // Should not throw
    const result = await offlineDB.saveUser(user2);
    expect(result).toBeDefined();

    // Verify database still functional
    const allUsers = await offlineDB.getAllUsers();
    expect(allUsers.length).toBeGreaterThan(0);

    // Verify only one admin exists
    const adminCount = allUsers.filter(u => u.login === 'admin').length;
    expect(adminCount).toBe(1);
});
```

---

### Test 3.2: Graceful Degradation

**Objective**: Verify that application continues operating even if user cache sync fails.

**Setup**:
- Force user save to fail
- Verify rest of sync continues

**Test Steps**:
1. Mock offlineDB.saveUser to throw error
2. Call syncManager.syncAll()
3. Verify other sync phases continue
4. Verify user sees no interruption

**Expected Result**:
- User cache phase fails
- Other sync phases (transactions, sessions, cleanup) continue
- No ConstraintError propagates to UI
- Sync reports partial success
- Offline mode remains functional

**Verification**:
```javascript
const syncResults = await syncManager.syncAll();
expect(syncResults.failed.length).toBeGreaterThan(0);
expect(syncResults.success.length).toBeGreaterThan(0);

// Verify offline operations still work
const pending = await offlineDB.getPendingTransactions();
expect(pending).toBeDefined();
```

**Code Example (Jest)**:
```javascript
test('should continue sync when user cache fails (graceful degradation)', async () => {
    // Mock saveUser to fail
    const originalSaveUser = offlineDB.saveUser;
    offlineDB.saveUser = jest.fn().mockRejectedValue(
        new Error('ConstraintError: Simulated failure')
    );

    try {
        const syncResults = await syncManager.syncAll();

        // Verify: Some phases fail, others continue
        expect(syncResults.failed.length).toBeGreaterThan(0);
        expect(syncResults.success.length).toBeGreaterThan(0);

        // Verify other operations still work
        const sessionData = {
            id: 1,
            name: 'Test Session',
            user_id: 1,
            config_id: 1,
            state: 'open'
        };

        const session = await offlineDB.saveSession(sessionData);
        expect(session).toBeDefined();
    } finally {
        offlineDB.saveUser = originalSaveUser;
    }
});
```

---

### Test 3.3: Logging and Debugging

**Objective**: Verify that ConstraintError is properly logged for debugging.

**Setup**:
- Setup scenario that causes ConstraintError
- Capture console output

**Test Steps**:
1. Trigger ConstraintError scenario
2. Verify console.error() is called
3. Verify log includes relevant context (user ID, login, error message)
4. Verify sync error persisted to IndexedDB

**Expected Result**:
- ConstraintError logged to console.error
- Log includes user data context
- Sync error saved to sync_errors store
- Error queryable via getSyncErrors()

**Verification**:
```javascript
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

try {
    // Trigger error condition
    await syncManager.updateCachedData();
} catch (e) {
    // Expected
}

expect(consoleErrorSpy).toHaveBeenCalled();
const errorLog = consoleErrorSpy.mock.calls.find(
    call => call[0].includes('ConstraintError')
);
expect(errorLog).toBeDefined();

// Verify persisted to IndexedDB
const errors = await syncManager.getSyncErrors();
expect(errors.length).toBeGreaterThan(0);

consoleErrorSpy.mockRestore();
```

**Code Example (Jest)**:
```javascript
test('should log ConstraintError with context for debugging', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Setup users that will cause conflict
    await offlineDB.saveUser({
        id: 1,
        login: 'admin',
        name: 'Admin',
        pos_offline_pin_hash: 'hash1'
    });

    // This simulates what might happen in sync
    try {
        // Attempt to force constraint error
        await offlineDB.saveUser({
            id: 2,
            login: 'admin',
            name: 'Another Admin',
            pos_offline_pin_hash: 'hash2'
        });
    } catch (error) {
        // Log like sync_manager would
        await syncManager.saveSyncError({
            transaction_id: null,
            error_message: error.message,
            error_type: 'user_cache',
            timestamp: new Date().toISOString(),
            context: { userId: 2, login: 'admin' }
        });
    }

    // Verify logging
    const errors = await syncManager.getSyncErrors({ error_type: 'user_cache' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].context.login).toBe('admin');

    consoleErrorSpy.mockRestore();
});
```

---

## Test Category 4: Wave 32 Integration

Tests specific to Wave 32 retry logic and transaction abort handling.

### Test 4.1: Retry Logic with ConstraintError

**Objective**: Verify how _executeWithRetry handles ConstraintError.

**Setup**:
- Mock operation that throws ConstraintError
- Call through _executeWithRetry

**Test Steps**:
1. Create operation that throws ConstraintError
2. Call `_executeWithRetry(operation)`
3. Verify retry behavior
4. Verify final result

**Expected Result**:
- ConstraintError does NOT retry (no point)
- Fails immediately on first attempt
- Not retried with exponential backoff
- Error propagates up for handling

**Verification**:
```javascript
const operation = jest.fn(async () => {
    const error = new Error('ConstraintError');
    error.name = 'ConstraintError';
    throw error;
});

try {
    await offlineDB._executeWithRetry(operation, 'test');
} catch (error) {
    expect(error.name).toBe('ConstraintError');
}

// Should be called only once (no retry)
expect(operation).toHaveBeenCalledTimes(1);
```

**Code Example (Jest)**:
```javascript
test('should NOT retry ConstraintError in _executeWithRetry', async () => {
    let attempts = 0;
    const operation = jest.fn(async () => {
        attempts++;
        const error = new Error('ConstraintError: Duplicate login');
        error.name = 'ConstraintError';
        throw error;
    });

    try {
        await offlineDB._executeWithRetry(operation, 'user-save');
        fail('Should have thrown');
    } catch (error) {
        expect(error.name).toBe('ConstraintError');
    }

    // Should not retry - ConstraintError is permanent
    expect(attempts).toBe(1);
    expect(operation).toHaveBeenCalledTimes(1);
});
```

---

### Test 4.2: Transaction Abort with Constraint Error

**Objective**: Verify handling when transaction aborts AND ConstraintError occurs.

**Setup**:
- Setup condition causing both AbortError and ConstraintError
- Verify which takes precedence

**Test Steps**:
1. Trigger operation that might abort due to page visibility
2. AND has constraint violation
3. Verify retry logic handles this combination
4. Verify final error reported correctly

**Expected Result**:
- If AbortError first: Retries up to 5 times
- If ConstraintError first: Fails immediately
- Final error state clear and debuggable

**Verification**:
```javascript
// Scenario: Page visibility change causes abort,
// but underlying issue is constraint violation
let attemptCount = 0;
const operation = jest.fn(async () => {
    attemptCount++;
    if (attemptCount < 3) {
        // First few attempts get AbortError (retryable)
        throw new Error('AbortError: Transaction aborted');
    }
    // Later attempt gets ConstraintError (not retryable)
    const error = new Error('ConstraintError');
    error.name = 'ConstraintError';
    throw error;
});

try {
    await offlineDB._executeWithRetry(operation, 'user-save');
} catch (error) {
    expect(error.name).toBe('ConstraintError');
}

// Should have retried AbortErrors, then hit ConstraintError
expect(attemptCount).toBeGreaterThanOrEqual(3);
```

**Code Example (Jest)**:
```javascript
test('should handle transaction abort followed by constraint error', async () => {
    let attempts = 0;
    const operation = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
            // Simulate page visibility change causing abort
            throw new Error('AbortError: The transaction was aborted');
        }
        // Underlying constraint violation revealed
        const error = new Error('ConstraintError: Duplicate login');
        error.name = 'ConstraintError';
        throw error;
    });

    try {
        await offlineDB._executeWithRetry(operation, 'user-save');
        fail('Should have thrown ConstraintError');
    } catch (error) {
        expect(error.name).toBe('ConstraintError');
    }

    // Should have retried AbortErrors (2), then failed on ConstraintError
    expect(attempts).toBe(3);
});
```

---

### Test 4.3: Page Visibility Change During Upsert

**Objective**: Verify Wave 32 abort handling during user upsert operation.

**Setup**:
- Trigger user save
- Simulate page visibility change (hidden)
- Verify retry handles it

**Test Steps**:
1. Start saveUser() operation
2. Simulate visibilitychange event (page hidden)
3. IndexedDB transaction aborts
4. Verify retry logic retries operation
5. Verify successful save after retry

**Expected Result**:
- Transaction aborts due to visibility change
- AbortError caught and retried
- User save succeeds on retry
- User correctly cached

**Verification**:
```javascript
let attempts = 0;
// Patch transaction to simulate abort on page visibility
const originalTransaction = offlineDB.db.transaction;

let abortOnAttempt = true;
offlineDB.db.transaction = function(...args) {
    const tx = originalTransaction.apply(this, args);
    if (abortOnAttempt) {
        // Simulate page becoming hidden
        setTimeout(() => {
            tx.abort();
        }, 10);
        abortOnAttempt = false; // Only abort first attempt
    }
    return tx;
};

const userData = { id: 1, login: 'admin', name: 'Admin' };
const result = await offlineDB.saveUser(userData);

expect(result).toBeDefined();
const cached = await offlineDB.getUserByLogin('admin');
expect(cached).toBeDefined();
```

**Code Example (Jest)**:
```javascript
test('should handle page visibility change during user save via Wave 32 retry', async () => {
    const userData = {
        id: 1,
        login: 'admin',
        name: 'Administrator',
        pos_offline_pin_hash: 'hash123'
    };

    // This test is complex - would need to mock transaction behavior
    // For now, verify the save succeeds even if visibility changes

    let transactionAbortCount = 0;
    const originalTransaction = offlineDB.db.transaction.bind(offlineDB.db);

    offlineDB.db.transaction = function(...args) {
        const tx = originalTransaction(...args);

        // Abort first transaction (simulate visibility change)
        if (transactionAbortCount === 0) {
            transactionAbortCount++;
            const origOncomplete = tx.oncomplete;
            tx.oncomplete = null;
            // Schedule abort to happen during operation
            setImmediate(() => tx.abort());
        }

        return tx;
    };

    // Should succeed despite first transaction aborting
    const result = await offlineDB.saveUser(userData);
    expect(result).toBeDefined();

    // Verify user was eventually saved
    const cached = await offlineDB.getUserByLogin('admin');
    expect(cached).toBeDefined();
    expect(cached.id).toBe(1);
});
```

---

## Test Category 5: Integration & Multi-User

Tests for multi-user offline scenarios and integration with sync manager.

### Test 5.1: Multi-User Offline Sync

**Objective**: Verify complete sync cycle with multiple users without constraint errors.

**Setup**:
- 5 users in Odoo backend
- Clear offline cache
- Trigger full sync

**Test Steps**:
1. Initialize SyncManager
2. Trigger syncAll()
3. Mock ORM to return 5 users: admin, user1, user2, user3, user4
4. Verify all users cached successfully
5. Verify no ConstraintError in logs

**Expected Result**:
- All 5 users cached successfully
- No ConstraintError during sync
- Each user retrievable by login
- Sync reports success

**Verification**:
```javascript
const users = [
    { id: 1, name: 'Admin', login: 'admin' },
    { id: 2, name: 'User 1', login: 'user1' },
    { id: 3, name: 'User 2', login: 'user2' },
    { id: 4, name: 'User 3', login: 'user3' },
    { id: 5, name: 'User 4', login: 'user4' }
];

// Mock ORM searchRead
jest.spyOn(pos.env.services.orm, 'searchRead').mockResolvedValue(users);

const syncResults = await syncManager.syncAll();
expect(syncResults.failed).not.toContainEqual(
    expect.objectContaining({ phase: 'updateCachedData' })
);

// Verify all users cached
for (const user of users) {
    const cached = await offlineDB.getUserByLogin(user.login);
    expect(cached).toBeDefined();
}
```

**Code Example (Jest)**:
```javascript
test('should sync multiple users offline without constraint errors', async () => {
    const mockUsers = [
        { id: 1, name: 'Administrator', login: 'admin', pos_offline_pin_hash: 'hash1' },
        { id: 2, name: 'Sales Manager', login: 'manager', pos_offline_pin_hash: 'hash2' },
        { id: 3, name: 'Sales Person 1', login: 'sales1', pos_offline_pin_hash: 'hash3' },
        { id: 4, name: 'Sales Person 2', login: 'sales2', pos_offline_pin_hash: 'hash4' },
        { id: 5, name: 'Warehouse User', login: 'warehouse', pos_offline_pin_hash: 'hash5' }
    ];

    // Mock ORM to return users
    jest.spyOn(pos.env.services.orm, 'searchRead')
        .mockResolvedValue(mockUsers);

    // Trigger sync
    const syncResults = await syncManager.syncAll();

    // Verify updateCachedData succeeded
    expect(syncResults.success).toContain('updateCachedData');

    // Verify all users cached
    for (const user of mockUsers) {
        const cached = await offlineDB.getUserByLogin(user.login);
        expect(cached).toBeDefined();
        expect(cached.id).toBe(user.id);
        expect(cached.name).toBe(user.name);
    }

    // Verify no duplicates
    const allCached = await offlineDB.getAllUsers();
    expect(allCached.length).toBe(mockUsers.length);
});
```

---

### Test 5.2: User Switching on Same Device

**Objective**: Verify offline mode works correctly when switching users on same device.

**Setup**:
- User A logs in and caches data
- User A logs out
- User B logs in with same device/IndexedDB

**Test Steps**:
1. Login as User A, trigger sync
2. Verify User A data cached
3. Clear session (simulate logout)
4. Login as User B, trigger sync
5. Verify User B data cached correctly
6. Verify no constraint violation between users

**Expected Result**:
- User A data cached (id: 1, login: 'admin')
- User B data cached (id: 2, login: 'user1')
- Both logins in cache without conflict
- No ConstraintError when switching

**Verification**:
```javascript
// User A login
await syncManager.syncAll(); // Caches admin user
let userA = await offlineDB.getUserByLogin('admin');
expect(userA).toBeDefined();

// Simulate logout/switch
await offlineDB.saveSession(null); // Clear active session

// User B login
await syncManager.syncAll(); // Caches user1
let userB = await offlineDB.getUserByLogin('user1');
expect(userB).toBeDefined();

// Verify both exist
const allUsers = await offlineDB.getAllUsers();
expect(allUsers.length).toBeGreaterThanOrEqual(2);
```

**Code Example (Jest)**:
```javascript
test('should handle user switching on same device without constraint error', async () => {
    const adminUser = {
        id: 1,
        name: 'Administrator',
        login: 'admin',
        pos_offline_pin_hash: 'hash1'
    };

    const salesUser = {
        id: 2,
        name: 'Sales Person',
        login: 'salesperson',
        pos_offline_pin_hash: 'hash2'
    };

    // User A (admin) logs in
    jest.spyOn(pos.env.services.orm, 'searchRead')
        .mockResolvedValueOnce([adminUser]);

    await syncManager.updateCachedData();
    const cachedAdmin = await offlineDB.getUserByLogin('admin');
    expect(cachedAdmin).toBeDefined();
    expect(cachedAdmin.id).toBe(1);

    // User A logs out, User B logs in (same device)
    jest.spyOn(pos.env.services.orm, 'searchRead')
        .mockResolvedValueOnce([salesUser]);

    await syncManager.updateCachedData();
    const cachedSales = await offlineDB.getUserByLogin('salesperson');
    expect(cachedSales).toBeDefined();
    expect(cachedSales.id).toBe(2);

    // Verify both users cached
    const allUsers = await offlineDB.getAllUsers();
    expect(allUsers.length).toBeGreaterThanOrEqual(2);

    // Verify no duplicates with same login
    const adminCount = allUsers.filter(u => u.login === 'admin').length;
    const salesCount = allUsers.filter(u => u.login === 'salesperson').length;
    expect(adminCount).toBe(1);
    expect(salesCount).toBe(1);
});
```

---

### Test 5.3: Sync After Cache Clear

**Objective**: Verify sync works correctly after user manually clears IndexedDB.

**Setup**:
- Initial sync with data cached
- User clears IndexedDB cache
- Trigger sync again

**Test Steps**:
1. Initial sync: User data cached
2. Clear all data: `await offlineDB.reset()`
3. Re-initialize: `await offlineDB.init()`
4. Trigger sync again
5. Verify data re-cached correctly

**Expected Result**:
- First sync completes successfully
- Cache cleared completely
- Second sync completes without constraint error
- Fresh data cached correctly

**Verification**:
```javascript
// First sync
await syncManager.syncAll();
let users = await offlineDB.getAllUsers();
expect(users.length).toBeGreaterThan(0);

// Clear cache
await offlineDB.reset();
await offlineDB.init();

users = await offlineDB.getAllUsers();
expect(users.length).toBe(0);

// Sync again
await syncManager.syncAll();
users = await offlineDB.getAllUsers();
expect(users.length).toBeGreaterThan(0);
```

**Code Example (Jest)**:
```javascript
test('should sync successfully after user clears cache', async () => {
    const mockUsers = [
        { id: 1, name: 'Admin', login: 'admin', pos_offline_pin_hash: 'hash1' },
        { id: 2, name: 'User 1', login: 'user1', pos_offline_pin_hash: 'hash2' }
    ];

    jest.spyOn(pos.env.services.orm, 'searchRead')
        .mockResolvedValue(mockUsers);

    // First sync
    await syncManager.updateCachedData();
    let cachedUsers = await offlineDB.getAllUsers();
    expect(cachedUsers.length).toBe(2);

    // User clears IndexedDB
    await offlineDB.reset();

    // Re-initialize fresh
    await offlineDB.init();
    cachedUsers = await offlineDB.getAllUsers();
    expect(cachedUsers.length).toBe(0);

    // Sync again (should work without constraint error)
    await syncManager.updateCachedData();
    cachedUsers = await offlineDB.getAllUsers();
    expect(cachedUsers.length).toBe(2);

    // Verify fresh data cached correctly
    const adminUser = await offlineDB.getUserByLogin('admin');
    expect(adminUser).toBeDefined();
    expect(adminUser.id).toBe(1);
});
```

---

## E2E Browser Tests

Playwright-based end-to-end tests for the complete user flow.

### Test E2E 1: Multi-User Offline POS Login

**Objective**: Test complete flow of multiple users logging in and using offline POS.

**Test Steps**:
1. Open POS application
2. Login as User A (admin)
3. Verify offline mode active
4. Perform offline transaction
5. Logout
6. Login as User B (sales)
7. Verify offline mode active and User B data cached
8. Perform another offline transaction
9. Go online and verify sync completes

**Expected Result**:
- Both users cache offline successfully
- No ConstraintError in console
- Offline transactions work correctly
- Sync completes without errors

**Playwright Code**:
```javascript
test('E2E: Multi-user offline POS login without constraint errors', async ({ page }) => {
    // Navigate to POS
    await page.goto('http://localhost:8000/pos/web');

    // Login as User A (admin)
    await page.fill('input[name="login"]', 'admin');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for POS to load
    await page.waitForURL('**/pos/web?**');
    await page.waitForSelector('.pos-content');

    // Open DevTools to monitor console
    const consoleMessages = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleMessages.push(msg.text());
        }
    });

    // Verify offline indicator
    const offlineIndicator = await page.locator('.offline-indicator').isVisible();
    expect(offlineIndicator).toBe(true);

    // Perform a transaction
    await page.click('button.product-add'); // Add product
    await page.click('button.checkout');
    await page.fill('input[name="amount"]', '100');
    await page.click('button.pay');

    // Logout
    await page.click('button.logout');

    // Login as User B
    await page.fill('input[name="login"]', 'salesperson');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/pos/web?**');

    // Verify no ConstraintError in console
    const constraintErrors = consoleMessages.filter(msg =>
        msg.includes('ConstraintError')
    );
    expect(constraintErrors.length).toBe(0);

    // Go online
    await page.click('button.online-toggle');

    // Wait for sync
    await page.waitForSelector('.sync-complete', { timeout: 30000 });

    // Verify sync successful
    const syncError = await page.locator('.sync-error').isVisible();
    expect(syncError).toBe(false);
});
```

---

### Test E2E 2: DevTools Observable Errors

**Objective**: Verify no errors in DevTools console/Network tab during sync.

**Test Steps**:
1. Open POS with DevTools
2. Monitor Network and Console tabs
3. Trigger offline sync
4. Observe for ConstraintError or network errors
5. Verify clean sync

**Expected Result**:
- No errors in console
- No failed XHR/fetch requests
- Sync completes cleanly
- Database operations logged correctly

**Playwright Code**:
```javascript
test('E2E: No ConstraintError in DevTools during sync', async ({ page }) => {
    const errors = [];
    const networkErrors = [];

    // Capture console errors
    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
            errors.push({
                type: msg.type(),
                text: msg.text(),
                location: msg.location()
            });
        }
    });

    // Capture network errors
    page.on('response', response => {
        if (!response.ok() && response.url().includes('/offline')) {
            networkErrors.push({
                url: response.url(),
                status: response.status()
            });
        }
    });

    // Navigate and login
    await page.goto('http://localhost:8000/pos/web');
    await page.fill('input[name="login"]', 'admin');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/pos/web?**');

    // Trigger sync manually
    await page.click('button.force-sync');

    // Wait for sync to complete
    await page.waitForSelector('[data-sync-complete="true"]', { timeout: 30000 });

    // Wait a moment for all logs
    await page.waitForTimeout(1000);

    // Verify no ConstraintError
    const constraintErrors = errors.filter(e =>
        e.text.includes('ConstraintError') &&
        e.text.includes('login')
    );
    expect(constraintErrors.length).toBe(0);

    // Verify no offline API errors
    expect(networkErrors.length).toBe(0);

    // Capture for debugging
    if (errors.length > 0) {
        console.log('Console errors:', errors);
    }
});
```

---

### Test E2E 3: Offline Operation with Constraint Recovery

**Objective**: Verify offline POS continues operating even if cache sync encounters constraint error.

**Test Steps**:
1. Login in offline mode
2. Perform operations (add products, create orders)
3. Trigger user data sync (may encounter constraint)
4. Verify POS continues working
5. Verify transactions queue correctly
6. Go online and sync

**Expected Result**:
- User cache sync may fail (or be handled gracefully)
- POS transactions continue queueing
- No UI interruption
- Sync reports partial success (user cache failed, transactions ok)
- Online sync completes successfully

**Playwright Code**:
```javascript
test('E2E: POS continues operating despite user cache sync failure', async ({ page }) => {
    // Navigate and login
    await page.goto('http://localhost:8000/pos/web');
    await page.fill('input[name="login"]', 'admin');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/pos/web?**');

    // Perform transaction while offline
    await page.click('button.product-1'); // Add product 1
    await page.click('button.product-2'); // Add product 2
    await page.fill('input[name="customer"]', 'Walk-in');

    // Force sync (may hit constraint error)
    await page.click('button.force-sync');

    // Wait for sync attempt
    await page.waitForTimeout(2000);

    // POS should still be responsive
    await page.click('button.product-3'); // Add another product

    // Verify transaction queued
    const cartCount = await page.locator('.cart-count').textContent();
    expect(parseInt(cartCount)).toBeGreaterThan(0);

    // Complete checkout
    await page.click('button.checkout');
    await page.fill('input[name="amount"]', '150');
    await page.click('button.pay');

    // Verify order created (even with user cache issues)
    const orderConfirm = await page.locator('.order-confirmation').isVisible();
    expect(orderConfirm).toBe(true);
});
```

---

### Test E2E 4: Page Visibility Change During Sync

**Objective**: Verify Wave 32 abort handling when page visibility changes during sync.

**Test Steps**:
1. Login in offline mode
2. Trigger sync
3. During sync, trigger page visibility change (switch tabs)
4. Page hidden and becomes visible again
5. Verify sync completes (via retry)

**Expected Result**:
- Sync may abort due to visibility change
- Wave 32 retry logic kicks in
- Sync eventually completes
- No ConstraintError

**Playwright Code**:
```javascript
test('E2E: Page visibility change during sync triggers Wave 32 retry', async ({ page }) => {
    // Setup page event handlers
    const syncEvents = [];

    page.on('console', msg => {
        if (msg.text().includes('Sync')) {
            syncEvents.push(msg.text());
        }
    });

    // Navigate and login
    await page.goto('http://localhost:8000/pos/web');
    await page.fill('input[name="login"]', 'admin');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/pos/web?**');

    // Start sync
    await page.click('button.force-sync');

    // Wait a moment for sync to be in progress
    await page.waitForTimeout(500);

    // Simulate page visibility change (hide)
    await page.evaluate(() => {
        const event = new Event('visibilitychange');
        Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => true
        });
        document.dispatchEvent(event);
    });

    // Wait
    await page.waitForTimeout(1000);

    // Make visible again
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => false
        });
        const event = new Event('visibilitychange');
        document.dispatchEvent(event);
    });

    // Wait for sync to complete (with retries)
    await page.waitForSelector('[data-sync-complete="true"]', { timeout: 30000 });

    // Verify sync eventually completed
    const syncComplete = await page.locator('[data-sync-complete="true"]').count();
    expect(syncComplete).toBeGreaterThan(0);

    // Verify no unhandled ConstraintError
    const constraintErrors = syncEvents.filter(e => e.includes('ConstraintError'));
    expect(constraintErrors.length).toBe(0);
});
```

---

## Performance Regression Tests

Tests to ensure no performance regression from the fix.

### Performance Test 1: User Sync Latency

**Objective**: Verify user sync latency stays under 100ms per user.

**Test Steps**:
1. Cache 10 users
2. Measure time for each saveUser() call
3. Calculate average latency
4. Verify under 100ms

**Expected Result**:
- saveUser() completes in <100ms per user
- Total sync of 10 users in <1000ms
- No latency increase from upsert logic

**Code Example (Jest)**:
```javascript
test('Performance: User sync latency <100ms per user', async () => {
    const users = Array(10).fill(null).map((_, i) => ({
        id: i + 1,
        login: `user${i}`,
        name: `User ${i}`,
        pos_offline_pin_hash: `hash${i}`
    }));

    const latencies = [];

    for (const user of users) {
        const start = performance.now();
        await offlineDB.saveUser(user);
        const latency = performance.now() - start;
        latencies.push(latency);
    }

    const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
    const maxLatency = Math.max(...latencies);

    console.log(`Average latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Max latency: ${maxLatency.toFixed(2)}ms`);

    expect(avgLatency).toBeLessThan(100);
    expect(maxLatency).toBeLessThan(200);
});
```

---

### Performance Test 2: Memory Usage During Multi-User Sync

**Objective**: Verify memory usage remains reasonable during multi-user sync.

**Test Steps**:
1. Record initial memory usage
2. Sync 50 users
3. Record memory after sync
4. Calculate memory increase
5. Verify under 50MB increase

**Expected Result**:
- Memory increase <50MB for 50 users
- No memory leaks
- Garbage collection works properly

**Code Example (Jest)**:
```javascript
test('Performance: Memory usage <50MB for 50 users', async () => {
    if (!global.gc) {
        console.warn('Skipping memory test - run with --expose-gc flag');
        return;
    }

    global.gc();
    const initialMemory = process.memoryUsage().heapUsed;

    const users = Array(50).fill(null).map((_, i) => ({
        id: i + 1,
        login: `user${i}`,
        name: `User ${i}`,
        pos_offline_pin_hash: `hash${i}`
    }));

    for (const user of users) {
        await offlineDB.saveUser(user);
    }

    global.gc();
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

    console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);

    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
});
```

---

### Performance Test 3: IndexedDB Query Performance

**Objective**: Verify no regression in IndexedDB query performance.

**Test Steps**:
1. Cache 100 users
2. Query by login index
3. Query all users
4. Measure query latencies
5. Verify under thresholds

**Expected Result**:
- getUserByLogin() <50ms
- getAllUsers() <500ms
- No regression from fix

**Code Example (Jest)**:
```javascript
test('Performance: IndexedDB queries remain fast', async () => {
    // Prepare 100 users
    const users = Array(100).fill(null).map((_, i) => ({
        id: i + 1,
        login: `user${i}`,
        name: `User ${i}`,
        pos_offline_pin_hash: `hash${i}`
    }));

    for (const user of users) {
        await offlineDB.saveUser(user);
    }

    // Test getUserByLogin
    const loginStart = performance.now();
    const user = await offlineDB.getUserByLogin('user50');
    const loginTime = performance.now() - loginStart;

    console.log(`getUserByLogin: ${loginTime.toFixed(2)}ms`);
    expect(loginTime).toBeLessThan(50);

    // Test getAllUsers
    const allStart = performance.now();
    const allUsers = await offlineDB.getAllUsers();
    const allTime = performance.now() - allStart;

    console.log(`getAllUsers (${allUsers.length} records): ${allTime.toFixed(2)}ms`);
    expect(allTime).toBeLessThan(500);
});
```

---

### Performance Test 4: Retry Logic Overhead

**Objective**: Verify Wave 32 retry logic doesn't add overhead in happy path.

**Test Steps**:
1. Measure saveUser() time on successful operation (no retry)
2. Compare with non-retryable operation
3. Verify overhead minimal

**Expected Result**:
- Retry overhead <10ms on successful operation
- Happy path unaffected by retry logic

**Code Example (Jest)**:
```javascript
test('Performance: Wave 32 retry logic minimal overhead on success', async () => {
    const user = {
        id: 1,
        login: 'admin',
        name: 'Admin',
        pos_offline_pin_hash: 'hash123'
    };

    // Measure successful save (no retry path taken)
    const startTime = performance.now();
    await offlineDB.saveUser(user);
    const duration = performance.now() - startTime;

    console.log(`saveUser (successful): ${duration.toFixed(2)}ms`);

    // Should complete quickly - retry logic shouldn't be invoked
    expect(duration).toBeLessThan(50);
});
```

---

## Test Mapping to Bug Aspects

**Bug Aspects vs Test Coverage Matrix:**

| Aspect | Root Cause | Test Category | Test Cases | Coverage |
|--------|-----------|----------------|-----------|----------|
| **Duplicate Login Insertion** | Race condition in check-before-insert | Test Category 1 | 1.3, 1.5, 2.4 | HIGH |
| **Upsert Logic Gaps** | Incomplete condition checking | Test Category 1 | 1.2, 1.3, 1.4 | HIGH |
| **ConstraintError Not Retried** | Not in retry list | Test Category 4 | 4.1, 4.2 | HIGH |
| **Multi-User Sync** | No constraint checks between users | Test Category 5 | 5.1, 5.2 | MEDIUM |
| **Error Recovery** | Sync doesn't handle gracefully | Test Category 3 | 3.1, 3.2, 3.3 | HIGH |
| **Page Visibility Abort** | Wave 32 transaction abort | Test Category 4 | 4.3, E2E 4 | MEDIUM |
| **User Switching** | Same-device multi-user caching | Test Category 5 | 5.2, 5.3, E2E 1 | MEDIUM |
| **Concurrent Operations** | No transaction isolation | Test Category 2 | 2.4, 2.5 | MEDIUM |
| **Edge Cases** | Null/undefined/empty values | Test Category 2 | 2.1, 2.2, 2.3 | MEDIUM |
| **Performance** | Potential regression from fix | Performance Tests | PT 1-4 | HIGH |

---

## Test Execution Guide

### Prerequisites
- Node.js 16+
- Jest test framework
- Playwright for E2E tests
- Odoo 19 instance running (for E2E)

### Unit & Integration Tests

```bash
# Run all unit/integration tests
npm test tests/offline_db.test.js

# Run specific test category
npm test -- --testNamePattern="Upsert Logic"

# Run with coverage
npm test -- --coverage

# Run with verbose output
npm test -- --verbose
```

### E2E Tests

```bash
# Run Playwright E2E tests
npx playwright test .spec/bugs/indexeddb-login-constraint-error/e2e-tests.js

# Run with UI mode (interactive)
npx playwright test --ui

# Run specific test
npx playwright test --grep "Multi-user offline"

# Generate test report
npx playwright test --reporter=html
```

### Performance Tests

```bash
# Run performance tests with GC exposure
node --expose-gc node_modules/.bin/jest tests/performance.test.js

# Generate performance report
npm test tests/performance.test.js > performance-report.txt
```

---

## Expected Test Results

### Target Metrics
- **Pass Rate**: 100% (all tests pass with fix)
- **Test Coverage**: 85%+ code coverage
- **Execution Time**: <5 minutes (unit + integration)
- **Performance**: No regression vs baseline

### Success Criteria
- No ConstraintError in any test
- All multi-user scenarios pass
- Graceful error handling verified
- Wave 32 retry logic verified
- E2E scenarios complete without errors

---

## Debugging Failed Tests

### If test fails with ConstraintError:
1. Check `offline_db.js` saveUser() implementation
2. Verify existing user check logic
3. Ensure ID merging works correctly
4. Add console.log statements in saveUser()

### If concurrent tests fail:
1. Verify transaction isolation
2. Check for race conditions in check-and-insert
3. Review Wave 32 retry logic
4. Increase timeout values if timing issue

### If performance test fails:
1. Profile with Chrome DevTools
2. Check for memory leaks in transaction handlers
3. Verify indexing on 'login' field
4. Profile with larger datasets

---

**Test Specification Complete**

This document provides comprehensive test specifications for the IndexedDB ConstraintError bug fix. All tests are designed to be implemented with Jest and Playwright without actually running them.

