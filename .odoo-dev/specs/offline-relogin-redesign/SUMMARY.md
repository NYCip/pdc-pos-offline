# Offline Re-Login Module Redesign - Summary

## Status: SPEC COMPLETE - Ready for Implementation

## Problem
The pdc-pos-offline module duplicates native Odoo 19 offline functionality and shows a **BLOCKING** full-screen banner that interrupts sales. Native Odoo 19 has built-in offline support with a NON-BLOCKING indicator.

## Root Cause Analysis
| Issue | Current PDC | Native Odoo 19 |
|-------|-------------|----------------|
| Network State | Custom `connectionMonitor` | Native `network.offline` flag |
| Operation Queue | Custom sync queue | Native `unsyncData[]` array |
| Auto-Sync | `SyncManager` | Native `syncAllOrdersDebounced()` |
| **UI Pattern** | **BLOCKING banner** | **NON-BLOCKING navbar icon** |

## Solution: Minimal Surgical Module
Focus on the **SINGLE GAP** in native Odoo: offline re-login when user logs out while server is unreachable.

## Implementation Plan

### Phase 1: Remove Blocking UI (P0)
- T1: Remove `showOfflineBanner()` from `pos_offline_patch.js`
- T2: Empty `offline_indicator.xml` (use native navbar indicator)

### Phase 2: Integrate with Native (P1)
- T3: Refactor `connection_monitor.js` - remove UI triggers
- T4: Create `pos_offline_login_patch.js` - login fallback
- T5: Update `__manifest__.py` assets
- T6: Server - add offline hash to login response

### Phase 3: Verify (P1-P2)
- T7: Integration testing
- T8: Documentation update

## Key Files

### KEEP (serve offline re-login)
- `offline_auth.js` - Password hash validation
- `offline_db.js` - IndexedDB credential storage
- `session_persistence.js` - Session caching
- `offline_login_popup.js` - Re-login UI

### CREATE (new integration)
- `pos_offline_login_patch.js` - Patches native login

### REMOVE/REFACTOR (duplicate native)
- `showOfflineBanner()` - Remove blocking UI
- `offline_indicator.xml` - Use native indicator

## Success Metrics
- Blocking UI occurrences: **0** (eliminated)
- Offline re-login success rate: **>95%**
- Code reduction: **>70%**
- Native integration: **100%**

## HiveMind Swarm
- **Swarm ID**: swarm_1767829828425_d1o8wwc0b
- **Agents**: 3 (researcher, architect, coder)
- **Status**: Deliberation complete

## Documents Created
1. `requirements.md` - User stories and acceptance criteria
2. `design.md` - Architecture and integration patterns
3. `tasks.md` - 8 implementation tasks
4. `../steering/odoo19-native-offline.md` - Native Odoo 19 documentation

---
**Created**: 2026-01-07
**Source**: HiveMind 3-Agent Deliberation + Ultrathink Analysis
