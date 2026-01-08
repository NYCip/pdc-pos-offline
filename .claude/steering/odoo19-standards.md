# Odoo 19 Development Standards

## Quick Reference

> **CRITICAL**: This file is the authoritative reference for Odoo 19 patterns.
> For full documentation, use Context7 MCP: `mcp__context7__query-docs`

---

## 1. ORM Patterns (MANDATORY)

### Database Access
```python
# ✅ ALWAYS use ORM
records = self.env['model.name'].search([('field', '=', value)])
record = self.env['model.name'].browse(record_id)
self.env['model.name'].create({'field': value})
record.write({'field': new_value})
record.unlink()

# ❌ NEVER use raw SQL
self.env.cr.execute("SELECT...")  # FORBIDDEN
self._cr.execute("INSERT...")     # FORBIDDEN
```

### Search & Browse
```python
# Efficient patterns
records = self.env['res.partner'].search([
    ('is_company', '=', True),
    ('country_id.code', '=', 'US'),
], limit=100, order='name ASC')

# Prefetch for performance
records = records.with_prefetch(self.env['res.partner'].browse([]))

# Sudo for elevated access
record.sudo().write({'internal_field': value})
```

### Context Management
```python
# Add context
self.env['model'].with_context(key=value, no_check=True)

# Specific user
self.env['model'].with_user(user_id)

# Company switch
self.env['model'].with_company(company_id)
```

---

## 2. Model Definitions

### Modern Field Syntax
```python
from odoo import models, fields, api

class MyModel(models.Model):
    _name = 'my.model'
    _description = 'My Model'
    _order = 'sequence, name'

    # Basic fields
    name = fields.Char(string='Name', required=True, index=True)
    active = fields.Boolean(default=True)
    sequence = fields.Integer(default=10)

    # Relational
    partner_id = fields.Many2one('res.partner', string='Partner', ondelete='cascade')
    line_ids = fields.One2many('my.model.line', 'parent_id', string='Lines')
    tag_ids = fields.Many2many('my.tag', string='Tags')

    # Computed
    total = fields.Float(compute='_compute_total', store=True)

    @api.depends('line_ids.amount')
    def _compute_total(self):
        for record in self:
            record.total = sum(record.line_ids.mapped('amount'))
```

### Constraints
```python
# Python constraint
@api.constrains('field1', 'field2')
def _check_values(self):
    for record in self:
        if record.field1 < 0:
            raise ValidationError("Field1 must be positive")

# SQL constraint
_sql_constraints = [
    ('unique_name', 'UNIQUE(name)', 'Name must be unique'),
    ('positive_amount', 'CHECK(amount >= 0)', 'Amount must be positive'),
]
```

---

## 3. OWL Components (Frontend)

### Component Structure
```javascript
/** @odoo-module */

import { Component, useState, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class MyComponent extends Component {
    static template = "my_module.MyComponent";
    static props = {
        recordId: { type: Number, optional: true },
        onSave: { type: Function, optional: true },
    };

    setup() {
        this.state = useState({ loading: false, data: null });
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.inputRef = useRef("input");
    }

    async loadData() {
        this.state.loading = true;
        try {
            this.state.data = await this.orm.call(
                "my.model",
                "get_data",
                [this.props.recordId]
            );
        } finally {
            this.state.loading = false;
        }
    }

    onClick(ev) {
        ev.stopPropagation();
        this.props.onSave?.();
    }
}

// Register in appropriate registry
registry.category("actions").add("my_action", MyComponent);
```

### Template (XML)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates xml:space="preserve">
    <t t-name="my_module.MyComponent">
        <div class="my-component">
            <t t-if="state.loading">
                <span class="fa fa-spinner fa-spin"/>
            </t>
            <t t-else="">
                <input t-ref="input" t-att-value="state.data"/>
                <button t-on-click="onClick">Save</button>
            </t>
        </div>
    </t>
</templates>
```

---

## 4. POS Specific Patterns

### Extending POS Models
```javascript
/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { Order } from "@point_of_sale/app/models/pos_order";

patch(Order.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        this.custom_field = this.custom_field || "";
    },

    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.custom_field = this.custom_field;
        return json;
    },

    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.custom_field = json.custom_field || "";
    },
});
```

### POS Screen Component
```javascript
/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { _t } from "@web/core/l10n/translation";

export class MyPOSPopup extends AbstractAwaitablePopup {
    static template = "my_module.MyPOSPopup";
    static defaultProps = {
        confirmText: _t("Confirm"),
        cancelText: _t("Cancel"),
    };

    setup() {
        super.setup();
        this.pos = usePos();
    }

    async confirm() {
        const order = this.pos.get_order();
        // Process order...
        this.props.close({ confirmed: true });
    }
}
```

### Asset Bundle
```python
# __manifest__.py
{
    'assets': {
        'point_of_sale._assets_pos': [
            'my_module/static/src/js/**/*',
            'my_module/static/src/xml/**/*',
            'my_module/static/src/scss/**/*',
        ],
    },
}
```

---

## 5. Security

### Access Rights (ir.model.access.csv)
```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_my_model_user,my.model.user,model_my_model,base.group_user,1,0,0,0
access_my_model_manager,my.model.manager,model_my_model,base.group_system,1,1,1,1
```

### Record Rules (security.xml)
```xml
<record id="my_model_rule_user" model="ir.rule">
    <field name="name">My Model: See own</field>
    <field name="model_id" ref="model_my_model"/>
    <field name="domain_force">[('user_id', '=', user.id)]</field>
    <field name="groups" eval="[(4, ref('base.group_user'))]"/>
    <field name="perm_read" eval="True"/>
    <field name="perm_write" eval="True"/>
</record>
```

---

## 6. Testing

### Unit Tests (pytest-odoo)
```python
import pytest
from odoo.tests import tagged

@tagged('post_install', '-at_install')
class TestMyModel(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner = cls.env['res.partner'].create({'name': 'Test'})

    def test_create_record(self):
        record = self.env['my.model'].create({
            'name': 'Test Record',
            'partner_id': self.partner.id,
        })
        self.assertEqual(record.name, 'Test Record')
        self.assertTrue(record.active)

    def test_compute_total(self):
        # Test computed field
        pass
```

### Running Tests
```bash
# Single module
pytest custom_addons/my_module/tests -v

# With coverage
pytest custom_addons/my_module/tests --cov=custom_addons/my_module --cov-report=html

# POS UI tests (Playwright)
npx playwright test tests/e2e/
```

---

## 7. Best Practices Summary

| Category | DO | DON'T |
|----------|-----|-------|
| Database | Use ORM methods | Use raw SQL |
| Frontend | OWL components | jQuery, legacy widgets |
| POS | patch() for extensions | Monkey patching |
| Assets | _assets_pos bundle | Manual script loading |
| Testing | pytest-odoo + Playwright | Skip tests |
| Security | ir.model.access + rules | Public endpoints |

---

## Context7 Queries

For detailed docs, use these Context7 queries:
```
mcp__context7__query-docs { libraryId: "/odoo/odoo", query: "ORM search domain operators" }
mcp__context7__query-docs { libraryId: "/odoo/odoo", query: "OWL lifecycle hooks" }
mcp__context7__query-docs { libraryId: "/odoo/odoo", query: "POS order model extension" }
```
