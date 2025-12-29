/** @odoo-module */

// Odoo 19: AbstractAwaitablePopup was REMOVED
// Convert to standard OWL Component with Dialog service pattern
import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { offlineDB } from "./offline_db";

/**
 * OfflineLoginPopup - OWL Component for offline PIN authentication
 *
 * Odoo 19 compatible: Uses Dialog wrapper component instead of AbstractAwaitablePopup.
 * This follows the Odoo 19 pattern where popups are dialogs with resolve/reject callbacks.
 */
export class OfflineLoginPopup extends Component {
    static template = "PDCPOSOffline.OfflineLoginPopup";
    static components = { Dialog };
    static props = {
        close: Function,
        username: { type: String, optional: true },
        configData: { type: Object, optional: true },
        title: { type: String, optional: true },
        confirmText: { type: String, optional: true },
        cancelText: { type: String, optional: true },
    };
    static defaultProps = {
        confirmText: _t("Login Offline"),
        cancelText: _t("Cancel"),
        title: _t("Offline Authentication"),
    };

    setup() {
        this.state = useState({
            username: this.props.username || "",
            pin: "",
            error: "",
            isLoading: false,
        });
    }

    get canAuthenticate() {
        return this.state.pin.length === 4 && !this.state.isLoading;
    }

    get dialogTitle() {
        return this.props.title || _t("Offline Authentication");
    }

    onPinKeyup(ev) {
        // Clear error on new input
        if (this.state.error) {
            this.state.error = "";
        }

        // Auto-submit on 4 digits
        if (ev.key === "Enter" && this.canAuthenticate) {
            this.authenticate();
        }
    }

    async authenticate() {
        if (!this.canAuthenticate) return;

        this.state.isLoading = true;
        this.state.error = "";

        try {
            // Get user from cache by login
            const user = await offlineDB.getUserByLogin(this.state.username);

            if (!user) {
                this.state.error = _t("User not found in offline cache. Please login online first.");
                this.state.isLoading = false;
                return;
            }

            // Validate PIN using offlineAuth
            const pinHash = await this.hashPin(this.state.pin, user.id);

            if (user.pos_offline_pin_hash !== pinHash) {
                this.state.error = _t("Invalid PIN. Please try again.");
                this.state.pin = "";
                this.state.isLoading = false;
                return;
            }

            // Create offline session
            const sessionData = {
                id: `offline_${Date.now()}`,
                user_id: user.id,
                user_data: user,
                config_data: this.props.configData || {},
                offline_mode: true,
                authenticated_at: new Date().toISOString(),
            };

            await offlineDB.saveSession(sessionData);

            // Odoo 19: Use close callback with result object
            this.props.close({
                confirmed: true,
                payload: {
                    success: true,
                    session: sessionData,
                    user: user,
                },
            });

        } catch (error) {
            console.error("Offline authentication error:", error);
            this.state.error = _t("Authentication failed: ") + error.message;
            this.state.isLoading = false;
        }
    }

    async hashPin(pin, userId) {
        // SHA-256 hash with user ID as salt (matches server-side)
        const salt = String(userId);
        const pinWithSalt = `${pin}${salt}`;
        const msgBuffer = new TextEncoder().encode(pinWithSalt);
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    cancel() {
        // Odoo 19: Use close callback with result object
        this.props.close({
            confirmed: false,
            payload: {
                success: false,
                error: "User cancelled",
            },
        });
    }
}
