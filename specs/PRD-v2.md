# Product Requirements Document: PDC POS Offline v2

**Module:** pdc_pos_offline
**Version:** 2.0.0
**Date:** 2025-12-31
**Status:** Draft
**Odoo Version:** 19.0

---

## Executive Summary

PDC POS Offline enables Point of Sale terminals to **LOGIN** when the Odoo server is unreachable. This module complements Odoo 19's native offline capabilities (which handle runtime disconnection) by adding startup offline authentication.

**Core Value Proposition:** Cashiers can start their shift even when the server is down, using a pre-configured 4-digit PIN.

---

## Problem Statement

### Current Gap in Odoo 19 POS

| Scenario | Odoo 19 Native | With pdc_pos_offline |
|----------|---------------|---------------------|
| POS open, server drops | ✅ Works (orders queued) | ✅ Works |
| Browser closed, server drops, user reopens | ❌ Cannot login | ✅ PIN login |
| Server down at shift start | ❌ Cannot access POS | ✅ PIN login |

### Business Impact

- **Lost sales** when server outage coincides with shift change
- **Staff idle time** waiting for connectivity
- **Customer frustration** at checkout delays

---

## Scope

### In Scope (v2)

| Feature | Description |
|---------|-------------|
| Offline PIN login | 4-digit PIN authentication without server |
| Session auto-restore | Automatic restore if valid cached session exists |
| Connection monitoring | Detect server unreachable state |
| Seamless reconnection | Auto-continue when server returns |
| Subtle offline indicator | Non-intrusive "Offline Mode" banner |
| Comprehensive testing | 70%+ test coverage |

### Out of Scope

| Feature | Reason |
|---------|--------|
| Offline order sync | Odoo 19 native handles this |
| Product/customer caching | Odoo 19 native handles this |
| Cashier switching offline | Simplicity; single user per session |
| Offline reports | Requires server-side data |
| Payment terminal offline | Hardware requires network |
| First-use offline | Impossible without initial data cache |

---

## User Stories

### US-1: Offline Login with PIN

**As a** cashier
**I want to** login to POS using my PIN when the server is down
**So that** I can continue serving customers during outages

**Acceptance Criteria:**
- [ ] PIN field accepts exactly 4 numeric digits
- [ ] Login succeeds if PIN hash matches cached value
- [ ] Login fails with clear error if PIN incorrect
- [ ] No lockout on failed attempts
- [ ] Session created and stored in IndexedDB

### US-2: Session Auto-Restore

**As a** cashier
**I want to** automatically resume my session when reopening the browser
**So that** I don't have to re-enter my PIN unnecessarily

**Acceptance Criteria:**
- [ ] If valid session exists in IndexedDB, auto-restore without PIN
- [ ] Session remains valid while offline (no timeout)
- [ ] If no cached session, show PIN login popup
- [ ] If no cached data at all, show "First use requires online" message

### US-3: Seamless Reconnection

**As a** cashier
**I want to** continue working seamlessly when the server comes back
**So that** my workflow isn't interrupted

**Acceptance Criteria:**
- [ ] No re-authentication required when server returns
- [ ] Offline banner disappears automatically
- [ ] Brief "Back Online" notification shown
- [ ] Pending orders sync automatically (Odoo native)

### US-4: Offline Mode Visibility

**As a** cashier
**I want to** know when I'm in offline mode
**So that** I understand my orders will sync later

**Acceptance Criteria:**
- [ ] Subtle banner displays "Offline Mode" at top
- [ ] Banner is non-intrusive (doesn't block work)
- [ ] Banner disappears when back online

### US-5: PIN Setup (Admin)

**As an** administrator
**I want to** set up PINs for cashiers
**So that** they can login offline

**Acceptance Criteria:**
- [ ] PIN field in user form (Settings > Users > POS Offline tab)
- [ ] Generate random PIN button
- [ ] PIN validated as 4 numeric digits
- [ ] PIN hash computed and stored automatically

---

## Functional Requirements

### FR-1: Offline Authentication

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1.1 | PIN must be exactly 4 numeric digits (0-9) | Must |
| FR-1.2 | PIN hashed with SHA-256 + user ID salt | Must |
| FR-1.3 | Hash comparison done client-side against cached value | Must |
| FR-1.4 | No brute-force lockout (removed for UX) | Must |
| FR-1.5 | Failed login shows "Incorrect PIN" message | Must |

### FR-2: Session Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-2.1 | Sessions stored in IndexedDB (survives browser close) | Must |
| FR-2.2 | No session timeout while offline | Must |
| FR-2.3 | Auto-restore valid session on POS open | Must |
| FR-2.4 | Session invalidated when server returns and user logs out | Should |

### FR-3: Connection Detection

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-3.1 | Detect server unreachable via failed `/pos/ping` or `/web/login` HEAD | Must |
| FR-3.2 | Detect server recovery automatically | Must |
| FR-3.3 | Emit events for state changes (server-reachable, server-unreachable) | Must |
| FR-3.4 | Check interval: 30 seconds when offline | Should |

### FR-4: User Interface

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4.1 | Offline login popup with username selector and PIN input | Must |
| FR-4.2 | Subtle "Offline Mode" banner when disconnected | Must |
| FR-4.3 | "Back Online" notification on reconnection | Should |
| FR-4.4 | DOM-based fallback if OWL Dialog unavailable | Should |

### FR-5: Integration with Odoo 19

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-5.1 | Use Odoo's native IndexedDB for data (don't duplicate) | Must |
| FR-5.2 | Use Odoo's native order sync (`sync_from_ui`) | Must |
| FR-5.3 | Hook into `data_service.network.offline` flag | Should |
| FR-5.4 | Respect Odoo's Service Worker for asset caching | Must |

---

## Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1.1 | Offline login response time | < 500ms |
| NFR-1.2 | Session restore time | < 1 second |
| NFR-1.3 | Connection check overhead | < 100ms per check |

### NFR-2: Security

| ID | Requirement | Notes |
|----|-------------|-------|
| NFR-2.1 | PIN never transmitted in plain text | Always hashed |
| NFR-2.2 | PIN hash uses user ID as salt | Prevents rainbow tables |
| NFR-2.3 | IndexedDB data not encrypted | Acceptable for offline-only scope |
| NFR-2.4 | Rate limiting on server-side PIN validation | 10 req/min/IP |

### NFR-3: Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-3.1 | Offline login success rate | 99.9% (if PIN correct) |
| NFR-3.2 | Session restore success rate | 99.9% (if data not corrupted) |
| NFR-3.3 | False offline detection rate | < 1% |

### NFR-4: Compatibility

| ID | Requirement |
|----|-------------|
| NFR-4.1 | Chrome 90+, Firefox 88+, Safari 14+, Edge 90+ |
| NFR-4.2 | Odoo 19.0 Community and Enterprise |
| NFR-4.3 | Works with Odoo's native POS offline mode |

---

## Test Requirements

### Coverage Target: 70%+

| Area | Test Type | Priority |
|------|-----------|----------|
| Offline login flow | Unit + Integration | P1 |
| Session restore | Integration | P1 |
| Connection detection | Unit + Integration | P1 |
| Sync when online | Integration | P2 |
| Edge cases | Unit | P2 |

### Test Scenarios

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| T-1 | Valid PIN login | Session created, POS accessible |
| T-2 | Invalid PIN login | Error shown, can retry |
| T-3 | Browser close/reopen while offline | Auto-restore session |
| T-4 | Server returns after offline | Seamless continuation |
| T-5 | First-time use offline | "Requires online" message |
| T-6 | Corrupted IndexedDB | Graceful error, prompt re-login |
| T-7 | Connection flapping | Stable state, no rapid switches |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Offline login success rate | > 99% | Logs / monitoring |
| Mean time to login (offline) | < 5 seconds | User testing |
| Test coverage | > 70% | Coverage reports |
| Bug reports (post-release) | < 5 critical | Issue tracker |

---

## Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| IndexedDB corruption | Cannot login offline | Low | Fallback to "requires online" |
| PIN guessing attack | Unauthorized access | Low | Physical device access required; limited value |
| Odoo 19 breaking changes | Module incompatible | Medium | Pin to specific Odoo version; test on upgrades |
| Service Worker conflicts | Asset caching fails | Low | Scope SW to `/pos/ui` |

---

## Release Criteria

### v2.0.0 Release Checklist

- [ ] All critical bugs fixed (validatePin, hashPin duplication)
- [ ] Session timeout removed (infinite while offline)
- [ ] Lockout logic removed
- [ ] Test coverage > 70%
- [ ] All P1 test scenarios pass
- [ ] Documentation updated (CLAUDE.md, README)
- [ ] Deployed to staging, manual testing complete
- [ ] Performance benchmarks met

---

## Appendix

### A. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-31 | First use requires online | Impossible to provide POS without cached data |
| 2025-12-31 | Auto-restore valid sessions | Best UX for returning users |
| 2025-12-31 | No session timeout offline | Extended outages shouldn't disrupt business |
| 2025-12-31 | Auto-continue when online | Seamless UX, no re-auth friction |
| 2025-12-31 | No cashier switching offline | Simplicity; single user per session |
| 2025-12-31 | 4-digit PIN, no lockout | Industry standard; no lockout avoids blocking staff |
| 2025-12-31 | Subtle offline banner | Minimal distraction |
| 2025-12-31 | Comprehensive testing (all 5 areas) | Stabilization priority |

### B. Related Documents

- [tech.md](./steering/tech.md) - Technical architecture
- [product.md](./steering/product.md) - Product context
- [structure.md](./steering/structure.md) - File structure
- [CLAUDE.md](../CLAUDE.md) - Development guide

### C. Glossary

| Term | Definition |
|------|------------|
| Offline Mode | POS operating without server connectivity |
| PIN | 4-digit Personal Identification Number for offline auth |
| Session | User's authenticated state stored in IndexedDB |
| IndexedDB | Browser database for offline data storage |
| Service Worker | Browser script for asset caching |
