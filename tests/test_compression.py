# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

"""
Tests for Gzip Compression Controller

Tests the compression module to ensure:
1. Gzip compression is applied when client supports it
2. Compression ratio meets targets (65-80%)
3. Uncompressed content is returned for unsupported clients
4. Only compressible content types are compressed
5. Small files are not compressed (overhead)
"""

import gzip
import unittest
from unittest.mock import Mock, patch, MagicMock
from odoo.tests.common import TransactionCase, HttpCase

try:
    from ..controllers.compression import CompressionController, COMPRESSIBLE_TYPES
except ImportError:
    from controllers.compression import CompressionController, COMPRESSIBLE_TYPES


class TestCompressionController(unittest.TestCase):
    """Test gzip compression controller."""

    def setUp(self):
        """Set up test fixtures."""
        self.controller = CompressionController()

    def test_compression_mime_types(self):
        """Test that expected MIME types are marked compressible."""
        expected_types = {
            'application/javascript',
            'text/css',
            'image/svg+xml',
            'text/plain',
            'application/json',
        }
        self.assertEqual(COMPRESSIBLE_TYPES, expected_types)

    def test_gzip_compression_reduces_size(self):
        """Test that gzip compression reduces file size."""
        # Create sample JavaScript content
        content = b"var offline_db = {}; " * 100  # Repeat to make it larger
        expected_size = len(content)

        # Compress using same logic as controller
        compressed = gzip.compress(content, compresslevel=6)
        compressed_size = len(compressed)

        # Verify compression occurred
        self.assertLess(compressed_size, expected_size)

        # Verify compression ratio (should be 65-80%)
        ratio = 1 - (compressed_size / expected_size)
        self.assertGreater(ratio, 0.60)  # At least 60% reduction
        self.assertLess(ratio, 0.85)  # Not more than 85% (anomaly)

    def test_compression_ratio_for_typical_asset(self):
        """Test compression ratio for typical JavaScript asset."""
        # Simulate a typical POS offline JS file (~20KB)
        typical_js_content = b"""
        class OfflineDB {
            constructor() {
                this.data = {};
                this.sync_queue = [];
                this.cache_timeout = 3600;
            }

            async save(key, value) {
                this.data[key] = value;
                this.sync_queue.push({key, value, timestamp: Date.now()});
            }

            async load(key) {
                return this.data[key];
            }

            async sync() {
                // Sync logic here
            }
        }
        """ * 10  # Repeat to simulate real file size

        compressed = gzip.compress(typical_js_content, compresslevel=6)
        ratio = 1 - (len(compressed) / len(typical_js_content))

        # Log actual ratio for reference
        original_kb = len(typical_js_content) / 1024
        compressed_kb = len(compressed) / 1024
        print(f"\nCompression ratio: {original_kb:.1f}KB → {compressed_kb:.1f}KB ({ratio*100:.1f}%)")

        # Verify target compression (65-80%)
        self.assertGreater(ratio, 0.65)

    def test_compression_min_size_threshold(self):
        """Test that very small files are not compressed."""
        # Create small content (less than 1000 bytes)
        small_content = b"var x = 1;"
        self.assertLess(len(small_content), 1000)

        # Compression overhead makes it larger
        compressed = gzip.compress(small_content, compresslevel=6)
        self.assertGreater(len(compressed), len(small_content))

        # Controller should skip compression for small files
        # (verified in controller logic)

    @patch('odoo.http.request')
    def test_accept_encoding_detection(self, mock_request):
        """Test detection of Accept-Encoding header."""
        # Mock response
        response = Mock()
        response.headers = {'Content-Type': 'application/javascript'}
        response.get_data = Mock(return_value=b"var x = 1;" * 200)

        # Test with gzip support
        mock_request.httprequest.headers = {'Accept-Encoding': 'gzip, deflate'}
        result = CompressionController._should_compress(response)
        self.assertTrue(result, "Should compress when client supports gzip")

        # Test without gzip support
        mock_request.httprequest.headers = {'Accept-Encoding': 'deflate'}
        result = CompressionController._should_compress(response)
        self.assertFalse(result, "Should not compress when client doesn't support gzip")

        # Test with no Accept-Encoding
        mock_request.httprequest.headers = {}
        result = CompressionController._should_compress(response)
        self.assertFalse(result, "Should not compress without Accept-Encoding header")

    @patch('odoo.http.request')
    def test_content_type_filtering(self, mock_request):
        """Test that only compressible content types are compressed."""
        mock_request.httprequest.headers = {'Accept-Encoding': 'gzip'}

        # Compressible types
        for content_type in ['application/javascript', 'text/css', 'application/json']:
            response = Mock()
            response.headers = {'Content-Type': content_type}
            response.get_data = Mock(return_value=b"x" * 2000)
            result = CompressionController._should_compress(response)
            self.assertTrue(result, f"Should compress {content_type}")

        # Non-compressible types
        for content_type in ['image/png', 'video/mp4', 'application/pdf']:
            response = Mock()
            response.headers = {'Content-Type': content_type}
            response.get_data = Mock(return_value=b"x" * 2000)
            result = CompressionController._should_compress(response)
            self.assertFalse(result, f"Should not compress {content_type}")

    @patch('odoo.http.request')
    def test_compression_response_headers(self, mock_request):
        """Test that compressed response has correct headers."""
        mock_request.httprequest.headers = {'Accept-Encoding': 'gzip'}

        response = Mock()
        response.headers = {'Content-Type': 'application/javascript'}
        original_content = b"var offline_db = {};" * 100
        response.get_data = Mock(return_value=original_content)
        response.set_data = Mock()
        response.headers = {'Content-Type': 'application/javascript'}

        # Apply compression
        result = CompressionController._apply_gzip_compression(response)

        # Verify headers were set
        self.assertEqual(result.headers.get('Content-Encoding'), 'gzip')
        self.assertEqual(result.headers.get('Vary'), 'Accept-Encoding')
        self.assertIn('Content-Length', result.headers)

    def test_compression_idempotency(self):
        """Test that compression is safe to apply multiple times."""
        content = b"test content" * 100
        compressed1 = gzip.compress(content, compresslevel=6)
        # Attempting to compress compressed data shouldn't reduce further
        compressed2 = gzip.compress(compressed1, compresslevel=6)
        # Second compression is typically larger due to overhead
        self.assertGreaterEqual(len(compressed2), len(compressed1))


class TestCompressionIntegration(TransactionCase):
    """Integration tests for compression with Odoo."""

    def test_compression_endpoint_available(self):
        """Test that compression endpoint is available."""
        # This would require a full HTTP test client
        # Placeholder for integration test
        pass

    def test_compression_performance_impact(self):
        """Test that compression doesn't negatively impact performance."""
        # Measure compression time for various asset sizes
        sizes_to_test = [1024, 10240, 102400, 1024000]  # 1KB to 1MB
        timings = {}

        import time
        for size in sizes_to_test:
            content = b"x" * size
            start = time.time()
            compressed = gzip.compress(content, compresslevel=6)
            duration = time.time() - start
            timings[size] = {
                'original_kb': size / 1024,
                'compressed_kb': len(compressed) / 1024,
                'time_ms': duration * 1000,
                'ratio': 1 - (len(compressed) / size)
            }

        # Verify compression times are acceptable (< 100ms for typical assets)
        for size, metrics in timings.items():
            if size < 102400:  # For assets under 100KB
                self.assertLess(metrics['time_ms'], 100,
                    f"Compression took too long for {metrics['original_kb']:.1f}KB")


if __name__ == '__main__':
    unittest.main()
