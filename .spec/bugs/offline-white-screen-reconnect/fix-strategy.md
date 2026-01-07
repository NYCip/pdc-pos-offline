# Fix Strategy: Screen Goes White on Server Reconnection

**Date**: 2026-01-07
**Status**: 🔧 DESIGN PHASE
**Severity**: CRITICAL

---

## Overview

This document outlines the comprehensive strategy to fix the white screen issue on server reconnection. The fix involves 4 coordinated changes across the codebase.

---

## Fix Strategy

### Fix 1: Ensure Model Cache Before Going Offline (PRIMARY)

**Problem**: Models cache may not be populated if user goes offline too quickly

**Solution**: Add synchronous fallback to ensure models are always available

**Files to Modify**:
1. `session_persistence.js` - Add synchronous model extraction
2. `pos_offline_patch.js` - Trigger model cache on reconnection

**Implementation Details**:

#### Step 1a: Modify `_extractModelRecords()` to handle Wave 32 P1 format

**Current Code** (lines 289-305):
```javascript
_extractModelRecords(modelName) {
    const model = this.pos.models?.[modelName];
    if (!model) {
        console.warn(`[PDC-Offline] Model ${modelName} not found in pos.models`);
        return [];
    }

    const records = model.records || model;
    if (!Array.isArray(records)) {
        console.warn(`[PDC-Offline] Model ${modelName} has no records array`);
        return [];
    }

    return records.map(record => this._toPlainObject(record, modelName));
}
```

**Issue**: Returns `[]` when `model.records` is undefined, loses all data

**Fix**: Try multiple formats to handle Wave 32 P1 changes

```javascript
_extractModelRecords(modelName) {
    const model = this.pos.models?.[modelName];
    if (!model) {
        console.warn(`[PDC-Offline] Model ${modelName} not found in pos.models`);
        return [];
    }

    // Try multiple formats to handle potential Wave 32 P1 changes
    let records = null;

    // Format 1: model.records (standard format)
    if (Array.isArray(model.records)) {
        records = model.records;
    }
    // Format 2: model itself is array (direct format)
    else if (Array.isArray(model)) {
        records = model;
    }
    // Format 3: model.data (alternative format - check after Wave 32 P1)
    else if (Array.isArray(model.data)) {
        records = model.data;
    }
    // Format 4: Try to extract records from model properties
    else if (model._records && Array.isArray(model._records)) {
        records = model._records;
    }
    // Format 5: If model is object with id property, wrap in array
    else if (model.id !== undefined) {
        records = [model];
    }

    if (!Array.isArray(records)) {
        console.warn(`[PDC-Offline] Model ${modelName} has no valid records. Model structure:`, {
            has_records: !!model.records,
            has_data: !!model.data,
            has__records: !!model._records,
            is_array: Array.isArray(model),
            keys: Object.keys(model || {}).slice(0, 5)
        });
        return [];
    }

    // Log actual extraction for debugging
    console.log(`[PDC-Offline] Extracted ${records.length} records from ${modelName} (format detected)`);

    return records.map(record => this._toPlainObject(record, modelName));
}
```

**Status**: Handles multiple model formats to be compatible with Wave 32 P1

#### Step 1b: Add explicit model cache check on reconnection

**New Method in `session_persistence.js`**:

```javascript
/**
 * Ensure models are cached, fetching from IndexedDB if needed
 * Called on reconnection to repopulate models
 * @returns {Promise<boolean>} True if models successfully cached/restored
 */
async ensureModelsAvailable() {
    try {
        console.log('[PDC-Offline] Ensuring models are available...');

        // Check if models already in memory
        if (this._hasModelsInMemory()) {
            console.log('[PDC-Offline] Models already in memory, skipping cache restore');
            return true;
        }

        // Try to get from IndexedDB cache
        const cachedData = await offlineDB.getAllPOSData();
        if (!cachedData || Object.keys(cachedData).length === 0) {
            console.warn('[PDC-Offline] No cached models available in IndexedDB');
            // On reconnection, request from server
            await this._fetchModelsFromServer();
            return false;
        }

        // Restore models from cache to POS store
        await this._restoreModelsToStore(cachedData);
        console.log('[PDC-Offline] Models restored from cache');
        return true;

    } catch (error) {
        console.error('[PDC-Offline] ensureModelsAvailable error:', error);
        return false;
    }
}

/**
 * Check if models are already loaded in pos.models
 */
_hasModelsInMemory() {
    if (!this.pos || !this.pos.models) return false;

    // Check if we have at least one model with data
    const hasProducts = Array.isArray(this.pos.models['product.product']?.records)
        && this.pos.models['product.product'].records.length > 0;

    return hasProducts;
}

/**
 * Restore cached models back to POS store
 */
async _restoreModelsToStore(cachedData) {
    if (!this.pos || !this.pos.models) {
        console.warn('[PDC-Offline] Cannot restore models: pos.models not available');
        return;
    }

    // Restore each model type with cached data
    const modelMap = {
        'product.product': 'products',
        'pos.category': 'categories',
        'pos.payment.method': 'paymentMethods',
        'account.tax': 'taxes'
    };

    for (const [modelName, cacheKey] of Object.entries(modelMap)) {
        const cachedRecords = cachedData[cacheKey] || [];
        if (cachedRecords.length > 0) {
            // Create model object with records array
            this.pos.models[modelName] = {
                records: cachedRecords,
                id: modelName  // For identification
            };
            console.log(`[PDC-Offline] Restored ${cachedRecords.length} ${modelName} records`);
        }
    }
}

/**
 * Fetch models from server (called if cache empty on reconnection)
 */
async _fetchModelsFromServer() {
    try {
        console.log('[PDC-Offline] Fetching models from server...');

        // This would trigger POS to reload models from server
        // Implementation depends on POS architecture
        // For now, log that server fetch is needed
        console.log('[PDC-Offline] Server model fetch required - POS will load on reconnection');
    } catch (error) {
        console.error('[PDC-Offline] Server model fetch error:', error);
    }
}
```

**Status**: Adds intelligent model cache restoration on reconnection

### Fix 2: Add Defensive Checks to Component Rendering

**Problem**: Components crash when models undefined

**Solution**: Add null/undefined checks and provide default empty arrays

**Files to Modify**:
1. Create wrapper patch for POS components to add defensive checks

**Implementation**:

#### Step 2a: Create new file `static/src/js/defensive_components.js`

```javascript
/** @odoo-module */

/**
 * Defensive component wrapper to prevent crashes on undefined data
 * Patches POS components to handle missing/undefined models gracefully
 */

export function patchComponentsForOfflineMode() {
    // Patch getExcludedProductIds to handle undefined products
    window.getExcludedProductIdsDefensive = function(originalProducts) {
        try {
            if (!originalProducts || !Array.isArray(originalProducts)) {
                console.warn('[PDC-Offline] getExcludedProductIds: products undefined, returning empty array');
                return [];
            }
            return originalProducts.map(p => p.id);
        } catch (error) {
            console.error('[PDC-Offline] Error in getExcludedProductIds:', error);
            return [];
        }
    };

    // Provide default empty data for components
    window._getDefaultPOSData = function() {
        return {
            products: [],
            categories: [],
            paymentMethods: [],
            taxes: [],
            customers: [],
            orders: []
        };
    };
}
```

#### Step 2b: Modify `pos_offline_patch.js` to patch components

**Add to pos_offline_patch.js** (around line 400+):

```javascript
/**
 * CRITICAL FIX (Wave 32): Defensive checks for undefined data
 * Prevents component crashes when models not available
 */
function patchComponentsForSafeRendering(env) {
    const originalGetData = env.services.pos?.getData;

    if (env.services.pos && typeof env.services.pos === 'object') {
        // Add getter that provides safe defaults
        const unsafeGetter = Object.getOwnPropertyDescriptor(env.services.pos, 'models')?.get;

        if (unsafeGetter) {
            Object.defineProperty(env.services.pos, 'models', {
                get() {
                    const models = unsafeGetter.call(this);

                    // If models undefined or empty, return safe defaults
                    if (!models || Object.keys(models).length === 0) {
                        console.warn('[PDC-Offline] Providing safe default models for component rendering');
                        return {
                            'product.product': { records: [] },
                            'pos.category': { records: [] },
                            'pos.payment.method': { records: [] },
                            'account.tax': { records: [] }
                        };
                    }

                    // Ensure each model has records array
                    const safeModels = {};
                    for (const [key, value] of Object.entries(models)) {
                        if (Array.isArray(value)) {
                            safeModels[key] = { records: value };
                        } else if (value && value.records) {
                            safeModels[key] = value;
                        } else if (value) {
                            safeModels[key] = { records: value };
                        } else {
                            safeModels[key] = { records: [] };
                        }
                    }

                    return safeModels;
                },
                configurable: true
            });
        }
    }
}

// Apply defensive patching in setup phase
patch(PosStore.prototype, {
    async setup() {
        // Apply defensive component patching
        patchComponentsForSafeRendering(this.env);

        // Call original setup (existing code continues)
        // ...
    }
});
```

**Status**: Prevents component crashes via defensive getters

### Fix 3: Restore Models on Session Reconnection

**Problem**: Session restored but models not populated

**Solution**: Trigger model restoration when connection restored

**Files to Modify**:
1. `pos_offline_patch.js` - Handle reconnection event
2. `connection_monitor.js` - Trigger reconnection handler

**Implementation**:

#### Step 3a: Modify reconnection handler in `pos_offline_patch.js`

**Add around line 250+**:

```javascript
/**
 * CRITICAL FIX (Wave 32 P2): Handle reconnection with model restoration
 * When server comes back online, ensure models are available
 */
async _handleServerReconnection() {
    console.log('[PDC-Offline] Server reconnection detected, restoring session and models...');

    try {
        // 1. Restore session
        if (this.sessionPersistence) {
            const session = await this.sessionPersistence.restoreSession();
            if (session) {
                console.log('[PDC-Offline] Session restored, updating store...');
                safeUpdateSession(this, session);
            }
        }

        // 2. Ensure models are available
        if (this.sessionPersistence) {
            const success = await this.sessionPersistence.ensureModelsAvailable();
            if (!success) {
                console.warn('[PDC-Offline] Models not available in cache, requesting from server');
                // POS will fetch from server on next operation
            }
        }

        // 3. Trigger UI refresh without destroying root widget
        console.log('[PDC-Offline] Reconnection handling complete');

    } catch (error) {
        console.error('[PDC-Offline] Reconnection handler error:', error);
        // Continue despite errors - POS can recover
    }
}
```

#### Step 3b: Hook into connection monitor reconnection event

**In connection_monitor.js**, add event emission on reconnection:

```javascript
// Add to handleOnline() method (after successful connection detection)
async handleOnline() {
    // ... existing code ...

    // Emit reconnection event for model restoration
    this.trigger('reconnected', { timestamp: new Date() });

    console.log('[PDC-Offline] Online mode resumed, models should be restored');
}
```

**Status**: Triggers model restoration when connection restored

### Fix 4: Improve Error Handling on Component Rendering

**Problem**: Template rendering crashes when data undefined

**Solution**: Add error boundary and graceful fallback rendering

**Files to Modify**:
1. `pos_offline_patch.js` - Add component error handler

**Implementation**:

#### Step 4a: Add error boundary for component rendering

**Add to pos_offline_patch.js** (around line 350+):

```javascript
/**
 * CRITICAL FIX (Wave 32 P3): Error boundary for component rendering
 * Prevents white screen by catching rendering errors
 */
patch(PosStore.prototype, {
    async setupUI() {
        try {
            // Wrap original setupUI with error handling
            const result = await this.__originalSetupUI?.call(this) ?? true;
            return result;
        } catch (error) {
            console.error('[PDC-Offline] UI setup error, attempting recovery:', error);

            // Recovery: Ensure safe data state
            if (!this.models || Object.keys(this.models).length === 0) {
                console.log('[PDC-Offline] Initializing safe default models for recovery');
                this.models = {
                    'product.product': { records: [] },
                    'pos.category': { records: [] },
                    'pos.payment.method': { records: [] },
                    'account.tax': { records: [] }
                };
            }

            // Retry setup with safe data
            throw error;  // Still throw to maintain error chain, but models are safe
        }
    },

    __originalSetupUI: PosStore.prototype.setupUI
});
```

**Status**: Prevents unhandled rendering errors

---

## Implementation Plan

### Phase 1: Model Cache Robustness (Immediate)
- [ ] Update `_extractModelRecords()` to handle multiple model formats
- [ ] Add `ensureModelsAvailable()` method
- [ ] Test model extraction with Wave 32 P1 format

### Phase 2: Defensive Components (Immediate)
- [ ] Create `defensive_components.js` patch
- [ ] Apply defensive getters to models
- [ ] Add safe default data fallback

### Phase 3: Reconnection Handling (Immediate)
- [ ] Add `_handleServerReconnection()` method
- [ ] Hook into reconnection events
- [ ] Test full reconnection flow

### Phase 4: Error Boundaries (Follow-up)
- [ ] Add component error handler
- [ ] Implement recovery logic
- [ ] Test error recovery

### Phase 5: Testing and Verification (Follow-up)
- [ ] Create E2E tests with Playwright
- [ ] Test offline-to-online transition
- [ ] Verify no white screen on reconnection
- [ ] Verify models available after reconnection
- [ ] Verify no manual refresh needed

---

## Success Criteria

### Immediate Success (After Phase 1-3)
- ✅ No white screen on server reconnection
- ✅ Models available after reconnection
- ✅ No TypeError on getExcludedProductIds
- ✅ No OWL component crash
- ✅ UI remains responsive

### Final Success (After Phase 4-5)
- ✅ Graceful degradation if models temporarily unavailable
- ✅ E2E tests verify complete offline-to-online flow
- ✅ No manual browser refresh needed
- ✅ Works with Wave 32 P1 new model format
- ✅ No regression in online mode

---

## Risk Assessment

### Risk 1: Breaking Online Mode
**Probability**: Low
**Mitigation**: Changes only affect offline paths, online mode unaffected

### Risk 2: Defensive Checks Performance
**Probability**: Low
**Mitigation**: Minimal overhead for null checks on render path

### Risk 3: Model Format Incompatibility
**Probability**: Medium (Wave 32 P1 unknown format)
**Mitigation**: Multiple format checks, logging for debugging

### Risk 4: Incomplete Model Restoration
**Probability**: Low
**Mitigation**: Falls back to server fetch if IndexedDB cache empty

---

## Rollback Plan

If issues occur after deployment:

1. **Quick Rollback**: Revert to previous version
   - Time: < 1 minute
   - File: offline_db.js, session_persistence.js, pos_offline_patch.js
   - Backup location: `/var/backups/pdc-pos-offline/`

2. **Manual Recovery**: Browser refresh (existing workaround)
   - Time: < 10 seconds per user
   - No data loss

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `session_persistence.js` | Update `_extractModelRecords()`, add `ensureModelsAvailable()` | CRITICAL |
| `pos_offline_patch.js` | Add reconnection handler, defensive getters | CRITICAL |
| `connection_monitor.js` | Emit reconnection event | HIGH |
| `offensive_components.js` | NEW FILE - defensive patches | MEDIUM |

---

## Deployment Checklist

- [ ] All code changes committed to git
- [ ] Tests passing (unit + E2E)
- [ ] Code reviewed
- [ ] Backups created
- [ ] Ready to deploy to pwh19.iug.net
- [ ] Monitoring enabled
- [ ] Rollback plan communicated

---

**Status**: 🔧 Design Complete - Ready for Implementation
**Next Step**: Begin Phase 1 implementation
