# PDC POS Offline - System Documentation

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Component Reference](#component-reference)
3. [API Endpoints](#api-endpoints)
4. [IndexedDB Schema](#indexeddb-schema)
5. [Security Model](#security-model)
6. [ML Features](#ml-features)
7. [Deployment Guide](#deployment-guide)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     POS STORE (patched)                          │
│                    pos_offline_patch.js                          │
└─────────────────┬───────────────────────────────────┬───────────┘
                  │                                   │
    ┌─────────────▼─────────────┐     ┌──────────────▼──────────────┐
    │    SessionPersistence     │     │       SyncManager           │
    │  session_persistence.js   │     │     sync_manager.js         │
    └─────────────┬─────────────┘     └──────────────┬──────────────┘
                  │                                   │
    ┌─────────────▼─────────────────────────────────▼───────────────┐
    │                        OfflineDB                               │
    │                     offline_db.js (IndexedDB v3)               │
    │    [sessions] [users] [config] [transactions] [orders]         │
    │    [sync_errors] [analytics]                                   │
    └───────────────────────────────────────────────────────────────┘
                                  │
    ┌─────────────────────────────▼─────────────────────────────────┐
    │                    ConnectionMonitor                           │
    │                 connection_monitor.js                          │
    │         (monitors network + server reachability)               │
    │         (adaptive timeouts for 2G/3G/4G networks)              │
    └───────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Online Login**: User logs in → Password hash cached → User data stored in IndexedDB
2. **Server Goes Offline**: ConnectionMonitor detects → Event fired → Banner shown
3. **Offline Authentication**: User enters password → Hash compared locally → Session restored
4. **Server Returns**: ConnectionMonitor detects → Sync triggered → Banner removed

---

## Component Reference

### ConnectionMonitor (`connection_monitor.js`)

**Purpose**: Detects server reachability and network status changes.

**Events**:
| Event | Description |
|-------|-------------|
| `server-reachable` | Server is accessible |
| `server-unreachable` | Server cannot be reached |
| `connection-restored` | Browser went back online |
| `connection-lost` | Browser went offline |

**Key Methods**:
```javascript
connectionMonitor.start()         // Begin monitoring
connectionMonitor.stop()          // Stop monitoring
connectionMonitor.checkNow()      // Immediate connectivity check
connectionMonitor.forceOffline()  // Force offline state
connectionMonitor.getStatus()     // Get current status
```

**Adaptive Timeouts** (Mobile Optimization):
| Network Type | Timeout | Check Interval |
|--------------|---------|----------------|
| 2G/slow-2g   | 15s     | 60s            |
| 3G           | 10s     | 45s            |
| 4G/WiFi      | 5s      | 30s            |

---

### OfflineDB (`offline_db.js`)

**Purpose**: IndexedDB wrapper for offline data persistence.

**Stores**:
| Store | Key | Indexes | Purpose |
|-------|-----|---------|---------|
| sessions | id | user_id, created | Session persistence |
| users | id | login | User credential cache |
| config | key | - | Settings storage |
| transactions | id | synced, type, created_at | Pending operations |
| orders | id | state, date_order | Order cache |
| sync_errors | id (auto) | transaction_id, timestamp | Error tracking |

**Memory Management**:
- Automatic cleanup on memory pressure
- Quota monitoring before writes
- Emergency cleanup when storage > 90%

---

### OfflineAuth (`offline_auth.js`)

**Purpose**: Password validation using cached hashes.

**Algorithm**: SHA-256 with user ID salt
```javascript
hash = SHA256(password + userId)
```

**Validation Flow**:
1. Get user from IndexedDB by login
2. Compute hash of entered password
3. Compare with cached `pos_offline_auth_hash`
4. Return success/failure

---

### SessionPersistence (`session_persistence.js`)

**Purpose**: Save and restore POS sessions across browser restarts.

**Key Methods**:
```javascript
sessionPersistence.saveSession(posStore)     // Persist current session
sessionPersistence.restoreSession(posStore)  // Restore from IndexedDB
sessionPersistence.hasValidSession()         // Check for cached session
sessionPersistence.clearSession()            // Clear on logout
```

---

## API Endpoints

### POST `/pdc_pos_offline/validate_password`

**Auth**: Required (user)
**Type**: JSON-RPC

**Request**:
```json
{
  "password": "user_password"
}
```

**Response**:
```json
{
  "valid": true,
  "error": null
}
```

**Rate Limiting**: 5 attempts per 60 seconds per user

---

### POST `/pdc_pos_offline/get_offline_config`

**Auth**: Required (user)
**Type**: JSON-RPC

**Request**:
```json
{
  "config_id": 1
}
```

**Response**:
```json
{
  "enable_offline_mode": true,
  "offline_sync_interval": 300,
  "max_offline_days": 7
}
```

---

### POST `/pdc_pos_offline/session_beacon`

**Auth**: Required (user)
**Type**: HTTP

**Purpose**: Session heartbeat for activity tracking

---

## IndexedDB Schema

### Version 3 Schema

```javascript
// Sessions Store
{
  id: "offline_abc123",           // Session ID
  user_id: 2,                     // Odoo user ID
  user_data: {...},               // Cached user object
  offline_mode: true,
  authenticated_at: "2024-01-15T10:30:00Z",
  created: "2024-01-15T10:30:00Z",
  lastAccessed: "2024-01-15T12:00:00Z"
}

// Users Store
{
  id: 2,                          // Odoo user ID
  login: "cashier@store.com",
  name: "John Doe",
  pos_offline_auth_hash: "a1b2c3...", // SHA-256 hash
  cached_at: "2024-01-15T08:00:00Z"
}

// Transactions Store
{
  id: "tx_1705312200_abc123",
  type: "order",                  // order, payment, session_update
  data: {...},                    // Transaction payload
  synced: false,
  attempts: 0,
  created_at: "2024-01-15T10:30:00Z",
  uuid: "unique-identifier"
}

// Sync Errors Store
{
  id: 1,                          // Auto-increment
  transaction_id: "tx_...",
  error_message: "Network timeout",
  error_type: "network",
  timestamp: "2024-01-15T10:35:00Z",
  attempts: 3
}
```

---

## Security Model

### Password Storage

- **Never stored in plaintext**
- SHA-256 hash with user ID salt
- Captured automatically on online login
- Invalidated when password changes

### Session Security

- Cryptographically secure tokens (256-bit entropy)
- Device fingerprinting (optional)
- No timeout while offline (design decision)
- Cleared on explicit logout

### Rate Limiting

| Context | Limit | Window |
|---------|-------|--------|
| Server-side | 5 attempts | 60 seconds |
| Client-side | 10 attempts | 5 minutes lockout |

### Accepted Risks (Documented)

1. **No offline session timeout**: Mitigated by physical security of POS terminals
2. **IndexedDB readable via DevTools**: Inherent browser limitation
3. **Single SHA-256 iteration**: Trade-off for mobile performance

---

## ML Features

### Network Prediction (Optional)

Predicts server outages based on historical patterns:

```javascript
// Simple statistical model
const predictor = new OutagePredictor();
predictor.recordOutage(timestamp, duration);
const prediction = predictor.predictNextOutage();
// Returns: { probability: 0.7, estimatedTime: "14:00" }
```

### Smart Sync Optimization

Learns optimal sync timing:

```javascript
const syncOptimizer = new SyncOptimizer();
syncOptimizer.recordSyncResult(success, networkType, batchSize);
const optimalBatchSize = syncOptimizer.getOptimalBatchSize();
const shouldSyncNow = syncOptimizer.shouldSyncNow();
```

---

## Deployment Guide

### Prerequisites

- Odoo 19.0+
- PostgreSQL 14+
- HTTPS enabled (required for crypto APIs)
- Modern browser (Chrome 80+, Firefox 75+, Safari 13+)

### Installation

```bash
# Copy module to addons
sudo cp -r pdc-pos-offline /var/odoo/addons/pdc_pos_offline

# Set permissions
sudo chown -R odoo:odoo /var/odoo/addons/pdc_pos_offline

# Restart Odoo
sudo systemctl restart odoo

# Install module via UI or CLI
./odoo-bin -d mydb -i pdc_pos_offline
```

### Configuration

1. Go to **Point of Sale > Configuration > POS**
2. Enable "Offline Mode" checkbox
3. Set sync interval (default: 300 seconds)
4. Save

### Verification

```bash
# Run tests
npm test

# Check logs
tail -f /var/log/odoo/odoo.log | grep PDC-Offline
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "User not found in offline cache" | First-time user | Log in online first |
| "Offline login requires HTTPS" | HTTP connection | Use HTTPS |
| "Crypto API unavailable" | Private browsing | Use normal browsing mode |
| Session not restoring | IndexedDB cleared | Log in online again |
| Sync errors accumulating | Network issues | Check server connectivity |

### Debug Mode

Enable detailed logging:

```javascript
// In browser console
localStorage.setItem('PDC_DEBUG', 'true');
location.reload();
```

### Reset Offline Data

```javascript
// In browser console
const { offlineDB } = await import('/pdc_pos_offline/static/src/js/offline_db.js');
await offlineDB.reset();
location.reload();
```

### Check Storage Usage

```javascript
const estimate = await navigator.storage.estimate();
console.log(`Used: ${(estimate.usage / 1024 / 1024).toFixed(2)} MB`);
console.log(`Quota: ${(estimate.quota / 1024 / 1024).toFixed(2)} MB`);
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01 | Initial release |
| 1.1.0 | 2024-03 | Added mobile optimization |
| 1.2.0 | 2024-06 | Added sync error tracking |
| 2.0.0 | 2025-01 | Simplified to password auth (removed PIN) |
| 2.1.0 | 2026-01 | Added ML features, i18n, 27-wave hardening |

---

## Support

- **Documentation**: `/docs/` folder
- **Issues**: GitHub Issues
- **Email**: support@pos.com
