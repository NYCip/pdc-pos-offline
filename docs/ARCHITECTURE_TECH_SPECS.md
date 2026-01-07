# PDC POS Offline: Technical Specifications & API Contracts

**Document Version:** 1.0
**Date:** 2026-01-07
**Audience:** Backend & Frontend Engineers, System Architects

---

## Component API Specifications

### 1. Memory Cache (L1) - API Contract

**Module:** `cache_memory.js`

```typescript
interface ICacheEntry<T> {
    value: T;
    expiresAt: number;  // Timestamp
    hits: number;       // LRU tracking
}

interface IMemoryCacheStats {
    size: number;                      // Current entries
    maxSize: number;                   // Configured max
    hitRate: number;                   // % of hits vs misses
    evictions: number;                 // LRU evictions
    avgAccessTime: number;             // ms
}

class MemoryCache {
    constructor(maxSize: number = 50);

    // Read operations
    get<T>(key: string): T | null;
    getAll(): Map<string, ICacheEntry>;
    has(key: string): boolean;
    getStats(): IMemoryCacheStats;

    // Write operations
    set<T>(key: string, value: T, ttlMs?: number): void;
    update<T>(key: string, value: T): void;
    delete(key: string): void;
    clear(): void;

    // Maintenance
    cleanup(): number;  // Returns # of expired entries removed
    evictLRU(count?: number): string[];  // Returns evicted keys
}
```

**Behavior Specification:**

| Operation | Latency | Conditions | Notes |
|-----------|---------|-----------|-------|
| `get()` | <1ms | Key exists, not expired | Updates LRU order |
| `get()` | <1ms | Key missing | Returns null immediately |
| `set()` | <2ms | Space available | Auto-evicts if at capacity |
| `set()` | <5ms | At max capacity | Evicts oldest entry |
| Cleanup | O(n) | Run periodically | Max once per 5min |

**Storage Limits:**

```javascript
// Typical memory consumption
├─ Empty cache        : ~100 bytes
├─ 50 entries (avg)   : ~5-10 KB
├─ User data (typical): 512 bytes
├─ Session data       : 1 KB
└─ Total target       : <10 MB for 50 entries
```

---

### 2. LocalStorage Cache (L2) - API Contract

**Module:** `cache_local_storage.js`

```typescript
interface ILSCacheItem<T> {
    v: 1;                      // Version
    t: number;                 // Timestamp
    d: T;                      // Data
    ttl: number;               // milliseconds
}

class LocalStorageCache {
    constructor(namespace: string = 'pdc_offline');

    get<T>(key: string): T | null;
    set<T>(key: string, value: T, ttlMs?: number): void;
    delete(key: string): void;
    clear(): void;
    has(key: string): boolean;

    // Maintenance
    getSize(): number;  // bytes
    getExpirationStats(): { expired: number; total: number };
    cleanupExpired(): number;  // Returns # removed
    evictLRU(percentRemove?: number): void;  // Removes oldest X%
}
```

**Storage Limits:**

```javascript
// Typical localStorage constraints
├─ Browser quota     : 5-10 MB per origin
├─ PDC namespace     : Target 2-3 MB max
├─ Single entry max  : 512 KB (JSON-serialized)
├─ Typical entries   : 10-20 items
└─ Total size target : <3 MB
```

**TTL Defaults:**

```javascript
const STORAGE_TTL = {
    session: 24 * 60 * 60 * 1000,      // 24 hours
    config: 48 * 60 * 60 * 1000,       // 48 hours
    user: 7 * 24 * 60 * 60 * 1000,     // 7 days
    offline_session: 30 * 24 * 60 * 60 * 1000  // 30 days
};
```

---

### 3. IndexedDB Cache (L3) - API Contract

**Module:** `offline_db.js` (Enhanced)

```typescript
interface IDBRecord<T> {
    id?: string;
    data: T;
    size: number;              // bytes
    compressed: boolean;
    storedAt: number;
    expiresAt: number;
    checksum?: string;
}

// Store schemas
interface SessionStore {
    keyPath: 'id';
    indexes: [
        { name: 'user_id', unique: false },
        { name: 'storedAt', unique: false }
    ];
}

interface TransactionStore {
    keyPath: 'id';
    indexes: [
        { name: 'session_id', unique: false },
        { name: 'state', unique: false },
        { name: 'expiresAt', unique: false },
        { name: 'synced_at', unique: false }
    ];
}

class OfflineDB {
    // Schema
    static readonly SCHEMA = {
        version: 5,
        stores: [
            'sessions',
            'transactions',
            'users',
            'config',
            'sync_errors',
            'sync_queue'
        ]
    };

    // Connection
    async init(): Promise<void>;
    isInitialized(): boolean;
    close(): void;

    // CRUD - Generic
    async get<T>(storeName: string, id: string): Promise<T | null>;
    async set<T>(storeName: string, record: T, ttl?: number): Promise<string>;
    async update<T>(storeName: string, id: string, updates: Partial<T>): Promise<void>;
    async delete(storeName: string, id: string): Promise<void>;
    async clear(storeName: string): Promise<void>;

    // Transactions
    async transaction<T>(
        storeNames: string[],
        mode: 'readonly' | 'readwrite',
        handler: (stores: Map<string, IDBObjectStore>) => Promise<T>
    ): Promise<T>;

    // Queries
    async getAllFromStore<T>(storeName: string): Promise<T[]>;
    async queryByIndex<T>(
        storeName: string,
        indexName: string,
        value: any
    ): Promise<T[]>;

    // Maintenance
    async getSize(): Promise<number>;
    async deleteOlderThan(storeName: string, timestamp: number): Promise<number>;
    async cleanup(): Promise<{ cleaned: number; error?: string }>;
    async checkpoint(backupName?: string): Promise<void>;
}
```

**Store Specifications:**

```javascript
STORES = {
    sessions: {
        data: { id, name, user_id, config_id, state, offline_capable, session_cookie },
        ttl: 30 days,
        maxSize: 10 MB,
        purpose: 'Session persistence across browser restarts'
    },

    transactions: {
        data: { id, type, amount, timestamp, status, reference, _synced, _local },
        ttl: 30 days,
        maxSize: 20 MB,
        purpose: 'Offline transactions pending sync'
    },

    sync_queue: {
        data: { id, item_id, priority, attempts, addedAt, maxAttempts },
        ttl: Until synced,
        maxSize: 5 MB,
        purpose: 'Priority queue for sync ordering'
    },

    sync_errors: {
        data: { id, sync_id, error, timestamp, retryable },
        ttl: 7 days,
        maxSize: 2 MB,
        purpose: 'Sync error log for debugging'
    },

    users: {
        data: { id, login, pin_hash, employee_ids, partner_id },
        ttl: 30 days,
        maxSize: 1 MB,
        purpose: 'Cached user data for PIN validation'
    },

    config: {
        data: { id, name, currency_id, company_id, enable_offline },
        ttl: 30 days,
        maxSize: 500 KB,
        purpose: 'POS config data for offline operations'
    }
};
```

---

### 4. Delta Sync Manager - API Contract

**Module:** `sync_delta.js`

```typescript
interface IDeltaItem {
    id: string;
    storeName: string;
    oldHash: string;
    newHash: string;
    data: any;
    changed: boolean;
}

interface IDeltaResult {
    totalItems: number;
    changedItems: number;
    reduction: number;  // % of data saved
    items: IDeltaItem[];
}

class DeltaSyncManager {
    constructor(idbCache: OfflineDB);

    /**
     * Compute delta between current state and last sync
     * Returns only items that have changed
     */
    async computeDelta(storeName: string): Promise<IDeltaResult>;

    /**
     * Calculate hash of an item for comparison
     * Uses SHA-256 truncated to 16 bytes
     */
    computeHash(item: any): string;

    /**
     * Record current state as "synced version"
     * Called after successful sync
     */
    async markSyncPoint(storeName: string): Promise<void>;

    /**
     * Get full state (for first sync)
     */
    async getFullState(storeName: string): Promise<any[]>;

    /**
     * Reset delta tracking (on sync failure recovery)
     */
    async resetDeltaState(storeName?: string): Promise<void>;
}
```

**Algorithm Specification:**

```
Delta Computation Algorithm:
1. Read all items from storeName
2. For each item:
   a. Compute hash = SHA-256(JSON.stringify(item))[:16]
   b. Lookup oldHash in _syncHashes map
   c. If oldHash !== hash → changed = true
   d. Add to delta array
3. Update _syncHashes with newHash for next sync
4. Return delta with statistics

Time Complexity: O(n) where n = items in store
Space Complexity: O(n) for hash map
Typical time: 10-50ms for 1000 items
```

**Compression Gains:**

```javascript
// Typical delta reduction
├─ First sync (full)      : 100% of data = 50 KB
├─ Second sync (delta)    : 15% of data = 7.5 KB   (85% savings)
├─ Third sync (delta)     : 8% of data = 4 KB      (92% savings)
├─ Cached + delta pattern : 87% reduction average
└─ ROI: Pays for itself in 2-3 syncs
```

---

### 5. Adaptive Backoff Manager - API Contract

**Module:** `sync_backoff.js`

```typescript
interface IBackoffMetrics {
    lastLatency: number;        // ms
    connectionQuality: 'good' | 'fair' | 'poor';
    attempts: number;
    nextDelay: number;          // ms
}

class AdaptiveBackoff {
    constructor();

    /**
     * Calculate next retry delay based on:
     * - Number of failed attempts (exponential)
     * - Network quality (multiplier)
     * - Random jitter (±20%)
     */
    getNextDelay(): number;

    /**
     * Measure actual network latency
     * Updates connectionQuality internally
     */
    async measureLatency(): Promise<number>;

    /**
     * Record a successful sync
     * Resets attempt counter
     */
    recordSuccess(): void;

    /**
     * Record a failed sync
     * Increments attempt counter
     */
    recordFailure(): void;

    /**
     * Get current backoff state (for debugging)
     */
    getMetrics(): IBackoffMetrics;

    /**
     * Reset backoff state
     */
    reset(): void;
}
```

**Backoff Formula:**

```javascript
// Adaptive exponential backoff with network awareness

baseDelay = 100 ms
maxDelay = 30000 ms (30 seconds cap)
exp = min(attempts, 5)  // Cap exponent at 5 for 3.2s max base

exponentialDelay = baseDelay * 2^exp

// Network quality multiplier
quality === 'good'  → multiplier = 0.5x   (faster retry)
quality === 'fair'  → multiplier = 1.0x   (normal)
quality === 'poor'  → multiplier = 2.0x   (slower retry)

// Add jitter to prevent thundering herd
jitter = random(-20%, +20%)

finalDelay = exponentialDelay * multiplier * (1 + jitter)
finalDelay = min(finalDelay, maxDelay)

// Examples:
Attempt 1, good:   100 * 0.5 = 50ms
Attempt 2, good:   200 * 0.5 = 100ms
Attempt 3, fair:   400 * 1.0 = 400ms
Attempt 4, poor:   800 * 2.0 = 1600ms
Attempt 5, poor:   1600 * 2.0 = 3200ms
Attempt 6, poor:   3200 * 2.0 = 6400ms (capped at 30s)
```

---

### 6. Prioritized Sync Queue - API Contract

**Module:** `sync_queue_priority.js`

```typescript
enum SyncPriority {
    CRITICAL = 10,    // Payment reversals, security
    HIGH = 5,         // Transactions, orders
    NORMAL = 1,       // Cart, metadata
    LOW = 0           // Analytics, logs
}

interface ISyncQueueItem {
    id: string;
    data: any;
    priority: SyncPriority;
    addedAt: number;
    attempts: number;
    maxAttempts: number;
    lastError?: string;
}

interface IQueueStats {
    total: number;
    by_priority: Map<SyncPriority, number>;
    oldest_item_age_ms: number;
    newest_item_age_ms: number;
}

class PrioritizedSyncQueue {
    constructor(idbCache: OfflineDB);

    /**
     * Add item to queue with priority
     * Inserts in sorted position (priority order)
     */
    async enqueue(
        item: any,
        priority: SyncPriority = SyncPriority.NORMAL
    ): Promise<string>;  // Returns queue item ID

    /**
     * Get next batch respecting priorities:
     * - Up to 30% critical items
     * - Remaining slots from normal priority
     */
    getNextBatch(batchSize: number = 50): ISyncQueueItem[];

    /**
     * Mark item as successfully synced
     * Removes from queue
     */
    async markSynced(queueItemId: string): Promise<void>;

    /**
     * Mark item as failed
     * Increments attempts counter
     */
    async markFailed(queueItemId: string, error: string): Promise<void>;

    /**
     * Get queue statistics
     */
    getStats(): IQueueStats;

    /**
     * Clear queue (use with caution!)
     */
    async clear(): Promise<number>;  // Returns count cleared
}
```

**Queue Batching Algorithm:**

```
Input: Queue with items at priorities [1, 5, 10, 1, 5, 10]
Batch size: 10

Batch creation:
1. Calculate critical quota = floor(10 * 0.3) = 3
2. Extract up to 3 CRITICAL items: [10, 10, 5] → takes 3 slots
3. Fill remaining 7 slots from NORMAL: [5, 1, 1, 5, ...] → takes 6 items
4. Output batch: [10, 10, 5, 5, 1, 1, 5, ...]

Result: Critical items processed first, but NORMAL items get equal share
Prevents starvation while prioritizing critical operations
```

---

### 7. Data Compression - API Contract

**Module:** `compression_binary.js`

```typescript
interface ICompressionStats {
    originalSize: number;
    compressedSize: number;
    ratio: number;              // % saved
    compressionTime: number;    // ms
    decompressionTime: number;  // ms
}

class BinarySerializer {
    /**
     * Serialize transaction to compact binary format
     * Typical reduction: 200 bytes JSON → 25 bytes binary
     */
    serializeTransaction(tx: Transaction): Uint8Array;

    /**
     * Deserialize binary transaction back to object
     */
    deserializeTransaction(buffer: Uint8Array): Transaction;

    /**
     * Get compression statistics for analysis
     */
    getStats(): ICompressionStats;

    /**
     * Validate checksum on deserialized data
     */
    validateChecksum(buffer: Uint8Array, expectedChecksum: string): boolean;
}

class NetworkCompression {
    /**
     * Compress JSON payload using gzip
     * Typical reduction: 50KB JSON → 15KB gzip
     */
    async compressPayload(data: any): Promise<{
        compressed: boolean;
        format: string;
        data: string;  // base64 encoded
        originalSize: number;
        compressedSize: number;
        ratio: string;  // "87%"
    }>;

    /**
     * Decompress gzipped payload
     */
    async decompressPayload(compressed: string): Promise<any>;
}
```

**Compression Benchmarks:**

```javascript
Test Case: Sync 100 transactions

Transaction (single):
├─ JSON format           : 186 bytes
├─ Binary format         : 25 bytes      (87% reduction)
└─ Gzip(JSON)           : 45 bytes      (76% reduction)

Batch (100 transactions):
├─ JSON payload          : 18.6 KB
├─ Binary payload        : 2.5 KB       (87% reduction)
├─ Gzip(JSON)           : 4.5 KB       (76% reduction)
├─ Gzip(Binary)         : 1.2 KB       (93% reduction)
└─ Combined strategy    : ~1-2 KB      (90% reduction)

Network bandwidth saved:
├─ Traditional (JSON)    : 1 GB/month (100 stores * 1000 syncs)
├─ With compression      : 100 MB/month (90% reduction)
└─ Monthly savings       : 900 MB / 100 stores = 9 MB per store
```

---

### 8. Monitoring & RUM - API Contract

**Module:** `monitoring_rum.js`

```typescript
interface IMetric {
    name: string;
    value: number;
    unit: string;
    timestamp: number;
}

interface IMetricsReport {
    min: number;
    max: number;
    avg: number;
    median: number;
    p95: number;
    p99: number;
    count: number;
}

class RealUserMonitoring {
    constructor();

    /**
     * Record a custom metric
     */
    recordMetric(name: string, value: number): void;

    /**
     * Get aggregated metrics report
     */
    getMetricsReport(): Map<string, IMetricsReport>;

    /**
     * Send metrics to server for analysis
     */
    async sendMetricsToServer(): Promise<void>;

    /**
     * Track Core Web Vitals automatically
     */
    enableCoreWebVitals(): void;

    /**
     * Listen for custom offline events
     */
    onOfflineEvent(
        event: 'login_start' | 'sync_start' | 'mode_switch',
        handler: (data: any) => void
    ): void;
}

// Metric collection events
interface OfflineEventPayload {
    type: 'login_start' | 'login_complete' | 'sync_start' | 'sync_complete';
    timestamp: number;
    duration?: number;
    itemCount?: number;
    payloadSize?: number;
    error?: string;
}
```

**Metrics Collected:**

```javascript
CORE_WEB_VITALS = {
    LCP: 'Largest Contentful Paint (ms)',        // Target: <2500ms
    INP: 'Interaction to Next Paint (ms)',       // Target: <200ms
    CLS: 'Cumulative Layout Shift (score)',      // Target: <0.1
};

OFFLINE_METRICS = {
    offline_login_duration: 'Time to PIN login (ms)',
    sync_duration: 'Time to complete sync (ms)',
    sync_items: 'Count of items synced',
    sync_payload_bytes: 'Size of sync payload',
    cache_hit_rate: '% of cache hits vs misses',
    memory_used_mb: 'JS heap memory (MB)',
    db_size_mb: 'IndexedDB total size (MB)',
    mode_switches: 'Online/offline transitions',
};

ANALYTICS = {
    session_duration: 'Total session time (ms)',
    error_count: 'Total errors in session',
    offline_time_ratio: '% of session offline',
    retry_count: 'Sync retry attempts',
};
```

**Data Transmission:**

```javascript
// Batch metrics every 60 seconds or on important events
POST /pdc_pos_offline/metrics

Request body:
{
    sessionId: "abc123def456",
    timestamp: 1704067200000,
    metrics: {
        lcp: { min: 1200, max: 3400, avg: 2100, ... },
        offline_login_duration: { min: 150, max: 800, avg: 350, ... },
        sync_duration: { min: 200, max: 5000, avg: 1200, ... },
        ...
    }
}

Response:
{
    accepted: true,
    batchId: "batch_xyz",
    nextSend: 60000  // ms until next batch
}
```

---

## Data Flow Specifications

### Complete Offline Sync Flow

```
┌─────────────────────────────────────────────────────────┐
│ User creates transaction (e.g., payment)               │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │ OfflineFirstHandler.       │
    │ optimisticWrite()          │
    │ - Write to IDB immediately │
    │ - Queue for sync           │
    │ - Return local ID          │
    └────────────┬───────────────┘
                 │
                 ▼ (1-2ms)
    ┌────────────────────────────┐
    │ User sees local change      │ ◄─ Optimistic UI update
    │ (before server confirmation)│
    └────────────┬───────────────┘
                 │
                 ▼ (debounce 100ms)
    ┌────────────────────────────────┐
    │ ConnectionMonitor.isOnline?   │
    └────────────┬───────────────────┘
                 │
         ┌───────┴────────┐
    Online?          Offline?
         │               │
         ▼               ▼
    ┌─────────┐  ┌──────────────┐
    │ Sync    │  │ Queue item   │
    │ immediately│ (retry later) │
    └────┬────┘  └──────────────┘
         │
         ▼
    ┌──────────────────────────────┐
    │ PrioritizedSyncQueue.        │
    │ getNextBatch()               │
    │ - Respect priority levels    │
    │ - Max 50 items per batch     │
    └────────┬─────────────────────┘
             │
             ▼
    ┌──────────────────────────────┐
    │ DeltaSyncManager.            │
    │ computeDelta()               │
    │ - Compare hashes of changed  │
    │   items only                 │
    │ - 70-90% size reduction      │
    └────────┬─────────────────────┘
             │
             ▼
    ┌──────────────────────────────┐
    │ NetworkCompression.          │
    │ compressPayload()            │
    │ - Gzip JSON                  │
    │ - 70% reduction              │
    └────────┬─────────────────────┘
             │
             ▼
    ┌──────────────────────────────┐
    │ Network Request              │
    │ POST /pdc_pos_offline/sync   │
    │ Payload: 1-2 KB              │
    │ (vs 50KB without compression)│
    └────────┬─────────────────────┘
             │
             ▼
    ┌──────────────────────────────┐
    │ Server (async task)          │
    │ - Validate batch             │
    │ - Process in transaction     │
    │ - Update server DB           │
    │ - Return success/error       │
    └────────┬─────────────────────┘
             │
         ┌───┴────────┐
    Success?      Failed?
         │            │
         ▼            ▼
    ┌─────────┐  ┌────────────────────┐
    │ Mark    │  │ AdaptiveBackoff    │
    │ synced  │  │ getNextDelay()     │
    └────┬────┘  │ - Exponential      │
         │       │ - Network-aware    │
         │       │ - +Jitter          │
         ▼       └────────┬───────────┘
    ┌──────────┐          │
    │ Cleanup: │          ▼
    │ - Update │    ┌──────────────┐
    │   server │    │ Wait &       │
    │   ID     │    │ Retry again  │
    │ - Archive│    └──────────────┘
    │   synced │
    └──────────┘
```

---

## State Machine Definitions

### Connection State Machine

```
States:
- ONLINE: Connected to server
- OFFLINE: Cannot reach server
- SLOW: High latency (>1000ms)
- METERED: Limited data connection
- OFFLINE_SYNC: Offline but syncing

Transitions:
ONLINE → OFFLINE:
  Trigger: Connection timeout (30s check fails)
  Action: Show offline banner, enable offline mode

OFFLINE → ONLINE:
  Trigger: Connection restored (HEAD /web/login succeeds)
  Action: Hide offline banner, start auto-sync

ONLINE/OFFLINE → SLOW:
  Trigger: Latency > 1000ms
  Action: Reduce polling frequency

OFFLINE + syncing → OFFLINE_SYNC:
  Trigger: Background sync started
  Action: Update UI with "syncing" status
```

### Sync Queue State Machine

```
Item states:
- QUEUED: Waiting for sync
- SYNCING: Currently being synced
- SYNCED: Successfully synced
- FAILED: Sync failed
- RETRY_PENDING: Waiting for retry

Transitions:
QUEUED → SYNCING:
  Trigger: getNextBatch() includes item
  Action: Mark in progress, set timeout

SYNCING → SYNCED:
  Trigger: Server confirms success
  Action: Remove from queue, archive to history

SYNCING → FAILED:
  Trigger: Server error or timeout
  Action: Increment attempts, reset backoff

FAILED → RETRY_PENDING:
  Trigger: Adaptive backoff delay elapsed
  Action: Move back to QUEUED (retry)

RETRY_PENDING → SYNCING:
  Trigger: getNextBatch() includes item again
  Action: Attempt sync again
```

---

## Performance Contracts

### Response Time SLAs

```javascript
PERFORMANCE_SLA = {
    // Cache layer
    L1_memory_get: {
        p95: 1,      // 1ms
        p99: 2,      // 2ms
        max: 5       // 5ms hard limit
    },

    L2_localstorage_get: {
        p95: 5,      // 5ms
        p99: 10,     // 10ms
        max: 25      // 25ms hard limit
    },

    L3_indexeddb_get: {
        p95: 50,     // 50ms
        p99: 100,    // 100ms
        max: 500     // 500ms hard limit
    },

    // Offline operations
    offline_login: {
        p95: 300,    // 300ms
        p99: 500,    // 500ms
        max: 1000    // 1 second hard limit
    },

    sync_100_items: {
        p95: 1500,   // 1.5 seconds
        p99: 2000,   // 2 seconds
        max: 5000    // 5 seconds hard limit
    },

    delta_computation: {
        p95: 50,     // 50ms for 1000 items
        p99: 100,    // 100ms for 1000 items
        max: 300     // 300ms hard limit
    }
};

// SLA violations trigger alerts
// Repeated violations (>10%) trigger investigation
```

### Data Accuracy Guarantees

```javascript
CONSISTENCY_GUARANTEES = {
    // Cache consistency
    cache_coherency: 'Write-through (always sync to all tiers)',
    max_stale_data_age: 300000,  // 5 minutes acceptable
    invalidation_latency: 100,   // ms to invalidate across tiers

    // Sync reliability
    data_loss_probability: 0,    // Zero tolerance
    duplicate_detection: 'Local ID deduplication',
    conflict_resolution: 'Last write wins (timestamp-based)',

    // Offline accuracy
    offline_data_completeness: '>99%',
    sync_attempt_limit: 5,       // Max retries before escalation
    error_reporting: 'All errors logged and timestamped'
};
```

---

## Backward Compatibility

### Version Migration Strategy

```javascript
// When schema changes

// v1 → v2: Add compression flag
// Migration:
db.version = 5  // Trigger onupgradeneeded
onupgradeneeded: (event) => {
    const db = event.target.result;

    // Add compression column to existing stores
    // Legacy items: compressed = false
    // New items: compressed = true

    // Decompression happens transparently on read
    const record = await db.get(storeName, id);
    if (record.compressed) {
        record.data = decompress(record.data);
    }
}

// v2 → v3: Change store schema
// Migration:
onupgradeneeded: (event) => {
    const db = event.target.result;

    // Create new store with new schema
    // Copy data from old store, transforming as needed
    // Delete old store
}
```

---

## Security Specifications

### Cryptographic Standards

```javascript
PIN_HASHING = {
    algorithm: 'SHA-256',
    salt: user_id,  // Per-user salt
    rounds: 1,      // SHA-256 is already slow
    encoding: 'hex'
};

// Example:
pinHash = SHA256(pin + userId).toString('hex')
// PIN: "1234", UserID: "5"
// Hash: "abc123def456..."

DATA_ENCRYPTION = {
    // IndexedDB NOT encrypted (acceptable for scope)
    // Reasoning: Data already synced to server
    //           Offline DB is local machine security
    scope: 'Client machine protection only'
};

TRANSPORT_SECURITY = {
    protocol: 'HTTPS/TLS 1.3',
    certificate_pinning: 'Optional (for high security)',
    payload_validation: 'Checksum on all payloads'
};
```

---

## Testing Specifications

### Unit Test Coverage Requirements

```javascript
UNIT_TEST_REQUIREMENTS = {
    cache_memory: {
        coverage: '>90%',
        tests: [
            'get/set/delete operations',
            'TTL expiration',
            'LRU eviction',
            'Concurrent access',
            'Memory limits'
        ]
    },

    sync_delta: {
        coverage: '>85%',
        tests: [
            'Hash computation',
            'Delta detection',
            'First vs subsequent sync',
            'Collision handling',
            'Reset behavior'
        ]
    },

    compression: {
        coverage: '>95%',
        tests: [
            'Serialize/deserialize round-trip',
            'Checksum validation',
            'Edge cases (null, empty, large)',
            'Performance benchmarks',
            'Compression ratio validation'
        ]
    }
};
```

---

## Deployment Specifications

### Configuration

```javascript
RUNTIME_CONFIG = {
    // Cache settings
    memory_cache_max_entries: 50,
    localStorage_max_bytes: 3145728,  // 3 MB
    indexeddb_max_bytes: 52428800,    // 50 MB

    // Sync settings
    sync_batch_size: 50,
    sync_max_payload_bytes: 100000,   // 100 KB
    sync_retry_max_attempts: 5,
    sync_backoff_base_ms: 100,
    sync_backoff_max_ms: 30000,

    // Connection settings
    connection_check_interval_ms: 30000,  // 30 seconds
    connection_timeout_ms: 5000,          // 5 seconds

    // Monitoring
    metrics_batch_interval_ms: 60000,     // 60 seconds
    metrics_send_to_server: true,
    rum_enabled: true,

    // Maintenance
    cleanup_old_sessions_hours: 24,
    cleanup_old_transactions_days: 30,
    cleanup_old_errors_days: 7,
    emergency_cleanup_threshold: 0.9  // 90% usage
};

// Deployment: Pass as environment variables
// Override in Odoo settings for multi-tenant
```

---

This technical specification serves as the contract for implementation. All deviations must be documented and approved by the architecture review board.

**Document prepared by:** Technical Specifications Team
**Last updated:** 2026-01-07
