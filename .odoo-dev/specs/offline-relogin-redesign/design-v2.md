# Offline Re-Login Module Redesign - Design v2

## Document Information
- **Spec ID**: offline-relogin-redesign
- **Created**: 2026-01-08
- **Status**: DRAFT - Based on Deep Source Analysis
- **Source**: Deep research of Odoo 19 native source code

---

## 1. Key Findings from Source Analysis

### 1.1 Native Authentication Architecture

**Critical Discovery**: POS "login" is NOT server authentication - it's cashier selection from pre-loaded employees.

```
load_data RPC (startup) → hr.employee loaded → LoginScreen selects cashier → ProductScreen
                         ↓
                    _pin (SHA-1 hash)
                    _barcode (SHA-1 hash)
                    _role (manager/cashier/minimal)
```

### 1.2 The ONLY Gap

Native Odoo 19 cannot handle: **POS reload when server is offline**

- `load_data` RPC fails
- `hr.employee` is empty
- `_getConnectedCashier()` returns false
- No way to authenticate

---

## 2. Corrected Architecture

### 2.1 Principle: EXTEND Data Loading, Not Authentication

```
┌──────────────────────────────────────────────────────────────────┐
│                     NATIVE ODOO 19 (USE AS-IS)                   │
├──────────────────────────────────────────────────────────────────┤
│  select_cashier_mixin.js    │  login_screen.js   │  pos_store.js │
│  - Sha1.hash(pin)           │  - selectCashier   │  - setCashier │
│  - employee._pin match      │  - cashierLogIn    │  - session    │
│  - Works if employees exist │                     │    Storage    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ ONLY PATCH: Data Loading
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│              PDC-POS-OFFLINE v3 (MINIMAL PATCH)                  │
├──────────────────────────────────────────────────────────────────┤
│  pos_data_offline_patch.js                                       │
│  - Patches PosData.loadInitialData()                             │
│  - Caches hr.employee during online operation                    │
│  - Restores hr.employee from IndexedDB when offline              │
│  - Uses SAME SHA-1 hash as native (no custom auth)               │
├──────────────────────────────────────────────────────────────────┤
│  offline_db.js (SIMPLIFIED)                                      │
│  - employees store (replaces users store)                        │
│  - pos_data store (products, categories, etc.)                   │
│  - sessions store (minimal - just for state tracking)            │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow - Online

```
POS Startup (online)
    │
    ▼
PosData.loadInitialData()
    │
    ├─→ load_data RPC → hr.employee data
    │                        │
    │                        ▼
    │              PDC: offlineDB.cacheEmployees()
    │                        │
    │                        ▼
    │              IndexedDB: employees store
    │
    ▼
this.models['hr.employee'] populated
    │
    ▼
LoginScreen → selectCashier → Native SHA-1 PIN validation → ProductScreen
```

### 2.3 Data Flow - Offline Reload

```
POS Startup (offline - server unreachable)
    │
    ▼
PosData.loadInitialData()
    │
    ├─→ load_data RPC → FAILS (network error)
    │
    ▼
PDC Patch: network.offline === true?
    │
    ├─→ YES: offlineDB.getCachedEmployees()
    │            │
    │            ▼
    │        this.models['hr.employee'] = cached data
    │
    ▼
LoginScreen → selectCashier → Native SHA-1 PIN validation → ProductScreen
    │
    │  (Same native flow - employees now exist from cache)
```

---

## 3. Component Design

### 3.1 PosData Patch (`pos_data_offline_patch.js`)

```javascript
/** @odoo-module */
import { PosData } from "@point_of_sale/app/services/data_service";
import { patch } from "@web/core/utils/patch";
import { offlineDB } from "./offline_db";

patch(PosData.prototype, {
    async loadInitialData() {
        try {
            // Try normal online load
            const data = await super.loadInitialData();

            // SUCCESS: Cache critical data for offline use
            await this._cacheDataForOffline(data);

            return data;
        } catch (error) {
            // Check if network error while offline
            if (this.network.offline || !navigator.onLine) {
                console.log('[PDC-Offline] Network error, loading from cache');
                return await this._loadFromOfflineCache();
            }
            throw error;  // Non-network error, propagate
        }
    },

    async _cacheDataForOffline(data) {
        try {
            // Cache hr.employee with _pin, _barcode, _role
            if (data['hr.employee']) {
                await offlineDB.saveEmployees(data['hr.employee']);
            }

            // Cache other essential data
            const modelsToCache = [
                'res.users', 'pos.category', 'product.product',
                'pos.payment.method', 'account.tax', 'pos.config'
            ];
            for (const model of modelsToCache) {
                if (data[model]) {
                    await offlineDB.saveModelData(model, data[model]);
                }
            }
        } catch (error) {
            console.warn('[PDC-Offline] Cache warning:', error);
        }
    },

    async _loadFromOfflineCache() {
        console.log('[PDC-Offline] Loading POS data from offline cache');

        const cachedData = {};

        // Load hr.employee (critical for authentication)
        cachedData['hr.employee'] = await offlineDB.getEmployees() || [];

        // Load other cached models
        const modelsToLoad = [
            'res.users', 'pos.category', 'product.product',
            'pos.payment.method', 'account.tax', 'pos.config'
        ];
        for (const model of modelsToLoad) {
            cachedData[model] = await offlineDB.getModelData(model) || [];
        }

        // Validate minimum data available
        if (!cachedData['hr.employee']?.length && !cachedData['res.users']?.length) {
            throw new Error('No cached user data available. Please login online first.');
        }

        return cachedData;
    }
});
```

### 3.2 Offline DB Updates (`offline_db.js`)

**Key Changes**:
1. Add `employees` store for `hr.employee` data
2. Store `_pin` and `_barcode` as-is (already SHA-1 hashed by server)
3. Remove custom auth hash logic

```javascript
// IndexedDB stores (simplified)
const stores = {
    employees: { keyPath: 'id' },      // hr.employee with _pin, _barcode
    pos_data: { keyPath: 'model_id' }, // Other POS data by model name
    sessions: { keyPath: 'id' }        // Session state (minimal)
};

// Save employees (preserve native hash format)
async function saveEmployees(employees) {
    // employees already have _pin and _barcode as SHA-1 hashes from server
    const tx = db.transaction('employees', 'readwrite');
    for (const emp of employees) {
        await tx.objectStore('employees').put(emp);
    }
    await tx.done;
}

// Get employees (return as-is for native flow)
async function getEmployees() {
    const tx = db.transaction('employees', 'readonly');
    return await tx.objectStore('employees').getAll();
}
```

### 3.3 Remove Custom Authentication

**Files to Remove/Simplify**:
- `offline_auth.js` - Remove SHA-256 hashing, simplify to just cache management
- `offline_login_popup.js` - REMOVE (use native login)
- `pos_offline_patch.js` - REMOVE `showOfflineLogin`, `enterOfflineMode` (not needed)

**Files to Keep**:
- `offline_db.js` - Simplified for employee/data caching
- `session_persistence.js` - Simplified for state persistence
- `connection_monitor.js` - Keep for network detection

---

## 4. Migration Plan

### Phase 1: Remove Custom Auth (Breaking Change)
1. Remove `showOfflineLogin()`, `enterOfflineMode()` from pos_offline_patch.js
2. Remove `OfflineLoginPopup` component
3. Remove SHA-256 hash functions from `offline_auth.js`

### Phase 2: Implement Correct Caching
1. Create `pos_data_offline_patch.js`
2. Update `offline_db.js` with `employees` store
3. Cache `hr.employee` data including `_pin`, `_barcode`

### Phase 3: Simplify Data Restoration
1. Restore cached employees to `this.models['hr.employee']`
2. Native login flow handles authentication
3. Remove custom session restoration

### Phase 4: Testing
1. Test online → offline transition
2. Test POS reload while offline
3. Test PIN validation uses native SHA-1
4. Verify native navbar indicator works

---

## 5. Success Criteria

| Metric | Target |
|--------|--------|
| Custom auth code | 0 lines (use native) |
| Hash algorithm match | SHA-1 (native) |
| Offline re-login success | >95% |
| Code reduction | >80% |
| Native integration | 100% |

---

## 6. Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking change for existing offline sessions | High | Clear cache on upgrade |
| PIN format mismatch | Medium | Validate SHA-1 format in tests |
| IndexedDB quota issues | Low | Implement cache cleanup |

---

**Next Step**: Create updated tasks.md based on this design v2
