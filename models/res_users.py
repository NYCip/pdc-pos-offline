# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.
"""
Offline PIN Authentication for POS Users with Argon2id Security.

Extends res.users with offline PIN support for POS authentication
when internet connectivity is unavailable.

Security Features:
    - Argon2id password hashing (memory-hard, OWASP-recommended)
    - Parameters: time_cost=3, memory_cost=64MB, parallelism=4
    - No plaintext PIN storage
    - Automatic rehashing when parameters change
    - PIN format validation (exactly 4 digits)
"""

import secrets
import logging
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHash

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)

# Argon2id password hasher with OWASP-recommended parameters
_ph = PasswordHasher(
    time_cost=3,           # 3 iterations
    memory_cost=65536,     # 64 MB
    parallelism=4,         # 4 parallel threads
    hash_len=32,           # 32-byte hash output
    salt_len=16,           # 16-byte random salt
)


class ResUsers(models.Model):
    """Extension of res.users for offline POS authentication with Argon2id security."""

    _inherit = 'res.users'

    pdc_pin_hash = fields.Char(
        string='PDC PIN Hash',
        copy=False,
        groups='base.group_system',
        help="Argon2id hash of the 4-digit PIN for offline POS authentication. "
             "Only accessible to system administrators."
    )

    # Temporary field for PIN input (never stored in database)
    pdc_pin = fields.Char(
        string='Set PDC PIN',
        compute='_compute_pdc_pin',
        inverse='_inverse_pdc_pin',
        groups='base.group_system',
        help="Enter a 4-digit PIN. Will be hashed with Argon2id before storage."
    )

    @api.depends('pdc_pin_hash')
    def _compute_pdc_pin(self):
        """Compute method for pdc_pin field (always returns empty for security)."""
        for user in self:
            user.pdc_pin = ''

    def _inverse_pdc_pin(self):
        """Inverse method to hash and store PIN when set."""
        for user in self:
            if user.pdc_pin:
                user._set_pin(user.pdc_pin)
                user.pdc_pin = ''  # Clear after hashing

    def _set_pin(self, pin):
        """Hash and store PIN using Argon2id.

        Args:
            pin (str): 4-digit PIN to hash and store

        Raises:
            ValidationError: If PIN format is invalid
        """
        self.ensure_one()

        # Validate PIN format
        if not pin or len(pin) != 4 or not pin.isdigit():
            raise ValidationError(
                _("PIN must be exactly 4 numeric digits.")
            )

        # Hash with Argon2id and store
        self.pdc_pin_hash = _ph.hash(pin)
        _logger.info(f"PIN hash created for user {self.id} ({self.name})")

    def _verify_pin(self, pin):
        """Verify PIN against Argon2id hash with constant-time comparison.

        Args:
            pin (str): PIN to verify

        Returns:
            bool: True if PIN matches, False otherwise
        """
        self.ensure_one()

        if not self.pdc_pin_hash or not pin:
            return False

        try:
            # Verify with constant-time comparison
            _ph.verify(self.pdc_pin_hash, pin)

            # Check if rehashing needed (parameters changed)
            if _ph.check_needs_rehash(self.pdc_pin_hash):
                _logger.info(f"Rehashing PIN for user {self.id} with updated parameters")
                self.pdc_pin_hash = _ph.hash(pin)

            return True

        except (VerifyMismatchError, VerificationError, InvalidHash):
            return False

    @api.model
    def generate_random_pin(self):
        """Generate a cryptographically secure random 4-digit PIN.

        Returns:
            str: A 4-digit PIN string (1000-9999)
        """
        return str(secrets.randbelow(9000) + 1000)

    def action_generate_pos_pin(self):
        """Button action to generate a new PIN.

        Generates a new 4-digit PIN and shows a notification
        to the administrator with the new PIN value.

        Returns:
            dict: Action to display notification with new PIN
        """
        self.ensure_one()
        new_pin = self.generate_random_pin()
        self._set_pin(new_pin)

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('PIN Generated'),
                'message': _('New PIN generated: %s\n\nThis PIN has been securely hashed with Argon2id.') % new_pin,
                'type': 'success',
            }
        }

    @api.model
    def create(self, vals):
        """Override create to hash PIN if provided."""
        if 'pdc_pin' in vals and vals['pdc_pin']:
            # Store PIN temporarily
            pin = vals.pop('pdc_pin')
            # Create user first
            user = super().create(vals)
            # Then hash and store PIN
            user._set_pin(pin)
            return user
        return super().create(vals)

    def write(self, vals):
        """Override write to hash PIN if provided."""
        if 'pdc_pin' in vals and vals['pdc_pin']:
            pin = vals.pop('pdc_pin')
            result = super().write(vals)
            # Hash and store PIN for all users in recordset
            for user in self:
                user._set_pin(pin)
            return result
        return super().write(vals)
