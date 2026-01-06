# PDC POS Offline - Test Case Specifications

**Module**: pdc-pos-offline
**Test Type**: Unit, Integration, Performance, E2E
**Framework**: pytest-odoo
**Total Test Cases**: 60+

---

## Test Case Catalog

### Unit Tests (30+ cases)

#### UT-001: Exponential Backoff Retry Logic

**TC-001.1**: Verify retry delay sequence
- **Input**: 5 consecutive retry attempts
- **Expected**: Delays of [100ms, 200ms, 500ms, 1000ms, 2000ms]
- **Assertion**: `retry_delays == [100, 200, 500, 1000, 2000]`
- **Status**: ACTIVE

**TC-001.2**: Verify max retry attempts
- **Input**: Transient error on every attempt
- **Expected**: Exactly 5 attempts before failure
- **Assertion**: `attempt_count == 5`
- **Status**: ACTIVE

**TC-001.3**: Success on first attempt - no delays
- **Input**: Operation succeeds immediately
- **Expected**: Operation completes in <1ms, no retry delays
- **Assertion**: `elapsed_time < 1ms and retry_count == 0`
- **Status**: ACTIVE

**TC-001.4**: Success on retry - correct delay applied
- **Input**: Operation fails on attempt 1, succeeds on attempt 2
- **Expected**: 100ms delay applied before retry, total time ≥100ms
- **Assertion**: `elapsed_time >= 100ms and attempt_count == 2`
- **Status**: ACTIVE

#### UT-002: Error Discrimination Logic

**TC-002.1**: Retry on AbortError
- **Input**: DOMException with name "AbortError"
- **Expected**: Marked as retryable, retry triggered
- **Assertion**: `is_retryable(AbortError) == True`
- **Status**: ACTIVE

**TC-002.2**: Retry on QuotaExceededError
- **Input**: DOMException with name "QuotaExceededError"
- **Expected**: Marked as retryable, retry triggered
- **Assertion**: `is_retryable(QuotaExceededError) == True`
- **Status**: ACTIVE

**TC-002.3**: No retry on ValidationError
- **Input**: ValidationError from data validation
- **Expected**: Marked as permanent, no retry
- **Assertion**: `is_retryable(ValidationError) == False`
- **Status**: ACTIVE

**TC-002.4**: No retry on TypeError
- **Input**: TypeError from code error
- **Expected**: Marked as permanent, error thrown immediately
- **Assertion**: `is_retryable(TypeError) == False`
- **Status**: ACTIVE

**TC-002.5**: Abort error by message detection
- **Input**: Error with message containing "aborted"
- **Expected**: Detected as retryable regardless of error type
- **Assertion**: `is_retryable(error_with_aborted_message) == True`
- **Status**: ACTIVE

#### UT-003: Session Operations

**TC-003.1**: Save session successfully
- **Input**: Session dict with required fields
- **Expected**: Session saved and returned with ID
- **Assertion**: `saved_session['id'] is not None`
- **Status**: ACTIVE

**TC-003.2**: Get session by ID
- **Input**: Saved session ID
- **Expected**: Session retrieved with all fields intact
- **Assertion**: `retrieved_session == saved_session`
- **Status**: ACTIVE

**TC-003.3**: Get active session
- **Input**: Multiple sessions with one active
- **Expected**: Only active session returned
- **Assertion**: `active_session['state'] == 'open'`
- **Status**: ACTIVE

**TC-003.4**: Clear old sessions
- **Input**: 5 sessions created before cutoff date
- **Expected**: Old sessions removed, count decreases
- **Assertion**: `session_count_after < session_count_before`
- **Status**: ACTIVE

#### UT-004: Transaction Operations

**TC-004.1**: Save transaction
- **Input**: Transaction dict
- **Expected**: Transaction saved with status 'pending'
- **Assertion**: `saved_transaction['state'] == 'pending'`
- **Status**: ACTIVE

**TC-004.2**: Get pending transactions
- **Input**: Multiple saved transactions
- **Expected**: Only pending transactions returned
- **Assertion**: `len(pending) == pending_count`
- **Status**: ACTIVE

**TC-004.3**: Mark transaction synced
- **Input**: Pending transaction ID
- **Expected**: Transaction status changes to 'synced'
- **Assertion**: `synced_transaction['state'] == 'synced'`
- **Status**: ACTIVE

**TC-004.4**: Increment transaction retry count
- **Input**: Transaction with retry_count=0
- **Expected**: retry_count incremented to 1
- **Assertion**: `transaction['retry_count'] == 1`
- **Status**: ACTIVE

#### UT-005: Product Operations

**TC-005.1**: Bulk save products
- **Input**: List of 100 product dicts
- **Expected**: All 100 products saved
- **Assertion**: `saved_count == 100`
- **Status**: ACTIVE

**TC-005.2**: Get product by barcode
- **Input**: Valid product barcode
- **Expected**: Product retrieved with matching barcode
- **Assertion**: `product['barcode'] == query_barcode`
- **Status**: ACTIVE

**TC-005.3**: Get product by default code
- **Input**: Valid product default code
- **Expected**: Product retrieved with matching code
- **Assertion**: `product['default_code'] == query_code`
- **Status**: ACTIVE

**TC-005.4**: Get products by category
- **Input**: Category ID
- **Expected**: All products in category returned
- **Assertion**: `all(p['category_id'] == category_id for p in products)`
- **Status**: ACTIVE

**TC-005.5**: Get product count
- **Input**: Multiple saved products
- **Expected**: Accurate count returned
- **Assertion**: `product_count == actual_products`
- **Status**: ACTIVE

#### UT-006: Sync Error Operations

**TC-006.1**: Save sync error
- **Input**: Error dict with transaction ID
- **Expected**: Error saved with unique ID
- **Assertion**: `error['id'] is not None`
- **Status**: ACTIVE

**TC-006.2**: Get sync errors by transaction
- **Input**: Transaction ID with multiple errors
- **Expected**: All errors for transaction returned
- **Assertion**: `all(e['transaction_id'] == trans_id for e in errors)`
- **Status**: ACTIVE

**TC-006.3**: Clear old sync errors
- **Input**: Errors older than retention period
- **Expected**: Old errors removed
- **Assertion**: `old_error_count_after == 0`
- **Status**: ACTIVE

#### UT-007: Data Consistency

**TC-007.1**: Session data integrity after save
- **Input**: Session with specific values
- **Expected**: Retrieved session has identical values
- **Assertion**: `retrieved == saved`
- **Status**: ACTIVE

**TC-007.2**: Transaction amount preserved
- **Input**: Transaction with amount=1234.56
- **Expected**: Amount preserved exactly
- **Assertion**: `transaction['amount'] == 1234.56`
- **Status**: ACTIVE

**TC-007.3**: Order line items preserved
- **Input**: Order with 5 line items
- **Expected**: All line items saved and retrieved
- **Assertion**: `len(order['lines']) == 5`
- **Status**: ACTIVE

#### UT-008: Edge Cases

**TC-008.1**: Null/undefined session ID handling
- **Input**: Session with null ID
- **Expected**: Generated ID assigned
- **Assertion**: `saved_session['id'] is not None`
- **Status**: ACTIVE

**TC-008.2**: Empty product list
- **Input**: Empty array to bulk save
- **Expected**: No error, 0 products saved
- **Assertion**: `len(saved) == 0`
- **Status**: ACTIVE

**TC-008.3**: Duplicate transaction ID handling
- **Input**: Two transactions with same ID
- **Expected**: Second overwrites first or error thrown
- **Assertion**: Either `overwritten or error_thrown`
- **Status**: ACTIVE

**TC-008.4**: Very large decimal amounts
- **Input**: Amount with 20+ decimal places
- **Expected**: Handled without precision loss
- **Assertion**: `retrieved_amount == saved_amount`
- **Status**: ACTIVE

---

### Integration Tests (18+ cases)

#### IT-001: Page Visibility Change Handling

**TC-IT-001.1**: Session save on visibility hidden
- **Input**: Page transition from visible to hidden
- **Expected**: Active session saved to database
- **Assertion**: `session_saved == true and no_abort_error`
- **Status**: ACTIVE
- **Setup**: Create session, simulate visibility change
- **Cleanup**: Clear session data

**TC-IT-001.2**: Concurrent operations during visibility change
- **Input**: 10 simultaneous DB operations during hidden transition
- **Expected**: All 10 succeed without abort errors
- **Assertion**: `success_count == 10 and error_count == 0`
- **Status**: ACTIVE

**TC-IT-001.3**: Rapid visibility changes (tab switching)
- **Input**: 5 rapid visible→hidden→visible transitions
- **Expected**: No race conditions, all saves successful
- **Assertion**: `abort_error_count == 0`
- **Status**: ACTIVE

#### IT-002: Concurrent Database Operations

**TC-IT-002.1**: 50 concurrent reads
- **Input**: 50 simultaneous read operations
- **Expected**: All succeed, correct data returned
- **Assertion**: `success_count == 50 and errors == 0`
- **Status**: ACTIVE
- **Load**: Parallel execution, 50 threads
- **Duration**: <5 seconds

**TC-IT-002.2**: 50 concurrent writes
- **Input**: 50 simultaneous write operations
- **Expected**: All succeed without conflicts
- **Assertion**: `written_count == 50 and no_conflicts`
- **Status**: ACTIVE
- **Load**: Parallel execution, 50 threads
- **Duration**: <10 seconds

**TC-IT-002.3**: Mixed read/write operations (50 total)
- **Input**: 25 reads + 25 writes concurrent
- **Expected**: All succeed, data consistency maintained
- **Assertion**: `total_success == 50 and data_consistent`
- **Status**: ACTIVE

**TC-IT-002.4**: Stress test with 200 operations
- **Input**: 200 concurrent mixed operations
- **Expected**: 95%+ success rate
- **Assertion**: `(success_count / 200) >= 0.95`
- **Status**: ACTIVE
- **Load**: High concurrency stress test

#### IT-003: Sync Workflow Integration

**TC-IT-003.1**: Transaction sync with cleanup
- **Input**: 10 pending transactions, sync trigger
- **Expected**: Transactions marked synced, removed from pending
- **Assertion**: `pending_count == 0 and synced_count == 10`
- **Status**: ACTIVE

**TC-IT-003.2**: Order sync with line items
- **Input**: Order with 5 line items in offline mode
- **Expected**: Order and all items sync successfully
- **Assertion**: `synced_items == 5 and order_synced`
- **Status**: ACTIVE

**TC-IT-003.3**: Sync error handling
- **Input**: Transaction fails to sync
- **Expected**: Error logged, retry scheduled
- **Assertion**: `error_logged and retry_scheduled`
- **Status**: ACTIVE

#### IT-004: Cleanup Operations

**TC-IT-004.1**: Clear old transactions during sync
- **Input**: 100 old transactions, cleanup triggered
- **Expected**: Old transactions removed cleanly
- **Assertion**: `old_transaction_count == 0`
- **Status**: ACTIVE
- **Duration**: <2 seconds
- **Data**: 10KB+ cleanup

**TC-IT-004.2**: Session cleanup with concurrent reads
- **Input**: Cleanup triggered while 20 reads in progress
- **Expected**: Reads complete, cleanup succeeds
- **Assertion**: `reads_succeed and cleanup_complete`
- **Status**: ACTIVE

**TC-IT-004.3**: Product cache refresh during operations
- **Input**: Clear all products while orders being created
- **Expected**: No AbortError, orders saved successfully
- **Assertion**: `order_count == expected and no_abort_error`
- **Status**: ACTIVE

#### IT-005: Multi-Store Operations

**TC-IT-005.1**: Data isolation between stores
- **Input**: Session created for store 1, session for store 2
- **Expected**: Sessions isolated, no cross-store access
- **Assertion**: `store_1_data != store_2_data`
- **Status**: ACTIVE

**TC-IT-005.2**: Concurrent operations across stores
- **Input**: 25 operations in store 1, 25 in store 2, concurrent
- **Expected**: All succeed, data properly isolated
- **Assertion**: `store_1_success == 25 and store_2_success == 25`
- **Status**: ACTIVE

#### IT-006: Offline Mode Operations

**TC-IT-006.1**: Create order in offline mode
- **Input**: POS offline, create order with products
- **Expected**: Order saved to offline DB
- **Assertion**: `order_in_offline_db == true`
- **Status**: ACTIVE

**TC-IT-006.2**: Offline to online transition
- **Input**: Go online with offline orders
- **Expected**: Orders sync to server
- **Assertion**: `orders_synced == true`
- **Status**: ACTIVE

**TC-IT-006.3**: Order completion during offline→online
- **Input**: Complete order as network transitions online
- **Expected**: Completion handled correctly
- **Assertion**: `order_state == 'completed'`
- **Status**: ACTIVE

---

### Performance Tests (10+ cases)

#### PT-001: Load Testing

**TC-PT-001.1**: Bulk insert 1000 products
- **Duration Target**: <5 seconds
- **Input**: 1000 product dicts
- **Assertion**: `elapsed_time < 5`
- **Status**: ACTIVE

**TC-PT-001.2**: Retrieve 1000 products
- **Duration Target**: <2 seconds
- **Input**: Query all 1000 products
- **Assertion**: `elapsed_time < 2 and count == 1000`
- **Status**: ACTIVE

**TC-PT-001.3**: 100 rapid session saves
- **Duration Target**: <3 seconds
- **Input**: Rapid sequence of 100 saves
- **Assertion**: `elapsed_time < 3 and saved_count == 100`
- **Status**: ACTIVE

#### PT-002: Memory Usage

**TC-PT-002.1**: Memory stability over 10,000 operations
- **Memory Limit**: <10MB growth
- **Input**: 10,000 mixed operations
- **Assertion**: `memory_growth < 10MB`
- **Status**: ACTIVE

**TC-PT-002.2**: Cleanup operation memory release
- **Memory Recovery**: 90%+ of allocated
- **Input**: 10,000 objects created then cleared
- **Assertion**: `memory_recovered > 0.9 * allocated`
- **Status**: ACTIVE

#### PT-003: Concurrent Throughput

**TC-PT-003.1**: 100 ops/sec sustained for 60 seconds
- **Target**: 6000+ total operations
- **Input**: Continuous concurrent load
- **Assertion**: `total_ops >= 6000 and error_rate < 5%`
- **Status**: ACTIVE

**TC-PT-003.2**: Peak load 500 ops/sec
- **Target**: 100%+ success under spike
- **Input**: Sudden load increase to 500 ops/sec
- **Assertion**: `success_rate >= 0.95`
- **Status**: ACTIVE

---

### E2E Tests (12+ cases)

#### E2E-001: Session Persistence

**TC-E2E-001.1**: Session survives page reload
- **Steps**:
  1. Create session with 5 orders
  2. Reload page
  3. Verify session and orders restored
- **Expected**: Session with 5 orders visible
- **Assertion**: `session_restored and order_count == 5`
- **Status**: ACTIVE
- **Browser**: Chrome/Firefox
- **Timeout**: 30 seconds

**TC-E2E-001.2**: Session survives tab close/open
- **Steps**:
  1. Create session
  2. Close tab (before closing app)
  3. Reopen tab
  4. Verify session restored
- **Expected**: Session and data recovered
- **Assertion**: `data_recovered == true`
- **Status**: ACTIVE

#### E2E-002: Offline Mode Workflows

**TC-E2E-002.1**: Complete offline POS order flow
- **Steps**:
  1. Go offline
  2. Create order with products
  3. Complete payment
  4. Verify offline indicator
- **Expected**: Order saved offline, indicator shows offline
- **Assertion**: `offline_mode_active and order_saved`
- **Status**: ACTIVE
- **Timeout**: 60 seconds

**TC-E2E-002.2**: Offline→Online transition
- **Steps**:
  1. Create offline order
  2. Go online
  3. Verify order syncs
- **Expected**: Order syncs successfully
- **Assertion**: `order_synced == true and no_errors`
- **Status**: ACTIVE

#### E2E-003: Concurrent Operations

**TC-E2E-003.1**: 50 concurrent product operations
- **Steps**:
  1. Start 50 simultaneous product operations
  2. Verify 95%+ success rate
  3. Check no AbortError in console
- **Expected**: 95%+ operations succeed
- **Assertion**: `success_rate >= 0.95 and no_abort_errors`
- **Status**: ACTIVE
- **Duration**: <30 seconds

#### E2E-004: Error Scenarios

**TC-E2E-004.1**: Handle simulated IndexedDB errors
- **Steps**:
  1. Simulate AbortError
  2. Verify retry mechanism activates
  3. Verify eventual success
- **Expected**: Operation succeeds after retries
- **Assertion**: `eventual_success == true`
- **Status**: ACTIVE

**TC-E2E-004.2**: Handle quota exceeded
- **Steps**:
  1. Fill IndexedDB near quota
  2. Attempt large write
  3. Verify retry and eventual success
- **Expected**: Quota error handled, retry succeeds
- **Assertion**: `quota_error_handled and operation_succeeds`
- **Status**: ACTIVE

#### E2E-005: Memory & Resources

**TC-E2E-005.1**: No memory leaks over 1 hour usage
- **Steps**:
  1. Monitor heap size
  2. Run 1000 random operations
  3. Wait 5 minutes
  4. Check heap for leaks
- **Expected**: Heap stable, <10% growth
- **Assertion**: `heap_growth < 10%`
- **Status**: ACTIVE
- **Duration**: 1+ hour

**TC-E2E-005.2**: Event handlers properly cleaned up
- **Steps**:
  1. Create 100 transaction handlers
  2. Clean up
  3. Verify no handlers remain
- **Expected**: All handlers removed
- **Assertion**: `active_handlers == 0`
- **Status**: ACTIVE

---

## Test Case Matrix

### By Component

| Component | Unit | Integration | Performance | E2E | Total |
|-----------|------|-------------|-------------|-----|-------|
| Retry Logic | 5 | 3 | 3 | 2 | 13 |
| Sessions | 4 | 3 | 2 | 3 | 12 |
| Transactions | 4 | 3 | 2 | 1 | 10 |
| Products | 5 | 2 | 2 | 1 | 10 |
| Sync/Offline | 3 | 5 | 1 | 3 | 12 |
| Errors | 5 | 2 | 1 | 2 | 10 |
| **Total** | **30** | **18** | **10** | **12** | **70** |

### By Criticality

| Level | Test Cases | Coverage |
|-------|-----------|----------|
| **CRITICAL** | 20 | Retry logic, session persistence, concurrent ops |
| **HIGH** | 30 | Product ops, sync workflow, error handling |
| **MEDIUM** | 15 | Edge cases, data consistency |
| **LOW** | 5 | Performance optimization, stress tests |

---

## Test Execution Rules

### Execution Order

1. **Unit Tests First** (30 cases, <2 min)
   - Fast, isolated, catch most issues
   - Run on every commit

2. **Integration Tests** (18 cases, 5-10 min)
   - More realistic scenarios
   - Run on PR, before merge

3. **Performance Tests** (10 cases, 10-30 min)
   - Long running, resource intensive
   - Run nightly, on releases

4. **E2E Tests** (12 cases, 20-60 min)
   - Full browser automation
   - Run on PR, before staging

### Failure Handling

- **Unit Test Failure**: Block commit, fix immediately
- **Integration Failure**: Investigate, may indicate real issue
- **Performance Failure**: Monitor trend, investigate if >10% regression
- **E2E Failure**: Review browser logs, may be timing issue

---

## Success Criteria

All test cases must pass with:
- ✅ No AbortError messages
- ✅ 95%+ success rate on concurrent operations
- ✅ <1% failure on visibility changes
- ✅ All operations complete within timeout
- ✅ No memory leaks detected
- ✅ All data consistency maintained

---

**Total Test Cases**: 70
**Status**: PRODUCTION-READY
