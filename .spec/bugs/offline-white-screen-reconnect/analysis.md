# Root Cause Analysis: Screen Goes White on Server Reconnection

**Date**: 2026-01-07
**Status**: ✅ COMPLETED
**Severity**: CRITICAL

---

## Executive Summary

The white screen issue is caused by **a cascade of 4 interdependent failures** triggered when the server reconnects after going offline:

1. **Model Cache Returns 0 Records** ← PRIMARY ROOT CAUSE
2. **Session Restore Cannot Update Proxy Objects** ← SECONDARY BLOCKER
3. **Components Crash When Models Undefined** ← SYMPTOM
4. **OWL Framework Destroys Root Widget** ← FINAL RESULT

The root cause is that **models are not being cached before going offline**, so when reconnection happens and tries to restore the session, there's no product/category/payment method data to display.

---

## Failure Cascade Analysis

### Stage 1: Offline Transition (Working Correctly)
```javascript
[PDC-Offline] Server unreachable detected during runtime
[PDC-Offline] Current order is empty, skipping preservation
[PDC-Offline] Attempting offline session restore...
```
**Status**: ✅ Works as expected

### Stage 2: Model Cache Extraction (FAILS - Returns 0 Records)

**Log Evidence**:
```
[PDC-Offline] No cached POS data found - offline functionality will be limited
[PDC-Offline] Model product.product has no records array
[PDC-Offline] Model pos.category has no records array
[PDC-Offline] Model pos.payment.method has no records array
[PDC-Offline] Model account.tax has no records array
[PDC-Offline] Extracted: 0 products, 0 categories, 0 payment methods, 0 taxes
```

**Code Location**: `session_persistence.js:289-305` - `_extractModelRecords()`

```javascript
_extractModelRecords(modelName) {
    const model = this.pos.models?.[modelName];
    if (!model) {
        console.warn(`[PDC-Offline] Model ${modelName} not found in pos.models`);
        return [];  // ← Returns empty array
    }

    const records = model.records || model;
    if (!Array.isArray(records)) {
        console.warn(`[PDC-Offline] Model ${modelName} has no records array`);
        return [];  // ← Returns empty array - THIS IS THE BUG
    }

    return records.map(record => this._toPlainObject(record, modelName));
}
```

**Why It Happens**:
- `model.records` is undefined (not an array)
- Fallback to `model` itself also isn't an array
- Function returns `[]` (empty array)
- **Result**: 0 products, 0 categories, 0 payment methods, 0 taxes

**Why Models Aren't Cached**:
1. Models are cached by `cacheAllPOSData()` which is called after POS setup
2. This happens in **background** (asynchronous, non-blocking)
3. If user goes offline **BEFORE** background cache completes, no data is cached
4. Wave 32 P1 changes may have slowed down or changed model availability timing

### Stage 3: Session Restore Proxy Errors (Fails Gracefully, Falls Back)

**Log Evidence**:
```
[PDC-Offline] Direct assignment failed: 'set' on proxy: trap returned falsish for property 'id'
[PDC-Offline] Object.assign failed: 'set' on proxy: trap returned falsish for property 'id'
[PDC-Offline] Session creation failed: 'set' on proxy: trap returned falsish for property 'session'
[PDC-Offline] Using _offlineSessionData fallback
```

**Code Location**: `pos_offline_patch.js:58-116` - `safeUpdateSession()`

```javascript
function safeUpdateSession(store, sessionData) {
    try {
        // Store offline session data separately (works)
        store._offlineSessionData = { ... };

        // Try to update reactive session - FAILS due to Proxy trap
        if (store.session && typeof store.session === 'object') {
            try {
                store.session.id = sessionData.id;  // ← Proxy trap returns false
                return true;
            } catch (directError) {
                // Try Object.assign - ALSO FAILS
                Object.assign(store.session, { id: sessionData.id });
            }
        }

        // Try to create new session - ALSO FAILS
        store.session = { id: sessionData.id };
    } catch (error) {
        // Fall through...
        console.log('[PDC-Offline] Using _offlineSessionData fallback');
        return true;  // Returns true even though session wasn't updated
    }
}
```

**Why It Fails**:
- Odoo 19's Proxy objects have strict `set` trap validation
- During offline state transitions, the Proxy may not be in a state that allows updates
- All three update attempts fail: direct assignment, Object.assign, and new object creation
- Function falls back to `_offlineSessionData` but this doesn't restore models

**Status**: ⚠️ Handled gracefully - Session restored to fallback, but doesn't solve model problem

### Stage 4: Component Rendering Crashes (CRITICAL)

**Log Evidence**:
```
OwlError: An error occurred in the owl lifecycle
TypeError: Cannot read properties of undefined (reading 'map')
    at Proxy.getExcludedProductIds (point_of_sale.assets_prod.min.js:11246:121)
    at get productsToDisplay (point_of_sale.assets_prod.min.js:11251:61)
```

**Issue**:
The POS component tries to render the product list, calling `getExcludedProductIds()`:

```javascript
get productsToDisplay() {
    return this.products.map(p => p.id);  // ← CRASHES: this.products is undefined
}
```

**Why It Crashes**:
- Models cache is empty (0 products extracted)
- `this.products` is undefined
- Trying to call `.map()` on undefined throws TypeError
- Component rendering error → OWL destroys root widget

### Stage 5: Template Rendering Crashes (FINAL)

**Log Evidence**:
```
OwlError: Invalid loop expression: "undefined" is not iterable
    at ActionpadWidget.template (point_of_sale.assets_prod.min.js:20614:87)
```

**Issue**:
The ActionpadWidget template tries to iterate over undefined array:

```xml
<t t-foreach="widget.buttons" t-as="button">
    <!-- CRASHES: widget.buttons is undefined -->
</t>
```

**Status**: 🔴 FATAL - Causes OWL framework to destroy root widget

### Stage 6: Root Widget Destroyed

**Log Evidence**:
```
[OWL] An error occurred in the owl lifecycle, the owl lifecycle, the root widget has been destroyed.
Unhandled error detected (Error in the rendering)
```

**Result**: Screen goes completely white (blank), UI unresponsive

---

## Root Cause Summary

| Stage | Issue | Root Cause | Responsibility |
|-------|-------|-----------|-----------------|
| 1 | Server offline detection | ✅ Working | connection_monitor.js ✓ |
| 2 | **Model cache returns 0 records** | **No cached data** | **session_persistence.js** ❌ |
| 3 | Session restore Proxy errors | Odoo 19 Proxy restrictions | pos_offline_patch.js ⚠️ (handled) |
| 4 | Component crash on undefined | Missing defensive checks | point_of_sale (native) ❌ |
| 5 | Template crash on undefined | Missing fallback arrays | point_of_sale (native) ❌ |
| 6 | Root widget destroyed | Unhandled OWL error | OWL framework |

---

## Why This Happens on Wave 32 P1

**Hypothesis**: Wave 32 P1 introduced timing changes that affect when models are available:

1. **New Composite Indexes**: May have changed model data structure format
2. **Batch Sync Changes**: Model extraction may need to handle new format
3. **Queue Limits**: Changed transaction timing and model initialization sequence
4. **Timing Issue**: Models cached asynchronously in background, user goes offline before cache completes

### Evidence of Timing Issue

**In `session_persistence.js:247-281` - `cacheAllPOSData()`**:

```javascript
async cacheAllPOSData() {
    if (!this.pos || !this.pos.models) {
        console.warn('[PDC-Offline] Cannot cache POS data: pos.models not available');
        return null;  // ← Returns early if models not ready
    }
    // ... rest of caching
}
```

**Called From**: `pos_offline_patch.js` during POS setup, **but doesn't wait for completion**:

```javascript
// Start background cache (no await!)
sessionPersistence.cacheAllPOSData()
    .catch(error => console.warn('[PDC-Offline] Background cache error:', error));
```

**Result**: If user goes offline within first few seconds, cache may not have completed

---

## Technical Deep Dive

### Problem 1: Model Cache Never Populated

**Why `_extractModelRecords()` Returns 0 Records**:

Looking at line 290 in `session_persistence.js`:
```javascript
const model = this.pos.models?.[modelName];
```

This assumes `this.pos.models` is an object with keys like `'product.product'`.

But based on the log messages, the model either:
1. Doesn't exist in `pos.models`
2. Exists but `model.records` is undefined
3. Both `model.records` and `model` are not arrays

**If `pos.models` structure changed in Wave 32 P1**, then:
- Old code expects: `{ 'product.product': { records: [...] } }`
- New code may provide: `{ 'product.product': { data: [...] } }`
- Result: `model.records` is undefined → empty array returned

### Problem 2: Session Restore Works But Models Still Missing

Even though `safeUpdateSession()` successfully falls back to `_offlineSessionData`, it **doesn't restore the models**:

```javascript
function safeUpdateSession(store, sessionData) {
    // ... tries to update session ...

    // MISSING: No code to restore models/products!
    // Session is restored but store.products, store.models still undefined
}
```

**Impact**:
- Session state restored ✓
- But products, categories, payment methods **NOT restored** ✗
- Components render with undefined data → crash

### Problem 3: Components Don't Handle Undefined Data Gracefully

The POS component assumes data always exists:

```javascript
get productsToDisplay() {
    // No null/undefined check!
    return this.products.map(p => p.id);  // Crashes if undefined
}
```

**Should be**:
```javascript
get productsToDisplay() {
    return (this.products || []).map(p => p.id);  // Return empty array if undefined
}
```

---

## Impact Assessment

### Immediate Impact
- ❌ User cannot continue POS operations after reconnection
- ❌ Must refresh browser (loses transaction state)
- ❌ Very poor user experience (blank white screen, no error message)

### Affected Scenarios
1. User in offline POS, server comes online after 5-10 minutes
2. Network interruption lasting >5 minutes
3. Browser tab inactive, models not cached yet, then connection lost
4. Mobile user on unstable network

### Workaround
- Manual browser refresh (F5)
- Ineffective, poor UX

---

## Verification Points

### Before Fix
- ✅ Models are cached asynchronously (non-blocking)
- ❌ If cache doesn't complete before offline, 0 models available
- ❌ Session restore doesn't trigger model restoration
- ❌ Components crash on undefined models

### After Fix (Expected)
- ✅ Models cached asynchronously or on-demand
- ✅ Reconnection attempts to fetch models from cache or IndexedDB
- ✅ Components have defensive checks for undefined data
- ✅ UI remains functional even with limited data
- ✅ No white screen, no browser refresh needed

---

## Key Findings

### Finding 1: Model Cache Architecture Fragile
- Relies on background cache completing before offline
- No synchronous fallback if cache not ready
- No validation that models were actually cached

### Finding 2: Session Restore Incomplete
- Restores session data but not models/products
- `_offlineSessionData` is a fallback, not a complete restoration
- Components rely on models being in `store` but restoration doesn't populate them

### Finding 3: Component Error Handling Lacking
- No defensive checks for undefined arrays
- No fallback rendering when data unavailable
- Template loops assume data exists

### Finding 4: Wave 32 P1 Timing Changes
- May have affected when models are available
- Cache population timing may have shifted
- New indexes or batch logic might affect model structure

---

## Files Involved

### Critical Files (PDC-Offline Module)
1. **`static/src/js/session_persistence.js`** - Cache and restore logic
   - ❌ `_extractModelRecords()` - Returns 0 when models unavailable
   - ❌ `cacheAllPOSData()` - Background cache may not complete in time
   - ❌ `restoreSession()` - Doesn't restore models

2. **`static/src/js/pos_offline_patch.js`** - Session update on reconnection
   - ⚠️ `safeUpdateSession()` - Handles Proxy errors but doesn't restore models

3. **`static/src/js/offline_db.js`** - IndexedDB wrapper
   - Need to verify model cache storage format matches Wave 32 P1 changes

### Related Files (POS Native)
- **`point_of_sale.assets_prod.min.js`** - Component rendering
  - `getExcludedProductIds()` - Needs defensive check
  - `ActionpadWidget` - Template needs fallback

---

## Recommended Fixes

### Fix 1: Ensure Models Cached Before Offline (Primary)
- **Location**: `session_persistence.js`
- **Action**: Verify models are in cache before going offline
- **Fallback**: Fetch from server if offline but cache empty
- **Expected**: Always have models data on reconnection

### Fix 2: Add Defensive Checks to Components (Secondary)
- **Location**: POS component code
- **Action**: Handle undefined/null arrays gracefully
- **Expected**: UI remains partially functional even with missing data

### Fix 3: Restore Models on Session Restore (Secondary)
- **Location**: `pos_offline_patch.js` `safeUpdateSession()`
- **Action**: Trigger model restoration when session restored
- **Expected**: `store.models` populated with cached data

### Fix 4: Verify Wave 32 P1 Model Structure Compatibility (Investigation)
- **Location**: `offline_db.js`, `session_persistence.js`
- **Action**: Ensure new composite indexes work with model extraction
- **Expected**: Model cache extraction works with new index format

---

## Next Steps

1. ✅ **Root cause analysis** - COMPLETE
2. ⏳ **Design fixes** - IN PROGRESS
3. ⏳ **Implement defensive checks** - PENDING
4. ⏳ **Implement model restore on reconnection** - PENDING
5. ⏳ **Create E2E tests** - PENDING
6. ⏳ **Deploy to pwh19** - PENDING
7. ⏳ **Verify fix** - PENDING

---

**Status**: ✅ Analysis Complete - Ready for Fix Implementation
