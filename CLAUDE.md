# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Module Scope

**This module has ONE core purpose: Enable POS LOGIN when the Odoo server is offline.**

### What This Module DOES:
- Offline authentication using cached credentials in IndexedDB
- **SIMPLIFIED v2**: Uses same password as Odoo login (no separate PIN required)
- Session persistence that survives browser closure
- Connection monitoring to detect server unreachable state
- Automatic password hash caching on successful online login

### What This Module does NOT DO:
- Order synchronization (Odoo 19's built-in offline mode handles this)
- Payment processing offline (use Odoo's native capabilities)
- Inventory sync (not in scope)

### Security Design (Acceptable for Scope):
- Uses same Odoo login password for offline authentication
- Password hash (SHA-256 with user ID salt) cached automatically on online login
- No brute-force lockout on client (product decision - users can retry indefinitely)
- Server-side rate limiting: 5 password attempts per 60 seconds per user
- Sessions have NO timeout while offline (valid until server returns or user logs out)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     POS STORE (patched)                          │
│                    pos_offline_patch.js                          │
└─────────────────┬───────────────────────────────────┬───────────┘
                  │                                   │
    ┌─────────────▼─────────────┐     ┌──────────────▼──────────────┐
    │    SessionPersistence     │     │       SyncManager           │
    │  session_persistence.js   │     │     sync_manager.js         │
    └─────────────┬─────────────┘     └──────────────┬──────────────┘
                  │                                   │
    ┌─────────────▼─────────────────────────────────▼───────────────┐
    │                        OfflineDB                               │
    │                     offline_db.js (IndexedDB v3)               │
    │    [sessions] [users] [config] [transactions] [orders]         │
    │    [sync_errors]                                               │
    └───────────────────────────────────────────────────────────────┘
                                  │
    ┌─────────────────────────────▼─────────────────────────────────┐
    │                    ConnectionMonitor                           │
    │                 connection_monitor.js                          │
    │         (monitors network + server reachability)               │
    └───────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| OfflineDB | `static/src/js/offline_db.js` | IndexedDB wrapper (v3 schema) |
| ConnectionMonitor | `static/src/js/connection_monitor.js` | Server reachability checks |
| SessionPersistence | `static/src/js/session_persistence.js` | Session backup/restore |
| OfflineAuth | `static/src/js/offline_auth.js` | Password validation (SHA-256) |
| OfflineLoginPopup | `static/src/js/offline_login_popup.js` | OWL component for password auth |
| PosStore Patch | `static/src/js/pos_offline_patch.js` | Patches Odoo's PosStore |

### Backend Models

| Model | Fields Added |
|-------|--------------|
| res.users | `pos_offline_auth_hash` (SHA-256 password hash) |
| pos.session | `last_sync_date`, `offline_transactions_count` |
| pos.config | `enable_offline_mode`, `offline_sync_interval` |

### API Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `/pdc_pos_offline/validate_password` | jsonrpc, user | Validate password with rate limiting |
| `/pdc_pos_offline/get_offline_config` | jsonrpc, user | Get offline config settings |
| `/pdc_pos_offline/session_beacon` | http, user | Session heartbeat monitoring |

## Common Commands

### Running Tests

```bash
# Python unit tests (requires Odoo environment)
./odoo-bin -c /etc/odoo/pwh19.conf -d pwh19 --test-enable \
    --test-tags pdc_pos_offline -i pdc_pos_offline --stop-after-init

# Pytest (standalone, limited scope)
python3 -m pytest tests/test_backend.py -v

# Playwright E2E tests
npm install
npx playwright install chromium
npm test

# Single Playwright test file
npx playwright test tests/test_offline_e2e.spec.js --headed
```

### Deployment

```bash
# Deploy to production
sudo cp -r /home/epic/pdc-pos-offline/* /var/odoo/pwh19.iug.net/extra-addons/pdc_pos_offline/
sudo chown -R odoo:odoo /var/odoo/pwh19.iug.net/extra-addons/pdc_pos_offline/
sudo systemctl restart odona-pwh19.iug.net.service

# Check logs
sudo tail -f /var/odoo/pwh19.iug.net/logs/odoo-server.log
```

## Odoo 19 JavaScript Patterns

### Correct Import Paths

```javascript
// POS Store (Odoo 19)
import { PosStore } from "@point_of_sale/app/services/pos_store";

// Dialogs (replaces ErrorPopup, ConfirmPopup)
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

// Patching
import { patch } from "@web/core/utils/patch";

// Hooks
import { useService } from "@web/core/utils/hooks";
import { Component, useState } from "@odoo/owl";

// Translation
import { _t } from "@web/core/l10n/translation";
```

### Dialog Pattern (Odoo 19)

```javascript
// Instead of: this.showPopup('ErrorPopup', {...})
this.dialog.add(AlertDialog, {
    title: 'Error Title',
    body: 'Error message here',
});
```

### OWL Component Pattern

```javascript
export class OfflineLoginPopup extends Component {
    static template = "PDCPOSOffline.OfflineLoginPopup";
    static components = { Dialog };
    static props = { close: Function };

    setup() {
        this.state = useState({ /* state */ });
    }
}
```

## Development Notes

### Password Hash Caching (Automatic)

The offline password hash is captured automatically when a user logs in online:

1. User logs in to Odoo/POS with their regular password
2. `res.users._check_credentials()` override captures the password
3. SHA-256 hash is computed and stored in `pos_offline_auth_hash`
4. Hash is cached to IndexedDB when `cacheUsersForOffline()` runs
5. Offline login uses same SHA-256 hash for comparison

**No user setup required** - just log in once while online.

### Adding New IndexedDB Store

1. Increment `INDEXED_DB_VERSION` in `offline_db.js` (currently v3)
2. Add store creation in `onupgradeneeded` handler
3. Add CRUD methods following existing patterns

### Connection Events

```javascript
connectionMonitor.on('server-reachable', callback);   // Server back online
connectionMonitor.on('server-unreachable', callback); // Server went offline
connectionMonitor.on('connection-restored', callback); // Network restored
connectionMonitor.on('connection-lost', callback);     // Network lost
```

## Offline Access Flows

### Runtime Offline (Primary Use Case)
```
User opens POS → POS loads fully → Server goes down → Auto-transition to offline mode
```

1. ConnectionMonitor detects server unreachable
2. `server-unreachable` event fires
3. If valid session in IndexedDB → auto-restore and show banner
4. If no session → show OfflineLoginPopup for password auth

### Startup Offline (Requires Service Worker Cache)
```
Server already down → Open browser → Service Worker serves cached app → Offline login
```

**Note:** First visit while online is required to populate cache.

## Testing Offline Mode Manually

1. **Setup** (while online): Simply log in to POS - password hash is cached automatically
2. **Simulate offline**: Stop Odoo service or disconnect network
3. **Test login**: Open POS URL, enter username + regular password
4. **Test persistence**: Close/reopen browser tab - session should restore
5. **Test reconnection**: Restore service - "Back Online" notification should appear

## Related Documentation

- Parent CLAUDE.md: `/home/epic/CLAUDE.md` (deployment paths for all modules)
- Odoo 19 POS: `@point_of_sale/app/services/pos_store`
- Service Worker: Uses Odoo 19's native `/pos/service-worker.js`
