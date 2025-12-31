# -*- coding: utf-8 -*-
"""
Comprehensive Security Test Suite for Argon2id PIN Storage

Test Coverage:
- Argon2id hashing (5 tests)
- PIN verification (5 tests)
- PIN format validation (4 tests)
- Rate limiting (5 tests)
- Database security (3 tests)
- Performance (2 tests)

Total: 24 tests
"""

import time
import unittest
from unittest.mock import patch, MagicMock

from odoo.tests import common
from odoo.exceptions import ValidationError


class TestPINSecurity(common.TransactionCase):
    """Test suite for PIN storage security with Argon2id."""

    def setUp(self):
        super().setUp()
        self.user = self.env['res.users'].create({
            'name': 'Test User',
            'login': 'testuser_pin',
            'email': 'test@test.com',
        })

    # ========================================================================
    # Argon2id Hashing Tests (5 tests)
    # ========================================================================

    def test_01_pin_hash_generation(self):
        """Test that PIN is hashed with Argon2id format."""
        self.user._set_pin('1234')
        self.assertTrue(self.user.pdc_pin_hash, "PIN hash should be generated")
        self.assertTrue(
            self.user.pdc_pin_hash.startswith('$argon2id$'),
            "Hash should use Argon2id format"
        )

    def test_02_pin_hash_uniqueness(self):
        """Test that same PIN produces different hashes (random salt)."""
        user2 = self.env['res.users'].create({
            'name': 'Test User 2',
            'login': 'testuser2_pin',
            'email': 'test2@test.com',
        })

        self.user._set_pin('1234')
        user2._set_pin('1234')

        self.assertNotEqual(
            self.user.pdc_pin_hash,
            user2.pdc_pin_hash,
            "Same PIN should produce different hashes (random salt)"
        )

    def test_03_pin_hash_format(self):
        """Test Argon2id hash contains correct parameters."""
        self.user._set_pin('5678')
        hash_parts = self.user.pdc_pin_hash.split('$')

        # Format: $argon2id$v=19$m=65536,t=3,p=4$salt$hash
        self.assertEqual(hash_parts[0], '', "Hash should start with $")
        self.assertEqual(hash_parts[1], 'argon2id', "Algorithm should be argon2id")
        self.assertEqual(hash_parts[2], 'v=19', "Argon2 version should be 19")

        # Check parameters
        params = dict(param.split('=') for param in hash_parts[3].split(','))
        self.assertEqual(params['m'], '65536', "Memory cost should be 64MB (65536 KB)")
        self.assertEqual(params['t'], '3', "Time cost should be 3 iterations")
        self.assertEqual(params['p'], '4', "Parallelism should be 4 threads")

    def test_04_pin_hash_salt_randomness(self):
        """Test that salt is different for each hash."""
        hashes = []
        for i in range(5):
            user = self.env['res.users'].create({
                'name': f'Test User {i}',
                'login': f'testuser{i}_salt',
                'email': f'test{i}@test.com',
            })
            user._set_pin('9999')
            salt = user.pdc_pin_hash.split('$')[4]
            hashes.append(salt)

        # All salts should be unique
        self.assertEqual(len(hashes), len(set(hashes)), "All salts should be unique")

    def test_05_pin_rehashing_on_parameter_change(self):
        """Test that PIN is rehashed when parameters change."""
        self.user._set_pin('1111')
        original_hash = self.user.pdc_pin_hash

        # Mock the check_needs_rehash to return True
        with patch('pdc_pos_offline.models.res_users._ph') as mock_ph:
            mock_ph.verify = MagicMock()
            mock_ph.check_needs_rehash = MagicMock(return_value=True)
            mock_ph.hash = MagicMock(return_value='$argon2id$newparams$hash')

            self.user._verify_pin('1111')

            # Verify rehashing was called
            mock_ph.hash.assert_called_once_with('1111')

    # ========================================================================
    # PIN Verification Tests (5 tests)
    # ========================================================================

    def test_06_verify_correct_pin(self):
        """Test verification of correct PIN."""
        self.user._set_pin('2345')
        self.assertTrue(self.user._verify_pin('2345'), "Correct PIN should verify")

    def test_07_verify_incorrect_pin(self):
        """Test verification rejects incorrect PIN."""
        self.user._set_pin('3456')
        self.assertFalse(self.user._verify_pin('0000'), "Incorrect PIN should fail")
        self.assertFalse(self.user._verify_pin('3457'), "Off-by-one PIN should fail")

    def test_08_verify_empty_pin_hash(self):
        """Test verification fails when no PIN hash is set."""
        self.assertFalse(self.user._verify_pin('1234'), "Verification should fail with no PIN hash")

    def test_09_verify_empty_pin_input(self):
        """Test verification fails with empty PIN input."""
        self.user._set_pin('4567')
        self.assertFalse(self.user._verify_pin(''), "Empty PIN should fail verification")
        self.assertFalse(self.user._verify_pin(None), "None PIN should fail verification")

    def test_10_verify_constant_time(self):
        """Test that verification uses constant-time comparison."""
        self.user._set_pin('5678')

        # Time correct PIN verification
        start = time.time()
        for _ in range(10):
            self.user._verify_pin('5678')
        correct_time = time.time() - start

        # Time incorrect PIN verification
        start = time.time()
        for _ in range(10):
            self.user._verify_pin('0000')
        incorrect_time = time.time() - start

        # Times should be similar (within 20% tolerance)
        # This is a rough check for constant-time behavior
        ratio = correct_time / incorrect_time if incorrect_time > 0 else 1
        self.assertLess(abs(1 - ratio), 0.2, "Verification time should be constant")

    # ========================================================================
    # PIN Format Validation Tests (4 tests)
    # ========================================================================

    def test_11_pin_must_be_4_digits(self):
        """Test PIN must be exactly 4 digits."""
        with self.assertRaises(ValidationError, msg="3-digit PIN should fail"):
            self.user._set_pin('123')

        with self.assertRaises(ValidationError, msg="5-digit PIN should fail"):
            self.user._set_pin('12345')

        # 4 digits should succeed
        self.user._set_pin('1234')
        self.assertTrue(self.user.pdc_pin_hash)

    def test_12_pin_must_be_numeric(self):
        """Test PIN must contain only digits."""
        with self.assertRaises(ValidationError, msg="Alphabetic characters should fail"):
            self.user._set_pin('abcd')

        with self.assertRaises(ValidationError, msg="Mixed alphanumeric should fail"):
            self.user._set_pin('12ab')

        with self.assertRaises(ValidationError, msg="Special characters should fail"):
            self.user._set_pin('12#4')

    def test_13_pin_edge_cases(self):
        """Test PIN edge cases (all zeros, all nines)."""
        # All zeros should work
        self.user._set_pin('0000')
        self.assertTrue(self.user._verify_pin('0000'))

        # All nines should work
        self.user._set_pin('9999')
        self.assertTrue(self.user._verify_pin('9999'))

    def test_14_pin_whitespace_handling(self):
        """Test that whitespace in PIN is rejected."""
        with self.assertRaises(ValidationError, msg="PIN with spaces should fail"):
            self.user._set_pin('12 4')

        with self.assertRaises(ValidationError, msg="PIN with newline should fail"):
            self.user._set_pin('123\n')

    # ========================================================================
    # Rate Limiting Tests (5 tests)
    # ========================================================================

    def test_15_rate_limit_basic(self):
        """Test basic rate limiting (5 attempts per minute)."""
        from pdc_pos_offline.controllers.main import _check_pin_rate_limit, _pin_attempts

        # Clear any existing attempts
        _pin_attempts.clear()

        # First 5 attempts should succeed
        for i in range(5):
            self.assertTrue(
                _check_pin_rate_limit(self.user.id, '127.0.0.1'),
                f"Attempt {i+1} should be allowed"
            )

        # 6th attempt should fail
        self.assertFalse(
            _check_pin_rate_limit(self.user.id, '127.0.0.1'),
            "6th attempt should be rate limited"
        )

    def test_16_rate_limit_window_reset(self):
        """Test rate limit resets after 60 seconds."""
        from pdc_pos_offline.controllers.main import _check_pin_rate_limit, _pin_attempts

        _pin_attempts.clear()

        # Use up all 5 attempts
        for _ in range(5):
            _check_pin_rate_limit(self.user.id, '127.0.0.1')

        # Should be blocked
        self.assertFalse(_check_pin_rate_limit(self.user.id, '127.0.0.1'))

        # Simulate 61 seconds passing by manually clearing old attempts
        _pin_attempts[self.user.id] = [
            (time.time() - 61, '127.0.0.1') for _ in range(5)
        ]

        # Should be allowed again
        self.assertTrue(_check_pin_rate_limit(self.user.id, '127.0.0.1'))

    def test_17_rate_limit_per_user_isolation(self):
        """Test rate limiting is per-user (not global)."""
        from pdc_pos_offline.controllers.main import _check_pin_rate_limit, _pin_attempts

        _pin_attempts.clear()

        user2 = self.env['res.users'].create({
            'name': 'Test User 3',
            'login': 'testuser3_ratelimit',
            'email': 'test3@test.com',
        })

        # Use up attempts for user1
        for _ in range(5):
            _check_pin_rate_limit(self.user.id, '127.0.0.1')

        # User1 should be blocked
        self.assertFalse(_check_pin_rate_limit(self.user.id, '127.0.0.1'))

        # User2 should still be allowed
        self.assertTrue(_check_pin_rate_limit(user2.id, '127.0.0.1'))

    def test_18_rate_limit_thread_safety(self):
        """Test rate limiting is thread-safe."""
        import threading
        from pdc_pos_offline.controllers.main import _check_pin_rate_limit, _pin_attempts

        _pin_attempts.clear()

        results = []

        def check_limit():
            result = _check_pin_rate_limit(self.user.id, '127.0.0.1')
            results.append(result)

        # Create 10 threads trying simultaneously
        threads = [threading.Thread(target=check_limit) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Exactly 5 should succeed, 5 should fail
        allowed = sum(results)
        self.assertEqual(allowed, 5, "Exactly 5 requests should be allowed (thread-safe)")

    def test_19_rate_limit_ip_logging(self):
        """Test that rate limiting logs IP addresses."""
        from pdc_pos_offline.controllers.main import _check_pin_rate_limit, _pin_attempts

        _pin_attempts.clear()

        # Make attempts from different IPs
        _check_pin_rate_limit(self.user.id, '192.168.1.1')
        _check_pin_rate_limit(self.user.id, '192.168.1.2')

        # Check that IPs are stored
        attempts = _pin_attempts[self.user.id]
        ips = [ip for _, ip in attempts]
        self.assertIn('192.168.1.1', ips)
        self.assertIn('192.168.1.2', ips)

    # ========================================================================
    # Database Security Tests (3 tests)
    # ========================================================================

    def test_20_no_plaintext_pin_storage(self):
        """Test that plaintext PIN is never stored in database."""
        self.user._set_pin('6789')

        # Reload user from database
        self.user.invalidate_recordset()
        self.user = self.env['res.users'].browse(self.user.id)

        # pdc_pin should always be empty (computed field)
        self.assertEqual(self.user.pdc_pin, '', "Plaintext PIN should never be stored")

    def test_21_pin_hash_updates_on_change(self):
        """Test that changing PIN updates hash."""
        self.user._set_pin('1111')
        first_hash = self.user.pdc_pin_hash

        self.user._set_pin('2222')
        second_hash = self.user.pdc_pin_hash

        self.assertNotEqual(first_hash, second_hash, "Hash should change when PIN changes")
        self.assertFalse(self.user._verify_pin('1111'), "Old PIN should no longer verify")
        self.assertTrue(self.user._verify_pin('2222'), "New PIN should verify")

    def test_22_pin_hash_not_copyable(self):
        """Test that PIN hash is not copied when duplicating user."""
        self.user._set_pin('3333')

        # Create a copy of the user
        user_copy = self.user.copy({'login': 'testuser_copy'})

        # PIN hash should NOT be copied (copy=False)
        self.assertFalse(user_copy.pdc_pin_hash, "PIN hash should not be copied")

    # ========================================================================
    # Performance Tests (2 tests)
    # ========================================================================

    def test_23_single_verification_performance(self):
        """Test that single PIN verification completes in <500ms."""
        self.user._set_pin('7890')

        start = time.time()
        self.user._verify_pin('7890')
        elapsed = time.time() - start

        self.assertLess(elapsed, 0.5, f"Verification took {elapsed:.3f}s, should be <0.5s")

    def test_24_brute_force_resistance(self):
        """Test that brute-forcing 10,000 PINs is impractical."""
        self.user._set_pin('1234')

        # Measure time for 10 attempts
        start = time.time()
        for pin in ['0000', '0001', '0002', '0003', '0004',
                    '0005', '0006', '0007', '0008', '0009']:
            self.user._verify_pin(pin)
        elapsed_10 = time.time() - start

        # Extrapolate to 10,000 attempts
        estimated_10k = (elapsed_10 / 10) * 10000

        # Should take at least 10 minutes (600 seconds) to brute-force
        # This ensures Argon2id's memory-hardness provides real protection
        self.assertGreater(
            estimated_10k, 600,
            f"Brute-forcing 10,000 PINs should take >10 minutes, "
            f"estimated: {estimated_10k/60:.1f} minutes"
        )


if __name__ == '__main__':
    unittest.main()
