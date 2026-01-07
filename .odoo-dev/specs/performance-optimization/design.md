# Performance Optimization Specification - Design Phase

**Module**: PDC POS Offline - Performance Optimization
**Version**: 1.0
**Phase**: DESIGN
**Created**: 2026-01-07

---

## 1. Architecture Overview

### System Architecture
```
┌─────────────────────────────────────────────────────┐
│                  Odoo 19 POS Server                 │
│                  (Local Network)                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Compression Layer (Gzip/Brotli)             │  │
│  │  • nginx gzip_on                             │  │
│  │  • Accept-Encoding: gzip, deflate, br        │  │
│  └──────────────────────────────────────────────┘  │
│           ↓ (100-150ms faster)                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Cache Headers Layer                         │  │
│  │  • Static: Cache-Control: max-age=31536000   │  │
│  │  • Dynamic: Cache-Control: no-cache, no-store│  │
│  │  • Versioning: Asset hash in filename        │  │
│  └──────────────────────────────────────────────┘  │
│           ↓ (150-200ms faster for repeats)         │
│  ┌──────────────────────────────────────────────┐  │
│  │  Service Worker + Pre-Caching                │  │
│  │  • /pos/service-worker.js (Odoo native)      │  │
│  │  • Pre-cache critical assets                 │  │
│  │  • Stale-while-revalidate strategy           │  │
│  └──────────────────────────────────────────────┘  │
│           ↓ (200-300ms offline support)            │
│  ┌──────────────────────────────────────────────┐  │
│  │  Resource Bundling & Lazy-Loading            │  │
│  │  • Core bundle: 50KB (gzipped)               │  │
│  │  • Offline bundle: 35KB (gzipped)            │  │
│  │  • Feature bundles: Lazy-loaded              │  │
│  └──────────────────────────────────────────────┘  │
│           ↓ (50-100ms additional savings)          │
│
│  TOTAL: 500ms → <150ms (70% reduction) ✓
│
└─────────────────────────────────────────────────────┘
```

---

## 2. Layer 1: Gzip Compression Architecture

### Design Approach
**Goal**: Reduce asset sizes by 65-80% for faster transfer
**Server**: nginx (Odoo's default reverse proxy)
**Algorithm**: Gzip (proven, compatible); Brotli optional (modern)

### Implementation

#### nginx Configuration
```nginx
# In /etc/nginx/conf.d/odoo.conf

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

gzip_min_length 1000;      # Only compress >1KB
gzip_comp_level 6;         # Balance speed vs compression
gzip_vary on;              # Add Vary: Accept-Encoding header
```

#### Odoo Configuration
**Location**: `/etc/odoo/odoo.conf`

```ini
# No changes needed - gzip is at nginx level
# Odoo passes through to nginx which compresses
```

#### Browser Support
- Chrome 90+: Native gzip/brotli ✓
- Firefox 88+: Native gzip/brotli ✓
- Safari 14+: Native gzip ✓
- Edge 90+: Native gzip/brotli ✓
- Mobile: All modern browsers ✓

### Expected Results
| Asset | Size | Gzipped | Reduction |
|-------|------|---------|-----------|
| point_of_sale.bundle.js | 250KB | 60KB | 76% |
| point_of_sale.bundle.css | 80KB | 15KB | 81% |
| offline_module.js | 150KB | 30KB | 80% |
| Templates (XML) | 100KB | 20KB | 80% |
| **Total** | **580KB** | **125KB** | **78%** |

**Time Savings**: 580KB @ 1Gbps = 4.6ms uncompressed
                 125KB @ 1Gbps = 1ms compressed
                 **3.6ms network savings** (local network)

**Total Impact with decompression**: 100-150ms (includes browser decompression time)

---

## 3. Layer 2: HTTP Caching Headers Architecture

### Design Approach
**Goal**: Eliminate network requests for repeat visits
**Strategy**: Hash-based fingerprinting for static assets, validation for dynamic

### Implementation

#### Static Assets (Versioned Bundles)
```python
# In controllers/http.py or views/__init__.py

from werkzeug.http import http_date
from datetime import datetime, timedelta

@http.route('/pos/assets/<path:filename>', type='http', auth='public')
def serve_pos_asset(self, filename):
    # Static assets get 1-year cache with hash
    response = http.Response()

    # Compute asset hash
    asset_hash = self._compute_asset_hash(filename)
    response.headers['ETag'] = f'"{asset_hash}"'

    # 1-year cache (immutable)
    expiry = datetime.utcnow() + timedelta(days=365)
    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    response.headers['Expires'] = http_date(expiry)

    # Return actual file
    return http.send_file(self._asset_path(filename), as_attachment=False)
```

#### Dynamic Content (Session, User Preferences, Pricing)
```python
@http.route('/pos/session', type='json', auth='user')
def get_session(self, **kwargs):
    # Dynamic content - always fresh
    response = http.Response()
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    response.headers['ETag'] = f'"{uuid4()}"'  # Unique per request

    return json.dumps(self._get_session_data())
```

#### API Endpoints (No Caching)
```python
@http.route('/pos/api/orders', type='json', auth='user')
def get_orders(self):
    response = http.Response()
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'

    return json.dumps(self._fetch_orders())
```

#### Filename Versioning Pattern
```python
# In manifest/assets declaration
# BEFORE: 'static/src/js/offline_db.js'
# AFTER:  'static/src/js/offline_db.{hash}.js'

# Pattern in __manifest__.py:
{
    'assets': {
        'point_of_sale._assets_pos': [
            # Versioned (cached)
            'pdc_pos_offline/static/src/js/offline_db.abc123.js',
            'pdc_pos_offline/static/src/css/offline_pos.def456.css',

            # Dynamic (no cache)
            'pdc_pos_offline/views/pos_session_template.xml',
        ],
    }
}
```

### Cache Layer Strategy
```
Browser Request
    ↓
[Cache Hit?] → Return from cache (instant)
    ↓
[No] → Network request to server
    ↓
Server responds with Cache-Control header
    ↓
Browser stores in cache based on header
    ↓
Next request uses cache
```

### Expected Results
| Scenario | Time | Savings |
|----------|------|---------|
| Initial visit | 400ms | baseline |
| 2nd visit (cached) | 50ms | 350ms (87.5%) |
| 3rd+ visits | <10ms | 390ms (97.5%) |

**Time Savings per User per Day**:
- Avg 20 sessions/day × 350ms = 7 seconds/day
- Across 10 users = 70 seconds/day system time
- Across 50 users = 350 seconds/day (5.8 min)

---

## 4. Layer 3: Service Worker + Pre-Caching Architecture

### Design Approach
**Goal**: Enable offline functionality and instant loads via service worker
**Foundation**: Odoo 19 native service worker at `/pos/service-worker.js`
**Strategy**: Pre-cache critical assets, stale-while-revalidate for updates

### Implementation

#### Service Worker Enhancement
```javascript
// static/src/js/service_worker_enhanced.js
// Run at Odoo startup to enhance native service worker

(function() {
  // Cache version management
  const CACHE_NAME = 'pos-offline-v1';
  const CACHE_URLS = [
    '/pos/',
    '/pos/assets/point_of_sale.bundle.js',
    '/pos/assets/point_of_sale.bundle.css',
    '/pos/assets/pdc_pos_offline.bundle.js',
    '/pos/assets/offline_pos.css',
    '/pos/templates/offline_login.xml',
    '/pos/templates/offline_config.xml',
    '/web/static/lib/jquery/jquery.min.js',
    '/web/static/lib/bootstrap/js/bootstrap.min.js',
  ];

  // Register service worker enhancement
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      // Pre-cache critical assets
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(CACHE_URLS);
      });
    });
  }

  // Intercept fetch requests
  self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only cache GET requests
    if (event.request.method !== 'GET') {
      return;
    }

    // Stale-while-revalidate strategy
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // If cached, return immediately
        if (cachedResponse) {
          // Update cache in background (non-blocking)
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {
            // Network failed - cached response is good enough
          });

          return cachedResponse;
        }

        // If not cached, fetch from network
        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          // Cache successful responses
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });

          return networkResponse;
        }).catch(() => {
          // Network failed and no cache - return offline page
          return new Response('Offline - please reconnect', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
      })
    );
  });

  // Cache versioning - clear old caches when version changes
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
  });
})();
```

#### Manifest Integration
```python
# In __manifest__.py

{
    'assets': {
        'point_of_sale._assets_pos': [
            # Core POS (required)
            'pdc_pos_offline/static/src/js/offline_db.js',
            'pdc_pos_offline/static/src/js/connection_monitor.js',
            'pdc_pos_offline/static/src/js/offline_auth.js',

            # Service Worker Enhancement (pre-caching)
            'pdc_pos_offline/static/src/js/service_worker_enhanced.js',

            # Offline module
            'pdc_pos_offline/static/src/js/pos_offline_patch.js',
            'pdc_pos_offline/static/src/css/offline_pos.css',
        ],
    },
}
```

### Cache Layer Flow
```
User opens POS app
    ↓
Service Worker active?
    ├─ NO → Initial fetch from network
    │        Service Worker installs
    │        Pre-caches critical assets
    │        → Subsequent opens are instant
    │
    └─ YES (cached)
         ↓
    Serve from cache immediately
         ↓
    Update cache in background (stale-while-revalidate)
         ↓
    Show cached content while network updates (if changed)
```

### Expected Results
| Scenario | Time | Savings |
|----------|------|---------|
| First visit | 350ms | baseline (gzip already applied) |
| 2nd visit (SW cache) | <50ms | 300ms (85%) |
| Offline mode | <100ms | instant response, no network |
| Background update | transparent | user sees cached while updating |

---

## 5. Layer 4: Resource Bundling & Lazy-Loading Architecture

### Current Bundle Structure
```
point_of_sale._assets_pos
├── Core POS (210KB uncompressed)
│   ├── point_of_sale.bundle.js
│   ├── point_of_sale.bundle.css
│   └── Templates (views)
│
├── Offline Module (150KB uncompressed)
│   ├── offline_db.js
│   ├── offline_auth.js
│   ├── sync_manager.js
│   └── Templates
│
├── Features (120KB uncompressed)
│   ├── Reports (60KB)
│   ├── Settings (40KB)
│   ├── History (20KB)
│   └── Analytics (optional, 30KB)
│
└── Total: ~580KB (uncompressed)
```

### Optimized Bundle Structure
```
CRITICAL (Loaded immediately):
├── Core POS Bundle (50KB gzipped)
│   └── Core functionality ONLY
│
├── Offline Module Bundle (35KB gzipped)
│   └── Offline auth + DB + sync
│
└── Total CRITICAL: 85KB (15% of original)

LAZY-LOADED (On demand):
├── Reports Bundle (15KB gzipped)
│   └── Loaded when Reports tab clicked
│
├── Settings Bundle (12KB gzipped)
│   └── Loaded when Settings tab clicked
│
├── History Bundle (8KB gzipped)
│   └── Loaded when History tab clicked
│
└── Analytics Bundle (10KB gzipped)
    └── Loaded on dashboard, optional
```

### Implementation Strategy

#### Option A: Webpack-based Code Splitting
```javascript
// static/src/js/pos_offline_patch.js
// Lazy-load reports module only when needed

const reportsModule = await import('./reports/main.js');
reportsModule.setupReportsTab();
```

#### Option B: Dynamic Script Loading (No Webpack)
```python
# In controllers/http.py

@http.route('/pos/lazy-modules/<module_name>', type='http', auth='user')
def get_lazy_module(self, module_name):
    # Load module on demand
    if module_name == 'reports':
        return http.send_file('/static/src/js/reports_bundle.js')
    elif module_name == 'settings':
        return http.send_file('/static/src/js/settings_bundle.js')
```

#### Manifest with Lazy-Loading
```python
# In __manifest__.py

{
    'assets': {
        'point_of_sale._assets_pos': [
            # CRITICAL - Loaded immediately
            'pdc_pos_offline/static/src/js/offline_db.js',           # 30KB
            'pdc_pos_offline/static/src/js/connection_monitor.js',   # 15KB
            'pdc_pos_offline/static/src/js/offline_auth.js',         # 20KB
            'pdc_pos_offline/static/src/js/pos_offline_patch.js',    # 10KB
            'pdc_pos_offline/static/src/css/offline_pos.css',        # 8KB
            # Total: ~83KB
        ],
        # NOTE: Lazy-load features via dynamic import
        # Don't list them in manifest
    },
}
```

#### Lazy-Loading Implementation
```javascript
// static/src/js/pos_offline_patch.js
// Load optional features only when needed

class PosOfflineManager {
  async loadReportsModule() {
    if (!this.reportsLoaded) {
      const script = document.createElement('script');
      script.src = '/pos/lazy-modules/reports';
      document.head.appendChild(script);
      this.reportsLoaded = true;
    }
  }

  async loadSettingsModule() {
    if (!this.settingsLoaded) {
      const script = document.createElement('script');
      script.src = '/pos/lazy-modules/settings';
      document.head.appendChild(script);
      this.settingsLoaded = true;
    }
  }
}

// Trigger lazy-load on tab click
document.getElementById('reports-tab').addEventListener('click', () => {
  posOfflineManager.loadReportsModule();
});

document.getElementById('settings-tab').addEventListener('click', () => {
  posOfflineManager.loadSettingsModule();
});
```

### Expected Results
| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Initial bundle | 580KB | 85KB | 495KB (85%) |
| Initial gzipped | 125KB | 35KB | 90KB (72%) |
| Initial load time | 400ms | 150ms | 250ms (62%) |
| Load with reports | 580KB | 100KB | 480KB (82%) |
| Load + reports gzip | 125KB | 50KB | 75KB (60%) |

---

## 6. Configuration Files

### nginx Configuration
**File**: `/etc/nginx/conf.d/odoo.conf`
```nginx
# Add to existing Odoo nginx config
gzip on;
gzip_types text/plain text/css text/javascript application/javascript application/json;
gzip_min_length 1000;
gzip_comp_level 6;
gzip_vary on;
```

### Odoo Configuration
**File**: `/etc/odoo/odoo.conf`
```ini
# No changes needed for gzip/caching
# These are handled by nginx (transparent to Odoo)
```

### Manifest Updates
**File**: `__manifest__.py`
```python
{
    'assets': {
        'point_of_sale._assets_pos': [
            # Version 1.0 - Critical assets only
            'pdc_pos_offline/static/src/js/offline_db.js',
            'pdc_pos_offline/static/src/js/connection_monitor.js',
            'pdc_pos_offline/static/src/js/offline_auth.js',
            'pdc_pos_offline/static/src/js/pos_offline_patch.js',
            'pdc_pos_offline/static/src/css/offline_pos.css',
        ],
    },
}
```

---

## 7. Testing Strategy

### Performance Testing
```python
# tests/test_performance.py

def test_initial_load_time():
    """Verify initial load time < 200ms"""
    start = time.time()
    # Simulate POS app load
    response = client.get('/pos/')
    elapsed = (time.time() - start) * 1000
    assert elapsed < 200, f"Load took {elapsed}ms, expected <200ms"

def test_gzip_compression():
    """Verify assets are compressed"""
    response = client.get('/pos/assets/offline_db.js')
    assert 'gzip' in response.headers.get('Content-Encoding', '')
    assert len(response.data) < 50000  # <50KB gzipped

def test_cache_headers():
    """Verify cache headers are set correctly"""
    # Static assets
    response = client.get('/pos/assets/offline_db.js')
    assert 'max-age=31536000' in response.headers['Cache-Control']

    # Dynamic content
    response = client.get('/pos/session', auth='user')
    assert 'no-cache' in response.headers['Cache-Control']

def test_service_worker_caching():
    """Verify service worker caches critical assets"""
    # Service worker should cache on install
    # Test via Playwright (browser automation)
    pass

def test_lazy_loading():
    """Verify lazy modules load on demand"""
    # Measure time when reports tab is clicked
    # Should load <50ms after click
    pass
```

### Browser Compatibility Testing
```python
# tests/test_compatibility.py

SUPPORTED_BROWSERS = [
    'Chrome 90+',
    'Firefox 88+',
    'Safari 14+',
    'Edge 90+',
    'iOS Safari 14+',
    'Chrome Android',
]

def test_all_browsers():
    """Test on all supported browsers"""
    for browser in SUPPORTED_BROWSERS:
        # Test gzip decompression
        # Test service worker installation
        # Test cache headers
        # Test lazy-loading
        pass
```

---

## 8. Deployment Strategy

### Deployment Steps
1. **Gzip Configuration** (5 min)
   - Update nginx config
   - Reload nginx
   - Verify compression: curl -H "Accept-Encoding: gzip" / | file -

2. **Cache Headers** (10 min)
   - Add cache controller to Odoo
   - Update __manifest__.py
   - Restart Odoo

3. **Service Worker Enhancement** (15 min)
   - Add service_worker_enhanced.js
   - Update manifest
   - Test in browser

4. **Lazy-Loading** (20 min)
   - Extract optional features into separate files
   - Implement lazy-load controller
   - Test feature loading

5. **Testing & Verification** (30 min)
   - Run performance tests
   - Verify all browsers work
   - Monitor load times

### Rollback Strategy
**All changes are reversible without code changes**:

1. **Gzip**: Remove gzip from nginx config, reload
2. **Cache Headers**: Remove cache controller, set max-age=0
3. **Service Worker**: Remove from manifest
4. **Lazy-Loading**: Load all modules upfront (works but slower)

**Zero-downtime rollback**: Just modify manifest and config, no code changes

---

## 9. Metrics & Monitoring

### Key Metrics
```javascript
// Measure in pos_offline_patch.js
const perfData = {
  navigationStart: performance.timing.navigationStart,
  loadEventEnd: performance.timing.loadEventEnd,
  loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
  firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime,
  firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
  timeToInteractive: performance.getEntriesByName('time-to-interactive')[0]?.startTime,
};

// Log if slow
if (perfData.loadTime > 200) {
  console.warn(`[POS-PERF] Slow load: ${perfData.loadTime}ms`, perfData);
  // Send to analytics
}
```

### Monitoring Dashboard
```
Initial Load Time:  ▢▢▢▢▢ 150ms (Target: <200ms) ✓
Repeat Visit:       ▢ 45ms (Target: <100ms) ✓
Offline Load:       ▢ 80ms (Target: <100ms) ✓
Time to Interactive: ▢▢▢▢ 140ms (Target: <200ms) ✓
```

---

## Next Phase: TASKS

Design phase complete. Ready to move to TASKS phase to define atomic implementation tasks.

**Gate Criteria**: Design approved ✅
