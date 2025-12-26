# -*- coding: utf-8 -*-
from odoo import models, fields, api
import hashlib
import random


class ResUsers(models.Model):
    _inherit = 'res.users'

    pos_offline_pin = fields.Char(
        string='POS Offline PIN',
        size=4,
        help='4-digit PIN for offline POS authentication'
    )
    pos_offline_pin_hash = fields.Char(
        string='POS Offline PIN Hash',
        compute='_compute_pin_hash',
        store=True
    )
    
    @api.depends('pos_offline_pin')
    def _compute_pin_hash(self):
        for user in self:
            if user.pos_offline_pin:
                # Create a salted hash of the PIN
                salt = str(user.id)
                pin_with_salt = f"{user.pos_offline_pin}{salt}".encode('utf-8')
                user.pos_offline_pin_hash = hashlib.sha256(pin_with_salt).hexdigest()
            else:
                user.pos_offline_pin_hash = False
    
    @api.model
    def generate_random_pin(self):
        """Generate a random 4-digit PIN"""
        return str(random.randint(1000, 9999))
    
    def action_generate_pos_pin(self):
        """Button action to generate a new PIN"""
        self.ensure_one()
        self.pos_offline_pin = self.generate_random_pin()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'PIN Generated',
                'message': f'New PIN generated: {self.pos_offline_pin}',
                'type': 'success',
            }
        }