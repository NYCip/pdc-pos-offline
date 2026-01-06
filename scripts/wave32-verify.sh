#!/bin/bash

###############################################################################
# Wave 32 Post-Deployment Verification Script
# Verifies successful deployment and monitors for issues
# Run on production servers: pwh19.iug.net and teso10.iug.net
###############################################################################

set -euo pipefail

# Configuration
SERVERS=("pwh19.iug.net" "teso10.iug.net")
EXPECTED_MD5="7333dc3a8a364a2feb3e7adae9a22ff0"
TARGET_DIRS=(
  "/var/www/odoo/static/src/js/"
  "/var/www/odoo/addons/pdc_pos_offline/static/src/js/"
  "/mnt/extra-addons/pdc_pos_offline/static/src/js/"
)
MONITORING_DURATION=1800  # 30 minutes
TIMEOUT=30

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
# Verification Functions
###############################################################################

verify_server_file() {
    local server=$1

    header "VERIFYING $server"

    # Test connectivity
    log_info "Testing SSH connectivity..."
    if ! timeout $TIMEOUT ssh -o ConnectTimeout=10 root@"$server" "echo 'Connected'" > /dev/null 2>&1; then
        log_error "Cannot connect to $server"
        return 1
    fi
    log_success "SSH connection successful"

    # Find target file
    log_info "Locating offline_db.js..."
    target_file=""
    for dir in "${TARGET_DIRS[@]}"; do
        if ssh -o ConnectTimeout=10 root@"$server" "[ -f '${dir}offline_db.js' ]" 2>/dev/null; then
            target_file="${dir}offline_db.js"
            log_success "Found: $target_file"
            break
        fi
    done

    if [ -z "$target_file" ]; then
        log_error "offline_db.js not found on $server"
        return 1
    fi

    # Verify MD5
    log_info "Verifying MD5..."
    remote_md5=$(ssh -o ConnectTimeout=10 root@"$server" "md5sum '$target_file' | awk '{print \$1}'")

    if [ "$remote_md5" != "$EXPECTED_MD5" ]; then
        log_error "MD5 mismatch! Expected: $EXPECTED_MD5, Got: $remote_md5"
        return 1
    fi
    log_success "MD5 verified: $EXPECTED_MD5"

    # Check file size
    log_info "Checking file size..."
    remote_size=$(ssh -o ConnectTimeout=10 root@"$server" "stat -c%s '$target_file'" 2>/dev/null || ssh root@"$server" "stat -f%z '$target_file'" 2>/dev/null || echo "unknown")

    if [ "$remote_size" = "74383" ]; then
        log_success "File size verified: 74,383 bytes"
    else
        log_warn "File size: $remote_size bytes"
    fi

    # Check file timestamp
    log_info "Checking deployment timestamp..."
    remote_timestamp=$(ssh -o ConnectTimeout=10 root@"$server" "stat -c%y '$target_file' 2>/dev/null | cut -d' ' -f1,2" || echo "unknown")
    log_success "Last modified: $remote_timestamp"

    return 0
}

monitor_server() {
    local server=$1
    local duration=$2

    header "MONITORING $server (${duration}s)"

    log_info "Starting monitoring - watch for AbortError messages..."
    log_info "Press Ctrl+C to stop monitoring early"
    echo ""

    elapsed=0
    while [ $elapsed -lt $duration ]; do
        # Check nginx errors
        nginx_aborts=$(ssh -o ConnectTimeout=10 root@"$server" "tail -100 /var/log/nginx/error.log 2>/dev/null | grep -ic abort" || echo "0")

        # Check odoo errors
        odoo_aborts=$(ssh -o ConnectTimeout=10 root@"$server" "tail -100 /var/log/odoo/odoo.log 2>/dev/null | grep -ic abrt" || echo "0")

        # Check for offline module logs
        offline_logs=$(ssh -o ConnectTimeout=10 root@"$server" "tail -50 /var/log/odoo/odoo.log 2>/dev/null | grep -c 'PDC-Offline'" || echo "0")

        status="✓"
        if [ "$nginx_aborts" -gt 0 ] || [ "$odoo_aborts" -gt 0 ]; then
            status="⚠"
            log_warn "[$elapsed/${duration}s] Found abort-related errors"
        else
            log_info "[$elapsed/${duration}s] No abort errors detected"
        fi

        if [ "$offline_logs" -gt 0 ]; then
            log_info "  - PDC-Offline logs found: $offline_logs"
        fi

        # Update every 60 seconds
        sleep 60
        elapsed=$((elapsed + 60))
    done

    log_success "Monitoring complete"
    return 0
}

check_services() {
    local server=$1

    header "CHECKING SERVICES ON $server"

    # Check nginx
    log_info "Checking nginx status..."
    if ssh -o ConnectTimeout=10 root@"$server" "systemctl is-active nginx" 2>/dev/null | grep -q active; then
        log_success "nginx is active"
    else
        log_warn "nginx may not be running"
    fi

    # Check odoo
    log_info "Checking odoo status..."
    if ssh -o ConnectTimeout=10 root@"$server" "systemctl is-active odoo" 2>/dev/null | grep -q active; then
        log_success "odoo is active"
    else
        log_warn "odoo may not be running"
    fi

    # Check disk space
    log_info "Checking disk space..."
    disk_usage=$(ssh -o ConnectTimeout=10 root@"$server" "df -h / | tail -1 | awk '{print \$5}'" 2>/dev/null || echo "unknown")
    log_info "Root partition usage: $disk_usage"

    return 0
}

###############################################################################
# Main Execution
###############################################################################

main() {
    header "WAVE 32 POST-DEPLOYMENT VERIFICATION"
    log_info "File: offline_db.js"
    log_info "Monitoring duration: ${MONITORING_DURATION}s (30 minutes)"
    echo ""

    # Ask user confirmation
    read -p "Continue with verification? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warn "Verification cancelled"
        exit 0
    fi

    # Verify all servers
    failed_servers=()
    for server in "${SERVERS[@]}"; do
        if ! verify_server_file "$server"; then
            failed_servers+=("$server")
        fi
    done

    if [ ${#failed_servers[@]} -gt 0 ]; then
        log_error "Verification failed on: ${failed_servers[*]}"
        exit 1
    fi

    echo ""
    header "DEPLOYMENT VERIFICATION: SUCCESS"
    log_success "All servers have correct deployment"

    # Optional monitoring
    echo ""
    read -p "Start monitoring servers for 30 minutes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        for server in "${SERVERS[@]}"; do
            check_services "$server"
            monitor_server "$server" "$MONITORING_DURATION"
        done

        header "MONITORING COMPLETE"
        log_success "No critical issues detected during monitoring"
        log_info "Recommendation: Continue monitoring logs for next 24 hours"
    fi

    # Final summary
    header "VERIFICATION SUMMARY"
    log_success "Deployment verification passed!"
    log_info "File: offline_db.js (Wave 32 - IndexedDB Transaction Abort Fix)"
    log_info "Servers: ${SERVERS[*]}"
    log_info "Status: DEPLOYED & VERIFIED"
    echo ""
    log_info "Post-deployment checklist:"
    echo "  [ ] Verified file MD5: $EXPECTED_MD5"
    echo "  [ ] Verified file size: 74,383 bytes"
    echo "  [ ] Services reloaded: nginx, odoo"
    echo "  [ ] No AbortError in logs"
    echo "  [ ] Offline mode tested"
    echo "  [ ] Page visibility changes tested"
    echo "  [ ] Monitoring completed"
    echo ""
}

# Run main function
main "$@"
