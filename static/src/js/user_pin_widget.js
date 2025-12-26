/** @odoo-module */

import { registry } from "@web/core/registry";
import { Component } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class UserPinWidget extends Component {
    setup() {
        this.notification = useService("notification");
    }
    
    onGeneratePin() {
        // Generate random 4-digit PIN
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Update the field value
        this.props.value = pin;
        this.props.update(pin);
        
        // Show notification
        this.notification.add(`New PIN generated: ${pin}`, {
            type: "success",
            title: "PIN Generated",
        });
    }
}

UserPinWidget.template = "pdc_pos_offline.UserPinWidget";

registry.category("fields").add("pos_pin_widget", UserPinWidget);