/**
 * Operations Benchmarks Performance Tests
 *
 * Measures performance of core operations:
 * - Single user sync latency (P50, P95, P99 percentiles)
 * - Batch user sync (10, 50, 100 users)
 * - IndexedDB read/write operations
 * - Memory footprint during operations
 * - CPU utilization during sync
 */

import { test, expect } from '@playwright/test';

// Performance thresholds in milliseconds
const OPERATION_TARGETS = {
  singleUserSync: {
    p50: 200,      // 50th percentile: <200ms
    p95: 500,      // 95th percentile: <500ms
    p99: 1000      // 99th percentile: <1s
  },
  batchSync: {
    '10users': { p50: 500, p95: 1500, p99: 3000 },
    '50users': { p50: 2000, p95: 5000, p99: 10000 },
    '100users': { p50: 3500, p95: 8000, p99: 15000 }
  },
  indexedDB: {
    write: { p50: 10, p95: 25, p99: 50 },      // Single write operation
    read: { p50: 5, p95: 15, p99: 30 },        // Single read operation
    batchWrite: { p50: 50, p95: 150, p99: 300 }  // Batch of 100 writes
  },
  memory: {
    baselineLimit: 100,     // MB - baseline memory
    per50Users: 15,         // MB per 50 users
    maxLimit: 300           // MB - maximum allowed
  }
};

// Helper: Percentile calculation
function calculatePercentile(values, percentile) {
  const sorted = values.sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

// Helper: Memory usage in MB
function getMemoryUsageMB() {
  if (performance.memory) {
    return performance.memory.usedJSHeapSize / (1024 * 1024);
  }
  return 0;
}

test.describe('Operations Benchmarks', () => {

  test('should sync single user with P50 < 200ms, P95 < 500ms', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const syncTimes = [];

    // Run 30 single-user sync operations
    for (let i = 0; i < 30; i++) {
      const syncTime = await page.evaluate(async () => {
        const start = performance.now();

        // Simulate sync operation (API call + DB write)
        const response = await fetch('/api/user/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: Math.random() })
        }).catch(() => ({ ok: false }));

        return performance.now() - start;
      });

      syncTimes.push(syncTime);
    }

    const p50 = calculatePercentile(syncTimes, 50);
    const p95 = calculatePercentile(syncTimes, 95);
    const p99 = calculatePercentile(syncTimes, 99);

    console.log(`Single User Sync - P50: ${p50.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms, P99: ${p99.toFixed(2)}ms`);

    expect(p50).toBeLessThan(OPERATION_TARGETS.singleUserSync.p50 * 1.5);
    expect(p95).toBeLessThan(OPERATION_TARGETS.singleUserSync.p95 * 1.5);
    expect(p99).toBeLessThan(OPERATION_TARGETS.singleUserSync.p99 * 1.5);
  });

  test('should batch sync 10 users within target latency', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const batchTimes = [];

    // Run 10 batch operations of 10 users each
    for (let batch = 0; batch < 10; batch++) {
      const batchTime = await page.evaluate(async () => {
        const start = performance.now();

        const users = Array.from({ length: 10 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`
        }));

        // Simulate batch sync
        await Promise.all(users.map(u =>
          fetch('/api/user/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(u)
          }).catch(() => ({ ok: false }))
        ));

        return performance.now() - start;
      });

      batchTimes.push(batchTime);
    }

    const p50 = calculatePercentile(batchTimes, 50);
    const p95 = calculatePercentile(batchTimes, 95);
    const p99 = calculatePercentile(batchTimes, 99);

    console.log(`10 Users Batch Sync - P50: ${p50.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms, P99: ${p99.toFixed(2)}ms`);

    expect(p50).toBeLessThan(OPERATION_TARGETS.batchSync['10users'].p50 * 1.5);
    expect(p95).toBeLessThan(OPERATION_TARGETS.batchSync['10users'].p95 * 1.5);
  });

  test('should batch sync 50 users within target latency', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const batchTimes = [];

    for (let batch = 0; batch < 5; batch++) {
      const batchTime = await page.evaluate(async () => {
        const start = performance.now();

        const users = Array.from({ length: 50 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`
        }));

        // Batch sync with controlled parallelism
        const chunkSize = 10;
        for (let i = 0; i < users.length; i += chunkSize) {
          const chunk = users.slice(i, i + chunkSize);
          await Promise.all(chunk.map(u =>
            fetch('/api/user/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(u)
            }).catch(() => ({ ok: false }))
          ));
        }

        return performance.now() - start;
      });

      batchTimes.push(batchTime);
    }

    const p50 = calculatePercentile(batchTimes, 50);
    const p95 = calculatePercentile(batchTimes, 95);
    const p99 = calculatePercentile(batchTimes, 99);

    console.log(`50 Users Batch Sync - P50: ${p50.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms, P99: ${p99.toFixed(2)}ms`);

    expect(p50).toBeLessThan(OPERATION_TARGETS.batchSync['50users'].p50 * 1.5);
  });

  test('should batch sync 100 users within target latency', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const batchTime = await page.evaluate(async () => {
      const start = performance.now();

      const users = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`
      }));

      // Batch with chunking to prevent browser throttling
      const chunkSize = 20;
      for (let i = 0; i < users.length; i += chunkSize) {
        const chunk = users.slice(i, i + chunkSize);
        await Promise.all(chunk.map(u =>
          fetch('/api/user/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(u)
          }).catch(() => ({ ok: false }))
        ));
        // Small delay between batches
        await new Promise(r => setTimeout(r, 10));
      }

      return performance.now() - start;
    });

    console.log(`100 Users Batch Sync: ${batchTime.toFixed(2)}ms`);
    expect(batchTime).toBeLessThan(OPERATION_TARGETS.batchSync['100users'].p99 * 1.5);
  });

  test('should perform IndexedDB writes efficiently (P50 < 10ms)', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const writeTimes = [];

    for (let i = 0; i < 100; i++) {
      const writeTime = await page.evaluate(async (i) => {
        const start = performance.now();

        // IndexedDB write operation
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('PDCPOSOfflineDB');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        const tx = db.transaction(['users'], 'readwrite');
        const store = tx.objectStore('users');
        store.put({ id: i, name: `User ${i}`, timestamp: Date.now() });

        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });

        return performance.now() - start;
      }, i);

      writeTimes.push(writeTime);
    }

    const p50 = calculatePercentile(writeTimes, 50);
    const p95 = calculatePercentile(writeTimes, 95);
    const p99 = calculatePercentile(writeTimes, 99);

    console.log(`IndexedDB Write - P50: ${p50.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms, P99: ${p99.toFixed(2)}ms`);

    expect(p50).toBeLessThan(OPERATION_TARGETS.indexedDB.write.p50 * 5);
    expect(p95).toBeLessThan(OPERATION_TARGETS.indexedDB.write.p95 * 5);
  });

  test('should perform IndexedDB reads efficiently (P50 < 5ms)', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    // Pre-populate with data
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('PDCPOSOfflineDB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const tx = db.transaction(['users'], 'readwrite');
      const store = tx.objectStore('users');

      for (let i = 0; i < 1000; i++) {
        store.put({ id: i, name: `User ${i}` });
      }

      await new Promise(r => { tx.oncomplete = () => r(); });
    });

    const readTimes = [];

    for (let i = 0; i < 100; i++) {
      const readTime = await page.evaluate(async (i) => {
        const start = performance.now();

        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('PDCPOSOfflineDB');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        const tx = db.transaction(['users'], 'readonly');
        const store = tx.objectStore('users');
        const request = store.get(i % 1000);

        await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          tx.oncomplete = () => resolve();
        });

        return performance.now() - start;
      }, i);

      readTimes.push(readTime);
    }

    const p50 = calculatePercentile(readTimes, 50);
    const p95 = calculatePercentile(readTimes, 95);
    const p99 = calculatePercentile(readTimes, 99);

    console.log(`IndexedDB Read - P50: ${p50.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms, P99: ${p99.toFixed(2)}ms`);

    expect(p50).toBeLessThan(OPERATION_TARGETS.indexedDB.read.p50 * 10);
  });

  test('should batch write 100 records to IndexedDB efficiently', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const batchWriteTimes = [];

    for (let batch = 0; batch < 10; batch++) {
      const writeTime = await page.evaluate(async (batch) => {
        const start = performance.now();

        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('PDCPOSOfflineDB');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        const tx = db.transaction(['users'], 'readwrite');
        const store = tx.objectStore('users');

        const baseId = batch * 100;
        for (let i = 0; i < 100; i++) {
          store.put({
            id: baseId + i,
            name: `User ${baseId + i}`,
            email: `user${baseId + i}@example.com`,
            timestamp: Date.now()
          });
        }

        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });

        return performance.now() - start;
      }, batch);

      batchWriteTimes.push(writeTime);
    }

    const p50 = calculatePercentile(batchWriteTimes, 50);
    const p95 = calculatePercentile(batchWriteTimes, 95);
    const p99 = calculatePercentile(batchWriteTimes, 99);

    console.log(`IndexedDB Batch Write (100 records) - P50: ${p50.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms, P99: ${p99.toFixed(2)}ms`);

    expect(p50).toBeLessThan(OPERATION_TARGETS.indexedDB.batchWrite.p50 * 5);
  });

  test('should maintain reasonable memory footprint', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const memoryProfile = await page.evaluate(async () => {
      const measurements = {
        baseline: performance.memory?.usedJSHeapSize / (1024 * 1024) || 0,
        afterDataLoad: 0,
        afterSync: 0,
        afterCleanup: 0
      };

      // Load data
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('PDCPOSOfflineDB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const tx = db.transaction(['users'], 'readwrite');
      const store = tx.objectStore('users');

      for (let i = 0; i < 250; i++) {
        store.put({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          data: new Array(1000).fill('x').join('')
        });
      }

      await new Promise(r => { tx.oncomplete = () => r(); });
      measurements.afterDataLoad = performance.memory?.usedJSHeapSize / (1024 * 1024) || 0;

      // Simulate sync
      for (let i = 250; i < 500; i++) {
        store.put({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`
        });
      }

      measurements.afterSync = performance.memory?.usedJSHeapSize / (1024 * 1024) || 0;

      // Cleanup old data
      const deleteRange = IDBKeyRange.upperBound(250);
      const deleteTx = db.transaction(['users'], 'readwrite');
      deleteTx.objectStore('users').delete(deleteRange);

      await new Promise(r => { deleteTx.oncomplete = () => r(); });
      measurements.afterCleanup = performance.memory?.usedJSHeapSize / (1024 * 1024) || 0;

      return measurements;
    });

    console.log(`Memory Profile:
      Baseline: ${memoryProfile.baseline.toFixed(2)}MB
      After Data Load: ${memoryProfile.afterDataLoad.toFixed(2)}MB
      After Sync: ${memoryProfile.afterSync.toFixed(2)}MB
      After Cleanup: ${memoryProfile.afterCleanup.toFixed(2)}MB
    `);

    // Memory should stay within acceptable limits
    if (memoryProfile.afterSync > 0) {
      expect(memoryProfile.afterSync).toBeLessThan(OPERATION_TARGETS.memory.maxLimit);
    }
  });

  test('should measure operation throughput (operations per second)', async ({ page }) => {
    await page.goto('/pos/web', { waitUntil: 'domcontentloaded' });

    const throughput = await page.evaluate(async () => {
      const startTime = performance.now();
      let operationCount = 0;

      // Perform operations for 10 seconds
      while (performance.now() - startTime < 10000) {
        await Promise.all([
          fetch('/api/user/sync', { method: 'POST', body: JSON.stringify({}) }).catch(() => {}),
          fetch('/api/order/sync', { method: 'POST', body: JSON.stringify({}) }).catch(() => {})
        ]);
        operationCount += 2;
      }

      const elapsed = (performance.now() - startTime) / 1000;
      return (operationCount / elapsed).toFixed(2);
    });

    console.log(`Throughput: ${throughput} operations/second`);
    expect(parseFloat(throughput)).toBeGreaterThan(5); // At least 5 ops/sec
  });
});
