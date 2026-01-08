# Module Template: POS Loyalty

## Overview
Template for creating loyalty/rewards programs in Odoo 19 POS.

## Module Structure
```
pos_loyalty_custom/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── loyalty_program.py      # Loyalty program configuration
│   ├── loyalty_card.py         # Customer loyalty cards
│   ├── loyalty_reward.py       # Reward definitions
│   └── pos_order.py            # POS order extension
├── views/
│   ├── loyalty_program_views.xml
│   ├── loyalty_card_views.xml
│   └── menu_views.xml
├── security/
│   ├── ir.model.access.csv
│   └── loyalty_security.xml
├── static/src/
│   ├── js/
│   │   ├── loyalty_button.js   # POS button component
│   │   ├── loyalty_popup.js    # Popup for loyalty
│   │   └── pos_order_patch.js  # Order model extension
│   ├── xml/
│   │   └── loyalty_templates.xml
│   └── scss/
│       └── loyalty_styles.scss
├── data/
│   └── loyalty_data.xml
└── tests/
    ├── __init__.py
    ├── test_loyalty_program.py
    └── test_pos_loyalty.py
```

## Key Files

### __manifest__.py
```python
{
    'name': 'POS Loyalty Custom',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Custom loyalty program for POS',
    'depends': ['point_of_sale', 'loyalty'],
    'data': [
        'security/ir.model.access.csv',
        'security/loyalty_security.xml',
        'views/loyalty_program_views.xml',
        'views/loyalty_card_views.xml',
        'views/menu_views.xml',
        'data/loyalty_data.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_loyalty_custom/static/src/js/**/*',
            'pos_loyalty_custom/static/src/xml/**/*',
            'pos_loyalty_custom/static/src/scss/**/*',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
```

### models/pos_order.py
```python
from odoo import models, fields, api

class PosOrder(models.Model):
    _inherit = 'pos.order'

    loyalty_points_earned = fields.Integer(string='Points Earned')
    loyalty_points_used = fields.Integer(string='Points Used')
    loyalty_card_id = fields.Many2one('loyalty.card', string='Loyalty Card')

    def _order_fields(self, ui_order):
        result = super()._order_fields(ui_order)
        result['loyalty_points_earned'] = ui_order.get('loyalty_points_earned', 0)
        result['loyalty_points_used'] = ui_order.get('loyalty_points_used', 0)
        result['loyalty_card_id'] = ui_order.get('loyalty_card_id')
        return result

    @api.model
    def _process_order(self, order, draft, existing_order):
        result = super()._process_order(order, draft, existing_order)
        if result:
            order_obj = self.browse(result)
            order_obj._process_loyalty_points()
        return result

    def _process_loyalty_points(self):
        """Process loyalty points after order completion"""
        if self.loyalty_card_id:
            self.loyalty_card_id.points += self.loyalty_points_earned
            self.loyalty_card_id.points -= self.loyalty_points_used
```

### static/src/js/pos_order_patch.js
```javascript
/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { Order } from "@point_of_sale/app/models/pos_order";

patch(Order.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        this.loyalty_card = null;
        this.loyalty_points_earned = 0;
        this.loyalty_points_used = 0;
    },

    set_loyalty_card(card) {
        this.loyalty_card = card;
        this.loyalty_points_earned = this._calculate_points();
    },

    _calculate_points() {
        // 1 point per dollar spent
        return Math.floor(this.get_total_with_tax());
    },

    apply_loyalty_reward(points) {
        this.loyalty_points_used = points;
        // Apply discount based on points
        const discount = points * 0.01; // $0.01 per point
        // Add discount line...
    },

    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.loyalty_card_id = this.loyalty_card?.id;
        json.loyalty_points_earned = this.loyalty_points_earned;
        json.loyalty_points_used = this.loyalty_points_used;
        return json;
    },

    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.loyalty_card_id = json.loyalty_card_id;
        this.loyalty_points_earned = json.loyalty_points_earned || 0;
        this.loyalty_points_used = json.loyalty_points_used || 0;
    },
});
```

### static/src/js/loyalty_popup.js
```javascript
/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

export class LoyaltyPopup extends AbstractAwaitablePopup {
    static template = "pos_loyalty_custom.LoyaltyPopup";
    static defaultProps = {
        confirmText: _t("Apply"),
        cancelText: _t("Cancel"),
    };

    setup() {
        super.setup();
        this.pos = usePos();
        this.state = useState({
            cardNumber: "",
            card: null,
            error: null,
        });
    }

    async searchCard() {
        const result = await this.pos.orm.call(
            "loyalty.card",
            "search_by_number",
            [this.state.cardNumber]
        );
        if (result) {
            this.state.card = result;
            this.state.error = null;
        } else {
            this.state.error = _t("Card not found");
        }
    }

    async confirm() {
        if (this.state.card) {
            this.pos.get_order().set_loyalty_card(this.state.card);
        }
        super.confirm();
    }
}
```

## Testing

### tests/test_pos_loyalty.py
```python
from odoo.tests import tagged
from odoo.addons.point_of_sale.tests.common import TestPoSCommon

@tagged('post_install', '-at_install')
class TestPOSLoyalty(TestPoSCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.loyalty_program = cls.env['loyalty.program'].create({
            'name': 'Test Program',
            'points_per_dollar': 1,
        })
        cls.loyalty_card = cls.env['loyalty.card'].create({
            'program_id': cls.loyalty_program.id,
            'partner_id': cls.partner_a.id,
            'points': 100,
        })

    def test_loyalty_points_calculation(self):
        """Test that loyalty points are calculated correctly"""
        order = self._create_order({
            'lines': [(self.product_a, 10)],
            'loyalty_card_id': self.loyalty_card.id,
        })
        self.assertEqual(order.loyalty_points_earned, 10)

    def test_loyalty_points_redemption(self):
        """Test that points are deducted when redeemed"""
        initial_points = self.loyalty_card.points
        order = self._create_order({
            'lines': [(self.product_a, 10)],
            'loyalty_card_id': self.loyalty_card.id,
            'loyalty_points_used': 50,
        })
        self.loyalty_card.refresh_from_db()
        self.assertEqual(self.loyalty_card.points, initial_points - 50 + order.loyalty_points_earned)
```

## Common Patterns

### Extending Native Loyalty
If Odoo's native `pos_loyalty` exists:
```python
class LoyaltyProgram(models.Model):
    _inherit = 'loyalty.program'

    custom_field = fields.Char(string='Custom Field')
```

### Points Expiry
```python
expiry_date = fields.Date(string='Expiry Date')

@api.model
def _cron_expire_points(self):
    expired = self.search([('expiry_date', '<', fields.Date.today())])
    expired.write({'points': 0})
```

## Complexity Score
- Base: 8 points (4-6 tasks)
- +3 POS UI (OWL popup)
- +2 Multi-model
- **Total: 13** → Use Hive-Mind swarm
