# Deep Research Findings: Odoo 19 Native POS Offline Architecture

**Date**: 2026-01-08
**Researcher**: Claude Code (Deep Source Analysis)
**Status**: COMPLETE - Root Cause Identified

---

## Executive Summary

After deep analysis of Odoo 19 native POS source code, I identified why offline re-login fails and what the correct solution should be.

**Key Discovery**: The pdc-pos-offline module was built with incorrect assumptions about how Odoo 19 POS authentication works.

---

## 1. Native Odoo 19 POS Offline Architecture

### 1.1 Network State Management (`data_service.js`)

```javascript
// Location: point_of_sale/static/src/app/services/data_service.js:36-41
this.network = {
    warningTriggered: false,
    offline: false,
    loading: true,
    unsyncData: [],  // Queue for offline orders
};
```

**Native Capabilities**:
- `checkConnectivity()` pings `/pos/ping` endpoint
- `syncData()` syncs `unsyncData[]` array on reconnect
- `pos-network-online` event dispatched when connectivity restored
- Navbar shows `fa-chain-broken` icon when offline (non-blocking)

### 1.2 Login Screen Architecture

**Critical Discovery**: The POS LoginScreen is NOT a server-authenticated login!

```javascript
// Location: point_of_sale/static/src/app/screens/login_screen/login_screen.js
selectOneCashier(cashier) {
    this.pos.setCashier(cashier);  // Just sets local state
    this.cashierLogIn();           // Navigates to ProductScreen
}
```

The "login" is simply selecting a cashier from **already-loaded** users. No server authentication happens at this point.

### 1.3 User/Employee Loading

**Without `module_pos_hr`**:
- Single user mode
- `this.pos.user` is the web-logged-in user
- No PIN required

**With `module_pos_hr` (Most POS configs)**:
- Multi-cashier mode via `hr.employee`
- Employees loaded during `load_data` RPC at POS startup
- PIN stored as SHA-1 hash: `hashlib.sha1(pin.encode('utf8')).hexdigest()`

```python
# Location: pos_hr/models/hr_employee.py
def get_barcodes_and_pin_hashed(self):
    employees_data = self.sudo().search_read([('id', 'in', visible_emp_ids.ids)], ['barcode', 'pin'])
    for e in employees_data:
        e['barcode'] = hashlib.sha1(e['barcode'].encode('utf8')).hexdigest() if e['barcode'] else False
        e['pin'] = hashlib.sha1(e['pin'].encode('utf8')).hexdigest() if e['pin'] else False
    return employees_data
```

### 1.4 Cashier Selection (`select_cashier_mixin.js`)

```javascript
// Location: pos_hr/static/src/app/utils/select_cashier_mixin.js
// PIN validation is SHA-1 hash comparison
if (!inputPin || employee._pin !== Sha1.hash(inputPin)) {
    notification.add(_t("PIN not found"), { type: "warning" });
    return false;
}
```

---

## 2. The Actual Re-Login Problem

### 2.1 The Gap Native Odoo Cannot Handle

**Scenario**: POS is closed or browser refreshed while server is offline.

1. User opens POS while offline
2. `load_data` RPC fails (no network)
3. `this.models['hr.employee']` is EMPTY
4. `_getConnectedCashier()` fails (user lookup returns null)
5. **Result**: Cannot authenticate, POS unusable

### 2.2 Why This Is The ONLY Gap

Native Odoo 19 handles:
- ✅ Orders while offline (queued in `unsyncData[]`)
- ✅ Switching cashiers while offline (employees already loaded)
- ✅ Reconnecting and syncing (automatic via connection monitor)

Native Odoo 19 CANNOT handle:
- ❌ POS reload while offline (no cached employee data)
- ❌ Initial POS load when server unreachable (no data at all)

---

## 3. What PDC-POS-Offline Does Wrong

### 3.1 Wrong Authentication Target

| PDC Module | Native Odoo 19 |
|------------|----------------|
| Caches `res.users` | Should cache `hr.employee` |
| Uses SHA-256 hash | Native uses SHA-1 hash |
| Custom field `pos_offline_auth_hash` | Native uses `_pin` from employee |
| Custom login popup | Native already has working login |

### 3.2 Wrong Integration Point

PDC patches `PosStore` but the real problem is in `PosData.loadInitialData()`:

```javascript
// PDC patches this (wrong approach):
patch(PosStore.prototype, { ... });

// Should patch this (correct approach):
patch(PosData.prototype, {
    async loadInitialData() {
        if (this.network.offline) {
            return await this.loadFromIndexedDBCache();  // Load cached employee data
        }
        return await super.loadInitialData();
    }
});
```

---

## 4. The Correct Minimal Solution

### 4.1 What to Cache

```javascript
// During online operation, cache hr.employee data
const employeeData = await this.orm.call('pos.session', 'load_data_params', [sessionId]);
const employees = employeeData['hr.employee'];  // Includes _pin, _barcode, _role
await offlineDB.saveEmployees(employees);
```

### 4.2 How to Restore

```javascript
// In PosData.loadInitialData() or intializeDataRelation()
if (this.network.offline) {
    const cachedEmployees = await offlineDB.getEmployees();
    this.models['hr.employee'].loadData(cachedEmployees);
    // Native login flow now works because employees exist
}
```

### 4.3 No Custom Login Needed

Once employees are loaded from cache, the native `useCashierSelector` works automatically:
1. Employee list populated from cache
2. PIN validation uses existing `Sha1.hash(pin) === employee._pin`
3. User navigates to ProductScreen normally

---

## 5. Key Source File Locations

| Component | Path |
|-----------|------|
| Data Service | `/src/addons/point_of_sale/static/src/app/services/data_service.js` |
| POS Store | `/src/addons/point_of_sale/static/src/app/services/pos_store.js` |
| Login Screen | `/src/addons/point_of_sale/static/src/app/screens/login_screen/login_screen.js` |
| HR Login Patch | `/src/addons/pos_hr/static/src/app/screens/login_screen/login_screen.js` |
| Cashier Selector | `/src/addons/pos_hr/static/src/app/utils/select_cashier_mixin.js` |
| Employee Model | `/src/addons/pos_hr/models/hr_employee.py` |

---

## 6. Recommendation

### Immediate Actions

1. **Remove blocking UI** (already done in commit f19791e)
2. **Stop using custom SHA-256 auth** - use native SHA-1 flow
3. **Cache `hr.employee` instead of `res.users`**
4. **Patch `PosData.loadInitialData()`** not `PosStore.setup()`

### Minimal Code Change

```javascript
// New file: pos_data_offline_patch.js
patch(PosData.prototype, {
    async loadInitialData() {
        // Try normal load first
        try {
            const data = await super.loadInitialData();
            // Cache employees for offline use
            if (data['hr.employee']) {
                await offlineDB.saveEmployees(data['hr.employee']);
            }
            return data;
        } catch (error) {
            if (this.network.offline) {
                // Restore from cache
                const cachedData = await offlineDB.getAllCachedData();
                return cachedData;
            }
            throw error;
        }
    }
});
```

---

## 7. Memory Keys for Reference

Stored in claude-flow memory for future sessions:

| Namespace | Key | Content |
|-----------|-----|---------|
| `odoo-global` | `odoo19-pos-offline-architecture` | Native architecture details |
| `odoo-global` | `odoo19-pos-login-flow-details` | Login flow code analysis |
| `project:pdc-pos-offline` | `pdc-offline-vs-native-analysis` | Module comparison |
| `project:pdc-pos-offline` | `correct-offline-relogin-solution` | Correct solution approach |

---

**End of Deep Research Report**
