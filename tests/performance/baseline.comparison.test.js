/**
 * Baseline and Comparative Benchmarks
 *
 * Tracks performance regressions by comparing current metrics against:
 * - Historical baseline (stored in baseline.json)
 * - Target performance goals
 * - Previous build performance
 *
 * Usage:
 * - npm run perf:baseline -- --update (creates/updates baseline)
 * - npm run perf:test (compares against baseline)
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASELINE_FILE = './tests/performance/baseline.json';
const REGRESSION_THRESHOLD = 0.10; // 10% regression triggers failure

// Load existing baseline
function loadBaseline() {
  if (fs.existsSync(BASELINE_FILE)) {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
  }
  return {};
}

// Save baseline
function saveBaseline(data) {
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(data, null, 2));
}

// Compare metrics
function compareMetric(current, baseline, metricName, updateMode = false) {
  if (updateMode || !baseline[metricName]) {
    return { current, baseline: current, regression: 0, status: 'new' };
  }

  const regressionRatio = (current - baseline[metricName]) / baseline[metricName];
  const regressionPercent = regressionRatio * 100;
  const isRegression = regressionRatio > REGRESSION_THRESHOLD;

  return {
    current,
    baseline: baseline[metricName],
    regression: regressionPercent,
    status: isRegression ? 'REGRESSION' : regressionRatio > 0 ? 'slower' : 'faster',
    isRegression
  };
}

test.describe('Baseline and Comparative Benchmarks', () => {
  let baseline = loadBaseline();
  let updateMode = process.env.UPDATE_BASELINE === 'true';

  test.beforeAll(() => {
    if (updateMode) {
      console.log('UPDATE MODE: Creating/updating baseline metrics');
      baseline = {}; // Reset for update
    }
  });

  test.afterAll(() => {
    if (updateMode) {
      saveBaseline(baseline);
      console.log(`Baseline saved to ${BASELINE_FILE}`);
    } else {
      // Generate comparison report
      const report = {
        timestamp: new Date().toISOString(),
        results: baseline,
        regressions: Object.entries(baseline)
          .filter(([_, data]) => data.isRegression)
          .map(([name, data]) => ({ metric: name, regression: data.regression }))
      };

      console.log('\n=== PERFORMANCE COMPARISON REPORT ===\n');
      for (const [metric, data] of Object.entries(baseline)) {
        if (data.status !== 'new') {
          const arrow = data.regression > 0 ? '↑' : '↓';
          console.log(`${metric}:
            Current: ${data.current.toFixed(2)}ms
            Baseline: ${data.baseline.toFixed(2)}ms
            Change: ${arrow} ${Math.abs(data.regression).toFixed(2)}%
            Status: ${data.status}
          `);
        }
      }
    }
  });

  test('should measure page load time (cold start)', async ({ browser }) => {
    const context = await browser.newContext();
    await context.clearCookies();
    const page = await context.newPage();

    const startTime = performance.now();
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });
    const loadTime = performance.now() - startTime;

    const metric = 'page_load_cold_start_ms';
    const comparison = compareMetric(loadTime, baseline, metric, updateMode);

    baseline[metric] = {
      ...comparison,
      timestamp: new Date().toISOString(),
      description: 'Page load time with cold cache'
    };

    console.log(`Cold Start: ${loadTime.toFixed(2)}ms ${comparison.status}`);

    expect(loadTime).toBeLessThan(6000); // Absolute threshold

    if (comparison.isRegression) {
      console.warn(`REGRESSION: ${metric} degraded by ${comparison.regression.toFixed(2)}%`);
    }

    expect(comparison.isRegression).toBe(false);

    await context.close();
  });

  test('should measure page load time (warm cache)', async ({ page }) => {
    // Warm cache
    await page.goto('/pos/web', { waitUntil: 'networkidle' });

    // Measure on reload
    const startTime = performance.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    const loadTime = performance.now() - startTime;

    const metric = 'page_load_warm_cache_ms';
    const comparison = compareMetric(loadTime, baseline, metric, updateMode);

    baseline[metric] = {
      ...comparison,
      timestamp: new Date().toISOString(),
      description: 'Page load time with warm cache'
    };

    console.log(`Warm Cache: ${loadTime.toFixed(2)}ms ${comparison.status}`);

    expect(loadTime).toBeLessThan(2500); // Absolute threshold
    expect(comparison.isRegression).toBe(false);
  });

  test('should measure single user sync latency (P50)', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const syncTimes = [];
    for (let i = 0; i < 20; i++) {
      const syncTime = await page.evaluate(async () => {
        const start = performance.now();
        try {
          await fetch('/api/user/sync', {
            method: 'POST',
            body: JSON.stringify({ userId: Math.random() })
          });
        } catch (e) {
          // Ignore
        }
        return performance.now() - start;
      });
      syncTimes.push(syncTime);
    }

    syncTimes.sort((a, b) => a - b);
    const p50 = syncTimes[Math.floor(syncTimes.length * 0.5)];

    const metric = 'user_sync_p50_ms';
    const comparison = compareMetric(p50, baseline, metric, updateMode);

    baseline[metric] = {
      ...comparison,
      timestamp: new Date().toISOString(),
      description: 'Single user sync latency (P50)'
    };

    console.log(`User Sync P50: ${p50.toFixed(2)}ms ${comparison.status}`);

    expect(p50).toBeLessThan(500); // Absolute threshold
    expect(comparison.isRegression).toBe(false);
  });

  test('should measure batch sync latency (50 users)', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const batchTime = await page.evaluate(async () => {
      const start = performance.now();

      const users = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        name: `User ${i}`
      }));

      for (const user of users) {
        try {
          await fetch('/api/user/sync', {
            method: 'POST',
            body: JSON.stringify(user)
          });
        } catch (e) {
          // Ignore
        }
      }

      return performance.now() - start;
    });

    const metric = 'batch_sync_50users_ms';
    const comparison = compareMetric(batchTime, baseline, metric, updateMode);

    baseline[metric] = {
      ...comparison,
      timestamp: new Date().toISOString(),
      description: 'Batch sync 50 users latency'
    };

    console.log(`Batch Sync (50): ${batchTime.toFixed(2)}ms ${comparison.status}`);

    expect(batchTime).toBeLessThan(10000); // Absolute threshold
    expect(comparison.isRegression).toBe(false);
  });

  test('should measure IndexedDB write performance', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const writeTimes = [];
    for (let i = 0; i < 50; i++) {
      const writeTime = await page.evaluate(async (i) => {
        const start = performance.now();

        try {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('PDCPOSOfflineDB');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });

          const tx = db.transaction(['users'], 'readwrite');
          const store = tx.objectStore('users');
          store.put({ id: i, name: `User ${i}`, data: new Date().toISOString() });

          await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        } catch (e) {
          // Ignore
        }

        return performance.now() - start;
      }, i);

      writeTimes.push(writeTime);
    }

    writeTimes.sort((a, b) => a - b);
    const p50 = writeTimes[Math.floor(writeTimes.length * 0.5)];

    const metric = 'indexeddb_write_p50_ms';
    const comparison = compareMetric(p50, baseline, metric, updateMode);

    baseline[metric] = {
      ...comparison,
      timestamp: new Date().toISOString(),
      description: 'IndexedDB write operation (P50)'
    };

    console.log(`IndexedDB Write P50: ${p50.toFixed(2)}ms ${comparison.status}`);

    expect(p50).toBeLessThan(50); // Absolute threshold
    expect(comparison.isRegression).toBe(false);
  });

  test('should measure memory footprint', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    // Load some data to get realistic memory usage
    await page.evaluate(async () => {
      const users = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`
      }));

      for (const user of users) {
        try {
          await fetch('/api/user/sync', {
            method: 'POST',
            body: JSON.stringify(user)
          });
        } catch (e) {
          // Ignore
        }
      }
    });

    const memUsageMB = await page.evaluate(() => {
      return (performance.memory?.usedJSHeapSize / (1024 * 1024)) || 0;
    });

    const metric = 'memory_usage_mb';
    const comparison = compareMetric(memUsageMB, baseline, metric, updateMode);

    baseline[metric] = {
      ...comparison,
      timestamp: new Date().toISOString(),
      description: 'JS Heap memory usage after 100-user load'
    };

    console.log(`Memory Usage: ${memUsageMB.toFixed(2)}MB ${comparison.status}`);

    expect(memUsageMB).toBeLessThan(300); // Absolute threshold
    expect(comparison.isRegression).toBe(false);
  });

  test('should measure Core Web Vitals (LCP)', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const lcp = await page.evaluate(() => {
      return new Promise(resolve => {
        const observer = new PerformanceObserver(list => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          resolve((lastEntry.renderTime || lastEntry.loadTime) || 0);
        });

        observer.observe({ entryTypes: ['largest-contentful-paint'] });

        // Timeout after 10 seconds
        setTimeout(() => {
          observer.disconnect();
          resolve(0);
        }, 10000);
      });
    });

    const metric = 'cwv_lcp_ms';
    const comparison = compareMetric(lcp, baseline, metric, updateMode);

    baseline[metric] = {
      ...comparison,
      timestamp: new Date().toISOString(),
      description: 'Core Web Vitals - Largest Contentful Paint'
    };

    console.log(`LCP: ${lcp.toFixed(2)}ms ${comparison.status}`);

    expect(lcp).toBeLessThan(4000); // Google target
    if (lcp > 0) {
      expect(comparison.isRegression).toBe(false);
    }
  });

  test('should detect performance regressions', async ({ page }) => {
    // This test verifies that we catch regressions
    const hasRegressions = Object.values(baseline).some(
      metric => metric.isRegression === true
    );

    if (hasRegressions && !updateMode) {
      const regressions = Object.entries(baseline)
        .filter(([_, m]) => m.isRegression)
        .map(([name, m]) => `${name}: ${m.regression.toFixed(2)}%`)
        .join('\n');

      console.error(`PERFORMANCE REGRESSIONS DETECTED:\n${regressions}`);
      expect(hasRegressions).toBe(false);
    }
  });

  test('should generate baseline comparison report', async () => {
    const reportPath = './tests/performance/baseline-report.json';
    const report = {
      timestamp: new Date().toISOString(),
      totalMetrics: Object.keys(baseline).length,
      regressions: Object.entries(baseline)
        .filter(([_, m]) => m.isRegression)
        .length,
      improvements: Object.entries(baseline)
        .filter(([_, m]) => !m.isRegression && m.regression < 0)
        .length,
      metrics: baseline
    };

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\nBaseline report saved to ${reportPath}`);
    console.log(`Summary: ${report.totalMetrics} metrics, ${report.regressions} regressions, ${report.improvements} improvements`);
  });
});
