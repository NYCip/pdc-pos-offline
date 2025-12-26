# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosConfig(models.Model):
    _inherit = 'pos.config'
    
    # Offline Mode Settings
    enable_offline_mode = fields.Boolean(
        string='Enable Offline Mode',
        default=True,
        help='Allow POS to operate without internet connection'
    )
    
    offline_session_timeout = fields.Integer(
        string='Offline Session Timeout',
        default=24,
        help='Hours before offline session expires'
    )
    
    offline_data_limit = fields.Integer(
        string='Offline Storage Limit (MB)',
        default=500,
        help='Maximum storage for offline data'
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
    
    offline_max_attempts = fields.Integer(
        string='Max PIN Attempts',
        default=5,
        help='Maximum failed attempts before lockout'
    )