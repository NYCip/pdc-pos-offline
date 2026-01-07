# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
"""
pytest-odoo configuration for PDC POS Offline module tests.

This file configures pytest fixtures and markers for the offline sync system,
including database persistence, synchronization queue, and security.
"""

import pytest


def pytest_configure(config):
    """Configure pytest markers for PDC POS Offline tests."""
    # Module markers
    config.addinivalue_line(
        "markers", "offline: mark test as offline mode test"
    )
    config.addinivalue_line(
        "markers", "sync: mark test as synchronization test"
    )
    config.addinivalue_line(
        "markers", "persistence: mark test as persistence test"
    )
    config.addinivalue_line(
        "markers", "security: mark test as security/PIN test"
    )
    config.addinivalue_line(
        "markers", "backend: mark test as backend API test"
    )
    config.addinivalue_line(
        "markers", "login: mark test as login/authentication test"
    )
    config.addinivalue_line(
        "markers", "memory: mark test as memory/performance test"
    )
    config.addinivalue_line(
        "markers", "field_sync: mark test as field synchronization test"
    )

    # Odoo standard markers
    config.addinivalue_line(
        "markers", "post_install: run test after module installation"
    )
    config.addinivalue_line(
        "markers", "at_install: run test during module installation"
    )


@pytest.fixture
def odoo_env():
    """Fixture: Odoo environment for testing.

    Provides access to the Odoo environment for offline tests.
    Use this for tests that need to interact with Odoo models.

    Example:
        def test_offline_sync(odoo_env):
            Session = odoo_env['pos.session']
    """
    # Note: In pytest-odoo, this is provided automatically by pytest-odoo plugin
    pass


@pytest.fixture
def test_db():
    """Fixture: Test database connection.

    Provides access to the test database for transaction management.
    Essential for offline persistence tests.
    """
    # Note: Managed by pytest-odoo plugin
    pass


@pytest.fixture
def models():
    """Fixture: Model registry for test.

    Provides access to registered Odoo models.
    Use this to access any model by name.

    Example:
        def test_model_access(models):
            session = models['pos.session']
    """
    # Note: Provided by pytest-odoo
    pass


@pytest.fixture
def offline_db():
    """Fixture: Offline database configuration.

    Provides configuration for the offline local database.
    Returns a dictionary with database connection details.

    Returns:
        dict: Offline database configuration

    Example:
        def test_offline_persistence(offline_db):
            assert offline_db['db_type'] == 'sqlite'
    """
    return {
        'db_type': 'sqlite',
        'db_path': '/tmp/test_offline.db',
        'sync_enabled': True,
        'persist_locally': True,
    }


@pytest.fixture
def sync_queue():
    """Fixture: Synchronization queue for testing.

    Provides a mock synchronization queue for testing sync operations.
    Returns queue configuration and operations.

    Returns:
        dict: Sync queue configuration and methods

    Example:
        def test_sync_queue(sync_queue):
            assert sync_queue['max_size'] == 1000
    """
    return {
        'max_size': 1000,
        'queue_type': 'fifo',
        'operations': [],
        'retry_on_fail': True,
        'max_retries': 3,
    }


@pytest.fixture
def test_data():
    """Fixture: Common test data for offline mode.

    Provides sample data for testing offline operations.
    Returns a dictionary with test data.

    Returns:
        dict: Common test data (sessions, transactions, etc.)

    Example:
        def test_offline_transactions(test_data):
            assert 'sessions' in test_data
    """
    return {
        'sessions': [
            {
                'name': 'Test Session 1',
                'start_at': '2025-01-07 09:00:00',
                'state': 'opened',
            },
        ],
        'transactions': [
            {
                'type': 'sale',
                'amount': 50.00,
                'status': 'pending_sync',
            },
        ],
        'user_credentials': [
            {
                'username': 'test_user',
                'pin': '1234',
                'role': 'cashier',
            },
        ],
    }


@pytest.fixture
def security_config():
    """Fixture: Security configuration for offline tests.

    Provides PIN and security settings for testing secure operations.
    Returns security configuration.

    Returns:
        dict: Security configuration (PINs, encryption, etc.)

    Example:
        def test_pin_security(security_config):
            assert security_config['pin_length'] == 4
    """
    return {
        'pin_length': 4,
        'pin_required': True,
        'encryption_enabled': True,
        'encryption_algorithm': 'AES-256',
        'timeout_seconds': 300,
    }
