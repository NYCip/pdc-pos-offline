# Offline Re-Login Module v2.0 - Implementation Tasks

**Spec ID**: offline-relogin-redesign
**Version**: 2.0.0
**Date**: 2026-01-08
**Source**: 4-Round HiveMind Deliberation

---

## Phase 1: Module Foundation

### T1.1 - Clean Old Implementation
**Status**: PENDING
**Priority**: P0
**Complexity**: 2

**Action**: Remove all old v1 files (complete rewrite)

**Files to DELETE**:
- `static/src/js/offline_auth.js`
- `static/src/js/offline_db.js` (will recreate)
- `static/src/js/offline_login_popup.js`
- `static/src/js/pos_offline_patch.js`
- `static/src/js/session_persistence.js`
- `static/src/js/connection_monitor.js`
- `static/src/xml/offline_indicator.xml`
- `static/src/xml/offline_login_popup.xml`
- `static/src/css/offline_pos.css` (keep minimal styles)

**Acceptance**: No old JS/XML files remain

---

### T1.2 - Update __manifest__.py
**Status**: PENDING
**Priority**: P0
**Complexity**: 2

**Action**: Rewrite manifest for v2.0

```python
{
    'name': 'PDC POS Offline Mode',
    'version': '2.0.0',
    'category': 'Point of Sale',
    'summary': 'PWA-style offline mode for Odoo 19 POS',
    'depends': ['point_of_sale', 'pos_hr'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pdc_pos_offline/static/src/js/offline_db.js',
            'pdc_pos_offline/static/src/js/pos_data_patch.js',
            'pdc_pos_offline/static/src/js/pos_offline_boot.js',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
```

**Acceptance**: Module installs without errors

---

### T1.3 - Create Directory Structure
**Status**: PENDING
**Priority**: P0
**Complexity**: 1

**Action**: Create required directories

```bash
mkdir -p static/src/service_worker
mkdir -p controllers
touch controllers/__init__.py
```

**Acceptance**: Directory structure matches ARCHITECTURE_V2.md

---

## Phase 2: Service Worker

### T2.1 - Create Service Worker (sw.js)
**Status**: PENDING
**Priority**: P0
**Complexity**: 4
**Estimated Lines**: ~200

**File**: `static/src/service_worker/sw.js`

**Requirements**:
1. Cache `/pos/ui` entry point
2. Cache `/web/assets/*` with stale-while-revalidate
3. Network-first for `/web/dataset/*` RPC calls
4. Version-based cache invalidation
5. Serve offline_error.html when no cache

**Key Implementation**:
```javascript
const CACHE_VERSION = '2.0.0';
const CACHE_NAME = `pdc-pos-offline-${CACHE_VERSION}`;

const CACHEABLE_PATTERNS = [
    /^\/pos\/ui/,
    /^\/web\/assets\/.*\.(js|css)$/,
    /^\/web\/static\/lib\//,
];

self.addEventListener('fetch', (event) => {
    const strategy = getStrategy(event.request.url);
    event.respondWith(executeStrategy(strategy, event.request));
});
```

**Acceptance**:
- `/pos/ui` loads from cache when offline
- New assets cached on first load
- Old caches deleted on version change

---

### T2.2 - Create SW Controller
**Status**: PENDING
**Priority**: P0
**Complexity**: 2
**Estimated Lines**: ~30

**File**: `controllers/service_worker_controller.py`

**Requirements**:
1. Route `/pos_offline/sw.js`
2. Serve with `application/javascript` MIME type
3. Set `Service-Worker-Allowed: /` header
4. No caching header

**Implementation**:
```python
from odoo import http
from odoo.http import Response
import os

class ServiceWorkerController(http.Controller):
    @http.route('/pos_offline/sw.js', type='http', auth='public', cors='*')
    def service_worker(self):
        module_path = os.path.dirname(os.path.dirname(__file__))
        sw_path = os.path.join(module_path, 'static/src/service_worker/sw.js')

        with open(sw_path, 'r') as f:
            content = f.read()

        return Response(
            content,
            mimetype='application/javascript',
            headers={
                'Service-Worker-Allowed': '/',
                'Cache-Control': 'no-cache'
            }
        )
```

**Acceptance**: `/pos_offline/sw.js` returns valid JS with correct headers

---

### T2.3 - Create SW Boot Script
**Status**: PENDING
**Priority**: P0
**Complexity**: 3
**Estimated Lines**: ~50

**File**: `static/src/js/pos_offline_boot.js`

**Requirements**:
1. Register Service Worker on page load
2. Handle SW updates
3. Version check and cache clear on upgrade
4. BroadcastChannel for multi-tab coordination

**Implementation**:
```javascript
/** @odoo-module */

const MODULE_VERSION = '2.0.0';

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        // Version check
        const storedVersion = localStorage.getItem('pdc_offline_version');
        if (storedVersion !== MODULE_VERSION) {
            await clearAllCaches();
            localStorage.setItem('pdc_offline_version', MODULE_VERSION);
        }

        // Register SW
        const registration = await navigator.serviceWorker.register(
            '/pos_offline/sw.js',
            { scope: '/pos/' }
        );

        console.log('[PDC-Offline] Service Worker registered');
    });
}
```

**Acceptance**: SW registered with `/pos/` scope, version updates clear cache

---

### T2.4 - Create Offline Error Page
**Status**: PENDING
**Priority**: P1
**Complexity**: 1
**Estimated Lines**: ~40

**File**: `static/src/service_worker/offline_error.html`

**Requirements**:
1. User-friendly error message
2. Clear instructions to go online first
3. Retry button
4. Styled to match POS theme

**Acceptance**: Page displays when offline with no cache

---

## Phase 3: Data Caching

### T3.1 - Create IndexedDB Wrapper
**Status**: PENDING
**Priority**: P0
**Complexity**: 4
**Estimated Lines**: ~150

**File**: `static/src/js/offline_db.js`

**Requirements**:
1. Create database `pdc_pos_offline_db` v2
2. Stores: employees, pos_data, cache_metadata
3. Save/get methods for each model
4. TTL validation
5. Cache metadata tracking

**Schema**:
```javascript
const STORES = {
    employees: { keyPath: 'id' },
    pos_data: { keyPath: 'model_key' },
    cache_metadata: { keyPath: 'key' }
};

const CACHE_TTL = {
    'hr.employee': 24 * 60 * 60 * 1000,
    'product.product': 12 * 60 * 60 * 1000,
    // ...
};
```

**Acceptance**: Data persists across browser sessions, TTL works

---

### T3.2 - Create PosData Patch
**Status**: PENDING
**Priority**: P0
**Complexity**: 4
**Estimated Lines**: ~120

**File**: `static/src/js/pos_data_patch.js`

**Requirements**:
1. Patch `PosData.prototype.loadInitialData()`
2. Cache data on successful load
3. Load from cache on network error
4. Preserve exact native data format
5. Handle offline detection

**Critical Implementation**:
```javascript
patch(PosData.prototype, {
    async loadInitialData() {
        try {
            const data = await super.loadInitialData();
            await this._cacheForOffline(data);
            return data;
        } catch (error) {
            if (this._isOfflineError(error)) {
                return await this._loadFromOfflineCache();
            }
            throw error;
        }
    }
});
```

**Acceptance**:
- Online: Data cached to IndexedDB
- Offline: Data loaded from IndexedDB
- Native login flow works with cached data

---

### T3.3 - Create Asset Registration
**Status**: PENDING
**Priority**: P0
**Complexity**: 1
**Estimated Lines**: ~20

**File**: `views/assets.xml`

**Requirements**:
1. Register JS files in `point_of_sale._assets_pos` bundle
2. Correct load order (offline_db → pos_data_patch → boot)

**Acceptance**: All JS files load in POS

---

## Phase 4: Testing & Documentation

### T4.1 - Create Playwright E2E Tests
**Status**: PENDING
**Priority**: P1
**Complexity**: 4

**File**: `tests/e2e/test_offline_mode.py`

**Test Cases**:
1. Service Worker registers on first load
2. POS loads from cache after browser refresh offline
3. Login works with cached employee data
4. Order creation works offline
5. Orders sync on reconnect

**Acceptance**: All tests pass

---

### T4.2 - Update Steering Documents
**Status**: PENDING
**Priority**: P1
**Complexity**: 2

**Files**:
- `.odoo-dev/steering/ARCHITECTURE_V2.md` (created)
- `.odoo-dev/steering/DEEP_RESEARCH_FINDINGS.md` (exists)
- Update `.odoo-dev/steering/odoo19-native-offline.md`

**Acceptance**: Documentation complete and accurate

---

### T4.3 - Update CLAUDE.md
**Status**: PENDING
**Priority**: P1
**Complexity**: 2

**Updates**:
1. Add v2.0 architecture overview
2. Document Service Worker requirement
3. Document IndexedDB schema
4. Add memory key references

**Acceptance**: New sessions can understand architecture from CLAUDE.md

---

### T4.4 - Store in Global Memory
**Status**: PENDING
**Priority**: P1
**Complexity**: 1

**Memory Keys**:
```bash
# Global Odoo patterns
npx claude-flow memory store \
    --namespace "odoo-global" \
    --key "odoo19-pos-offline-architecture" \
    --value "<architecture details>"

# Project-specific
npx claude-flow memory store \
    --namespace "project:pdc-pos-offline" \
    --key "v2-implementation-complete" \
    --value "<implementation summary>"
```

**Acceptance**: Memory accessible in new sessions

---

## Dependency Graph

```
T1.1 → T1.2 → T1.3
                ↓
        ┌───────┼───────┐
        ↓       ↓       ↓
      T2.1    T2.2    T2.4
        ↓       ↓
        └───T2.3───┘
              ↓
        ┌─────┼─────┐
        ↓           ↓
      T3.1        T3.2
        ↓           ↓
        └───T3.3───┘
              ↓
    ┌────┬────┼────┬────┐
    ↓    ↓         ↓    ↓
  T4.1  T4.2     T4.3  T4.4
```

---

## Execution Strategy

**Complexity Score**: 12
**Recommended**: HiveMind parallel execution with 3-4 agents

**Agent Assignment**:
- Agent 1 (Foundation): T1.1 → T1.2 → T1.3 → T3.3
- Agent 2 (Service Worker): T2.1 → T2.3 → T2.4
- Agent 3 (Data Layer): T2.2 → T3.1 → T3.2
- Agent 4 (QA/Docs): T4.1 → T4.2 → T4.3 → T4.4

---

**Document End**
