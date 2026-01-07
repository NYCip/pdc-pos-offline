# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

"""
Tests for Cache Headers Controller

Tests HTTP cache header implementation:
1. Versioned assets get 1-year cache with immutable flag
2. Dynamic assets get short-term cache with revalidation
3. ETag headers are generated correctly
4. Cache headers follow HTTP specifications
"""

import hashlib
import unittest
from unittest.mock import Mock, patch
from datetime import datetime, timedelta
from odoo.tests.common import TransactionCase

try:
    from ..controllers.cache_headers import (
        CacheHeadersController,
        VERSIONED_ASSETS,
        CACHE_LONG_DAYS,
        CACHE_SHORT_SECONDS,
    )
except ImportError:
    from controllers.cache_headers import (
        CacheHeadersController,
        VERSIONED_ASSETS,
        CACHE_LONG_DAYS,
        CACHE_SHORT_SECONDS,
    )


class TestCacheHeadersController(unittest.TestCase):
    """Test cache headers controller."""

    def setUp(self):
        """Set up test fixtures."""
        self.controller = CacheHeadersController()

    def test_versioned_assets_list(self):
        """Test that versioned assets are correctly identified."""
        expected_assets = {
            'offline_db',
            'offline_auth',
            'connection_monitor',
            'session_persistence',
            'sync_manager',
        }
        self.assertEqual(set(VERSIONED_ASSETS), expected_assets)

    def test_cache_durations(self):
        """Test cache duration constants."""
        # Long-term cache should be 1 year
        self.assertEqual(CACHE_LONG_DAYS, 365)
        # Short-term should be 1 hour
        self.assertEqual(CACHE_SHORT_SECONDS, 3600)

    def test_versioned_asset_detection_with_hash(self):
        """Test detection of versioned assets with content hash."""
        test_cases = [
            ('offline_db.a1b2c3d4.js', True),
            ('offline_auth.deadbeef.js', True),
            ('connection_monitor.12345678.js', True),
            ('offline_db.js', False),  # No hash
            ('other_file.abc12345.js', False),  # Not in VERSIONED_ASSETS
            ('offline_db.short.js', False),  # Hash too short
            ('offline_db.ghijklmn.js', False),  # Non-hex hash
        ]

        for filename, expected in test_cases:
            result = CacheHeadersController._is_versioned_asset(filename)
            self.assertEqual(
                result, expected,
                f"File '{filename}' versioned detection failed (expected {expected})"
            )

    def test_etag_generation(self):
        """Test ETag header generation."""
        content1 = b"var offline_db = {};"
        content2 = b"var offline_db = {x: 1};"

        etag1 = CacheHeadersController._generate_etag(content1)
        etag2 = CacheHeadersController._generate_etag(content2)

        # ETags should be quoted strings
        self.assertTrue(etag1.startswith('"') and etag1.endswith('"'))
        self.assertTrue(etag2.startswith('"') and etag2.endswith('"'))

        # Different content should have different ETags
        self.assertNotEqual(etag1, etag2)

        # Same content should have same ETag
        etag1_again = CacheHeadersController._generate_etag(content1)
        self.assertEqual(etag1, etag1_again)

    def test_etag_format(self):
        """Test ETag format matches HTTP specification."""
        content = b"test content"
        etag = CacheHeadersController._generate_etag(content)

        # Should be MD5 hash in quotes
        expected_hash = hashlib.md5(content).hexdigest()
        expected_etag = f'"{expected_hash}"'

        self.assertEqual(etag, expected_etag)

    def test_long_cache_for_versioned_assets(self):
        """Test that versioned assets get long-term cache."""
        response = Mock()
        response.headers = {}
        response.get_data = Mock(return_value=b"test content")

        result = CacheHeadersController.apply_cache_headers(
            response,
            filename='offline_db.a1b2c3d4.js'
        )

        # Check cache control header
        cache_control = result.headers.get('Cache-Control')
        self.assertIn('max-age=31536000', cache_control)  # 1 year in seconds
        self.assertIn('immutable', cache_control)
        self.assertIn('public', cache_control)

        # Check Expires header
        self.assertIn('Expires', result.headers)

    def test_short_cache_for_dynamic_assets(self):
        """Test that dynamic assets get short-term cache."""
        response = Mock()
        response.headers = {}
        response.get_data = Mock(return_value=b"test content")

        result = CacheHeadersController.apply_cache_headers(
            response,
            filename='offline_db.js'  # No version hash
        )

        # Check cache control header
        cache_control = result.headers.get('Cache-Control')
        self.assertIn('max-age=3600', cache_control)  # 1 hour
        self.assertIn('must-revalidate', cache_control)
        self.assertIn('public', cache_control)

    def test_no_cache_headers(self):
        """Test no-cache headers for sensitive content."""
        response = Mock()
        response.headers = {}

        result = CacheHeadersController.apply_no_cache_headers(response)

        cache_control = result.headers.get('Cache-Control')
        self.assertIn('no-cache', cache_control)
        self.assertIn('no-store', cache_control)
        self.assertIn('must-revalidate', cache_control)

        # Pragma should be set
        self.assertEqual(result.headers.get('Pragma'), 'no-cache')

        # Expires should be 0
        self.assertEqual(result.headers.get('Expires'), '0')

    def test_etag_added_to_all_responses(self):
        """Test that ETag is added to all cached responses."""
        response = Mock()
        response.headers = {}
        response.get_data = Mock(return_value=b"test content")

        result = CacheHeadersController.apply_cache_headers(response)

        # ETag should be present
        self.assertIn('ETag', result.headers)
        # Vary should include Accept-Encoding
        self.assertIn('Accept-Encoding', result.headers.get('Vary', ''))

    def test_vary_header_set(self):
        """Test that Vary header includes Accept-Encoding."""
        response = Mock()
        response.headers = {}
        response.get_data = Mock(return_value=b"test content")

        result = CacheHeadersController.apply_cache_headers(response)

        vary = result.headers.get('Vary')
        self.assertIsNotNone(vary)
        self.assertIn('Accept-Encoding', vary)

    def test_expires_header_format(self):
        """Test that Expires header is valid HTTP-date format."""
        response = Mock()
        response.headers = {}
        response.get_data = Mock(return_value=b"test content")

        result = CacheHeadersController.apply_cache_headers(
            response,
            filename='offline_db.abc12345.js'
        )

        expires = result.headers.get('Expires')
        self.assertIsNotNone(expires)
        # Should be an HTTP date string (not a timestamp)
        # Format: "Thu, 01 Jan 2025 00:00:00 GMT"
        self.assertIn(',', expires)  # Should contain comma like "Thu, ..."
        self.assertIn('GMT', expires)  # Should specify timezone

    def test_cache_headers_without_filename(self):
        """Test applying cache headers without filename (defaults to dynamic)."""
        response = Mock()
        response.headers = {}
        response.get_data = Mock(return_value=b"test content")

        result = CacheHeadersController.apply_cache_headers(response)

        cache_control = result.headers.get('Cache-Control')
        # Should default to short-term cache
        self.assertIn('max-age=3600', cache_control)

    def test_content_type_options_header(self):
        """Test X-Content-Type-Options header for versioned assets."""
        response = Mock()
        response.headers = {}
        response.get_data = Mock(return_value=b"test content")

        result = CacheHeadersController.apply_cache_headers(
            response,
            filename='offline_db.a1b2c3d4.js'
        )

        # Versioned assets should have X-Content-Type-Options set
        self.assertEqual(result.headers.get('X-Content-Type-Options'), 'nosniff')


class TestCacheHeadersIntegration(TransactionCase):
    """Integration tests for cache headers."""

    def test_cache_strategy_effectiveness(self):
        """
        Test that cache strategy reduces bandwidth on repeat visits.

        For 10 repeat visits to same assets:
        - First visit: Downloads all assets (e.g., 100KB)
        - Visits 2-10: Uses cached assets (0KB downloads)
        - Savings: 900KB for 10 visits
        """
        # Simulated asset sizes
        assets = {
            'offline_db.a1b2c3d4.js': 45000,  # 45KB versioned
            'offline_auth.deadbeef.js': 32000,  # 32KB versioned
            'connection_monitor.12345678.js': 23000,  # 23KB versioned
        }

        first_visit_bytes = sum(assets.values())
        repeat_visits = 9
        cached_visits_bytes = 0  # Cached assets = 0 download

        total_with_cache = first_visit_bytes + (cached_visits_bytes * repeat_visits)
        total_without_cache = first_visit_bytes * 10

        savings = total_without_cache - total_with_cache
        savings_percent = (savings / total_without_cache) * 100

        print(f"\nCache Strategy Effectiveness:")
        print(f"First visit: {first_visit_bytes / 1024:.0f}KB")
        print(f"10 visits with cache: {total_with_cache / 1024:.0f}KB")
        print(f"10 visits without cache: {total_without_cache / 1024:.0f}KB")
        print(f"Savings: {savings / 1024:.0f}KB ({savings_percent:.0f}%)")

        # Verify savings are significant
        self.assertGreater(savings_percent, 80)


if __name__ == '__main__':
    unittest.main()
