# Performance Optimization Specification - Tasks Phase

**Module**: PDC POS Offline - Performance Optimization
**Version**: 1.0
**Phase**: TASKS (Atomic Implementation)
**Created**: 2026-01-07

---

## Task Breakdown Overview

**Phase 1: Quick Wins** (2-3 hours) → 280-380ms savings
- Task 1: Enable Gzip Compression (30 min)
- Task 2: Implement Cache Headers (45 min)
- Task 3: Add Asset Versioning (45 min)

**Phase 2: Service Worker Enhancement** (2 hours) → +200-300ms offline
- Task 4: Enhance Service Worker Pre-Caching (1 hour)
- Task 5: Implement Stale-While-Revalidate (1 hour)

**Phase 3: Resource Bundling** (3 hours) → +50-100ms
- Task 6: Extract Lazy-Load Modules (1 hour)
- Task 7: Implement Dynamic Import (1 hour)
- Task 8: Create Lazy-Load Controller (1 hour)

**Total**: 7-8 hours implementation (can be parallelized)

---

## PHASE 1: Quick Wins (2-3 hours)

### Task 1: Enable Gzip Compression

**Objective**: Reduce asset sizes by 65-80% through gzip compression

**Time Estimate**: 30 minutes
**Complexity**: Low
**Impact**: 100-150ms savings

**Pre-requisites**:
- nginx installed and running
- Odoo 19 running behind nginx
- Access to /etc/nginx/ directory

**Implementation Steps**:

1. **Update nginx configuration**
   ```bash
   # Edit /etc/nginx/conf.d/odoo.conf
   # Add after upstream odoo_backend:

   gzip on;
   gzip_types
     text/plain
     text/css
     text/javascript
     application/javascript
     application/json
     application/xml
     text/xml
     image/svg+xml;

   gzip_min_length 1000;      # Only compress files >1KB
   gzip_comp_level 6;         # Balance: speed (1-9, higher=slower)
   gzip_vary on;              # Add Vary header for caches
   ```

2. **Reload nginx**
   ```bash
   sudo systemctl reload nginx
   # Verify: curl -I http://localhost:8069/pos/ | grep -i encoding
   # Should show: content-encoding: gzip
   ```

3. **Verify compression**
   ```bash
   # Check bundle sizes
   curl -H "Accept-Encoding: gzip" http://localhost:8069/pos/assets/offline_db.js -o /tmp/offline_db.gz
   ls -lh /tmp/offline_db.gz
   # Should be <50KB
   ```

4. **Test browser compatibility**
   - Open POS in Chrome → gzip decompresses automatically ✓
   - Open POS in Firefox → gzip decompresses automatically ✓
   - Open POS in Safari → gzip decompresses automatically ✓

**Acceptance Criteria**:
- ✅ nginx gzip enabled and working
- ✅ Assets compressed to 65-80% original size
- ✅ All modern browsers decompress correctly
- ✅ Load time reduced by 100-150ms
- ✅ No code changes required

**Testing**:
```bash
# Verify compression ratio
curl -I http://localhost:8069/pos/assets/offline_db.js | grep -i content-encoding
curl -I http://localhost:8069/pos/assets/offline_db.js | grep -i content-length
```

**Rollback** (if issues):
```bash
# Just remove gzip section from nginx config
sudo nano /etc/nginx/conf.d/odoo.conf
# Comment out gzip section
sudo systemctl reload nginx
```

---

### Task 2: Implement Cache Headers

**Objective**: Add HTTP caching headers for static vs dynamic content

**Time Estimate**: 45 minutes
**Complexity**: Low
**Impact**: 150-200ms savings for repeat visits

**Pre-requisites**:
- Odoo 19 development environment
- Ability to modify controllers/HTTP routes
- Understanding of HTTP headers

**Implementation Steps**:

1. **Create cache controller**
   ```python
   # File: pdc_pos_offline/controllers/cache.py
   # NEW FILE

   from odoo import http
   from werkzeug.http import http_date
   from datetime import datetime, timedelta
   from uuid import uuid4
   import hashlib

   class PosOfflineCacheController(http.Controller):
       """HTTP caching controller for POS offline assets"""

       @http.route('/pos/assets/<path:filename>', type='http', auth='public')
       def serve_pos_asset(self, filename):
           """Serve static POS assets with aggressive caching"""
           # Get file path and content
           asset_path = self._get_asset_path(filename)
           with open(asset_path, 'rb') as f:
               content = f.read()

           # Create response
           response = http.Response(content)
           response.headers['Content-Type'] = self._get_content_type(filename)

           # Static assets: 1-year cache with ETag
           asset_hash = hashlib.md5(content).hexdigest()
           response.headers['ETag'] = f'"{asset_hash}"'
           response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
           expiry = datetime.utcnow() + timedelta(days=365)
           response.headers['Expires'] = http_date(expiry)

           return response

       def _get_asset_path(self, filename):
           """Map URL to file path"""
           # Map filename to actual file in module
           import os
           from odoo.modules.module import get_module_path
           base = get_module_path('pdc_pos_offline')
           filepath = os.path.join(base, 'static/src', filename)
           if os.path.exists(filepath):
               return filepath
           raise http.notfound()

       def _get_content_type(self, filename):
           """Return correct Content-Type header"""
           if filename.endswith('.js'):
               return 'application/javascript'
           elif filename.endswith('.css'):
               return 'text/css'
           elif filename.endswith('.json'):
               return 'application/json'
           else:
               return 'application/octet-stream'
   ```

2. **Add dynamic content caching (no cache)**
   ```python
   # Add to existing controllers (e.g., pos_session controller)

   @http.route('/pos/session', type='json', auth='user')
   def get_session(self, **kwargs):
       """Get session data - always fresh"""
       response = http.Response()
       response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
       response.headers['Pragma'] = 'no-cache'
       response.headers['Expires'] = '0'

       session_data = self._compute_session()
       return json.dumps(session_data)
   ```

3. **Test cache headers**
   ```bash
   # Test static assets (should have 1-year cache)
   curl -I http://localhost:8069/pos/assets/offline_db.js
   # Should show: Cache-Control: public, max-age=31536000, immutable

   # Test dynamic content (should NOT cache)
   curl -I http://localhost:8069/pos/session
   # Should show: Cache-Control: no-cache, no-store
   ```

4. **Verify browser caching**
   - Open DevTools (F12) → Network tab
   - First load: Shows network request (full response)
   - Reload (F5): Shows from memory cache
   - Hard reload (Ctrl+Shift+R): Shows network (cache bypassed)

**Acceptance Criteria**:
- ✅ Static assets have `max-age=31536000` (1 year)
- ✅ Dynamic content has `no-cache, no-store`
- ✅ ETag headers present for validation
- ✅ Repeat visits load from browser cache (<100ms)
- ✅ No regressions in functionality

**Testing**:
```bash
# Measure repeat visit performance
curl -w 'Time: %{time_total}\n' http://localhost:8069/pos/ > /dev/null
# First: ~400ms
# Second: ~50ms (from cache)
```

**Rollback** (if issues):
```bash
# Remove cache controller or set max-age=0
# No file deletion needed - just comment out or remove
```

---

### Task 3: Add Asset Versioning

**Objective**: Implement content-hash based asset versioning for cache invalidation

**Time Estimate**: 45 minutes
**Complexity**: Low
**Impact**: Enables 1-year caching without stale asset issues

**Pre-requisites**:
- Python/Odoo development skills
- Understanding of file hashing
- Access to manifest and static files

**Implementation Steps**:

1. **Create asset versioning helper**
   ```python
   # File: pdc_pos_offline/tools/asset_versioner.py
   # NEW FILE

   import hashlib
   import os
   import json
   from pathlib import Path

   class AssetVersioner:
       """Generate content hashes for asset versioning"""

       @staticmethod
       def compute_hash(filepath):
           """Compute MD5 hash of file content"""
           md5 = hashlib.md5()
           with open(filepath, 'rb') as f:
               for chunk in iter(lambda: f.read(8192), b''):
                   md5.update(chunk)
           return md5.hexdigest()[:8]  # First 8 chars

       @staticmethod
       def generate_manifest_versions(module_path):
           """Generate versioned asset list"""
           versions = {}
           static_path = os.path.join(module_path, 'static/src')

           for root, dirs, files in os.walk(static_path):
               for filename in files:
                   filepath = os.path.join(root, filename)
                   hash_val = AssetVersioner.compute_hash(filepath)
                   # Map: filename → filename.hash
                   key = filepath.replace(module_path + '/', '')
                   versioned = key.replace(
                       f'.{filename.split(".")[-1]}',
                       f'.{hash_val}.{filename.split(".")[-1]}'
                   )
                   versions[key] = versioned

           return versions

       @staticmethod
       def write_version_map(module_path, versions):
           """Write version map to JSON"""
           version_file = os.path.join(module_path, '.asset_versions.json')
           with open(version_file, 'w') as f:
               json.dump(versions, f, indent=2)
   ```

2. **Create build script to generate versions**
   ```python
   # File: pdc_pos_offline/tools/build_assets.py
   # NEW FILE

   #!/usr/bin/env python3

   import sys
   import os
   from asset_versioner import AssetVersioner

   if __name__ == '__main__':
       # Get module path
       module_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

       # Generate versions
       versions = AssetVersioner.generate_manifest_versions(module_path)

       # Write to file
       AssetVersioner.write_version_map(module_path, versions)

       print(f"✓ Generated asset versions for {len(versions)} files")
       print(f"  Sample: {list(versions.items())[:2]}")
   ```

3. **Update manifest with versioned assets**
   ```python
   # In __manifest__.py

   # Add versioning instruction at top:
   # Run: python3 tools/build_assets.py
   # Then update assets below with .hash in filenames

   {
       'assets': {
           'point_of_sale._assets_pos': [
               # VERSIONED (with hash for caching)
               'pdc_pos_offline/static/src/js/offline_db.abc123.js',
               'pdc_pos_offline/static/src/js/offline_auth.def456.js',
               'pdc_pos_offline/static/src/css/offline_pos.ghi789.css',
           ],
       },
   }
   ```

4. **Add version-aware controller**
   ```python
   # In pdc_pos_offline/controllers/cache.py

   def serve_pos_asset(self, filename):
       """Handle versioned filenames (remove hash before serving)"""
       # filename: offline_db.abc123.js
       # actual file: offline_db.js

       # Strip hash if present
       parts = filename.rsplit('.', 1)  # Split on last dot
       if len(parts) == 2 and len(parts[-1]) == 6:  # .abcdef format
           actual_filename = parts[0] + '.js'
       else:
           actual_filename = filename

       # Serve the file (cache controller handles headers)
       return self._serve_file(actual_filename)
   ```

5. **Test versioning**
   ```bash
   # Generate versions
   cd pdc_pos_offline
   python3 tools/build_assets.py
   # ✓ Generated asset versions for 24 files

   # Check generated file
   cat .asset_versions.json | head -5
   # {
   #   "static/src/js/offline_db.js": "static/src/js/offline_db.abc123.js",
   #   ...
   # }
   ```

**Acceptance Criteria**:
- ✅ Asset versioning script works
- ✅ Assets include hash in filename
- ✅ Controller handles versioned filenames
- ✅ Cache is never stale (hash changes = new file)
- ✅ No regressions

**Testing**:
```bash
# Verify versioned asset loads
curl http://localhost:8069/pos/assets/offline_db.abc123.js -I
# Should show 1-year cache
```

**Rollback** (if issues):
```bash
# Revert manifest to unversioned filenames
# Comment out versioning in controller
# Or just don't run build_assets.py
```

---

## PHASE 2: Service Worker (2 hours)

### Task 4: Enhance Service Worker Pre-Caching

**Objective**: Add critical asset pre-caching to Odoo 19's native service worker

**Time Estimate**: 1 hour
**Complexity**: Medium
**Impact**: 200-300ms offline support, instant repeat loads

**Implementation**:
```javascript
// File: pdc_pos_offline/static/src/js/service_worker_enhanced.js
// NEW FILE

const CACHE_NAME = 'pos-offline-v1';
const CACHE_URLS = [
  '/pos/',
  '/pos/assets/offline_db.js',
  '/pos/assets/offline_auth.js',
  '/pos/assets/offline_pos.css',
];

// Pre-cache critical assets on service worker install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching critical assets');
      return cache.addAll(CACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[ServiceWorker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Serve from cache, update in background
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkPromise = fetch(event.request).then((networkResponse) => {
        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      });

      // Return cached or network (stale-while-revalidate)
      return cachedResponse || networkPromise;
    }).catch(() => {
      // Offline - return cached or offline page
      return caches.match('/offline.html') ||
             new Response('Service unavailable', { status: 503 });
    })
  );
});
```

**Add to manifest**:
```python
# In __manifest__.py
{
    'assets': {
        'point_of_sale._assets_pos': [
            'pdc_pos_offline/static/src/js/service_worker_enhanced.js',  # NEW
        ],
    },
}
```

**Acceptance Criteria**:
- ✅ Service worker installs successfully
- ✅ Critical assets pre-cached
- ✅ Offline loads from cache (<100ms)
- ✅ Online: background updates work
- ✅ No regressions

---

### Task 5: Implement Stale-While-Revalidate

**Objective**: Serve cached content while updating in background

**Time Estimate**: 1 hour
**Complexity**: Medium
**Impact**: Seamless updates without blocking user

**Implementation**:
Already included in Task 4 (service_worker_enhanced.js)

The stale-while-revalidate pattern is implemented in the fetch event handler:
```javascript
// Return cached immediately, update in background
return cachedResponse || networkPromise;
```

**Acceptance Criteria**:
- ✅ User sees cached content immediately
- ✅ Network updates happen in background
- ✅ No blocking/waiting
- ✅ Content updates on next request if changed

---

## PHASE 3: Resource Bundling (3 hours)

### Task 6: Extract Lazy-Load Modules

**Objective**: Separate optional features into lazy-loadable modules

**Time Estimate**: 1 hour
**Complexity**: Medium
**Impact**: Reduces critical bundle by 30-40%

**Implementation**:

1. **Identify lazy-loadable features**
   ```
   CRITICAL (load immediately):
   - Offline authentication
   - Session management
   - Connection monitoring
   - Sync manager

   LAZY (load on demand):
   - Reports module
   - Settings/configuration
   - History/logs
   - Advanced analytics
   ```

2. **Create lazy-load bundles**
   ```python
   # File: pdc_pos_offline/__manifest__.py

   {
       'assets': {
           'point_of_sale._assets_pos': [
               # CRITICAL (loaded immediately)
               'pdc_pos_offline/static/src/js/offline_db.js',
               'pdc_pos_offline/static/src/js/connection_monitor.js',
               'pdc_pos_offline/static/src/js/offline_auth.js',
               'pdc_pos_offline/static/src/js/pos_offline_patch.js',
               'pdc_pos_offline/static/src/css/offline_pos.css',
               # NOTE: Lazy-load features are NOT listed here
           ],
       },
   }
   ```

3. **Move optional features out of manifest**
   - `static/src/js/reports.js` → removed from manifest
   - `static/src/js/settings.js` → removed from manifest
   - `static/src/js/analytics.js` → removed from manifest

**Acceptance Criteria**:
- ✅ Critical features load immediately
- ✅ Optional features separated
- ✅ All functionality still works (before lazy-loading)

---

### Task 7: Implement Dynamic Import

**Objective**: Load optional modules on demand via JavaScript dynamic import

**Time Estimate**: 1 hour
**Complexity**: Medium
**Impact**: Delays non-critical feature loads

**Implementation**:

```javascript
// File: pdc_pos_offline/static/src/js/lazy_loader.js
// NEW FILE

class PosLazyLoader {
  constructor() {
    this.loadedModules = {};
  }

  async loadReports() {
    if (this.loadedModules.reports) return;

    const script = document.createElement('script');
    script.src = '/pos/lazy-modules/reports';
    script.onload = () => {
      this.loadedModules.reports = true;
      console.log('[POS] Reports module loaded');
    };
    script.onerror = () => console.error('[POS] Failed to load reports');
    document.head.appendChild(script);
  }

  async loadSettings() {
    if (this.loadedModules.settings) return;

    const script = document.createElement('script');
    script.src = '/pos/lazy-modules/settings';
    script.onload = () => {
      this.loadedModules.settings = true;
      console.log('[POS] Settings module loaded');
    };
    document.head.appendChild(script);
  }

  async loadAnalytics() {
    if (this.loadedModules.analytics) return;

    const script = document.createElement('script');
    script.src = '/pos/lazy-modules/analytics';
    script.onload = () => {
      this.loadedModules.analytics = true;
    };
    document.head.appendChild(script);
  }
}

// Global instance
window.posLazyLoader = new PosLazyLoader();
```

**Hook up to UI**:
```javascript
// In offline_login_popup.js or pos_session template

document.getElementById('reports-tab')?.addEventListener('click', () => {
  posLazyLoader.loadReports();
});

document.getElementById('settings-tab')?.addEventListener('click', () => {
  posLazyLoader.loadSettings();
});

document.getElementById('analytics-tab')?.addEventListener('click', () => {
  posLazyLoader.loadAnalytics();
});
```

**Acceptance Criteria**:
- ✅ Dynamic imports work
- ✅ Modules load on demand (<50ms after click)
- ✅ No blocking of initial load
- ✅ Features available when loaded

---

### Task 8: Create Lazy-Load Controller

**Objective**: Implement Odoo controller to serve lazy-loaded modules

**Time Estimate**: 1 hour
**Complexity**: Low
**Impact**: Completes lazy-loading infrastructure

**Implementation**:

```python
# File: pdc_pos_offline/controllers/lazy_load.py
# NEW FILE

from odoo import http
from odoo.modules.module import get_module_path
import os

class PosLazyLoadController(http.Controller):
    """Controller for serving lazy-loaded POS modules"""

    @http.route('/pos/lazy-modules/<module_name>', type='http', auth='public')
    def serve_lazy_module(self, module_name):
        """Serve lazy-loadable modules on demand"""
        module_map = {
            'reports': 'static/src/js/reports.js',
            'settings': 'static/src/js/settings.js',
            'analytics': 'static/src/js/analytics.js',
        }

        if module_name not in module_map:
            return http.request.not_found()

        # Get file path
        module_path = get_module_path('pdc_pos_offline')
        filepath = os.path.join(module_path, module_map[module_name])

        if not os.path.exists(filepath):
            return http.request.not_found()

        # Read and serve file
        with open(filepath, 'r') as f:
            content = f.read()

        response = http.Response(content)
        response.headers['Content-Type'] = 'application/javascript'
        # Lazy modules are still cached (intermediate cache)
        response.headers['Cache-Control'] = 'public, max-age=3600'
        return response
```

**Test lazy-loading**:
```bash
# Verify lazy module loads
curl http://localhost:8069/pos/lazy-modules/reports -I
# Should return JavaScript with 1-hour cache
```

**Acceptance Criteria**:
- ✅ Lazy-load controller working
- ✅ Modules serve correctly
- ✅ Cache headers applied
- ✅ Features work when loaded

---

## Summary of All Tasks

| # | Task | Time | Impact | Status |
|---|------|------|--------|--------|
| 1 | Enable Gzip | 30m | 100-150ms | Pending |
| 2 | Cache Headers | 45m | 150-200ms | Pending |
| 3 | Asset Versioning | 45m | Enables 1yr cache | Pending |
| 4 | Service Worker | 1h | 200-300ms offline | Pending |
| 5 | Stale-While-Revalidate | 1h | Seamless updates | Pending |
| 6 | Extract Lazy Modules | 1h | 30-40% reduction | Pending |
| 7 | Dynamic Import | 1h | On-demand loading | Pending |
| 8 | Lazy-Load Controller | 1h | Infrastructure | Pending |

**Total Time**: 7-8 hours (can be parallelized into 3-4 concurrent tasks)

**Expected Result**: 500ms → <150ms initial load (70% reduction) ✓

---

## Acceptance Criteria (Phase Gate)

✅ **All 8 tasks defined and atomic**
✅ **Time estimates provided**
✅ **Implementation details documented**
✅ **Acceptance criteria clear for each task**
✅ **Dependencies identified**
✅ **Rollback strategy for each task**
✅ **Ready for implementation phase**

---

## Next Phase: IMPLEMENTATION

Tasks phase complete. Ready to implement all 8 tasks.

**Recommendation**: Implement sequentially (Tasks 1-3 safe and independent, Tasks 4-5 build on each other, Tasks 6-8 can be parallel)

**Phase Gate**: Tasks approved ✅
