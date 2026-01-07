# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from odoo.tests import TransactionCase, tagged
from odoo.exceptions import ValidationError


@tagged('post_install', '-at_install')
class TestSessionCollision(TransactionCase):
    """Test suite for Fix P0 #1: Multi-Tab Session Collision

    Ensures:
    - Different users have different session keys
    - Different tabs have different sessions for same user
    - Sessions expire after configured timeout
    - Expired sessions cannot be used
    - Session expiry validation works correctly
    """

    def setUp(self):
        super().setUp()
        # Create test users
        self.user1 = self.env['res.users'].create({
            'name': 'Test User 1',
            'login': 'user1@test.local',
            'email': 'user1@test.local',
            'offline_session_timeout': 3600,  # 1 hour
        })

        self.user2 = self.env['res.users'].create({
            'name': 'Test User 2',
            'login': 'user2@test.local',
            'email': 'user2@test.local',
            'offline_session_timeout': 7200,  # 2 hours
        })

    def test_create_offline_session(self):
        """Test creating offline session for user."""
        session = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='tab_123_user1'
        )

        self.assertIsNotNone(session)
        self.assertEqual(session.user_id.id, self.user1.id)
        self.assertEqual(session.session_key, 'tab_123_user1')
        self.assertTrue(session.is_active)

    def test_different_users_different_sessions(self):
        """Different users must have completely different sessions."""
        # Create session for user1
        session1 = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='user1_session'
        )

        # Create session for user2
        session2 = self.env['pos.offline.session'].sudo(self.user2).create_offline_session(
            session_key='user2_session'
        )

        # Sessions must be different
        self.assertNotEqual(session1.id, session2.id)
        self.assertNotEqual(session1.user_id.id, session2.user_id.id)
        self.assertNotEqual(session1.session_key, session2.session_key)

    def test_session_key_uniqueness(self):
        """Session keys must be globally unique (cannot reuse key)."""
        # Create session with key
        session1 = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='unique_key_123'
        )

        # Try to create another session with same key - should fail
        with self.assertRaises(Exception):  # Will be database integrity error
            session2 = self.env['pos.offline.session'].create({
                'user_id': self.user2.id,
                'session_key': 'unique_key_123',  # Same key!
            })

    def test_session_expiry_calculation(self):
        """Session expiry is calculated correctly based on timeout."""
        session = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='test_expiry'
        )

        # Calculate expected expiry: created_at + timeout
        expected_delta = timedelta(seconds=3600)  # user1 has 3600s timeout
        actual_delta = session.expires_at - session.created_at

        # Should be approximately equal (allowing for small time drift)
        self.assertAlmostEqual(
            actual_delta.total_seconds(),
            expected_delta.total_seconds(),
            delta=2  # Allow 2 seconds drift
        )

    def test_session_expiry_enforcement(self):
        """Sessions must be marked inactive after expiry time passes."""
        session = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='expiry_test'
        )

        # Initially active
        self.assertTrue(session.is_active)

        # Simulate time passing - set created_at to 2 hours ago
        # user1 has 3600s (1 hour) timeout, so this should be expired
        session.created_at = self.env['ir.fields.datetime'].subtract(
            self.env['ir.fields.datetime'].now(),
            seconds=7200  # 2 hours ago
        )
        session.store()

        # Should now be inactive
        self.assertFalse(session.is_active)

    def test_verify_active_session(self):
        """Can verify active session exists and belongs to user."""
        session = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='verify_test'
        )

        # Should be able to verify
        verified = self.env['pos.offline.session'].sudo(self.user1).verify_session(
            'verify_test'
        )

        self.assertEqual(verified.id, session.id)

    def test_verify_expired_session_fails(self):
        """Cannot verify expired session."""
        session = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='expire_verify_test'
        )

        # Simulate expiry
        session.created_at = self.env['ir.fields.datetime'].subtract(
            self.env['ir.fields.datetime'].now(),
            seconds=7200  # Well past 1 hour timeout
        )
        session.store()

        # Should fail to verify
        with self.assertRaises(Exception):  # UserError
            self.env['pos.offline.session'].sudo(self.user1).verify_session(
                'expire_verify_test'
            )

    def test_verify_wrong_user_fails(self):
        """Cannot verify session created by different user."""
        # Create session for user1
        session = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='user1_only'
        )

        # Try to verify as user2
        with self.assertRaises(Exception):
            self.env['pos.offline.session'].sudo(self.user2).verify_session(
                'user1_only'
            )

    def test_refresh_session(self):
        """Refreshing session extends expiry time."""
        session = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='refresh_test'
        )

        created_at_original = session.created_at
        expires_at_original = session.expires_at

        # Wait a moment (in test, we simulate with time manipulation)
        # Then refresh
        session.created_at = created_at_original - timedelta(seconds=1800)  # 30 min ago
        session.store()

        # Refresh
        result = session.refresh_session()

        self.assertTrue(result['success'])
        # New expiry should be later than original
        self.assertGreater(session.expires_at, expires_at_original)

    def test_logout_session(self):
        """Logout removes session."""
        session = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='logout_test'
        )

        session_id = session.id
        session.logout_session()

        # Session should be deleted
        self.assertFalse(self.env['pos.offline.session'].search([
            ('id', '=', session_id)
        ]))

    def test_session_timeout_validation(self):
        """Session timeout must be between 1-24 hours."""
        # Too short
        with self.assertRaises(ValidationError):
            self.user1.offline_session_timeout = 1800  # 30 minutes
            self.user1.store()

        # Too long
        with self.assertRaises(ValidationError):
            self.user1.offline_session_timeout = 172800  # 48 hours
            self.user1.store()

        # Valid (1 hour)
        self.user1.offline_session_timeout = 3600
        self.user1.store()  # Should not raise

        # Valid (8 hours)
        self.user1.offline_session_timeout = 28800
        self.user1.store()  # Should not raise

        # Valid (24 hours)
        self.user1.offline_session_timeout = 86400
        self.user1.store()  # Should not raise

    def test_get_session_status(self):
        """Get session status information."""
        session = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='status_test'
        )

        status = session.get_session_status()

        self.assertTrue(status['valid'])
        self.assertEqual(status['user_id'], self.user1.id)
        self.assertTrue(status['is_active'])
        self.assertGreater(status['seconds_remaining'], 3500)  # Should be ~3600
        self.assertLess(status['seconds_remaining'], 3610)

    def test_cleanup_expired_sessions(self):
        """Cleanup removes expired sessions."""
        # Create active session
        session_active = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='active_cleanup'
        )

        # Create expired session
        session_expired = self.env['pos.offline.session'].sudo(self.user2).create_offline_session(
            session_key='expired_cleanup'
        )
        # Mark as expired
        session_expired.created_at = self.env['ir.fields.datetime'].subtract(
            self.env['ir.fields.datetime'].now(),
            seconds=86400  # 24 hours ago (expired even with 8 hour default)
        )
        session_expired.store()

        active_id = session_active.id
        expired_id = session_expired.id

        # Cleanup
        self.env['pos.offline.session'].cleanup_expired_sessions()

        # Active should remain
        self.assertTrue(self.env['pos.offline.session'].search([
            ('id', '=', active_id)
        ]))

        # Expired should be deleted
        self.assertFalse(self.env['pos.offline.session'].search([
            ('id', '=', expired_id)
        ]))

    def test_multi_tab_same_user(self):
        """Same user can have multiple sessions for different tabs."""
        # Create two sessions for same user (simulating two browser tabs)
        session_tab1 = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='user1_tab1',
            browser_tab='tab_1'
        )

        session_tab2 = self.env['pos.offline.session'].sudo(self.user1).create_offline_session(
            session_key='user1_tab2',
            browser_tab='tab_2'
        )

        # Both sessions exist and are active
        self.assertTrue(session_tab1.is_active)
        self.assertTrue(session_tab2.is_active)

        # But they're different sessions
        self.assertNotEqual(session_tab1.id, session_tab2.id)
        self.assertNotEqual(session_tab1.session_key, session_tab2.session_key)
        self.assertNotEqual(session_tab1.browser_tab, session_tab2.browser_tab)
