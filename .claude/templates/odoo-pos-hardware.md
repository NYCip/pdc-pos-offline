# Module Template: POS Hardware Integration

## Overview
Template for hardware integrations in Odoo 19 POS (scales, printers, scanners, payment terminals).

## Module Structure
```
pos_hardware_custom/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── pos_config.py           # POS config extension
│   ├── hardware_proxy.py       # Hardware proxy model
│   └── pos_order.py            # Order with hardware data
├── controllers/
│   ├── __init__.py
│   └── hardware_controller.py  # HTTP endpoints for hardware
├── views/
│   ├── pos_config_views.xml
│   └── menu_views.xml
├── static/src/
│   ├── js/
│   │   ├── hardware_service.js # Hardware communication
│   │   ├── scale_popup.js      # Scale weighing UI
│   │   └── printer_service.js  # Receipt printer
│   └── xml/
│       └── hardware_templates.xml
└── tests/
    ├── __init__.py
    └── test_hardware.py
```

## Key Files

### __manifest__.py
```python
{
    'name': 'POS Hardware Custom',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Custom hardware integration for POS',
    'depends': ['point_of_sale', 'hw_drivers'],
    'data': [
        'views/pos_config_views.xml',
        'views/menu_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_hardware_custom/static/src/js/**/*',
            'pos_hardware_custom/static/src/xml/**/*',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
```

### models/pos_config.py
```python
from odoo import models, fields

class PosConfig(models.Model):
    _inherit = 'pos.config'

    scale_ip = fields.Char(string='Scale IP Address')
    scale_port = fields.Integer(string='Scale Port', default=8080)
    scale_enabled = fields.Boolean(string='Enable Scale', default=False)

    printer_type = fields.Selection([
        ('epson', 'Epson'),
        ('star', 'Star'),
        ('custom', 'Custom'),
    ], string='Printer Type', default='epson')
    printer_ip = fields.Char(string='Printer IP Address')

    barcode_scanner_enabled = fields.Boolean(string='Enable Barcode Scanner')
```

### static/src/js/hardware_service.js
```javascript
/** @odoo-module */

import { reactive } from "@odoo/owl";
import { registry } from "@web/core/registry";

export const hardwareService = {
    dependencies: ["pos"],

    start(env, { pos }) {
        const state = reactive({
            scaleConnected: false,
            printerConnected: false,
            lastWeight: 0,
        });

        return {
            state,

            async connectScale() {
                const config = pos.config;
                if (!config.scale_enabled) return false;

                try {
                    const response = await fetch(`http://${config.scale_ip}:${config.scale_port}/status`);
                    state.scaleConnected = response.ok;
                    return state.scaleConnected;
                } catch (e) {
                    console.error("Scale connection failed:", e);
                    state.scaleConnected = false;
                    return false;
                }
            },

            async getWeight() {
                const config = pos.config;
                if (!state.scaleConnected) {
                    await this.connectScale();
                }

                try {
                    const response = await fetch(`http://${config.scale_ip}:${config.scale_port}/weight`);
                    const data = await response.json();
                    state.lastWeight = data.weight;
                    return data.weight;
                } catch (e) {
                    console.error("Failed to get weight:", e);
                    return 0;
                }
            },

            async printReceipt(receipt) {
                const config = pos.config;
                if (!config.printer_ip) return false;

                try {
                    await fetch(`http://${config.printer_ip}/print`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ receipt }),
                    });
                    return true;
                } catch (e) {
                    console.error("Print failed:", e);
                    return false;
                }
            },

            async openCashDrawer() {
                return this.printReceipt({ type: 'cash_drawer' });
            },
        };
    },
};

registry.category("services").add("hardware", hardwareService);
```

### static/src/js/scale_popup.js
```javascript
/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { useService } from "@web/core/utils/hooks";
import { useState, onMounted, onWillUnmount } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

export class ScalePopup extends AbstractAwaitablePopup {
    static template = "pos_hardware_custom.ScalePopup";
    static defaultProps = {
        confirmText: _t("Add"),
        cancelText: _t("Cancel"),
    };

    setup() {
        super.setup();
        this.hardware = useService("hardware");
        this.state = useState({
            weight: 0,
            unit: "kg",
            price_per_unit: this.props.product?.lst_price || 0,
            total: 0,
            polling: true,
        });

        this.pollInterval = null;

        onMounted(() => {
            this.startPolling();
        });

        onWillUnmount(() => {
            this.stopPolling();
        });
    }

    async startPolling() {
        this.pollInterval = setInterval(async () => {
            if (this.state.polling) {
                const weight = await this.hardware.getWeight();
                this.state.weight = weight;
                this.state.total = weight * this.state.price_per_unit;
            }
        }, 200);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
    }

    tare() {
        // Send tare command to scale
        this.hardware.tare?.();
    }

    confirm() {
        this.state.polling = false;
        this.props.close({
            confirmed: true,
            weight: this.state.weight,
            total: this.state.total,
        });
    }
}
```

### controllers/hardware_controller.py
```python
from odoo import http
from odoo.http import request
import json

class HardwareController(http.Controller):

    @http.route('/pos/hardware/scale/status', type='json', auth='user')
    def scale_status(self, config_id):
        """Check scale connection status"""
        config = request.env['pos.config'].browse(config_id)
        return {
            'enabled': config.scale_enabled,
            'ip': config.scale_ip,
            'port': config.scale_port,
        }

    @http.route('/pos/hardware/printer/test', type='json', auth='user')
    def test_printer(self, config_id):
        """Send test print to printer"""
        config = request.env['pos.config'].browse(config_id)
        # Implementation depends on printer type
        return {'success': True}

    @http.route('/pos/hardware/scanner/config', type='json', auth='user')
    def scanner_config(self, config_id):
        """Get barcode scanner configuration"""
        config = request.env['pos.config'].browse(config_id)
        return {
            'enabled': config.barcode_scanner_enabled,
            'prefix': config.barcode_prefix or '',
        }
```

## Hardware-Specific Patterns

### Scale Integration (Toledo/CAS)
```javascript
// Toledo protocol
async getToledoWeight(ip, port) {
    const response = await fetch(`http://${ip}:${port}/read`);
    const data = await response.text();
    // Parse Toledo protocol: "ST,GS,+  0.000kg"
    const match = data.match(/([+-]?\d+\.\d+)(kg|lb)/);
    return match ? parseFloat(match[1]) : 0;
}

// CAS scale
async getCASWeight(ip, port) {
    const ws = new WebSocket(`ws://${ip}:${port}`);
    return new Promise((resolve) => {
        ws.onmessage = (event) => {
            const weight = parseFloat(event.data);
            ws.close();
            resolve(weight);
        };
    });
}
```

### Receipt Printer (ESC/POS)
```javascript
// ESC/POS commands
const ESC = '\x1B';
const commands = {
    init: ESC + '@',
    cut: ESC + 'm',
    bold_on: ESC + 'E1',
    bold_off: ESC + 'E0',
    center: ESC + 'a1',
    left: ESC + 'a0',
};

async printReceipt(printer_ip, receipt) {
    const data = [
        commands.init,
        commands.center,
        commands.bold_on,
        receipt.company_name,
        commands.bold_off,
        '\n',
        receipt.address,
        '\n\n',
        commands.left,
        ...receipt.lines.map(l => `${l.product} x${l.qty} ${l.price}\n`),
        '\n',
        commands.cut,
    ].join('');

    await fetch(`http://${printer_ip}/print`, {
        method: 'POST',
        body: data,
    });
}
```

### Barcode Scanner
```javascript
// USB HID scanner (keyboard mode)
setup() {
    this.barcodeBuffer = "";
    this.barcodeTimeout = null;

    document.addEventListener("keydown", this.onKeyDown.bind(this));
}

onKeyDown(event) {
    if (event.key === "Enter" && this.barcodeBuffer.length > 0) {
        this.processBarcode(this.barcodeBuffer);
        this.barcodeBuffer = "";
        return;
    }

    // Accumulate barcode characters
    this.barcodeBuffer += event.key;

    // Clear buffer after timeout (no more input)
    clearTimeout(this.barcodeTimeout);
    this.barcodeTimeout = setTimeout(() => {
        this.barcodeBuffer = "";
    }, 100);
}
```

## Testing

### tests/test_hardware.py
```python
from odoo.tests import tagged
from odoo.addons.point_of_sale.tests.common import TestPoSCommon
from unittest.mock import patch, MagicMock

@tagged('post_install', '-at_install')
class TestHardware(TestPoSCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.config.write({
            'scale_enabled': True,
            'scale_ip': '192.168.1.100',
            'scale_port': 8080,
        })

    @patch('requests.get')
    def test_scale_connection(self, mock_get):
        """Test scale connection check"""
        mock_get.return_value = MagicMock(ok=True)
        # Test connection logic

    def test_config_fields(self):
        """Test hardware config fields are properly saved"""
        self.assertTrue(self.config.scale_enabled)
        self.assertEqual(self.config.scale_ip, '192.168.1.100')
```

## Complexity Score
- Base: 8 points (4-6 tasks)
- +1 external integration (scale)
- +1 external integration (printer)
- +2 JS/OWL components
- **Total: 12** → Use Hive-Mind swarm
