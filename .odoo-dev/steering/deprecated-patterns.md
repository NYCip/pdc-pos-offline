# Deprecated Patterns - Odoo 19

## Quick Migration Reference

> Use this file to quickly identify and fix deprecated patterns in Odoo 19.
> Each section shows the OLD (deprecated) → NEW (correct) pattern.

---

## 1. Python Backend

### Raw SQL → ORM
```python
# ❌ DEPRECATED
self.env.cr.execute("SELECT id FROM res_partner WHERE name = %s", (name,))
result = self.env.cr.fetchall()

# ✅ CORRECT
result = self.env['res.partner'].search([('name', '=', name)])
```

### Old Field Definitions
```python
# ❌ DEPRECATED (positional args)
name = fields.Char('Name', 64, required=True)

# ✅ CORRECT (keyword args)
name = fields.Char(string='Name', size=64, required=True)
```

### Old API Decorators
```python
# ❌ DEPRECATED
@api.multi
def my_method(self):
    pass

@api.one
def my_method(self):
    pass

# ✅ CORRECT (no decorator needed for multi)
def my_method(self):
    for record in self:
        pass
```

### Old Environment Access
```python
# ❌ DEPRECATED
self.pool.get('res.partner')
self.pool['res.partner']

# ✅ CORRECT
self.env['res.partner']
```

### Old Context Patterns
```python
# ❌ DEPRECATED
context = dict(self.env.context or {})
context['key'] = value
return self.with_context(context)

# ✅ CORRECT
return self.with_context(key=value)
```

---

## 2. JavaScript Frontend

### Legacy Widgets → OWL
```javascript
// ❌ DEPRECATED
odoo.define('my_module.MyWidget', function (require) {
    var Widget = require('web.Widget');
    var MyWidget = Widget.extend({
        template: 'MyTemplate',
        events: {
            'click .button': '_onClick',
        },
        _onClick: function () {
            // ...
        },
    });
    return MyWidget;
});

// ✅ CORRECT (OWL)
/** @odoo-module */
import { Component } from "@odoo/owl";

export class MyComponent extends Component {
    static template = "my_module.MyComponent";

    onClick(ev) {
        // ...
    }
}
```

### jQuery → Native/OWL
```javascript
// ❌ DEPRECATED
$('.my-class').hide();
$('.my-class').on('click', handler);
$.ajax({ url: '/api', method: 'POST' });

// ✅ CORRECT
document.querySelector('.my-class').style.display = 'none';
this.state = useState({ visible: false });  // In OWL
await this.orm.call('model', 'method', [args]);
```

### Old RPC
```javascript
// ❌ DEPRECATED
var rpc = require('web.rpc');
rpc.query({
    model: 'res.partner',
    method: 'search_read',
    args: [[]],
});

// ✅ CORRECT
const orm = useService("orm");
await orm.searchRead("res.partner", [], ["name"]);
```

### Old Registry
```javascript
// ❌ DEPRECATED
core.action_registry.add('my_action', MyWidget);

// ✅ CORRECT
import { registry } from "@web/core/registry";
registry.category("actions").add("my_action", MyComponent);
```

---

## 3. POS Specific

### Old POS Model Extension
```javascript
// ❌ DEPRECATED
var models = require('point_of_sale.models');
models.Order = models.Order.extend({
    initialize: function(attr, options) {
        this._super(attr, options);
    },
});

// ✅ CORRECT
import { patch } from "@web/core/utils/patch";
import { Order } from "@point_of_sale/app/models/pos_order";

patch(Order.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
    },
});
```

### Old POS Screens
```javascript
// ❌ DEPRECATED
var screens = require('point_of_sale.screens');
screens.PaymentScreenWidget.include({
    // ...
});

// ✅ CORRECT
import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

patch(PaymentScreen.prototype, {
    // ...
});
```

### Old POS Chrome
```javascript
// ❌ DEPRECATED
var chrome = require('point_of_sale.chrome');
chrome.Chrome.include({
    build_chrome: function() {
        // ...
    },
});

// ✅ CORRECT - Use OWL components
import { Navbar } from "@point_of_sale/app/components/navbar/navbar";
patch(Navbar.prototype, {
    // ...
});
```

---

## 4. XML Views

### Old Action/Menu Syntax
```xml
<!-- ❌ DEPRECATED -->
<act_window id="action_partner"
    name="Partners"
    res_model="res.partner"
    view_mode="tree,form"/>

<!-- ✅ CORRECT -->
<record id="action_partner" model="ir.actions.act_window">
    <field name="name">Partners</field>
    <field name="res_model">res.partner</field>
    <field name="view_mode">list,form</field>
</record>
```

### Old Template Inheritance
```xml
<!-- ❌ DEPRECATED (t-extend) -->
<t t-extend="web.assets">
    <t t-jquery="script:last" t-operation="after">
        <script src="/my_module/static/src/js/my.js"/>
    </t>
</t>

<!-- ✅ CORRECT (manifest assets) -->
'assets': {
    'web.assets_backend': [
        'my_module/static/src/js/my.js',
    ],
}
```

### XPath in Odoo 19
```xml
<!-- ❌ BROKEN in Odoo 19 (hasclass) -->
<xpath expr="//div[hasclass('o_form_sheet')]" position="inside">

<!-- ✅ CORRECT -->
<xpath expr="//div[contains(@class, 'o_form_sheet')]" position="inside">
```

### Old Kanban Syntax
```xml
<!-- ❌ DEPRECATED -->
<kanban>
    <field name="name"/>
    <templates>
        <t t-name="kanban-box">
            <div class="oe_kanban_card">
                <field name="name"/>
            </div>
        </t>
    </templates>
</kanban>

<!-- ✅ CORRECT -->
<kanban>
    <templates>
        <t t-name="card">
            <field name="name"/>
        </t>
    </templates>
</kanban>
```

---

## 5. Asset Bundles

### Old Bundle Names
```python
# ❌ DEPRECATED
'assets': {
    'web.assets_common': [...],
    'web.assets_backend': [...],
    'point_of_sale.assets': [...],
}

# ✅ CORRECT (Odoo 19)
'assets': {
    'web.assets_backend': [...],
    'point_of_sale._assets_pos': [...],  # Note the underscore!
}
```

---

## 6. Controllers

### Old Route Syntax
```python
# ❌ DEPRECATED
from openerp import http
from openerp.http import request

@http.route('/my/path', type='http', auth='user')
def my_route(self):
    return request.render('template')

# ✅ CORRECT
from odoo import http
from odoo.http import request

@http.route('/my/path', type='http', auth='user', website=True)
def my_route(self):
    return request.render('my_module.template', {})
```

---

## Migration Checklist

When upgrading modules to Odoo 19:

- [ ] Replace all raw SQL with ORM methods
- [ ] Update field definitions to keyword args
- [ ] Remove @api.multi and @api.one decorators
- [ ] Convert legacy widgets to OWL components
- [ ] Replace jQuery with native JS or OWL state
- [ ] Update POS patches to use `patch()` function
- [ ] Fix XPath selectors (no hasclass())
- [ ] Update asset bundle names
- [ ] Test all functionality with pytest-odoo
