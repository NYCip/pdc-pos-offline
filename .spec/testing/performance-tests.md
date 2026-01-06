# Performance Testing Specifications

**Module**: pdc-pos-offline
**Scope**: Load testing, benchmarking, stress testing, memory monitoring
**Framework**: pytest with pytest-benchmark plugin
**Target Environment**: PostgreSQL 15.x, Python 3.12+

---

## 1. Performance Testing Strategy

### 1.1 Testing Levels

| Level | Purpose | Duration | Load | Frequency |
|-------|---------|----------|------|-----------|
| **Unit Perf** | Method timing | <1s | Light | Every run |
| **Integration Perf** | Workflow timing | 5-10s | Medium | Per commit |
| **Load Test** | Sustained ops | 30-60s | High | Nightly |
| **Stress Test** | Peak conditions | 60-300s | Very High | Weekly |
| **Endurance** | Long-running stability | 1+ hours | Medium | Monthly |

### 1.2 Key Metrics

| Metric | Target | Alert | Critical |
|--------|--------|-------|----------|
| **Op Latency** | <10ms | >50ms | >100ms |
| **Throughput** | 100 ops/sec | <50 ops/sec | <10 ops/sec |
| **Concurrency** | 95%+ success at 50 ops | <90% | <80% |
| **Memory Growth** | <10% per 10k ops | >20% | >50% |
| **CPU Usage** | <40% avg | >60% | >80% |

---

## 2. Load Testing Specifications

### 2.1 Bulk Operations

**PT-001.1: Bulk Insert Performance**
```python
Test Name: test_bulk_insert_products
Category: Load Test
Duration: <5 seconds
Input Size: 1,000 products
Expected Result: All inserted, no errors

Metrics:
  - Total Time: <5 seconds
  - Average per item: <5ms
  - Memory used: <50MB
  - Success rate: 100%

Success Criteria:
  - Time < 5 seconds
  - Error count = 0
  - Memory stable
```

**PT-001.2: Bulk Retrieval Performance**
```python
Test Name: test_retrieve_all_products
Category: Load Test
Duration: <2 seconds
Input Size: 1,000 products
Expected Result: All retrieved in correct order

Metrics:
  - Query time: <2 seconds
  - Items per second: >500
  - Memory: <100MB
  - Accuracy: 100%

Success Criteria:
  - Time < 2 seconds
  - Retrieved count = 1,000
  - Data integrity verified
```

**PT-001.3: Rapid Sequential Operations**
```python
Test Name: test_rapid_session_saves
Category: Load Test
Duration: <3 seconds
Operation Count: 100 saves
Expected Result: All sessions saved

Metrics:
  - Total time: <3 seconds
  - Ops/second: >33
  - Per-op latency: <30ms
  - Failure rate: 0%

Success Criteria:
  - Time < 3 seconds
  - Saved count = 100
  - No duplicate IDs
```

### 2.2 Concurrent Load Tests

**PT-003.1: Sustained Throughput (100 ops/sec)**
```python
Test Name: test_100_ops_per_second
Category: Throughput
Duration: 60 seconds
Target: 6,000+ total operations

Configuration:
  - Concurrent workers: 10
  - Rate: 100 ops/second
  - Duration: 60 seconds
  - Operation mix:
    - 40% reads
    - 40% writes
    - 20% updates

Success Criteria:
  - Total ops >= 6,000
  - Error rate < 5%
  - Latency p95 < 50ms
  - No AbortError seen
```

**PT-003.2: Peak Load (500 ops/sec burst)**
```python
Test Name: test_peak_load_spike
Category: Stress Test
Duration: 10 seconds at peak
Ramp-up: 5 seconds to 500 ops/sec
Ramp-down: 5 seconds to 0

Configuration:
  - Starting rate: 0 ops/sec
  - Peak rate: 500 ops/sec
  - Duration at peak: 10 seconds

Success Criteria:
  - Success rate >= 95%
  - Latency p99 < 500ms
  - No deadlocks detected
  - Memory recoverable
```

---

## 3. Memory Testing Specifications

### 3.1 Memory Leak Detection

**PT-002.1: Long-Running Memory Stability**
```python
Test Name: test_memory_stability_10k_ops
Category: Memory
Duration: ~30 seconds
Operations: 10,000
Target: <10% memory growth

Test Procedure:
  1. Measure baseline heap
  2. Perform 10,000 operations
  3. Trigger garbage collection
  4. Measure final heap
  5. Calculate growth percentage

Metrics Tracked:
  - Initial heap: Record in MB
  - Peak heap: During operations
  - Final heap: After GC
  - Growth: (Final - Initial) / Initial * 100%

Success Criteria:
  - Memory growth < 10%
  - No unbounded growth pattern
  - GC recovers >90% of peak
```

**PT-002.2: Event Handler Cleanup**
```python
Test Name: test_event_handler_cleanup
Category: Memory
Duration: <10 seconds
Operations: 100 transaction handlers

Test Procedure:
  1. Count active handlers before
  2. Create 100 handlers
  3. Clean up all handlers
  4. Verify handler count returns to baseline
  5. Check for dangling references

Metrics:
  - Handlers before: Baseline
  - Handlers after creation: 100
  - Handlers after cleanup: Baseline
  - Closure count: 100

Success Criteria:
  - All handlers properly removed
  - Closure count = 100
  - No memory residue
```

### 3.2 Memory Under Load

**PT-002.3: Memory with Concurrent Operations**
```python
Test Name: test_memory_under_concurrent_load
Category: Memory
Duration: 60 seconds
Concurrency: 50 operations
Operations: 5,000+ total

Monitoring:
  - Every 5 seconds:
    - Current heap size
    - Object count
    - Active threads
  - Post-operation:
    - Final heap size
    - Growth percentage
    - Memory fragmentation

Thresholds:
  - Max growth: 25%
  - Fragmentation: <20%
  - Stable (last 10s): ±5%
```

---

## 4. Retry Logic Performance

### 4.1 Retry Overhead Measurement

**PT-004.1: No Penalty on Successful Operations**
```python
Test Name: test_retry_overhead_success
Category: Performance
Duration: <1 second
Operations: 1,000 successful ops

Measurement:
  - Time with retry infrastructure: T_with_retry
  - Time without retry: T_without_retry
  - Overhead percentage: (T_with_retry - T_without_retry) / T_without_retry * 100%

Success Criteria:
  - Overhead < 1%
  - T_with_retry < 100ms per op
  - No latency penalty detected
```

**PT-004.2: Retry Mechanism Latency**
```python
Test Name: test_retry_latency_measurement
Category: Performance
Scenarios:
  1. Success on attempt 1: 0ms delay
  2. Success on attempt 2: 100ms delay
  3. Success on attempt 3: 200ms delay
  4. Success on attempt 4: 500ms delay
  5. Success on attempt 5: 1000ms delay

Verification:
  - Measure actual vs expected delays
  - Tolerance: ±10ms
  - No delay on immediate success
  - Correct exponential progression

Success Criteria:
  - All delays within tolerance
  - Progressive increase verified
  - No cumulative overhead
```

---

## 5. Database Performance

### 5.1 Query Performance

**PT-005.1: Session Retrieval Performance**
```python
Test Name: test_query_performance_sessions
Category: Database
Dataset: 10,000 sessions
Operations:
  - Get single session: <5ms
  - Get all sessions: <500ms
  - Filter by user: <50ms
  - Get active session: <10ms

Indexing Verification:
  - Indexes on: id, user_id, state
  - Query plans: Verified for efficiency
  - Cache hit rate: >90%
```

**PT-005.2: Bulk Update Performance**
```python
Test Name: test_bulk_update_performance
Category: Database
Dataset: 1,000 transactions
Operation: Mark all as synced
Expected Time: <2 seconds

Metrics:
  - Items per second: >500
  - Average per item: <2ms
  - Batch efficiency: Verified
```

### 5.2 Index Performance

**PT-005.3: Index Effectiveness**
```python
Test Name: test_index_effectiveness
Category: Database
Indexes Tested:
  - PRIMARY: product id
  - UNIQUE: barcode
  - INDEX: category_id
  - INDEX: user_id

Metrics:
  - Scan types: INDEX (not FULL TABLE)
  - Query plans: Optimized
  - Index usage: >95%

Success Criteria:
  - No full table scans
  - All searches use indexes
  - Performance within SLA
```

---

## 6. Concurrency Performance

### 6.1 Lock Contention

**PT-006.1: Lock Contention Measurement**
```python
Test Name: test_lock_contention
Category: Concurrency
Scenario: 50 concurrent operations on same resource

Metrics:
  - Lock wait time: Measure
  - Deadlock detection: Monitor
  - Retry count: Average
  - Success rate: Track

Success Criteria:
  - Wait time < 100ms average
  - No deadlocks
  - Retries < 2 per operation
  - Success rate > 90%
```

### 6.2 Scaling Characteristics

**PT-006.2: Linear Scaling Test**
```python
Test Name: test_scaling_characteristics
Category: Concurrency
Concurrency Levels: 1, 5, 10, 25, 50, 100

Measurement:
  - Throughput at each level
  - Latency at each level
  - Error rate at each level
  - Resource usage at each level

Expected Pattern:
  - Throughput: Linear scaling up to 50
  - Latency: <50% increase at 50 concurrent
  - Errors: <5% at all levels
  - CPU: <80% at 50 concurrent
```

---

## 7. Stress Testing

### 7.1 Extended Load

**PT-007.1: 1-Hour Endurance Test**
```python
Test Name: test_endurance_1_hour
Category: Stress
Duration: 3,600 seconds (1 hour)
Load: 50 concurrent operations
Total Operations: 10,000+

Monitoring (Every 5 minutes):
  - Throughput
  - Latency p50, p95, p99
  - Memory usage
  - Error rate
  - GC pauses

Success Criteria:
  - Sustained throughput
  - No memory growth trend
  - Error rate stable
  - No performance degradation
```

### 7.2 Edge Cases

**PT-007.2: Maximum Concurrent Operations**
```python
Test Name: test_maximum_concurrency
Category: Stress
Concurrency: Ramp from 1 to 500

Measurement:
  - At what concurrency level:
    - Error rate exceeds 5%?
    - Latency exceeds 1 second?
    - Memory usage exceeds limit?
  - Determine practical limit
  - Document degradation curve

Success Criteria:
  - Practical limit >= 100 concurrent
  - Graceful degradation
  - No crashes
```

---

## 8. Benchmark Baselines

### 8.1 Operation Baselines

| Operation | Baseline | Alert Level | Action |
|-----------|----------|-------------|--------|
| Save session | 2-5ms | >10ms | Investigate |
| Get session | 1-3ms | >8ms | Review queries |
| Bulk insert (100) | 50-100ms | >150ms | Profile |
| Bulk insert (1000) | 500-1000ms | >2000ms | Optimize |
| Concurrent 50 ops | <5 sec | >10 sec | Scale review |

### 8.2 Regression Detection

```python
Test Baseline v1.0:
  - Single op latency: 5ms
  - Bulk 1k ops: 800ms
  - Concurrent 50: 3.5sec
  - Memory per op: 1KB

Regression Threshold: >20% slower
  - If latency > 6ms: FLAG
  - If bulk > 960ms: FLAG
  - If concurrent > 4.2s: FLAG
  - If memory > 1.2KB: FLAG
```

---

## 9. Reporting & Monitoring

### 9.1 Test Report Format

```
PERFORMANCE TEST REPORT
=======================

Test: test_bulk_insert_products
Date: 2026-01-06
Duration: 4.8 seconds
Status: PASS ✓

Metrics:
  Items Inserted: 1,000
  Average Latency: 4.8ms
  Peak Latency: 15ms
  Memory Used: 45MB
  Success Rate: 100%
  Errors: 0

Baseline Comparison:
  Expected: <5 seconds
  Actual: 4.8 seconds
  Variance: -4% (GOOD)

Concurrency Impact:
  Single thread: 4.8s
  10 threads: 5.2s
  Overhead: 8%
```

### 9.2 Continuous Monitoring

**Production Metrics** (if deployed):
```
Monitor:
  - API latency p50, p95, p99
  - Error rate and types
  - Retry rate and success
  - Database query times
  - Memory usage trends
  - Concurrent user count

Alerts:
  - Latency p95 > 100ms
  - Error rate > 1%
  - Memory growth > 1% per day
  - Retry rate > 10%
```

---

## 10. Performance Optimization Guide

### 10.1 Common Bottlenecks

| Bottleneck | Symptoms | Solution |
|------------|----------|----------|
| N+1 queries | High DB time | Batch queries, denormalize |
| Memory leaks | Growing heap | Fix event listeners, cleanup |
| Lock contention | High wait time | Reduce critical sections |
| Inefficient indexing | Table scans | Add indexes, optimize queries |
| GC pressure | Pause times | Object pooling, fewer allocations |

### 10.2 Optimization Checklist

- [ ] All hot paths profiled
- [ ] Query execution plans reviewed
- [ ] Indexes optimized
- [ ] Memory allocations minimized
- [ ] Lock contention resolved
- [ ] Caching implemented
- [ ] Concurrency limits tuned
- [ ] Baseline established
- [ ] Regression tests added
- [ ] Performance documented

---

## 11. Running Performance Tests

### 11.1 Local Execution

```bash
# Run all performance tests
pytest tests/performance/ -v --durations=10

# Run with profiling
pytest tests/performance/ -v --profile

# Run with memory tracking
pytest tests/performance/ -v --benchmark-only

# Generate performance report
pytest tests/performance/ --benchmark-save=baseline

# Compare with baseline
pytest tests/performance/ --benchmark-compare=baseline
```

### 11.2 CI/CD Integration

```yaml
# In GitHub Actions
- name: Performance Tests
  run: |
    pytest tests/performance/ -v \
      --junitxml=perf-results.xml \
      --benchmark-only \
      --benchmark-save=ci-results

- name: Compare with baseline
  run: |
    pytest tests/performance/ \
      --benchmark-compare=baseline \
      --benchmark-compare-fail=mean:10%
```

---

## 12. Performance Test Maintenance

### 12.1 Regular Reviews

- **Monthly**: Review performance trends
- **Per Release**: Update baselines if changes expected
- **Per 10% regression**: Investigate root cause
- **Quarterly**: Full performance audit

### 12.2 Baseline Updates

When to update baselines:
- Hardware changes
- Algorithm improvements
- Data structure changes
- Load pattern changes
- Database optimization

Process:
1. Document change reason
2. Run tests 3x to establish variance
3. Calculate new baseline
4. Document new expectations
5. Communicate to team

---

## Conclusion

Comprehensive performance testing ensures pdc-pos-offline maintains production SLA:

✅ **Throughput**: 100+ ops/sec sustained
✅ **Latency**: <10ms average, <50ms p95
✅ **Concurrency**: 95%+ success at 50+ concurrent
✅ **Memory**: <10% growth per 10k operations
✅ **Reliability**: <1% error rate under load

**Status**: PRODUCTION-READY
