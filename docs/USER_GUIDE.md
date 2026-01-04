# PDC POS Offline - User Guide

## Overview

PDC POS Offline enables Point of Sale terminals to continue operating when the Odoo server is unreachable. Staff can log in using their regular Odoo password and continue processing sales.

## How It Works

### Automatic Setup (No Configuration Required)

1. **First Login**: Log in to POS while online using your normal Odoo credentials
2. **Automatic Caching**: Your password hash is securely cached in the browser
3. **Ready for Offline**: Next time the server is down, you can log in offline

### When Server Goes Offline

1. The system automatically detects server unreachability
2. An orange "OFFLINE MODE" banner appears at the top of the screen
3. If you need to log in, enter your username and password
4. Continue processing sales normally

### When Server Returns

1. The system detects connectivity restoration
2. "Back Online" notification appears
3. Any pending transactions sync automatically in the background

## For Store Managers

### Checking Offline Readiness

To verify a user can log in offline:
1. Have them log in online at least once
2. Their credentials are now cached for offline use

### Troubleshooting

| Problem | Solution |
|---------|----------|
| "User not found in offline cache" | User must log in online first |
| "Offline login requires HTTPS" | Ensure POS is accessed via HTTPS |
| Password doesn't work offline | Password may have changed - log in online to update cache |

### Security Notes

- Passwords are stored as SHA-256 hashes (not plaintext)
- Hashes are salted with user ID for additional security
- There is no limit on login attempts (prevents staff lockouts)
- Sessions persist until user logs out or clears browser data

## Technical Requirements

- Modern browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)
- HTTPS connection (required for crypto APIs)
- IndexedDB storage available (~50MB recommended)

## Mobile Devices

The offline login popup is optimized for:
- Touch screens (48px minimum touch targets)
- iOS Safari (100dvh viewport handling)
- Screen rotation (responsive layout)
- Notched devices (safe area support)

## Frequently Asked Questions

**Q: How long can I stay offline?**
A: Indefinitely. Sessions never expire while offline.

**Q: What happens to orders placed offline?**
A: They are stored locally and sync automatically when back online.

**Q: Do I need a separate PIN?**
A: No. Use your regular Odoo login password.

**Q: Can multiple users share a terminal offline?**
A: Yes. Each user logs in with their own credentials.

**Q: How do I know if my data synced?**
A: Check for the "Back Online" notification. Pending transactions show a sync indicator.
