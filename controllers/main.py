# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
import json


class PDCPOSOfflineController(http.Controller):
    
    @http.route('/pdc_pos_offline/validate_pin', type='json', auth='public', website=True)
    def validate_pin(self, user_id, pin_hash, **kw):
        """Validate offline PIN hash for a user"""
        user = request.env['res.users'].sudo().browse(user_id)
        if user.exists() and user.pos_offline_pin_hash == pin_hash:
            return {
                'success': True,
                'user_data': {
                    'id': user.id,
                    'name': user.name,
                    'login': user.login,
                }
            }
        return {'success': False}