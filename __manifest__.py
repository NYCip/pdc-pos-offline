# -*- coding: utf-8 -*-
# Copyright 2024-2026 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.
{
    'name': 'PDC POS Offline',
    'version': '19.0.2.0.0',
    'category': 'Point of Sale',
    'summary': 'PWA-style offline mode for Odoo 19 POS with Service Worker caching',
    'description': """
PDC POS Offline Module v2.0
===========================

COMPLETE REWRITE based on deep Odoo 19 source analysis.

This module enables POS to work when the server is completely unreachable:
- Service Worker caches the POS web application (solves "Page Not Found")
- IndexedDB caches hr.employee data (enables offline re-login)
- Uses NATIVE Odoo 19 authentication (SHA-1 PIN validation)
- Uses NATIVE offline indicator (navbar fa-chain-broken icon)

What This Module Does:
----------------------
1. Service Worker - Caches /pos/ui and /web/assets/* for offline app loading
2. Data Caching - Caches hr.employee, products, categories in IndexedDB
3. Single Patch - PosData.loadInitialData() for cache/restore logic

What This Module Does NOT Do:
-----------------------------
- NO custom authentication (uses native select_cashier_mixin.js)
- NO blocking UI (uses native navbar indicator)
- NO order syncing (native unsyncData[] handles this)
- NO custom hash algorithm (native uses SHA-1)

Architecture:
-------------
Browser → Service Worker → Cached App → Native Login → IndexedDB Cache
                                              ↓
                                    Native SHA-1 PIN Validation

Key Files:
----------
- static/src/service_worker/sw.js - Service Worker for app caching
- static/src/js/offline_db.js - IndexedDB wrapper
- static/src/js/pos_data_patch.js - ONLY patch needed
- static/src/js/pos_offline_boot.js - SW registration
- controllers/service_worker_controller.py - Serves SW with correct headers
    """,
    'author': 'POS.com',
    'website': 'https://www.pos.com',
    'depends': ['point_of_sale', 'pos_hr'],
    'data': [
        # Minimal data files - v2.0 doesn't need server-side auth
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            # v2.0 - Minimal, focused files
            'pdc_pos_offline/static/src/js/offline_db.js',
            'pdc_pos_offline/static/src/js/pos_data_patch.js',
            'pdc_pos_offline/static/src/js/pos_offline_boot.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
