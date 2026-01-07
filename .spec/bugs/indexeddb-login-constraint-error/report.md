# Odoo Module Bug Report: IndexedDB Login Constraint Error

## Bug Overview
- **Module**: pdc-pos-offline
- **Component**: Offline Database Management (IndexedDB)
- **Severity**: **Medium** (Error is caught gracefully but indicates sync data issue)
- **Status**: Open
- **Created**: 2026-01-07
- **Reporter**: King - PDC Standard Orchestrator
- **Type**: Data Integrity / Sync Issue

---

## Environment Information
- **Odoo Version**: 19.0
- **Environment**: Production & Staging
- **Database**: PostgreSQL 15+ (backend) + IndexedDB (browser-side)
- **Browser Support**: All modern browsers (Chrome, Firefox, Safari, Edge)
- **Module Version**: 19.0.1.0.5 (Wave 32)

---

## Module Context
- **Module Path**: `/home/epic/dev/pdc-pos-offline/`
- **Module Name**: pdc-pos-offline (POS Offline Mode)
- **Module Version**: 19.0.1.0.5 (Wave 32 - IndexedDB Transaction Abort Fix)
- **Dependencies**:
  - `pos` (Point of Sale - native Odoo)
  - `pos_iot` (for hardware integration)
  - `web` (core Odoo web framework)
- **Custom/Standard**: Custom POS offline implementation

---

## Bug Description

### Summary
IndexedDB transaction encounters `ConstraintError` on the 'login' unique index during offline user data synchronization. The error occurs when attempting to cache user information locally with an enforced unique constraint on the `login` field.

**Error Message**:
```
ConstraintError: Unable to add key to index 'login':
at least one key does not satisfy the uniqueness requirements.
```

### Business Impact
**Critical for Offline Mode**:
- Users cannot reliably sync their login data while offline
- Multiple POS sessions with the same user may cause cache corruption
- Affects offline PIN authentication reliability
- Potential data inconsistency between offline cache and Odoo backend

**User-Facing Impact**:
- Offline POS transactions may have stale user data
- User authentication in offline mode becomes unreliable
- Multiple user logins to same device may fail

**Testing Impact**:
- Prevents comprehensive testing of multi-user offline scenarios
- Affects Wave 32 reliability metrics (currently showing 95%+ success rate - may be inflated)

### Technical Symptoms

**Console Errors**:
```
sync_manager.js:247 Failed to update cached data: ConstraintError:
  Unable to add key to index 'login': at least one key does not satisfy the
  uniqueness requirements.

offline_db.js:305 Transaction error: ConstraintError:
  Unable to add key to index 'login': at least one key does not satisfy the
  uniqueness requirements.
```

**Key Observations**:
1. Error occurs in `sync_manager.js:247` during `updateCachedData()` call
2. Second error in `offline_db.js:305` from transaction error handler
3. Sync still completes successfully despite error (graceful degradation)
4. Error indicates attempt to insert duplicate login values

---

## Reproduction Steps

### Prerequisites
1. Odoo 19 with pdc-pos-offline module installed
2. Multiple user accounts in system (e.g., 2+ POS operators)
3. Browser with IndexedDB support
4. Network connectivity to test offline mode

### Steps to Reproduce
1. Open POS offline mode in Chrome DevTools (Console tab visible)
2. Login as **User A** in offline mode
3. Clear browser cache/IndexedDB (DevTools → Application → Storage → IndexedDB)
4. Trigger full sync from POS (manual sync button or auto-sync)
5. **Observe**: Console shows ConstraintError for 'login' index
6. Repeat steps 2-5 with **User B** (different login)
7. **Result**: Same ConstraintError may occur on second user

### Expected Behavior
- Users sync offline data without errors
- Multiple users can cache their data independently
- No constraint violations on unique index
- Sync completes silently with success message

### Actual Behavior
- `ConstraintError` logged to console for 'login' index
- Error message indicates unique constraint violation
- Sync completes despite error (degraded but functional)
- Repeated syncs may accumulate constraint errors

---

## ERP Context Analysis

### Affected Business Processes
1. **Offline POS Operations**:
   - User caches for offline authentication
   - Impact: Unreliable user switching in offline mode

2. **Multi-Location Sales**:
   - Multiple POS terminals with different users
   - Impact: Data sync conflicts between terminals

3. **Session Management**:
   - User session caching for offline continuity
   - Impact: Session data may be corrupted or stale

### Multi-company Considerations
- Issue affects single-company deployments
- In multi-company scenarios: Each company's users synced to same device
- Risk: Cross-company user data conflicts

### Integration Impact
- **pos (native Odoo)**: User authentication flow affected
- **pos_iot (hardware)**: User PIN entry uses cached data
- **res.users (Odoo ORM)**: User record sync between backend and offline cache
- **sync_manager.js**: Sync orchestration fails gracefully

---

## Technical Details

### Error Location Analysis

**File 1: `sync_manager.js` (Line 247)**
```javascript
// Line 240-248
await offlineDB.saveUser(user);
// ...
} catch (error) {
    console.error('Failed to update cached data:', error);
}
```
- Error occurs during `saveUser()` call
- Error is caught but only logged (no retry or handling)
- Continues to next user in sync cycle

**File 2: `offline_db.js` (Line 250 - Index Definition)**
```javascript
// Line 248-251
if (!db.objectStoreNames.contains('users')) {
    const userStore = db.createObjectStore('users', { keyPath: 'id' });
    userStore.createIndex('login', 'login', { unique: true });
}
```
- Defines 'users' object store with unique constraint on 'login' field
- This is correct schema design

**File 3: `offline_db.js` (Lines 501-518 - Save Logic)**
```javascript
async saveUser(userData) {
    return this._executeWithRetry(async () => {
        // Check if user with same login already exists
        const loginIndex = store.index('login');
        const existingUser = await loginIndex.get(userData.login);

        if (existingUser && existingUser.id !== userData.id) {
            data.id = existingUser.id; // Use existing ID to prevent constraint violation
        }

        return new Promise((resolve, reject) => {
            const request = store.put(data);
            // ...
        });
    });
}
```
- Code checks for existing user before insert (good)
- Uses `put()` for upsert semantics (correct)
- But checks `existingUser.id !== userData.id` - this is the issue!

**File 4: `offline_db.js` (Lines 351-386 - Retry Logic)**
```javascript
async _executeWithRetry(operation, operationName = 'operation') {
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        try {
            return await operation();
        } catch (error) {
            // Only retry on abort or quota errors
            const isAbortable = error.name === 'AbortError' ||
                              error.message?.includes('aborted') ||
                              error.name === 'QuotaExceededError';

            if (!isAbortable) {
                throw error; // Don't retry other errors
            }
            // Retry logic...
        }
    }
}
```
- **CRITICAL ISSUE**: `ConstraintError` is NOT in the retry list
- ConstraintError thrown immediately without retry
- Should be added to `isAbortable` check OR handled separately

---

## Root Cause Analysis

### Primary Issue: Race Condition in User Cache

**Scenario**:
1. User A (login: "admin") syncs successfully, cached with ID: 1
2. Later, User A's record is updated in backend (same login, ID still 1)
3. During next sync, userData comes through with correct id: 1
4. But existing check fails due to timing or missing conditions
5. Code attempts to insert duplicate login → ConstraintError

### Secondary Issue: Incomplete Error Recovery

The `_executeWithRetry` method does NOT retry on `ConstraintError`:
- Only retries: `AbortError`, `QuotaExceededError`
- Fails immediately on: `ConstraintError`, `InvalidStateError`, etc.
- ConstraintError should be handled either:
  - As retryable (unlikely to resolve on retry)
  - As handled exception with logging
  - With upsert logic that guarantees no constraint violation

### Tertiary Issue: Sync Logic Gap

Looking at `sync_manager.js:240-248`:
```javascript
try {
    await offlineDB.saveUser(user);
} catch (error) {
    console.error('Failed to update cached data:', error);
    // NO HANDLING - continues silently
}
```
- Error is logged but sync marked as success
- User data may not be cached at all
- Subsequent offline operations may use stale data

---

## Wave 32 Compatibility

### Wave 32 Context
Wave 32 added exponential backoff retry logic to `offline_db.js`:
- Wraps 58 database methods with `_executeWithRetry`
- Handles AbortError from page visibility changes
- Uses 5-retry strategy with [100ms, 200ms, 500ms, 1000ms, 2000ms] delays

### Wave 32 Impact on Bug
- `saveUser()` wrapped in `_executeWithRetry` (line 497)
- But ConstraintError NOT in retry conditions (lines 361-367)
- **Result**: ConstraintError bypasses Wave 32 retry logic entirely
- This may actually be correct behavior (no point retrying constraint violation)
- But error should be handled more gracefully

---

## Affected Code Models & Fields

### Model: res.users (Odoo ORM)
**Odoo Fields**:
- `id`: User ID (primary key)
- `login`: Username (unique in Odoo)
- `name`: Display name
- `email`: User email
- `groups_id`: Security groups

**IndexedDB Cache Fields** (in `users` store):
```javascript
{
    id: <number>,           // Primary key
    login: <string>,        // Unique index key
    name: <string>,
    email: <string>,
    groups: <array>,
    cached_at: <ISO timestamp>
}
```

### Index Definition
- **Store**: `users`
- **Key Path**: `id` (primary key)
- **Index Name**: `login`
- **Index Key Path**: `login`
- **Unique**: **true** (enforced at browser level)

---

## Security & Data Integrity Considerations

### Security Impact
- **Low**: No credential exposure in errors
- **Data Privacy**: User logins may be logged in console (GDPR consideration)

### Data Integrity Issues
- **Cache Inconsistency**: May lead to stale user data in offline mode
- **Authentication Risk**: Offline PIN auth may use wrong user cache
- **Multi-user Device**: Multiple users on same device may interfere with caches

---

## User Impact Assessment

### Affected User Roles
1. **POS Operators**:
   - Impact: Offline POS may have cached wrong user data
   - Severity: Medium (operations continue with stale data)

2. **Multi-location Managers**:
   - Impact: User data sync failures across locations
   - Severity: Medium (affects reliability metrics)

3. **System Administrators**:
   - Impact: Difficult to diagnose user sync issues
   - Severity: Low (errors logged but not actionable)

### Workaround Available
**YES** - Limited workaround exists:
1. Clear IndexedDB cache (Application → Storage → Delete offline DB)
2. Force full sync by closing/reopening POS
3. Log out and log back in
4. Avoid multi-user scenarios on same device until fixed

**Limitations**:
- Workaround loses offline data (queued transactions)
- Not suitable for production environments
- User confusion about why sync fails

### Business Continuity
- **Can continue**: YES, with degradation
- **Manual intervention**: Required for cache reset
- **Alternative process**: Use online-only mode

---

## Related Issues & Dependencies

### Related Components
- **Wave 32**: IndexedDB Transaction Abort Fix (this module's current version)
  - Introduces retry logic but doesn't handle ConstraintError

- **sync_manager.js**: Orchestrates user data sync
  - Needs better error handling for ConstraintError

- **offline_db.js**: Core database operations
  - Needs constraint-aware upsert logic

### Similar Issues
- Page visibility changes during sync (Wave 32 addressed)
- Transaction abort on connection loss (Wave 32 addressed)
- Quota exceeded errors (Wave 32 addresses via retry)

---

## Testing Impact

### Current Test Coverage
- Unit tests: 30+ (retry logic, models)
- Integration tests: 18+ (visibility changes, concurrent ops)
- E2E tests: 12+ (browser automation)
- **Coverage**: 80%+

### Test Gap
- **Missing**: Multi-user offline sync scenarios
- **Missing**: Same-login cached user updates
- **Missing**: ConstraintError recovery scenarios

---

## Proposed Resolution Approach

### Option 1: Improve Upsert Logic (RECOMMENDED)
**Problem**: Current check `if (existingUser && existingUser.id !== userData.id)` may not cover all cases

**Solution**:
- Always use existing user ID if login matches (simpler logic)
- Update all fields except ID
- Guarantee no constraint violation

### Option 2: Handle ConstraintError Specifically
**Problem**: ConstraintError falls through retry logic

**Solution**:
- Add ConstraintError to retry conditions
- Or add dedicated ConstraintError handler
- Log more context for debugging

### Option 3: Validate Before Insert
**Problem**: Race conditions between check and insert

**Solution**:
- Use IndexedDB transaction for atomic check-and-upsert
- Wrap entire operation in single transaction
- Eliminate timing windows

---

## Additional Information

### Related Documentation
- [Wave 32 Completion Summary](../../WAVE32_COMPLETION_SUMMARY.md)
- [Odoo 19 Standards Audit](../../ODOO19_AUDIT_COMPLETION_REPORT.md)
- [Deployment Guide](../../DEPLOYMENT_GUIDE.md)
- [Testing Specifications](.../../.spec/testing/)

### Recent Changes
- **Wave 32**: Added exponential backoff retry logic (commit: c73dab0)
- **Testing**: Added 70+ test cases (commit: 776fec2)
- **Steering**: Updated Odoo 19 standards (commit: d89f6a8)

### Frequency & Reproducibility
- **Frequency**: Occurs intermittently during user data sync
- **Reproducibility**: Can be triggered by syncing multiple users
- **Consistency**: More common with rapid user switches or multi-device testing

---

## Attachments & Evidence

### Console Logs
```javascript
[PDC-Offline] Sync started
sync_manager.js:247 Failed to update cached data: ConstraintError: Unable to add key to index 'login': at least one key does not satisfy the uniqueness requirements.
offline_db.js:305 Transaction error: ConstraintError: Unable to add key to index 'login': at least one key does not satisfy the uniqueness requirements.
[PDC-Offline] Sync completed successfully
```

### File References
- **sync_manager.js**: Lines 240-248 (error logging location)
- **offline_db.js**:
  - Lines 250 (index definition)
  - Lines 351-386 (retry logic)
  - Lines 501-518 (saveUser implementation)

### Affected Files
- `static/src/js/sync_manager.js` (sync orchestration)
- `static/src/js/offline_db.js` (database operations)

---

## Summary

**Bug**: IndexedDB ConstraintError on 'login' unique index during offline user synchronization

**Root Cause**: Race condition in user cache synchronization where existing user check doesn't prevent duplicate login insertion in all scenarios

**Wave 32 Context**: Retry logic doesn't handle ConstraintError (only AbortError and QuotaExceededError)

**Impact**: Offline user data sync fails silently, degrading offline mode reliability

**Resolution**: Fix upsert logic to guarantee constraint compliance and add proper ConstraintError handling

**Priority**: Medium (graceful degradation but affects reliability metrics)

---

**Status**: 🔴 **OPEN - PENDING ANALYSIS & IMPLEMENTATION**
**Next Step**: `/odoo-bug-analyze` for detailed root cause investigation

