/** @odoo-module */

import { registry } from "@web/core/registry";
import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

/**
 * UserPinWidget - Odoo 19 compliant field widget for POS offline PIN
 *
 * Usage in view: <field name="pos_offline_pin" widget="pos_pin_widget"/>
 */
export class UserPinWidget extends Component {
    static template = "pdc_pos_offline.UserPinWidget";
    static props = {
        ...standardFieldProps,
    };

    setup() {
        this.notification = useService("notification");
        this.state = useState({
            showPin: false,
        });
    }

    get formattedValue() {
        return this.props.record.data[this.props.name] || '';
    }

    get maskedValue() {
        const value = this.formattedValue;
        return value ? '****' : '';
    }

    get isReadonly() {
        return this.props.readonly;
    }

    onToggleVisibility() {
        this.state.showPin = !this.state.showPin;
    }

    async onGeneratePin() {
        if (this.isReadonly) return;

        // Generate random 4-digit PIN
        const pin = Math.floor(1000 + Math.random() * 9000).toString();

        // Update the field value using Odoo 19 record update pattern
        await this.props.record.update({ [this.props.name]: pin });
        this.state.showPin = true;

        // Show notification
        this.notification.add(`New PIN generated: ${pin}`, {
            type: "success",
            title: "PIN Generated",
        });
    }

    async onClearPin() {
        if (this.isReadonly) return;
        await this.props.record.update({ [this.props.name]: false });
        this.state.showPin = false;
    }

    async onInputChange(ev) {
        if (this.isReadonly) return;
        const value = ev.target.value;
        // Only allow 4-digit numeric PIN
        if (/^\d{0,4}$/.test(value)) {
            await this.props.record.update({ [this.props.name]: value });
        } else {
            ev.target.value = this.formattedValue;
        }
    }
}

// Odoo 19 field widget registry format
registry.category("fields").add("pos_pin_widget", {
    component: UserPinWidget,
    supportedTypes: ["char"],
});