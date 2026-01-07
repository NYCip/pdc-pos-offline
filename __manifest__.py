# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.
{
    'name': 'PDC POS Offline',
    'version': '19.0.1.0.8',
    'category': 'Point of Sale',
    'summary': 'Enable offline login and persistent sessions for POS during internet outages',
    'description': """
PDC POS Offline Module
======================

This module enables Odoo POS to work completely offline, including:
- Offline PIN authentication when internet is unavailable
- Persistent session storage that survives browser closure
- Automatic sync when connection is restored
- Seamless online/offline transitions

Key Features:
-------------
* 4-digit PIN authentication for offline access
* Complete session persistence in IndexedDB
* Automatic data synchronization
* Browser crash recovery
* Power outage resilience

Security Features:
------------------
* PIN hashing with Argon2id (memory-hard, OWASP-recommended)
* Rate limiting (5 attempts per minute per user)
* Secure session token storage
* Audit logging for authentication attempts

Technical Details:
------------------
* Uses IndexedDB for client-side storage
* Implements Odoo 19 OWL 2.0 components
* Service-based architecture with proper DI
    """,
    'author': 'POS.com',
    'website': 'https://www.pos.com',
    'depends': ['point_of_sale', 'web'],
    'external_dependencies': {
        'python': ['argon2'],
    },
    'data': [
        'security/ir.model.access.csv',
        'security/pos_offline_session_access.csv',
        'security/pos_offline_security.xml',
        'security/pos_offline_transaction_access.csv',
        'security/pos_offline_transaction_security.xml',
        'security/pos_offline_queue_access.csv',
        'security/pos_offline_queue_security.xml',
        'security/pos_offline_model_cache_security.xml',
        'views/res_users_views.xml',
        'views/pos_config_views.xml',
        'data/pos_offline_data.xml',
        'data/pos_offline_scheduled_actions.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            # Core offline infrastructure
            'pdc_pos_offline/static/src/js/offline_db.js',
            'pdc_pos_offline/static/src/js/connection_monitor.js',
            'pdc_pos_offline/static/src/js/connection_monitor_service.js',
            'pdc_pos_offline/static/src/js/session_persistence.js',
            'pdc_pos_offline/static/src/js/offline_auth.js',
            'pdc_pos_offline/static/src/js/sync_manager.js',
            # OWL Components (Odoo 19 aligned)
            'pdc_pos_offline/static/src/js/offline_login_popup.js',
            'pdc_pos_offline/static/src/js/pos_offline_patch.js',
            # NOTE: Service Worker removed - Odoo 19 has native SW at /pos/service-worker.js
            # The custom sw_register.js is now a no-op stub kept for backwards compatibility
            # Asset caching is handled by Odoo's native Service Worker
            # Templates
            'pdc_pos_offline/static/src/xml/offline_login.xml',
            'pdc_pos_offline/static/src/xml/offline_config_templates.xml',
            # Styles
            'pdc_pos_offline/static/src/css/offline_pos.css',
        ],
        'web.assets_backend': [
            'pdc_pos_offline/static/src/js/user_pin_widget.js',
            'pdc_pos_offline/static/src/xml/user_pin_widget.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}