# Odoo 19 Compliance Contract

> **MANDATORY**: All generated, reviewed, and refactored code MUST comply with Odoo 19 standards.
> Violations will FAIL code review and must be corrected before merge.

---

## Quick Reference Table

| Legacy/Deprecated | Odoo 19 Replacement | Auto-Fix |
|-------------------|---------------------|----------|
| `from odoo.osv import ...` | `from odoo import models, fields, api` | Yes |
| `record._cr` / `self._cr` | `record.env.cr` / `self.env.cr` | Yes |
| `record._uid` / `self._uid` | `record.env.uid` / `self.env.uid` | Yes |
| `record._context` / `self._context` | `record.env.context` / `self.env.context` | Yes |
| `read_group(...)` | `_read_group(...)` or `formatted_read_group(...)` | Yes |
| `search_fetch(...)` | `_search(...)` | Yes |
| `@api.multi` | Remove decorator (default behavior) | Yes |
| `@api.one` | Iterate in method body | Yes |
| `self.pool.get('model')` | `self.env['model']` | Yes |
| `odoo.define(...)` | ES module + `/** @odoo-module **/` | Manual |
| `require('web.Widget')` | `import { Component } from "@odoo/owl"` | Manual |
| `hasclass('classname')` | `contains(@class, 'classname')` | Yes |

---

## 1. Hard-Ban List (MUST FAIL Review)

These patterns are **FORBIDDEN** in any generated or refactored code:

### 1.1 Python Imports

```regex
# BANNED: Old OSV imports
from odoo\.osv\b
from openerp\b
```

### 1.2 Direct Environment Internals

```regex
# BANNED: Direct access to internal attributes
\._cr\b
\._uid\b
\._context\b
```

### 1.3 Deprecated ORM Methods

```regex
# BANNED: Deprecated methods
\bread_group\s*\(
\bsearch_fetch\s*\(
\.pool\.get\s*\(
\.pool\s*\[
```

### 1.4 Deprecated API Decorators

```regex
# BANNED: Old decorators
@api\.multi\b
@api\.one\b
```

### 1.5 Legacy JavaScript

```regex
# BANNED: Legacy JS patterns
odoo\.define\s*\(
require\s*\(['"]web\.
require\s*\(['"]point_of_sale\.
\.extend\s*\(\{
\$\(.*\)\.on\(
\$\(.*\)\.click\(
```

### 1.6 Broken XPath

```regex
# BANNED: hasclass() removed in Odoo 19
hasclass\s*\(
```

---

## 2. Auto-Fix Mappings

When violations are found, apply these transformations:

### 2.1 Python Fixes

```python
# Fix: from odoo.osv import ...
# Before:
from odoo.osv import fields, osv
# After:
from odoo import models, fields, api

# Fix: self._cr → self.env.cr
# Before:
self._cr.execute("SELECT...")
record._cr.fetchall()
# After:
self.env.cr.execute("SELECT...")  # Still avoid raw SQL!
record.env.cr.fetchall()

# Fix: self._uid → self.env.uid
# Before:
user_id = self._uid
# After:
user_id = self.env.uid

# Fix: self._context → self.env.context
# Before:
ctx = self._context or {}
# After:
ctx = self.env.context

# Fix: read_group → _read_group
# Before:
result = self.env['model'].read_group(domain, fields, groupby)
# After:
result = self.env['model']._read_group(domain, groupby, aggregates)
# OR for formatted output:
result = self.env['model'].formatted_read_group(domain, groupby, aggregates)

# Fix: search_fetch → _search
# Before:
ids = self.env['model'].search_fetch(domain, fields)
# After:
ids = self.env['model']._search(domain)
records = self.env['model'].browse(ids)

# Fix: @api.multi / @api.one
# Before:
@api.multi
def my_method(self):
    pass
# After:
def my_method(self):
    for record in self:
        pass

# Fix: self.pool.get()
# Before:
partner_obj = self.pool.get('res.partner')
# After:
partner_obj = self.env['res.partner']
```

### 2.2 JavaScript Fixes

```javascript
// Fix: odoo.define → ES module
// Before:
odoo.define('my_module.MyWidget', function (require) {
    var Widget = require('web.Widget');
    var MyWidget = Widget.extend({...});
    return MyWidget;
});

// After:
/** @odoo-module */
import { Component } from "@odoo/owl";

export class MyWidget extends Component {
    static template = "my_module.MyWidget";
}
```

### 2.3 XML Fixes

```xml
<!-- Fix: hasclass → contains -->
<!-- Before: -->
<xpath expr="//div[hasclass('o_form_sheet')]" position="inside">

<!-- After: -->
<xpath expr="//div[contains(@class, 'o_form_sheet')]" position="inside">
```

---

## 3. Preferred Patterns (MUST USE)

### 3.1 Python ORM

```python
# Environment access (REQUIRED)
self.env.cr      # Database cursor
self.env.uid     # Current user ID
self.env.user    # Current user record
self.env.context # Current context
self.env.company # Current company

# Context modification (REQUIRED)
self.with_context(key=value)
self.with_user(user_id)
self.with_company(company_id)

# Recordset operations (PREFERRED)
records.mapped('field_name')
records.filtered(lambda r: r.field > 0)
records.sorted('field_name')

# Grouping (REQUIRED - Odoo 19)
result = self.env['model']._read_group(
    domain=[('field', '=', value)],
    groupby=['category_id'],
    aggregates=['amount:sum', 'qty:avg']
)
```

### 3.2 JavaScript OWL

```javascript
/** @odoo-module */

import { Component, useState, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";

// Component definition (REQUIRED)
export class MyComponent extends Component {
    static template = "my_module.MyComponent";
    static props = {
        recordId: { type: Number, optional: true },
    };

    setup() {
        this.state = useState({ loading: false });
        this.orm = useService("orm");
        this.notification = useService("notification");
    }

    async loadData() {
        this.state.loading = true;
        try {
            const data = await this.orm.call("model", "method", [args]);
            return data;
        } finally {
            this.state.loading = false;
        }
    }
}

// Registry registration (REQUIRED)
registry.category("actions").add("my_action", MyComponent);

// Patching existing components (REQUIRED for extensions)
patch(ExistingComponent.prototype, {
    setup() {
        super.setup(...arguments);
        // Additional setup
    },
});
```

### 3.3 Manifest Assets

```python
# __manifest__.py (REQUIRED format)
{
    'name': 'My Module',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Description',
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
        'views/my_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'my_module/static/src/js/**/*.js',
            'my_module/static/src/xml/**/*.xml',
            'my_module/static/src/scss/**/*.scss',
        ],
        'web.assets_backend': [
            'my_module/static/src/backend/**/*',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
```

---

## 4. Compliance Check Commands

### 4.1 Run Banlist Scan

```bash
# Quick scan for banned patterns
./scripts/odoo19_check.sh [path]

# Or with ripgrep directly
rg -n "from odoo\.osv\b|\._cr\b|\._uid\b|\._context\b|\bread_group\s*\(|\bsearch_fetch\s*\(" .

# JavaScript check
rg -n "odoo\.define|require\s*\(['\"]web\.|require\s*\(['\"]point_of_sale\." --type js .

# XPath check
rg -n "hasclass\s*\(" --type xml .
```

### 4.2 Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

if ./scripts/odoo19_check.sh --strict; then
    exit 0
else
    echo "Odoo 19 compliance check FAILED"
    exit 1
fi
```

---

## 5. PR/Review Gate

### Before finalizing any change:

1. **Run compliance check**:
   ```bash
   ./scripts/odoo19_check.sh
   ```

2. **If violations found**:
   - List each violation with file:line
   - Apply auto-fix from mapping above
   - Re-run check until clean

3. **Confirm compliance**:
   ```
   Odoo 19 Compliance: PASS
   - Scanned: X files
   - Violations: 0
   ```

---

## 6. Generation Defaults

When generating new code, Claude MUST:

1. **Default target**: Odoo 19
2. **Prefer modern patterns**: OWL components, modern ORM
3. **Never generate deprecated patterns**: Even if copying from old code
4. **Justify legacy usage**: If interop required, add comment explaining why

### Default Imports

```python
# Python default imports
from odoo import models, fields, api
from odoo.exceptions import UserError, ValidationError
```

```javascript
// JavaScript default imports
/** @odoo-module */
import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
```

---

## 7. Examples of Compliant Code

### 7.1 Model with Modern ORM

```python
from odoo import models, fields, api
from odoo.exceptions import ValidationError

class SaleOrderExtension(models.Model):
    _inherit = 'sale.order'

    custom_field = fields.Char(string='Custom Field', index=True)
    total_custom = fields.Float(compute='_compute_total_custom', store=True)

    @api.depends('order_line.custom_amount')
    def _compute_total_custom(self):
        for order in self:
            order.total_custom = sum(order.order_line.mapped('custom_amount'))

    @api.constrains('custom_field')
    def _check_custom_field(self):
        for record in self:
            if record.custom_field and len(record.custom_field) < 3:
                raise ValidationError("Custom field must be at least 3 characters")

    def action_custom_process(self):
        """Process orders with modern ORM patterns."""
        # Modern grouping (Odoo 19)
        grouped = self.env['sale.order.line']._read_group(
            domain=[('order_id', 'in', self.ids)],
            groupby=['product_id'],
            aggregates=['product_uom_qty:sum']
        )

        for product, qty_sum in grouped:
            # Process grouped data
            pass

        return True
```

### 7.2 OWL Component

```javascript
/** @odoo-module */

import { Component, useState, onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

export class CustomDashboard extends Component {
    static template = "my_module.CustomDashboard";
    static props = {
        title: { type: String, optional: true },
    };

    setup() {
        this.state = useState({
            loading: true,
            data: [],
            error: null,
        });
        this.orm = useService("orm");
        this.notification = useService("notification");

        onMounted(() => this.loadData());
    }

    async loadData() {
        try {
            const data = await this.orm.searchRead(
                "sale.order",
                [["state", "=", "sale"]],
                ["name", "amount_total", "partner_id"]
            );
            this.state.data = data;
        } catch (error) {
            this.state.error = error.message;
            this.notification.add(_t("Failed to load data"), { type: "danger" });
        } finally {
            this.state.loading = false;
        }
    }

    onRefresh() {
        this.state.loading = true;
        this.loadData();
    }
}

registry.category("actions").add("custom_dashboard", CustomDashboard);
```

### 7.3 Manifest with Correct Assets

```python
{
    'name': 'POS Custom Extension',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Custom POS extensions',
    'author': 'Your Company',
    'website': 'https://yourcompany.com',
    'license': 'LGPL-3',
    'depends': [
        'point_of_sale',
        'stock',
    ],
    'data': [
        'security/ir.model.access.csv',
        'security/security.xml',
        'views/pos_config_views.xml',
        'data/pos_data.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'my_module/static/src/js/**/*.js',
            'my_module/static/src/xml/**/*.xml',
            'my_module/static/src/scss/**/*.scss',
        ],
    },
    'installable': True,
    'auto_install': False,
}
```

---

## 8. Enforcement Levels

| Level | Action |
|-------|--------|
| **ERROR** | Hard-ban violations → Block merge |
| **WARNING** | Deprecated but functional → Fix before next release |
| **INFO** | Style recommendations → Optional improvement |

### Current Enforcement: **STRICT**

All hard-ban patterns are blocking. No exceptions without explicit justification and migration plan.
