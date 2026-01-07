/**
 * Dynamic Import Loader for PDC POS Offline - Phase 3
 *
 * Provides on-demand module loading with error handling, progress tracking,
 * and deduplication to avoid redundant imports.
 *
 * @module DynamicImportLoader
 * @since 19.0.1.0.10
 */

class DynamicImportLoader {
  /**
   * Initialize the Dynamic Import Loader
   */
  constructor() {
    /**
     * Map of loaded modules
     * @type {Map<string, Object>}
     */
    this.loadedModules = new Map();

    /**
     * Map of in-progress loading promises
     * @type {Map<string, Promise>}
     */
    this.loadingPromises = new Map();

    /**
     * Registry of loadable modules with their import functions
     * @type {Object<string, Function>}
     */
    this.moduleRegistry = {
      'reports': () => this._importModule('modules/reports.js'),
      'settings': () => this._importModule('modules/settings.js'),
      'advanced': () => this._importModule('modules/advanced.js'),
      'printing': () => this._importModule('modules/printing.js'),
      'customer_management': () => this._importModule('modules/customer_management.js'),
    };

    /**
     * Module loading statistics
     * @type {Object}
     */
    this.stats = {
      totalLoaded: 0,
      totalFailed: 0,
      totalTime: 0,
      byModule: {},
    };

    /**
     * Event listeners for loading progress
     * @type {Array<Function>}
     */
    this.listeners = [];

    this._initializeLogging();
  }

  /**
   * Initialize logging and debugging
   * @private
   */
  _initializeLogging() {
    if (typeof window !== 'undefined') {
      window.posOfflineModuleLoaderDebug = this.stats;
    }
  }

  /**
   * Import a module from relative path
   * @private
   * @param {string} modulePath - Path relative to static/src/js
   * @returns {Promise<Object>}
   */
  async _importModule(modulePath) {
    try {
      // Dynamic import with absolute path
      const fullPath = `/static/src/js/${modulePath}`;
      const response = await fetch(fullPath);

      if (!response.ok) {
        throw new Error(`Failed to fetch ${modulePath}: ${response.statusText}`);
      }

      const code = await response.text();
      const module = {};

      // Execute module code in controlled context
      const func = new Function('module', code);
      func(module);

      return module.exports || module;
    } catch (error) {
      console.error(`[DynamicImportLoader] Error importing ${modulePath}:`, error);
      throw error;
    }
  }

  /**
   * Load a module by name with progress tracking
   *
   * @param {string} moduleName - Name of module to load
   * @param {Function} onProgress - Optional callback for progress updates
   * @returns {Promise<Object>} Loaded module
   *
   * @example
   * const module = await loader.loadModule('reports', (progress) => {
   *   if (progress.status === 'complete') {
   *     console.log(`Loaded in ${progress.duration}ms`);
   *   }
   * });
   */
  async loadModule(moduleName, onProgress = null) {
    // Check if already loaded
    if (this.loadedModules.has(moduleName)) {
      if (onProgress) {
        onProgress({
          status: 'cached',
          module: moduleName,
          timestamp: Date.now(),
        });
      }
      return this.loadedModules.get(moduleName);
    }

    // Check if currently loading (avoid duplicate requests)
    if (this.loadingPromises.has(moduleName)) {
      if (onProgress) {
        onProgress({
          status: 'waiting',
          module: moduleName,
          timestamp: Date.now(),
        });
      }
      return this.loadingPromises.get(moduleName);
    }

    // Notify listeners of loading start
    if (onProgress) {
      onProgress({
        status: 'starting',
        module: moduleName,
        timestamp: Date.now(),
      });
    }

    const loadPromise = (async () => {
      try {
        const startTime = performance.now();

        // Get module import function
        const moduleImport = this.moduleRegistry[moduleName];
        if (!moduleImport) {
          throw new Error(
            `Module "${moduleName}" not registered. Available: ${Object.keys(this.moduleRegistry).join(', ')}`
          );
        }

        // Load module
        const module = await moduleImport();
        const duration = performance.now() - startTime;

        // Store loaded module
        this.loadedModules.set(moduleName, module);
        this.loadingPromises.delete(moduleName);

        // Update statistics
        this.stats.totalLoaded++;
        this.stats.totalTime += duration;
        this.stats.byModule[moduleName] = {
          duration,
          timestamp: Date.now(),
          size: this._estimateModuleSize(module),
        };

        // Notify callback
        if (onProgress) {
          onProgress({
            status: 'complete',
            module: moduleName,
            duration: duration,
            timestamp: Date.now(),
          });
        }

        // Log success
        console.log(
          `[DynamicImportLoader] Loaded "${moduleName}" in ${duration.toFixed(2)}ms`
        );

        // Notify event listeners
        this._notifyListeners({
          event: 'module-loaded',
          module: moduleName,
          duration,
        });

        return module;
      } catch (error) {
        this.loadingPromises.delete(moduleName);
        this.stats.totalFailed++;

        // Notify callback of error
        if (onProgress) {
          onProgress({
            status: 'error',
            module: moduleName,
            error: error.message,
            timestamp: Date.now(),
          });
        }

        // Log error
        console.error(
          `[DynamicImportLoader] Failed to load "${moduleName}":`,
          error
        );

        // Notify event listeners
        this._notifyListeners({
          event: 'module-error',
          module: moduleName,
          error: error.message,
        });

        throw error;
      }
    })();

    this.loadingPromises.set(moduleName, loadPromise);
    return loadPromise;
  }

  /**
   * Load multiple modules concurrently
   *
   * @param {string[]} moduleNames - Array of module names to load
   * @param {Function} onProgress - Optional progress callback
   * @returns {Promise<Object>} Map of loaded modules
   */
  async loadModules(moduleNames, onProgress = null) {
    const promises = moduleNames.map((name) =>
      this.loadModule(name, onProgress)
    );

    try {
      const results = await Promise.all(promises);
      const modules = {};

      moduleNames.forEach((name, index) => {
        modules[name] = results[index];
      });

      return modules;
    } catch (error) {
      console.error('[DynamicImportLoader] Error loading multiple modules:', error);
      throw error;
    }
  }

  /**
   * Check if a module is loaded
   *
   * @param {string} moduleName - Name of module
   * @returns {boolean} True if module is loaded
   */
  isLoaded(moduleName) {
    return this.loadedModules.has(moduleName);
  }

  /**
   * Get list of loaded modules
   *
   * @returns {string[]} Array of loaded module names
   */
  getLoadedModules() {
    return Array.from(this.loadedModules.keys());
  }

  /**
   * Get list of available modules
   *
   * @returns {string[]} Array of available module names
   */
  getAvailableModules() {
    return Object.keys(this.moduleRegistry);
  }

  /**
   * Prefetch a module without immediately using it
   *
   * @param {string} moduleName - Name of module to prefetch
   * @returns {Promise<void>}
   */
  async prefetch(moduleName) {
    if (this.isLoaded(moduleName)) {
      return; // Already loaded
    }

    try {
      await this.loadModule(moduleName);
    } catch (error) {
      // Prefetch failures are non-critical
      console.warn(`[DynamicImportLoader] Prefetch failed for ${moduleName}:`, error);
    }
  }

  /**
   * Prefetch multiple modules
   *
   * @param {string[]} moduleNames - Array of module names to prefetch
   * @returns {Promise<void>}
   */
  async prefetchModules(moduleNames) {
    const promises = moduleNames
      .filter((name) => !this.isLoaded(name))
      .map((name) => this.prefetch(name));

    try {
      await Promise.allSettled(promises);
    } catch (error) {
      console.warn('[DynamicImportLoader] Error prefetching modules:', error);
    }
  }

  /**
   * Unload a module to free memory
   *
   * @param {string} moduleName - Name of module to unload
   * @returns {boolean} True if module was unloaded
   */
  unload(moduleName) {
    if (this.loadedModules.has(moduleName)) {
      this.loadedModules.delete(moduleName);
      console.log(`[DynamicImportLoader] Unloaded module: ${moduleName}`);
      return true;
    }
    return false;
  }

  /**
   * Get loading statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      loadedCount: this.loadedModules.size,
      availableCount: Object.keys(this.moduleRegistry).length,
      averageLoadTime: this.stats.totalLoaded > 0
        ? (this.stats.totalTime / this.stats.totalLoaded).toFixed(2)
        : 0,
    };
  }

  /**
   * Register progress listener
   *
   * @param {Function} callback - Callback function for events
   * @returns {Function} Function to unregister listener
   */
  onProgress(callback) {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all registered listeners
   * @private
   * @param {Object} event - Event data
   */
  _notifyListeners(event) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[DynamicImportLoader] Error in listener:', error);
      }
    });
  }

  /**
   * Estimate module size for statistics
   * @private
   * @param {Object} module - Module object
   * @returns {number} Estimated size in bytes
   */
  _estimateModuleSize(module) {
    try {
      return JSON.stringify(module).length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Clear all loaded modules
   *
   * @returns {void}
   */
  clear() {
    this.loadedModules.clear();
    this.loadingPromises.clear();
    this.listeners = [];
    console.log('[DynamicImportLoader] Cleared all modules and listeners');
  }

  /**
   * Get debug information
   *
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      registry: Object.keys(this.moduleRegistry),
      loaded: this.getLoadedModules(),
      loading: Array.from(this.loadingPromises.keys()),
      stats: this.getStats(),
      listeners: this.listeners.length,
    };
  }
}

// Create global singleton instance
if (typeof window !== 'undefined') {
  window.posOfflineModuleLoader = new DynamicImportLoader();

  // Expose for debugging
  if (!window.posOfflineDebug) {
    window.posOfflineDebug = {};
  }
  window.posOfflineDebug.moduleLoader = window.posOfflineModuleLoader;

  console.log('[DynamicImportLoader] Initialized successfully');
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DynamicImportLoader;
}
