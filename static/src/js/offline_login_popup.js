/** @odoo-module */

// Odoo 19: AbstractAwaitablePopup was REMOVED
// Convert to standard OWL Component with Dialog service pattern
import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { offlineDB } from "./offline_db";
import { createOfflineAuth, hashPassword } from "./offline_auth";

/**
 * OfflineLoginPopup - OWL Component for offline password authentication
 *
 * SIMPLIFIED v2: Uses same password as Odoo login (no separate PIN)
 *
 * Odoo 19 compatible: Uses Dialog wrapper component instead of AbstractAwaitablePopup.
 * This follows the Odoo 19 pattern where popups are dialogs with resolve/reject callbacks.
 *
 * Note: No brute-force lockout - users can retry indefinitely (product decision).
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
            password: "",
            error: "",
            isLoading: false,
            cachedUsers: [],
        });
        // Create OfflineAuth instance for password validation
        // Note: env may be undefined in popup context, so pass minimal env
        this.offlineAuth = createOfflineAuth({});
        this.offlineAuth.init().catch(err => {
            console.warn('[PDC-Offline] OfflineAuth init in popup:', err);
        });

        // Load cached users on mount
        this._loadCachedUsers();
    }

    async _loadCachedUsers() {
        try {
            const users = await offlineDB.getAllUsers();
            // Only show users that have offline auth hash
            this.state.cachedUsers = users.filter(u => u.pos_offline_auth_hash);
        } catch (e) {
            console.warn('[PDC-Offline] Could not load cached users:', e);
        }
    }

    get canAuthenticate() {
        // Password can be any length (no 4-digit restriction)
        // Also require username to be selected/entered
        return this.state.username.length > 0 && this.state.password.length > 0 && !this.state.isLoading;
    }

    get dialogTitle() {
        return this.props.title || _t("Offline Authentication");
    }

    onPasswordKeyup(ev) {
        // Clear error on new input
        if (this.state.error) {
            this.state.error = "";
        }

        // Submit on Enter
        if (ev.key === "Enter" && this.canAuthenticate) {
            this.authenticate();
        }
    }

    async authenticate() {
        if (!this.canAuthenticate) return;

        this.state.isLoading = true;
        this.state.error = "";

        try {
            // Use OfflineAuth for password validation (no lockout)
            const result = await this.offlineAuth.authenticateOffline(
                this.state.username,
                this.state.password
            );

            if (!result.success) {
                // Simple error display - no lockout logic
                this.state.error = result.error || _t("Incorrect password. Please try again.");
                this.state.password = "";
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
