# -*- coding: utf-8 -*-
"""
Test JS-to-Python Field Synchronization

This test validates that all fields referenced in JavaScript ORM calls
actually exist in the corresponding Python models.

Use Case: Detect runtime RPC errors caused by JS code trying to write
to fields that don't exist in Python models.
"""
import re
import os
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install', 'pdc_offline')
class TestJsPythonFieldSync(TransactionCase):
    """Test that JS ORM calls reference valid Python model fields."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Models that the JS code writes to
        cls.models_to_check = {
            'pos.session': cls.env['pos.session'],
            'res.users': cls.env['res.users'],
            'pos.config': cls.env['pos.config'],
        }

    def test_pos_session_offline_fields_exist(self):
        """
        UC-OFFLINE-001: Verify offline sync fields exist on pos.session

        Root Cause Prevention:
        - sync_manager.js writes last_sync_date, offline_transactions_count
        - These fields MUST exist on pos.session model
        - If missing, ORM write fails with 'Odoo Server Error'

        Detection: This test fails if fields are removed from Python but
        still referenced in JavaScript.
        """
        PosSession = self.env['pos.session']
        required_fields = [
            'last_sync_date',
            'offline_transactions_count',
        ]

        for field_name in required_fields:
            self.assertIn(
                field_name,
                PosSession._fields,
                f"Field '{field_name}' missing from pos.session model. "
                f"This field is required by sync_manager.js syncSessionData(). "
                f"Add it to pdc_pos_offline/models/pos_session.py"
            )

    def test_res_users_offline_fields_exist(self):
        """
        UC-OFFLINE-002: Verify offline auth fields exist on res.users

        Root Cause Prevention:
        - offline_auth.js reads pos_offline_pin_hash from users
        - sync_manager.js reads this field during cache update
        - Field MUST exist for offline PIN authentication to work
        """
        ResUsers = self.env['res.users']
        required_fields = [
            'pos_offline_pin_hash',
        ]

        for field_name in required_fields:
            self.assertIn(
                field_name,
                ResUsers._fields,
                f"Field '{field_name}' missing from res.users model. "
                f"This field is required by offline_auth.js for PIN authentication. "
                f"Add it to pdc_pos_offline/models/res_users.py"
            )

    def test_pos_session_fields_are_writable(self):
        """
        UC-OFFLINE-003: Verify sync fields can be written to pos.session

        This tests that the fields are not only defined but can actually
        be written to (e.g., not compute fields without inverse).
        """
        # Create a test POS config and session
        config = self.env['pos.config'].create({
            'name': 'Test Offline Config',
        })

        # Open a session
        session = self.env['pos.session'].create({
            'config_id': config.id,
            'user_id': self.env.user.id,
        })

        # Try to write the sync fields (this is what JS does)
        try:
            from datetime import datetime
            session.write({
                'last_sync_date': datetime.now(),
                'offline_transactions_count': 5,
            })
        except Exception as e:
            self.fail(
                f"Failed to write offline sync fields to pos.session: {e}. "
                f"Ensure fields are defined with readonly=True (can still write via code) "
                f"or check field definition in pos_session.py"
            )

        # Verify values were written
        self.assertEqual(session.offline_transactions_count, 5)
        self.assertIsNotNone(session.last_sync_date)

        # Cleanup
        session.action_pos_session_closing_control()
        config.unlink()

    def test_js_orm_write_fields_documented(self):
        """
        UC-OFFLINE-004: Documentation check for JS-Python field dependencies

        This test serves as documentation of which JS files write to which
        Python model fields. Update this test when adding new ORM writes.
        """
        js_python_dependencies = {
            'sync_manager.js': {
                'pos.session': ['last_sync_date', 'offline_transactions_count'],
            },
            'offline_auth.js': {
                'res.users': ['pos_offline_pin_hash'],  # read only
            },
        }

        # Verify all documented fields exist
        for js_file, model_fields in js_python_dependencies.items():
            for model_name, fields in model_fields.items():
                if model_name in self.models_to_check:
                    model = self.models_to_check[model_name]
                    for field_name in fields:
                        self.assertIn(
                            field_name,
                            model._fields,
                            f"JS file '{js_file}' references '{model_name}.{field_name}' "
                            f"but field doesn't exist in Python model."
                        )
