# PDC POS Offline Module - Comprehensive Test Cases

## Test Suite Overview
- **Total Test Cases**: 10
- **Categories**: Authentication, Session Management, Network Scenarios, Data Integrity, UI/UX
- **Test Environment**: Odoo 18.0 with POS module

---

## Test Case 1: PIN Brute Force Protection
**Category**: Security/Authentication  
**Priority**: Critical  
**Type**: Edge Case

### Scenario
Multiple failed PIN attempts should lock out the user temporarily.

### Test Steps
1. Open POS in offline mode
2. Enter username "pos_user"
3. Enter incorrect PIN "0000"
4. Repeat incorrect PIN entry 5 times
5. Attempt with correct PIN "1234"

### Expected Results
- After 3 failed attempts: Warning message displayed
- After 5 failed attempts: Account locked for 5 minutes
- Lockout message: "Too many failed attempts. Try again in X minutes"
- Correct PIN rejected during lockout period

### Edge Cases
- Rapid-fire attempts (automated)
- Browser refresh during lockout
- Clock manipulation attempts

---

## Test Case 2: Session Persistence Across Multiple Browser Crashes
**Category**: Session Management  
**Priority**: High  
**Type**: Edge Case

### Scenario
Session should survive multiple browser crashes and system restarts.

### Test Steps
1. Login to POS online
2. Create partial order with 5 items
3. Disconnect network
4. Force-kill browser process (not normal close)
5. Restart browser
6. Navigate to POS URL
7. Repeat crash 3 times

### Expected Results
- Session restored each time
- Order items preserved
- Customer data intact
- No duplicate sessions created
- Performance degradation < 10%

### Edge Cases
- Corrupt IndexedDB during crash
- Multiple tabs with same session
- Browser private/incognito mode

---

## Test Case 3: Network Flapping During Transaction
**Category**: Network Scenarios  
**Priority**: Critical  
**Type**: Edge Case

### Scenario
Network connection repeatedly connects/disconnects during payment processing.

### Test Steps
1. Start order with 10 items ($500 total)
2. Begin payment process
3. Simulate network flapping (on/off every 2 seconds)
4. Complete payment during offline period
5. Restore stable connection
6. Check transaction integrity

### Expected Results
- Payment queued during offline
- No duplicate transactions
- Sync completes without errors
- Order status accurate
- Payment reconciliation correct

### Edge Cases
- Payment split between online/offline
- Partial sync completion
- Timeout during sync

---

## Test Case 4: Concurrent Users with Same PIN
**Category**: Security/Multi-user  
**Priority**: High  
**Type**: Edge Case

### Scenario
Multiple users attempting offline login with identical PINs.

### Test Steps
1. Configure users "user1" and "user2" with PIN "1234"
2. Open POS on Device A
3. Login as "user1" with PIN "1234"
4. Open POS on Device B
5. Login as "user2" with PIN "1234"
6. Perform transactions on both devices
7. Reconnect both devices simultaneously

### Expected Results
- Both users can login independently
- Sessions remain isolated
- No data cross-contamination
- Sync conflicts resolved properly
- Audit trail shows both users

### Edge Cases
- Same user on multiple devices
- PIN change during offline session
- Role permission conflicts

---

## Test Case 5: Storage Quota Exceeded
**Category**: Data Integrity  
**Priority**: Medium  
**Type**: Edge Case

### Scenario
IndexedDB storage limit reached during offline operations.

### Test Steps
1. Create 1000 test products
2. Start offline session
3. Create orders until storage warning
4. Continue adding items
5. Attempt to save session
6. Check data integrity

### Expected Results
- Warning at 80% capacity
- Graceful handling at 100%
- Old sessions auto-cleaned
- Critical data prioritized
- Clear error messages
- Recovery options provided

### Edge Cases
- Sudden storage spike
- Corrupted storage calculation
- Browser storage disabled

---

## Test Case 6: UI Responsiveness Under Load
**Category**: UI/UX Performance  
**Priority**: High  
**Type**: UI Audit

### Scenario
UI performance with large offline dataset and poor device performance.

### Test Steps
1. Load 10,000 products offline
2. Simulate CPU throttling (6x slowdown)
3. Search products by name
4. Add 50 items to cart
5. Navigate between screens
6. Measure response times

### Expected Results
- Product search < 500ms
- Screen transitions < 200ms
- No UI freezing
- Smooth scrolling
- Loading indicators shown
- Memory usage stable

### Performance Metrics
- First Contentful Paint < 1s
- Time to Interactive < 3s
- Total Blocking Time < 300ms

---

## Test Case 7: Offline Mode Visual Indicators
**Category**: UI/UX Audit  
**Priority**: Medium  
**Type**: UI Audit

### Scenario
Clear visual communication of offline status throughout the interface.

### Test Steps
1. Start in online mode
2. Disconnect network
3. Check all UI elements
4. Perform various actions
5. Reconnect network
6. Verify status updates

### Expected UI Elements
- Offline banner (orange, pulsing icon)
- Connection status in header
- Sync queue counter
- Last sync timestamp
- Action buttons show offline state
- Toast notifications for mode changes

### Accessibility Requirements
- ARIA labels for screen readers
- Color-blind safe indicators
- Keyboard navigation preserved

---

## Test Case 8: PIN Input Security and Usability
**Category**: UI/UX Security  
**Priority**: High  
**Type**: UI Audit

### Scenario
PIN input field security and user experience testing.

### Test Steps
1. Test PIN visibility toggle
2. Check auto-clear after timeout
3. Verify masked input
4. Test paste prevention
5. Check virtual keyboard
6. Verify focus management

### Expected Results
- PIN masked by default
- No PIN in browser history
- Auto-clear after 30s idle
- Copy/paste disabled
- Large touch targets (mobile)
- Clear error states

### Edge Cases
- Password managers
- Browser auto-fill
- Screen readers
- Right-to-left languages

---

## Test Case 9: Data Conflict Resolution
**Category**: Data Integrity  
**Priority**: Critical  
**Type**: Edge Case

### Scenario
Same order modified online and offline simultaneously.

### Test Steps
1. Create order ID #1001 online
2. Go offline on Device A
3. Modify order (add items) offline
4. On Device B (online), modify same order
5. Device A comes back online
6. Trigger sync process

### Expected Results
- Conflict detected
- User prompted for resolution
- Both versions preserved
- Audit trail complete
- No data loss
- Merge options available

### Conflict Types
- Price changes
- Inventory conflicts
- Customer data updates
- Payment mismatches

---

## Test Case 10: Extended Offline Operation
**Category**: Stress Testing  
**Priority**: High  
**Type**: Edge Case

### Scenario
POS operates offline for 7+ days with heavy usage.

### Test Steps
1. Start offline session
2. Process 100 orders/day
3. Multiple users (3 shifts)
4. Continue for 7 days
5. Accumulate 700+ orders
6. Reconnect and sync

### Expected Results
- All orders preserved
- Sync completes < 5 minutes
- No memory leaks
- Session data intact
- Performance acceptable
- Batch sync successful

### Monitoring Points
- Storage growth rate
- Memory usage trend
- Sync queue size
- Performance degradation
- Error accumulation

---

## Test Execution Matrix

| Test Case | Manual | Automated | Frequency | Environment |
|-----------|--------|-----------|-----------|-------------|
| TC1: PIN Brute Force | ✓ | ✓ | Daily | Security |
| TC2: Session Persistence | ✓ | ✓ | Weekly | All |
| TC3: Network Flapping | ✓ | ✓ | Daily | Network |
| TC4: Concurrent Users | ✓ | ✓ | Weekly | Multi-user |
| TC5: Storage Quota | ✓ | ✓ | Monthly | Edge |
| TC6: UI Performance | ✓ | ✓ | Daily | Performance |
| TC7: Visual Indicators | ✓ | - | Release | UI |
| TC8: PIN Input | ✓ | ✓ | Weekly | Security |
| TC9: Conflict Resolution | ✓ | ✓ | Daily | Data |
| TC10: Extended Offline | ✓ | - | Monthly | Stress |

---

## Automated Test Implementation

```javascript
// Example automated test for Test Case 1
describe('PIN Brute Force Protection', () => {
    let offlineAuth;
    
    beforeEach(async () => {
        offlineAuth = new OfflineAuth();
        await offlineAuth.init();
    });
    
    it('should lock account after 5 failed attempts', async () => {
        const userId = 1;
        const incorrectPin = '0000';
        const correctPin = '1234';
        
        // Attempt 5 failed logins
        for (let i = 0; i < 5; i++) {
            await offlineAuth.validatePin(userId, incorrectPin);
        }
        
        // Verify lockout
        await expect(
            offlineAuth.validatePin(userId, correctPin)
        ).rejects.toThrow('Too many attempts');
        
        // Verify lockout persists
        const lockoutStatus = await offlineAuth.getLockoutStatus(userId);
        expect(lockoutStatus.isLocked).toBe(true);
        expect(lockoutStatus.remainingTime).toBeGreaterThan(0);
    });
});
```

---

## Test Data Generator

```python
# test_data_generator.py
import random
import json
from datetime import datetime, timedelta

def generate_test_data():
    """Generate comprehensive test data for all scenarios"""
    
    # Users with various PIN configurations
    users = [
        {"id": 1, "login": "admin", "pin": "1234", "role": "manager"},
        {"id": 2, "login": "cashier1", "pin": "5678", "role": "cashier"},
        {"id": 3, "login": "cashier2", "pin": "1234", "role": "cashier"},  # Duplicate PIN
        {"id": 4, "login": "trainee", "pin": "0000", "role": "limited"},
    ]
    
    # Products for stress testing
    products = []
    for i in range(10000):
        products.append({
            "id": i + 1,
            "name": f"Product {i + 1}",
            "price": round(random.uniform(0.99, 999.99), 2),
            "barcode": f"{random.randint(1000000000000, 9999999999999)}",
            "category": random.choice(["Food", "Beverage", "Electronics", "Clothing"]),
        })
    
    # Orders for conflict testing
    orders = []
    for i in range(100):
        order_date = datetime.now() - timedelta(days=random.randint(0, 30))
        orders.append({
            "id": f"ORD{i + 1:04d}",
            "date": order_date.isoformat(),
            "items": random.randint(1, 20),
            "total": round(random.uniform(10, 500), 2),
            "status": random.choice(["draft", "paid", "posted"]),
            "offline": random.choice([True, False]),
        })
    
    return {
        "users": users,
        "products": products,
        "orders": orders,
        "generated_at": datetime.now().isoformat()
    }

if __name__ == "__main__":
    test_data = generate_test_data()
    with open('test_data.json', 'w') as f:
        json.dump(test_data, f, indent=2)
    print(f"Generated test data with {len(test_data['products'])} products")
```

---

## Success Criteria

### Overall Test Suite
- 100% test cases documented
- 80% automated test coverage
- Zero critical bugs in production
- < 2% test failure rate
- All edge cases covered

### Performance Benchmarks
- Offline login: < 2 seconds
- Session restore: < 1 second
- Sync 1000 transactions: < 60 seconds
- UI response time: < 200ms
- Memory usage: < 100MB additional