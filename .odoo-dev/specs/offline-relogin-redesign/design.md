# Offline Re-Login Module Redesign - Design

## Document Information
- **Spec ID**: offline-relogin-redesign
- **Created**: 2026-01-07
- **Status**: APPROVED
- **Source**: HiveMind 3-Agent Deliberation + Ultrathink Analysis

---

## 1. Architecture Overview

### Principle: EXTEND, Don't Replace

```
┌──────────────────────────────────────────────────────────────────┐
│                     NATIVE ODOO 19 (USE AS-IS)                   │
├──────────────────────────────────────────────────────────────────┤
│  data_service.js          │  pos_store.js       │  navbar.xml   │
│  - network.offline        │  - pendingOrder*    │  - fa-chain-  │
│  - unsyncData[]           │  - syncAllOrders()  │    broken     │
│  - warningTriggered       │                     │  - Non-block  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ extends via patch
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│              PDC-POS-OFFLINE v2 (MINIMAL)                        │
├──────────────────────────────────────────────────────────────────┤
│  pos_offline_login_patch.js                                      │
│  - Patches login() to catch network errors                       │
│  - Falls back to offline authentication                          │
│  - Restores cached session                                       │
├──────────────────────────────────────────────────────────────────┤
│  offline_auth.js           │  offline_db.js                      │
│  - hashPassword()          │  - users store                      │
│  - validatePassword()      │  - sessions store                   │
│  - authenticateOffline()   │  - getUser(), saveUser()            │
├──────────────────────────────────────────────────────────────────┤
│  offline_login_popup.js    │  session_persistence.js             │
│  - OWL Dialog component    │  - Dual-layer caching               │
│  - Password input          │  - Session restoration              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Design

### 2.1 Login Patch (`pos_offline_login_patch.js`)

**Purpose**: Extend native login flow to support offline fallback

```javascript
/** @odoo-module */
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";
import { createOfflineAuth } from "./offline_auth";
import { offlineDB } from "./offline_db";

patch(PosStore.prototype, {
    setup() {
        super.setup();
        this.offlineAuth = createOfflineAuth(this.env);
        this._offlineSession = false;

        // Listen for network reconnect
        this.data.bus.addEventListener("pos-network-online", async () => {
            if (this._offlineSession) {
                await this._validateOfflineSession();
            }
        });
    },

    /**
     * Extended login with offline fallback
     */
    async login(credentials) {
        try {
            const result = await super.login(credentials);
            // Cache credentials on successful online login
            if (result && result.uid) {
                await this._cacheUserCredentials(result);
            }
            return result;
        } catch (error) {
            // If network error AND we're offline, try offline login
            if (this._isNetworkError(error) && this.data.network.offline) {
                return this._offlineLogin(credentials);
            }
            throw error;
        }
    },

    /**
     * Offline login using cached credentials
     */
    async _offlineLogin(credentials) {
        const result = await this.offlineAuth.authenticateOffline(
            credentials.login,
            credentials.password
        );

        if (result.success) {
            this._restoreOfflineSession(result.session);
            this._offlineSession = true;
            return { uid: result.session.user_id, ...result.session.user_data };
        }

        throw new Error(result.error || "Offline login failed");
    },

    /**
     * Restore session from cache
     */
    _restoreOfflineSession(sessionData) {
        // Set user context from cached data
        this.user = sessionData.user_data;
        // Trigger UI updates
        this.bus.trigger("pos-user-logged-in", this.user);
    },

    /**
     * Validate offline session when server returns
     */
    async _validateOfflineSession() {
        try {
            // Attempt to validate session with server
            const response = await this.env.services.rpc("/web/session/get_session_info");
            if (response.uid !== this.user.id) {
                // Session invalid, force re-login
                await this.logout();
            }
            this._offlineSession = false;
        } catch (error) {
            // Server still unreachable, keep offline session
            console.log("[PDC-Offline] Server still unreachable, keeping offline session");
        }
    },

    /**
     * Cache user credentials for offline use
     */
    async _cacheUserCredentials(loginResult) {
        // Server should provide offline hash in login response
        // This requires server-side controller modification
        if (loginResult.offline_auth_hash) {
            await offlineDB.saveUser({
                id: loginResult.uid,
                login: loginResult.username,
                name: loginResult.name,
                pos_offline_auth_hash: loginResult.offline_auth_hash,
            });
        }
    },

    /**
     * Check if error is network-related
     */
    _isNetworkError(error) {
        return error.name === "TypeError" ||
               error.message?.includes("Failed to fetch") ||
               error.message?.includes("NetworkError");
    }
});
```

### 2.2 Offline Auth (`offline_auth.js`)

**Status**: KEEP AS-IS (already well-designed)

Key methods:
- `hashPassword(password, userId)` - SHA-256 with user ID salt
- `validatePassword(userId, password)` - Check against cached hash
- `authenticateOffline(login, password)` - Full offline auth flow

### 2.3 Offline DB (`offline_db.js`)

**Status**: KEEP, but simplify stores

Required stores:
- `users` - User credentials and profile
- `sessions` - Active session data

Optional stores (review if needed):
- `products` - May conflict with native caching
- `orders` - Native handles via unsyncData[]

### 2.4 Offline Login Popup (`offline_login_popup.js`)

**Status**: KEEP AS-IS (already OWL 2.x compliant)

---

## 3. Data Flow

### 3.1 Credential Caching Flow

```
Online Login → Server Validates → Server Returns offline_auth_hash
                                          │
                                          ▼
                                   pos_offline_login_patch.js
                                   _cacheUserCredentials()
                                          │
                                          ▼
                                   offline_db.js saveUser()
                                          │
                                          ▼
                                   IndexedDB 'users' store
```

### 3.2 Offline Login Flow

```
User attempts login → Native login() fails (network error)
                              │
                              ▼
                       network.offline === true?
                              │
                    ┌─────────┴─────────┐
                    │ YES               │ NO
                    ▼                   ▼
           _offlineLogin()         Throw error
                    │
                    ▼
           offlineAuth.authenticateOffline()
                    │
                    ▼
           Validate password hash
                    │
          ┌─────────┴─────────┐
          │ MATCH             │ NO MATCH
          ▼                   ▼
   _restoreOfflineSession()  Error: Invalid password
          │
          ▼
   User logged in (offline mode)
```

### 3.3 Reconnect Validation Flow

```
pos-network-online event fired
              │
              ▼
       _offlineSession === true?
              │
    ┌─────────┴─────────┐
    │ YES               │ NO
    ▼                   ▼
_validateOfflineSession()  (no action)
              │
              ▼
   RPC /web/session/get_session_info
              │
    ┌─────────┴─────────┐
    │ uid matches       │ uid mismatch
    ▼                   ▼
Clear _offlineSession    logout()
(continue working)    (force re-login)
```

---

## 4. Files to Modify

### KEEP (essential for offline re-login)
| File | Purpose | Changes |
|------|---------|---------|
| `offline_auth.js` | Password hashing, validation | None |
| `offline_db.js` | IndexedDB storage | Review stores |
| `session_persistence.js` | Session caching | None |
| `offline_login_popup.js` | Re-login UI | None |

### CREATE (new integration layer)
| File | Purpose |
|------|---------|
| `pos_offline_login_patch.js` | Patch native login for offline fallback |

### REMOVE/EMPTY (duplicate native functionality)
| File | Reason |
|------|--------|
| `offline_indicator.xml` | Use native navbar indicator |
| `pos_offline_patch.js` | Remove blocking banner code |

### REFACTOR (remove blocking behavior)
| File | Changes |
|------|---------|
| `connection_monitor.js` | Remove UI triggers, keep checkNow() utility |

---

## 5. Server-Side Changes

### Required: Offline Auth Hash in Login Response

The server must return the user's offline auth hash on successful login.

**File**: `controllers/main.py`

```python
@http.route('/web/session/authenticate', type='json', auth="none")
def authenticate(self, db, login, password, base_location=None):
    result = super().authenticate(db, login, password, base_location)

    if result.get('uid'):
        # Add offline auth hash for credential caching
        user = request.env['res.users'].sudo().browse(result['uid'])
        result['offline_auth_hash'] = user.pos_offline_auth_hash

    return result
```

---

## 6. Security Considerations

### Credential Storage
- Passwords hashed with SHA-256 + user ID salt
- Hash computed on server, never sent in plaintext
- Stored in IndexedDB (browser sandboxed storage)

### Session Validation
- Offline sessions flagged with `_offlineSession = true`
- Validated with server on reconnect
- Invalid sessions forcibly logged out

### Brute Force Protection
- No lockout while offline (user might forget password under stress)
- Server validates on reconnect (catches any abuse)
