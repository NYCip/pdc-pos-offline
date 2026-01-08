# PDC POS Offline Module v2.0 - Architecture Document

**Version**: 2.0.0
**Date**: 2026-01-08
**Status**: DESIGN COMPLETE - Ready for Implementation
**Source**: 4-Round HiveMind Deliberation

---

## Executive Summary

The pdc_pos_offline module v2.0 is a **complete rewrite** that solves the REAL offline problems:

1. **"Page Not Found"** when browser refreshes offline → **Service Worker**
2. **Cannot re-login** when server unreachable → **IndexedDB data caching**

This version:
- Uses **native Odoo 19** offline architecture (network.offline, unsyncData[], navbar icon)
- Patches **ONLY** `PosData.loadInitialData()` - minimal integration
- Uses **native SHA-1** PIN validation - no custom authentication
- Removes **ALL blocking UI** - uses native fa-chain-broken indicator

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER                                      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    SERVICE WORKER (sw.js)                      │  │
│  │  - Intercepts all /pos/* and /web/assets/* requests           │  │
│  │  - Cache-First for assets, Network-First for API              │  │
│  │  - Serves cached app when offline                             │  │
│  │  - Serves offline_error.html if no cache                      │  │
│  └─────────────────────────┬────────────────────────────────────┘  │
│                            │                                        │
│  ┌─────────────────────────▼────────────────────────────────────┐  │
│  │                    NATIVE ODOO 19 POS                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐      │  │
│  │  │ LoginScreen │  │  PosStore   │  │ select_cashier   │      │  │
│  │  │ (native)    │  │  (native)   │  │ _mixin (native)  │      │  │
│  │  └─────────────┘  └─────────────┘  └──────────────────┘      │  │
│  │                            │                                  │  │
│  │  ┌─────────────────────────▼──────────────────────────────┐  │  │
│  │  │           PosData (PATCHED - only integration point)    │  │  │
│  │  │  loadInitialData() → cache on success / load from cache │  │  │
│  │  └─────────────────────────┬──────────────────────────────┘  │  │
│  └────────────────────────────│──────────────────────────────────┘  │
│                               │                                      │
│  ┌────────────────────────────▼──────────────────────────────────┐  │
│  │                      INDEXEDDB                                 │  │
│  │  employees: hr.employee with _pin, _barcode (SHA-1)           │  │
│  │  pos_data: products, categories, taxes, payment methods       │  │
│  │  cache_metadata: timestamps for TTL validation                │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ ONLINE: RPC calls
                               │ OFFLINE: Cached responses
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         ODOO SERVER                                  │
│  load_data RPC → hr.employee, products, etc. (with _pin SHA-1)     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## The Three Offline Failure Modes

| Mode | Scenario | Native Support | Our Solution |
|------|----------|---------------|--------------|
| A | Mid-session offline | ✅ Native handles | None needed |
| B | Browser refresh offline | ❌ "Page not found" | Service Worker |
| C | Re-login with no data | ❌ Empty employee list | IndexedDB cache |

---

## Module Structure

```
pdc_pos_offline/
├── __init__.py
├── __manifest__.py
│
├── controllers/
│   ├── __init__.py
│   └── service_worker_controller.py    # Serves SW with correct headers
│
├── static/
│   └── src/
│       ├── service_worker/
│       │   ├── sw.js                   # Service Worker (NOT bundled)
│       │   └── offline_error.html      # First-time offline error page
│       │
│       └── js/
│           ├── pos_offline_boot.js     # Registers SW, version check
│           ├── pos_data_patch.js       # Patches PosData.loadInitialData()
│           └── offline_db.js           # IndexedDB wrapper
│
└── views/
    └── assets.xml                      # Asset bundle registration
```

---

## Key Components

### 1. Service Worker (sw.js)

**Purpose**: Cache POS web application for offline loading

**Caching Strategy**:
- `/pos/ui` - Cache First (main entry point)
- `/web/assets/*` - Stale While Revalidate (JS/CSS bundles)
- `/web/dataset/*` - Network First (RPC calls)
- Everything else - Network Only

**Key Features**:
- Version-based cache invalidation
- Runtime asset discovery (handles Odoo's dynamic asset URLs)
- Serves offline_error.html when no cache exists

### 2. IndexedDB Schema (offline_db.js)

**Database**: `pdc_pos_offline_db` v2

**Stores**:
```javascript
employees: { keyPath: 'id' }           // hr.employee records
pos_data: { keyPath: 'model_key' }     // Other POS models
cache_metadata: { keyPath: 'key' }     // TTL timestamps
```

**TTL Configuration**:
- hr.employee: 24 hours
- product.product: 12 hours
- Others: 24 hours

### 3. PosData Patch (pos_data_patch.js)

**Single Integration Point**: `PosData.prototype.loadInitialData()`

**Logic**:
```javascript
try {
    const data = await super.loadInitialData();
    await this._cacheForOffline(data);  // Cache on success
    return data;
} catch (error) {
    if (this._isOfflineError(error)) {
        return await this._loadFromOfflineCache();  // Load from cache
    }
    throw error;
}
```

---

## Edge Cases Handled

| Edge Case | Solution |
|-----------|----------|
| First-time offline | Graceful error page with instructions |
| PIN changed while offline | Accept stale PIN, log for audit |
| Price changed while offline | Use cached prices (standard retail) |
| Session expired | Native Odoo handles on reconnect |
| Multi-tab conflict | BroadcastChannel warning |
| Service Worker stuck | skipWaiting + version invalidation |
| IndexedDB quota | Priority caching (employees first) |

---

## Implementation Tasks

### Phase 1: Foundation
- T1.1: Clean old implementation
- T1.2: Update __manifest__.py
- T1.3: Create directory structure

### Phase 2: Service Worker
- T2.1: Create sw.js
- T2.2: Create controller
- T2.3: Create boot script
- T2.4: Create offline error page

### Phase 3: Data Caching
- T3.1: Create offline_db.js
- T3.2: Create pos_data_patch.js
- T3.3: Create assets.xml

### Phase 4: Testing & Docs
- T4.1: Playwright E2E tests
- T4.2: Update steering docs
- T4.3: Update CLAUDE.md
- T4.4: Store in global memory

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Browser refresh offline | POS loads from cache |
| Re-login offline | PIN validation works |
| Blocking UI occurrences | 0 |
| Custom auth code | 0 lines |
| Hash algorithm | Native SHA-1 |
| Code reduction vs v1 | >80% |

---

## What This Module Does NOT Do

- ❌ Custom authentication (uses native)
- ❌ Custom offline indicator (uses native navbar)
- ❌ Order syncing (native unsyncData[] handles)
- ❌ Multi-POS coordination (out of scope)
- ❌ Real-time price updates offline (impossible)

---

## Memory Keys for Future Sessions

| Namespace | Key | Content |
|-----------|-----|---------|
| `odoo-global` | `odoo19-pos-offline-architecture` | Native Odoo 19 offline details |
| `odoo-global` | `odoo19-pos-login-flow-details` | PIN validation flow |
| `project:pdc-pos-offline` | `v2-architecture-decision` | Why Service Worker needed |
| `project:pdc-pos-offline` | `v2-implementation-plan` | 14 tasks, 4 phases |

---

**Document End**
