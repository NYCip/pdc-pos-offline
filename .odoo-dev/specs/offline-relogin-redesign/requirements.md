# Offline Re-Login Module Redesign - Requirements

## Document Information
- **Spec ID**: offline-relogin-redesign
- **Created**: 2026-01-07
- **Status**: APPROVED
- **Source**: HiveMind 3-Agent Deliberation + Ultrathink Analysis

---

## 1. Problem Statement

### Current State (INCORRECT)
pdc-pos-offline module:
- Duplicates native Odoo 19 offline functionality
- Shows **BLOCKING** full-screen "offline" banner that interrupts sales
- Users cannot continue working when server is temporarily unreachable

### Native Odoo 19 (CORRECT)
- HAS built-in offline support with `network.offline` flag
- Uses `unsyncData[]` array to queue operations
- Auto-syncs via `syncAllOrdersDebounced()` on reconnect
- Shows **NON-BLOCKING** navbar indicator (`fa-chain-broken` icon)
- Users continue sales seamlessly

### The ONLY Gap
When user logs out (or session expires) while server is offline, they cannot re-authenticate because native Odoo requires server connection for login.

---

## 2. Requirements

### R1: Remove Blocking UI
- **Priority**: P0 (Critical)
- **Description**: Remove all full-screen offline banners and blocking UI
- **Acceptance**: Users can continue sales while offline without any modal/banner

### R2: Use Native Network Detection
- **Priority**: P0 (Critical)
- **Description**: Use native `this.pos.data.network.offline` instead of custom detection
- **Acceptance**: No duplicate network monitoring code

### R3: Offline Re-Login Capability
- **Priority**: P1 (High)
- **Description**: Enable users to re-authenticate when offline using cached credentials
- **Acceptance**: User can log in with username/password when server unreachable

### R4: Credential Caching
- **Priority**: P1 (High)
- **Description**: Cache user credentials (hashed) on successful online login
- **Acceptance**: Credentials stored in IndexedDB, not plaintext

### R5: Session Restoration
- **Priority**: P1 (High)
- **Description**: Restore cached session data when logging in offline
- **Acceptance**: User has access to their POS config, permissions after offline login

### R6: Server Reconnect Validation
- **Priority**: P2 (Medium)
- **Description**: Validate offline session with server when connectivity returns
- **Acceptance**: Invalid sessions are logged out, valid sessions continue

---

## 3. Out of Scope

These are handled by native Odoo 19 and MUST NOT be reimplemented:

- ❌ Network connectivity detection (use native `network.offline`)
- ❌ Operation queuing (use native `unsyncData[]`)
- ❌ Auto-sync on reconnect (use native `syncAllOrdersDebounced()`)
- ❌ Offline UI indicator (use native navbar icon)
- ❌ Order persistence while offline (native handles this)

---

## 4. User Stories

### US1: Sales During Network Outage
**As a** cashier
**I want to** continue processing sales when the server goes offline
**So that** I can serve customers without interruption

**Acceptance Criteria**:
- No blocking screen appears when offline
- Native navbar shows offline indicator (chain-broken icon)
- Sales queue in background and sync on reconnect

### US2: Re-Login When Offline
**As a** cashier who logged out while offline
**I want to** log back in using my password
**So that** I can resume working without waiting for server

**Acceptance Criteria**:
- Offline login popup appears when server unreachable
- Password validated against cached hash
- Session restored from cache
- User can access their POS configuration

### US3: Session Validation on Reconnect
**As a** system administrator
**I want** offline sessions to be validated when server returns
**So that** unauthorized access is prevented

**Acceptance Criteria**:
- Session validated with server on reconnect
- Invalid sessions are terminated
- Valid sessions continue seamlessly

---

## 5. Technical Constraints

### Security
- Passwords MUST be hashed with SHA-256 + user ID salt
- Plaintext passwords MUST NOT be stored
- Cached credentials MUST be stored in IndexedDB (not localStorage)

### Compatibility
- MUST work with Odoo 19.0
- MUST use OWL 2.x components
- MUST NOT use deprecated Widget patterns

### Performance
- Credential caching MUST complete in <100ms
- Offline login validation MUST complete in <200ms
- No impact on native POS performance

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Blocking UI occurrences | 0 (eliminated) |
| Offline re-login success rate | >95% |
| Credential cache coverage | 100% of POS users |
| Code reduction from current | >70% |
| Native integration points | 100% (use native, don't replace) |
