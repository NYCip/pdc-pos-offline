# PDC POS Offline Module

**Version:** 2.0.0
**Odoo Compatibility:** 19.0
**Tagline:** "Never miss a sale - login works even when the server doesn't"

## Overview

The PDC POS Offline module enables Odoo 19 POS terminals to LOGIN during internet outages. It provides:

- **Offline PIN authentication** - 4-digit PIN when server is unreachable
- **Session persistence** - Survives browser closure and system restarts
- **Connection monitoring** - Automatic detection and mode switching
- **Seamless recovery** - Auto-continue when server returns

### What This Module IS

| Feature | Description |
|---------|-------------|
| Offline LOGIN solution | Authenticate users when server is down |
| Session persistence layer | Keep users logged in across browser restarts |
| Connection monitor | Detect and respond to server availability |
| Complement to Odoo 19 | Works WITH native offline, not instead of |

### What This Module is NOT

| Not | Why |
|-----|-----|
| Order sync system | Odoo 19 native handles this |
| Product cache | Odoo 19 native handles this |
| Payment processor | Requires network connectivity |

## Quick Start

### 1. Installation

```bash
# Deploy to Odoo 19
sudo cp -r /home/epic/pdc-pos-offline/* /var/odoo/pwh19.iug.net/extra-addons/pdc_pos_offline/
sudo chown -R odoo:odoo /var/odoo/pwh19.iug.net/extra-addons/pdc_pos_offline/
sudo systemctl restart odona-pwh19.iug.net.service
```

### 2. Setup User PIN

1. Navigate to **Settings > Users & Companies > Users**
2. Edit POS user
3. Go to **"POS Offline"** tab
4. Click **"Generate PIN"** or enter 4-digit PIN manually
5. Save

### 3. First Use (While Online)

1. Open POS with internet connection
2. Use POS normally for a few minutes (caches data)
3. This populates the browser cache with product/user data

### 4. When Server Goes Down

| Scenario | What Happens |
|----------|--------------|
| POS already open | Automatic transition to offline mode |
| POS was closed | Open browser → Enter username + PIN |
| Session exists | Auto-restore (no PIN needed) |

### 5. When Server Returns

- "Back Online" notification appears
- Offline banner disappears
- User continues working seamlessly (no re-login)

## Key Features

### Offline PIN Authentication

- 4-digit PIN validation using SHA-256 hashing
- PIN is salted with user ID (prevents rainbow table attacks)
- **No lockout** - users can retry indefinitely
- Only works when server is unreachable

### Session Persistence

- Sessions stored in IndexedDB
- **No timeout** while offline
- Survives browser close/restart
- Auto-restore when reopening POS
- Valid until server returns + logout

### Connection Monitoring

- Real-time server reachability checks
- HEAD request to `/web/login` every 30 seconds
- Automatic online/offline mode switching
- Subtle banner indicator ("Offline Mode")

## Configuration

### POS Config Settings

| Field | Description | Default |
|-------|-------------|---------|
| Enable Offline Mode | Toggle offline login feature | True |
| Offline Sync Interval | How often to check for sync | 60 seconds |
| Offline PIN Required | Require PIN for offline login | True |

### User Settings

| Field | Description |
|-------|-------------|
| Offline PIN | 4-digit PIN for offline login |
| PIN Hash | SHA-256 hash (computed automatically) |

## Troubleshooting

### "Unable to connect to server" but I'm online

1. Check Odoo service: `sudo systemctl status odona-pwh19.iug.net.service`
2. Check logs: `sudo tail -f /var/odoo/pwh19.iug.net/logs/odoo-server.log`
3. Restart if needed: `sudo systemctl restart odona-pwh19.iug.net.service`

### "Invalid PIN" error

1. Verify PIN is exactly 4 digits
2. Verify PIN matches what was set in user profile
3. User can retry indefinitely (no lockout)

### Session not restoring

1. Check IndexedDB: Open DevTools > Application > IndexedDB > PDCPOSOfflineDB
2. Look for `sessions` store
3. Clear if corrupted and re-login

### First-time offline shows error

- This is expected! First use requires online to cache data
- Login once while online, then offline works

## Browser Requirements

| Browser | Minimum Version |
|---------|----------------|
| Chrome | 40+ |
| Firefox | 44+ |
| Safari | 11.1+ |
| Edge | 79+ |

## Security Notes

| Aspect | Implementation |
|--------|----------------|
| PIN Storage | SHA-256 hash only (no plaintext) |
| PIN Salt | User ID (unique per user) |
| Transmission | Never sent to server in plaintext |
| IndexedDB | Not encrypted (acceptable for scope) |
| Rate Limiting | Server-side, 10 req/min/IP |

## Running Tests

```bash
# Install test dependencies
cd /home/epic/pdc-pos-offline
npm install

# Run Playwright E2E tests
npm test

# Run Python tests
python3 -m pytest tests/test_backend.py -v
```

## Technical Documentation

For developers, see [CLAUDE.md](CLAUDE.md) for:
- Architecture diagrams
- JavaScript patterns
- API endpoints
- Development notes

## Version History

### v2.0.0 (2025-01-30)

- **REMOVED**: Session timeout (sessions valid indefinitely offline)
- **REMOVED**: Brute-force lockout (users can retry indefinitely)
- **REMOVED**: Custom Service Worker (use Odoo 19 native)
- **FIXED**: validatePin() method signature bug
- **FIXED**: Duplicate hashPin() implementations
- **ADDED**: Sync errors persisted to IndexedDB
- **ADDED**: Comprehensive Playwright E2E tests

### v1.0.0

- Initial release

## Support

For issues or questions:
- GitHub Issues: https://github.com/pdc/pdc-pos-offline
- PDC Support: support@pdc.com
