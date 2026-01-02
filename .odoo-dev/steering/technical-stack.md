# Technical Stack Document - PDC POS Offline

## Document Overview

**Module Name:** pdc_pos_offline
**Version:** 19.0.1.0.4
**Odoo Version:** 19.0+
**Last Updated:** 2026-01-02

---

## 1. Technology Stack

### 1.1 Backend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.12+ | Server-side logic |
| Odoo | 19.0+ | ERP framework |
| PostgreSQL | 15+ | Database |
| argon2-cffi | 23.1+ | Password hashing |

### 1.2 Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| OWL | 2.0 | Component framework |
| JavaScript | ES2022+ | Client-side logic |
| IndexedDB | v3 | Offline storage |
| CSS3 | - | Styling |

### 1.3 Development Tools

| Tool | Purpose |
|------|---------|
| Playwright | E2E testing |
| pytest-odoo | Unit testing |
| ESLint | JavaScript linting |
| Black | Python formatting |

---

## 2. Odoo 19 Development Patterns

### 2.1 Module Structure

```
pdc_pos_offline/
├── __init__.py
├── __manifest__.py
├── controllers/
│   ├── __init__.py
│   └── main.py              # HTTP endpoints
├── models/
│   ├── __init__.py
│   ├── res_users.py         # User model extension
│   └── pos_session.py       # Session model extension
├── security/
│   └── ir.model.access.csv  # Access rights
├── views/
│   ├── res_users_views.xml  # User form extension
│   └── pos_config_views.xml # POS config extension
├── data/
│   └── pos_offline_data.xml # Default data
├── static/
│   └── src/
│       ├── js/              # JavaScript modules
│       ├── xml/             # OWL templates
│       └── css/             # Styles
└── tests/
    ├── test_backend.py      # Python tests
    └── test_offline_e2e.spec.js  # Playwright tests
```

### 2.2 Asset Declaration (Odoo 19)

```python
# __manifest__.py
'assets': {
    'point_of_sale._assets_pos': [
        'module/static/src/js/*.js',
        'module/static/src/xml/*.xml',
        'module/static/src/css/*.css',
    ],
    'web.assets_backend': [
        'module/static/src/js/backend_widget.js',
    ],
}
```

### 2.3 Import Patterns (Odoo 19)

```javascript
// Correct Odoo 19 imports
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";
import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
```

---

## 3. API Design Guidelines

### 3.1 Controller Endpoints

#### Pattern: JSON-RPC Endpoint
```python
from odoo import http
from odoo.http import request

class PDCPOSOfflineController(http.Controller):

    @http.route('/pdc_pos_offline/validate_pin',
                type='json',
                auth='user',
                methods=['POST'])
    def validate_pin(self, login, pin):
        """Validate user PIN for offline access."""
        # Implementation
        return {'success': True, 'user_id': user.id}
```

#### Pattern: HTTP Endpoint (for beacons)
```python
@http.route('/pdc_pos_offline/session_beacon',
            type='http',
            auth='user',
            methods=['POST'],
            csrf=False)
def session_beacon(self, **kw):
    """Session heartbeat - uses HTTP for navigator.sendBeacon()."""
    return json.dumps({'success': True})
```

### 3.2 Response Standards

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
    "error": "error_code",
    "message": "User-friendly message"
}
```

### 3.3 Error Codes

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| `auth_failed` | Authentication failed | 200 (JSON-RPC) |
| `not_found` | Resource not found | 200 (JSON-RPC) |
| `validation_error` | Invalid input | 200 (JSON-RPC) |
| `server_error` | Internal error | 200 (JSON-RPC) |

---

## 4. Database Design Standards

### 4.1 Model Extension Pattern

```python
from odoo import models, fields, api

class ResUsers(models.Model):
    _inherit = 'res.users'

    # New fields
    pdc_pin = fields.Char(
        string='POS Offline PIN',
        size=4,
        groups='point_of_sale.group_pos_user'
    )
    pdc_pin_hash = fields.Char(
        string='PIN Hash',
        groups='base.group_system'
    )

    @api.constrains('pdc_pin')
    def _check_pin_format(self):
        """Validate PIN format."""
        # Implementation
```

### 4.2 Naming Conventions

| Entity | Convention | Example |
|--------|------------|---------|
| Fields | `pdc_` prefix | `pdc_pin`, `pdc_pin_hash` |
| Methods | `pdc_` prefix for public | `pdc_validate_pin()` |
| Helpers | `_` prefix | `_hash_pin()` |

### 4.3 IndexedDB Schema (v3)

```javascript
const STORES = {
    sessions: { keyPath: 'id', indexes: ['user_id', 'timestamp'] },
    users: { keyPath: 'id', indexes: ['login'] },
    config: { keyPath: 'key' },
    transactions: { keyPath: 'id', indexes: ['synced', 'timestamp'] },
    orders: { keyPath: 'id', indexes: ['state', 'date_order'] },
    sync_errors: { keyPath: 'id', indexes: ['timestamp', 'error_type'] }
};
```

---

## 5. Security Implementation

### 5.1 Password Hashing (Argon2id)

```python
from argon2 import PasswordHasher, Type

# OWASP-recommended parameters
ph = PasswordHasher(
    time_cost=3,        # 3 iterations
    memory_cost=65536,  # 64 MB
    parallelism=4,      # 4 threads
    hash_len=32,        # 32-byte output
    salt_len=16,        # 16-byte salt
    type=Type.ID        # Argon2id variant
)

# Hash
hash = ph.hash(pin)

# Verify (timing-safe)
ph.verify(stored_hash, pin)
```

### 5.2 Rate Limiting Pattern

```python
from collections import defaultdict
from datetime import datetime, timedelta

_rate_limits = defaultdict(list)
MAX_ATTEMPTS = 5
WINDOW_SECONDS = 60

def check_rate_limit(user_id):
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

### 5.3 Audit Logging Pattern

```python
import logging
_logger = logging.getLogger(__name__)

# Audit log format
_logger.info(
    "[AUDIT] PIN_AUTH user_id=%s login=%s ip=%s result=%s",
    user_id, login, ip_address, "success"
)

_logger.warning(
    "[AUDIT] PIN_AUTH_FAILED user_id=%s login=%s ip=%s reason=%s",
    user_id, login, ip_address, "invalid_pin"
)
```

---

## 6. OWL Component Patterns

### 6.1 Component Structure

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
        // Implementation
    }
}
```

### 6.2 Dialog Pattern (Odoo 19)

```javascript
// Show dialog
this.dialog.add(AlertDialog, {
    title: _t("Error"),
    body: _t("Authentication failed"),
});

// Confirm dialog
const confirmed = await this.dialog.add(ConfirmationDialog, {
    title: _t("Confirm"),
    body: _t("Are you sure?"),
});
```

### 6.3 Service Pattern

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

---

## 7. Memory Management

### 7.1 Cleanup Pattern

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

### 7.2 Guard Pattern

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

## 8. Testing Standards

### 8.1 Python Unit Tests

```python
from odoo.tests import TransactionCase

class TestResUsers(TransactionCase):

    def setUp(self):
        super().setUp()
        self.user = self.env['res.users'].create({
            'name': 'Test User',
            'login': 'test_user',
        })

    def test_pin_validation(self):
        """Test PIN validation logic."""
        self.user.pdc_pin = '1234'
        self.assertTrue(self.user.pdc_validate_pin('1234'))
        self.assertFalse(self.user.pdc_validate_pin('0000'))
```

### 8.2 Playwright E2E Tests

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Offline Login', () => {
    test('should show offline popup when server unreachable', async ({ page }) => {
        await page.goto('/pos/ui');
        await page.context().setOffline(true);

        await expect(page.locator('.offline-login-popup')).toBeVisible();
    });
});
```

### 8.3 Test Coverage Requirements

| Category | Minimum Coverage |
|----------|-----------------|
| Python models | 80% |
| Python controllers | 90% |
| JavaScript logic | 70% |
| E2E critical paths | 100% |

---

## 9. Performance Guidelines

### 9.1 Response Time Targets

| Operation | Target | Maximum |
|-----------|--------|---------|
| PIN validation | < 200ms | 500ms |
| Session restore | < 500ms | 1s |
| IndexedDB read | < 50ms | 100ms |
| Offline login | < 2s | 5s |

### 9.2 Resource Limits

| Resource | Limit |
|----------|-------|
| IndexedDB size | 50 MB |
| Memory (JS heap) | 100 MB |
| Active intervals | 3 max |
| Concurrent fetches | 5 max |

---

## 10. Deployment Guidelines

### 10.1 Installation Steps

```bash
# 1. Install Python dependency
pip install argon2-cffi

# 2. Copy module
cp -r pdc_pos_offline /var/odoo/extra-addons/

# 3. Set permissions
chown -R odoo:odoo /var/odoo/extra-addons/pdc_pos_offline/

# 4. Restart Odoo
systemctl restart odoo

# 5. Update module list and install
# Via UI: Settings > Apps > Update Apps List > Install
```

### 10.2 Configuration

```xml
<!-- pos_offline_data.xml -->
<record id="pos_config_offline_default" model="pos.config">
    <field name="enable_offline_mode">True</field>
    <field name="offline_sync_interval">300</field>
    <field name="offline_pin_required">True</field>
</record>
```

---

**Document Status:** Approved
**Review Cycle:** Quarterly
**Next Review:** 2026-04-01
