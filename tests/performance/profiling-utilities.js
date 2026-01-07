/**
 * Performance Profiling Utilities
 *
 * Tools for:
 * - Chrome DevTools integration
 * - Flame graph generation
 * - Heap snapshot analysis
 * - Memory leak detection
 * - CPU profiling
 * - Timeline analysis
 */

class PerformanceProfiler {
  constructor(page) {
    this.page = page;
    this.profiles = {};
    this.heapSnapshots = [];
    this.memoryTimeline = [];
  }

  /**
   * Start CPU profiling
   */
  async startCPUProfiling(label) {
    console.log(`Starting CPU profile: ${label}`);
    const startTime = performance.now();

    await this.page.evaluate(() => {
      if (window._cpuProfile) {
        window._cpuProfile = {
          startTime: performance.now(),
          marks: []
        };
      }
    });

    this.profiles[label] = {
      type: 'cpu',
      startTime,
      startMark: `${label}-start`
    };

    performance.mark(`${label}-start`);
  }

  /**
   * Stop CPU profiling and get results
   */
  async stopCPUProfiling(label) {
    performance.mark(`${label}-end`);
    performance.measure(`${label}`, `${label}-start`, `${label}-end`);

    const profile = performance.getEntriesByType('measure')
      .find(m => m.name === label);

    if (profile) {
      this.profiles[label].duration = profile.duration;
      this.profiles[label].endTime = performance.now();
      console.log(`CPU Profile '${label}': ${profile.duration.toFixed(2)}ms`);
    }

    return profile?.duration || 0;
  }

  /**
   * Take heap snapshot for memory analysis
   */
  async takeHeapSnapshot(label) {
    console.log(`Taking heap snapshot: ${label}`);

    const snapshot = await this.page.evaluate(() => {
      if (!performance.memory) {
        return null;
      }

      return {
        timestamp: Date.now(),
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        label: label
      };
    });

    if (snapshot) {
      this.heapSnapshots.push(snapshot);
      console.log(`Heap Snapshot - Used: ${(snapshot.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB, Total: ${(snapshot.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
    }

    return snapshot;
  }

  /**
   * Start memory monitoring (periodic samples)
   */
  async startMemoryMonitoring(intervalMs = 1000) {
    console.log('Starting memory monitoring...');

    await this.page.evaluate((intervalMs) => {
      if (!window._memoryMonitor) {
        window._memoryMonitor = {
          samples: [],
          startTime: Date.now(),
          interval: intervalMs
        };

        window._memoryInterval = setInterval(() => {
          if (performance.memory) {
            window._memoryMonitor.samples.push({
              timestamp: Date.now() - window._memoryMonitor.startTime,
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize,
              limit: performance.memory.jsHeapSizeLimit
            });
          }
        }, intervalMs);
      }
    }, intervalMs);
  }

  /**
   * Stop memory monitoring and get timeline
   */
  async stopMemoryMonitoring() {
    const timeline = await this.page.evaluate(() => {
      if (window._memoryInterval) {
        clearInterval(window._memoryInterval);
      }
      return window._memoryMonitor?.samples || [];
    });

    this.memoryTimeline = timeline;
    console.log(`Memory Monitoring: ${timeline.length} samples collected`);

    return timeline;
  }

  /**
   * Detect memory leaks by analyzing heap growth
   */
  async detectMemoryLeaks() {
    if (this.memoryTimeline.length < 2) {
      return { leaked: false, growth: 0 };
    }

    const first = this.memoryTimeline[0];
    const last = this.memoryTimeline[this.memoryTimeline.length - 1];

    const growth = last.used - first.used;
    const growthPercent = (growth / first.used) * 100;

    const isLeaking = growthPercent > 20; // >20% growth indicates leak

    console.log(`Memory Growth: ${growth / 1024 / 1024}.toFixed(2)}MB (${growthPercent.toFixed(2)}%)`);

    return {
      leaked: isLeaking,
      growth,
      growthPercent,
      initial: first.used / 1024 / 1024,
      final: last.used / 1024 / 1024
    };
  }

  /**
   * Profile function execution with flame graph data
   */
  async profileFunction(funcName, func, ...args) {
    console.log(`Profiling function: ${funcName}`);

    const startMark = `${funcName}-start`;
    const endMark = `${funcName}-end`;

    performance.mark(startMark);

    let result;
    try {
      if (func.constructor.name === 'AsyncFunction') {
        result = await func(...args);
      } else {
        result = func(...args);
      }
    } catch (error) {
      performance.mark(endMark);
      throw error;
    }

    performance.mark(endMark);
    performance.measure(funcName, startMark, endMark);

    const measure = performance.getEntriesByType('measure')
      .find(m => m.name === funcName);

    if (measure) {
      console.log(`Function '${funcName}' duration: ${measure.duration.toFixed(2)}ms`);
    }

    return result;
  }

  /**
   * Generate flame graph data structure
   */
  async generateFlameGraphData() {
    const measures = performance.getEntriesByType('measure');

    const data = measures.map(measure => ({
      name: measure.name,
      value: measure.duration,
      start: measure.startTime,
      duration: measure.duration,
      percentage: ((measure.duration / 10000) * 100).toFixed(2) // Assuming 10s total
    }));

    data.sort((a, b) => b.value - a.value);

    return {
      title: 'CPU Flame Graph',
      data: data,
      totalTime: Math.max(...data.map(d => d.start + d.duration))
    };
  }

  /**
   * Get network waterfall data
   */
  async getNetworkWaterfall() {
    const resources = await this.page.evaluate(() => {
      return performance.getEntriesByType('resource').map(resource => ({
        name: resource.name.split('/').pop(),
        type: resource.initiatorType,
        duration: resource.duration.toFixed(2),
        transferSize: resource.transferSize,
        decodedBodySize: resource.decodedBodySize,
        serverTiming: resource.serverTiming,
        startTime: resource.startTime.toFixed(2),
        fetchStart: (resource.fetchStart || 0).toFixed(2),
        domainLookup: ((resource.domainLookupEnd - resource.domainLookupStart) || 0).toFixed(2),
        tcp: ((resource.connectEnd - resource.connectStart) || 0).toFixed(2),
        ttfb: ((resource.responseStart - resource.requestStart) || 0).toFixed(2),
        download: ((resource.responseEnd - resource.responseStart) || 0).toFixed(2)
      }));
    });

    return {
      title: 'Network Waterfall',
      resources,
      totalResources: resources.length,
      totalSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0)
    };
  }

  /**
   * Analyze frame rate and rendering performance
   */
  async analyzeFrameRate(durationMs = 5000) {
    console.log(`Analyzing frame rate for ${durationMs}ms...`);

    const frameData = await this.page.evaluate((duration) => {
      return new Promise(resolve => {
        const frames = [];
        const startTime = performance.now();

        const measureFrame = () => {
          const currentTime = performance.now();

          if (currentTime - startTime < duration) {
            frames.push({
              time: currentTime - startTime,
              timestamp: currentTime
            });
            requestAnimationFrame(measureFrame);
          } else {
            // Calculate frame rate
            const frameTimes = [];
            for (let i = 1; i < frames.length; i++) {
              frameTimes.push(frames[i].time - frames[i - 1].time);
            }

            const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            const fps = 1000 / avgFrameTime;

            resolve({
              totalFrames: frames.length,
              averageFrameTime: avgFrameTime.toFixed(2),
              fps: fps.toFixed(2),
              minFrameTime: Math.min(...frameTimes).toFixed(2),
              maxFrameTime: Math.max(...frameTimes).toFixed(2),
              droppedFrames: frameTimes.filter(t => t > 16.67).length // >16ms = dropped at 60fps
            });
          }
        };

        requestAnimationFrame(measureFrame);
      });
    }, durationMs);

    console.log(`Frame Rate Analysis:
      Total Frames: ${frameData.totalFrames}
      Average FPS: ${frameData.fps}
      Min Frame Time: ${frameData.minFrameTime}ms
      Max Frame Time: ${frameData.maxFrameTime}ms
      Dropped Frames: ${frameData.droppedFrames}
    `);

    return frameData;
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport(filename = 'performance-report.json') {
    const navigationTiming = await this.page.evaluate(() => {
      const timing = performance.getEntriesByType('navigation')[0];
      return {
        dns: timing?.domainLookupEnd - timing?.domainLookupStart,
        tcp: timing?.connectEnd - timing?.connectStart,
        ttfb: timing?.responseStart - timing?.requestStart,
        download: timing?.responseEnd - timing?.responseStart,
        domInteractive: timing?.domInteractive,
        domComplete: timing?.domComplete,
        loadEvent: timing?.loadEventEnd
      };
    });

    const webVitals = await this.page.evaluate(() => {
      const vitals = {};

      const paints = performance.getEntriesByType('paint');
      for (const paint of paints) {
        vitals[paint.name] = paint.startTime.toFixed(2);
      }

      if (performance.memory) {
        vitals.memoryUsed = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
        vitals.memoryLimit = (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
      }

      return vitals;
    });

    const report = {
      timestamp: new Date().toISOString(),
      navigationTiming,
      webVitals,
      heapSnapshots: this.heapSnapshots,
      memoryTimeline: this.memoryTimeline,
      profiles: this.profiles,
      memoryLeakAnalysis: await this.detectMemoryLeaks(),
      flameGraph: await this.generateFlameGraphData(),
      networkWaterfall: await this.getNetworkWaterfall()
    };

    console.log(`Performance report generated: ${filename}`);
    return report;
  }

  /**
   * Compare heap snapshots to find growth
   */
  compareHeapSnapshots() {
    if (this.heapSnapshots.length < 2) {
      return null;
    }

    const before = this.heapSnapshots[0];
    const after = this.heapSnapshots[this.heapSnapshots.length - 1];

    const growth = after.usedJSHeapSize - before.usedJSHeapSize;
    const growthPercent = (growth / before.usedJSHeapSize) * 100;

    return {
      before: {
        label: before.label,
        usedMB: (before.usedJSHeapSize / 1024 / 1024).toFixed(2),
        totalMB: (before.totalJSHeapSize / 1024 / 1024).toFixed(2)
      },
      after: {
        label: after.label,
        usedMB: (after.usedJSHeapSize / 1024 / 1024).toFixed(2),
        totalMB: (after.totalJSHeapSize / 1024 / 1024).toFixed(2)
      },
      growth: {
        bytes: growth,
        MB: (growth / 1024 / 1024).toFixed(2),
        percent: growthPercent.toFixed(2)
      }
    };
  }
}

export { PerformanceProfiler };
