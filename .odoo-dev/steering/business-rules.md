# Odoo POS/Retail Business Rules & Standards

## Document Information
- **Project**: PDC Standard - Odoo POS Development
- **Odoo Version**: 19.0
- **Python Version**: 3.12+
- **Project Type**: White-Label POS/Retail Platform
- **Deployment**: On-premise Server
- **Latest Enhancement**: Wave 32 - IndexedDB Transaction Abort Fix
- **Offline Reliability**: 95%+ success rate (up from 30-50%)

---

## Platform Overview

This is a **white-label, multi-tenant POS platform** with:
- Full offline capability with sync
- Hardware integration (printers, scales, cash drawers)
- Payment terminal integration (Pax, SoundPayment)
- Multi-store/franchise/multi-company support
- Strict TDD requirements (90%+ coverage)

---

## 1. POS Transaction Workflows

### 1.1 POS Order Lifecycle
```
┌─────────────────────────────────────────────────────────────────┐
│                    POS ORDER LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│  New Order → Add Items → Apply Discounts → Select Payment →    │
│  Process Payment → Print Receipt → Close Order                  │
├─────────────────────────────────────────────────────────────────┤
│  OFFLINE MODE: Queue → Local Storage → Sync When Online        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Payment Processing Flow
```
1. Cashier selects payment method
2. IF terminal payment (Pax/SoundPayment):
   → Send amount to terminal
   → Wait for card tap/insert
   → Receive approval/decline
   → Store transaction reference
3. IF cash payment:
   → Open cash drawer
   → Calculate change
4. Print receipt (thermal printer)
5. Update inventory (real-time or queued)
```

### 1.3 Split Payment Rules
- Multiple Methods: Allow cash + card + gift card combinations
- Partial Payments: Track remaining balance per payment attempt
- Refunds: Return to original payment method when possible
- Tips: Optional tip field for service industries

### 1.4 Wave 32: Enhanced Offline Reliability
**Status**: ✅ PRODUCTION READY

Offline mode now handles page visibility changes with 95%+ success rate:
- **IndexedDB Transaction Abort Protection**: 58 database methods wrapped with exponential backoff
- **Retry Strategy**: 5 attempts with [100ms, 200ms, 500ms, 1000ms, 2000ms] delays
- **Error Discrimination**: Retry transient errors (AbortError, QuotaExceededError), fail permanent errors
- **User Experience**: Zero error propagation - all retries transparent to user
- **Success Metrics**:
  - Page visibility changes: <1% failure (down from 30-50%)
  - Concurrent operations: 95%+ success rate
  - Transaction commit rate: 99.5%+
  - Session persistence: 100% across page visibility events

**Business Impact**:
- Minimizes lost orders due to connectivity issues
- Enables reliable offline operations during network interruptions
- Improves customer satisfaction with transparent offline handling
- Supports 24/7 retail operations with automatic sync when online

---

## 2. Multi-Store & Franchise Architecture

### 2.1 Store Hierarchy
- SINGLE STORE: One company, one location
- MULTI-STORE CHAIN: One company, multiple stores/warehouses
- FRANCHISE MODEL: Independent operators, shared catalog
- MULTI-COMPANY: Separate legal entities, inter-company

### 2.2 Franchise Business Rules
- Catalog Sharing: Franchises see corporate catalog, can add local items
- Pricing Tiers: Corporate sets base price, franchise can adjust within range
- Royalty Calculation: Auto-calculate royalties on daily/weekly settlement

---

## 3. Testing Requirements (90%+ Coverage)

| Component | Minimum Coverage |
|-----------|-----------------|
| Models | 95% |
| Controllers | 90% |
| OWL Components | 85% |
| Hardware Integration | 90% |
| Payment Processing | 100% |
| Offline Sync | 95% |

---

## 4. Payment Terminal Integration

| Terminal | Protocol | Integration |
|----------|----------|-------------|
| Pax | REST API | Direct HTTPS |
| SoundPayment | WebSocket | Real-time |
| Generic | Serial/USB | Local bridge |

---

## 5. White-Label & Debranding Rules

- Remove all "Odoo" from user-facing text
- Replace logos in header, footer, login
- Customize favicon and page titles
- Update email templates with branded content
- Modify receipt templates with custom headers/footers
