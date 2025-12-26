# PDC POS Offline - Manual UI Testing Script

## 🎬 Test Execution Script

### Prerequisites
- Odoo 18 with POS module installed
- PDC POS Offline module installed
- Test users created (admin, cashier1, cashier2)
- Chrome DevTools available

---

## Act 1: Initial Configuration

### Scene 1.1: Module Installation Check
```
1. Login as Administrator
2. Navigate to Apps
3. Search for "PDC POS Offline"
4. Verify module shows as "Installed"

✓ Check: Module icon visible
✓ Check: Version shows "18.0.1.0.0"
✓ Check: Author shows "PDC"
```

### Scene 1.2: User PIN Setup
```
1. Go to Settings (gear icon)
2. Navigate to Users & Companies → Users
3. Select user "cashier1"
4. Look for "POS Offline" tab (after Access Rights)

✓ Check: Tab is visible and clickable
✓ Check: Tab only visible to managers

5. Click "POS Offline" tab
6. Observe empty PIN field

✓ Check: Field shows password dots when typing
✓ Check: "Generate PIN" button is blue with icon

7. Click "Generate PIN" button
8. Note the generated PIN (e.g., "1234")

✓ Check: Success notification appears
✓ Check: PIN field now shows ••••
✓ Check: Cannot copy from PIN field

9. Save user record
```

### Scene 1.3: POS Configuration
```
1. Navigate to Point of Sale app
2. Go to Configuration → Point of Sale
3. Select "Shop" or your POS config
4. Scroll to find "Offline Settings" section

✓ Check: Section has clear heading
✓ Check: Enable checkbox is prominent

5. Check "Enable Offline Mode"

✓ Check: Dependent fields appear smoothly
✓ Check: Default values are sensible

6. Configure:
   - Session Timeout: 24 hours
   - Storage Limit: 500 MB  
   - Sync Interval: 5 minutes
   - Require PIN: ✓ (checked)
   - Max PIN Attempts: 5

✓ Check: Units shown (hours, MB, minutes)
✓ Check: Input validation works
✓ Check: Save button enables

7. Save configuration
```

---

## Act 2: Online to Offline Transition

### Scene 2.1: Normal POS Operation
```
1. Open POS interface (Point of Sale → New Session)
2. Login with cashier credentials
3. Observe top bar status

✓ Check: Green WiFi icon visible
✓ Check: No offline warnings
✓ Check: Status shows "Online"

4. Create a test order
5. Add 3 products
6. Save order (don't validate)
```

### Scene 2.2: Simulate Offline Mode
```
1. Open Chrome DevTools (F12)
2. Go to Network tab
3. Check "Offline" checkbox
4. Return to POS interface

✓ Check: Orange banner slides down from top
✓ Check: Banner text: "Offline Mode - Transactions will sync..."
✓ Check: WiFi icon turns red
✓ Check: Icon has subtle pulse animation

5. Try to create another order
6. Add products and validate

✓ Check: All functions work normally
✓ Check: "1 pending" appears in status
✓ Check: No error messages
```

---

## Act 3: Offline Login Experience

### Scene 3.1: Browser Closure Test
```
1. While offline, close browser completely
2. Wait 5 seconds
3. Open browser again
4. Navigate to POS URL: http://localhost:8069/pos/ui

✓ Check: Offline login popup appears
✓ Check: Background is blurred
✓ Check: "Offline Authentication" title visible

5. Observe login form

✓ Check: Username field shows "cashier1" (read-only)
✓ Check: PIN field is empty and focused
✓ Check: Offline indicator (red) visible
✓ Check: Warning message about offline mode
```

### Scene 3.2: PIN Entry Testing
```
1. Try wrong PIN "0000"

✓ Check: Error message appears
✓ Check: PIN field gets red border
✓ Check: Shake animation plays

2. Clear and enter correct PIN "1234"

✓ Check: PIN shows as ••••
✓ Check: Cannot paste into field

3. Click "Login Offline"

✓ Check: Loading spinner appears
✓ Check: Success - enters POS
✓ Check: Previous session restored
✓ Check: Previous orders still visible
```

### Scene 3.3: Lockout Testing
```
1. Logout and try again
2. Enter wrong PIN 5 times rapidly

After 3 attempts:
✓ Check: Warning message appears
✓ Check: "2 attempts remaining"

After 5 attempts:
✓ Check: Account locked message
✓ Check: Countdown timer shown
✓ Check: Login button disabled
✓ Check: Timer counts down from 5:00
```

---

## Act 4: Synchronization Process

### Scene 4.1: Return Online
```
1. Create 5 offline orders
2. In DevTools, uncheck "Offline"
3. Return to POS

✓ Check: "Connection Restored" notification
✓ Check: Banner changes color (green flash)
✓ Check: "Syncing..." message appears
✓ Check: Progress indication visible

4. Watch sync process

✓ Check: Queue counter decreases (5→4→3→2→1→0)
✓ Check: Each order syncs individually
✓ Check: Success message when complete
✓ Check: Banner returns to normal
```

### Scene 4.2: Sync Conflicts
```
1. Create offline order for Product A (qty: 10)
2. Have another user modify Product A online
3. Reconnect to trigger sync

✓ Check: Conflict dialog appears
✓ Check: Shows both versions clearly
✓ Check: Options to resolve conflict
✓ Check: Can choose version or merge
```

---

## Act 5: Mobile and Tablet Testing

### Scene 5.1: Responsive Design
```
1. Open Chrome DevTools
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select "iPad" preset
4. Refresh POS page

✓ Check: Layout adapts properly
✓ Check: Buttons are larger
✓ Check: No horizontal scroll

5. Switch to "iPhone 12 Pro"

✓ Check: Single column layout
✓ Check: PIN input is large
✓ Check: Touch targets ≥ 44px
```

### Scene 5.2: Touch Interactions
```
1. Use mouse as touch (in device mode)
2. Try PIN entry with on-screen keyboard

✓ Check: Input responds properly
✓ Check: No lag or delay
✓ Check: Keyboard doesn't cover input

3. Test swipe gestures

✓ Check: Smooth scrolling
✓ Check: No accidental selections
```

---

## Act 6: Performance Testing

### Scene 6.1: Load Testing
```
1. Open DevTools Performance tab
2. Start recording
3. Perform these actions:
   - Switch offline/online 5 times
   - Create 10 orders rapidly
   - Scroll through products

4. Stop recording

✓ Check: No major frame drops
✓ Check: FPS stays above 30
✓ Check: Memory usage stable
```

### Scene 6.2: Storage Testing
```
1. Open DevTools Application tab
2. Check IndexedDB → PDCPOSOfflineDB
3. Note current size
4. Create 50 offline orders
5. Check size again

✓ Check: Storage grows reasonably
✓ Check: Old sessions cleaned up
✓ Check: Warning at 80% capacity
```

---

## Act 7: Edge Cases

### Scene 7.1: Rapid Actions
```
1. Click Generate PIN 10 times rapidly

✓ Check: No duplicate requests
✓ Check: UI doesn't break
✓ Check: Single PIN generated

2. Toggle offline/online rapidly

✓ Check: Banner doesn't stack
✓ Check: Status stays consistent
```

### Scene 7.2: Special Characters
```
1. Create order with special items:
   - Product: "Café ☕ Español €5.99"
   - Customer: "José García-Márquez™"

✓ Check: Characters display correctly
✓ Check: Sync handles Unicode
✓ Check: No encoding issues
```

---

## 🎬 Final Scene: Complete Workflow

### Full User Journey Test
```
1. Morning Setup (Online)
   - Login normally
   - Create 2 orders
   - Verify sync working

2. Internet Outage (Offline)
   - Lose connection
   - Continue creating orders
   - Process cash payments

3. Lunch Break (Browser Closed)
   - Close browser
   - Reopen after 1 hour
   - Login with PIN
   - Resume work

4. Afternoon (Still Offline)
   - Create more orders
   - Check storage usage
   - Verify performance

5. End of Day (Back Online)
   - Internet returns
   - Watch full sync
   - Verify all orders
   - Check reports

✓ Final Check: All data intact
✓ Final Check: No lost transactions
✓ Final Check: Audit trail complete
```

---

## 📋 Test Summary Checklist

### Configuration
- [ ] Module installed successfully
- [ ] User PINs configured
- [ ] POS settings saved
- [ ] Permissions correct

### Offline Functionality  
- [ ] Offline mode activates properly
- [ ] All POS functions work offline
- [ ] Session persists through restart
- [ ] PIN login works correctly

### Visual Elements
- [ ] Status indicators clear
- [ ] Animations smooth
- [ ] Colors accessible
- [ ] Touch targets adequate

### Performance
- [ ] Fast offline login (< 2s)
- [ ] Smooth operation with 1000+ items
- [ ] Sync completes reliably
- [ ] No memory leaks

### Data Integrity
- [ ] Orders save correctly
- [ ] Sync preserves all data
- [ ] Conflicts handled properly
- [ ] No duplicate transactions

---

**Test Completed By**: _______________  
**Date**: _______________  
**Version Tested**: 18.0.1.0.0  
**Result**: ☐ PASS ☐ FAIL  

**Notes**:
_________________________________
_________________________________
_________________________________