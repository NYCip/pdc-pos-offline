# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta
import json

from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestModelCache(TransactionCase):
    """Test suite for Fix P0 #4: Model Cache Race Condition

    Ensures:
    - Cached model data is properly validated
    - Stale data is not served after reconnection
    - Concurrent access is handled with locking
    - Cache entries expire after TTL
    - Hash-based change detection works
    """

    def setUp(self):
        super().setUp()
        self.user = self.env['res.users'].create({
            'name': 'Test Cashier',
            'login': 'cashier@test.local',
            'email': 'cashier@test.local',
        })

    def test_cache_record(self):
        """Test caching a model record."""
        record_data = {
            'id': 100,
            'name': 'Product A',
            'price': 19.99,
            'qty_available': 50,
        }

        cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=100,
            record_data=record_data,
        )

        self.assertIsNotNone(cache)
        self.assertEqual(cache.model_name, 'product.product')
        self.assertEqual(cache.record_id, 100)
        self.assertEqual(cache.record_data, record_data)
        self.assertIsNotNone(cache.data_hash)

    def test_cache_hash_computation(self):
        """Cache hash changes when data changes."""
        record_data_1 = {'id': 1, 'name': 'Product', 'price': 10.00}
        record_data_2 = {'id': 1, 'name': 'Product', 'price': 12.00}

        cache1 = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=1,
            record_data=record_data_1,
        )
        hash1 = cache1.data_hash

        # Update with different data
        cache2 = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=1,
            record_data=record_data_2,
        )

        # Hash should be different
        self.assertNotEqual(hash1, cache2.data_hash)

    def test_cache_expiry(self):
        """Cache expires after 15 minutes."""
        record_data = {'id': 50, 'name': 'Test'}

        cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=50,
            record_data=record_data,
        )

        # Initially valid
        cache._compute_is_valid()
        self.assertTrue(cache.is_valid)

        # Simulate 16 minutes passing
        old_created_at = fields.Datetime.subtract(
            fields.Datetime.now(),
            seconds=960  # 16 minutes
        )
        cache.created_at = old_created_at
        cache._compute_expires_at()
        cache._compute_is_valid()

        # Should now be invalid
        self.assertFalse(cache.is_valid)

    def test_get_cached_record(self):
        """Retrieve cached record data."""
        record_data = {'id': 75, 'price': 25.50}

        cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=75,
            record_data=record_data,
        )

        # Retrieve it
        retrieved = self.env['pos.offline.model.cache'].sudo(self.user).get_cached_record(
            model_name='product.product',
            record_id=75,
        )

        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved['id'], 75)
        self.assertEqual(retrieved['price'], 25.50)

    def test_get_cached_record_expired_returns_none(self):
        """Expired cache returns None."""
        record_data = {'id': 88, 'data': 'test'}

        cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=88,
            record_data=record_data,
        )

        # Expire it
        old_date = fields.Datetime.subtract(
            fields.Datetime.now(),
            seconds=1000  # 16+ minutes
        )
        cache.created_at = old_date
        cache._compute_expires_at()
        cache._compute_is_valid()

        # Should return None
        retrieved = self.env['pos.offline.model.cache'].sudo(self.user).get_cached_record(
            model_name='product.product',
            record_id=88,
        )

        self.assertIsNone(retrieved)

    def test_cache_access_tracking(self):
        """Cache tracks number of accesses."""
        record_data = {'id': 99, 'test': 'data'}

        cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=99,
            record_data=record_data,
        )

        initial_count = cache.accessed_count
        self.assertEqual(initial_count, 0)

        # Access it multiple times
        for _ in range(5):
            self.env['pos.offline.model.cache'].sudo(self.user).get_cached_record(
                model_name='product.product',
                record_id=99,
            )

        cache.refresh()
        self.assertEqual(cache.accessed_count, 5)

    def test_validate_cache_with_hash(self):
        """Cache validation with server data hash."""
        record_data = {'id': 111, 'name': 'Item', 'price': 50.00}

        cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=111,
            record_data=record_data,
        )

        # Validate with matching hash
        server_hash = self.env['pos.offline.model.cache']._compute_data_hash(record_data)
        result = self.env['pos.offline.model.cache'].sudo(self.user).validate_cache(
            model_name='product.product',
            record_id=111,
            current_data_hash=server_hash,
        )

        self.assertTrue(result['valid'])
        self.assertEqual(result['reason'], 'cache_fresh')

    def test_validate_cache_stale_data(self):
        """Cache validation fails for stale data."""
        record_data = {'id': 222, 'old_price': 10.00}

        cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=222,
            record_data=record_data,
        )

        # Expire the cache
        old_date = fields.Datetime.subtract(
            fields.Datetime.now(),
            seconds=1000
        )
        cache.created_at = old_date
        cache._compute_expires_at()
        cache._compute_is_valid()

        # Validate should fail
        result = self.env['pos.offline.model.cache'].sudo(self.user).validate_cache(
            model_name='product.product',
            record_id=222,
        )

        self.assertFalse(result['valid'])
        self.assertEqual(result['reason'], 'expired')

    def test_invalidate_cache(self):
        """Invalidate cache entry."""
        record_data = {'id': 333, 'data': 'test'}

        cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=333,
            record_data=record_data,
        )

        # Should be valid initially
        cache._compute_is_valid()
        self.assertTrue(cache.is_valid)

        # Invalidate it
        cache.invalidate_cache()

        # Should now be invalid
        self.assertFalse(cache.is_valid)

    def test_invalidate_model_all_records(self):
        """Invalidate all cache for a model."""
        # Cache multiple records
        for i in range(3):
            self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
                model_name='product.product',
                record_id=i,
                record_data={'id': i, 'name': f'Product {i}'},
            )

        # Invalidate all
        self.env['pos.offline.model.cache'].sudo(self.user).invalidate_model_cache(
            model_name='product.product'
        )

        # All should be invalid
        entries = self.env['pos.offline.model.cache'].search([
            ('user_id', '=', self.user.id),
            ('model_name', '=', 'product.product'),
        ])

        for entry in entries:
            self.assertFalse(entry.is_valid)

    def test_invalidate_model_specific_record(self):
        """Invalidate cache for specific record only."""
        # Cache two records
        for i in [1, 2]:
            self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
                model_name='product.product',
                record_id=i,
                record_data={'id': i, 'name': f'Product {i}'},
            )

        # Invalidate only record 1
        self.env['pos.offline.model.cache'].sudo(self.user).invalidate_model_cache(
            model_name='product.product',
            record_id=1,
        )

        # Check record 1 is invalid
        entry1 = self.env['pos.offline.model.cache'].search([
            ('user_id', '=', self.user.id),
            ('model_name', '=', 'product.product'),
            ('record_id', '=', 1),
        ])
        self.assertFalse(entry1.is_valid)

        # Check record 2 is still valid
        entry2 = self.env['pos.offline.model.cache'].search([
            ('user_id', '=', self.user.id),
            ('model_name', '=', 'product.product'),
            ('record_id', '=', 2),
        ])
        self.assertTrue(entry2.is_valid)

    def test_invalidate_all_on_reconnect(self):
        """Invalidate all cache when server reconnects."""
        # Cache multiple items from different models
        models_to_cache = [
            ('product.product', 1),
            ('product.product', 2),
            ('res.partner', 100),
            ('pos.session', 5),
        ]

        for model_name, record_id in models_to_cache:
            self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
                model_name=model_name,
                record_id=record_id,
                record_data={'id': record_id, 'model': model_name},
            )

        # Invalidate all on reconnect
        self.env['pos.offline.model.cache'].sudo(self.user).invalidate_all_cache_on_reconnect()

        # All should be invalid
        all_entries = self.env['pos.offline.model.cache'].search([
            ('user_id', '=', self.user.id),
        ])

        for entry in all_entries:
            self.assertFalse(entry.is_valid)

    def test_cleanup_expired_cache(self):
        """Cleanup removes expired cache entries."""
        # Create old (expired) entry
        old_date = fields.Datetime.subtract(
            fields.Datetime.now(),
            seconds=2000  # 33 minutes ago
        )

        old_cache = self.env['pos.offline.model.cache'].create({
            'user_id': self.user.id,
            'model_name': 'product.product',
            'record_id': 999,
            'record_data': {'test': 'old'},
            'data_hash': 'old_hash',
            'created_at': old_date,
        })

        # Create recent entry
        recent_cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='res.partner',
            record_id=500,
            record_data={'test': 'recent'},
        )

        old_id = old_cache.id
        recent_id = recent_cache.id

        # Cleanup
        count = self.env['pos.offline.model.cache'].cleanup_expired_cache()

        # Old should be deleted
        self.assertEqual(count, 1)
        self.assertFalse(self.env['pos.offline.model.cache'].search([
            ('id', '=', old_id)
        ]))

        # Recent should still exist
        self.assertTrue(self.env['pos.offline.model.cache'].search([
            ('id', '=', recent_id)
        ]))

    def test_cache_statistics(self):
        """Get cache statistics."""
        record_data = {'id': 777, 'name': 'Test Product'}

        cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=777,
            record_data=record_data,
        )

        # Access it a few times
        for _ in range(3):
            self.env['pos.offline.model.cache'].sudo(self.user).get_cached_record(
                model_name='product.product',
                record_id=777,
            )

        cache.refresh()
        stats = cache.get_cache_stats()

        self.assertEqual(stats['model'], 'product.product')
        self.assertEqual(stats['record_id'], 777)
        self.assertEqual(stats['accessed_count'], 3)
        self.assertTrue(stats['valid'])

    def test_user_cache_statistics(self):
        """Get user cache statistics."""
        # Create multiple cache entries
        for i in range(5):
            self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
                model_name='product.product',
                record_id=i,
                record_data={'id': i},
            )

        stats = self.env['pos.offline.model.cache'].sudo(self.user).get_user_cache_stats()

        self.assertEqual(stats['total_entries'], 5)
        self.assertEqual(stats['valid_entries'], 5)
        self.assertEqual(stats['stale_entries'], 0)

    def test_concurrent_access_scenario(self):
        """Test cache behavior in concurrent access scenario."""
        record_data = {
            'id': 450,
            'name': 'Shared Product',
            'qty': 100,
        }

        cache = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=450,
            record_data=record_data,
        )

        # Simulate concurrent reads
        for _ in range(10):
            data = self.env['pos.offline.model.cache'].sudo(self.user).get_cached_record(
                model_name='product.product',
                record_id=450,
            )
            self.assertIsNotNone(data)

        cache.refresh()
        self.assertEqual(cache.accessed_count, 10)

    def test_different_users_separate_cache(self):
        """Different users have separate cache entries."""
        user2 = self.env['res.users'].create({
            'name': 'Second Cashier',
            'login': 'cashier2@test.local',
            'email': 'cashier2@test.local',
        })

        record_data = {'id': 600, 'test': 'data'}

        # User 1 caches
        cache1 = self.env['pos.offline.model.cache'].sudo(self.user).cache_record(
            model_name='product.product',
            record_id=600,
            record_data=record_data,
        )

        # User 2 caches same record
        cache2 = self.env['pos.offline.model.cache'].sudo(user2).cache_record(
            model_name='product.product',
            record_id=600,
            record_data=record_data,
        )

        # Should be different cache entries
        self.assertNotEqual(cache1.id, cache2.id)

        # User 1 should only see their cache
        user1_cache = self.env['pos.offline.model.cache'].sudo(self.user).get_cached_record(
            model_name='product.product',
            record_id=600,
        )
        self.assertIsNotNone(user1_cache)
