#!/bin/bash

# PDC POS Offline Module - Test Runner
# Executes all test cases and generates report

echo "======================================"
echo "PDC POS OFFLINE - COMPREHENSIVE TESTS"
echo "======================================"
echo "Date: $(date)"
echo ""

# Set test environment
export ODOO_TEST_MODE=1
export TEST_DATA_DIR="tests/test_data"
export SCREENSHOT_DIR="tests/screenshots"

# Create directories
mkdir -p $TEST_DATA_DIR
mkdir -p $SCREENSHOT_DIR
mkdir -p tests/reports

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

run_test() {
    local test_name=$1
    local test_command=$2
    
    echo -n "Running $test_name... "
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if eval $test_command > tests/reports/${test_name}.log 2>&1; then
        echo -e "${GREEN}PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "  See tests/reports/${test_name}.log for details"
    fi
}

echo "1. UNIT TESTS"
echo "============="

# JavaScript unit tests
if command -v jest &> /dev/null; then
    run_test "js_unit_tests" "jest tests/test_offline_auth.js --silent"
else
    echo -e "${YELLOW}Jest not installed. Install with: npm install -g jest${NC}"
fi

# Python unit tests
run_test "python_backend_tests" "python3 -m pytest tests/test_backend.py -v"

echo ""
echo "2. INTEGRATION TESTS"
echo "===================="

# Database tests
run_test "indexeddb_tests" "node tests/test_indexeddb.js"

# API tests
run_test "api_endpoint_tests" "python3 tests/test_api_endpoints.py"

echo ""
echo "3. UI AUTOMATION TESTS"
echo "======================"

# UI tests with Playwright
if command -v playwright &> /dev/null; then
    run_test "ui_automation_tests" "playwright test tests/test_ui_automation.js"
else
    echo -e "${YELLOW}Playwright not installed. Install with: npm install -g playwright${NC}"
fi

echo ""
echo "4. PERFORMANCE TESTS"
echo "===================="

# Performance benchmarks
run_test "performance_benchmarks" "python3 tests/test_performance.py"

# Load tests
run_test "load_tests" "python3 tests/test_load.py"

echo ""
echo "5. SECURITY TESTS"
echo "================="

# Security scans
run_test "security_scan" "python3 tests/test_security.py"

# Vulnerability checks
run_test "vulnerability_check" "python3 tests/test_vulnerabilities.py"

echo ""
echo "6. EDGE CASE TESTS"
echo "=================="

# Run each edge case scenario
for i in {1..10}; do
    run_test "edge_case_$i" "python3 tests/run_edge_case.py $i"
done

echo ""
echo "7. GENERATING TEST REPORT"
echo "========================="

# Generate HTML report
cat > tests/reports/test_report.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>PDC POS Offline Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #333; color: white; padding: 20px; }
        .summary { margin: 20px 0; padding: 20px; background: #f5f5f5; }
        .passed { color: green; font-weight: bold; }
        .failed { color: red; font-weight: bold; }
        .test-case { margin: 10px 0; padding: 10px; border-left: 3px solid #ddd; }
        .test-case.pass { border-color: green; }
        .test-case.fail { border-color: red; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; }
    </style>
</head>
<body>
    <div class="header">
        <h1>PDC POS Offline Module - Test Report</h1>
        <p>Generated: $(date)</p>
    </div>
    
    <div class="summary">
        <h2>Test Summary</h2>
        <p>Total Tests: $TOTAL_TESTS</p>
        <p class="passed">Passed: $PASSED_TESTS</p>
        <p class="failed">Failed: $FAILED_TESTS</p>
        <p>Pass Rate: $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%</p>
    </div>
    
    <h2>Test Results</h2>
    <table>
        <tr>
            <th>Test Case</th>
            <th>Category</th>
            <th>Status</th>
            <th>Duration</th>
        </tr>
        <!-- Test results would be inserted here -->
    </table>
    
    <h2>Screenshots</h2>
    <div class="screenshots">
        <!-- Screenshot gallery would go here -->
    </div>
</body>
</html>
EOF

echo -e "${GREEN}Test report generated: tests/reports/test_report.html${NC}"

echo ""
echo "======================================"
echo "TEST EXECUTION COMPLETE"
echo "======================================"
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo -e "Pass Rate: $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%"
echo ""

# Exit with failure if any tests failed
if [ $FAILED_TESTS -gt 0 ]; then
    exit 1
else
    exit 0
fi