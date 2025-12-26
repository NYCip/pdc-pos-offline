# PDC POS Offline Module

## Overview

The PDC POS Offline module enables Odoo POS to operate seamlessly during internet outages by providing:
- Offline PIN authentication
- Persistent session storage  
- Automatic synchronization when connection returns
- Browser crash recovery

## Key Features

### 1. Offline Authentication
- 4-digit PIN authentication when server is unreachable
- Secure client-side PIN validation using SHA-256 hashing
- User credentials cached locally for offline access

### 2. Session Persistence
- Sessions stored in IndexedDB for browser recovery
- Survives browser closure and system restarts
- Automatic session restoration on reconnection

### 3. Connection Monitoring
- Real-time network status detection
- Automatic mode switching (online/offline)
- Visual indicators for offline operation

### 4. Data Synchronization
- Queued transaction processing
- Automatic sync when connection restored
- Conflict resolution for offline changes

## Installation

1. Copy module to Odoo addons:
   ```bash
   sudo cp -r pdc_pos_offline /opt/odoo18/addons/
   ```

2. Update module list in Odoo

3. Install "PDC POS Offline" from Apps menu

4. Configure user PINs in Settings > Users

## Configuration

### User PIN Setup
1. Navigate to Settings > Users & Companies > Users
2. Edit POS user
3. Go to "POS Offline" tab
4. Generate or set 4-digit PIN

### Testing Offline Mode
1. Open POS with internet connection
2. Disconnect network/internet
3. Close browser completely
4. Reopen browser and navigate to POS
5. Login with username and PIN

## Technical Architecture

### Frontend Components
- **offline_db.js**: IndexedDB wrapper for persistent storage
- **session_persistence.js**: Session backup and restoration
- **offline_auth.js**: PIN validation and user authentication
- **connection_monitor.js**: Network status monitoring
- **sync_manager.js**: Data synchronization engine
- **pos_offline_patch.js**: POS store modifications

### Backend Components
- **res_users**: Extended with offline PIN fields
- **pos_session**: Session data export for offline use

### Security
- PIN hashed with SHA-256 + user ID salt
- No plain text PIN storage
- Session data encrypted in IndexedDB
- Automatic session expiration (24 hours)

## Browser Requirements
- Chrome 40+
- Firefox 44+  
- Safari 11.1+
- Edge 79+

## Limitations
- Requires initial online session to cache data
- Payment processing depends on terminal offline capabilities
- Some features may be limited in offline mode

## Support
For issues or questions, contact PDC support.