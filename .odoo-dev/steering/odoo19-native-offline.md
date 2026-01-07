# Odoo 19 Native Offline Architecture

## Document Information
- **Odoo Version**: 19.0
- **Source**: Official Odoo 19 Source Code Analysis
- **Created**: 2026-01-07
- **Purpose**: Document native offline capabilities to prevent duplicate implementation

---

## 1. Official Odoo Statement

> "The app works on any device with a web browser, even if you are temporarily offline."
> — Odoo 19 POS Documentation

**Key Insight**: Odoo 19 POS has NATIVE offline support. The pdc-pos-offline module should EXTEND, not REBUILD this functionality.

---

## 2. Native Architecture Components

### 2.1 Network State Management (`data_service.js`)

**File**: `point_of_sale/static/src/app/services/data_service.js`

```javascript
// Native network state object
this.network = {
    warningTriggered: false,   // True after connectivity warning shown
    offline: false,            // TRUE when server unreachable
    loading: true,             // TRUE during data sync
    unsyncData: [],            // Queue of operations pending sync
};
```

**Key Features**:
- `offline` flag reflects actual server connectivity
- `unsyncData[]` queues ALL offline operations for later sync
- `loading` indicates sync in progress

### 2.2 POS Store Order Tracking (`pos_store.js`)

**File**: `point_of_sale/static/src/app/services/pos_store.js`

```javascript
// Pending order Sets - track what needs sync
this.data.pendingOrderWrite = new Set();   // Orders modified offline
this.data.pendingOrderDelete = new Set();  // Orders deleted offline
this.data.pendingOrderCreate = new Set();  // Orders created offline
```

**Auto-Sync Mechanism**:
```javascript
// Event: pos-network-online triggers sync
this.bus.addEventListener("pos-network-online", async () => {
    // syncAllOrdersDebounced() syncs all pending operations
    await this.data.syncAllOrdersDebounced();
});
```

### 2.3 Non-Blocking UI Indicator (`navbar.xml`)

**File**: `point_of_sale/static/src/app/components/navbar/navbar.xml`

```xml
<!-- NON-BLOCKING offline indicator in navbar -->
<div t-if="this.pos.data.network.offline or this.pos.data.network.loading"
     class="oe_status btn btn-light btn-lg lh-lg h-100 pe-none">

    <!-- Show count of unsynced operations -->
    <span t-if="this.pos.data.network.unsyncData.length > 0"
          t-esc="this.pos.data.network.unsyncData.length" />

    <!-- Offline icon (broken chain) -->
    <div t-if="this.pos.data.network.offline"
         class="fa fa-fw fa-chain-broken text-danger"/>

    <!-- Syncing spinner -->
    <div t-if="this.pos.data.network.loading"
         class="fa fa-fw fa-spinner fa-spin"/>
</div>
```

**CRITICAL**: Native Odoo shows a SMALL ICON in navbar, NOT a blocking screen!

---

## 3. Native vs PDC-Offline Comparison

| Aspect | Native Odoo 19 | pdc-pos-offline (Current) |
|--------|----------------|---------------------------|
| **UI Pattern** | Non-blocking icon in navbar | BLOCKING full-screen banner |
| **Network State** | `network.offline` flag | `connectionMonitor.isOffline()` |
| **Operation Queue** | `unsyncData[]` array | Custom sync queue |
| **Auto-Sync** | `syncAllOrdersDebounced()` | Manual sync via `SyncManager` |
| **User Experience** | Sales continue seamlessly | Sales interrupted by banner |

### The Problem

PDC-Offline shows a **BLOCKING** UI that interrupts sales:
```javascript
// PROBLEMATIC: This blocks the user from continuing sales!
showOfflineBanner() {
    // Full-screen "You are offline" message
    // User cannot proceed with sales
}
```

Native Odoo shows a **NON-BLOCKING** indicator:
```xml
<!-- CORRECT: Small icon, user continues uninterrupted -->
<div class="fa fa-fw fa-chain-broken text-danger"/>
```

---

## 4. What PDC-Offline SHOULD Do

### 4.1 DO NOT Rebuild
- ❌ Network detection (native has `network.offline`)
- ❌ Operation queuing (native has `unsyncData[]`)
- ❌ Auto-sync on reconnect (native has `syncAllOrdersDebounced()`)
- ❌ Offline indicator UI (native has navbar icon)

### 4.2 ONLY Build What's Missing
- ✅ **Offline Re-Login**: When user logs out while offline and needs to re-authenticate
- ✅ **Session Persistence**: Cache sessions for offline re-login
- ✅ **User Credential Cache**: Store hashed credentials for offline auth

### 4.3 The SINGLE Gap

**Scenario**:
1. User is logged into POS
2. Server goes offline
3. User logs out (or session expires)
4. User needs to log back in
5. **PROBLEM**: Native Odoo cannot authenticate without server

**Solution**: Offline re-login with cached credentials
- Cache user credentials (hashed) in IndexedDB
- Validate password hash locally when offline
- Restore cached session data

---

## 5. Recommended Architecture

### 5.1 Remove/Refactor
```
REMOVE (duplicates native):
- Blocking offline banner UI
- Custom network detection (use native network.offline)
- Custom operation queuing (use native unsyncData)
- Custom sync mechanism (use native syncAllOrdersDebounced)

KEEP (fills gap):
- offline_auth.js - Password hash validation
- offline_db.js - Credential/session storage
- session_persistence.js - Session caching
- offline_login_popup.js - Re-login UI
```

### 5.2 Integration Pattern
```javascript
// CORRECT: Extend native, don't replace
patch(PosStore.prototype, {
    setup() {
        super.setup();

        // Add offline re-login capability
        this.offlineAuth = createOfflineAuth(this.env);

        // Cache user credentials on successful login
        this.bus.addEventListener("pos-user-logged-in", (user) => {
            this.offlineAuth.cacheUserForOffline(user);
        });
    },

    // Override login to support offline re-auth
    async login(credentials) {
        if (this.data.network.offline) {
            return this.offlineAuth.authenticateOffline(credentials);
        }
        return super.login(credentials);
    }
});
```

---

## 6. Implementation Checklist

### Phase 1: Remove Blocking UI
- [ ] Remove `showOfflineBanner()` function
- [ ] Remove full-screen offline templates
- [ ] Trust native navbar indicator

### Phase 2: Integrate with Native
- [ ] Use `this.pos.data.network.offline` instead of custom detection
- [ ] Use `this.pos.data.network.unsyncData` instead of custom queue
- [ ] Remove duplicate sync logic

### Phase 3: Focus on Re-Login
- [ ] Keep offline_auth.js for credential validation
- [ ] Keep offline_login_popup.js for re-login UI
- [ ] Integrate with native login flow

---

## 7. References

### Source Files (Native Odoo 19)
```
/var/odoo/pwh19.iug.net/src/addons/point_of_sale/static/src/app/services/data_service.js
/var/odoo/pwh19.iug.net/src/addons/point_of_sale/static/src/app/services/pos_store.js
/var/odoo/pwh19.iug.net/src/addons/point_of_sale/static/src/app/components/navbar/navbar.xml
```

### Documentation
- Odoo 19 POS Technical Documentation
- Official Odoo GitHub: odoo/odoo (branch 19.0)
