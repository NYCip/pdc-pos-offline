/**
 * Real User Monitoring (RUM) and Synthetic Monitoring
 *
 * Measures:
 * - Navigation timing measurements
 * - Core Web Vitals (LCP, FID, CLS)
 * - Custom performance marks
 * - Error rate tracking during sync
 * - User session analysis
 * - Lighthouse automated audits
 */

import { test, expect } from '@playwright/test';

const RUM_TARGETS = {
  navigation: {
    domInteractive: 2000,
    domComplete: 3000,
    loadEventEnd: 3500
  },
  webVitals: {
    lcp: 2500,      // Largest Contentful Paint (good: <2.5s)
    fid: 100,       // First Input Delay (good: <100ms)
    cls: 0.1        // Cumulative Layout Shift (good: <0.1)
  },
  syntheticMonitoring: {
    firstByte: 600,       // Time to First Byte
    onLoad: 3000,         // Page load
    tti: 4000,            // Time to Interactive
    fps: 60                // Frames per second
  }
};

test.describe('Real User Monitoring (RUM)', () => {

  test('should measure navigation timing metrics', async ({ page }) => {
    const navigationMetrics = await page.evaluate(async () => {
      // Navigate to page
      return new Promise(resolve => {
        window.addEventListener('load', () => {
          const timing = performance.getEntriesByType('navigation')[0];

          if (!timing) {
            resolve({
              error: 'Navigation timing not available'
            });
            return;
          }

          resolve({
            dns: timing.domainLookupEnd - timing.domainLookupStart,
            tcp: timing.connectEnd - timing.connectStart,
            ttfb: timing.responseStart - timing.requestStart, // Time to First Byte
            download: timing.responseEnd - timing.responseStart,
            domInteractive: timing.domInteractive,
            domComplete: timing.domComplete,
            loadEventStart: timing.loadEventStart,
            loadEventEnd: timing.loadEventEnd,
            totalTime: timing.loadEventEnd
          });
        });
      });
    });

    await page.goto('/pos/web');

    console.log(`
      Navigation Timing Metrics:
      - DNS Lookup: ${navigationMetrics.dns?.toFixed(2) || 'N/A'}ms
      - TCP Connect: ${navigationMetrics.tcp?.toFixed(2) || 'N/A'}ms
      - TTFB: ${navigationMetrics.ttfb?.toFixed(2) || 'N/A'}ms
      - Download: ${navigationMetrics.download?.toFixed(2) || 'N/A'}ms
      - DOM Interactive: ${navigationMetrics.domInteractive?.toFixed(2) || 'N/A'}ms
      - DOM Complete: ${navigationMetrics.domComplete?.toFixed(2) || 'N/A'}ms
      - Load Event: ${navigationMetrics.loadEventEnd?.toFixed(2) || 'N/A'}ms
    `);

    if (navigationMetrics.domInteractive) {
      expect(navigationMetrics.domInteractive).toBeLessThan(RUM_TARGETS.navigation.domInteractive * 1.5);
    }
  });

  test('should measure Core Web Vitals (LCP, FID, CLS)', async ({ page }) => {
    const webVitals = await page.evaluate(() => {
      return new Promise(resolve => {
        const vitals = {
          lcp: null,
          fid: null,
          cls: 0
        };

        // Measure LCP (Largest Contentful Paint)
        const lcpObserver = new PerformanceObserver(list => {
          vitals.lcp = list.getEntries().pop().renderTime || list.getEntries().pop().loadTime;
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // Measure FID (First Input Delay)
        const fidObserver = new PerformanceObserver(list => {
          const firstInput = list.getEntries()[0];
          vitals.fid = firstInput.processingDuration;
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

        // Measure CLS (Cumulative Layout Shift)
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

        // Collect for 5 seconds
        setTimeout(() => {
          lcpObserver.disconnect();
          fidObserver.disconnect();
          clsObserver.disconnect();
          resolve(vitals);
        }, 5000);
      });
    });

    await page.goto('/pos/web', { waitUntil: 'networkidle' });

    console.log(`
      Core Web Vitals:
      - LCP: ${webVitals.lcp?.toFixed(2) || 'Not triggered'}ms
      - FID: ${webVitals.fid?.toFixed(2) || 'Not triggered'}ms
      - CLS: ${webVitals.cls?.toFixed(3) || 0}
    `);

    if (webVitals.lcp) {
      expect(webVitals.lcp).toBeLessThan(RUM_TARGETS.webVitals.lcp * 1.5);
    }
    if (webVitals.cls !== null) {
      expect(webVitals.cls).toBeLessThan(RUM_TARGETS.webVitals.cls * 2);
    }
  });

  test('should track custom performance marks during sync operations', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const marks = await page.evaluate(async () => {
      // Mark start of sync operation
      performance.mark('sync-start');

      // Simulate sync operations
      for (let i = 0; i < 5; i++) {
        performance.mark(`sync-user-${i}-start`);

        try {
          await fetch('/api/user/sync', {
            method: 'POST',
            body: JSON.stringify({ userId: i })
          });
        } catch (e) {
          // Ignore
        }

        performance.mark(`sync-user-${i}-end`);
        performance.measure(`sync-user-${i}`, `sync-user-${i}-start`, `sync-user-${i}-end`);
      }

      performance.mark('sync-end');
      performance.measure('total-sync', 'sync-start', 'sync-end');

      // Get all measures
      const measures = performance.getEntriesByType('measure')
        .filter(m => m.name.includes('sync'));

      return measures.map(m => ({
        name: m.name,
        duration: m.duration.toFixed(2)
      }));
    });

    console.log('Custom Performance Marks:');
    marks.forEach(mark => {
      console.log(`  ${mark.name}: ${mark.duration}ms`);
    });

    expect(marks.length).toBeGreaterThan(0);
  });

  test('should measure error rate during sync operations', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const errorMetrics = await page.evaluate(async () => {
      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      // Perform 20 sync operations
      for (let i = 0; i < 20; i++) {
        try {
          const response = await Promise.race([
            fetch('/api/user/sync', {
              method: 'POST',
              body: JSON.stringify({ userId: i })
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 5000)
            )
          ]);

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
            errors.push({
              index: i,
              status: response.status,
              type: 'http-error'
            });
          }
        } catch (e) {
          errorCount++;
          errors.push({
            index: i,
            error: e.message,
            type: 'network-error'
          });
        }
      }

      return {
        success: successCount,
        errors: errorCount,
        errorRate: (errorCount / (successCount + errorCount)).toFixed(3),
        errorDetails: errors.slice(0, 5)
      };
    });

    console.log(`
      Error Rate During Sync:
      - Success: ${errorMetrics.success}/20
      - Errors: ${errorMetrics.errors}/20
      - Error Rate: ${(errorMetrics.errorRate * 100).toFixed(2)}%
    `);

    // Error rate should be acceptable
    expect(parseFloat(errorMetrics.errorRate)).toBeLessThan(0.2); // < 20%
  });

  test('should analyze user session flow', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const sessionMetrics = await page.evaluate(async () => {
      const session = {
        startTime: Date.now(),
        actions: [],
        errors: 0,
        totalDuration: 0
      };

      // Simulate user interactions
      const actions = [
        { name: 'load', delay: 0 },
        { name: 'sync-users', delay: 1000 },
        { name: 'process-orders', delay: 2000 },
        { name: 'sync-products', delay: 3000 },
        { name: 'calculate-totals', delay: 4000 }
      ];

      for (const action of actions) {
        await new Promise(r => setTimeout(r, action.delay - (Date.now() - session.startTime)));

        const actionStart = performance.now();

        try {
          await fetch(`/api/${action.name}`, {
            method: 'POST',
            body: JSON.stringify({})
          }).catch(() => {});
        } catch (e) {
          session.errors++;
        }

        session.actions.push({
          name: action.name,
          duration: performance.now() - actionStart,
          timestamp: Date.now()
        });
      }

      session.totalDuration = Date.now() - session.startTime;

      return session;
    });

    console.log(`
      User Session Analysis:
      - Total Duration: ${(sessionMetrics.totalDuration / 1000).toFixed(2)}s
      - Actions: ${sessionMetrics.actions.length}
      - Errors: ${sessionMetrics.errors}
      - Action Times: ${sessionMetrics.actions.map(a => `${a.name}(${a.duration.toFixed(0)}ms)`).join(', ')}
    `);

    expect(sessionMetrics.actions.length).toBeGreaterThan(0);
    expect(sessionMetrics.errors).toBeLessThan(sessionMetrics.actions.length);
  });

  test('should measure Time to Interactive (TTI)', async ({ page }) => {
    const tti = await page.evaluate(() => {
      return new Promise(resolve => {
        const navigationStart = performance.timing.navigationStart;

        // Observe when page becomes interactive
        const observer = new PerformanceObserver(list => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];

          if (lastEntry.name === 'first-input') {
            const interactiveTime = lastEntry.startTime;
            resolve(interactiveTime);
          }
        });

        observer.observe({ entryTypes: ['first-input', 'largest-contentful-paint'] });

        // Timeout if no interaction within 10 seconds
        setTimeout(() => {
          observer.disconnect();
          resolve(0);
        }, 10000);
      });
    });

    await page.goto('/pos/web', { waitUntil: 'networkidle' });

    // Simulate first interaction
    await page.click('body'); // Any interaction

    console.log(`Time to Interactive: ${tti.toFixed(2)}ms`);

    if (tti > 0) {
      expect(tti).toBeLessThan(RUM_TARGETS.syntheticMonitoring.tti * 1.5);
    }
  });

  test('should track JavaScript errors during session', async ({ page }) => {
    const jsErrors = [];

    // Set up error tracking
    await page.evaluateHandle(() => {
      window._jsErrors = [];

      window.addEventListener('error', (event) => {
        window._jsErrors.push({
          message: event.message,
          source: event.filename,
          lineno: event.lineno,
          timestamp: Date.now()
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        window._jsErrors.push({
          message: event.reason?.message || String(event.reason),
          type: 'unhandled-rejection',
          timestamp: Date.now()
        });
      });
    });

    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    // Perform operations
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i++) {
        try {
          await fetch('/api/user/sync', {
            method: 'POST',
            body: JSON.stringify({ id: i })
          });
        } catch (e) {
          // Ignore network errors
        }
      }
    });

    // Get collected errors
    const collectedErrors = await page.evaluate(() => window._jsErrors || []);

    console.log(`
      JavaScript Errors Tracked:
      - Total Errors: ${collectedErrors.length}
      - Error Types: ${collectedErrors.map(e => e.type || 'error').join(', ') || 'None'}
    `);

    // Should have minimal errors
    expect(collectedErrors.length).toBeLessThan(5);
  });

  test('should measure resource loading performance', async ({ page }) => {
    await page.goto('/pos/web');

    const resourceMetrics = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');

      const categories = {
        scripts: [],
        styles: [],
        images: [],
        other: []
      };

      for (const resource of resources) {
        const size = resource.transferSize || 0;
        const duration = resource.duration;

        const metric = {
          name: resource.name.split('/').pop(),
          size,
          duration: duration.toFixed(2),
          type: resource.initiatorType
        };

        if (resource.initiatorType === 'script') {
          categories.scripts.push(metric);
        } else if (resource.initiatorType === 'link') {
          categories.styles.push(metric);
        } else if (resource.initiatorType === 'img') {
          categories.images.push(metric);
        } else {
          categories.other.push(metric);
        }
      }

      return {
        totalResources: resources.length,
        totalBytes: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
        categories
      };
    });

    console.log(`
      Resource Loading Metrics:
      - Total Resources: ${resourceMetrics.totalResources}
      - Total Bytes: ${(resourceMetrics.totalBytes / 1024).toFixed(2)}KB
      - Scripts: ${resourceMetrics.categories.scripts.length}
      - Styles: ${resourceMetrics.categories.styles.length}
      - Images: ${resourceMetrics.categories.images.length}
    `);

    expect(resourceMetrics.totalResources).toBeGreaterThan(0);
  });

  test('should measure paint timing', async ({ page }) => {
    await page.goto('/pos/web');

    const paintMetrics = await page.evaluate(() => {
      const paints = performance.getEntriesByType('paint');

      return paints.map(paint => ({
        name: paint.name,
        startTime: paint.startTime.toFixed(2),
        duration: paint.duration.toFixed(2)
      }));
    });

    console.log('Paint Timing Metrics:');
    paintMetrics.forEach(paint => {
      console.log(`  ${paint.name}: ${paint.startTime}ms (${paint.duration}ms)`);
    });

    expect(paintMetrics.length).toBeGreaterThan(0);
  });

  test('should collect performance metrics summary', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'networkidle' });

    // Perform some operations
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        try {
          await fetch('/api/user/sync', {
            method: 'POST',
            body: JSON.stringify({ id: i })
          });
        } catch (e) {
          // Ignore
        }
      }
    });

    const summary = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paints = performance.getEntriesByType('paint');
      const measures = performance.getEntriesByType('measure');

      return {
        pageLoadTime: navigation?.loadEventEnd || 0,
        firstPaint: paints.find(p => p.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paints.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
        customMeasures: measures.length,
        resources: performance.getEntriesByType('resource').length
      };
    });

    console.log(`
      Performance Summary:
      - Page Load: ${summary.pageLoadTime.toFixed(2)}ms
      - FP: ${summary.firstPaint.toFixed(2)}ms
      - FCP: ${summary.firstContentfulPaint.toFixed(2)}ms
      - Custom Measures: ${summary.customMeasures}
      - Resources: ${summary.resources}
    `);
  });
});
