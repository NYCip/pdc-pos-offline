#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test Data Generator for PDC POS Offline Module
Generates comprehensive test data for all test scenarios
"""

import json
import random
import string
import hashlib
from datetime import datetime, timedelta
import csv
import os


class TestDataGenerator:
    """Generate test data for PDC POS Offline module testing"""
    
    def __init__(self):
        self.data_dir = "tests/test_data"
        os.makedirs(self.data_dir, exist_ok=True)
        
    def generate_all(self):
        """Generate all test data sets"""
        print("Generating test data for PDC POS Offline module...")
        
        # Generate different data sets
        self.generate_users()
        self.generate_products()
        self.generate_orders()
        self.generate_network_scenarios()
        self.generate_conflict_scenarios()
        self.generate_edge_cases()
        self.generate_performance_data()
        
        print(f"✓ Test data generated in {self.data_dir}/")
        
    def generate_users(self):
        """Generate test users with various PIN configurations"""
        users = []
        
        # Standard users
        standard_users = [
            {"id": 1, "login": "admin", "name": "Administrator", "pin": "1234", "role": "pos_manager"},
            {"id": 2, "login": "cashier1", "name": "Alice Smith", "pin": "5678", "role": "pos_user"},
            {"id": 3, "login": "cashier2", "name": "Bob Johnson", "pin": "1234", "role": "pos_user"},  # Duplicate PIN
            {"id": 4, "login": "trainee", "name": "Charlie Brown", "pin": "0000", "role": "pos_user"},
            {"id": 5, "login": "supervisor", "name": "Diana Prince", "pin": "9999", "role": "pos_manager"},
        ]
        
        # Add PIN hashes
        for user in standard_users:
            user['pin_hash'] = self._generate_pin_hash(user['pin'], user['id'])
            users.append(user)
        
        # Users for stress testing (100 users)
        for i in range(100):
            user = {
                "id": 100 + i,
                "login": f"user_{i:03d}",
                "name": f"Test User {i}",
                "pin": self._generate_random_pin(),
                "role": random.choice(["pos_user", "pos_manager"]),
            }
            user['pin_hash'] = self._generate_pin_hash(user['pin'], user['id'])
            users.append(user)
        
        # Edge case users
        edge_users = [
            {"id": 999, "login": "no_pin_user", "name": "No PIN User", "pin": None, "role": "pos_user"},
            {"id": 1000, "login": "locked_user", "name": "Locked User", "pin": "1111", "role": "pos_user", "locked": True},
            {"id": 1001, "login": "inactive", "name": "Inactive User", "pin": "2222", "role": "pos_user", "active": False},
        ]
        
        for user in edge_users:
            if user.get('pin'):
                user['pin_hash'] = self._generate_pin_hash(user['pin'], user['id'])
            users.append(user)
        
        self._save_json('users.json', users)
        self._save_csv('users.csv', users)
        
        print(f"✓ Generated {len(users)} test users")
        return users
        
    def generate_products(self):
        """Generate test products for performance testing"""
        products = []
        
        categories = ['Food', 'Beverage', 'Electronics', 'Clothing', 'Books', 'Toys', 'Health', 'Home']
        
        # Generate 10,000 products for stress testing
        for i in range(10000):
            product = {
                "id": i + 1,
                "name": f"Product {i + 1:05d}",
                "display_name": self._generate_product_name(i),
                "barcode": self._generate_barcode(),
                "price": round(random.uniform(0.99, 999.99), 2),
                "cost": round(random.uniform(0.50, 500.00), 2),
                "category": random.choice(categories),
                "qty_available": random.randint(0, 1000),
                "active": random.random() > 0.05,  # 95% active
                "is_ebt_eligible": random.random() > 0.7,  # 30% EBT eligible
            }
            products.append(product)
        
        # Special test products
        special_products = [
            {"id": 99991, "name": "Zero Price Product", "price": 0.00, "barcode": "000000000000"},
            {"id": 99992, "name": "Negative Stock", "price": 10.00, "qty_available": -10},
            {"id": 99993, "name": "Very Expensive", "price": 99999.99, "barcode": "999999999999"},
            {"id": 99994, "name": "Long Name " + "X" * 200, "price": 5.00},  # Long name
            {"id": 99995, "name": "Special Chars !@#$%^&*()", "price": 15.00},
        ]
        
        products.extend(special_products)
        
        self._save_json('products.json', products)
        
        # Save smaller subset for quick tests
        self._save_json('products_small.json', products[:100])
        
        print(f"✓ Generated {len(products)} test products")
        return products
        
    def generate_orders(self):
        """Generate test orders for conflict and sync testing"""
        orders = []
        
        start_date = datetime.now() - timedelta(days=30)
        
        # Generate 1000 orders over 30 days
        for i in range(1000):
            order_date = start_date + timedelta(
                days=random.randint(0, 30),
                hours=random.randint(8, 20),
                minutes=random.randint(0, 59)
            )
            
            order = {
                "id": f"ORD{i + 1:06d}",
                "pos_reference": f"Order {i + 1:06d}",
                "date_order": order_date.isoformat(),
                "user_id": random.randint(1, 5),
                "amount_total": round(random.uniform(10, 500), 2),
                "amount_tax": round(random.uniform(0, 50), 2),
                "amount_paid": round(random.uniform(10, 500), 2),
                "lines": self._generate_order_lines(random.randint(1, 20)),
                "statement_ids": self._generate_payments(),
                "state": random.choice(['draft', 'paid', 'done', 'invoiced']),
                "offline_id": f"offline_{i}" if random.random() > 0.5 else None,
                "sync_status": random.choice(['pending', 'synced', 'error']) if random.random() > 0.3 else None,
                "version": 1,
            }
            
            orders.append(order)
        
        # Orders for conflict testing
        conflict_orders = []
        for i in range(10):
            base_order = {
                "id": f"CONFLICT{i + 1:03d}",
                "version": 1,
                "date_order": datetime.now().isoformat(),
                "amount_total": 100.00,
            }
            
            # Create online version (newer)
            online_version = base_order.copy()
            online_version['version'] = 2
            online_version['amount_total'] = 150.00
            online_version['modified_date'] = (datetime.now() + timedelta(minutes=30)).isoformat()
            
            # Create offline version (older but with different changes)
            offline_version = base_order.copy()
            offline_version['version'] = 1
            offline_version['lines'] = self._generate_order_lines(5)
            offline_version['offline_modified'] = True
            
            conflict_orders.extend([online_version, offline_version])
        
        self._save_json('orders.json', orders)
        self._save_json('conflict_orders.json', conflict_orders)
        
        print(f"✓ Generated {len(orders)} test orders")
        return orders
        
    def generate_network_scenarios(self):
        """Generate network condition test scenarios"""
        scenarios = [
            {
                "name": "stable_online",
                "description": "Stable online connection",
                "events": [{"time": 0, "state": "online", "duration": 3600}]
            },
            {
                "name": "stable_offline",
                "description": "Complete offline for extended period",
                "events": [{"time": 0, "state": "offline", "duration": 86400}]  # 24 hours
            },
            {
                "name": "frequent_flapping",
                "description": "Network flapping every 30 seconds",
                "events": self._generate_flapping_events(30, 120)  # 30s intervals for 2 hours
            },
            {
                "name": "random_disconnects",
                "description": "Random disconnections",
                "events": self._generate_random_disconnects(24)  # 24 hour period
            },
            {
                "name": "degraded_connection",
                "description": "Slow/degraded connection",
                "events": [
                    {"time": 0, "state": "online", "latency": 2000, "packet_loss": 0.1},
                    {"time": 3600, "state": "online", "latency": 5000, "packet_loss": 0.3},
                ]
            },
            {
                "name": "business_hours_offline",
                "description": "Offline during business hours only",
                "events": self._generate_business_hours_offline(7)  # 7 days
            }
        ]
        
        self._save_json('network_scenarios.json', scenarios)
        print(f"✓ Generated {len(scenarios)} network scenarios")
        return scenarios
        
    def generate_conflict_scenarios(self):
        """Generate data conflict test scenarios"""
        conflicts = []
        
        # Order conflicts
        order_conflicts = [
            {
                "type": "concurrent_modification",
                "description": "Same order modified online and offline",
                "local": {
                    "id": "ORD001",
                    "version": 1,
                    "total": 100.00,
                    "items": ["A", "B"],
                    "modified": datetime.now().isoformat()
                },
                "remote": {
                    "id": "ORD001",
                    "version": 2,
                    "total": 150.00,
                    "items": ["A", "B", "C"],
                    "modified": (datetime.now() + timedelta(minutes=5)).isoformat()
                }
            },
            {
                "type": "deleted_remotely",
                "description": "Order deleted online but modified offline",
                "local": {
                    "id": "ORD002",
                    "status": "paid",
                    "total": 75.00
                },
                "remote": None  # Deleted
            },
            {
                "type": "inventory_conflict",
                "description": "Insufficient inventory after sync",
                "local": {
                    "product_id": 1,
                    "ordered_qty": 50,
                    "available_qty": 100  # At time of offline order
                },
                "remote": {
                    "product_id": 1,
                    "current_qty": 30  # Current online inventory
                }
            }
        ]
        
        conflicts.extend(order_conflicts)
        
        # Customer conflicts
        customer_conflicts = [
            {
                "type": "customer_data_mismatch",
                "description": "Customer details changed in both systems",
                "local": {
                    "id": 100,
                    "name": "John Doe",
                    "email": "john.doe@example.com",
                    "phone": "555-1234"
                },
                "remote": {
                    "id": 100,
                    "name": "John M. Doe",
                    "email": "johndoe@company.com",
                    "phone": "555-5678"
                }
            }
        ]
        
        conflicts.extend(customer_conflicts)
        
        self._save_json('conflict_scenarios.json', conflicts)
        print(f"✓ Generated {len(conflicts)} conflict scenarios")
        return conflicts
        
    def generate_edge_cases(self):
        """Generate edge case test data"""
        edge_cases = {
            "pins": {
                "sequential": ["1234", "2345", "3456", "4567"],
                "repeated": ["1111", "2222", "3333", "4444", "5555"],
                "patterns": ["1212", "1010", "2020", "1357", "2468"],
                "common": ["0000", "1234", "1111", "9999", "1000"],
            },
            "storage": {
                "large_order": self._generate_order_lines(1000),  # 1000 items in one order
                "unicode_data": {
                    "customer": "🏪 José García-Márquez™",
                    "product": "Café ☕ Español €5.99",
                    "note": "Test with émojis 😀 and spëcial chars"
                },
                "binary_data": {
                    "signature": "data:image/png;base64,iVBORw0KGgoAAAANS...",  # Truncated
                    "receipt_logo": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
                }
            },
            "timing": {
                "rapid_clicks": [{"click_time": i * 0.1} for i in range(100)],  # 100 clicks in 10 seconds
                "concurrent_logins": [
                    {"user": f"user{i}", "time": 0} for i in range(10)  # 10 simultaneous logins
                ],
            },
            "numbers": {
                "max_int": 2147483647,
                "min_int": -2147483648,
                "max_float": 999999999.99,
                "precision": 0.0000000001,
                "javascript_max": 9007199254740991,  # JavaScript MAX_SAFE_INTEGER
            }
        }
        
        self._save_json('edge_cases.json', edge_cases)
        print("✓ Generated edge case scenarios")
        return edge_cases
        
    def generate_performance_data(self):
        """Generate data for performance testing"""
        
        # Large dataset for memory testing
        large_dataset = {
            "orders": [],
            "products": [],
            "customers": []
        }
        
        # 50,000 orders for extreme testing
        print("Generating large dataset for performance testing...")
        for i in range(50000):
            if i % 5000 == 0:
                print(f"  Progress: {i}/50000 orders")
                
            large_dataset["orders"].append({
                "id": f"PERF{i:08d}",
                "date": datetime.now().isoformat(),
                "total": random.uniform(10, 1000),
                "items": random.randint(1, 50)
            })
        
        # Save in chunks to avoid memory issues
        chunk_size = 10000
        for i in range(0, len(large_dataset["orders"]), chunk_size):
            chunk = large_dataset["orders"][i:i + chunk_size]
            self._save_json(f'performance_orders_chunk_{i // chunk_size}.json', chunk)
        
        # Benchmark data
        benchmarks = {
            "operations": [
                {"name": "pin_validation", "target_ms": 1, "max_ms": 10},
                {"name": "session_save", "target_ms": 100, "max_ms": 500},
                {"name": "session_restore", "target_ms": 50, "max_ms": 200},
                {"name": "product_search_1k", "target_ms": 50, "max_ms": 200},
                {"name": "product_search_10k", "target_ms": 200, "max_ms": 500},
                {"name": "order_sync_100", "target_ms": 5000, "max_ms": 10000},
                {"name": "order_sync_1000", "target_ms": 30000, "max_ms": 60000},
            ],
            "memory_limits": {
                "base_memory_mb": 50,
                "max_memory_mb": 200,
                "max_indexeddb_mb": 500,
            },
            "ui_targets": {
                "fps": 60,
                "first_paint_ms": 1000,
                "time_to_interactive_ms": 3000,
                "max_blocking_time_ms": 300,
            }
        }
        
        self._save_json('performance_benchmarks.json', benchmarks)
        print("✓ Generated performance test data")
        
    # Helper methods
    def _generate_pin_hash(self, pin, user_id):
        """Generate PIN hash matching Odoo's method"""
        if not pin:
            return None
        salt = str(user_id)
        return hashlib.sha256(f"{pin}{salt}".encode('utf-8')).hexdigest()
    
    def _generate_random_pin(self):
        """Generate random 4-digit PIN"""
        return str(random.randint(1000, 9999))
    
    def _generate_barcode(self):
        """Generate random 13-digit barcode (EAN-13)"""
        return ''.join([str(random.randint(0, 9)) for _ in range(13)])
    
    def _generate_product_name(self, index):
        """Generate realistic product name"""
        prefixes = ['Premium', 'Organic', 'Fresh', 'Deluxe', 'Classic', 'Original']
        products = ['Coffee', 'Tea', 'Juice', 'Bread', 'Milk', 'Cheese', 'Apple', 'Banana']
        suffixes = ['500g', '1kg', '1L', 'Pack', 'Box', 'Bottle']
        
        return f"{random.choice(prefixes)} {random.choice(products)} {random.choice(suffixes)}"
    
    def _generate_order_lines(self, count):
        """Generate order lines"""
        lines = []
        for i in range(count):
            lines.append({
                "product_id": random.randint(1, 1000),
                "qty": random.randint(1, 10),
                "price_unit": round(random.uniform(0.99, 99.99), 2),
                "discount": random.choice([0, 5, 10, 15, 20]),
            })
        return lines
    
    def _generate_payments(self):
        """Generate payment records"""
        payment_methods = ['cash', 'card', 'bank']
        payments = []
        
        num_payments = random.choices([1, 2, 3], weights=[0.8, 0.15, 0.05])[0]
        
        for i in range(num_payments):
            payments.append({
                "payment_method": random.choice(payment_methods),
                "amount": round(random.uniform(10, 200), 2),
                "payment_date": datetime.now().isoformat(),
            })
        
        return payments
    
    def _generate_flapping_events(self, interval_seconds, duration_seconds):
        """Generate network flapping events"""
        events = []
        current_time = 0
        state = "online"
        
        while current_time < duration_seconds:
            events.append({
                "time": current_time,
                "state": state,
                "duration": interval_seconds
            })
            current_time += interval_seconds
            state = "offline" if state == "online" else "online"
        
        return events
    
    def _generate_random_disconnects(self, hours):
        """Generate random disconnect events"""
        events = []
        current_time = 0
        total_seconds = hours * 3600
        
        while current_time < total_seconds:
            # Online period
            online_duration = random.randint(300, 7200)  # 5 min to 2 hours
            events.append({
                "time": current_time,
                "state": "online",
                "duration": online_duration
            })
            current_time += online_duration
            
            # Offline period
            if current_time < total_seconds:
                offline_duration = random.randint(30, 600)  # 30s to 10 min
                events.append({
                    "time": current_time,
                    "state": "offline",
                    "duration": offline_duration
                })
                current_time += offline_duration
        
        return events
    
    def _generate_business_hours_offline(self, days):
        """Generate offline during business hours pattern"""
        events = []
        
        for day in range(days):
            day_start = day * 86400  # Seconds in a day
            
            # Online before business hours (midnight to 8am)
            events.append({
                "time": day_start,
                "state": "online",
                "duration": 8 * 3600
            })
            
            # Offline during business hours (8am to 6pm)
            events.append({
                "time": day_start + 8 * 3600,
                "state": "offline",
                "duration": 10 * 3600
            })
            
            # Online after business hours (6pm to midnight)
            events.append({
                "time": day_start + 18 * 3600,
                "state": "online",
                "duration": 6 * 3600
            })
        
        return events
    
    def _save_json(self, filename, data):
        """Save data as JSON"""
        filepath = os.path.join(self.data_dir, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    
    def _save_csv(self, filename, data):
        """Save data as CSV"""
        if not data:
            return
            
        # Get all unique keys from all records
        all_keys = set()
        for record in data:
            all_keys.update(record.keys())
        
        filepath = os.path.join(self.data_dir, filename)
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=sorted(all_keys))
            writer.writeheader()
            writer.writerows(data)


if __name__ == "__main__":
    generator = TestDataGenerator()
    generator.generate_all()
    
    print("\nTest data generation complete!")
    print(f"Data saved in: {generator.data_dir}/")
    print("\nGenerated files:")
    for file in os.listdir(generator.data_dir):
        size = os.path.getsize(os.path.join(generator.data_dir, file))
        print(f"  - {file} ({size:,} bytes)")