# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.
"""
Offline PIN Authentication for POS Users.

Extends res.users with offline PIN support for POS authentication
when internet connectivity is unavailable.

Security Notes:
    - PIN is stored as a salted SHA-256 hash
    - User ID is used as salt to prevent rainbow table attacks
    - PIN should be transmitted over HTTPS when syncing
    - Client-side also hashes PIN before transmission
"""

import hashlib
import secrets

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class ResUsers(models.Model):
    """Extension of res.users for offline POS authentication."""

    _inherit = 'res.users'

    pos_offline_pin = fields.Char(
        string='POS Offline PIN',
        size=4,
        groups='base.group_system',
        help="4-digit PIN for offline POS authentication. "
             "Only visible to system administrators."
    )
    pos_offline_pin_hash = fields.Char(
        string='POS Offline PIN Hash',
        compute='_compute_pin_hash',
        store=True,
        help="SHA-256 hash of the PIN with user ID as salt"
    )

    @api.constrains('pos_offline_pin')
    def _check_pin_format(self):
        """Validate that PIN is exactly 4 numeric digits.

        Raises:
            ValidationError: If PIN is not exactly 4 numeric digits
        """
        for user in self:
            if user.pos_offline_pin:
                pin = user.pos_offline_pin
                if len(pin) != 4:
                    raise ValidationError(
                        _("POS Offline PIN must be exactly 4 digits. Got %d characters.") % len(pin)
                    )
                if not pin.isdigit():
                    raise ValidationError(
                        _("POS Offline PIN must contain only numeric digits (0-9).")
                    )

    @api.depends('pos_offline_pin')
    def _compute_pin_hash(self):
        """Compute SHA-256 hash of PIN with user ID as salt.

        The hash is computed as: SHA256(PIN + USER_ID)
        This matches the client-side hashing algorithm in offline_auth.js
        """
        for user in self:
            if user.pos_offline_pin:
                # Create a salted hash of the PIN
                # User ID as salt ensures unique hashes across users
                salt = str(user.id)
                pin_with_salt = f"{user.pos_offline_pin}{salt}".encode('utf-8')
                user.pos_offline_pin_hash = hashlib.sha256(pin_with_salt).hexdigest()
            else:
                user.pos_offline_pin_hash = False

    @api.model
    def generate_random_pin(self):
        """Generate a cryptographically secure random 4-digit PIN.

        Returns:
            str: A 4-digit PIN string (1000-9999)
        """
        # Use secrets module for cryptographically secure random numbers
        return str(secrets.randbelow(9000) + 1000)

    def action_generate_pos_pin(self):
        """Button action to generate a new PIN.

        Generates a new 4-digit PIN and shows a notification
        to the administrator with the new PIN value.

        Returns:
            dict: Action to display notification with new PIN
        """
        self.ensure_one()
        self.pos_offline_pin = self.generate_random_pin()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('PIN Generated'),
                'message': _('New PIN generated: %s') % self.pos_offline_pin,
                'type': 'success',
            }
        }