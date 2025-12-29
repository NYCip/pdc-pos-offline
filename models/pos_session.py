# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosSession(models.Model):
    _inherit = 'pos.session'

    # Fields for offline sync tracking (used by sync_manager.js)
    last_sync_date = fields.Datetime(
        string='Last Sync Date',
        help='Last time this session was synced from offline mode',
        readonly=True,
    )
    offline_transactions_count = fields.Integer(
        string='Offline Transactions Count',
        help='Number of pending offline transactions waiting to sync',
        default=0,
        readonly=True,
    )

    @api.model
    def get_pos_ui_user_data(self, user_id):
        """Get user data for POS UI including offline PIN hash"""
        user = self.env['res.users'].browse(user_id)
        return {
            'id': user.id,
            'name': user.name,
            'login': user.login,
            'pos_offline_pin_hash': user.pos_offline_pin_hash,
            'employee_ids': user.employee_ids.ids,
            'partner_id': user.partner_id.id,
        }