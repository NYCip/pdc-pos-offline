# Wave 32 P2 - Cache Fix Verification & Testing

## Status: 🔧 CACHE REBUILD IN PROGRESS

**Root Cause Found**: Browser was caching old minified JavaScript
**Status**: Service restarted to force asset recompilation
**Next Step**: Test with fresh browser session

---

## Critical Steps to Verify Fix (DO THESE NOW)

### Step 1: Clear Browser Cache Completely

**Chrome/Chromium:**
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
2. Select "All time" for time range
3. Check: Cookies and other site data, Cached images and files
4. Click "Clear data"
5. Close ALL Chrome tabs/windows
6. Restart Chrome

**Firefox:**
1. Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
2. Click "Clear All"
3. Close ALL Firefox windows
4. Restart Firefox

### Step 2: Open POS with Hard Refresh

1. Open http://rmshosting2.iug.net:8069/pos/ui
2. Do HARD REFRESH:
   - Chrome/Firefox: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
   - Wait 10 seconds for page to fully load

### Step 3: Open Developer Console & Check for New Log Messages

1. Press `F12` to open Developer Tools
2. Go to **Console** tab
3. Look for these messages (NEW = fix is working):

#### ✅ EXPECTED (Fix Working):
```
[PDC-Offline] Extracted: 5021 products, 47 categories, 3 payment methods, 15 taxes
[PDC-Offline] Model product.product found in .records format
[PDC-Offline] Model pos.category found in .records format
[PDC-Offline] POS data cache complete in 2342ms
[PDC-Offline] Handling server reconnection, attempting model restoration...
```

#### ❌ STILL BROKEN (Old Code):
```
[PDC-Offline] Model product.product has no records array
[PDC-Offline] Model pos.category has no records array
[PDC-Offline] Extracted: 0 products, 0 categories
```

---

## If Still Broken After Browser Cache Clear

### Issue: Odoo Assets Not Recompiled

Odoo needs to rebuild assets when source files change. Try this sequence:

```bash
# 1. Stop Odoo service
sudo systemctl stop odona-pwh19.iug.net.service

# 2. Clear Odoo cache directories
sudo su - odoo
cd /var/odoo/pwh19.iug.net
rm -rf .cache/* 2>/dev/null
rm -rf src/.cache/* 2>/dev/null
find . -name "*.pyc" -delete 2>/dev/null
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
exit

# 3. Restart Odoo service
sudo systemctl start odona-pwh19.iug.net.service

# 4. Wait 30 seconds for Odoo to initialize
sleep 30

# 5. Force module reload
sudo su - odoo
cd /var/odoo/pwh19.iug.net
./src/odoo-bin --config odoo.conf --update=pdc_pos_offline -i pdc_pos_offline --stop-after-init
exit
```

---

## Browser Console Verification Script

After page loads, paste this in console to verify fix is active:

```javascript
// Check if new enhanced extraction is running
if (window.posOfflineManager?.sessionPersistence?._extractModelRecords) {
    const func = window.posOfflineManager.sessionPersistence._extractModelRecords.toString();
    if (func.includes('Format 3: model.data')) {
        console.log('✅ FIX CONFIRMED: Enhanced 5-format extraction is active!');
    } else {
        console.log('❌ OLD CODE: Only 1-format extraction found');
    }
} else {
    console.log('⚠️  Manager not found - POS may still be loading');
}
```

---

## Test Offline-to-Online Transition

Once console shows NEW log messages:

1. Ring items while online
2. Disable network (Dev Tools → Network tab → check "Offline")
3. Verify orange "Offline" banner appears
4. Ring more items while offline
5. Re-enable network (uncheck "Offline")
6. **CRITICAL**: Verify screen does NOT go white
7. Verify UI remains responsive
8. Verify all items still in cart

---

## Expected Behavior After Fix

### Console Output (First Load - Online)
```
[PDC-Offline] Ensuring models are available...
[PDC-Offline] Caching all POS data...
[PDC-Offline] Model product.product found in .records format
[PDC-Offline] Extracted 5021 records from product.product
[PDC-Offline] Model pos.category found in .records format
[PDC-Offline] Extracted 47 records from pos.category
[PDC-Offline] Extracted: 5021 products, 47 categories, 3 payment methods, 15 taxes
[PDC-Offline] POS data cache complete in 2500ms
```

### Console Output (After Server Reconnects)
```
[PDC-Offline] Server reachability changed to: true
[PDC-Offline] Handling server reconnection, attempting model restoration...
[PDC-Offline] Ensuring models are available...
[PDC-Offline] Found 5021 products in memory
[PDC-Offline] Models already in memory, skipping restore
[PDC-Offline] Models successfully ensured on reconnection
[PDC-Offline] Server reconnection handling complete
```

### Screen Behavior
- ✅ Screen remains normal (NOT WHITE)
- ✅ UI responsive to clicks
- ✅ Can continue ringing items immediately
- ✅ Cart items preserved across reconnection
- ✅ No TypeError errors in console

---

## If Issue Persists

1. **Browser cache still old?**
   - Try incognito/private window (no cache)
   - Try different browser

2. **Odoo cache not cleared?**
   - Check `/var/odoo/pwh19.iug.net/.cache/` still exists
   - May need manual asset rebuild with admin user

3. **File wasn't actually deployed?**
   - Double-check: `git log --oneline -1` shows c1e6bbb
   - Verify: `grep -n "Format 3: model.data" static/src/js/session_persistence.js`

---

## Next Verification Steps After Testing

1. ✅ Clear browser cache completely
2. ✅ Hard refresh POS page
3. ✅ Check console for NEW log messages
4. ✅ Test offline-to-online transition
5. ✅ Verify NO white screen appears
6. ✅ Confirm fix works = DEPLOYMENT SUCCESS

**Status**: Ready for verification testing
**Date**: 2026-01-07 19:17 UTC
**Service**: Restarted, Odoo online
