# Offline Re-Login Module Redesign - Tasks

## Document Information
- **Spec ID**: offline-relogin-redesign
- **Created**: 2026-01-07
- **Status**: READY FOR EXECUTION
- **Total Tasks**: 8
- **Estimated Reduction**: 70%+ code removal

---

## Task Summary

| ID | Task | Priority | Complexity | Status |
|----|------|----------|------------|--------|
| T1 | Remove blocking offline banner UI | P0 | 3 | pending |
| T2 | Empty offline_indicator.xml template | P0 | 1 | pending |
| T3 | Refactor connection_monitor.js | P1 | 4 | pending |
| T4 | Create pos_offline_login_patch.js | P1 | 6 | pending |
| T5 | Update __manifest__.py assets | P1 | 2 | pending |
| T6 | Server: Add offline hash to login response | P1 | 3 | pending |
| T7 | Integration testing | P1 | 5 | pending |
| T8 | Documentation update | P2 | 2 | pending |

---

## Task Details

### T1: Remove Blocking Offline Banner UI
**Priority**: P0 (Critical - immediate UX fix)
**Complexity**: 3/10
**File**: `static/src/js/pos_offline_patch.js`

**Description**:
Remove the `showOfflineBanner()` and `hideOfflineBanner()` functions and all code that triggers them.

**Acceptance Criteria**:
- [ ] No full-screen offline banner appears
- [ ] No modal blocking user interaction
- [ ] Native navbar indicator still works

**Implementation Notes**:
- Search for `showOfflineBanner`, `hideOfflineBanner`, `offline-banner`
- Remove all triggers and event handlers
- Test that native `fa-chain-broken` icon shows

---

### T2: Empty offline_indicator.xml Template
**Priority**: P0 (Critical)
**Complexity**: 1/10
**File**: `static/src/xml/offline_indicator.xml`

**Description**:
Empty or remove the custom offline indicator template. Native Odoo 19 provides this in navbar.xml.

**Acceptance Criteria**:
- [ ] Template contains no visible elements
- [ ] No duplicate offline indicators shown
- [ ] Module still loads without errors

**Implementation Notes**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates xml:space="preserve">
    <!-- Removed: Using native Odoo 19 navbar offline indicator -->
</templates>
```

---

### T3: Refactor connection_monitor.js
**Priority**: P1 (High)
**Complexity**: 4/10
**File**: `static/src/js/connection_monitor.js`

**Description**:
Remove all UI-triggering code. Keep only the `checkNow()` utility for forced connectivity checks.

**Changes**:
- Remove `trigger('show-offline-banner')` calls
- Remove `trigger('hide-offline-banner')` calls
- Keep `checkNow()` for programmatic use
- Keep `isOffline()` for status checks
- Consider deprecating in favor of native `network.offline`

**Acceptance Criteria**:
- [ ] No events trigger blocking UI
- [ ] `checkNow()` still works
- [ ] `isOffline()` still returns correct state

---

### T4: Create pos_offline_login_patch.js
**Priority**: P1 (High)
**Complexity**: 6/10
**File**: `static/src/js/pos_offline_login_patch.js` (NEW)

**Description**:
Create the main integration layer that patches native PosStore for offline login fallback.

**Implementation** (see design.md for full code):
```javascript
/** @odoo-module */
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";
import { createOfflineAuth } from "./offline_auth";
import { offlineDB } from "./offline_db";

patch(PosStore.prototype, {
    setup() { /* ... */ },
    async login(credentials) { /* ... */ },
    async _offlineLogin(credentials) { /* ... */ },
    _restoreOfflineSession(sessionData) { /* ... */ },
    async _validateOfflineSession() { /* ... */ },
    async _cacheUserCredentials(loginResult) { /* ... */ },
    _isNetworkError(error) { /* ... */ }
});
```

**Acceptance Criteria**:
- [ ] Patches native login without breaking it
- [ ] Falls back to offline auth when network error + offline
- [ ] Caches credentials on successful online login
- [ ] Validates session on reconnect

---

### T5: Update __manifest__.py Assets
**Priority**: P1 (High)
**Complexity**: 2/10
**File**: `__manifest__.py`

**Description**:
Update asset bundle to reflect file changes.

**Changes**:
```python
'assets': {
    'point_of_sale._assets_pos': [
        # KEEP
        'pdc_pos_offline/static/src/js/offline_db.js',
        'pdc_pos_offline/static/src/js/offline_auth.js',
        'pdc_pos_offline/static/src/js/session_persistence.js',
        'pdc_pos_offline/static/src/js/offline_login_popup.js',
        # NEW
        'pdc_pos_offline/static/src/js/pos_offline_login_patch.js',
        # KEEP (utility only)
        'pdc_pos_offline/static/src/js/connection_monitor.js',
        # REMOVE from bundle (or empty files)
        # 'pdc_pos_offline/static/src/js/pos_offline_patch.js',
        # 'pdc_pos_offline/static/src/xml/offline_indicator.xml',
    ],
}
```

**Acceptance Criteria**:
- [ ] Module installs without errors
- [ ] All required JS loads
- [ ] No 404 errors in console

---

### T6: Server - Add Offline Hash to Login Response
**Priority**: P1 (High)
**Complexity**: 3/10
**File**: `controllers/main.py`

**Description**:
Modify the authenticate endpoint to return the user's offline auth hash.

**Implementation**:
```python
from odoo import http
from odoo.http import request
from odoo.addons.web.controllers.session import Session

class PDCOfflineSession(Session):
    @http.route('/web/session/authenticate', type='json', auth="none")
    def authenticate(self, db, login, password, base_location=None):
        result = super().authenticate(db, login, password, base_location)

        if result.get('uid'):
            user = request.env['res.users'].sudo().browse(result['uid'])
            if user.pos_offline_auth_hash:
                result['offline_auth_hash'] = user.pos_offline_auth_hash

        return result
```

**Acceptance Criteria**:
- [ ] Login response includes `offline_auth_hash` field
- [ ] Hash matches user's stored hash
- [ ] No security vulnerabilities introduced

---

### T7: Integration Testing
**Priority**: P1 (High)
**Complexity**: 5/10

**Test Scenarios**:

1. **Online Login + Credential Caching**
   - Login with valid credentials while online
   - Verify credentials cached in IndexedDB
   - Verify `pos_offline_auth_hash` stored

2. **Offline Login Fallback**
   - Disconnect network
   - Attempt login
   - Verify offline popup appears
   - Verify password validated against cache
   - Verify session restored

3. **No Blocking UI**
   - Go offline while logged in
   - Verify NO blocking banner
   - Verify native navbar shows broken chain icon
   - Verify sales can continue

4. **Session Validation on Reconnect**
   - Login offline
   - Reconnect network
   - Verify session validated with server
   - Verify invalid session forces logout

**Acceptance Criteria**:
- [ ] All 4 scenarios pass
- [ ] Playwright E2E tests created
- [ ] Screenshots/videos captured

---

### T8: Documentation Update
**Priority**: P2 (Medium)
**Complexity**: 2/10

**Files to Update**:
- `README.md` - Update module description
- `CLAUDE.md` - Update with new architecture
- `docs/` - Add integration guide

**Content**:
- Explain that module EXTENDS native offline, not replaces
- Document the single capability: offline re-login
- Provide troubleshooting guide

**Acceptance Criteria**:
- [ ] README reflects new minimal scope
- [ ] Architecture diagrams updated
- [ ] No references to blocking UI

---

## Execution Order

```
T1 (Remove banner) ───┬─── T2 (Empty template) ───┐
                      │                           │
                      └───────────────────────────┼─── T5 (Update manifest)
                                                  │
T3 (Refactor monitor) ────────────────────────────┤
                                                  │
T4 (Create patch) ────────────────────────────────┤
                                                  │
T6 (Server hash) ─────────────────────────────────┤
                                                  │
                                                  └─── T7 (Testing) ─── T8 (Docs)
```

**Parallel Execution**:
- T1, T2, T3 can run in parallel (independent file changes)
- T4 depends on T3 (uses connection_monitor)
- T5 depends on T1, T2, T3, T4 (manifest reflects all changes)
- T6 is independent (server-side)
- T7 depends on T1-T6 (integration testing)
- T8 depends on T7 (document final state)
