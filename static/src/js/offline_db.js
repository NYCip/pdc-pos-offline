/** @odoo-module */
/**
 * PDC POS Offline - IndexedDB Wrapper v2.0
 *
 * Simplified IndexedDB wrapper for caching POS data.
 * Focuses on caching hr.employee (for offline login) and essential POS data.
 *
 * Schema:
 * - employees: hr.employee records with _pin (SHA-1 hash)
 * - pos_data: Other POS models (products, categories, etc.)
 * - cache_metadata: TTL timestamps for cache validation
 */

const DB_NAME = 'pdc_pos_offline_db';
const DB_VERSION = 2;

// Cache TTL in milliseconds
const CACHE_TTL = {
    'hr.employee': 24 * 60 * 60 * 1000,      // 24 hours
    'res.users': 24 * 60 * 60 * 1000,         // 24 hours
    'product.product': 12 * 60 * 60 * 1000,   // 12 hours
    'pos.category': 24 * 60 * 60 * 1000,      // 24 hours
    'pos.payment.method': 24 * 60 * 60 * 1000,
    'account.tax': 24 * 60 * 60 * 1000,
    'pos.config': 24 * 60 * 60 * 1000,
    'default': 24 * 60 * 60 * 1000,
};

let dbInstance = null;
let dbPromise = null;

/**
 * Open or get existing database connection
 */
function openDatabase() {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[PDC-Offline DB] Failed to open database:', request.error);
            dbPromise = null;
            reject(request.error);
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            console.log('[PDC-Offline DB] Database opened successfully');
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            console.log('[PDC-Offline DB] Upgrading database to version', DB_VERSION);

            // Create employees store (hr.employee records)
            if (!db.objectStoreNames.contains('employees')) {
                const employeesStore = db.createObjectStore('employees', { keyPath: 'id' });
                employeesStore.createIndex('user_id', 'user_id', { unique: false });
                employeesStore.createIndex('barcode', '_barcode', { unique: false });
            }

            // Create pos_data store (other models)
            if (!db.objectStoreNames.contains('pos_data')) {
                db.createObjectStore('pos_data', { keyPath: 'model_key' });
            }

            // Create cache_metadata store (TTL tracking)
            if (!db.objectStoreNames.contains('cache_metadata')) {
                db.createObjectStore('cache_metadata', { keyPath: 'key' });
            }
        };

        request.onblocked = () => {
            console.warn('[PDC-Offline DB] Database blocked, close other tabs');
        };
    });

    return dbPromise;
}

/**
 * Get database instance (ensures connection is open)
 */
async function getDB() {
    if (dbInstance) {
        return dbInstance;
    }
    return await openDatabase();
}

/**
 * Save employee data (hr.employee records)
 * Preserves _pin and _barcode SHA-1 hashes from server
 */
export async function saveEmployees(employees) {
    if (!employees || !employees.length) {
        return;
    }

    try {
        const db = await getDB();
        const tx = db.transaction(['employees', 'cache_metadata'], 'readwrite');

        const employeeStore = tx.objectStore('employees');
        const metaStore = tx.objectStore('cache_metadata');

        // Clear existing employees
        await promisifyRequest(employeeStore.clear());

        // Store each employee
        for (const emp of employees) {
            await promisifyRequest(employeeStore.put({
                ...emp,
                _cached_at: Date.now(),
            }));
        }

        // Update metadata
        await promisifyRequest(metaStore.put({
            key: 'hr.employee',
            cached_at: Date.now(),
            count: employees.length,
        }));

        console.log(`[PDC-Offline DB] Cached ${employees.length} employees`);
    } catch (error) {
        console.error('[PDC-Offline DB] Failed to save employees:', error);
        throw error;
    }
}

/**
 * Get cached employee data
 * Returns null if cache is expired or empty
 */
export async function getEmployees() {
    try {
        const db = await getDB();

        // Check if cache is valid
        const metaTx = db.transaction('cache_metadata', 'readonly');
        const metaStore = metaTx.objectStore('cache_metadata');
        const metadata = await promisifyRequest(metaStore.get('hr.employee'));

        if (!isCacheValid(metadata, 'hr.employee')) {
            console.log('[PDC-Offline DB] Employee cache expired or missing');
            return null;
        }

        // Get employees
        const tx = db.transaction('employees', 'readonly');
        const store = tx.objectStore('employees');
        const employees = await promisifyRequest(store.getAll());

        if (!employees || employees.length === 0) {
            return null;
        }

        console.log(`[PDC-Offline DB] Retrieved ${employees.length} cached employees`);
        return employees;
    } catch (error) {
        console.error('[PDC-Offline DB] Failed to get employees:', error);
        return null;
    }
}

/**
 * Save model data (products, categories, etc.)
 */
export async function saveModelData(modelName, records) {
    if (!records || !records.length) {
        return;
    }

    try {
        const db = await getDB();
        const tx = db.transaction(['pos_data', 'cache_metadata'], 'readwrite');

        const dataStore = tx.objectStore('pos_data');
        const metaStore = tx.objectStore('cache_metadata');

        // Store model data
        await promisifyRequest(dataStore.put({
            model_key: modelName,
            records: records,
            _cached_at: Date.now(),
        }));

        // Update metadata
        await promisifyRequest(metaStore.put({
            key: modelName,
            cached_at: Date.now(),
            count: records.length,
        }));

        console.log(`[PDC-Offline DB] Cached ${records.length} ${modelName} records`);
    } catch (error) {
        console.error(`[PDC-Offline DB] Failed to save ${modelName}:`, error);
        throw error;
    }
}

/**
 * Get cached model data
 * Returns null if cache is expired or empty
 */
export async function getModelData(modelName) {
    try {
        const db = await getDB();

        // Check if cache is valid
        const metaTx = db.transaction('cache_metadata', 'readonly');
        const metaStore = metaTx.objectStore('cache_metadata');
        const metadata = await promisifyRequest(metaStore.get(modelName));

        if (!isCacheValid(metadata, modelName)) {
            console.log(`[PDC-Offline DB] ${modelName} cache expired or missing`);
            return null;
        }

        // Get model data
        const tx = db.transaction('pos_data', 'readonly');
        const store = tx.objectStore('pos_data');
        const data = await promisifyRequest(store.get(modelName));

        if (!data || !data.records || data.records.length === 0) {
            return null;
        }

        console.log(`[PDC-Offline DB] Retrieved ${data.records.length} cached ${modelName} records`);
        return data.records;
    } catch (error) {
        console.error(`[PDC-Offline DB] Failed to get ${modelName}:`, error);
        return null;
    }
}

/**
 * Check if cache is valid (not expired)
 */
function isCacheValid(metadata, modelName) {
    if (!metadata || !metadata.cached_at) {
        return false;
    }

    const ttl = CACHE_TTL[modelName] || CACHE_TTL['default'];
    const age = Date.now() - metadata.cached_at;

    return age < ttl;
}

/**
 * Get cache metadata for a model
 */
export async function getCacheMetadata(modelName) {
    try {
        const db = await getDB();
        const tx = db.transaction('cache_metadata', 'readonly');
        const store = tx.objectStore('cache_metadata');
        return await promisifyRequest(store.get(modelName));
    } catch (error) {
        console.error(`[PDC-Offline DB] Failed to get metadata for ${modelName}:`, error);
        return null;
    }
}

/**
 * Clear all cached data
 */
export async function clearAllData() {
    try {
        const db = await getDB();
        const tx = db.transaction(['employees', 'pos_data', 'cache_metadata'], 'readwrite');

        await promisifyRequest(tx.objectStore('employees').clear());
        await promisifyRequest(tx.objectStore('pos_data').clear());
        await promisifyRequest(tx.objectStore('cache_metadata').clear());

        console.log('[PDC-Offline DB] All cached data cleared');
    } catch (error) {
        console.error('[PDC-Offline DB] Failed to clear data:', error);
        throw error;
    }
}

/**
 * Get storage statistics
 */
export async function getStorageStats() {
    try {
        const db = await getDB();

        const employeesTx = db.transaction('employees', 'readonly');
        const employeeCount = await promisifyRequest(
            employeesTx.objectStore('employees').count()
        );

        const metaTx = db.transaction('cache_metadata', 'readonly');
        const metaStore = metaTx.objectStore('cache_metadata');
        const allMeta = await promisifyRequest(metaStore.getAll());

        const models = {};
        for (const meta of allMeta) {
            models[meta.key] = {
                count: meta.count,
                cached_at: new Date(meta.cached_at).toISOString(),
                age_hours: Math.round((Date.now() - meta.cached_at) / (1000 * 60 * 60)),
            };
        }

        // Estimate storage usage
        let storageEstimate = null;
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            storageEstimate = {
                usage_mb: Math.round(estimate.usage / (1024 * 1024) * 100) / 100,
                quota_mb: Math.round(estimate.quota / (1024 * 1024) * 100) / 100,
                percent_used: Math.round(estimate.usage / estimate.quota * 100),
            };
        }

        return {
            employees: employeeCount,
            models: models,
            storage: storageEstimate,
        };
    } catch (error) {
        console.error('[PDC-Offline DB] Failed to get stats:', error);
        return null;
    }
}

/**
 * Convert IDBRequest to Promise
 */
function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Export for global access
export const offlineDB = {
    saveEmployees,
    getEmployees,
    saveModelData,
    getModelData,
    getCacheMetadata,
    clearAllData,
    getStorageStats,
};

console.log('[PDC-Offline DB] IndexedDB wrapper loaded');
