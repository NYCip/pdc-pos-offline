# Performance Measurement Methodology

Detailed methodology for how PDC POS Offline performance is measured, including measurement techniques, statistical approaches, and validation procedures.

## Table of Contents

1. [Measurement Philosophy](#measurement-philosophy)
2. [Measurement Techniques](#measurement-techniques)
3. [Statistical Methods](#statistical-methods)
4. [Data Collection](#data-collection)
5. [Validation Procedures](#validation-procedures)
6. [Reporting Standards](#reporting-standards)
7. [Performance Targets](#performance-targets)

---

## Measurement Philosophy

### Core Principles

1. **Real-World Relevance**
   - Measure what matters to users
   - Test realistic scenarios
   - Use real data volumes
   - Account for network variability

2. **Statistical Rigor**
   - Multiple iterations (20+ samples)
   - Percentile-based analysis (P50, P95, P99)
   - Significance testing
   - Variance analysis

3. **Reproducibility**
   - Controlled environment
   - Documented procedures
   - Baseline comparisons
   - Variance tracking

4. **Continuous Improvement**
   - Trending over time
   - Identifying bottlenecks
   - Optimization prioritization
   - Performance budgets

### Why Percentiles Matter

Percentiles provide better insight than averages:

```
Metric: Single User Sync Time
Samples: [100ms, 105ms, 110ms, 120ms, 150ms, 180ms, 200ms, 250ms, 300ms, 2000ms]

Average: 341.5ms ← Skewed by outlier
P50 (Median): 150ms ← Typical user experience
P95: 300ms ← Worst 5% of users
P99: 2000ms ← Very rare but important

Target Setting:
- P50 <200ms: Good typical experience
- P95 <500ms: Acceptable for most users
- P99 <1000ms: Extreme outliers tolerable
```

---

## Measurement Techniques

### 1. Navigation Timing API

Measures browser page load performance with high precision.

```javascript
const timing = performance.getEntriesByType('navigation')[0];

// Timing phases
const phases = {
  dns: timing.domainLookupEnd - timing.domainLookupStart,
  tcp: timing.connectEnd - timing.connectStart,
  ttfb: timing.responseStart - timing.requestStart,
  download: timing.responseEnd - timing.responseStart,
  domInteractive: timing.domInteractive,
  domComplete: timing.domComplete,
  loadEvent: timing.loadEventEnd
};
```

**Accuracy**: ±1ms
**Browser Support**: All modern browsers
**Use Case**: Initial page load measurement

### 2. Performance.now()

High-resolution timer for precise operation timing.

```javascript
const start = performance.now();
// ... operation ...
const duration = performance.now() - start;
```

**Accuracy**: ±0.1ms (microsecond precision)
**Browser Support**: All modern browsers
**Use Case**: Operation latency, custom measurements

### 3. PerformanceObserver API

Asynchronous observation of performance entries.

```javascript
const observer = new PerformanceObserver(list => {
  for (const entry of list.getEntries()) {
    console.log(`${entry.name}: ${entry.duration}ms`);
  }
});

observer.observe({ entryTypes: ['largest-contentful-paint', 'layout-shift'] });
```

**Accuracy**: ±1ms
**Browser Support**: Modern browsers (Chrome, Edge, Firefox)
**Use Case**: Web Vitals, frame timing, resource timing

### 4. Memory API

Measures JavaScript heap memory usage.

```javascript
const memory = performance.memory;

const metrics = {
  usedMemory: memory.usedJSHeapSize,
  totalMemory: memory.totalJSHeapSize,
  memoryLimit: memory.jsHeapSizeLimit,
  utilizationPercent: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
};
```

**Accuracy**: ±100KB (estimated)
**Browser Support**: Chrome, Edge (limited)
**Use Case**: Memory profiling, leak detection

### 5. Resource Timing API

Detailed timing for network resources.

```javascript
const resources = performance.getEntriesByType('resource');

for (const resource of resources) {
  const metrics = {
    name: resource.name,
    dns: resource.domainLookupEnd - resource.domainLookupStart,
    tcp: resource.connectEnd - resource.connectStart,
    ttfb: resource.responseStart - resource.requestStart,
    download: resource.responseEnd - resource.responseStart,
    total: resource.duration
  };
}
```

**Accuracy**: ±1ms
**Browser Support**: All modern browsers
**Use Case**: Network waterfall analysis, resource optimization

### 6. requestAnimationFrame

Measures frame timing and render performance.

```javascript
let frameCount = 0;
const startTime = performance.now();

const measureFrame = () => {
  frameCount++;
  const elapsed = performance.now() - startTime;
  const fps = (frameCount / elapsed) * 1000;

  if (elapsed < 5000) {
    requestAnimationFrame(measureFrame);
  }
};

requestAnimationFrame(measureFrame);
```

**Accuracy**: ±16.67ms (60fps target)
**Browser Support**: All modern browsers
**Use Case**: Frame rate, animation smoothness

---

## Statistical Methods

### Sample Collection

**Minimum Samples**: 20 iterations
**Recommended**: 50+ iterations
**Procedure**:

```javascript
async function collectSamples(operation, count = 30) {
  const samples = [];

  // Warm-up run (not counted)
  await operation();

  // Collect samples
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    await operation();
    samples.push(performance.now() - start);
  }

  return samples;
}
```

### Percentile Calculation

```javascript
function percentile(sorted, p) {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function analyze(samples) {
  const sorted = samples.sort((a, b) => a - b);

  return {
    count: samples.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: samples.reduce((a, b) => a + b, 0) / samples.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    stdDev: calculateStdDev(samples)
  };
}

function calculateStdDev(samples) {
  const avg = samples.reduce((a, b) => a + b) / samples.length;
  const variance = samples.reduce((sum, x) => sum + Math.pow(x - avg, 2), 0) / samples.length;
  return Math.sqrt(variance);
}
```

### Regression Detection

```javascript
function detectRegression(current, baseline, threshold = 0.10) {
  const regression = (current - baseline) / baseline;
  const isRegression = regression > threshold;

  return {
    current,
    baseline,
    regression: (regression * 100).toFixed(2),
    isRegression,
    message: isRegression
      ? `REGRESSION: ${regression * 100}% slower`
      : `OK: ${Math.abs(regression * 100)}% ${regression > 0 ? 'slower' : 'faster'}`
  };
}
```

### Confidence Intervals

For more rigorous analysis:

```javascript
function confidenceInterval(samples, confidence = 0.95) {
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b) / n;
  const stdDev = Math.sqrt(
    samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1)
  );

  // t-value for 95% confidence (approximation)
  const tValue = confidence === 0.95 ? 1.96 : 2.576;
  const marginOfError = tValue * (stdDev / Math.sqrt(n));

  return {
    mean,
    lowerBound: mean - marginOfError,
    upperBound: mean + marginOfError,
    marginOfError
  };
}
```

---

## Data Collection

### Collection Checklist

Before each measurement session:

- [ ] System is at rest (no other apps running)
- [ ] Network is stable (consistent ISP connection)
- [ ] Browser cache is cleared (cold start tests)
- [ ] CPU/memory monitoring available
- [ ] Baseline from previous run available
- [ ] Test environment documented
- [ ] System time synchronized

### Environmental Factors

**Network Conditions**
```javascript
const networkProfiles = {
  wifi: { latency: 10, bandwidth: 10000 },
  '4g': { latency: 50, bandwidth: 4000 },
  '3g': { latency: 400, bandwidth: 400 },
  '2g': { latency: 500, bandwidth: 50 }
};
```

**Device Profiles**
```javascript
const deviceProfiles = {
  highEnd: { memory: 8192, cores: 8 },
  midRange: { memory: 4096, cores: 4 },
  lowEnd: { memory: 1024, cores: 2 },
  mobile: { memory: 2048, cores: 4, deviceMemory: 2 }
};
```

**System Load**
Measure system impact:
```javascript
const systemMetrics = {
  cpuUsage: process.cpuUsage(),
  memoryUsage: process.memoryUsage(),
  uptime: process.uptime()
};
```

### Data Normalization

Adjust measurements for environmental factors:

```javascript
function normalizeForConditions(rawMeasurement, conditions) {
  let normalized = rawMeasurement;

  // Adjust for network latency
  if (conditions.networkLatency > 50) {
    normalized *= (50 / conditions.networkLatency);
  }

  // Adjust for system load
  if (conditions.cpuUsage > 50) {
    normalized *= 1.2; // 20% penalty
  }

  return normalized;
}
```

---

## Validation Procedures

### Quality Checks

1. **Outlier Detection**
   ```javascript
   function removeOutliers(samples, threshold = 3) {
     const mean = samples.reduce((a, b) => a + b) / samples.length;
     const stdDev = Math.sqrt(
       samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / samples.length
     );

     return samples.filter(x => Math.abs(x - mean) < threshold * stdDev);
   }
   ```

2. **Consistency Check**
   ```javascript
   function checkConsistency(samples) {
     const sorted = samples.sort((a, b) => a - b);
     const iqr = sorted[Math.floor(0.75 * sorted.length)] -
                 sorted[Math.floor(0.25 * sorted.length)];
     const cv = Math.sqrt(variance(samples)) / mean(samples); // Coefficient of variation

     return {
       iqr,
       cv,
       isConsistent: cv < 0.3 // Less than 30% variation
     };
   }
   ```

3. **Sample Size Validation**
   ```javascript
   function validateSampleSize(samples, requiredSamples = 20) {
     return {
       actual: samples.length,
       required: requiredSamples,
       valid: samples.length >= requiredSamples,
       message: samples.length < requiredSamples
         ? `Need ${requiredSamples - samples.length} more samples`
         : 'Sample size adequate'
     };
   }
   ```

### Error Handling

Measurements may fail for various reasons:

```javascript
function measureWithValidation(operation, options = {}) {
  const {
    maxRetries = 3,
    timeout = 30000,
    validateResult = null
  } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      );

      const start = performance.now();
      const result = await Promise.race([operation(), timeout]);
      const duration = performance.now() - start;

      if (validateResult && !validateResult(result)) {
        throw new Error('Validation failed');
      }

      return { success: true, duration, result };
    } catch (error) {
      if (attempt === maxRetries) {
        return { success: false, error: error.message, attempt };
      }
      // Exponential backoff
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 100));
    }
  }
}
```

---

## Reporting Standards

### Standard Report Format

```json
{
  "timestamp": "2026-01-07T10:30:00Z",
  "metric": "page_load_cold_start_ms",
  "measurement": {
    "count": 30,
    "min": 750,
    "max": 1200,
    "avg": 950,
    "stdDev": 120,
    "p50": 920,
    "p95": 1100,
    "p99": 1180
  },
  "baseline": {
    "value": 850,
    "date": "2026-01-01T12:00:00Z"
  },
  "comparison": {
    "regression": 11.76,
    "isRegression": true,
    "threshold": 10
  },
  "environment": {
    "browser": "chromium",
    "platform": "linux",
    "networkCondition": "wifi",
    "systemLoad": "normal"
  },
  "validation": {
    "outliersRemoved": 0,
    "consistency": "good",
    "sampleSizeAdequate": true
  }
}
```

### Report Sections

**Summary**
- Key metrics (P50, P95, P99)
- Status (PASS/FAIL)
- Regression detection

**Detailed Analysis**
- Sample distribution
- Histogram/percentile chart
- Comparison with baseline
- Statistical significance

**Recommendations**
- If regression: likely causes and fixes
- Optimization opportunities
- Monitoring recommendations

---

## Performance Targets

### Target Setting Methodology

Targets are set based on:

1. **User Expectations**
   - Industry standards (e.g., <2.5s LCP)
   - Competitor benchmarks
   - Historical performance

2. **Technical Constraints**
   - Hardware capabilities
   - Network limitations
   - API response times

3. **Business Goals**
   - SLA requirements
   - User retention goals
   - Revenue impact

### Target Hierarchy

```
IDEAL (all users happy)
  ↓
TARGET (good experience for 95% of users)
  ↓
ACCEPTABLE (not ideal but tolerable)
  ↓
ALERT THRESHOLD (action required)
```

### Current Performance Targets

**Load Time**
| Metric | Ideal | Target | Acceptable | Alert |
|--------|-------|--------|-----------|-------|
| Cold Start | <1.5s | <3s | <4.5s | >6s |
| Warm Cache | <500ms | <1s | <1.5s | >2.5s |

**Operations**
| Metric | P50 | P95 | P99 |
|--------|-----|-----|-----|
| Single Sync | <150ms | <300ms | <500ms |
| Batch (50) | <1.5s | <3s | <5s |

**Web Vitals**
| Metric | Good | Acceptable | Poor |
|--------|------|-----------|------|
| LCP | <1.5s | <2.5s | >4s |
| FID | <50ms | <100ms | >300ms |
| CLS | <0.05 | <0.1 | >0.25 |

---

## Continuous Monitoring

### Monitoring Strategy

```javascript
// Automated performance monitoring
class PerformanceMonitor {
  constructor(options = {}) {
    this.thresholds = options.thresholds || {};
    this.samplingRate = options.samplingRate || 0.1; // 10%
    this.reportingEndpoint = options.reportingEndpoint;
  }

  async initialize() {
    // Track Web Vitals
    this.trackWebVitals();

    // Monitor custom operations
    this.monitorOperations();

    // Periodic reports
    this.startPeriodicReporting();
  }

  trackWebVitals() {
    // Collect LCP, FID, CLS
  }

  monitorOperations() {
    // Monitor sync operations, IndexedDB, etc.
  }

  startPeriodicReporting() {
    // Send data to analytics endpoint
  }
}
```

### Alerting

Generate alerts when:
- P99 > 2x target
- Error rate > 5%
- Memory leak detected
- Regression > 20%

---

## Conclusion

This methodology ensures:
- **Accuracy**: High-precision measurements
- **Rigor**: Statistical validation
- **Reproducibility**: Documented procedures
- **Relevance**: Real-world scenarios
- **Actionability**: Clear thresholds and recommendations

Performance measurement is an ongoing process requiring continuous validation and improvement.
