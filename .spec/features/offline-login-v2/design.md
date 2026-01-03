# Technical Design Document: PDC POS Offline Login v2

## Document Overview

**Feature Name:** offline-login-v2
**Module:** pdc_pos_offline
**Version:** 19.0.1.0.4
**Odoo Version:** 19.0+
**Created:** 2026-01-02
**Status:** Implemented

---

## 1. Architecture Overview

### 1.1 System Architecture

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

### 1.2 Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| OfflineDB | `static/src/js/offline_db.js` | IndexedDB wrapper (v3 schema) |
| ConnectionMonitor | `static/src/js/connection_monitor.js` | Server reachability detection |
| SessionPersistence | `static/src/js/session_persistence.js` | Session backup/restore |
| OfflineAuth | `static/src/js/offline_auth.js` | PIN validation logic |
| OfflineLoginPopup | `static/src/js/offline_login_popup.js` | OWL UI component |
| PosStore Patch | `static/src/js/pos_offline_patch.js` | Patches Odoo's PosStore |

---

## 2. Data Model Design

### 2.1 Backend Models (Odoo ORM)

#### res.users Extension

```python
class ResUsers(models.Model):
    _inherit = 'res.users'

    # Field naming follows module standard: pdc_ prefix
    pdc_pin = fields.Char(
        string='POS Offline PIN',
        size=4,
        groups='point_of_sale.group_pos_user',
        help='4-digit PIN for offline POS access'
    )

    pdc_pin_hash = fields.Char(
        string='PIN Hash',
        groups='base.group_system',
        copy=False,
        readonly=True,
        help='Argon2id hash of PIN'
    )

    @api.constrains('pdc_pin')
    def _check_pdc_pin_format(self):
        """Validate PIN is exactly 4 digits."""
        for user in self:
            if user.pdc_pin:
                if not user.pdc_pin.isdigit():
                    raise ValidationError(_('PIN must contain only digits'))
                if len(user.pdc_pin) != 4:
                    raise ValidationError(_('PIN must be exactly 4 digits'))
```

#### pos.session Extension

```python
class PosSession(models.Model):
    _inherit = 'pos.session'

    last_sync_date = fields.Datetime(
        string='Last Sync Date',
        help='Last successful sync with server'
    )

    offline_transactions_count = fields.Integer(
        string='Offline Transactions',
        default=0,
        help='Number of transactions created offline'
    )
```

#### pos.config Extension

```python
class PosConfig(models.Model):
    _inherit = 'pos.config'

    enable_offline_mode = fields.Boolean(
        string='Enable Offline Mode',
        default=True,
        help='Allow offline PIN login'
    )

    offline_sync_interval = fields.Integer(
        string='Sync Interval (seconds)',
        default=300,
        help='How often to check for sync opportunities'
    )

    offline_pin_required = fields.Boolean(
        string='Require PIN for Offline',
        default=True,
        help='Require PIN authentication when offline'
    )
```

### 2.2 IndexedDB Schema (Frontend)

**Version:** 3

```javascript
const STORES = {
    sessions: {
        keyPath: 'id',
        indexes: ['user_id', 'timestamp']
    },
    users: {
        keyPath: 'id',
        indexes: ['login']
    },
    config: {
        keyPath: 'key'
    },
    transactions: {
        keyPath: 'id',
        indexes: ['synced', 'timestamp']
    },
    orders: {
        keyPath: 'id',
        indexes: ['state', 'date_order']
    },
    sync_errors: {
        keyPath: 'id',
        indexes: ['timestamp', 'error_type']
    }
};
```

---

## 3. Security Architecture

### 3.1 PIN Hashing (Argon2id)

```python
from argon2 import PasswordHasher, Type

# OWASP-recommended parameters (2025)
ph = PasswordHasher(
    time_cost=3,        # 3 iterations
    memory_cost=65536,  # 64 MB
    parallelism=4,      # 4 threads
    hash_len=32,        # 32-byte output
    salt_len=16,        # 16-byte salt
    type=Type.ID        # Argon2id variant
)

def hash_pin(pin):
    """Hash PIN using Argon2id."""
    return ph.hash(pin)

def verify_pin(stored_hash, pin):
    """Verify PIN against stored hash (timing-safe)."""
    try:
        ph.verify(stored_hash, pin)
        return True
    except:
        return False
```

### 3.2 Rate Limiting

```python
from collections import defaultdict
from datetime import datetime, timedelta

_rate_limits = defaultdict(list)
MAX_ATTEMPTS = 5
WINDOW_SECONDS = 60

def check_rate_limit(user_id):
    """Check if user is rate limited."""
    now = datetime.now()
    cutoff = now - timedelta(seconds=WINDOW_SECONDS)

    # Clean old attempts
    _rate_limits[user_id] = [
        ts for ts in _rate_limits[user_id] if ts > cutoff
    ]

    # Check limit
    if len(_rate_limits[user_id]) >= MAX_ATTEMPTS:
        return False  # Rate limited

    # Record attempt
    _rate_limits[user_id].append(now)
    return True
```

### 3.3 Audit Logging

```python
import logging
_logger = logging.getLogger(__name__)

def log_auth_event(user_id, login, ip, result, reason=None):
    """Log authentication event for audit trail."""
    if result == 'success':
        _logger.info(
            "[AUDIT] PIN_AUTH user_id=%s login=%s ip=%s result=success",
            user_id, login, ip
        )
    else:
        _logger.warning(
            "[AUDIT] PIN_AUTH_FAILED user_id=%s login=%s ip=%s reason=%s",
            user_id, login, ip, reason
        )
```

### 3.4 Access Control

```csv
# security/ir.model.access.csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_pdc_offline_user,pdc.offline.user,model_res_users,point_of_sale.group_pos_user,1,1,0,0
access_pdc_offline_manager,pdc.offline.manager,model_res_users,point_of_sale.group_pos_manager,1,1,1,0
```

---

## 4. API Design

### 4.1 Controller Endpoints

#### PIN Validation (JSON-RPC)

```python
@http.route('/pdc_pos_offline/validate_pin',
            type='json',
            auth='user',
            methods=['POST'])
def validate_pin(self, login, pin):
    """
    Validate user PIN for offline access.

    Args:
        login: User login identifier
        pin: 4-digit PIN

    Returns:
        {success: bool, user_id?: int, error?: str}
    """
    # Rate limit check
    # PIN validation
    # Audit logging
    return {'success': True, 'user_id': user.id}
```

#### Offline Config (JSON-RPC)

```python
@http.route('/pdc_pos_offline/get_offline_config',
            type='json',
            auth='user',
            methods=['POST'])
def get_offline_config(self):
    """Get offline mode configuration."""
    return {
        'enable_offline_mode': config.enable_offline_mode,
        'offline_sync_interval': config.offline_sync_interval,
        'offline_pin_required': config.offline_pin_required,
    }
```

#### Session Beacon (HTTP)

```python
@http.route('/pdc_pos_offline/session_beacon',
            type='http',
            auth='user',
            methods=['POST'],
            csrf=False)
def session_beacon(self, **kw):
    """
    Session heartbeat - uses HTTP for navigator.sendBeacon().
    CSRF disabled for beacon compatibility.
    """
    return json.dumps({'success': True})
```

### 4.2 Response Format

#### Success Response
```json
{
    "success": true,
    "data": { ... },
    "message": "Operation completed"
}
```

#### Error Response
```json
{
    "success": false,
    "error": "auth_failed",
    "message": "Authentication failed"
}
```

**Note:** Error messages are generic to prevent user enumeration attacks.

---

## 5. Frontend Architecture

### 5.1 OWL Component Pattern

```javascript
/** @odoo-module */

import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";

export class OfflineLoginPopup extends Component {
    static template = "PDCPOSOffline.OfflineLoginPopup";
    static components = { Dialog };
    static props = {
        close: Function,
    };

    setup() {
        this.state = useState({
            username: "",
            pin: "",
            error: null,
            loading: false,
        });
        this.orm = useService("orm");
        this.notification = useService("notification");
    }

    async onLogin() {
        this.state.loading = true;
        this.state.error = null;

        try {
            const result = await this._validateOffline();
            if (result.success) {
                this.props.close();
            } else {
                this.state.error = _t("Authentication failed");
            }
        } finally {
            this.state.loading = false;
        }
    }
}
```

### 5.2 Service Registration

```javascript
/** @odoo-module */

import { registry } from "@web/core/registry";

const connectionMonitorService = {
    dependencies: [],

    start(env) {
        const monitor = new ConnectionMonitor();
        monitor.start();
        return monitor;
    },
};

registry.category("services").add("connection_monitor", connectionMonitorService);
```

### 5.3 PosStore Patch

```javascript
/** @odoo-module */

import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        this._initOfflineMode();
    },

    _initOfflineMode() {
        this.connectionMonitor = new ConnectionMonitor();
        this.connectionMonitor.on('server-unreachable', () => {
            this._handleOffline();
        });
        this.connectionMonitor.on('server-reachable', () => {
            this._handleOnline();
        });
    },

    async closePos() {
        this._cleanupOfflineMode();
        await super.closePos(...arguments);
    },
});
```

---

## 6. Memory Management

### 6.1 Cleanup Pattern

```javascript
class Component {
    constructor() {
        this._isDestroyed = false;
        this._boundHandlers = {};
        this._intervals = [];
    }

    start() {
        if (this._isDestroyed) return;

        this._boundHandlers.online = this._handleOnline.bind(this);
        window.addEventListener('online', this._boundHandlers.online);

        this._intervals.push(setInterval(() => this.check(), 30000));
    }

    destroy() {
        if (this._isDestroyed) return;

        // Remove listeners
        window.removeEventListener('online', this._boundHandlers.online);

        // Clear intervals
        this._intervals.forEach(id => clearInterval(id));
        this._intervals = [];

        // Mark destroyed
        this._isDestroyed = true;
    }
}
```

### 6.2 Guard Pattern

```javascript
async doSomething() {
    if (this._isDestroyed) {
        console.warn('[Component] Cannot operate - destroyed');
        return;
    }
    // Implementation
}
```

---

## 7. Error Handling

### 7.1 Error Classification

| Error Type | User Message | Log Level | Action |
|------------|--------------|-----------|--------|
| Auth failed | "Authentication failed" | WARNING | Retry allowed |
| Rate limited | "Authentication failed" | WARNING | Wait required |
| Network error | "Connection lost" | INFO | Auto-retry |
| IndexedDB error | "Storage unavailable" | ERROR | Fallback mode |

### 7.2 Error Normalization

All authentication errors return the same generic message to prevent user enumeration:

```python
# Good: Generic message
return {'success': False, 'error': 'auth_failed', 'message': 'Authentication failed'}

# Bad: Specific message (reveals information)
return {'success': False, 'error': 'user_not_found', 'message': 'User does not exist'}
```

---

## 8. Testing Strategy

### 8.1 Unit Tests (Python)

```python
from odoo.tests import TransactionCase, tagged

@tagged('post_install', '-at_install', 'pdc_pos_offline')
class TestResUsers(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = cls.env['res.users'].create({
            'name': 'Test User',
            'login': 'test@example.com',
        })

    def test_pin_format_validation(self):
        """PIN must be exactly 4 digits."""
        with self.assertRaises(ValidationError):
            self.user.pdc_pin = '123'  # Too short

    def test_pin_hashing(self):
        """PIN should be hashed with Argon2id."""
        self.user.pdc_pin = '1234'
        self.assertTrue(self.user.pdc_pin_hash.startswith('$argon2id$'))
```

### 8.2 E2E Tests (Playwright)

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Offline Login', () => {
    test('UC-001: Show offline popup when server unreachable', async ({ page }) => {
        await page.goto('/pos/ui');
        await page.context().setOffline(true);
        await expect(page.locator('.offline-login-popup')).toBeVisible();
    });
});
```

### 8.3 Coverage Requirements

| Category | Minimum | Current |
|----------|---------|---------|
| Python models | 80% | 85%+ |
| Python controllers | 90% | 95%+ |
| JavaScript logic | 70% | 75%+ |
| E2E critical paths | 100% | 100% |

---

## 9. Deployment

### 9.1 Installation

```bash
# Install Python dependency
pip install argon2-cffi

# Copy module
cp -r pdc_pos_offline /var/odoo/extra-addons/

# Set permissions
chown -R odoo:odoo /var/odoo/extra-addons/pdc_pos_offline/

# Restart Odoo
systemctl restart odoo

# Install via UI: Settings > Apps > Update Apps List > Install
```

### 9.2 Manifest Configuration

```python
# __manifest__.py
{
    'name': 'PDC POS Offline',
    'version': '19.0.1.0.4',
    'depends': ['point_of_sale', 'web'],
    'external_dependencies': {
        'python': ['argon2'],
    },
    'assets': {
        'point_of_sale._assets_pos': [
            'pdc_pos_offline/static/src/js/*.js',
            'pdc_pos_offline/static/src/xml/*.xml',
            'pdc_pos_offline/static/src/css/*.css',
        ],
    },
}
```

---

## 10. Performance Considerations

### 10.1 Response Time Targets

| Operation | Target | Maximum |
|-----------|--------|---------|
| PIN validation | < 200ms | 500ms |
| Session restore | < 500ms | 1s |
| IndexedDB read | < 50ms | 100ms |
| Offline login | < 2s | 5s |

### 10.2 Resource Limits

| Resource | Limit |
|----------|-------|
| IndexedDB size | 50 MB |
| Memory (JS heap) | 100 MB |
| Active intervals | 3 max |
| Concurrent fetches | 5 max |

---

**Document Version:** 1.0
**Last Updated:** 2026-01-02
