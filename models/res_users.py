# -*- coding: utf-8 -*-
# Copyright 2024-2026 POS.com
# Part of POS.com Retail Management System
"""
PDC POS Offline v2.0 - Minimal res.users extension.

These fields exist in the database from v1 and must remain defined
to prevent Odoo errors. They are NOT USED in v2.0.

v2.0 uses NATIVE Odoo 19 authentication:
- hr.employee._pin (SHA-1 hash)
- select_cashier_mixin.js for PIN validation
"""

from odoo import fields, models


class ResUsers(models.Model):
    """Backward compatibility: keeps DB columns from v1."""

    _inherit = 'res.users'

    # v1 fields - kept for DB compatibility, NOT USED in v2.0
    offline_session_timeout = fields.Integer(
        string='Offline Session Timeout (DEPRECATED)',
        default=480,
        help='DEPRECATED: v2.0 uses native Odoo 19 authentication',
    )
    pos_offline_auth_hash = fields.Char(
        string='Offline Auth Hash (DEPRECATED)',
        help='DEPRECATED: v2.0 uses hr.employee._pin (SHA-1)',
    )
    pos_offline_pin_hash = fields.Char(
        string='Offline PIN Hash (DEPRECATED)',
        help='DEPRECATED: v2.0 uses hr.employee._pin (SHA-1)',
    )
