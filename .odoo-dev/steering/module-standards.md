# Module Development Standards - PDC POS Offline

## Document Overview

**Module Name:** pdc_pos_offline
**Version:** 19.0.1.0.4
**Odoo Version:** 19.0+
**Last Updated:** 2026-01-02

---

## 1. Module Structure Standards

### 1.1 Directory Layout

```
pdc_pos_offline/
├── __init__.py              # Package init (import models, controllers)
├── __manifest__.py          # Module manifest
├── CLAUDE.md                # AI assistant instructions
├── README.md                # User documentation
│
├── controllers/
│   ├── __init__.py
│   └── main.py              # HTTP/JSON-RPC endpoints
│
├── models/
│   ├── __init__.py
│   ├── res_users.py         # User model extension
│   ├── pos_session.py       # Session model extension
│   └── pos_config.py        # Config model extension
│
├── security/
│   └── ir.model.access.csv  # Access control list
│
├── views/
│   ├── res_users_views.xml  # User form views
│   └── pos_config_views.xml # POS config views
│
├── data/
│   └── pos_offline_data.xml # Default/demo data
│
├── static/
│   └── src/
│       ├── js/              # JavaScript modules
│       ├── xml/             # OWL templates
│       └── css/             # Stylesheets
│
├── tests/
│   ├── __init__.py
│   ├── test_backend.py      # Python unit tests
│   └── test_offline_e2e.spec.js  # Playwright E2E tests
│
└── i18n/
    └── *.po                 # Translation files
```

### 1.2 File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Python models | `{model_name}.py` | `res_users.py` |
| Python controllers | `main.py` or `{feature}.py` | `main.py` |
| JavaScript | `{feature}_{type}.js` | `offline_auth.js` |
| OWL templates | `{feature}.xml` | `offline_login.xml` |
| CSS | `{feature}_{scope}.css` | `offline_pos.css` |
| Tests | `test_{feature}.py/.js` | `test_backend.py` |

---

## 2. Model Development Standards

### 2.1 Model Extension Pattern

```python
# models/res_users.py
from odoo import models, fields, api, _
from odoo.exceptions import ValidationError

class ResUsers(models.Model):
    _inherit = 'res.users'

    # Field naming: module_prefix + descriptive_name
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
        readonly=True
    )

    # API decorator order: constrains > depends > model_create_multi > onchange
    @api.constrains('pdc_pin')
    def _check_pdc_pin_format(self):
        """Validate PIN is exactly 4 digits."""
        for user in self:
            if user.pdc_pin and not user.pdc_pin.isdigit():
                raise ValidationError(_('PIN must contain only digits'))
            if user.pdc_pin and len(user.pdc_pin) != 4:
                raise ValidationError(_('PIN must be exactly 4 digits'))

    # Public methods: pdc_ prefix
    def pdc_validate_pin(self, pin):
        """Validate PIN against stored hash."""
        self.ensure_one()
        # Implementation

    # Private methods: _ prefix
    def _pdc_hash_pin(self, pin):
        """Hash PIN using Argon2id."""
        # Implementation
```

### 2.2 Model Inheritance Rules

| Type | When to Use | Example |
|------|-------------|---------|
| `_inherit` (extension) | Add fields/methods to existing model | `_inherit = 'res.users'` |
| `_inherits` (delegation) | Create new model with parent's fields | Rarely used |
| `_name` + `_inherit` | Create abstract mixin | `_name = 'pdc.mixin'` |

### 2.3 Field Standards

```python
# Required attributes for all fields
field_name = fields.Type(
    string='Human Label',           # Always provide
    help='Tooltip description',     # Always provide
    groups='group.xml_id',          # Security group if restricted
)

# Computed fields
field_computed = fields.Type(
    string='Label',
    compute='_compute_field_name',
    store=True,                     # Store if frequently searched
    readonly=True,
)

@api.depends('dependency_field')
def _compute_field_name(self):
    for record in self:
        record.field_computed = # computation
```

---

## 3. View Development Standards

### 3.1 View Extension Pattern

```xml
<!-- views/res_users_views.xml -->
<odoo>
    <!-- Extend existing form view -->
    <record id="view_users_form_pdc_offline" model="ir.ui.view">
        <field name="name">res.users.form.pdc.offline</field>
        <field name="model">res.users</field>
        <field name="inherit_id" ref="base.view_users_form"/>
        <field name="priority">20</field>
        <field name="arch" type="xml">
            <!-- Use xpath to locate insertion point -->
            <xpath expr="//page[@name='preferences']" position="after">
                <page string="POS Offline" name="pdc_pos_offline">
                    <group>
                        <field name="pdc_pin" password="True"/>
                    </group>
                </page>
            </xpath>
        </field>
    </record>
</odoo>
```

### 3.2 XPath Best Practices

| Selector | Use Case | Example |
|----------|----------|---------|
| `//field[@name='x']` | After specific field | Most common |
| `//page[@name='x']` | Tab/page location | Grouping related fields |
| `//group[@name='x']` | Named group | Semantic grouping |
| `//div[@class='x']` | Avoid if possible | Fragile to CSS changes |

### 3.3 View Naming Convention

```
{model}_{view_type}_{module}_{feature}

Examples:
- res_users_form_pdc_offline
- pos_config_form_pdc_settings
```

---

## 4. JavaScript Development Standards

### 4.1 Module Declaration

```javascript
/** @odoo-module */

/**
 * OfflineAuth - Handles offline PIN authentication
 *
 * @module pdc_pos_offline/offline_auth
 * @description Validates user PINs against cached hashes in IndexedDB
 */

import { Component } from "@odoo/owl";
// imports...

export class OfflineAuth {
    // implementation
}
```

### 4.2 Class Structure

```javascript
export class ClassName {
    // 1. Static properties
    static template = "Module.TemplateName";
    static components = { Child };
    static props = { prop: Type };

    // 2. Constructor
    constructor() {
        this._isDestroyed = false;
        this._boundHandlers = {};
    }

    // 3. Lifecycle methods
    setup() { }
    willStart() { }
    mounted() { }
    willUnmount() { }

    // 4. Public methods (camelCase)
    async validatePin(pin) { }

    // 5. Private methods (_camelCase)
    _hashPin(pin) { }

    // 6. Event handlers (onEventName)
    onSubmit() { }

    // 7. Cleanup
    destroy() { }
}
```

### 4.3 Error Handling Pattern

```javascript
async doOperation() {
    try {
        const result = await this.orm.call('model', 'method', [args]);
        return { success: true, data: result };
    } catch (error) {
        console.error('[PDC-Offline] Operation failed:', error);
        this.notification.add(_t("Operation failed"), { type: "danger" });
        return { success: false, error: error.message };
    }
}
```

---

## 5. Security Standards

### 5.1 Access Control (ir.model.access.csv)

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_pdc_offline_user,pdc.offline.user,model_res_users,point_of_sale.group_pos_user,1,1,0,0
access_pdc_offline_manager,pdc.offline.manager,model_res_users,point_of_sale.group_pos_manager,1,1,1,0
```

### 5.2 Field-Level Security

```python
# Restrict field access to security groups
pdc_pin_hash = fields.Char(
    groups='base.group_system'  # Only system admins
)

pdc_pin = fields.Char(
    groups='point_of_sale.group_pos_user'  # POS users
)
```

### 5.3 Controller Security

```python
@http.route('/path', type='json', auth='user')  # Requires login
@http.route('/path', type='json', auth='public')  # No login required
@http.route('/path', type='http', auth='user', csrf=False)  # Disable CSRF for beacons
```

---

## 6. Testing Standards

### 6.1 Python Test Structure

```python
# tests/test_backend.py
from odoo.tests import TransactionCase, tagged

@tagged('post_install', '-at_install', 'pdc_pos_offline')
class TestResUsers(TransactionCase):

    @classmethod
    def setUpClass(cls):
        """Set up test fixtures."""
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

### 6.2 Playwright Test Structure

```javascript
// tests/test_offline_e2e.spec.js
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.ODOO_URL || 'http://localhost:8069';

test.describe('Offline Login', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`${BASE_URL}/pos/ui`);
    });

    test('UC-001: Show offline popup when server unreachable', async ({ page }) => {
        // Simulate offline
        await page.context().setOffline(true);

        // Verify popup appears
        await expect(page.locator('.offline-login-popup')).toBeVisible();
    });
});
```

### 6.3 Test Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Unit test | `test_{what}_{expected}` | `test_pin_format_rejects_letters` |
| Integration | `test_{scenario}` | `test_offline_login_flow` |
| E2E | `{UC/EC/SEC}-XXX: {description}` | `UC-001: Show offline popup` |

---

## 7. Documentation Standards

### 7.1 Python Docstrings

```python
def pdc_validate_pin(self, pin):
    """
    Validate user PIN against stored hash.

    Uses Argon2id for timing-safe comparison. Rate limiting
    is handled at the controller level, not here.

    Args:
        pin (str): 4-digit PIN entered by user

    Returns:
        bool: True if PIN matches, False otherwise

    Raises:
        ValueError: If PIN format is invalid

    Example:
        >>> user.pdc_validate_pin('1234')
        True
    """
```

### 7.2 JavaScript JSDoc

```javascript
/**
 * Validate PIN against cached hash in IndexedDB.
 *
 * @param {string} username - User login
 * @param {string} pin - 4-digit PIN
 * @returns {Promise<{success: boolean, user_id?: number, error?: string}>}
 * @throws {Error} If IndexedDB is unavailable
 *
 * @example
 * const result = await offlineAuth.validatePin('admin', '1234');
 * if (result.success) {
 *     console.log('Authenticated:', result.user_id);
 * }
 */
async validatePin(username, pin) {
```

### 7.3 CLAUDE.md Structure

```markdown
# CLAUDE.md

## Module Scope
[Single purpose statement]

## Architecture
[Component diagram]

## Common Commands
[How to test, deploy]

## Odoo Patterns
[Correct imports, patterns]

## Development Notes
[Special considerations]
```

---

## 8. Version Control Standards

### 8.1 Commit Message Format

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

**Example:**
```
feat(auth): add PIN complexity validation

- Block 27 common weak PINs (0000, 1234, etc.)
- Add @api.constrains decorator for validation
- Update error messages for user guidance

Closes #123
```

### 8.2 Branch Naming

```
{type}/{ticket}-{description}

Examples:
- feature/POS-123-offline-login
- bugfix/POS-456-pin-validation
- hotfix/POS-789-security-patch
```

### 8.3 Version Numbering

```
{odoo_version}.{major}.{minor}.{patch}

Example: 19.0.1.0.4
         │   │ │ └── Patch (bug fixes)
         │   │ └──── Minor (backwards-compatible features)
         │   └────── Major (breaking changes)
         └────────── Odoo version
```

---

## 9. Code Quality Standards

### 9.1 Python Style

- Follow PEP 8
- Max line length: 100 characters
- Use Black formatter
- Use isort for imports

### 9.2 JavaScript Style

- Use ESLint with Odoo config
- Max line length: 100 characters
- Use Prettier for formatting
- Prefer `const` over `let`

### 9.3 Code Review Checklist

- [ ] Follows naming conventions
- [ ] Has appropriate docstrings/comments
- [ ] Includes unit tests
- [ ] No security vulnerabilities
- [ ] No memory leaks
- [ ] Error handling complete
- [ ] Translations marked with `_t()`

---

## 10. Deployment Checklist

### 10.1 Pre-Deployment

- [ ] All tests pass (unit + E2E)
- [ ] Version number updated in manifest
- [ ] CHANGELOG updated
- [ ] Documentation updated
- [ ] Security review completed

### 10.2 Deployment Steps

```bash
# 1. Backup current module
cp -r /var/odoo/extra-addons/pdc_pos_offline /backup/

# 2. Deploy new version
cp -r ./pdc_pos_offline /var/odoo/extra-addons/

# 3. Set permissions
chown -R odoo:odoo /var/odoo/extra-addons/pdc_pos_offline/

# 4. Restart Odoo
systemctl restart odoo

# 5. Upgrade module
# Via UI or: odoo-bin -u pdc_pos_offline -d database
```

### 10.3 Post-Deployment

- [ ] Verify module installed/upgraded
- [ ] Test critical paths manually
- [ ] Monitor logs for errors
- [ ] Verify performance metrics

---

**Document Status:** Approved
**Review Cycle:** Quarterly
**Next Review:** 2026-04-01
