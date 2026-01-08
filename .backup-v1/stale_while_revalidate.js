/** @odoo-module */

/**
 * Stale-While-Revalidate Strategy Implementation
 *
 * Implements the "stale-while-revalidate" cache strategy:
 * 1. If cached response exists, return it immediately
 * 2. Fetch fresh version from network in background
 * 3. Update cache with fresh version when available
 * 4. If no cache exists, fetch normally and cache result
 *
 * This strategy provides:
 * - Instant response times (from cache)
 * - Fresh data in background (transparent to user)
 * - Fallback to network-first for uncached requests
 * - Automatic cache updates
 *
 * @see https://web.dev/stale-while-revalidate/
 */

class StaleWhileRevalidateStrategy {
    /**
     * Initialize the SWR strategy
     *
     * @param {string} cacheName - The cache storage name to use
     * @param {Object} options - Configuration options
     * @param {number} options.backgroundFetchTimeout - Timeout for background fetches (ms)
     * @param {boolean} options.cacheErrors - Whether to cache error responses
     * @param {string[]} options.excludePatterns - URL patterns to exclude from caching
     */
    constructor(cacheName = 'pos-offline-cache-v1', options = {}) {
        this.cacheName = cacheName;
        this.backgroundFetchTimeout = options.backgroundFetchTimeout || 5000;
        this.cacheErrors = options.cacheErrors !== false; // Default true
        this.excludePatterns = options.excludePatterns || [];
        this.pendingUpdates = new Map();

        console.log('[SWR] Initialized:', {
            cache: cacheName,
            timeout: this.backgroundFetchTimeout,
            cacheErrors: this.cacheErrors,
        });
    }

    /**
     * Handle a fetch request using SWR strategy
     *
     * @param {Request} request - The fetch request to handle
     * @returns {Promise<Response>} - The response (cached or network)
     */
    async handleFetch(request) {
        const url = request.url;

        // Skip if URL matches exclude patterns
        if (this.shouldExclude(url)) {
            console.debug('[SWR] Skipping excluded URL:', url);
            return fetch(request);
        }

        try {
            // Step 1: Check if response is in cache
            const cachedResponse = await caches.match(request);

            if (cachedResponse) {
                console.debug('[SWR] Serving from cache:', url);

                // Step 2: Fetch fresh version in background (fire & forget)
                // This doesn't block the response to the user
                this.revalidateInBackground(request);

                // Return cached response immediately
                return cachedResponse;
            }

            // Step 3: Not in cache - fetch from network
            console.debug('[SWR] Fetching from network:', url);
            return await this.fetchAndCache(request);

        } catch (error) {
            console.error('[SWR] Unexpected error handling fetch:', error);

            // Last resort: try to return something from cache, or offline message
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }

            return new Response(
                'Offline - No cached data available',
                {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/plain' }
                }
            );
        }
    }

    /**
     * Fetch from network and update cache
     *
     * @private
     * @param {Request} request - The request to fetch
     * @returns {Promise<Response>} - The network response
     */
    async fetchAndCache(request) {
        try {
            const response = await fetch(request);

            // Only cache successful responses
            if (response && response.status === 200) {
                try {
                    const cache = await caches.open(this.cacheName);
                    await cache.put(request, response.clone());
                    console.debug('[SWR] Cached successful response:', request.url);
                } catch (cacheError) {
                    console.warn('[SWR] Failed to cache response:', cacheError.message);
                }
            } else if (response && response.status >= 400 && !this.cacheErrors) {
                console.debug('[SWR] Not caching error response:', response.status, request.url);
            }

            return response;

        } catch (error) {
            console.warn('[SWR] Network fetch failed:', error.message);

            // Try to return from cache as fallback
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                console.debug('[SWR] Returning cached fallback:', request.url);
                return cachedResponse;
            }

            // No cache available - return offline error
            throw new Error(`Network error and no cached response for ${request.url}`);
        }
    }

    /**
     * Revalidate cache in background
     *
     * This fetches a fresh version of the cached resource and updates
     * the cache if successful. Errors are swallowed to not interrupt
     * the user's experience.
     *
     * @private
     * @param {Request} request - The request to revalidate
     */
    async revalidateInBackground(request) {
        const url = request.url;

        // Skip if already pending an update for this URL
        if (this.pendingUpdates.has(url)) {
            console.debug('[SWR] Update already pending for:', url);
            return;
        }

        // Mark as pending
        this.pendingUpdates.set(url, true);

        try {
            // Set a timeout so we don't wait forever
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Background fetch timeout')), this.backgroundFetchTimeout)
            );

            const fetchPromise = fetch(request).then(async (response) => {
                if (!response || response.status !== 200) {
                    console.debug('[SWR] Background fetch got non-200 response:', response?.status, url);
                    return;
                }

                // Update cache with fresh response
                const cache = await caches.open(this.cacheName);
                await cache.put(request, response.clone());

                console.log('[SWR] Background update complete:', url);
            });

            // Wait for either fetch or timeout
            await Promise.race([fetchPromise, timeoutPromise]);

        } catch (error) {
            // This is expected when offline - don't log as error
            if (error.message === 'Background fetch timeout') {
                console.debug('[SWR] Background fetch timed out:', url);
            } else {
                console.debug('[SWR] Background fetch failed (expected offline):', url, error.message);
            }
        } finally {
            // Remove from pending
            this.pendingUpdates.delete(url);
        }
    }

    /**
     * Check if URL should be excluded from caching
     *
     * @private
     * @param {string} url - The URL to check
     * @returns {boolean} - True if should be excluded
     */
    shouldExclude(url) {
        return this.excludePatterns.some(pattern => {
            if (typeof pattern === 'string') {
                return url.includes(pattern);
            } else if (pattern instanceof RegExp) {
                return pattern.test(url);
            }
            return false;
        });
    }

    /**
     * Manually cache specific assets
     *
     * Useful for pre-caching assets that will be needed offline
     *
     * @param {string[]} urls - URLs to cache
     * @returns {Promise<void>}
     */
    async precache(urls) {
        if (!Array.isArray(urls) || urls.length === 0) {
            return;
        }

        try {
            const cache = await caches.open(this.cacheName);
            const results = await Promise.allSettled(
                urls.map(url => cache.add(url))
            );

            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            console.log(`[SWR] Precached ${succeeded}/${urls.length} assets`);

        } catch (error) {
            console.error('[SWR] Precache failed:', error.message);
        }
    }

    /**
     * Clear all cached data
     *
     * @returns {Promise<boolean>} - True if cache was deleted
     */
    async clearCache() {
        try {
            const deleted = await caches.delete(this.cacheName);
            if (deleted) {
                console.log('[SWR] Cache cleared:', this.cacheName);
            }
            return deleted;
        } catch (error) {
            console.error('[SWR] Failed to clear cache:', error);
            return false;
        }
    }

    /**
     * Get current cache contents
     *
     * @returns {Promise<Array<string>>} - Array of cached URLs
     */
    async getCacheContents() {
        try {
            const cache = await caches.open(this.cacheName);
            const requests = await cache.keys();
            return requests.map(r => r.url);
        } catch (error) {
            console.error('[SWR] Failed to get cache contents:', error);
            return [];
        }
    }

    /**
     * Get cache statistics
     *
     * @returns {Promise<Object>} - Cache statistics
     */
    async getCacheStats() {
        try {
            const contents = await this.getCacheContents();
            return {
                cacheName: this.cacheName,
                assetCount: contents.length,
                assets: contents,
                pendingUpdates: Array.from(this.pendingUpdates.keys()),
            };
        } catch (error) {
            console.error('[SWR] Failed to get cache stats:', error);
            return null;
        }
    }
}

// ============================================================================
// SERVICE WORKER INTEGRATION
// ============================================================================

/**
 * When running in Service Worker context, create global instance
 * for use in fetch event handlers
 */
if (typeof self !== 'undefined' && self.addEventListener) {
    // We're in a Service Worker context
    console.log('[SWR] Running in Service Worker context');
}

// Export for use in both SW and module contexts
if (typeof module !== 'undefined') {
    module.exports = StaleWhileRevalidateStrategy;
}

// Make available as global in SW context
if (typeof self !== 'undefined' && !self.StaleWhileRevalidateStrategy) {
    self.StaleWhileRevalidateStrategy = StaleWhileRevalidateStrategy;
}

console.log('[SWR] Module loaded successfully');
