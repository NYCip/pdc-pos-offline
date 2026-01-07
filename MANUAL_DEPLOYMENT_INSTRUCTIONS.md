# Manual Production Deployment Instructions
## Wave 32 P1: IndexedDB ConstraintError Fix

**Deployment Date**: 2026-01-07
**Commit**: `1b69b5f` - fix(offline): Wave 32 P1 - IndexedDB ConstraintError fix
**Status**: READY FOR MANUAL DEPLOYMENT
**Risk Level**: 🟢 LOW (Backward compatible, tested, rollback < 1 minute)

---

## 📋 Quick Summary

This deployment fixes a ConstraintError that occurs during offline user synchronization. The bug was caused by a race condition in the user cache logic.

**Changes**:
- `static/src/js/offline_db.js` - Improved upsert logic in saveUser() method
- `static/src/js/sync_manager.js` - Added ConstraintError recovery mechanism

**File Checksums**:
```
c6381462c1d6cc658e52ac93e1af164f  offline_db.js
09dcdb01f7882c9314ec712c7fa3abca  sync_manager.js
```

**Expected Impact**:
- ✅ Eliminates ConstraintError during user sync
- ✅ Improves offline reliability
- ✅ No breaking changes
- ✅ Backward compatible

---

## 🚀 Manual Deployment Steps

### Phase 1: Pre-Deployment Verification

#### Step 1.1: Verify Source Files
```bash
# On deployment machine
cd /home/epic/dev/pdc-pos-offline

# Verify files exist
ls -lh static/src/js/offline_db.js
ls -lh static/src/js/sync_manager.js

# Verify checksums
md5sum static/src/js/offline_db.js
# Expected: c6381462c1d6cc658e52ac93e1af164f  offline_db.js

md5sum static/src/js/sync_manager.js
# Expected: 09dcdb01f7882c9314ec712c7fa3abca  sync_manager.js

# Verify git status
git status
git log -1
# Should show: 1b69b5f fix(offline): Wave 32 P1 - IndexedDB ConstraintError fix
```

#### Step 1.2: Review Changes
```bash
# Review what changed in offline_db.js
git diff c73dab0..1b69b5f -- static/src/js/offline_db.js | head -100

# Review what changed in sync_manager.js
git diff c73dab0..1b69b5f -- static/src/js/sync_manager.js | head -100
```

---

### Phase 2: Deployment to Production Servers

#### Step 2.1: For Each Server (pwh19.iug.net and teso10.iug.net)

**Option A: Using Git Pull (RECOMMENDED)**

```bash
# SSH to production server
ssh root@pwh19.iug.net

# Navigate to Odoo directory
cd /var/www/odoo

# Create backup of current files
mkdir -p /var/backups/pdc-pos-offline
cp static/src/js/offline_db.js /var/backups/pdc-pos-offline/offline_db.js.backup-$(date +%Y%m%d-%H%M%S)
cp static/src/js/sync_manager.js /var/backups/pdc-pos-offline/sync_manager.js.backup-$(date +%Y%m%d-%H%M%S)

# Pull latest changes from main branch
git pull origin main

# Verify new files were deployed
ls -lh static/src/js/offline_db.js
ls -lh static/src/js/sync_manager.js

# Verify checksums
md5sum static/src/js/offline_db.js
# Expected: c6381462c1d6cc658e52ac93e1af164f

md5sum static/src/js/sync_manager.js
# Expected: 09dcdb01f7882c9314ec712c7fa3abca

# Reload Nginx and Odoo services
systemctl reload nginx
systemctl restart odoo

# Verify services are running
systemctl status nginx
systemctl status odoo

# Exit and repeat for next server
exit
```

**Option B: Using SCP (Manual Copy)**

```bash
# On deployment machine
cd /home/epic/dev/pdc-pos-offline

# Create backups on production server
ssh root@pwh19.iug.net "mkdir -p /var/backups/pdc-pos-offline && cp /var/www/odoo/static/src/js/offline_db.js /var/backups/pdc-pos-offline/offline_db.js.backup-\$(date +%Y%m%d-%H%M%S) && cp /var/www/odoo/static/src/js/sync_manager.js /var/backups/pdc-pos-offline/sync_manager.js.backup-\$(date +%Y%m%d-%H%M%S)"

# Copy files via SCP
scp static/src/js/offline_db.js root@pwh19.iug.net:/var/www/odoo/static/src/js/
scp static/src/js/sync_manager.js root@pwh19.iug.net:/var/www/odoo/static/src/js/

# Verify checksums on production
ssh root@pwh19.iug.net "md5sum /var/www/odoo/static/src/js/offline_db.js /var/www/odoo/static/src/js/sync_manager.js"

# Reload services
ssh root@pwh19.iug.net "systemctl reload nginx && systemctl restart odoo"

# Repeat for second server
ssh root@teso10.iug.net "mkdir -p /var/backups/pdc-pos-offline && cp /var/www/odoo/static/src/js/offline_db.js /var/backups/pdc-pos-offline/offline_db.js.backup-\$(date +%Y%m%d-%H%M%S) && cp /var/www/odoo/static/src/js/sync_manager.js /var/backups/pdc-pos-offline/sync_manager.js.backup-\$(date +%Y%m%d-%H%M%S)"

scp static/src/js/offline_db.js root@teso10.iug.net:/var/www/odoo/static/src/js/
scp static/src/js/sync_manager.js root@teso10.iug.net:/var/www/odoo/static/src/js/

ssh root@teso10.iug.net "md5sum /var/www/odoo/static/src/js/offline_db.js /var/www/odoo/static/src/js/sync_manager.js"

ssh root@teso10.iug.net "systemctl reload nginx && systemctl restart odoo"
```

---

### Phase 3: Post-Deployment Verification

#### Step 3.1: Verify Files on Production

```bash
# SSH to production server
ssh root@pwh19.iug.net

# Verify file sizes and timestamps
ls -lh /var/www/odoo/static/src/js/offline_db.js /var/www/odoo/static/src/js/sync_manager.js

# Verify checksums
md5sum /var/www/odoo/static/src/js/offline_db.js /var/www/odoo/static/src/js/sync_manager.js

# Expected checksums:
# c6381462c1d6cc658e52ac93e1af164f  offline_db.js
# 09dcdb01f7882c9314ec712c7fa3abca  sync_manager.js

# Verify service status
systemctl status nginx
systemctl status odoo

# Check service has no errors
systemctl status odoo | grep -i "active\|running"
```

#### Step 3.2: Check Application Logs

```bash
# On each production server
ssh root@pwh19.iug.net

# Check for ConstraintError (expect ZERO occurrences in first 30 minutes)
echo "=== Checking for ConstraintError in logs ==="
tail -100 /var/log/odoo/odoo.log | grep -i "constrainterror" || echo "✅ No ConstraintError found"

# Check for PDC-Offline sync messages (expect multiple)
echo ""
echo "=== Checking for PDC-Offline sync messages ==="
tail -100 /var/log/odoo/odoo.log | grep "\[PDC-Offline\]" | head -20

# Check for general errors
echo ""
echo "=== Checking for general errors ==="
tail -50 /var/log/nginx/error.log || echo "✅ No nginx errors"

# Exit
exit
```

---

### Phase 4: Production Monitoring (First 24 Hours)

#### Step 4.1: Real-Time Monitoring

```bash
# Monitor Odoo logs continuously
ssh root@pwh19.iug.net "tail -f /var/log/odoo/odoo.log | grep -E 'ConstraintError|PDC-Offline|ERROR'"

# In another terminal, check sync status
watch -n 5 "ssh root@pwh19.iug.net 'tail -20 /var/log/odoo/odoo.log | grep PDC-Offline'"
```

#### Step 4.2: Success Criteria (First 24 Hours)

✅ **Check these conditions**:

1. **No ConstraintError messages**
   ```bash
   ssh root@pwh19.iug.net "tail -1000 /var/log/odoo/odoo.log | grep -c 'ConstraintError'"
   # Expected: 0
   ```

2. **Multiple PDC-Offline sync messages**
   ```bash
   ssh root@pwh19.iug.net "tail -500 /var/log/odoo/odoo.log | grep -c '\[PDC-Offline\]'"
   # Expected: > 100 (indicating active syncs)
   ```

3. **No service errors**
   ```bash
   ssh root@pwh19.iug.net "systemctl status odoo | grep -i 'active\|running'"
   # Expected: active (running)
   ```

4. **Nginx is healthy**
   ```bash
   ssh root@pwh19.iug.net "systemctl status nginx | grep -i 'active\|running'"
   # Expected: active (running)
   ```

---

## 🔙 Rollback Procedure (If Needed)

**Time**: < 1 minute per server

```bash
# SSH to production server
ssh root@pwh19.iug.net

# List available backups
ls -la /var/backups/pdc-pos-offline/

# Restore from most recent backup
cp /var/backups/pdc-pos-offline/offline_db.js.backup-* /var/www/odoo/static/src/js/offline_db.js
cp /var/backups/pdc-pos-offline/sync_manager.js.backup-* /var/www/odoo/static/src/js/sync_manager.js

# Reload services
systemctl reload nginx
systemctl restart odoo

# Verify services
systemctl status odoo
systemctl status nginx

# Verify checksums match pre-deployment versions
md5sum /var/www/odoo/static/src/js/offline_db.js
# Should match old version checksum

# Exit
exit
```

---

## 📊 Deployment Checklist

- [ ] **Pre-Deployment**
  - [ ] Verified source files exist
  - [ ] Verified checksums match (c6381462... and 09dcdb01...)
  - [ ] Reviewed git log (commit 1b69b5f)
  - [ ] Read this entire document

- [ ] **Deployment**
  - [ ] Backed up existing files on pwh19.iug.net
  - [ ] Deployed files to pwh19.iug.net
  - [ ] Verified checksums on pwh19.iug.net
  - [ ] Reloaded services on pwh19.iug.net
  - [ ] Backed up existing files on teso10.iug.net
  - [ ] Deployed files to teso10.iug.net
  - [ ] Verified checksums on teso10.iug.net
  - [ ] Reloaded services on teso10.iug.net

- [ ] **Post-Deployment**
  - [ ] Verified services are running
  - [ ] Checked logs for ConstraintError (expect 0)
  - [ ] Checked logs for PDC-Offline messages (expect many)
  - [ ] Verified no nginx errors
  - [ ] Monitored for 30 minutes (no issues)

- [ ] **24-Hour Monitoring**
  - [ ] No ConstraintError in logs (full 24 hours)
  - [ ] Offline sync working reliably
  - [ ] Multi-user scenarios tested
  - [ ] Performance metrics normal

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue**: Files won't copy via SCP
```bash
# Solution: Check SSH permissions
ssh root@pwh19.iug.net "ls -l /var/www/odoo/static/src/js/"
# Should be readable/writable
```

**Issue**: Services won't start after deployment
```bash
# Solution: Restore from backup (see Rollback section)
# Then check for syntax errors in files
# Review error logs: tail -50 /var/log/odoo/odoo.log
```

**Issue**: ConstraintError still appearing in logs
```bash
# Solution: Verify correct files were deployed
ssh root@pwh19.iug.net "md5sum /var/www/odoo/static/src/js/offline_db.js"
# Should be: c6381462c1d6cc658e52ac93e1af164f

# If mismatch, redeploy
# If still wrong, check for caching issues: browser cache clear
```

### Emergency Rollback

If any critical issues occur:

```bash
# Immediately restore all servers
for server in pwh19.iug.net teso10.iug.net; do
  ssh root@$server "cp /var/backups/pdc-pos-offline/offline_db.js.backup-* /var/www/odoo/static/src/js/offline_db.js && cp /var/backups/pdc-pos-offline/sync_manager.js.backup-* /var/www/odoo/static/src/js/sync_manager.js && systemctl reload nginx && systemctl restart odoo"
done

# Verify rollback
for server in pwh19.iug.net teso10.iug.net; do
  echo "Checking $server..."
  ssh root@$server "systemctl status odoo | grep -i 'active\|running'"
done
```

---

## 📚 Additional Resources

- **Bug Analysis**: `.spec/bugs/indexeddb-login-constraint-error/analysis-code-review.md`
- **Test Specifications**: `.spec/bugs/indexeddb-login-constraint-error/test-fix.md`
- **Deployment Report**: `.spec/bugs/indexeddb-login-constraint-error/DEPLOYMENT_REPORT_*.md`
- **Odoo 19 Audit**: `ODOO19_AUDIT_COMPLETION_REPORT.md`
- **Wave 32 Summary**: `WAVE32_COMPLETION_SUMMARY.md`

---

## ✅ Deployment Status

**Status**: ✅ READY FOR PRODUCTION DEPLOYMENT

**Next Steps**:
1. Follow manual deployment instructions above
2. Verify all success criteria
3. Monitor logs for 24 hours
4. Confirm deployment in Slack/Teams

**Questions?** Review the test specifications and bug analysis for detailed technical information.

---

**Deployment Date**: 2026-01-07
**Commit**: 1b69b5f
**Risk Level**: 🟢 LOW
**Rollback Time**: < 1 minute

