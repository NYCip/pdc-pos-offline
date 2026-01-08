# Module Template: POS Payment Integration

## Overview
Template for payment method integrations in Odoo 19 POS (card terminals, mobile payments, EBT).

## Module Structure
```
pos_payment_custom/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── pos_payment_method.py   # Payment method extension
│   ├── pos_payment.py          # Payment record
│   └── pos_config.py           # POS config
├── controllers/
│   ├── __init__.py
│   └── payment_controller.py   # Webhook/callback endpoints
├── views/
│   ├── pos_payment_views.xml
│   └── pos_config_views.xml
├── static/src/
│   ├── js/
│   │   ├── payment_terminal.js # Terminal communication
│   │   └── payment_screen_patch.js
│   └── xml/
│       └── payment_templates.xml
├── data/
│   └── payment_data.xml
└── tests/
    ├── __init__.py
    └── test_payment.py
```

## Key Files

### __manifest__.py
```python
{
    'name': 'POS Payment Custom',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Custom payment integration for POS',
    'depends': ['point_of_sale', 'pos_payment_terminal'],
    'data': [
        'security/ir.model.access.csv',
        'views/pos_payment_views.xml',
        'views/pos_config_views.xml',
        'data/payment_data.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_payment_custom/static/src/js/**/*',
            'pos_payment_custom/static/src/xml/**/*',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
```

### models/pos_payment_method.py
```python
from odoo import models, fields, api

class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    custom_terminal_type = fields.Selection([
        ('verifone', 'Verifone'),
        ('ingenico', 'Ingenico'),
        ('pax', 'PAX'),
        ('clover', 'Clover'),
    ], string='Terminal Type')

    terminal_ip = fields.Char(string='Terminal IP')
    terminal_port = fields.Integer(string='Terminal Port', default=443)
    merchant_id = fields.Char(string='Merchant ID')
    api_key = fields.Char(string='API Key')

    # EBT specific
    is_ebt = fields.Boolean(string='Is EBT Payment')
    ebt_type = fields.Selection([
        ('snap', 'SNAP (Food)'),
        ('cash', 'Cash Benefits'),
    ], string='EBT Type')

    def _get_payment_terminal_selection(self):
        """Override to add custom terminal type"""
        res = super()._get_payment_terminal_selection()
        res.append(('custom_terminal', 'Custom Terminal'))
        return res
```

### models/pos_payment.py
```python
from odoo import models, fields

class PosPayment(models.Model):
    _inherit = 'pos.payment'

    terminal_transaction_id = fields.Char(string='Terminal Transaction ID')
    terminal_auth_code = fields.Char(string='Authorization Code')
    card_last_four = fields.Char(string='Card Last 4')
    card_type = fields.Selection([
        ('visa', 'Visa'),
        ('mastercard', 'Mastercard'),
        ('amex', 'American Express'),
        ('discover', 'Discover'),
        ('ebt', 'EBT'),
    ], string='Card Type')
    ebt_balance = fields.Float(string='Remaining EBT Balance')
```

### static/src/js/payment_terminal.js
```javascript
/** @odoo-module */

import { PaymentInterface } from "@point_of_sale/app/payment/payment_interface";
import { _t } from "@web/core/l10n/translation";

export class CustomPaymentTerminal extends PaymentInterface {
    setup() {
        super.setup(...arguments);
        this.terminalConnected = false;
    }

    /**
     * Send payment request to terminal
     */
    async send_payment_request(cid) {
        await super.send_payment_request(...arguments);
        const paymentLine = this.pos.get_order().get_paymentline(cid);
        const amount = paymentLine.amount;

        try {
            const result = await this._sendToTerminal({
                action: 'sale',
                amount: amount,
                currency: this.pos.currency.name,
            });

            if (result.approved) {
                paymentLine.set_payment_status('done');
                paymentLine.terminal_transaction_id = result.transaction_id;
                paymentLine.card_type = result.card_type;
                paymentLine.card_last_four = result.card_last_four;
                return true;
            } else {
                paymentLine.set_payment_status('retry');
                this._showError(result.message || _t("Payment declined"));
                return false;
            }
        } catch (error) {
            paymentLine.set_payment_status('retry');
            this._showError(error.message || _t("Terminal communication error"));
            return false;
        }
    }

    /**
     * Cancel pending payment on terminal
     */
    async send_payment_cancel(order, cid) {
        await super.send_payment_cancel(...arguments);

        try {
            await this._sendToTerminal({
                action: 'cancel',
            });
            return true;
        } catch (error) {
            console.error("Cancel failed:", error);
            return false;
        }
    }

    /**
     * Process refund on terminal
     */
    async send_payment_reversal(cid) {
        const paymentLine = this.pos.get_order().get_paymentline(cid);

        try {
            const result = await this._sendToTerminal({
                action: 'refund',
                amount: Math.abs(paymentLine.amount),
                original_transaction_id: paymentLine.terminal_transaction_id,
            });

            if (result.approved) {
                paymentLine.set_payment_status('reversed');
                return true;
            }
            return false;
        } catch (error) {
            this._showError(error.message);
            return false;
        }
    }

    /**
     * Internal: Send request to physical terminal
     */
    async _sendToTerminal(data) {
        const config = this.payment_method;
        const url = `https://${config.terminal_ip}:${config.terminal_port}/api/transaction`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.api_key}`,
            },
            body: JSON.stringify({
                merchant_id: config.merchant_id,
                ...data,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
    }

    /**
     * Check if terminal is connected
     */
    async checkConnection() {
        try {
            const response = await this._sendToTerminal({ action: 'status' });
            this.terminalConnected = response.connected;
            return this.terminalConnected;
        } catch {
            this.terminalConnected = false;
            return false;
        }
    }

    _showError(message) {
        this.env.services.notification.add(message, {
            type: 'danger',
            title: _t("Payment Error"),
        });
    }
}
```

### EBT Payment Handler
```javascript
/** @odoo-module */

import { CustomPaymentTerminal } from "./payment_terminal";
import { _t } from "@web/core/l10n/translation";

export class EBTPaymentTerminal extends CustomPaymentTerminal {
    async send_payment_request(cid) {
        const paymentLine = this.pos.get_order().get_paymentline(cid);
        const order = this.pos.get_order();

        // Validate EBT eligible items
        const eligibleAmount = this._calculateEligibleAmount(order);
        if (paymentLine.amount > eligibleAmount) {
            this._showError(_t("Amount exceeds EBT eligible total"));
            paymentLine.set_payment_status('retry');
            return false;
        }

        try {
            const result = await this._sendToTerminal({
                action: 'ebt_sale',
                ebt_type: this.payment_method.ebt_type,
                amount: paymentLine.amount,
            });

            if (result.approved) {
                paymentLine.set_payment_status('done');
                paymentLine.ebt_balance = result.remaining_balance;
                paymentLine.card_type = 'ebt';
                return true;
            } else {
                paymentLine.set_payment_status('retry');
                this._showError(result.message || _t("EBT payment declined"));
                return false;
            }
        } catch (error) {
            paymentLine.set_payment_status('retry');
            this._showError(error.message);
            return false;
        }
    }

    _calculateEligibleAmount(order) {
        // Sum only EBT-eligible products
        return order.orderlines.reduce((sum, line) => {
            if (line.product.ebt_eligible) {
                return sum + line.get_price_with_tax();
            }
            return sum;
        }, 0);
    }
}
```

### controllers/payment_controller.py
```python
from odoo import http
from odoo.http import request
import json
import hmac
import hashlib

class PaymentController(http.Controller):

    @http.route('/pos/payment/webhook', type='json', auth='none', csrf=False)
    def payment_webhook(self, **kwargs):
        """Handle payment terminal webhooks"""
        # Verify webhook signature
        signature = request.httprequest.headers.get('X-Signature')
        if not self._verify_signature(request.jsonrequest, signature):
            return {'error': 'Invalid signature'}

        event_type = kwargs.get('event_type')
        transaction_id = kwargs.get('transaction_id')

        if event_type == 'payment_completed':
            self._process_completed_payment(transaction_id, kwargs)
        elif event_type == 'payment_failed':
            self._process_failed_payment(transaction_id, kwargs)

        return {'status': 'ok'}

    def _verify_signature(self, payload, signature):
        """Verify webhook signature"""
        secret = request.env['ir.config_parameter'].sudo().get_param(
            'pos_payment_custom.webhook_secret'
        )
        expected = hmac.new(
            secret.encode(),
            json.dumps(payload).encode(),
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature or '')

    def _process_completed_payment(self, transaction_id, data):
        """Update payment record when terminal confirms"""
        payment = request.env['pos.payment'].sudo().search([
            ('terminal_transaction_id', '=', transaction_id)
        ], limit=1)
        if payment:
            payment.write({
                'terminal_auth_code': data.get('auth_code'),
                'card_last_four': data.get('card_last_four'),
            })

    @http.route('/pos/payment/balance/<string:card_number>', type='json', auth='user')
    def check_ebt_balance(self, card_number):
        """Check EBT card balance"""
        # Implementation depends on EBT processor
        return {'balance': 0.00, 'card_type': 'snap'}
```

## Testing

### tests/test_payment.py
```python
from odoo.tests import tagged
from odoo.addons.point_of_sale.tests.common import TestPoSCommon
from unittest.mock import patch, MagicMock

@tagged('post_install', '-at_install')
class TestPayment(TestPoSCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.payment_method = cls.env['pos.payment.method'].create({
            'name': 'Test Terminal',
            'custom_terminal_type': 'verifone',
            'terminal_ip': '192.168.1.100',
            'api_key': 'test_key',
        })

    @patch('requests.post')
    def test_payment_approval(self, mock_post):
        """Test successful payment processing"""
        mock_post.return_value = MagicMock(
            ok=True,
            json=lambda: {
                'approved': True,
                'transaction_id': 'TXN123',
                'card_type': 'visa',
            }
        )
        # Create and process payment

    def test_ebt_eligible_calculation(self):
        """Test EBT eligible amount calculation"""
        # Create products with ebt_eligible flag
        eligible_product = self.env['product.product'].create({
            'name': 'EBT Eligible',
            'lst_price': 10.00,
            'ebt_eligible': True,
        })
        ineligible_product = self.env['product.product'].create({
            'name': 'Not Eligible',
            'lst_price': 5.00,
            'ebt_eligible': False,
        })
        # Test calculation logic
```

## Security Considerations

1. **API Key Storage**: Store in `ir.config_parameter` or encrypted field
2. **Webhook Validation**: Always verify signatures
3. **PCI Compliance**: Never log full card numbers
4. **Transaction Logging**: Log all attempts for audit

## Complexity Score
- Base: 15 points (7+ tasks)
- +3 Payment flow logic
- +1 External integration
- +2 JS/OWL components
- **Total: 21** → Use Byzantine consensus (critical payment flow)
