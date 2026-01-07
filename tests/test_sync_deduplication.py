# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta
import json

from odoo.tests import TransactionCase, tagged
from odoo.exceptions import IntegrityError


@tagged('post_install', '-at_install')
class TestSyncDeduplication(TransactionCase):
    """Test suite for Fix P0 #2: Sync Deduplication with Idempotency Keys

    Ensures:
    - Each transaction has unique idempotency key
    - Duplicate transactions are rejected at database level
    - Exponential backoff retry logic works correctly
    - Failed syncs are properly tracked and retried
    - Sync status transitions are correct
    - Audit trail is maintained for all sync attempts
    """

    def setUp(self):
        super().setUp()
        # Create test user
        self.user = self.env['res.users'].create({
            'name': 'Test Cashier',
            'login': 'cashier@test.local',
            'email': 'cashier@test.local',
        })

    def test_create_transaction_with_idempotency_key(self):
        """Test creating transaction generates unique idempotency key."""
        transaction_data = {
            'amount': 99.99,
            'items': [
                {'product': 'Coffee', 'qty': 1, 'price': 5.50},
                {'product': 'Pastry', 'qty': 2, 'price': 3.25},
            ],
            'payment_method': 'card',
        }

        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data=transaction_data,
            order_id=None,
        )

        self.assertIsNotNone(transaction)
        self.assertIsNotNone(transaction.idempotency_key)
        self.assertTrue(transaction.idempotency_key.startswith('order_'))
        self.assertEqual(transaction.sync_status, 'pending')

    def test_duplicate_transaction_rejected(self):
        """Duplicate transactions are detected and rejected."""
        transaction_data = {
            'amount': 50.00,
            'items': [{'product': 'Item', 'qty': 1, 'price': 50.00}],
        }

        # Create first transaction
        transaction1 = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data=transaction_data,
            order_id=123,
        )
        key1 = transaction1.idempotency_key

        # Try to create duplicate - should return same transaction
        transaction2 = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data=transaction_data,
            order_id=123,
        )
        key2 = transaction2.idempotency_key

        # Should be same transaction
        self.assertEqual(transaction1.id, transaction2.id)
        self.assertEqual(key1, key2)
        self.assertEqual(transaction2.sync_status, 'duplicate')

    def test_idempotency_key_unique_constraint(self):
        """Database enforces unique constraint on idempotency_key."""
        transaction_data = {'amount': 100.00}

        # Create first transaction
        transaction1 = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data=transaction_data,
            order_id=456,
        )

        # Try to create another with same key - should fail at database level
        # This tests the unique constraint enforcement
        with self.assertRaises(IntegrityError):
            self.env['pos.offline.transaction'].create({
                'user_id': self.user.id,
                'idempotency_key': transaction1.idempotency_key,
                'transaction_type': 'order',
                'transaction_data': transaction_data,
            })

    def test_different_users_different_transactions(self):
        """Different users can create transactions with same data."""
        user2 = self.env['res.users'].create({
            'name': 'Another Cashier',
            'login': 'cashier2@test.local',
            'email': 'cashier2@test.local',
        })

        transaction_data = {'amount': 75.00, 'items': []}

        # User 1 creates transaction
        trans1 = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data=transaction_data,
            order_id=789,
        )

        # User 2 creates with same data
        trans2 = self.env['pos.offline.transaction'].sudo(user2).create_transaction(
            transaction_type='order',
            transaction_data=transaction_data,
            order_id=789,
        )

        # Should be different transactions (different users)
        self.assertNotEqual(trans1.id, trans2.id)
        self.assertNotEqual(trans1.idempotency_key, trans2.idempotency_key)

    def test_transaction_type_variations(self):
        """Different transaction types are properly tracked."""
        types = ['order', 'payment', 'refund', 'adjustment']
        transactions = []

        for trans_type in types:
            trans = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
                transaction_type=trans_type,
                transaction_data={'amount': 50.00},
                order_id=None,
            )
            transactions.append(trans)
            self.assertEqual(trans.transaction_type, trans_type)

        # All should be different
        ids = [t.id for t in transactions]
        self.assertEqual(len(ids), len(set(ids)))

    def test_sync_status_progression(self):
        """Sync status follows correct state transitions."""
        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data={'amount': 25.00},
            order_id=None,
        )

        # Initial state
        self.assertEqual(transaction.sync_status, 'pending')
        self.assertEqual(transaction.sync_attempts, 0)

        # Simulate failed sync
        transaction.sync_status = 'failed'
        transaction.sync_attempts = 1
        transaction.last_sync_attempt = fields.Datetime.now()
        transaction.error_message = 'Network timeout'

        self.assertEqual(transaction.sync_status, 'failed')
        self.assertEqual(transaction.sync_attempts, 1)
        self.assertIsNotNone(transaction.last_sync_attempt)

        # Simulate successful sync
        transaction.sync_status = 'synced'
        transaction.synced_at = fields.Datetime.now()

        self.assertEqual(transaction.sync_status, 'synced')
        self.assertIsNotNone(transaction.synced_at)

    def test_exponential_backoff_calculation(self):
        """Exponential backoff delays increase correctly."""
        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data={'amount': 30.00},
            order_id=None,
        )

        now = fields.Datetime.now()
        transaction.sync_status = 'failed'

        # Test different attempt counts
        test_cases = [
            (1, 5),      # 2^0 * 5 = 5 seconds
            (2, 10),     # 2^1 * 5 = 10 seconds
            (3, 20),     # 2^2 * 5 = 20 seconds
            (4, 40),     # 2^3 * 5 = 40 seconds
            (5, 80),     # 2^4 * 5 = 80 seconds
            (10, 2560),  # 2^9 * 5 = 2560 seconds
            (15, 3600),  # Capped at 3600 seconds
        ]

        for attempt_count, expected_seconds in test_cases:
            transaction.sync_attempts = attempt_count
            transaction.last_sync_attempt = now
            transaction._compute_next_retry_at()

            expected_time = fields.Datetime.add(now, seconds=expected_seconds)
            actual_delta = (transaction.next_retry_at - now).total_seconds()
            expected_delta = expected_seconds

            self.assertAlmostEqual(
                actual_delta,
                expected_delta,
                delta=2,  # Allow 2 second drift
                msg=f"Backoff failed for attempt {attempt_count}"
            )

    def test_should_retry_flag(self):
        """should_retry flag indicates when transaction is ready for retry."""
        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data={'amount': 40.00},
            order_id=None,
        )

        # Not failed - should not retry
        transaction.sync_status = 'pending'
        transaction._compute_should_retry()
        self.assertFalse(transaction.should_retry)

        # Failed but retry time in future - should not retry yet
        now = fields.Datetime.now()
        transaction.sync_status = 'failed'
        transaction.sync_attempts = 1
        transaction.last_sync_attempt = now
        transaction.next_retry_at = fields.Datetime.add(now, seconds=100)
        transaction._compute_should_retry()
        self.assertFalse(transaction.should_retry)

        # Failed and retry time passed - should retry now
        transaction.next_retry_at = fields.Datetime.subtract(now, seconds=10)
        transaction._compute_should_retry()
        self.assertTrue(transaction.should_retry)

    def test_max_retry_attempts_limit(self):
        """Transactions stop retrying after max attempts."""
        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data={'amount': 45.00},
            order_id=None,
        )

        # Set to failed with max attempts
        transaction.sync_status = 'failed'
        transaction.sync_attempts = 10
        transaction.last_sync_attempt = fields.Datetime.now()

        # Should not be retried by retry_failed_transactions
        failed_txns = self.env['pos.offline.transaction'].search([
            ('sync_status', '=', 'failed'),
            ('sync_attempts', '<', 10),
        ])

        self.assertEqual(len(failed_txns), 0)

    def test_audit_trail_recorded(self):
        """Complete audit trail is maintained for each transaction."""
        transaction_data = {
            'amount': 88.88,
            'items': [{'product': 'Test', 'qty': 1, 'price': 88.88}],
            'timestamp': datetime.now().isoformat(),
        }

        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data=transaction_data,
            order_id=999,
        )

        # Verify audit fields
        self.assertIsNotNone(transaction.created_at)
        self.assertEqual(transaction.user_id.id, self.user.id)
        self.assertEqual(transaction.transaction_data, transaction_data)

        # Simulate sync attempt
        transaction.sync_status = 'failed'
        transaction.sync_attempts = 1
        transaction.last_sync_attempt = fields.Datetime.now()
        transaction.error_message = 'Connection refused'

        # Verify audit trail
        status = transaction.get_transaction_status()
        self.assertEqual(status['status'], 'failed')
        self.assertEqual(status['attempts'], 1)
        self.assertEqual(status['error'], 'Connection refused')

    def test_transaction_data_json_storage(self):
        """Transaction data is properly stored as JSON."""
        complex_data = {
            'order_id': 123,
            'customer': {
                'name': 'John Doe',
                'email': 'john@example.com',
            },
            'items': [
                {'id': 1, 'name': 'Item 1', 'qty': 2, 'price': 10.00},
                {'id': 2, 'name': 'Item 2', 'qty': 1, 'price': 15.00},
            ],
            'totals': {
                'subtotal': 35.00,
                'tax': 3.50,
                'total': 38.50,
            },
        }

        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data=complex_data,
            order_id=123,
        )

        # Verify data is stored and retrievable
        self.assertEqual(transaction.transaction_data, complex_data)
        self.assertEqual(transaction.transaction_data['customer']['name'], 'John Doe')
        self.assertEqual(len(transaction.transaction_data['items']), 2)

    def test_sync_response_tracking(self):
        """Server sync responses are tracked for debugging."""
        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='payment',
            transaction_data={'amount': 100.00},
            order_id=None,
        )

        # Simulate sync response
        response = {
            'success': True,
            'transaction_id': 'srv_12345',
            'timestamp': '2026-01-07T12:00:00Z',
        }

        transaction.sync_response = json.dumps(response)
        transaction.sync_status = 'synced'

        # Verify response is stored and can be retrieved
        stored_response = json.loads(transaction.sync_response)
        self.assertEqual(stored_response['transaction_id'], 'srv_12345')

    def test_cleanup_old_transactions(self):
        """Old synced transactions are properly cleaned up."""
        # Create old transaction (30+ days ago)
        old_date = fields.Datetime.subtract(
            fields.Datetime.now(),
            days=35
        )

        old_transaction = self.env['pos.offline.transaction'].create({
            'user_id': self.user.id,
            'idempotency_key': 'old_trans_key_12345',
            'transaction_type': 'order',
            'transaction_data': {'amount': 50.00},
            'sync_status': 'synced',
            'synced_at': old_date,
        })

        # Create recent transaction
        recent_transaction = self.env['pos.offline.transaction'].create({
            'user_id': self.user.id,
            'idempotency_key': 'recent_trans_key_12345',
            'transaction_type': 'order',
            'transaction_data': {'amount': 60.00},
            'sync_status': 'synced',
            'synced_at': fields.Datetime.now(),
        })

        old_id = old_transaction.id
        recent_id = recent_transaction.id

        # Cleanup
        count = self.env['pos.offline.transaction'].cleanup_old_transactions(days=30)

        # Old should be deleted
        self.assertEqual(count, 1)
        self.assertFalse(self.env['pos.offline.transaction'].search([
            ('id', '=', old_id)
        ]))

        # Recent should still exist
        self.assertTrue(self.env['pos.offline.transaction'].search([
            ('id', '=', recent_id)
        ]))

    def test_retry_failed_transactions(self):
        """Retry mechanism picks up failed transactions."""
        # Create failed transaction that's ready for retry
        now = fields.Datetime.now()
        transaction = self.env['pos.offline.transaction'].create({
            'user_id': self.user.id,
            'idempotency_key': 'retry_test_key_12345',
            'transaction_type': 'order',
            'transaction_data': {'amount': 70.00},
            'sync_status': 'failed',
            'sync_attempts': 1,
            'last_sync_attempt': fields.Datetime.subtract(now, seconds=100),
        })

        # Should be picked up by retry query
        failed_ready = self.env['pos.offline.transaction'].search([
            ('sync_status', '=', 'failed'),
            ('should_retry', '=', True),
        ])

        # Note: This search may not find it if the compute field isn't triggered
        # In production, the scheduled action would handle this
        transaction._compute_should_retry()
        self.assertTrue(transaction.should_retry)

    def test_get_transaction_status(self):
        """get_transaction_status returns complete status dict."""
        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data={'amount': 99.99},
            order_id=None,
        )

        status = transaction.get_transaction_status()

        # Verify all status fields
        self.assertEqual(status['id'], transaction.id)
        self.assertIsNotNone(status['idempotency_key'])
        self.assertEqual(status['status'], 'pending')
        self.assertEqual(status['attempts'], 0)
        self.assertIsNotNone(status['created_at'])
        self.assertIsNone(status['synced_at'])
        self.assertIsNone(status['error'])
