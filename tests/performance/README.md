# Performance Test Suite - PDC POS Offline

Comprehensive performance testing framework for the POS Offline module, covering load times, operations benchmarks, stress testing, and real user monitoring.

## Quick Links

- [Performance Test Guide](./PERFORMANCE_TEST_GUIDE.md) - Complete testing documentation
- [Baseline Comparison](./baseline.comparison.test.js) - Regression detection
- [Profiling Utilities](./profiling-utilities.js) - Advanced analysis tools

## Test Suites

| Suite | File | Focus | Duration |
|-------|------|-------|----------|
| Load Time | `load-time.perf.test.js` | Page load, cache, datasets | ~5 min |
| Operations | `operations-benchmark.perf.test.js` | Sync, IndexedDB, memory | ~10 min |
| Stress | `stress-tests.perf.test.js` | 1000 users, memory leaks, recovery | ~15 min |
| RUM | `real-user-monitoring.test.js` | Web Vitals, user experience | ~8 min |
| Baseline | `baseline.comparison.test.js` | Regression detection | ~10 min |

**Total: ~50 minutes for full suite**

## Quick Start

```bash
# Install dependencies
npm install

# Run all performance tests
npm run perf:all

# Run specific test suite
npm run perf:load-time
npm run perf:operations
npm run perf:stress
npm run perf:rum

# Compare against baseline
npm run perf:baseline

# Update baseline (after optimizations)
UPDATE_BASELINE=true npm run perf:baseline
```

## Performance Targets Summary

### Load Time
- Cold Start: <3s
- Warm Cache: <1s
- 50 Users: <2s
- 100 Users: <3s
- 500 Users: <5s

### Operations
- Single Sync P50: <200ms
- 50 Users Batch: <2s
- IndexedDB Write: <10ms
- Memory: <300MB

### Stress
- 1000 Users (2G): <60s, <5% errors
- Memory Leak: <50MB/cycle
- Long Session: <1% errors
- Recovery: <5s

### Core Web Vitals
- LCP: <2.5s
- FID: <100ms
- CLS: <0.1

## Key Features

✅ **Comprehensive Coverage**
- Load times (cold/warm, various data sizes, network conditions)
- Operation benchmarks (sync latency, batch operations, IndexedDB)
- Stress testing (large scale, memory, long-running)
- Real user monitoring (Web Vitals, navigation timing)
- Regression detection with baseline comparison

✅ **Detailed Analysis**
- Percentile-based metrics (P50, P95, P99)
- Memory profiling and leak detection
- Network waterfall analysis
- Custom performance marks
- Frame rate analysis

✅ **Professional Reporting**
- Baseline comparison reports
- Performance graphs and tables
- JSON export for analysis
- Integration-ready output

✅ **Easy Integration**
- Playwright-based (same as E2E tests)
- npm script shortcuts
- CI/CD ready
- Configurable thresholds

## Performance Metrics Explained

### Load Time Tests
- **DOM Content Loaded**: Time until HTML parsing complete (target: <1s cold)
- **Network Idle**: All network requests finished (target: <2.5s cold)
- **Full Load**: Load event completed (target: <3s cold)

### Operations Benchmarks
- **P50**: 50th percentile (median) response time
- **P95**: 95th percentile (95% of requests faster)
- **P99**: 99th percentile (99% of requests faster)

### Memory
- **Baseline**: Initial memory before operations
- **Growth**: Memory increase during operations
- **Cleanup**: Memory after garbage collection
- **Limit**: Maximum allowed (alert at >300MB)

### Core Web Vitals
- **LCP**: Largest Contentful Paint (visual completeness)
- **FID**: First Input Delay (interactivity)
- **CLS**: Cumulative Layout Shift (visual stability)

## Running Tests

### Individual Suites
```bash
# Load time tests
npx playwright test tests/performance/load-time.perf.test.js

# Operations benchmarks
npx playwright test tests/performance/operations-benchmark.perf.test.js

# Stress tests
npx playwright test tests/performance/stress-tests.perf.test.js

# Real user monitoring
npx playwright test tests/performance/real-user-monitoring.test.js

# Baseline comparison
npx playwright test tests/performance/baseline.comparison.test.js
```

### Specific Tests
```bash
# Run single test
npx playwright test load-time.perf.test.js -g "warm cache"

# With debugging
npx playwright test load-time.perf.test.js --debug

# Headed browser (visual feedback)
npx playwright test load-time.perf.test.js --headed

# Verbose output
npx playwright test --reporter=list
```

### Environment Variables
```bash
# Set server URL
export ODOO_URL=https://pwh19.iug.net

# Update baseline instead of comparing
export UPDATE_BASELINE=true

# Run with custom timeout
npx playwright test --timeout=120000
```

## Understanding Results

### Success Indicators
✅ All tests pass (no assertions fail)
✅ Load times under targets
✅ No regressions detected (>10% from baseline)
✅ Memory within limits
✅ Error rates <1%
✅ Core Web Vitals in "good" range

### Red Flags
❌ Tests timeout (check network, system load)
❌ High regression (>10% slower than baseline)
❌ Memory growth >20MB per cycle
❌ Error rate >5%
❌ High latency (P99 >2x target)

## Baseline Management

Baselines track historical performance and detect regressions.

```bash
# Create initial baseline
UPDATE_BASELINE=true npm run perf:baseline

# View baseline file
cat tests/performance/baseline.json

# Compare against baseline
npm run perf:baseline

# View comparison report
cat tests/performance/baseline-report.json

# Reset baseline (after major optimization)
rm tests/performance/baseline.json
UPDATE_BASELINE=true npm run perf:baseline
```

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
name: Performance Tests

on: [push, pull_request]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run performance baseline
        run: npm run perf:baseline

      - name: Check for regressions
        run: |
          if grep -q '"isRegression": true' tests/performance/baseline-report.json; then
            echo "Performance regressions detected!"
            exit 1
          fi

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v2
        with:
          name: performance-report
          path: tests/performance/baseline-report.json
```

## Profiling and Analysis

Use the `PerformanceProfiler` utility for deep analysis:

```javascript
import { PerformanceProfiler } from './profiling-utilities.js';

const profiler = new PerformanceProfiler(page);

// CPU profiling
await profiler.startCPUProfiling('my-operation');
// ... do work ...
const duration = await profiler.stopCPUProfiling('my-operation');

// Memory monitoring
await profiler.startMemoryMonitoring(500);
// ... do work ...
const timeline = await profiler.stopMemoryMonitoring();

// Heap snapshots
await profiler.takeHeapSnapshot('before');
// ... do work ...
await profiler.takeHeapSnapshot('after');
const comparison = profiler.compareHeapSnapshots();

// Memory leak detection
const leakAnalysis = await profiler.detectMemoryLeaks();

// Full report
const report = await profiler.generateReport('perf-report.json');
```

## File Structure

```
tests/performance/
├── load-time.perf.test.js              # Load time tests
├── operations-benchmark.perf.test.js   # Operations benchmarks
├── stress-tests.perf.test.js           # Stress tests
├── real-user-monitoring.test.js        # RUM/synthetic monitoring
├── baseline.comparison.test.js         # Regression detection
├── profiling-utilities.js              # Analysis tools
├── baseline.json                       # Baseline metrics (auto-generated)
├── baseline-report.json                # Comparison report (auto-generated)
├── PERFORMANCE_TEST_GUIDE.md           # Complete documentation
└── README.md                           # This file
```

## Common Issues

### Tests are slow
- Network is throttled or unstable
- System is under load (close apps)
- Playwright browser processes accumulating (restart)

Solution: Run in consistent environment, use `-j 1` (single worker)

### Inconsistent results
- Cache state varies between runs
- Network conditions fluctuate
- System load changes

Solution: Warm up cache, run multiple iterations, use percentiles

### Out of memory
- Too much data loaded simultaneously
- Memory not being released

Solution: Enable more Node.js heap, split tests into smaller chunks

### Timeout errors
- Server is slow or unavailable
- Network is very slow
- Test assertion taking too long

Solution: Increase timeout in playwright.config.js, check server health

## Performance Optimization Tips

1. **Monitor Regularly**
   - Run baseline weekly
   - Track trends over time
   - Set performance budgets

2. **Identify Bottlenecks**
   - Use profiler utility
   - Check network waterfall
   - Profile memory usage

3. **Optimize Common Issues**
   - Reduce bundle size (code splitting)
   - Cache aggressively (service workers)
   - Batch operations (reduce round trips)
   - Monitor memory (prevent leaks)

4. **Test Realistically**
   - Use real data volumes
   - Test on various networks
   - Include slow devices
   - Monitor production

## References

- [Playwright Performance Testing](https://playwright.dev/docs/api/class-testoptions)
- [Web Performance APIs](https://developer.mozilla.org/en-US/docs/Web/API/Performance)
- [Core Web Vitals Guide](https://web.dev/vitals/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)

## Support & Questions

1. Read [PERFORMANCE_TEST_GUIDE.md](./PERFORMANCE_TEST_GUIDE.md) - most questions answered there
2. Check baseline-report.json for detailed metrics
3. Run test with `--debug` flag for step-through debugging
4. Use PerformanceProfiler for deep analysis
5. Check console output for specific error messages

## Contributing

When adding new performance tests:

1. Follow the existing test structure
2. Use meaningful metric names
3. Set realistic performance targets
4. Add clear console logging
5. Document the test purpose and targets
6. Update this README with new test info

## License

Part of PDC POS Offline Module - Performance Testing Suite
