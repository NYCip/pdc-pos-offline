# -*- coding: utf-8 -*-
{
    'name': 'PDC POS Offline',
    'version': '19.0.1.0.0',
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
    """,
    'author': 'PDC',
    'website': 'https://www.pos.com',
    'depends': ['point_of_sale', 'web'],
    'data': [
        'security/ir.model.access.csv',
        'views/res_users_views.xml',
        'views/pos_config_views.xml',
        # Note: pos_assets.xml removed - assets handled via manifest 'assets' key in Odoo 18
        'data/pos_offline_data.xml',
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
            # Templates
            'pdc_pos_offline/static/src/xml/offline_login.xml',
            'pdc_pos_offline/static/src/xml/offline_config_templates.xml',
            # Styles
            'pdc_pos_offline/static/src/css/offline_pos.css',
        ],
        'web.assets_backend': [
            'pdc_pos_offline/static/src/js/user_pin_widget.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}