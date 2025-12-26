# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosSession(models.Model):
    _inherit = 'pos.session'
    
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