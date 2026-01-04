# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.
"""
Offline Password Authentication for POS Users.

Extends res.users with offline password support for POS authentication
when internet connectivity is unavailable.

SIMPLIFIED DESIGN (v2):
    - Uses SAME password as Odoo login (no separate PIN)
    - Password hash captured on successful online login
    - SHA-256 hash for client-side compatible verification
    - Automatic - no user setup required
"""

import hashlib
import logging

from odoo import _, api, fields, models

_logger = logging.getLogger(__name__)


def _compute_offline_hash(password, user_id):
    """Compute SHA-256 hash for offline authentication.

    Uses same algorithm as client-side JavaScript for compatibility.

    Args:
        password (str): User's password
        user_id (int): User ID used as salt

    Returns:
        str: Hex-encoded SHA-256 hash
    """
    salt = str(user_id)
    salted = f"{password}{salt}"
    return hashlib.sha256(salted.encode('utf-8')).hexdigest()


class ResUsers(models.Model):
    """Extension of res.users for offline POS authentication with password."""

    _inherit = 'res.users'

    pos_offline_auth_hash = fields.Char(
        string='POS Offline Auth Hash',
        copy=False,
        groups='base.group_system',
        help="SHA-256 hash of password for offline POS authentication. "
             "Automatically captured on successful login. "
             "Only accessible to system administrators."
    )

    # Legacy field - kept for backward compatibility during migration
    pos_offline_pin_hash = fields.Char(
        string='POS Offline PIN Hash (Legacy)',
        copy=False,
        groups='base.group_system',
        help="DEPRECATED: Use pos_offline_auth_hash instead. "
             "This field will be removed in a future version."
    )

    def _update_offline_auth_hash(self, password):
        """Update offline authentication hash on successful login.

        Called from login hooks to capture password for offline use.

        Args:
            password (str): User's plaintext password (only in memory during login)
        """
        self.ensure_one()
        if password:
            self.pos_offline_auth_hash = _compute_offline_hash(password, self.id)
            _logger.debug(f"Offline auth hash updated for user {self.id}")

    def _verify_offline_password(self, password):
        """Verify password against offline hash.

        Uses constant-time comparison to prevent timing attacks.

        Args:
            password (str): Password to verify

        Returns:
            bool: True if password matches, False otherwise
        """
        import hmac
        self.ensure_one()

        if not self.pos_offline_auth_hash or not password:
            return False

        computed_hash = _compute_offline_hash(password, self.id)
        # Wave 9 Fix: Use constant-time comparison to prevent timing attacks
        return hmac.compare_digest(self.pos_offline_auth_hash, computed_hash)

    @api.model
    def _check_credentials(self, password, env):
        """Override to capture password for offline auth on successful login."""
        # Call parent to validate credentials first
        result = super()._check_credentials(password, env)

        # If we get here, credentials are valid - capture for offline use
        try:
            user = env['res.users'].sudo().browse(env.uid)
            if user.exists():
                user._update_offline_auth_hash(password)
        except Exception as e:
            # Don't fail login if offline hash update fails
            _logger.warning(f"Failed to update offline auth hash: {e}")

        return result

    def write(self, vals):
        """Override to invalidate offline hash when password changes."""
        result = super().write(vals)

        # If password was changed, invalidate the offline hash
        # The new hash will be captured on next successful login
        if 'password' in vals:
            for user in self:
                if user.pos_offline_auth_hash:
                    _logger.info(f"[PDC-Offline] Invalidating offline hash for user {user.id} due to password change")
                    user.sudo().write({'pos_offline_auth_hash': False})

        return result
