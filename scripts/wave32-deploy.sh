#!/bin/bash

###############################################################################
# Wave 32 Production Deployment Script
# Target: pwh19.iug.net and teso10.iug.net
# File: offline_db.js (IndexedDB transaction abort fix)
# Date: 2026-01-06
# Status: Production Ready
###############################################################################

set -euo pipefail

# Configuration
SERVERS=("pwh19.iug.net" "teso10.iug.net")
SOURCE_FILE="/home/epic/dev/pdc-pos-offline/static/src/js/offline_db.js"
TARGET_DIRS=(
  "/var/www/odoo/static/src/js/"
  "/var/www/odoo/addons/pdc_pos_offline/static/src/js/"
  "/mnt/extra-addons/pdc_pos_offline/static/src/js/"
)
BACKUP_DIR="/var/backups/pdc-pos-offline"
EXPECTED_MD5="7333dc3a8a364a2feb3e7adae9a22ff0"
EXPECTED_SIZE="74383"
TIMEOUT=30

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

###############################################################################
# Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

header() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════════════╗"
    echo "║ $1"
    echo "╚════════════════════════════════════════════════════════════════════════╝"
    echo ""
}

###############################################################################
# Pre-Deployment Verification
###############################################################################

verify_source_file() {
    header "STEP 1: Verifying Source File"

    if [ ! -f "$SOURCE_FILE" ]; then
        log_error "Source file not found: $SOURCE_FILE"
        exit 1
    fi

    log_success "File exists: $SOURCE_FILE"

    # Check file size
    actual_size=$(stat -f%z "$SOURCE_FILE" 2>/dev/null || stat -c%s "$SOURCE_FILE" 2>/dev/null)
    if [ "$actual_size" != "$EXPECTED_SIZE" ]; then
        log_warn "File size mismatch: expected $EXPECTED_SIZE, got $actual_size"
    else
        log_success "File size verified: $actual_size bytes"
    fi

    # Check MD5
    actual_md5=$(md5sum "$SOURCE_FILE" 2>/dev/null | awk '{print $1}')
    if [ "$actual_md5" != "$EXPECTED_MD5" ]; then
        log_error "MD5 mismatch! Expected: $EXPECTED_MD5, Got: $actual_md5"
        exit 1
    fi
    log_success "MD5 verified: $EXPECTED_MD5"
}

verify_git_status() {
    header "STEP 2: Verifying Git Status"

    cd "$(dirname "$SOURCE_FILE")/../../../.."

    if ! git status > /dev/null 2>&1; then
        log_error "Not in a git repository"
        exit 1
    fi

    current_branch=$(git rev-parse --abbrev-ref HEAD)
    log_success "Current branch: $current_branch"

    if [ "$current_branch" != "main" ]; then
        log_warn "Not on main branch! Current: $current_branch"
    fi

    # Show latest commits
    log_info "Latest commits:"
    git log --oneline -3 | sed 's/^/  /'

    # Check for uncommitted changes in offline_db.js
    if git diff --name-only | grep -q "offline_db.js"; then
        log_warn "Uncommitted changes to offline_db.js detected"
    else
        log_success "No uncommitted changes to offline_db.js"
    fi
}

###############################################################################
# Deployment Functions
###############################################################################

deploy_to_server() {
    local server=$1

    echo ""
    header "DEPLOYING TO: $server"

    # Test connectivity
    log_info "Testing SSH connectivity..."
    if ! timeout $TIMEOUT ssh -o ConnectTimeout=10 root@"$server" "echo 'Connected'" > /dev/null 2>&1; then
        log_error "Cannot connect to $server via SSH"
        return 1
    fi
    log_success "SSH connection successful"

    # Find target directory
    log_info "Locating target directory..."
    target_path=""
    for dir in "${TARGET_DIRS[@]}"; do
        if ssh -o ConnectTimeout=10 root@"$server" "[ -d '$dir' ]" 2>/dev/null; then
            target_path="$dir"
            log_success "Found target directory: $target_path"
            break
        fi
    done

    if [ -z "$target_path" ]; then
        log_error "Could not find target directory on $server"
        log_warn "Tried: ${TARGET_DIRS[*]}"
        return 1
    fi

    target_file="${target_path}offline_db.js"

    # Step 1: Create backup
    log_info "Step 1/5: Creating backup..."
    backup_timestamp=$(date +%Y%m%d-%H%M%S)
    backup_file="${BACKUP_DIR}/offline_db.js.backup-${backup_timestamp}"

    if ! ssh root@"$server" "mkdir -p '$BACKUP_DIR' && cp '$target_file' '$backup_file' && echo 'Backup created: $backup_file'" 2>/dev/null; then
        log_error "Failed to create backup on $server"
        return 1
    fi
    log_success "Backup created: $backup_file"

    # Step 2: Deploy file
    log_info "Step 2/5: Deploying file..."
    if ! scp -p -o ConnectTimeout=$TIMEOUT "$SOURCE_FILE" root@"$server":"$target_file" > /dev/null 2>&1; then
        log_error "Failed to deploy file to $server"
        return 1
    fi
    log_success "File deployed to $target_file"

    # Step 3: Verify deployment
    log_info "Step 3/5: Verifying file integrity..."
    remote_md5=$(ssh -o ConnectTimeout=10 root@"$server" "md5sum '$target_file' 2>/dev/null | awk '{print \$1}'")

    if [ -z "$remote_md5" ]; then
        log_error "Could not verify file on remote server"
        return 1
    fi

    if [ "$remote_md5" != "$EXPECTED_MD5" ]; then
        log_error "MD5 mismatch on remote! Expected: $EXPECTED_MD5, Got: $remote_md5"
        log_warn "Restoring backup..."
        ssh root@"$server" "cp '$backup_file' '$target_file'" > /dev/null 2>&1
        return 1
    fi
    log_success "MD5 verified on remote: $EXPECTED_MD5"

    # Step 4: Clear caches and reload
    log_info "Step 4/5: Reloading services..."
    if ssh -o ConnectTimeout=10 root@"$server" "systemctl reload nginx 2>/dev/null && systemctl reload odoo 2>/dev/null" > /dev/null 2>&1; then
        log_success "Services reloaded successfully"
    else
        log_warn "Could not reload services (may not be running or permission denied)"
    fi

    # Step 5: Verify services
    log_info "Step 5/5: Verifying services..."
    if ssh -o ConnectTimeout=10 root@"$server" "systemctl is-active nginx > /dev/null && systemctl is-active odoo > /dev/null" 2>/dev/null; then
        log_success "All services active"
    else
        log_warn "Some services may not be active (check manually)"
    fi

    log_success "Deployment to $server completed!"
    return 0
}

###############################################################################
# Main Execution
###############################################################################

main() {
    header "WAVE 32 PRODUCTION DEPLOYMENT"
    log_info "Target: IndexedDB Transaction Abort Fix"
    log_info "File: offline_db.js"
    log_info "Servers: ${SERVERS[*]}"

    # Pre-deployment checks
    verify_source_file
    verify_git_status

    # Deploy to each server
    failed_servers=()
    for server in "${SERVERS[@]}"; do
        if ! deploy_to_server "$server"; then
            failed_servers+=("$server")
        fi
    done

    # Summary
    header "DEPLOYMENT SUMMARY"

    if [ ${#failed_servers[@]} -eq 0 ]; then
        log_success "All deployments completed successfully!"
        echo ""
        log_info "Next steps:"
        echo "  1. Verify in browser: Check POS offline mode functionality"
        echo "  2. Monitor logs: Watch for [PDC-Offline] messages (no AbortError)"
        echo "  3. Test visibility changes: Minimize/maximize browser window"
        echo "  4. Verify session persistence: Create order, switch pages"
        echo "  5. Monitor for 30 minutes: Check error logs on servers"
        exit 0
    else
        log_error "Deployment failed on: ${failed_servers[*]}"
        echo ""
        log_warn "Rollback instructions:"
        echo "  SSH into each server and run:"
        echo "    cp /var/backups/pdc-pos-offline/offline_db.js.backup-TIMESTAMP /var/www/odoo/static/src/js/offline_db.js"
        echo "    systemctl reload nginx && systemctl reload odoo"
        exit 1
    fi
}

# Run main function
main "$@"
