# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # Offline Mode Settings
    # Note: The following fields were removed in the security simplification:
    # - offline_session_timeout: Sessions no longer expire (simplicity over security theater)
    # - offline_data_limit: Never enforced, browser handles storage limits
    # - offline_max_attempts: Client-side lockout removed (ineffective security)

    enable_offline_mode = fields.Boolean(
        string='Enable Offline Mode',
        default=True,
        help='Allow POS to operate without internet connection'
    )

    offline_sync_interval = fields.Integer(
        string='Sync Interval (minutes)',
        default=5,
        help='How often to sync when back online'
    )

    offline_pin_required = fields.Boolean(
        string='Require PIN for Offline',
        default=True,
        help='Require PIN authentication for offline access'
    )