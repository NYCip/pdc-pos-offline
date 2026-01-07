# Odoo Module Bug Report: Screen Goes White on Server Reconnection During Offline Mode

## Bug Overview
- **Module**: `pdc_pos_offline` (PDC POS Offline)
- **Version**: 19.0.1.0.4
- **Severity**: **CRITICAL** (blocks POS operations after reconnection)
- **Status**: Open
- **Created**: 2026-01-07
- **Reporter**: Ed (ed@pos.com)
- **Environment**: Production (pwh19.iug.net)
- **Wave**: Wave 32 P1 (discovered post-deployment)

## Environment Information
- **Odoo Version**: 19.0
- **Environment**: Production Server
- **Database**: PostgreSQL
- **Operating System**: Linux
- **Server**: pwh19.iug.net (LOCAL)
- **Framework**: OWL 2.0 (Odoo 19)

## Module Context
- **Module Path**: `/var/odoo/pwh19.iug.net/extra-addons/pdc_pos_offline`
- **Module Dependencies**: `point_of_sale`, `web`
- **Custom/Standard**: Custom (PDC)
- **Related Wave 32 P1 Fixes**:
  - IndexedDB race condition fixes
  - Composite index creation (synced_created, state_date, error_timestamp)
  - Batch user sync optimization
  - Memory leak fixes in connection_monitor.js

## Bug Description

### Summary
When the Odoo server is offline and then reconnects, the POS screen goes completely white (blank) instead of gracefully returning to normal operation. The offline mode banner disappears, but the entire UI is unresponsive. Users must manually refresh the browser to resume functionality.

### Business Impact
- **Critical Operation Blocker**: POS cannot process transactions after server reconnection
- **User Experience**: Confusing blank screen with no error message or indication of issue
- **Downtime Required**: Browser refresh required, losing current transaction context
- **Revenue Impact**: Every offline-to-online transition requires user intervention
- **Frequency**: Reproducible 100% of the time with offline transition

### Technical Symptoms

**Step 1 - Offline Detection (Working Correctly)**
```
[PDC-Offline] Server unreachable detected during runtime
[PDC-Offline] Current order is empty, skipping preservation
[PDC-Offline] Attempting offline session restore...
```

**Step 2 - Session Restore Attempt (FAILS - Proxy Trap Error)**
```
[PDC-Offline] Direct assignment failed: 'set' on proxy: trap returned falsish for property 'id'
[PDC-Offline] Object.assign failed: 'set' on proxy: trap returned falsish for property 'id'
[PDC-Offline] Session creation failed: 'set' on proxy: trap returned falsish for property 'session'
[PDC-Offline] Using _offlineSessionData fallback
```

**Step 3 - Model Cache Extraction (FAILS - Returns 0 Records)**
```
[PDC-Offline] No cached POS data found - offline functionality will be limited
[PDC-Offline] Model product.product has no records array
[PDC-Offline] Model pos.category has no records array
[PDC-Offline] Model pos.payment.method has no records array
[PDC-Offline] Model account.tax has no records array
[PDC-Offline] Extracted: 0 products, 0 categories, 0 payment methods, 0 taxes
```

**Step 4 - Component Rendering (CRASHES - TypeError)**
```
OwlError: An error occurred in the owl lifecycle
TypeError: Cannot read properties of undefined (reading 'map')
    at Proxy.getExcludedProductIds (point_of_sale.assets_prod.min.js:11246:121)
    at get productsToDisplay (point_of_sale.assets_prod.min.js:11251:61)
```

**Step 5 - Template Rendering (CRASHES - Invalid Loop Expression)**
```
OwlError: Invalid loop expression: "undefined" is not iterable
    at ActionpadWidget.template (point_of_sale.assets_prod.min.js:20614:87)
```

**Step 6 - OWL Framework Response (Destroys UI)**
```
[OWL] An error occurred in the owl lifecycle, the root widget has been destroyed.
Unhandled error detected (Error in the rendering)
```

## Reproduction Steps

### Prerequisites
- Running Odoo POS instance with `pdc_pos_offline` module installed
- PWH19 server (or similar configuration)
- Some items added to cart (optional, but helps see state preservation)
- Browser console open for log visibility

### Steps to Reproduce
1. **Open POS**: Navigate to POS module and login as cashier
2. **Add Items**: Ring in several items into cart (e.g., 5-10 items)
3. **Simulate Offline**: Stop the Odoo server or disconnect network
   - Browser will show "502 Bad Gateway" or connection timeout errors
   - Orange banner appears: "Offline Mode - Transactions will sync when connection is restored"
4. **Attempt Operations**: Try to ring in additional items
   - This may work or be slow depending on cached state
5. **Simulate Reconnection**: Start the Odoo server again
   - Orange banner disappears
   - **Screen goes completely white (blank)**
6. **Observe Issue**:
   - No error dialog
   - No indication of what happened
   - POS completely unresponsive
7. **Recovery**: Manually refresh browser (F5 or Ctrl+R)
   - POS returns to normal operation
   - Previous cart items are lost

### Expected Behavior
- Server reconnection detected
- Cached session and data restored silently
- UI remains fully functional
- Orange "Offline Mode" banner may remain briefly or fade out gracefully
- Cashier can immediately continue ringing in items
- No browser refresh required
- Session state preserved if possible

### Actual Behavior
- Server reconnection triggers session restore attempt
- Session restore fails due to Proxy trap errors
- Model cache returns 0 records for all product data
- Component tries to render without product list data
- `getExcludedProductIds()` crashes with "Cannot read properties of undefined (reading 'map')"
- `ActionpadWidget` template crashes with "undefined is not iterable"
- OWL framework destroys root widget due to rendering error
- Screen goes completely white
- UI completely unresponsive
- User must refresh browser

## Root Cause Analysis (Initial)

### Chain of Failures

**Failure 1: Session Restore - Proxy Object Update Rejection**
```javascript
// In safeUpdateSession() - point_of_sale.assets_prod.min.js:20614
// Attempting to update Odoo Proxy object with restored session data
this.session.id = offlineSession.id;  // ← FAILS: 'set' trap returns false
```
**Issue**: Odoo Proxy objects have strict update validation. Cannot directly assign properties during offline state transition.

**Failure 2: Model Cache Extraction - Empty Records Array**
```javascript
// In _extractModelRecords() - point_of_sale.assets_prod.min.js:20517
const products = models[0]?.records || [];  // ← Returns undefined or []
// No cached data extracted
```
**Issue**: Model extraction expects `records` property on model data structure. Either:
- Cache not being populated correctly
- Cache format differs from expected structure
- Cache cleared on offline transition
- Background cache didn't run before offline occurred

**Failure 3: Component Rendering - Undefined Array Access**
```javascript
// In getExcludedProductIds() - point_of_sale.assets_prod.min.js:11246
get productsToDisplay() {
    return this.products.map(p => p.id);  // ← CRASHES: this.products is undefined
}
```
**Issue**: Component assumes `products` array exists. No defensive check for undefined or null.

**Failure 4: Template Rendering - Invalid Loop Expression**
```xml
<!-- In ActionpadWidget template -->
<t t-foreach="widget.buttons" t-as="button">
    <!-- ← CRASHES: widget.buttons is undefined, not iterable -->
</t>
```
**Issue**: Template lacks fallback for undefined arrays. Cannot iterate over undefined.

### Why This Happens
1. **Timing Issue**: When server goes offline, there may not be enough time to populate model cache via background sync
2. **Proxy Validation**: Odoo 19's Proxy objects are stricter about property updates during state transitions
3. **Fallback Failure**: Code uses `_offlineSessionData` fallback but this doesn't restore models properly
4. **No Defensive Checks**: Components don't handle missing/undefined data gracefully

## ERP Context Analysis

### Affected Business Processes
- **POS Sales Transaction**: Core process broken on server reconnection
- **Offline/Online Transitions**: Entire feature fails during reconnection
- **Order Preservation**: Current order lost during recovery
- **Inventory Management**: No product data available after reconnection

### Integration Impact
- **point_of_sale (Core Module)**: Component lifecycle crashes
- **OWL Framework**: Root widget destroyed by unhandled rendering error
- **Session Management**: Cannot restore session state via Proxy objects
- **IndexedDB Integration**: Cache not being utilized properly

### Related Recent Changes
- **Wave 32 P1 Deployment** (2026-01-07 14:14 UTC):
  - offline_db.js: Race condition fixes, composite indexes, queue limits
  - connection_monitor.js: Memory leak fixes, timeout tracking
  - sync_manager.js: Batch user sync optimization
  - **Possible Regression**: New indexes or cache structure changes may affect model extraction

## Technical Details

### Error Stack Trace Analysis

**Primary Error Location**
```
point_of_sale.assets_prod.min.js:11246:121
TypeError: Cannot read properties of undefined (reading 'map')
at Proxy.getExcludedProductIds
at get productsToDisplay
```

**Secondary Error Location**
```
point_of_sale.assets_prod.min.js:20614:87
OwlError: Invalid loop expression: "undefined" is not iterable
at ActionpadWidget.template
```

**Session Restore Error Location**
```
point_of_sale.assets_prod.min.js:20614
[PDC-Offline] Session creation failed: 'set' on proxy: trap returned falsish for property 'session'
```

**Model Extraction Error Location**
```
point_of_sale.assets_prod.min.js:20517
[PDC-Offline] Model product.product has no records array
[PDC-Offline] Extracted: 0 products, 0 categories, 0 payment methods, 0 taxes
```

### Affected Source Files (Production)
1. **`/var/odoo/pwh19.iug.net/extra-addons/pdc_pos_offline/static/src/js/offline_db.js`**
   - `_extractModelRecords()` - Returns 0 records for all models
   - `safeUpdateSession()` - Cannot update Proxy objects

2. **`/var/odoo/pwh19.iug.net/extra-addons/pdc_pos_offline/static/src/js/connection_monitor.js`**
   - Session restore trigger on reconnection
   - May need event handling for graceful degradation

3. **Point of Sale POS Core** (Odoo native)
   - `ActionpadWidget` template - Needs default empty arrays
   - `getExcludedProductIds()` - Needs null checks

### Source Files (Development)
1. `/home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js`
2. `/home/epic/dev/pdc-pos-offline/static/src/js/connection_monitor.js`
3. `/home/epic/dev/pdc-pos-offline/static/src/js/sync_manager.js`
4. `/home/epic/dev/pdc-pos-offline/static/src/js/pos_offline_patch.js`

### Affected Models
- `product.product` - 0 products cached
- `pos.category` - 0 categories cached
- `pos.payment.method` - 0 payment methods cached
- `account.tax` - 0 tax entries cached

## User Impact Assessment

### Affected User Roles
- **Cashiers**: Cannot complete transactions after server reconnection
- **Store Managers**: Cannot monitor POS operations
- **System Administrators**: Unclear error state, must debug

### Workaround Available
**Yes** - Manual browser refresh (F5 or Ctrl+R) restores functionality
**Limitation**:
- Loses current transaction context
- Reduces offline-to-online transition smoothness
- Poor user experience

### Business Continuity
- **Can operations continue?** NO - POS unresponsive after reconnection
- **Manual intervention required?** YES - Browser refresh required
- **Alternative processes?** NO - Must refresh to recover
- **Data loss?** YES - Cart items lost on refresh

### Severity Justification
**CRITICAL** because:
1. Blocks core business process (POS transactions)
2. Reproducible 100% of the time
3. No graceful degradation
4. Requires manual recovery (browser refresh)
5. Discovered in Wave 32 P1 (new issue or regression)

## Additional Information

### Hypothesis on Root Cause
The issue likely stems from **Wave 32 P1 deployment changes** interacting with offline mode:

1. **New Composite Indexes**: May have changed data structure format
2. **Batch Sync Changes**: Model extraction may need to handle new format
3. **Queue Limits**: May affect when cache is populated
4. **Proxy Handling**: May need to handle Odoo 19 Proxy validation differently

### Recent Code Changes Involved
- Composite indexes: `synced_created`, `state_date`, `error_timestamp`
- Batch operations for user sync
- Queue size limits and memory management

### Investigation Needed
1. ✅ Why does `_extractModelRecords()` return 0 records?
2. ✅ What is the actual structure of cached model data?
3. ✅ How to properly update Odoo Proxy objects during state transition?
4. ✅ When/where should models be cached for offline use?
5. ✅ Are Wave 32 P1 changes affecting model extraction format?

## Verification Plan

### Pre-Fix Testing
1. Confirm reproducibility with steps above
2. Verify console logs show exact errors
3. Check IndexedDB contents during offline state
4. Verify Wave 32 P1 fixes are deployed

### Post-Fix Testing
1. Offline-to-online transition completes without white screen
2. UI remains responsive after reconnection
3. Product list visible and functional
4. Cart state preserved if possible
5. Orange banner behavior correct
6. No console errors during transition
7. Performance impact minimal

### E2E Testing (Playwright)
1. Complete offline transaction flow without refresh
2. Offline duration 30+ seconds
3. Multiple reconnection cycles
4. Network reconnection timing variations

## Attachments

### Browser Console Logs
**[See full logs in user's bug report message]**

Key error lines:
```
TypeError: Cannot read properties of undefined (reading 'map')
OwlError: Invalid loop expression: "undefined" is not iterable
[PDC-Offline] Model product.product has no records array
[PDC-Offline] Session creation failed: 'set' on proxy: trap returned falsish
```

### Related Issues
- Wave 32 P1 deployment (potentially introduced or exposed this bug)
- Offline mode feature regression
- Session persistence issue
- Model caching architecture

---

## Summary for Analysis Phase

**Key Facts**:
- CRITICAL severity - blocks POS operations
- 100% reproducible offline-to-online transition
- Multi-stage failure cascade: Proxy → Cache → Component → Template
- Workaround: Browser refresh (bad UX)
- Discovered immediately after Wave 32 P1 deployment (potential regression)

**Next Step**: Proceed to `/odoo-bug-analyze` phase to investigate:
1. Model cache structure and population logic
2. Odoo Proxy object update patterns
3. OWL component error handling
4. Wave 32 P1 changes impact on model extraction

---

**Status**: ✅ Bug Report Complete - Ready for Analysis Phase
