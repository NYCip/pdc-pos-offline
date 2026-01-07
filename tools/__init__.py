# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

"""
PDC POS Offline Tools Package

Utility tools for build-time operations and asset optimization.
"""

from .asset_versioner import AssetVersioner, version_assets

__all__ = ['AssetVersioner', 'version_assets']
