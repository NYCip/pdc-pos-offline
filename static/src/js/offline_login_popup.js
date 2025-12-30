/** @odoo-module */

// Odoo 19: AbstractAwaitablePopup was REMOVED
// Convert to standard OWL Component with Dialog service pattern
import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { offlineDB } from "./offline_db";
import { createOfflineAuth } from "./offline_auth";

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
            attemptsRemaining: 5,
            isLocked: false,
            lockoutMinutes: 0,
        });
        // Create OfflineAuth instance for brute force protection
        // Note: env may be undefined in popup context, so pass minimal env
        this.offlineAuth = createOfflineAuth({});
        this.offlineAuth.init().catch(err => {
            console.warn('[PDC-Offline] OfflineAuth init in popup:', err);
        });
    }

    get canAuthenticate() {
        return this.state.pin.length === 4 && !this.state.isLoading && !this.state.isLocked;
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
            // Use OfflineAuth for brute force protected authentication
            const result = await this.offlineAuth.authenticateOffline(
                this.state.username,
                this.state.pin
            );

            if (!result.success) {
                // Handle lockout
                if (result.locked) {
                    this.state.isLocked = true;
                    this.state.lockoutMinutes = result.remainingMinutes || 15;
                    this.state.error = _t("Account temporarily locked. Please wait %s minute(s) before trying again.", this.state.lockoutMinutes);
                } else if (result.attemptsRemaining !== undefined) {
                    this.state.attemptsRemaining = result.attemptsRemaining;
                    this.state.error = result.error || _t("Invalid PIN. %s attempt(s) remaining.", result.attemptsRemaining);
                } else {
                    this.state.error = result.error || _t("Authentication failed. Please try again.");
                }
                this.state.pin = "";
                this.state.isLoading = false;
                return;
            }

            // Successful authentication - session already created by OfflineAuth
            const sessionData = result.session;

            // Odoo 19: Use close callback with result object
            this.props.close({
                confirmed: true,
                payload: {
                    success: true,
                    session: sessionData,
                    user: sessionData.user_data,
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
