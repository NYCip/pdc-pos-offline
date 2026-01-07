# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

"""
Asset Versioning Tool

Generates content-hash based asset versioning for cache busting.
Transforms asset filenames to include content hash:
  offline_db.js → offline_db.a1b2c3d4.js

Benefits:
- Enables 1-year HTTP caching (immutable flag)
- Automatic cache invalidation on content change
- Browser always downloads latest version when content changes

Usage:
    versioner = AssetVersioner('/path/to/pdc_pos_offline')
    versions = versioner.generate_versions()
    manifest = versioner.get_manifest()
"""

import hashlib
import json
import logging
from pathlib import Path

_logger = logging.getLogger(__name__)


class AssetVersioner:
    """
    Manages asset versioning with content-based hashing.

    Creates versioned asset filenames by appending content hash:
    - offline_db.js (20KB) → offline_db.a1b2c3d4.js

    Stores mapping in .versions.json for lookup during build.
    """

    # Hash length to use (8 chars is good balance: low collision, short filenames)
    HASH_LENGTH = 8

    # Asset types to version (exclude already-compressed formats)
    ASSET_EXTENSIONS = {'.js', '.css', '.svg', '.json'}

    # Minimum file size to version (bytes) - skip very small files
    MIN_FILE_SIZE = 500

    def __init__(self, module_path):
        """
        Initialize versioner for a module.

        Args:
            module_path (str or Path): Root path of the module
        """
        self.module_path = Path(module_path)
        self.assets_dir = self.module_path / 'static' / 'src'
        self.version_file = self.module_path / '.versions.json'
        self._versions = {}

    def _compute_file_hash(self, filepath):
        """
        Compute MD5 hash of file content.

        Args:
            filepath (Path): Path to file

        Returns:
            str: First HASH_LENGTH characters of MD5 hex digest
        """
        try:
            content = filepath.read_bytes()
            hash_hex = hashlib.md5(content).hexdigest()
            return hash_hex[:self.HASH_LENGTH]
        except Exception as e:
            _logger.warning(f"Failed to hash file {filepath}: {e}")
            return None

    def _should_version_file(self, filepath):
        """
        Determine if file should be versioned.

        Args:
            filepath (Path): Path to file

        Returns:
            bool: True if file meets versioning criteria
        """
        # Check extension
        if filepath.suffix not in self.ASSET_EXTENSIONS:
            return False

        # Check file size
        try:
            if filepath.stat().st_size < self.MIN_FILE_SIZE:
                return False
        except Exception:
            return False

        return True

    def _create_versioned_filename(self, original_name, content_hash):
        """
        Create versioned filename by inserting hash before extension.

        Args:
            original_name (str): Original filename (e.g., 'offline_db.js')
            content_hash (str): Content hash (e.g., 'a1b2c3d4')

        Returns:
            str: Versioned filename (e.g., 'offline_db.a1b2c3d4.js')
        """
        parts = original_name.rsplit('.', 1)
        if len(parts) == 2:
            name, ext = parts
            return f"{name}.{content_hash}.{ext}"
        else:
            return f"{original_name}.{content_hash}"

    def generate_versions(self):
        """
        Generate version hashes for all eligible assets.

        Scans static/src directory recursively for .js, .css, .svg files,
        computes content hash for each, and stores mapping in .versions.json.

        Returns:
            dict: Mapping of original_name → {
                'versioned': versioned_name,
                'hash': content_hash,
                'size': file_size_bytes,
                'path': relative_path
            }
        """
        if not self.assets_dir.exists():
            _logger.warning(f"Assets directory not found: {self.assets_dir}")
            return {}

        versions = {}
        total_files = 0
        versioned_count = 0

        # Find all assets recursively
        for asset_file in self.assets_dir.rglob('*'):
            if not asset_file.is_file():
                continue

            total_files += 1

            # Skip files that shouldn't be versioned
            if not self._should_version_file(asset_file):
                continue

            # Compute hash
            content_hash = self._compute_file_hash(asset_file)
            if not content_hash:
                continue

            versioned_count += 1

            # Create version info
            original_name = asset_file.name
            versioned_name = self._create_versioned_filename(
                original_name, content_hash
            )
            relative_path = asset_file.relative_to(self.assets_dir)

            versions[original_name] = {
                'versioned': versioned_name,
                'hash': content_hash,
                'size': asset_file.stat().st_size,
                'path': str(relative_path),
            }

            _logger.debug(
                f"Versioned {original_name} → {versioned_name} "
                f"(hash: {content_hash})"
            )

        self._versions = versions
        _logger.info(
            f"Asset versioning: {versioned_count}/{total_files} files versioned"
        )

        return versions

    def save_manifest(self):
        """
        Save version mapping to .versions.json.

        Creates a manifest file that maps original filenames to versioned names.
        This is used during build/deployment to rewrite asset references.

        Returns:
            bool: True if manifest saved successfully
        """
        try:
            manifest = {
                'generated': True,
                'hash_length': self.HASH_LENGTH,
                'versions': self._versions,
            }

            self.version_file.write_text(
                json.dumps(manifest, indent=2)
            )

            _logger.info(
                f"Saved version manifest to {self.version_file} "
                f"({len(self._versions)} entries)"
            )
            return True

        except Exception as e:
            _logger.error(f"Failed to save version manifest: {e}")
            return False

    def get_manifest(self):
        """
        Get current version manifest.

        Returns:
            dict: Version manifest with 'generated' flag and 'versions' mapping
        """
        return {
            'generated': True,
            'hash_length': self.HASH_LENGTH,
            'versions': self._versions,
        }

    def get_versioned_name(self, original_name):
        """
        Look up versioned filename for original name.

        Args:
            original_name (str): Original filename (e.g., 'offline_db.js')

        Returns:
            str: Versioned filename or original name if not versioned
        """
        if original_name in self._versions:
            return self._versions[original_name]['versioned']
        return original_name

    def load_existing_manifest(self):
        """
        Load existing version manifest from .versions.json.

        Useful for comparing versions or detecting changed files.

        Returns:
            dict: Existing manifest or empty dict if none exists
        """
        if not self.version_file.exists():
            return {}

        try:
            manifest = json.loads(self.version_file.read_text())
            self._versions = manifest.get('versions', {})
            _logger.info(
                f"Loaded existing manifest with "
                f"{len(self._versions)} versioned assets"
            )
            return manifest
        except Exception as e:
            _logger.warning(f"Failed to load existing manifest: {e}")
            return {}

    def detect_changes(self):
        """
        Detect which files have changed since last versioning.

        Compares current hashes with existing manifest to identify
        files that need new versions.

        Returns:
            dict: {
                'changed': [list of changed filenames],
                'new': [list of new filenames],
                'removed': [list of removed filenames],
                'unchanged': [list of unchanged filenames]
            }
        """
        existing_manifest = self.load_existing_manifest()
        existing_versions = existing_manifest.get('versions', {})

        current_versions = self.generate_versions()

        changes = {
            'changed': [],
            'new': [],
            'removed': [],
            'unchanged': [],
        }

        # Check for changes and new files
        for filename, version_info in current_versions.items():
            if filename not in existing_versions:
                changes['new'].append(filename)
            elif version_info['hash'] != existing_versions[filename]['hash']:
                changes['changed'].append(filename)
            else:
                changes['unchanged'].append(filename)

        # Check for removed files
        for filename in existing_versions:
            if filename not in current_versions:
                changes['removed'].append(filename)

        _logger.info(
            f"Asset changes detected: {len(changes['changed'])} changed, "
            f"{len(changes['new'])} new, {len(changes['removed'])} removed"
        )

        return changes


# Command-line utility function for use in build scripts
def version_assets(module_path):
    """
    Convenience function for versioning assets.

    Suitable for calling from build scripts or Odoo manifest hooks.

    Args:
        module_path (str): Path to module root

    Returns:
        dict: Version manifest
    """
    versioner = AssetVersioner(module_path)
    versioner.generate_versions()
    versioner.save_manifest()
    return versioner.get_manifest()
