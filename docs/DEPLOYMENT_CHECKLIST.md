# PDC POS Offline - Deployment Checklist

## Pre-Deployment

### Environment
- [ ] Odoo 19.0+ installed
- [ ] PostgreSQL 14+ running
- [ ] HTTPS enabled (required for Web Crypto API)
- [ ] Node.js 18+ (for testing)

### Code Review
- [ ] All tests passing (`npm test`)
- [ ] No console errors in browser
- [ ] Security audit completed
- [ ] i18n strings wrapped with `_t()`

---

## Deployment Steps

### 1. Backup
```bash
# Backup database
pg_dump mydb > backup_$(date +%Y%m%d).sql

# Backup existing module (if upgrading)
cp -r /var/odoo/addons/pdc_pos_offline /tmp/pdc_backup_$(date +%Y%m%d)
```

### 2. Deploy Module
```bash
# Copy new code
sudo cp -r /home/epic/dev/pdc-pos-offline/* /var/odoo/addons/pdc_pos_offline/

# Set ownership
sudo chown -R odoo:odoo /var/odoo/addons/pdc_pos_offline

# Set permissions
sudo chmod -R 755 /var/odoo/addons/pdc_pos_offline
```

### 3. Restart Services
```bash
# Restart Odoo
sudo systemctl restart odoo

# Verify running
sudo systemctl status odoo
```

### 4. Update Module
```bash
# Via CLI
./odoo-bin -d mydb -u pdc_pos_offline --stop-after-init

# Or via UI: Apps > pdc_pos_offline > Upgrade
```

### 5. Verify Deployment
- [ ] Module appears in installed apps
- [ ] POS loads without errors
- [ ] Offline mode toggle visible in POS config
- [ ] Browser console shows "[PosStore] Offline mode initialized"

---

## Post-Deployment Testing

### Functional Tests
- [ ] Online login works
- [ ] User data cached to IndexedDB
- [ ] Offline detection works (disconnect network)
- [ ] Offline login popup appears
- [ ] Password authentication works
- [ ] Session persists after browser restart
- [ ] Reconnection detected correctly
- [ ] Sync completes after reconnection

### Mobile Tests
- [ ] iOS Safari: Touch targets adequate (48px)
- [ ] Android Chrome: Keyboard doesn't cover input
- [ ] Tablet: Landscape/portrait modes work
- [ ] PWA: Add to home screen works

### Performance Tests
- [ ] Initial load < 3 seconds
- [ ] Offline login < 1 second
- [ ] Memory usage < 50MB after 4 hours
- [ ] 100 pending transactions sync < 30 seconds

---

## Rollback Procedure

If issues occur:

```bash
# 1. Stop Odoo
sudo systemctl stop odoo

# 2. Restore backup
sudo rm -rf /var/odoo/addons/pdc_pos_offline
sudo cp -r /tmp/pdc_backup_YYYYMMDD /var/odoo/addons/pdc_pos_offline

# 3. Restore database (if needed)
psql mydb < backup_YYYYMMDD.sql

# 4. Restart
sudo systemctl start odoo

# 5. Downgrade module
./odoo-bin -d mydb -u pdc_pos_offline --stop-after-init
```

---

## Monitoring

### Key Metrics to Watch
- IndexedDB storage usage per terminal
- Sync error rate
- Average offline session duration
- Password validation attempts (rate limiting)

### Log Locations
```bash
# Odoo logs
/var/log/odoo/odoo.log

# Filter for module
grep "PDC-Offline\|pdc_pos_offline" /var/log/odoo/odoo.log

# Browser console (client-side)
# Open DevTools > Console > Filter: "[PDC"
```

### Alerts to Configure
- Sync error rate > 5% in 1 hour
- IndexedDB quota > 80%
- Rate limit hits > 10 per hour per user

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Operations | | | |
| Security | | | |
