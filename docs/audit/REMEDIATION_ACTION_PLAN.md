# PDC POS Offline - Critical Security Fixes Action Plan

**Date**: January 7, 2026
**Severity**: CRITICAL - 5 P0 items must be fixed before production
**Estimated Effort**: 12 hours (core fixes) + 8 hours (testing) = 20 hours

---

## PHASE 1: CRITICAL FIXES (12 Hours) - P0

### Fix #1: Transaction Durability (2 Hours)

**Problem**: Orders lost on browser crash because code waits for `request.onsuccess` instead of `tx.oncomplete`

**Files**:
- `/home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js` (lines 445-462, 681-703, all write operations)

**Action Items**:

1. Create test file: `/home/epic/dev/pdc-pos-offline/tests/transaction_durability.test.js`
   - Simulate browser crash during write
   - Verify transaction persists to IndexedDB
   - Test with 1000 rapid writes

2. Fix pattern in offline_db.js (40+ occurrences):
   ```javascript
   // BEFORE (BROKEN):
   return new Promise((resolve, reject) => {
       const request = store.put(data);
       request.onsuccess = () => resolve(data);  // TOO EARLY!
       request.onerror = () => reject(request.error);
       tx.onabort = () => reject(new Error('Transaction aborted'));
   });

   // AFTER (FIXED):
   return new Promise((resolve, reject) => {
       const request = store.put(data);
       request.onerror = () => reject(request.error);

       tx.oncomplete = () => {
           console.log('[PDC-Offline] Transaction durably committed');
           resolve(data);  // CORRECT: Only after tx commits
       };
       tx.onerror = () => reject(tx.error);
       tx.onabort = () => reject(new Error('Transaction aborted'));
   });
   ```

3. Methods to fix (all follow same pattern):
   - `saveSession()` (line 445)
   - `saveTransaction()` (line 681)
   - `saveOrder()` (line 940)
   - `markTransactionSynced()` (line 817)
   - `incrementTransactionAttempt()` (line 845)
   - `deleteTransaction()` (line 873)
   - `saveProduct()` (line 1330+)
   - `saveCategory()` (line 1460+)
   - `savePaymentMethods()` (line 1554)
   - `saveTaxes()` (line 1622)
   - All delete operations (14 more)

**Verification**:
```bash
# Run durability test
npm test -- tests/transaction_durability.test.js

# Manual test:
# 1. Start POS
# 2. Create order offline
# 3. Immediately kill browser
# 4. Restart browser
# 5. Verify order still in IndexedDB
```

**Estimated Effort**: 2 hours
**Impact**: Prevents data loss from crashes

---

### Fix #2: Conflict Detection (4 Hours)

**Problem**: Server data overwritten silently (Last-Write-Wins clobber)

**Files**:
- `/home/epic/dev/pdc-pos-offline/static/src/js/sync_manager.js` (lines 174-182, 184-189)

**Action Items**:

1. Add version/timestamp fields to sync data:
   ```javascript
   // In pos_offline_patch.js - when saving order offline:
   const orderData = {
       ...orderFromUI,
       offline_id: generateUUID(),
       created_offline: true,
       created_at: new Date().toISOString(),
       local_version: 1,  // NEW: Track version
       local_timestamp: Date.now()  // NEW: Server can detect conflicts
   };
   ```

2. Implement conflict detection in sync_manager.js:
   ```javascript
   async syncOrder(orderData) {
       // Check if order already exists
       const existing = await this.pos.env.services.orm.search_read('pos.order',
           [['offline_id', '=', orderData.offline_id || null]],
           ['id', 'write_date', 'state']
       );

       if (existing && existing.length > 0) {
           const serverOrder = existing[0];
           const serverModTime = new Date(serverOrder.write_date).getTime();
           const clientModTime = orderData.local_timestamp || 0;

           if (serverModTime > clientModTime) {
               // CONFLICT: Server version is newer
               console.warn('[PDC-Offline] Conflict detected on order', orderData.offline_id);

               await this.saveSyncError({
                   transaction_id: orderData.offline_id,
                   error_type: 'conflict_detected',
                   error_message: `Order modified on server (${serverModTime}) after offline edit (${clientModTime})`,
                   context: {
                       conflict: true,
                       serverVersion: serverOrder.write_date,
                       clientTimestamp: orderData.local_timestamp,
                       resolution: 'manual_review_required'
                   }
               });

               // Merge strategy: Client override for now, with flagging
               // TODO: Implement 3-way merge later
               return this._mergeOrderData(orderData, serverOrder);
           }
       }

       // No conflict, create order
       return await this.pos.env.services.orm.create('pos.order', [orderData]);
   }

   _mergeOrderData(clientOrder, serverOrder) {
       // Simple merge: Keep server order, log client changes
       return {
           ...serverOrder,
           merge_required: true,
           client_changes: clientOrder,
           needs_manual_review: true
       };
   }
   ```

3. Create conflict test:
   ```bash
   # File: tests/conflict_detection.test.js
   # Scenario:
   # 1. Offline: Create order with qty=5
   # 2. Meanwhile: Server creates same order with qty=8
   # 3. Sync: Conflict detected and logged
   # 4. Result: Merge applied or manual review flagged
   ```

**Verification**:
```bash
npm test -- tests/conflict_detection.test.js
```

**Estimated Effort**: 4 hours
**Impact**: Prevents silent data loss from overwrites

---

### Fix #3: Idempotency Keys (3 Hours)

**Problem**: Duplicate charges if payment sync retried multiple times

**Files**:
- `/home/epic/dev/pdc-pos-offline/static/src/js/sync_manager.js` (lines 184-189)
- `/home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js` (lines 687-695 - transaction ID generation)

**Action Items**:

1. Generate strong idempotency keys:
   ```javascript
   // In offline_db.js saveTransaction():
   const data = {
       id: transaction.id || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
       uuid: transaction.uuid || crypto.randomUUID(),  // NEW: Standard UUID
       type: transaction.type,
       data: transaction.data,
       created_at: new Date().toISOString(),
       synced: false,
       attempts: 0,
       // ADD: Idempotency key for deduplication
       request_id: transaction.uuid || crypto.randomUUID()  // Used by server
   };
   ```

2. Send idempotency key with every sync request:
   ```javascript
   // In sync_manager.js:
   async syncPayment(paymentData) {
       const requestId = paymentData.uuid || paymentData.request_id;

       if (!requestId) {
           throw new Error('Payment missing UUID - cannot sync without idempotency key');
       }

       try {
           const response = await this.pos.env.services.orm.create('pos.payment', [{
               ...paymentData,
               request_id: requestId,  // Server checks this
               idempotency_key: requestId  // Alternative field name
           }]);

           return response;
       } catch (error) {
           // Check if error is duplicate
           if (error.message.includes('already processed') ||
               error.message.includes('duplicate')) {
               // Request was already processed - find existing payment
               const existing = await this.pos.env.services.orm.search_read('pos.payment',
                   [['request_id', '=', requestId]],
                   ['id', 'state', 'amount']
               );

               if (existing && existing.length > 0) {
                   console.log('[PDC-Offline] Duplicate detected, using existing payment');
                   return existing[0];  // Return existing instead of error
               }
           }

           throw error;
       }
   }

   async syncOrder(orderData) {
       // Same pattern for orders
       const requestId = orderData.uuid || orderData.request_id;

       try {
           return await this.pos.env.services.orm.create('pos.order', [{
               ...orderData,
               request_id: requestId
           }]);
       } catch (error) {
           if (error.message.includes('already processed')) {
               const existing = await this.pos.env.services.orm.search_read('pos.order',
                   [['request_id', '=', requestId]]
               );
               return existing[0];
           }
           throw error;
       }
   }
   ```

3. Test duplicate detection:
   ```javascript
   // File: tests/idempotency.test.js
   // Scenario:
   // 1. Payment 1: uuid=ABC, request_id=ABC
   // 2. Server processes, saves with request_id=ABC
   // 3. Client retries: same uuid=ABC
   // 4. Server detects duplicate by request_id
   // 5. Returns existing payment, not new charge
   ```

**Verification**:
```bash
npm test -- tests/idempotency.test.js
```

**Estimated Effort**: 3 hours
**Impact**: Prevents duplicate charges

---

### Fix #4: Session Token Expiry (1 Hour)

**Problem**: Sessions never expire while offline - unlimited access if device stolen

**Files**:
- `/home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js` (lines 490-509)
- `/home/epic/dev/pdc-pos-offline/static/src/js/session_persistence.js` (lines 81-96)

**Action Items**:

1. Add expiry check in getActiveSession():
   ```javascript
   // In offline_db.js line 490+:
   async getActiveSession() {
       return this._executeWithRetry(async () => {
           const tx = this.getNewTransaction(['sessions'], 'readonly');
           const store = tx.objectStore('sessions');

           return new Promise((resolve, reject) => {
               const request = store.openCursor(null, 'prev');
               request.onsuccess = (event) => {
                   const cursor = event.target.result;
                   if (cursor) {
                       const session = cursor.value;

                       // NEW: Check session expiry
                       const now = new Date();
                       const createdAt = new Date(session.created);
                       const sessionAgeSecs = (now - createdAt) / 1000;
                       const SESSION_MAX_AGE = 4 * 60 * 60;  // 4 hours = Odoo default

                       if (sessionAgeSecs > SESSION_MAX_AGE) {
                           console.warn('[PDC-Offline] Session expired after', sessionAgeSecs, 'seconds');
                           // Don't return expired session - continue to next
                           cursor.continue();
                           return;
                       }

                       // Check user data exists
                       if (session.user_id || session.user_data?.id) {
                           resolve(session);
                       } else {
                           cursor.continue();
                       }
                   } else {
                       resolve(null);
                   }
               };
               request.onerror = () => reject(request.error);
               tx.onabort = () => reject(new Error('Transaction aborted'));
           });
       }, 'getActiveSession');
   }
   ```

2. Add expiry check in restoreSession():
   ```javascript
   // In session_persistence.js:
   async restoreSession() {
       const session = await offlineDB.getSession(sessionId);
       if (!session) return null;

       // NEW: Validate session not expired
       const now = new Date();
       const createdAt = new Date(session.created);
       const ageSeconds = (now - createdAt) / 1000;
       const MAX_AGE = 4 * 60 * 60;  // 4 hours

       if (ageSeconds > MAX_AGE) {
           console.warn('[PDC-Offline] Restored session is expired');
           await offlineDB.deleteSession(sessionId);
           return null;  // Force re-login
       }

       await offlineDB.updateSessionAccess(sessionId);
       return session;
   }
   ```

3. Test expiry:
   ```javascript
   // File: tests/session_expiry.test.js
   // Scenario:
   // 1. Create session at T=0
   // 2. Advance system time 5 hours
   // 3. Try to restore session
   // 4. Verify null returned (expired)
   ```

**Verification**:
```bash
npm test -- tests/session_expiry.test.js
```

**Estimated Effort**: 1 hour
**Impact**: Prevents unauthorized access

---

### Fix #5: Queue Processor (2 Hours)

**Problem**: Transaction queue never drains - items deleted on overflow without processing

**Files**:
- `/home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js` (lines 26-34, 415-426)

**Action Items**:

1. Remove unused queue code (lines 26-34, 415-426 of offline_db.js are dead code):
   ```javascript
   // DELETE THESE UNUSED FIELDS:
   this._transactionQueue = [];  // Never used
   this._activeTransactions = new Map();  // Never used
   this._processingQueue = false;  // Never used
   this._maxQueueSize = 500;  // Never used
   this._queueEvictionPolicy = 'oldest';  // Never used

   // DELETE: _enforceQueueSizeLimit() - unused method
   // DELETE: _monitorQueueHealth() - unused method
   ```

2. Use IndexedDB queue instead (transactions table IS the queue):
   ```javascript
   // In sync_manager.js - this already works:
   async syncOfflineTransactions() {
       const pendingTransactions = await this.getPendingTransactions();  // Reads from DB
       for (const transaction of pendingTransactions) {
           try {
               await this.syncTransaction(transaction);
               await this.deleteTransaction(transaction.id);  // Remove from queue after success
           } catch (error) {
               // Remains in queue for retry
           }
       }
   }
   ```

3. The actual "queue processing" is already happening in sync_manager.js
   - Just remove misleading transaction queue code from offline_db.js
   - Real queue is: pending transactions in IndexedDB

**Verification**:
```bash
# Verify no reference to _transactionQueue:
grep -n "_transactionQueue" /home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js
# Should return 0 matches after cleanup
```

**Estimated Effort**: 2 hours (mostly cleanup and verification)
**Impact**: Removes misleading dead code, prevents confusion

---

## PHASE 2: TESTING & VERIFICATION (8 Hours)

### Test Suite Setup (2 Hours)

Create comprehensive test files:

1. **Crash Simulation** (`tests/crash_recovery.test.js`)
   - Create order → Kill process → Restart → Verify order exists
   - Create payment → Crash mid-write → Verify consistent state

2. **Conflict Resolution** (`tests/conflict_scenarios.test.js`)
   - Concurrent edits
   - Server wins vs client wins
   - Merge strategies

3. **Idempotency** (`tests/duplicate_prevention.test.js`)
   - Same UUID sent 5 times
   - Verify only one record created
   - Server rejects duplicates

4. **Session Security** (`tests/session_security.test.js`)
   - Expired session rejected
   - Token validation on reconnect
   - Device theft scenario

5. **Network Flickers** (`tests/network_resilience.test.js`)
   - Random on/off/on cycles
   - Transactions during toggle
   - No duplicates or loss

6. **Multi-Tab** (`tests/multi_tab.test.js`)
   - Tab 1 crashes with DB lock
   - Tab 2 waits 30s then recovers
   - No data loss

### Test Execution (6 Hours)

```bash
# Run all new tests
npm test -- tests/crash_recovery.test.js \
             tests/conflict_scenarios.test.js \
             tests/duplicate_prevention.test.js \
             tests/session_security.test.js \
             tests/network_resilience.test.js \
             tests/multi_tab.test.js

# All tests must pass before deployment
```

---

## PHASE 3: DEPLOYMENT VALIDATION (2 Hours)

### Pre-Deployment Checklist

- [ ] All 5 P0 fixes implemented
- [ ] All new tests passing
- [ ] No regression in existing tests
- [ ] Code reviewed by 2+ reviewers
- [ ] Manual testing on real device
- [ ] Documentation updated
- [ ] Deployment notes prepared

### Deployment

```bash
# 1. Tag release
git tag -a v1.0.1-security-hotfix -m "Critical security fixes"

# 2. Build
npm run build

# 3. Deploy to staging
npm run deploy:staging

# 4. Run smoke tests
npm test:smoke

# 5. Deploy to production
npm run deploy:production
```

---

## Timeline

| Phase | Duration | Owner | Deadline |
|-------|----------|-------|----------|
| Fix #1: Durability | 2h | Backend | Day 1 PM |
| Fix #2: Conflicts | 4h | Backend | Day 2 AM |
| Fix #3: Idempotency | 3h | Backend | Day 2 PM |
| Fix #4: Session Expiry | 1h | Backend | Day 2 PM |
| Fix #5: Queue Cleanup | 2h | Backend | Day 3 AM |
| **Core Fixes Subtotal** | **12h** | | **Day 3 Noon** |
| Phase 2: Testing | 8h | QA/Backend | Day 3-4 |
| Phase 3: Deployment | 2h | DevOps | Day 4 PM |
| **TOTAL** | **22h** | | **Day 4 EOD** |

---

## Rollback Plan

If issues found during deployment:

1. **Rollback to previous version**:
   ```bash
   git revert <commit-sha>
   npm run deploy:production --force
   ```

2. **Hotfix if simple issue**:
   - Create bug fix branch
   - Fix issue
   - Re-test
   - Deploy again

3. **Communication**:
   - Notify support
   - Update status page
   - Customer communication

---

## Sign-Off

- [ ] Security Lead: _______________ Date: _______
- [ ] Development Lead: _______________ Date: _______
- [ ] QA Lead: _______________ Date: _______
- [ ] Product Owner: _______________ Date: _______

---

## Follow-Up Improvements (Not Critical)

After P0 fixes are deployed, address these in next sprint:

- Fix Flaw 3.2: Session restore validation
- Fix Flaw 4.1: Stale cache detection
- Fix Flaw 5.1: Race condition in rapid cycles
- Fix Flaw 6.2: Storage quota overflow handling
- Fix Flaw 7.1: Transaction during connectivity check

---

**Document Version**: 1.0
**Last Updated**: 2026-01-07
**Status**: Ready for Implementation
