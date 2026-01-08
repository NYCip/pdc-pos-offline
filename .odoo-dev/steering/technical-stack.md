# Odoo POS Technical Stack & Development Standards

## Document Information
- **Odoo Version**: 19.0
- **Python Version**: 3.12+
- **PostgreSQL Version**: 15+
- **Node.js Version**: 20+

---

## 1. Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                            │
│  OWL 2.x Framework │ QWeb Templates │ SCSS/CSS                  │
├─────────────────────────────────────────────────────────────────┤
│                    BUSINESS LAYER                                │
│  Python 3.12+ │ Odoo ORM │ Werkzeug │ Jinja2                    │
├─────────────────────────────────────────────────────────────────┤
│                    DATA LAYER                                    │
│  PostgreSQL 15+ │ Redis (sessions) │ S3 (attachments)          │
├─────────────────────────────────────────────────────────────────┤
│                    HARDWARE LAYER                                │
│  ESC/POS Printers │ Pax/SoundPayment │ Scales │ Drawers        │
├─────────────────────────────────────────────────────────────────┤
│                    OFFLINE LAYER                                 │
│  IndexedDB │ Service Workers │ Background Sync                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Hardware Integration

### ESC/POS Printers
- Network printers on port 9100
- Commands: INIT, CUT, BOLD, CENTER, DRAWER_OPEN
- Receipt formatting with store branding

### Payment Terminals
- Pax: REST API on port 10009
- SoundPayment: WebSocket connection
- Timeout: 120 seconds for card processing

### Scales
- Serial/USB connection
- Protocols: Toledo, CAS, Generic
- Stable weight detection

---

## 3. Offline Mode Architecture

### Service Worker
- Cache static assets
- Intercept fetch requests
- Background sync when online

### IndexedDB Schema
- products: id, barcode, name, price
- orders: local_id, sync_status, created_at
- customers: id, phone, email
- payments: local_id, order_id

### Conflict Resolution
- Offline orders always win (customer served)
- Inventory conflicts: alert manager
- Price changes: use price at time of sale

---

## 4. Performance Standards

### ORM Best Practices
- Prefetch related records
- Use read_group for aggregations
- Batch processing in chunks of 1000

### Caching
- ormcache for expensive computations
- Clear cache on data changes
