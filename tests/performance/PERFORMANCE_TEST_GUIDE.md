# Performance Testing Guide - PDC POS Offline

Complete guide for running, interpreting, and improving performance tests for the POS Offline module.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Suites](#test-suites)
3. [Performance Targets](#performance-targets)
4. [Running Tests](#running-tests)
5. [Interpreting Results](#interpreting-results)
6. [Profiling and Analysis](#profiling-and-analysis)
7. [Regression Detection](#regression-detection)
8. [Optimization Guide](#optimization-guide)

---

## Quick Start

### Run All Performance Tests

```bash
# Run all performance tests
npm run perf:all

# Run specific test suite
npm run perf:load-time
npm run perf:operations
npm run perf:stress
npm run perf:rum

# Update baseline (after optimizations)
UPDATE_BASELINE=true npm run perf:baseline
```

### Quick Health Check

```bash
# Check against baseline with minimal output
npm run perf:quick
```

---

## Test Suites

### 1. Load Time Tests (`load-time.perf.test.js`)

Measures page load performance under various conditions.

#### What It Tests

- **Cold Start**: First-time page load with empty cache
- **Warm Cache**: Repeat visits with cached resources
- **Large Datasets**: Loading with 50, 100, 500 users
- **Network Throttling**: 3G, 4G, WiFi scenarios
- **Offline Transitions**: Time to detect connection changes
- **Core Web Vitals**: LCP, FID, CLS measurements

#### Performance Targets

| Metric | Target | Acceptable | Alert |
|--------|--------|-----------|-------|
| Cold Start (DOM) | <1s | <1.5s | >2.5s |
| Warm Cache (DOM) | <500ms | <750ms | >1.25s |
| 50 Users Load | <2s | <3s | >4.5s |
| 100 Users Load | <3s | <4.5s | >6s |
| 500 Users Load | <5s | <7.5s | >10s |
| 3G Network | <8s | <12s | >16s |
| 4G Network | <2s | <3s | >4.5s |
| WiFi Network | <1s | <1.5s | >2.5s |
| Offline Detection | <500ms | <1s | >2s |

#### Example Output

```
Cold Start - DOM Load: 850.32ms, Full Load: 2150.45ms
Warm Cache - DOM Load: 450.12ms, Full Load: 950.23ms
50 Users Load - Prepare: 125.45ms, Load: 1850.67ms
```

#### When to Run

- After any changes to:
  - Initial page load logic
  - Service worker configuration
  - CSS/JavaScript bundling
  - Network request optimization
- During performance regression detection
- Before production deployments

---

### 2. Operations Benchmarks (`operations-benchmark.perf.test.js`)

Measures the performance of core operations.

#### What It Tests

- **Single User Sync**: P50, P95, P99 latency percentiles
- **Batch Sync**: 10, 50, 100 user batch operations
- **IndexedDB Operations**: Read/write performance
- **Memory Footprint**: Heap size during operations
- **Throughput**: Operations per second

#### Performance Targets

| Metric | P50 | P95 | P99 |
|--------|-----|-----|-----|
| Single User Sync | <200ms | <500ms | <1s |
| 10 Users Batch | <500ms | <1.5s | <3s |
| 50 Users Batch | <2s | <5s | <10s |
| 100 Users Batch | <3.5s | <8s | <15s |
| IndexedDB Write | <10ms | <25ms | <50ms |
| IndexedDB Read | <5ms | <15ms | <30ms |
| Batch Write (100) | <50ms | <150ms | <300ms |

#### Memory Targets

| Scenario | Target | Alert |
|----------|--------|-------|
| Baseline | - | >100MB |
| Per 50 Users | ~15MB | >30MB |
| Maximum | <300MB | >400MB |

#### Example Output

```
Single User Sync - P50: 180ms, P95: 420ms, P99: 850ms
10 Users Batch - P50: 450ms, P95: 1200ms, P99: 2500ms
IndexedDB Write - P50: 8.5ms, P95: 22ms, P99: 45ms
Memory Profile:
  Baseline: 45.32MB
  After Data Load: 78.45MB
  After Sync: 95.23MB
  After Cleanup: 52.10MB
Throughput: 18.75 operations/second
```

#### When to Run

- After changes to:
  - Sync logic
  - IndexedDB implementation
  - API request handling
  - Memory management
- Weekly during development
- As part of CI/CD pipeline

---

### 3. Stress Tests (`stress-tests.perf.test.js`)

Tests system behavior under extreme conditions.

#### What It Tests

- **Large Scale Sync**: 1000 users on 2G network
- **Memory Leaks**: 24-hour continuous operation
- **Long-Running Sessions**: 1-hour stability
- **Cache Eviction**: Memory pressure handling
- **Retry Logic**: Failure recovery
- **Network Recovery**: Graceful reconnection

#### Stress Thresholds

| Test | Duration | Max Errors | Memory Limit |
|------|----------|-----------|-------------|
| 1000 Users (2G) | <60s | <5% | <400MB |
| Memory Leak (24h sim) | Full duration | <50MB/cycle | N/A |
| Long Session (1h sim) | Full duration | <1% | <100MB growth |
| Cache Eviction | N/A | N/A | Free 20%+ under pressure |
| Retry Logic | N/A | Eventually succeed | N/A |
| Network Recovery | <5s recovery | <20% during | N/A |

#### Example Output

```
1000 User Sync Complete:
  - Total Time: 45.23s
  - Success: 975, Errors: 25
  - Error Rate: 2.50%

Memory Leak Analysis:
  - Initial: 48.32MB
  - Final: 92.45MB
  - Total Growth: 44.13MB
  - Avg Growth/Cycle: 2.20MB
  - Memory Leak Detected: false

Long-Running Session Results:
  - Total Operations: 1500
  - API Errors: 12
  - Error Rate: 0.80%
  - Memory Growth: 45.23MB
```

#### When to Run

- Before release
- After major refactoring
- When investigating stability issues
- Scheduled weekly performance analysis
- After network-related changes

---

### 4. Real User Monitoring (RUM) (`real-user-monitoring.test.js`)

Synthetic monitoring simulating real user interactions.

#### What It Tests

- **Navigation Timing**: DNS, TCP, TTFB, download
- **Core Web Vitals**: LCP, FID, CLS
- **Custom Marks**: Operation-specific performance
- **Error Tracking**: Error rates during operations
- **Session Analysis**: User flow performance
- **Resource Loading**: Network resource performance
- **Paint Timing**: First Paint, First Contentful Paint

#### Web Vital Targets (Google Standards)

| Metric | Good | Needs Improvement | Poor |
|--------|------|------------------|------|
| LCP | <2.5s | 2.5-4s | >4s |
| FID | <100ms | 100-300ms | >300ms |
| CLS | <0.1 | 0.1-0.25 | >0.25 |

#### Example Output

```
Navigation Timing Metrics:
  - DNS Lookup: 45.23ms
  - TCP Connect: 120.45ms
  - TTFB: 280.12ms
  - Download: 450.34ms
  - DOM Interactive: 1850.45ms
  - DOM Complete: 2150.67ms

Core Web Vitals:
  - LCP: 1850.23ms
  - FID: 85.45ms
  - CLS: 0.045

Paint Timing:
  - first-paint: 850.23ms
  - first-contentful-paint: 1050.45ms

Resource Loading:
  - Total Resources: 45
  - Total Bytes: 1250.45KB
```

#### When to Run

- Continuous monitoring in production
- After UI changes
- When investigating user experience issues
- Regular weekly audits

---

### 5. Baseline Comparison (`baseline.comparison.test.js`)

Detects performance regressions by comparing against baseline.

#### How It Works

1. First run creates baseline (with `UPDATE_BASELINE=true`)
2. Subsequent runs compare against baseline
3. Regressions >10% trigger test failures
4. Report shows all changes with percentages

#### Regression Report Example

```
=== PERFORMANCE COMPARISON REPORT ===

page_load_cold_start_ms:
  Current: 920.45ms
  Baseline: 850.32ms
  Change: ↑ 8.24%
  Status: slower

page_load_warm_cache_ms:
  Current: 420.12ms
  Baseline: 450.12ms
  Change: ↓ 6.68%
  Status: faster

user_sync_p50_ms:
  Current: 250.45ms
  Baseline: 180.23ms
  Change: ↑ 38.99%
  Status: REGRESSION ⚠️
```

#### Managing Baselines

```bash
# Create initial baseline after establishing stable performance
UPDATE_BASELINE=true npm run perf:baseline

# View baseline
cat tests/performance/baseline.json

# Compare against baseline (default)
npm run perf:baseline

# Clear baseline (careful!)
rm tests/performance/baseline.json
```

---

## Running Tests

### Environment Setup

```bash
# Install dependencies
npm install

# Ensure Playwright browsers are installed
npx playwright install

# Set test environment
export ODOO_URL=https://pwh19.iug.net
export UPDATE_BASELINE=false  # true to update baselines
```

### Running Specific Tests

```bash
# Load time tests only
npx playwright test load-time.perf.test.js

# Operations benchmarks only
npx playwright test operations-benchmark.perf.test.js

# Single test
npx playwright test load-time.perf.test.js -g "warm cache"

# With headed browser for debugging
npx playwright test load-time.perf.test.js --headed

# Debug mode with step-through
npx playwright test load-time.perf.test.js --debug

# Verbose output
npx playwright test --reporter=list
```

### Running with Different Configurations

```bash
# Fast run (skips stress tests)
npx playwright test --ignore='**/stress-tests.perf.test.js'

# Full test suite (may take 20+ minutes)
npx playwright test tests/performance/

# Parallel execution (use with caution)
npx playwright test -j 2  # 2 workers max

# Single worker (recommended for performance tests)
npx playwright test -j 1
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run Performance Tests
  run: |
    npm run perf:baseline

- name: Check for Regressions
  run: |
    if grep -q '"status": "REGRESSION"' tests/performance/baseline-report.json; then
      echo "Performance regressions detected!"
      exit 1
    fi
```

---

## Interpreting Results

### Success Criteria

✅ **PASS**: All tests below threshold
- Load times under targets
- No regressions detected
- Error rates acceptable
- Memory within limits

❌ **FAIL**: Any test exceeds threshold
- Load time >10% over target
- Regression >10% from baseline
- Memory leak detected
- Error rate >5%

### Understanding Percentiles

Percentiles show the distribution of response times:

```
P50 (Median):     50% of requests faster than this
P95:              95% of requests faster than this
P99:              99% of requests faster than this
```

**Example Interpretation**:
```
Single User Sync - P50: 180ms, P95: 420ms, P99: 850ms

Meaning:
- Most requests (50%) complete in <180ms ✅
- Almost all (95%) complete in <420ms ✅
- Even worst case (99%) is <850ms ✅
- If P99 was 5s, we'd have problematic outliers ❌
```

### Analyzing Memory Graphs

```
Growth Pattern Analysis:

Linear Growth ➜ Possible leak - memory grows steadily
  Solution: Profile code, check for retained references

Sawtooth Pattern ➜ Expected - GC cleans up periodically
  Solution: Monitor peak, ensure within limits

Plateau ➜ Healthy - memory stabilizes after initial load
  Solution: Verify plateau is below limit
```

### Network Bottlenecks

Look at waterfall analysis:

```
DNS (45ms) - Too long? Check DNS configuration
TCP (120ms) - High? Network latency issue
TTFB (280ms) - Server slow? Check backend
Download (450ms) - Large assets? Enable compression
```

---

## Profiling and Analysis

### Using the Profiler Utility

```javascript
import { PerformanceProfiler } from './profiling-utilities.js';

const profiler = new PerformanceProfiler(page);

// CPU profiling
await profiler.startCPUProfiling('sync-operation');
// ... do work ...
await profiler.stopCPUProfiling('sync-operation');

// Memory monitoring
await profiler.startMemoryMonitoring(1000); // Sample every 1s
// ... do work ...
const timeline = await profiler.stopMemoryMonitoring();

// Heap snapshots
await profiler.takeHeapSnapshot('before-sync');
// ... do work ...
await profiler.takeHeapSnapshot('after-sync');

// Memory leak detection
const leakAnalysis = await profiler.detectMemoryLeaks();
console.log(leakAnalysis);
// Output: { leaked: false, growth: 1024000, growthPercent: 2.5 }

// Generate full report
const report = await profiler.generateReport('perf-report.json');
```

### Flame Graph Analysis

Flame graphs show where time is spent:

```
getEntries()
  ├─ fetch() [450ms] ──────────────────── Network/server
  ├─ parseJSON() [50ms] ─────── JSON parsing
  ├─ IndexedDB write [200ms] ───────── Database
  └─ updateUI() [100ms] ──── DOM updates
```

**Wide bars** = Slow operations
**Tall stacks** = Deep call chains

### Network Waterfall

Example analysis:

```
Request Timeline:
DNS:       ▓ 45ms (slow DNS?)
TCP:       ▓▓ 120ms (connection latency)
TTFB:      ▓▓▓▓ 280ms (server processing)
Download:  ▓▓▓▓▓▓▓▓▓▓ 450ms (large asset?)
Decode:    ▓ 60ms (compression helps)

Issues found:
❌ TTFB too high (>200ms) - optimize backend
❌ Download slow (>300ms) - compress/minify assets
```

---

## Regression Detection

### How Regression Threshold Works

```
Baseline: 1000ms
Current:  1100ms
Regression: (1100 - 1000) / 1000 = 10%
Threshold: 10% (configurable)
Result: REGRESSION (triggers failure)
```

### Investigating Regressions

1. **Identify what changed**
   ```bash
   git log --oneline -5
   git diff HEAD~1
   ```

2. **Check specific metric**
   ```bash
   # Look at baseline-report.json for detailed changes
   cat tests/performance/baseline-report.json | jq '.metrics.page_load_cold_start_ms'
   ```

3. **Run profiler**
   ```bash
   # Use PerformanceProfiler to identify bottleneck
   npx playwright test load-time.perf.test.js --debug
   ```

4. **Compare with working version**
   ```bash
   git checkout HEAD~1
   npm run perf:baseline
   # Check if regression exists
   ```

5. **Optimize and re-test**
   ```bash
   # After optimization
   npm run perf:baseline
   # Should show improvement
   ```

---

## Optimization Guide

### Common Issues and Solutions

#### Problem: High Cold Start Time

**Symptoms**: `page_load_cold_start_ms` > 3000ms

**Possible Causes**:
- Large JavaScript bundles
- Render-blocking CSS
- Too many third-party scripts
- Slow initial API calls

**Solutions**:
```javascript
// 1. Code splitting
import('./heavy-module.js');  // Dynamic import

// 2. Defer non-critical scripts
<script defer src="analytics.js"></script>

// 3. Optimize assets
// Minify CSS/JS
// Compress images
// Use modern formats (WebP)

// 4. Use service worker caching
// Cache on installation
// Skip network for known assets
```

#### Problem: High Sync Latency

**Symptoms**: `user_sync_p50_ms` > 200ms

**Possible Causes**:
- Slow API server
- Large JSON payloads
- IndexedDB transaction conflicts
- Network latency

**Solutions**:
```javascript
// 1. Batch requests
const users = [...];
await Promise.all(
  users.map(u => fetch('/api/user/sync', { body: JSON.stringify(u) }))
);

// 2. Optimize payload
// Send only necessary fields
// Compress large payloads

// 3. Reduce IndexedDB operations
// Use batch transactions
// Index frequently queried fields

// 4. Network optimization
// Use HTTP/2 (already enabled on most servers)
// Enable gzip compression
```

#### Problem: Memory Leak

**Symptoms**: `Memory Growth: 44.13MB` (>20MB)

**Possible Causes**:
- Event listeners not removed
- Retained references
- Uncleared timers/intervals
- DOM nodes not garbage collected

**Solutions**:
```javascript
// 1. Remove event listeners
element.removeEventListener('click', handler);
// or use once: true
element.addEventListener('click', handler, { once: true });

// 2. Clear timers
clearInterval(intervalId);
clearTimeout(timeoutId);

// 3. Clean up references
object = null;  // Allow GC
weakMap.delete(key);  // Use WeakMap for auto-cleanup

// 4. Monitor memory
const snapshot1 = await profiler.takeHeapSnapshot('start');
// ... run code ...
const snapshot2 = await profiler.takeHeapSnapshot('end');
const comparison = profiler.compareHeapSnapshots();
```

#### Problem: Cache Eviction Failures

**Symptoms**: Memory pressure handling not working

**Solutions**:
```javascript
// Implement cache with size limit
class LimitedCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

// Or use IndexedDB with automatic cleanup
clearOldTransactions(Date.now() - 7 * 24 * 60 * 60 * 1000);
```

### Performance Improvement Checklist

- [ ] Load time targets met (<3s cold, <1s warm)
- [ ] Operations under P99 targets
- [ ] No memory leaks (growth <20%)
- [ ] Error rates <1%
- [ ] Core Web Vitals in "good" range
- [ ] No regressions from baseline (>10%)
- [ ] Cache hit rates >80%
- [ ] No JavaScript errors in console
- [ ] Network waterfall shows healthy timings
- [ ] Throughput >10 ops/sec

---

## Best Practices

### Performance Testing

1. **Run in consistent environment**
   - Same network conditions
   - Same device capabilities
   - No other applications running
   - Stable CPU/memory availability

2. **Use percentiles, not just averages**
   - P50 for typical experience
   - P95 for satisfied users
   - P99 for worst-case scenarios

3. **Test realistic scenarios**
   - Real user data volumes
   - Real network conditions
   - Real device capabilities
   - Real concurrent usage

4. **Baseline regularly**
   - After each release
   - After major refactoring
   - When investigating issues
   - Weekly during active development

5. **Monitor continuously**
   - Production RUM
   - Synthetic monitoring
   - Weekly baseline comparison
   - Performance budgets

### Avoiding False Positives

- Warm up cache before measuring
- Run multiple iterations (20+)
- Ignore first few iterations
- Use percentiles, not single measurements
- Account for network variability
- Control for system load

---

## Troubleshooting

### Tests Won't Run

```bash
# Check Playwright installation
npx playwright install

# Verify browser support
npx playwright install chromium

# Check if server is accessible
curl https://pwh19.iug.net/pos/web
```

### Inconsistent Results

- Close other applications
- Disable browser extensions
- Use consistent network (avoid WiFi)
- Run tests at consistent time
- Use performance.now() for higher precision

### Out of Memory

```bash
# Increase Node.js heap
NODE_OPTIONS=--max-old-space-size=4096 npm run perf:all

# Skip large stress tests
npx playwright test --ignore='**/stress-tests.perf.test.js'
```

### Tests Timeout

```bash
# Increase timeout in playwright.config.js
timeout: 120000,  // 2 minutes

# Or override per test
test.setTimeout(180000);  // 3 minutes
```

---

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Web Performance APIs](https://developer.mozilla.org/en-US/docs/Web/API/Performance)
- [Google Core Web Vitals](https://web.dev/vitals/)
- [MDN Performance Guide](https://developer.mozilla.org/en-US/docs/Web/Performance)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)

---

## Support

For issues or questions:
1. Check this guide
2. Review test output and reports
3. Run with `--debug` flag
4. Check baseline-report.json for detailed metrics
5. Use `profiling-utilities.js` for deep analysis
