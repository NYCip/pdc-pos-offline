#!/bin/bash
#
# Odoo 19 Compliance Check Script
# Scans for deprecated patterns and blocks non-compliant code
#
# Usage:
#   ./scripts/odoo19_check.sh [path] [--strict] [--fix]
#
# Exit codes:
#   0 - All checks passed
#   1 - Violations found
#   2 - Script error

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SCAN_PATH="${1:-.}"
STRICT_MODE=false
AUTO_FIX=false
VIOLATION_COUNT=0
SCANNED_FILES=0

# Parse arguments
for arg in "$@"; do
    case $arg in
        --strict)
            STRICT_MODE=true
            shift
            ;;
        --fix)
            AUTO_FIX=true
            shift
            ;;
        --help|-h)
            echo "Odoo 19 Compliance Check"
            echo ""
            echo "Usage: $0 [path] [options]"
            echo ""
            echo "Options:"
            echo "  --strict    Fail on any violation (default for CI)"
            echo "  --fix       Attempt auto-fix for simple patterns"
            echo "  --help      Show this help message"
            echo ""
            echo "Exit codes:"
            echo "  0 - All checks passed"
            echo "  1 - Violations found"
            exit 0
            ;;
    esac
done

# Ensure we have ripgrep
if ! command -v rg &> /dev/null; then
    echo -e "${RED}Error: ripgrep (rg) is required but not installed.${NC}"
    echo "Install with: sudo apt install ripgrep  OR  brew install ripgrep"
    exit 2
fi

echo -e "${BLUE}=== Odoo 19 Compliance Check ===${NC}"
echo -e "Scanning: ${SCAN_PATH}"
echo ""

# Function to check a pattern and report violations
check_pattern() {
    local pattern="$1"
    local description="$2"
    local fix_hint="$3"
    local file_type="${4:-}"

    local type_flag=""
    if [[ -n "$file_type" ]]; then
        type_flag="--type $file_type"
    fi

    # Run ripgrep and capture output
    local matches
    if matches=$(rg -n $type_flag "$pattern" "$SCAN_PATH" 2>/dev/null); then
        local count=$(echo "$matches" | wc -l)
        VIOLATION_COUNT=$((VIOLATION_COUNT + count))

        echo -e "${RED}[FAIL]${NC} $description"
        echo -e "  Pattern: ${YELLOW}$pattern${NC}"
        echo -e "  Fix: ${GREEN}$fix_hint${NC}"
        echo -e "  Violations:"
        echo "$matches" | head -20 | while IFS= read -r line; do
            echo -e "    ${line}"
        done
        if [[ $count -gt 20 ]]; then
            echo -e "    ... and $((count - 20)) more"
        fi
        echo ""
        return 1
    else
        echo -e "${GREEN}[PASS]${NC} $description"
        return 0
    fi
}

# Function to count files
count_files() {
    local type="$1"
    if [[ "$type" == "py" ]]; then
        find "$SCAN_PATH" -name "*.py" -type f 2>/dev/null | wc -l
    elif [[ "$type" == "js" ]]; then
        find "$SCAN_PATH" -name "*.js" -type f 2>/dev/null | wc -l
    elif [[ "$type" == "xml" ]]; then
        find "$SCAN_PATH" -name "*.xml" -type f 2>/dev/null | wc -l
    fi
}

echo -e "${BLUE}--- Python Checks ---${NC}"
SCANNED_FILES=$((SCANNED_FILES + $(count_files "py")))

# Python Hard-Ban Patterns
check_pattern 'from odoo\.osv\b' \
    "Old OSV imports" \
    "Use: from odoo import models, fields, api" \
    "py" || true

check_pattern '\._cr\b' \
    "Direct _cr access" \
    "Use: self.env.cr or record.env.cr" \
    "py" || true

check_pattern '\._uid\b' \
    "Direct _uid access" \
    "Use: self.env.uid or record.env.uid" \
    "py" || true

check_pattern '\._context\b' \
    "Direct _context access" \
    "Use: self.env.context or record.env.context" \
    "py" || true

check_pattern '\bread_group\s*\(' \
    "Deprecated read_group()" \
    "Use: _read_group() or formatted_read_group()" \
    "py" || true

check_pattern '\bsearch_fetch\s*\(' \
    "Deprecated search_fetch()" \
    "Use: _search() + browse()" \
    "py" || true

check_pattern '\.pool\.get\s*\(' \
    "Legacy pool.get()" \
    "Use: self.env['model.name']" \
    "py" || true

check_pattern '\.pool\s*\[' \
    "Legacy pool[] access" \
    "Use: self.env['model.name']" \
    "py" || true

check_pattern '@api\.multi\b' \
    "Deprecated @api.multi decorator" \
    "Remove decorator (multi is default)" \
    "py" || true

check_pattern '@api\.one\b' \
    "Deprecated @api.one decorator" \
    "Remove decorator and iterate in method body" \
    "py" || true

check_pattern 'from openerp\b' \
    "Old openerp imports" \
    "Use: from odoo import ..." \
    "py" || true

echo ""
echo -e "${BLUE}--- JavaScript Checks ---${NC}"
SCANNED_FILES=$((SCANNED_FILES + $(count_files "js")))

# JavaScript Hard-Ban Patterns
check_pattern 'odoo\.define\s*\(' \
    "Legacy odoo.define()" \
    "Use: ES module with /** @odoo-module */" \
    "js" || true

check_pattern "require\s*\(['\"]web\." \
    "Legacy require('web.*')" \
    "Use: import from @web/..." \
    "js" || true

check_pattern "require\s*\(['\"]point_of_sale\." \
    "Legacy require('point_of_sale.*')" \
    "Use: import from @point_of_sale/..." \
    "js" || true

check_pattern '\.extend\s*\(\{' \
    "Legacy .extend() pattern" \
    "Use: class extends or patch()" \
    "js" || true

check_pattern '\$\([^)]+\)\.on\s*\(' \
    "jQuery event binding" \
    "Use: OWL event handlers (t-on-click, etc.)" \
    "js" || true

check_pattern '\$\([^)]+\)\.click\s*\(' \
    "jQuery click handler" \
    "Use: OWL onClick method" \
    "js" || true

check_pattern "core\.action_registry" \
    "Legacy action registry" \
    "Use: registry.category('actions')" \
    "js" || true

echo ""
echo -e "${BLUE}--- XML Checks ---${NC}"
SCANNED_FILES=$((SCANNED_FILES + $(count_files "xml")))

# XML Hard-Ban Patterns
check_pattern 'hasclass\s*\(' \
    "hasclass() removed in Odoo 19" \
    "Use: contains(@class, 'classname')" \
    "xml" || true

check_pattern '<act_window\s' \
    "Deprecated <act_window> shortcut" \
    "Use: <record model='ir.actions.act_window'>" \
    "xml" || true

check_pattern 't-extend\s*=' \
    "Deprecated t-extend" \
    "Use: manifest assets or t-inherit" \
    "xml" || true

check_pattern 't-jquery\s*=' \
    "Deprecated t-jquery" \
    "Use: manifest assets" \
    "xml" || true

echo ""
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "Scanned: ${SCANNED_FILES} files"
echo -e "Violations: ${VIOLATION_COUNT}"

if [[ $VIOLATION_COUNT -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}Odoo 19 Compliance: PASS${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}Odoo 19 Compliance: FAIL${NC}"
    echo ""
    echo -e "${YELLOW}To fix violations:${NC}"
    echo "1. Review each violation above"
    echo "2. Apply the suggested fix"
    echo "3. Re-run this check"
    echo ""
    echo "For auto-fix mappings, see:"
    echo "  .odoo-dev/steering/odoo19-compliance-contract.md"

    if [[ "$STRICT_MODE" == true ]]; then
        exit 1
    else
        echo ""
        echo -e "${YELLOW}Note: Run with --strict to fail CI${NC}"
        exit 0
    fi
fi
