# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Module Scope

**This module has ONE core purpose: Enable POS LOGIN when the Odoo server is offline.**

### What This Module DOES:
- Offline PIN authentication using cached credentials in IndexedDB
- Session persistence that survives browser closure
- Connection monitoring to detect server unreachable state
- Prompt user to enter PIN when server is down

### What This Module does NOT DO:
- Order synchronization (Odoo 19's built-in offline mode handles this)
- Payment processing offline (use Odoo's native capabilities)
- Inventory sync (not in scope)

### Security Consideration (Acceptable):
The 4-digit PIN is only used locally during offline mode. It is acceptable because:
1. It only works when server is unreachable
2. Brute-force protection with 5-attempt lockout (15 min)
3. Session expires after 24 hours of inactivity
4. Online authentication still uses Odoo's standard auth

## Module Overview

PDC POS Offline (`pdc_pos_offline`) is an Odoo 19 module that enables Point of Sale terminals to LOGIN during internet outages. It provides:

- **Offline PIN authentication** using client-side IndexedDB and SHA-256 hashing
- **Session persistence** that survives browser closure and system restarts
- **Connection monitoring** with automatic online/offline mode switching
- **Brute-force protection** with lockout after failed attempts

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        POS STORE (patched)                       │
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
    │                     offline_db.js                              │
    │    [sessions] [users] [config] [transactions] [orders]         │
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
| OfflineDB | `static/src/js/offline_db.js` | IndexedDB wrapper with stores for sessions, users, config, transactions, orders |
| ConnectionMonitor | `static/src/js/connection_monitor.js` | Network status detection, server reachability checks |
| SyncManager | `static/src/js/sync_manager.js` | Background sync of offline transactions to server |
| SessionPersistence | `static/src/js/session_persistence.js` | Session backup/restore, auto-save on visibility change |
| OfflineAuth | `static/src/js/offline_auth.js` | PIN validation, brute-force protection (5 attempts, 15-min lockout) |
| OfflineLoginPopup | `static/src/js/offline_login_popup.js` | OWL component for offline PIN authentication |
| PosStore Patch | `static/src/js/pos_offline_patch.js` | Patches Odoo's PosStore for offline operation |

### Backend Models

| Model | File | Fields Added |
|-------|------|--------------|
| res.users | `models/res_users.py` | `pos_offline_pin`, `pos_offline_pin_hash` |
| pos.session | `models/pos_session.py` | `last_sync_date`, `offline_transactions_count` |
| pos.config | `models/pos_config.py` | `enable_offline_mode`, `offline_session_timeout`, `offline_sync_interval`, etc. |

## Common Commands

### Running Tests

```bash
# Run Python unit tests
python3 -m pytest tests/test_backend.py -v

# Run specific test case
python3 -m pytest tests/test_backend.py::TestPDCPOSOffline::test_01_pin_generation -v

# Run with coverage
python3 -m pytest tests/test_backend.py -v --cov=models --cov-report=html

# Run full test suite (requires jest, playwright)
./tests/run_all_tests.sh

# Run Odoo test framework
./odoo-bin -c odoo.conf -d pwh19 --test-enable --test-tags pdc_pos_offline -i pdc_pos_offline --stop-after-init
```

### Deployment

```bash
# Deploy to production (from dev environment)
sudo cp -r /home/epic/pdc-pos-offline/* /var/odoo/pwh19.iug.net/extra-addons/pdc_pos_offline/
sudo chown -R odoo:odoo /var/odoo/pwh19.iug.net/extra-addons/pdc_pos_offline/
sudo systemctl restart odona-pwh19.iug.net.service

# Check logs
sudo tail -f /var/odoo/pwh19.iug.net/logs/odoo-server.log
```

### Module Update

```bash
# Restart Odoo and update module
sudo systemctl restart odona-pwh19.iug.net.service

# In Odoo: Apps > Update Apps List > Search "pdc_pos_offline" > Upgrade
```

## Odoo 19 JavaScript Patterns

### Correct Import Paths

```javascript
// POS Store (Odoo 19 location)
import { PosStore } from "@point_of_sale/app/services/pos_store";

// Dialogs (replaces ErrorPopup, ConfirmPopup)
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { Dialog } from "@web/core/dialog/dialog";

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
// Use:
this.dialog.add(AlertDialog, {
    title: 'Error Title',
    body: 'Error message here',
});

// For confirmations:
this.dialog.add(ConfirmationDialog, {
    title: 'Confirm Action',
    body: 'Are you sure?',
    confirm: () => { /* confirmed */ },
    cancel: () => { /* cancelled */ },
});
```

### OWL Component Pattern

```javascript
export class OfflineLoginPopup extends Component {
    static template = "PDCPOSOffline.OfflineLoginPopup";
    static components = { Dialog };
    static props = {
        close: Function,
        // ...
    };

    setup() {
        this.state = useState({ /* state */ });
    }
}
```

## Data Flow

### Offline Order Creation
1. User creates order in offline mode
2. Order saved to IndexedDB `transactions` store with `synced: false`
3. SyncManager detects when online via ConnectionMonitor
4. Pending transactions synced to server via ORM
5. Successful sync: transaction deleted from IndexedDB
6. Failed sync: retry up to 5 times, then mark synced with error flag

### Offline Authentication
1. PIN entered → SHA-256 hash with user ID as salt
2. Hash compared against cached `pos_offline_pin_hash` in IndexedDB
3. On success: session created in IndexedDB, brute-force counter reset
4. On failure: counter incremented, lockout after 5 attempts (15 min)

## Known Limitations & Considerations

### Security Notes (Acceptable for Offline Login Use Case)

| Item | Status | Description |
|------|--------|-------------|
| PIN brute-force | MITIGATED | 5-attempt lockout, 15-min timeout, client-side only |
| Client-side lockout | ACCEPTABLE | Can be cleared, but only works offline anyway |
| PIN hash in IndexedDB | ACCEPTABLE | Only useful when server unreachable |
| Rate limiting | IMPLEMENTED | Server-side rate limiting on PIN validation endpoint |

### Data Integrity (Odoo 19 Handles Order Sync)

| Item | Status | Description |
|------|--------|-------------|
| Order sync | NOT IN SCOPE | Odoo 19's built-in offline mode handles this |
| Payment sync | NOT IN SCOPE | Use Odoo's native payment handling |
| Session beacon | FIXED | `/pdc_pos_offline/session_beacon` endpoint now exists |

### Fixed Issues (2025-01-30)

- FIXED: `/session_beacon` endpoint now exists
- FIXED: PIN validation has `@api.constrains` for 4-digit numeric validation
- FIXED: OfflineLoginPopup uses OfflineAuth with brute-force protection

## File Structure

```
pdc_pos_offline/
├── __manifest__.py           # Module definition, assets
├── __init__.py
├── controllers/
│   └── main.py               # RPC endpoints (/validate_pin, /get_offline_config)
├── models/
│   ├── __init__.py
│   ├── pos_config.py         # Offline settings
│   ├── pos_session.py        # Sync tracking fields
│   └── res_users.py          # PIN fields and hashing
├── security/
│   └── ir.model.access.csv   # Access control
├── static/src/
│   ├── css/
│   │   └── offline_pos.css   # Offline mode styles
│   ├── js/
│   │   ├── connection_monitor.js
│   │   ├── connection_monitor_service.js
│   │   ├── offline_auth.js
│   │   ├── offline_db.js
│   │   ├── offline_login_popup.js
│   │   ├── pos_offline_patch.js
│   │   ├── session_persistence.js
│   │   ├── sync_manager.js
│   │   └── user_pin_widget.js
│   └── xml/
│       ├── offline_config_templates.xml
│       ├── offline_login.xml
│       └── user_pin_widget.xml
├── tests/
│   ├── test_backend.py       # Python unit tests
│   ├── run_all_tests.sh      # Test runner script
│   └── test_data/            # JSON test fixtures
└── views/
    ├── pos_config_views.xml
    └── res_users_views.xml
```

## Testing Offline Login Scenarios

### Manual Testing Procedure

1. **Setup Phase** (while online):
   - Open POS with internet connection (caches data)
   - Navigate to Settings > Users, set 4-digit PIN for test user
   - Verify the POS opens normally and user data is cached

2. **Simulate Server Unreachable**:
   - Method A: Stop Odoo service (`sudo systemctl stop odona-pwh19.iug.net.service`)
   - Method B: Block network to server (e.g., `iptables` rule)
   - Method C: Disconnect from network entirely

3. **Test Offline Login**:
   - Close browser completely
   - Reopen browser, navigate to POS URL (https://pwh19.iug.net/pos/ui)
   - Observe: "Unable to connect to server" prompt should appear
   - Click "Use Offline Mode"
   - Enter username and 4-digit PIN
   - Verify: POS interface loads in offline mode

4. **Test Session Persistence**:
   - While in offline mode, close browser tab (not browser)
   - Reopen same URL
   - Session should restore automatically (no PIN prompt)

5. **Test Brute-Force Protection**:
   - Enter wrong PIN 5 times
   - Verify: Account locked for 15 minutes message appears
   - Verify: Cannot attempt login until lockout expires

6. **Test Reconnection**:
   - Restore network/start Odoo service
   - Observe: "Back Online" notification appears
   - Verify: Offline banner disappears

### Running Automated Tests

```bash
# Run offline login scenario tests
./odoo-bin -c /etc/odoo/pwh19.conf -d pwh19 --test-enable \
    --test-tags offline_login -i pdc_pos_offline --stop-after-init

# Run all pdc_pos_offline tests
./odoo-bin -c /etc/odoo/pwh19.conf -d pwh19 --test-enable \
    --test-tags pdc_pos_offline -i pdc_pos_offline --stop-after-init

# Run specific test class
./odoo-bin -c /etc/odoo/pwh19.conf -d pwh19 --test-enable \
    --test-tags pdc_pos_offline -i pdc_pos_offline --stop-after-init \
    --log-level=test
```

### Test Files

| File | Description |
|------|-------------|
| `tests/test_offline_login_scenarios.py` | Core offline login scenario tests |
| `tests/test_backend.py` | PIN generation, hashing, security tests |
| `tests/test_offline_auth.js` | JavaScript authentication tests (Jest) |

## Development Notes

### Adding New IndexedDB Store

1. Increment `INDEXED_DB_VERSION` in `offline_db.js`
2. Add store creation in `onupgradeneeded` handler
3. Add CRUD methods following existing patterns
4. Handle version migration for existing users

### Modifying Sync Logic

- All sync operations go through `SyncManager.addToSyncQueue(type, data)`
- Transaction types: `'order'`, `'payment'`, `'session_update'`
- Failed syncs logged to `this.syncErrors` (memory only - not persisted)

### Connection Events

```javascript
connectionMonitor.on('server-reachable', callback);   // Server back online
connectionMonitor.on('server-unreachable', callback); // Server went offline
connectionMonitor.on('connection-restored', callback); // Network restored
connectionMonitor.on('connection-lost', callback);     // Network lost
```

## Related Documentation

- Parent CLAUDE.md: `/home/epic/CLAUDE.md` (contains deployment paths for all modules)
- Odoo 19 POS JS Reference: Core POS is at `@point_of_sale/app/services/pos_store`
- IndexedDB: Uses vendor-prefixed fallbacks for legacy browser support
