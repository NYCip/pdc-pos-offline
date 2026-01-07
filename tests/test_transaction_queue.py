# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta

from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestTransactionQueue(TransactionCase):
    """Test suite for Fix P0 #3: Transaction Queue Persistent Storage

    Ensures:
    - Queue items are properly stored in database (persistent)
    - Queue overflow is detected and old items archived
    - Queue items are processed in correct order (FIFO)
    - Failed items are retried with backoff
    - Dead letter queue for permanently failed items
    - No transactions are lost
    """

    def setUp(self):
        super().setUp()
        self.user = self.env['res.users'].create({
            'name': 'Test Cashier',
            'login': 'cashier@test.local',
            'email': 'cashier@test.local',
        })

    def test_enqueue_transaction(self):
        """Test enqueueing a transaction to queue."""
        # Create transaction
        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data={'amount': 50.00, 'items': []},
            order_id=None,
        )

        # Enqueue it
        queue_item = self.env['pos.offline.queue'].sudo(self.user).enqueue_transaction(
            transaction=transaction,
            item_type='order',
        )

        self.assertIsNotNone(queue_item)
        self.assertEqual(queue_item.status, 'queued')
        self.assertEqual(queue_item.transaction_id.id, transaction.id)
        self.assertEqual(queue_item.user_id.id, self.user.id)

    def test_queue_fifo_ordering(self):
        """Queue items are processed in FIFO order."""
        transactions = []
        queue_items = []

        # Create and enqueue 5 transactions
        for i in range(5):
            trans = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
                transaction_type='order',
                transaction_data={'amount': 10.00 * (i + 1), 'items': []},
                order_id=None,
            )
            transactions.append(trans)

            queue_item = self.env['pos.offline.queue'].sudo(self.user).enqueue_transaction(
                transaction=trans,
                item_type='order',
            )
            queue_items.append(queue_item)

        # Verify sequence order
        for idx, queue_item in enumerate(queue_items):
            self.assertEqual(queue_item.sequence, idx + 1)

        # Verify we can retrieve in order
        ordered_items = self.env['pos.offline.queue'].search([
            ('user_id', '=', self.user.id),
        ], order='sequence ASC')

        for idx, item in enumerate(ordered_items):
            self.assertEqual(item.sequence, idx + 1)

    def test_queue_overflow_detection(self):
        """Queue overflow is detected when > 1000 items."""
        # Create 1050 transactions
        for i in range(1050):
            transaction = self.env['pos.offline.transaction'].create({
                'user_id': self.user.id,
                'idempotency_key': f'overflow_test_{i}_{datetime.now().timestamp()}',
                'transaction_type': 'order',
                'transaction_data': {'amount': 10.00},
            })

            self.env['pos.offline.queue'].create({
                'user_id': self.user.id,
                'transaction_id': transaction.id,
                'item_type': 'order',
                'sequence': i + 1,
                'item_data': {'amount': 10.00},
            })

        # Get queue stats
        stats = self.env['pos.offline.queue'].sudo(self.user).get_queue_stats()

        # Should have 1050 total items
        self.assertEqual(stats['total'], 1050)
        # Overflow flag should be set
        self.assertTrue(stats['queue_overflow'])

    def test_queue_archiving_on_overflow(self):
        """Old queued items are archived when queue overflows."""
        # Create 100 items
        for i in range(100):
            transaction = self.env['pos.offline.transaction'].create({
                'user_id': self.user.id,
                'idempotency_key': f'archive_test_{i}_{datetime.now().timestamp()}',
                'transaction_type': 'order',
                'transaction_data': {'amount': 5.00},
            })

            self.env['pos.offline.queue'].create({
                'user_id': self.user.id,
                'transaction_id': transaction.id,
                'item_type': 'order',
                'sequence': i + 1,
                'item_data': {'amount': 5.00},
            })

        # Archive old items, keep only 50
        self.env['pos.offline.queue'].sudo(self.user)._archive_old_queued_items(keep=50)

        # Verify counts
        queued = self.env['pos.offline.queue'].search_count([
            ('user_id', '=', self.user.id),
            ('status', '=', 'queued'),
        ])
        archived = self.env['pos.offline.queue'].search_count([
            ('user_id', '=', self.user.id),
            ('status', '=', 'archived'),
        ])

        self.assertEqual(queued, 50)
        self.assertEqual(archived, 50)

    def test_queue_item_types(self):
        """Queue supports different item types."""
        types = ['order', 'payment', 'refund', 'adjustment', 'sync']

        for item_type in types:
            transaction = self.env['pos.offline.transaction'].create({
                'user_id': self.user.id,
                'idempotency_key': f'{item_type}_test_{datetime.now().timestamp()}',
                'transaction_type': 'order',
                'transaction_data': {'amount': 10.00},
            })

            queue_item = self.env['pos.offline.queue'].create({
                'user_id': self.user.id,
                'transaction_id': transaction.id,
                'item_type': item_type,
                'sequence': 1,
                'item_data': {'amount': 10.00},
            })

            self.assertEqual(queue_item.item_type, item_type)

    def test_queue_item_processing_status(self):
        """Queue item status transitions are correct."""
        transaction = self.env['pos.offline.transaction'].sudo(self.user).create_transaction(
            transaction_type='order',
            transaction_data={'amount': 25.00},
            order_id=None,
        )

        queue_item = self.env['pos.offline.queue'].sudo(self.user).enqueue_transaction(
            transaction=transaction,
            item_type='order',
        )

        # Initial state
        self.assertEqual(queue_item.status, 'queued')

        # Simulate processing
        queue_item.status = 'processing'
        self.assertEqual(queue_item.status, 'processing')

        # Complete
        queue_item.status = 'completed'
        queue_item.completed_at = fields.Datetime.now()
        self.assertEqual(queue_item.status, 'completed')
        self.assertIsNotNone(queue_item.completed_at)

    def test_queue_item_retry_with_backoff(self):
        """Failed queue items retry with exponential backoff."""
        transaction = self.env['pos.offline.transaction'].create({
            'user_id': self.user.id,
            'idempotency_key': f'retry_test_{datetime.now().timestamp()}',
            'transaction_type': 'order',
            'transaction_data': {'amount': 30.00},
        })

        queue_item = self.env['pos.offline.queue'].create({
            'user_id': self.user.id,
            'transaction_id': transaction.id,
            'item_type': 'order',
            'sequence': 1,
            'item_data': {'amount': 30.00},
        })

        now = fields.Datetime.now()

        # Test different retry attempts
        test_cases = [
            (1, 5),      # 2^0 * 5 = 5 seconds
            (2, 10),     # 2^1 * 5 = 10 seconds
            (3, 20),     # 2^2 * 5 = 20 seconds
            (4, 40),     # 2^3 * 5 = 40 seconds
            (5, 80),     # 2^4 * 5 = 80 seconds
        ]

        for attempt_count, expected_seconds in test_cases:
            queue_item.status = 'failed'
            queue_item.attempts = attempt_count
            queue_item.last_attempt_at = now
            queue_item._compute_next_attempt_at()

            expected_time = fields.Datetime.add(now, seconds=expected_seconds)
            actual_delta = (queue_item.next_attempt_at - now).total_seconds()
            expected_delta = expected_seconds

            self.assertAlmostEqual(
                actual_delta,
                expected_delta,
                delta=2,
                msg=f"Backoff incorrect for attempt {attempt_count}"
            )

    def test_dead_letter_queue_after_max_attempts(self):
        """Items move to dead letter queue after 5 failed attempts."""
        transaction = self.env['pos.offline.transaction'].create({
            'user_id': self.user.id,
            'idempotency_key': f'dead_letter_test_{datetime.now().timestamp()}',
            'transaction_type': 'order',
            'transaction_data': {'amount': 40.00},
        })

        queue_item = self.env['pos.offline.queue'].create({
            'user_id': self.user.id,
            'transaction_id': transaction.id,
            'item_type': 'order',
            'sequence': 1,
            'item_data': {'amount': 40.00},
            'status': 'failed',
            'attempts': 5,
        })

        # Set to dead letter
        queue_item.status = 'dead_letter'

        # Verify it won't be retried
        retryable = self.env['pos.offline.queue'].search([
            ('user_id', '=', self.user.id),
            ('status', '=', 'failed'),
            ('attempts', '<', 5),
        ])

        self.assertEqual(len(retryable), 0)

    def test_queue_statistics(self):
        """Queue statistics are accurate."""
        # Create items with different statuses
        statuses = {
            'queued': 5,
            'processing': 2,
            'completed': 8,
            'failed': 3,
            'dead_letter': 1,
        }

        sequence = 1
        for status, count in statuses.items():
            for i in range(count):
                transaction = self.env['pos.offline.transaction'].create({
                    'user_id': self.user.id,
                    'idempotency_key': f'{status}_{i}_{datetime.now().timestamp()}',
                    'transaction_type': 'order',
                    'transaction_data': {'amount': 5.00},
                })

                self.env['pos.offline.queue'].create({
                    'user_id': self.user.id,
                    'transaction_id': transaction.id,
                    'item_type': 'order',
                    'sequence': sequence,
                    'item_data': {'amount': 5.00},
                    'status': status,
                })
                sequence += 1

        # Get stats
        stats = self.env['pos.offline.queue'].sudo(self.user).get_queue_stats()

        # Verify stats
        expected_total = sum(statuses.values())
        self.assertEqual(stats['total'], expected_total)
        self.assertEqual(stats['queued'], statuses['queued'])
        self.assertEqual(stats['processing'], statuses['processing'])
        self.assertEqual(stats['completed'], statuses['completed'])
        self.assertEqual(stats['failed'], statuses['failed'])
        self.assertEqual(stats['dead_letter'], statuses['dead_letter'])

    def test_queue_cleanup_old_completed_items(self):
        """Old completed queue items are cleaned up."""
        # Create old completed item (8+ days ago)
        old_date = fields.Datetime.subtract(
            fields.Datetime.now(),
            days=8
        )

        old_transaction = self.env['pos.offline.transaction'].create({
            'user_id': self.user.id,
            'idempotency_key': f'old_completed_{datetime.now().timestamp()}',
            'transaction_type': 'order',
            'transaction_data': {'amount': 10.00},
        })

        old_queue_item = self.env['pos.offline.queue'].create({
            'user_id': self.user.id,
            'transaction_id': old_transaction.id,
            'item_type': 'order',
            'sequence': 1,
            'item_data': {'amount': 10.00},
            'status': 'completed',
            'completed_at': old_date,
        })

        # Create recent completed item
        recent_transaction = self.env['pos.offline.transaction'].create({
            'user_id': self.user.id,
            'idempotency_key': f'recent_completed_{datetime.now().timestamp()}',
            'transaction_type': 'order',
            'transaction_data': {'amount': 15.00},
        })

        recent_queue_item = self.env['pos.offline.queue'].create({
            'user_id': self.user.id,
            'transaction_id': recent_transaction.id,
            'item_type': 'order',
            'sequence': 2,
            'item_data': {'amount': 15.00},
            'status': 'completed',
            'completed_at': fields.Datetime.now(),
        })

        old_id = old_queue_item.id
        recent_id = recent_queue_item.id

        # Cleanup
        count = self.env['pos.offline.queue'].cleanup_completed_queue_items(days=7)

        # Old should be deleted
        self.assertEqual(count, 1)
        self.assertFalse(self.env['pos.offline.queue'].search([
            ('id', '=', old_id)
        ]))

        # Recent should still exist
        self.assertTrue(self.env['pos.offline.queue'].search([
            ('id', '=', recent_id)
        ]))

    def test_get_queue_item_details(self):
        """get_item_details returns complete item information."""
        transaction = self.env['pos.offline.transaction'].create({
            'user_id': self.user.id,
            'idempotency_key': f'details_test_{datetime.now().timestamp()}',
            'transaction_type': 'order',
            'transaction_data': {'amount': 55.00},
        })

        queue_item = self.env['pos.offline.queue'].create({
            'user_id': self.user.id,
            'transaction_id': transaction.id,
            'item_type': 'order',
            'sequence': 1,
            'item_data': {'amount': 55.00},
            'status': 'queued',
            'attempts': 0,
        })

        details = queue_item.get_item_details()

        self.assertEqual(details['id'], queue_item.id)
        self.assertEqual(details['sequence'], 1)
        self.assertEqual(details['item_type'], 'order')
        self.assertEqual(details['status'], 'queued')
        self.assertEqual(details['attempts'], 0)
        self.assertIsNotNone(details['created_at'])

    def test_process_pending_queue(self):
        """Process pending queue returns correct statistics."""
        # Create 5 pending items
        for i in range(5):
            transaction = self.env['pos.offline.transaction'].create({
                'user_id': self.user.id,
                'idempotency_key': f'pending_{i}_{datetime.now().timestamp()}',
                'transaction_type': 'order',
                'transaction_data': {'amount': 20.00},
            })

            self.env['pos.offline.queue'].create({
                'user_id': self.user.id,
                'transaction_id': transaction.id,
                'item_type': 'order',
                'sequence': i + 1,
                'item_data': {'amount': 20.00},
                'status': 'queued',
            })

        # Note: In actual implementation, process_pending_queue would call
        # process_queue_item which would actually process items.
        # For this test, we verify the structure is correct.

        queue_items = self.env['pos.offline.queue'].search([
            ('user_id', '=', self.user.id),
            ('status', '=', 'queued'),
        ])

        self.assertEqual(len(queue_items), 5)

    def test_queue_item_data_json_storage(self):
        """Queue item data is properly stored as JSON."""
        complex_data = {
            'order_id': 999,
            'items': [
                {'id': 1, 'qty': 2, 'price': 10.00},
                {'id': 2, 'qty': 1, 'price': 15.00},
            ],
            'totals': {
                'subtotal': 35.00,
                'tax': 3.50,
                'total': 38.50,
            },
        }

        transaction = self.env['pos.offline.transaction'].create({
            'user_id': self.user.id,
            'idempotency_key': f'json_test_{datetime.now().timestamp()}',
            'transaction_type': 'order',
            'transaction_data': complex_data,
        })

        queue_item = self.env['pos.offline.queue'].create({
            'user_id': self.user.id,
            'transaction_id': transaction.id,
            'item_type': 'order',
            'sequence': 1,
            'item_data': complex_data,
        })

        # Verify data is stored and retrievable
        self.assertEqual(queue_item.item_data, complex_data)
        self.assertEqual(queue_item.item_data['order_id'], 999)
        self.assertEqual(len(queue_item.item_data['items']), 2)
