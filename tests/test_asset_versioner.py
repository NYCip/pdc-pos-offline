# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

"""
Tests for Asset Versioner Tool

Tests asset versioning functionality:
1. Content hash generation for assets
2. Versioned filename creation
3. Manifest generation and storage
4. Change detection between versions
5. Integration with build scripts
"""

import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

try:
    from ..tools.asset_versioner import AssetVersioner, version_assets
except ImportError:
    from tools.asset_versioner import AssetVersioner, version_assets


class TestAssetVersioner(unittest.TestCase):
    """Test asset versioning functionality."""

    def setUp(self):
        """Set up test fixtures."""
        # Create temporary directory for testing
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)

        # Create module structure
        self.module_path = self.temp_path / 'test_module'
        self.module_path.mkdir()
        self.assets_dir = self.module_path / 'static' / 'src'
        self.assets_dir.mkdir(parents=True)

        self.versioner = AssetVersioner(self.module_path)

    def tearDown(self):
        """Clean up temporary directory."""
        self.temp_dir.cleanup()

    def test_versioner_initialization(self):
        """Test versioner initialization."""
        self.assertEqual(self.versioner.module_path, self.module_path)
        self.assertEqual(self.versioner.assets_dir, self.assets_dir)

    def test_file_hash_computation(self):
        """Test content hash computation."""
        # Create a test file
        test_file = self.assets_dir / 'test.js'
        content = b"var x = 1;"
        test_file.write_bytes(content)

        # Compute hash
        hash_value = self.versioner._compute_file_hash(test_file)

        # Verify hash format (8 hex characters)
        self.assertIsNotNone(hash_value)
        self.assertEqual(len(hash_value), 8)
        self.assertTrue(all(c in '0123456789abcdef' for c in hash_value))

    def test_file_hash_consistency(self):
        """Test that same content produces same hash."""
        test_file = self.assets_dir / 'test.js'
        content = b"var offline_db = {};"
        test_file.write_bytes(content)

        hash1 = self.versioner._compute_file_hash(test_file)
        hash2 = self.versioner._compute_file_hash(test_file)

        self.assertEqual(hash1, hash2)

    def test_file_hash_differs_with_content(self):
        """Test that different content produces different hash."""
        test_file1 = self.assets_dir / 'test1.js'
        test_file2 = self.assets_dir / 'test2.js'

        test_file1.write_bytes(b"var x = 1;")
        test_file2.write_bytes(b"var y = 2;")

        hash1 = self.versioner._compute_file_hash(test_file1)
        hash2 = self.versioner._compute_file_hash(test_file2)

        self.assertNotEqual(hash1, hash2)

    def test_versioned_filename_creation(self):
        """Test versioned filename generation."""
        test_cases = [
            ('offline_db.js', 'a1b2c3d4', 'offline_db.a1b2c3d4.js'),
            ('offline_auth.css', 'deadbeef', 'offline_auth.deadbeef.css'),
            ('app.json', '12345678', 'app.12345678.json'),
        ]

        for original, hash_val, expected in test_cases:
            result = self.versioner._create_versioned_filename(original, hash_val)
            self.assertEqual(result, expected)

    def test_should_version_file_extension_check(self):
        """Test extension filtering in should_version_file."""
        # Create test files with different extensions
        test_cases = [
            ('test.js', True),
            ('test.css', True),
            ('test.svg', True),
            ('test.json', True),
            ('test.png', False),  # Image, shouldn't version
            ('test.txt', False),  # Text file, but shouldn't version
        ]

        for filename, should_version in test_cases:
            test_file = self.assets_dir / filename
            test_file.write_bytes(b"x" * 1000)

            result = self.versioner._should_version_file(test_file)
            self.assertEqual(
                result, should_version,
                f"File {filename} versioning decision incorrect"
            )

    def test_should_version_file_size_check(self):
        """Test minimum file size check."""
        small_file = self.assets_dir / 'small.js'
        large_file = self.assets_dir / 'large.js'

        # Small file (< 500 bytes)
        small_file.write_bytes(b"x" * 100)
        self.assertFalse(self.versioner._should_version_file(small_file))

        # Large file (> 500 bytes)
        large_file.write_bytes(b"x" * 1000)
        self.assertTrue(self.versioner._should_version_file(large_file))

    def test_generate_versions(self):
        """Test version generation for multiple files."""
        # Create test files
        files = {
            'offline_db.js': b"var offline_db = {};" * 50,
            'offline_auth.js': b"var auth = {};" * 50,
            'offline_app.css': b"body { margin: 0; }" * 50,
        }

        for filename, content in files.items():
            (self.assets_dir / filename).write_bytes(content)

        # Generate versions
        versions = self.versioner.generate_versions()

        # Check that all files were versioned
        self.assertEqual(len(versions), 3)

        # Check version format
        for original_name, version_info in versions.items():
            self.assertIn('versioned', version_info)
            self.assertIn('hash', version_info)
            self.assertIn('size', version_info)
            self.assertIn('path', version_info)

            # Verify versioned name format
            versioned = version_info['versioned']
            self.assertIn(version_info['hash'], versioned)

    def test_manifest_generation(self):
        """Test manifest file generation and storage."""
        # Create test file
        (self.assets_dir / 'test.js').write_bytes(b"x" * 1000)

        # Generate versions
        self.versioner.generate_versions()

        # Save manifest
        saved = self.versioner.save_manifest()
        self.assertTrue(saved)

        # Check manifest file exists
        manifest_file = self.module_path / '.versions.json'
        self.assertTrue(manifest_file.exists())

        # Load and verify manifest
        manifest_content = json.loads(manifest_file.read_text())
        self.assertTrue(manifest_content['generated'])
        self.assertIn('versions', manifest_content)
        self.assertGreater(len(manifest_content['versions']), 0)

    def test_load_existing_manifest(self):
        """Test loading existing version manifest."""
        # Create and save a manifest
        (self.assets_dir / 'test.js').write_bytes(b"x" * 1000)
        self.versioner.generate_versions()
        self.versioner.save_manifest()

        # Create new versioner and load manifest
        versioner2 = AssetVersioner(self.module_path)
        manifest = versioner2.load_existing_manifest()

        self.assertTrue(manifest.get('generated'))
        self.assertIn('versions', manifest)

    def test_get_versioned_name(self):
        """Test looking up versioned filename."""
        # Create test file and generate versions
        (self.assets_dir / 'offline_db.js').write_bytes(b"x" * 1000)
        self.versioner.generate_versions()

        # Look up versioned name
        versioned_name = self.versioner.get_versioned_name('offline_db.js')

        # Should contain hash
        self.assertNotEqual(versioned_name, 'offline_db.js')
        self.assertIn('offline_db', versioned_name)
        self.assertIn('.js', versioned_name)

    def test_detect_changes(self):
        """Test detecting changes between versions."""
        # Create initial files
        (self.assets_dir / 'file1.js').write_bytes(b"original1" * 100)
        (self.assets_dir / 'file2.js').write_bytes(b"original2" * 100)

        # Generate and save initial versions
        self.versioner.generate_versions()
        self.versioner.save_manifest()

        # Modify one file and add a new one
        (self.assets_dir / 'file1.js').write_bytes(b"modified1" * 100)
        (self.assets_dir / 'file3.js').write_bytes(b"new3" * 100)
        # Remove file2 by not recreating it

        # Create new versioner and detect changes
        versioner2 = AssetVersioner(self.module_path)
        changes = versioner2.detect_changes()

        # Verify change detection
        self.assertIn('file1.js', changes['changed'], "file1 should be detected as changed")
        self.assertIn('file3.js', changes['new'], "file3 should be detected as new")
        self.assertIn('file2.js', changes['unchanged'], "file2 should still be listed as existing")

    def test_manifest_structure(self):
        """Test manifest structure is correct."""
        # Create test file
        (self.assets_dir / 'app.js').write_bytes(b"x" * 1000)

        # Generate versions and get manifest
        self.versioner.generate_versions()
        manifest = self.versioner.get_manifest()

        # Check structure
        self.assertIn('generated', manifest)
        self.assertIn('hash_length', manifest)
        self.assertIn('versions', manifest)

        self.assertTrue(manifest['generated'])
        self.assertEqual(manifest['hash_length'], 8)

        # Check version entry structure
        for filename, version_info in manifest['versions'].items():
            self.assertIn('versioned', version_info)
            self.assertIn('hash', version_info)
            self.assertIn('size', version_info)
            self.assertIn('path', version_info)

    def test_version_assets_utility(self):
        """Test version_assets convenience function."""
        # Create test file
        (self.assets_dir / 'test.js').write_bytes(b"x" * 1000)

        # Call utility function
        manifest = version_assets(self.module_path)

        # Verify manifest returned
        self.assertTrue(manifest.get('generated'))
        self.assertIn('versions', manifest)

        # Verify manifest file created
        manifest_file = self.module_path / '.versions.json'
        self.assertTrue(manifest_file.exists())

    def test_nested_asset_directories(self):
        """Test handling of nested asset directories."""
        # Create nested structure
        js_dir = self.assets_dir / 'js'
        css_dir = self.assets_dir / 'css'
        js_dir.mkdir()
        css_dir.mkdir()

        # Create files in subdirectories
        (js_dir / 'offline_db.js').write_bytes(b"x" * 1000)
        (css_dir / 'offline_pos.css').write_bytes(b"x" * 1000)

        # Generate versions
        versions = self.versioner.generate_versions()

        # Both files should be versioned
        self.assertEqual(len(versions), 2)

    def test_hash_length_consistency(self):
        """Test that hash length is consistent."""
        # Create multiple files
        for i in range(5):
            (self.assets_dir / f'file{i}.js').write_bytes(b"x" * 1000)

        versions = self.versioner.generate_versions()

        # All hashes should be same length
        for filename, version_info in versions.items():
            hash_val = version_info['hash']
            self.assertEqual(len(hash_val), 8)


if __name__ == '__main__':
    unittest.main()
