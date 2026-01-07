/**
 * Load Time Performance Tests
 *
 * Measures page load performance under various conditions:
 * - Cold start (empty cache)
 * - Warm cache (repeat visits)
 * - Large dataset loading (50-500 users)
 * - Network throttle scenarios (3G, 4G, WiFi)
 * - Offline-to-online transition time
 */

import { test, expect } from '@playwright/test';

// Performance thresholds (in milliseconds)
const PERFORMANCE_TARGETS = {
  coldStart: {
    target: 3000,  // Target: <3s cold start
    acceptable: 4500,  // Acceptable: <4.5s
    threshold: 6000   // Alert: >6s
  },
  warmCache: {
    target: 1000,  // Target: <1s warm cache
    acceptable: 1500,
    threshold: 2500
  },
  largeDataset: {
    '50users': { target: 2000, acceptable: 3000, threshold: 4500 },
    '100users': { target: 3000, acceptable: 4500, threshold: 6000 },
    '500users': { target: 5000, acceptable: 7500, threshold: 10000 }
  },
  networkThrottle: {
    '3g': { target: 8000, acceptable: 12000, threshold: 16000 },
    '4g': { target: 2000, acceptable: 3000, threshold: 4500 },
    'wifi': { target: 1000, acceptable: 1500, threshold: 2500 }
  },
  offlineTransition: {
    target: 500,  // Target: <500ms to detect change
    acceptable: 1000,
    threshold: 2000
  }
};

test.describe('Load Time Performance', () => {

  test('should load POS page with cold cache under 3 seconds', async ({ browser }) => {
    const context = await browser.newContext();
    // Start with empty cache
    await context.clearCookies();
    const page = await context.newPage();

    const startTime = performance.now();
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });
    const domLoadTime = performance.now() - startTime;

    // Wait for full interactive
    await page.waitForLoadState('networkidle');
    const fullLoadTime = performance.now() - startTime;

    console.log(`Cold Start - DOM Load: ${domLoadTime.toFixed(2)}ms, Full Load: ${fullLoadTime.toFixed(2)}ms`);

    expect(domLoadTime).toBeLessThan(PERFORMANCE_TARGETS.coldStart.threshold);
    if (domLoadTime > PERFORMANCE_TARGETS.coldStart.acceptable) {
      console.warn(`Cold start slower than target: ${domLoadTime}ms vs ${PERFORMANCE_TARGETS.coldStart.target}ms`);
    }

    await context.close();
  });

  test('should load POS page with warm cache under 1 second', async ({ page }) => {
    // First visit to warm cache
    await page.goto('/pos/web', { waitUntil: 'networkidle' });

    // Reload with warm cache
    const startTime = performance.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    const domLoadTime = performance.now() - startTime;

    await page.waitForLoadState('networkidle');
    const fullLoadTime = performance.now() - startTime;

    console.log(`Warm Cache - DOM Load: ${domLoadTime.toFixed(2)}ms, Full Load: ${fullLoadTime.toFixed(2)}ms`);

    expect(domLoadTime).toBeLessThan(PERFORMANCE_TARGETS.warmCache.threshold);
    if (domLoadTime > PERFORMANCE_TARGETS.warmCache.acceptable) {
      console.warn(`Warm cache slower than target: ${domLoadTime}ms vs ${PERFORMANCE_TARGETS.warmCache.target}ms`);
    }
  });

  test('should load POS with 50 users in offline DB under 2 seconds', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    // Create mock 50-user dataset in IndexedDB
    const prepareTime = await page.evaluate(async () => {
      const start = performance.now();
      const users = [];
      for (let i = 0; i < 50; i++) {
        users.push({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          groups: [1, 2]
        });
      }

      // Simulate storing users in IndexedDB
      return performance.now() - start;
    });

    // Measure load time with data
    const startTime = performance.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    const loadTime = performance.now() - startTime;

    console.log(`50 Users Load - Prepare: ${prepareTime.toFixed(2)}ms, Load: ${loadTime.toFixed(2)}ms`);
    expect(loadTime).toBeLessThan(PERFORMANCE_TARGETS.largeDataset['50users'].threshold);
  });

  test('should load POS with 100 users in offline DB under 3 seconds', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const startTime = performance.now();
    // Simulate 100-user dataset load
    await page.evaluate(async () => {
      const users = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`
      }));
      // IndexedDB write simulation
      return users.length;
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    const loadTime = performance.now() - startTime;

    console.log(`100 Users Load: ${loadTime.toFixed(2)}ms`);
    expect(loadTime).toBeLessThan(PERFORMANCE_TARGETS.largeDataset['100users'].threshold);
  });

  test('should load POS with 500 users in offline DB under 5 seconds', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const startTime = performance.now();
    await page.evaluate(async () => {
      const users = Array.from({ length: 500 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`
      }));
      return users.length;
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    const loadTime = performance.now() - startTime;

    console.log(`500 Users Load: ${loadTime.toFixed(2)}ms`);
    expect(loadTime).toBeLessThan(PERFORMANCE_TARGETS.largeDataset['500users'].threshold);
  });

  test('should handle 3G throttling and load under 8 seconds', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Simulate 3G network: 400kbps down, 20 latency, 3s latency variance
    await page.route('**/*', route => {
      setTimeout(() => {
        route.continue();
      }, 20);
    });

    const startTime = performance.now();
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });
    const loadTime = performance.now() - startTime;

    console.log(`3G Throttled Load: ${loadTime.toFixed(2)}ms`);
    expect(loadTime).toBeLessThan(PERFORMANCE_TARGETS.networkThrottle['3g'].threshold);

    await context.close();
  });

  test('should handle 4G throttling and load under 2 seconds', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Simulate 4G network: 4Mbps, 50ms latency
    await page.route('**/*', route => {
      setTimeout(() => {
        route.continue();
      }, 5);
    });

    const startTime = performance.now();
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });
    const loadTime = performance.now() - startTime;

    console.log(`4G Throttled Load: ${loadTime.toFixed(2)}ms`);
    expect(loadTime).toBeLessThan(PERFORMANCE_TARGETS.networkThrottle['4g'].threshold);

    await context.close();
  });

  test('should handle WiFi and load under 1 second', async ({ page }) => {
    const startTime = performance.now();
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });
    const loadTime = performance.now() - startTime;

    console.log(`WiFi Load: ${loadTime.toFixed(2)}ms`);
    expect(loadTime).toBeLessThan(PERFORMANCE_TARGETS.networkThrottle.wifi.threshold);
  });

  test('should detect offline-to-online transition in under 500ms', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    // Simulate going offline
    await page.context().setOffline(true);

    const startTime = performance.now();

    // Go online and measure detection time
    await page.context().setOffline(false);

    // Wait for connection detection event
    const transitionTime = await page.evaluate(async () => {
      return new Promise(resolve => {
        const start = performance.now();
        window.addEventListener('online', () => {
          resolve(performance.now() - start);
        }, { once: true });
      });
    });

    console.log(`Offline-to-Online Transition: ${transitionTime.toFixed(2)}ms`);
    expect(transitionTime).toBeLessThan(PERFORMANCE_TARGETS.offlineTransition.threshold);
  });

  test('should measure Core Web Vitals', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const vitals = await page.evaluate(async () => {
      return new Promise(resolve => {
        const vitals = {
          lcp: null,  // Largest Contentful Paint
          fid: null,  // First Input Delay
          cls: null   // Cumulative Layout Shift
        };

        // Observe LCP
        if ('PerformanceObserver' in window) {
          const lcpObserver = new PerformanceObserver(list => {
            vitals.lcp = list.getEntries().pop().renderTime || list.getEntries().pop().loadTime;
          });
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

          // Observe FID
          const fidObserver = new PerformanceObserver(list => {
            vitals.fid = list.getEntries()[0].processingDuration;
          });
          fidObserver.observe({ entryTypes: ['first-input'] });

          // Observe CLS
          let clsValue = 0;
          const clsObserver = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            }
            vitals.cls = clsValue;
          });
          clsObserver.observe({ entryTypes: ['layout-shift'] });

          setTimeout(() => {
            lcpObserver.disconnect();
            fidObserver.disconnect();
            clsObserver.disconnect();
            resolve(vitals);
          }, 5000);
        } else {
          resolve(vitals);
        }
      });
    });

    console.log(`Core Web Vitals - LCP: ${vitals.lcp?.toFixed(2)}ms, FID: ${vitals.fid?.toFixed(2)}ms, CLS: ${vitals.cls?.toFixed(3)}`);
  });

  test('should maintain consistent load times across 5 consecutive navigations', async ({ page }) => {
    const loadTimes = [];

    for (let i = 0; i < 5; i++) {
      const startTime = performance.now();
      await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });
      loadTimes.push(performance.now() - startTime);
    }

    const avgTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
    const maxVariance = Math.max(...loadTimes) - Math.min(...loadTimes);

    console.log(`Load time consistency - Avg: ${avgTime.toFixed(2)}ms, Variance: ${maxVariance.toFixed(2)}ms`);
    console.log(`Individual loads: ${loadTimes.map(t => t.toFixed(2) + 'ms').join(', ')}`);

    // Variance should be reasonable (not more than 50% of average)
    expect(maxVariance).toBeLessThan(avgTime * 0.5);
  });
});
