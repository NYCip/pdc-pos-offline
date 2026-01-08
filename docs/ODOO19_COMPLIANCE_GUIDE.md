# Odoo 19 Compliance Enforcement Guide

> **Status**: ✅ Production-Ready
> **Version**: 1.0.0
> **Audience**: Odoo module developers, QA engineers, DevOps teams

---

## Quick Start

### Run Compliance Check

```bash
# Scan current directory
make odoo19_check

# Scan specific module
make odoo19_check /path/to/module

# Strict mode (fails on any violation - use for CI)
make odoo19_check_strict /path/to/module
```

### Understanding the Output

```
=== Odoo 19 Compliance Check ===
Scanning: /path/to/module

--- Python Checks ---
✅ [PASS] Old OSV imports
✅ [PASS] Direct _cr access
...

=== Summary ===
Scanned: 45 files
Violations: 0

✅ Odoo 19 Compliance: PASS
```

---

## What Gets Checked

The compliance scanner blocks these **hard-ban patterns**:

### Python (11 checks)
| Pattern | Issue | Fix |
|---------|-------|-----|
| `from odoo.osv import ...` | Old import style | Use `from odoo import models, fields, api` |
| `self._cr` / `record._cr` | Direct access to private attributes | Use `self.env.cr` |
| `self._uid` / `record._uid` | Direct access to private attributes | Use `self.env.uid` |
| `self._context` / `record._context` | Direct access to private attributes | Use `self.env.context` |
| `read_group()` | Deprecated ORM method | Use `_read_group()` or `formatted_read_group()` |
| `search_fetch()` | Deprecated ORM method | Use `_search()` + `browse()` |
| `self.pool.get()` | Deprecated pool access | Use `self.env['model.name']` |
| `self.pool[]` | Deprecated pool access | Use `self.env['model.name']` |
| `@api.multi` | Deprecated decorator | Remove (now default behavior) |
| `@api.one` | Deprecated decorator | Remove and iterate in method |
| `from openerp ...` | Ancient import | Use `from odoo import ...` |

### JavaScript (7 checks)
| Pattern | Issue | Fix |
|---------|-------|-----|
| `odoo.define()` | Legacy module definition | Use ES modules with `/** @odoo-module */` |
| `require('web.*)` | Legacy require | Use modern imports from `@web/...` |
| `require('point_of_sale.*)` | Legacy require | Use modern imports |
| `.extend({})` | Legacy class extension | Use `class extends` or `patch()` |
| `$().on()` | jQuery binding | Use OWL event handlers |
| `$().click()` | jQuery binding | Use OWL event handlers |
| `core.action_registry` | Legacy registry | Use `registry.category('actions')` |

### XML (4 checks)
| Pattern | Issue | Fix |
|---------|-------|-----|
| `hasclass()` | Removed in Odoo 19 | Use `contains(@class, 'classname')` |
| `<act_window>` | Deprecated shortcut | Use explicit action records |
| `t-extend` | Deprecated template extension | Use asset bundles or `t-inherit` |
| `t-jquery` | Deprecated jQuery template modification | Use asset bundles |

---

## Integration with Development Workflow

### 1. Local Development

Check your code before committing:

```bash
# Before git commit
make odoo19_check

# If violations found, fix them
# (See auto-fix mappings in .odoo-dev/steering/odoo19-compliance-contract.md)
```

### 2. Pre-Commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
set -e

echo "Checking Odoo 19 compliance..."
make odoo19_check_strict

if [ $? -eq 0 ]; then
    echo "✅ Compliance check passed"
    exit 0
else
    echo "❌ Compliance violations found. Fix them before committing."
    exit 1
fi
```

Enable the hook:

```bash
chmod +x .git/hooks/pre-commit
```

### 3. CI/CD Pipeline

Add to your CI workflow (GitHub Actions, GitLab CI, etc.):

```yaml
# GitHub Actions example
- name: Odoo 19 Compliance Check
  run: make odoo19_check_strict ./

- name: Run Tests
  run: npm run test:odoo
```

### 4. PR Reviews

Compliance check is **required before merge**:

1. Developer opens PR
2. CI runs `make odoo19_check_strict`
3. If failures, PR cannot merge
4. Developer fixes violations
5. Re-runs check until PASS
6. PR approved and merged

---

## Common Issues & Solutions

### Error: "ripgrep (rg) is required but not installed"

**Solution**: Install ripgrep

```bash
# Ubuntu/Debian
sudo apt install ripgrep

# macOS
brew install ripgrep

# Or use cargo
cargo install ripgrep
```

### Issue: "read_group() not found"

**Problem**: Your code uses the old `read_group()` method

**Solution**: Update to Odoo 19 syntax

```python
# ❌ OLD (Odoo 18)
result = self.env['sale.order'].read_group(
    domain=[],
    fields=['amount_total'],
    groupby=['partner_id']
)

# ✅ NEW (Odoo 19)
result = self.env['sale.order']._read_group(
    domain=[],
    groupby=['partner_id'],
    aggregates=['amount_total:sum']
)
```

### Issue: "hasclass() removed in Odoo 19"

**Problem**: Your XPath uses `hasclass()` function

**Solution**: Replace with `contains()`

```xml
<!-- ❌ OLD -->
<xpath expr="//button[hasclass('btn-primary')]" position="after">

<!-- ✅ NEW -->
<xpath expr="//button[contains(@class, 'btn-primary')]" position="after">
```

### Issue: "odoo.define is legacy"

**Problem**: Your JavaScript uses `odoo.define()`

**Solution**: Convert to ES modules

```javascript
// ❌ OLD
odoo.define('my_module.Component', function (require) {
    var Widget = require('web.Widget');
    return Widget.extend({...});
});

// ✅ NEW
/** @odoo-module */
import { Component } from "@odoo/owl";

export class MyComponent extends Component {
    static template = "my_module.Component";
}
```

---

## Migration Path

### 1. Assessment
```bash
# Identify all violations
make odoo19_check > violations.log
```

### 2. Planning
- Review violations by category
- Prioritize critical paths
- Estimate migration effort

### 3. Execution
Follow the [Odoo 19 Migration Checklist](.odoo-dev/steering/odoo19-migration-checklist.md):
- Phase 1: Python ORM
- Phase 2: JavaScript/OWL
- Phase 3: XML/Views
- Phase 4: Manifest
- Phase 5: Testing
- Phase 6: Code Review
- Phase 7: Deployment

### 4. Validation
```bash
# Ensure zero violations
make odoo19_check_strict

# Expected output:
# Odoo 19 Compliance: PASS
# - Scanned: X files
# - Violations: 0
```

---

## Reference Documents

| Document | Purpose |
|----------|---------|
| [Odoo 19 Compliance Contract](.odoo-dev/steering/odoo19-compliance-contract.md) | Comprehensive reference with examples |
| [Odoo 19 Migration Checklist](.odoo-dev/steering/odoo19-migration-checklist.md) | Step-by-step migration guide |
| [Odoo 19 API Docs](https://docs.odoo.com) | Official Odoo documentation |

---

## Performance Tips

### 1. Scan Only Changed Files

```bash
# Get changed files from git
CHANGED_FILES=$(git diff --name-only HEAD)

# Scan only those files
make odoo19_check . --files "$CHANGED_FILES"
```

### 2. Exclude Directories

```bash
# Skip node_modules and dist
cd your-module && make odoo19_check . --exclude "node_modules,dist"
```

### 3. Quick Mode (First 20 violations)

```bash
# Only shows first 20 violations
make odoo19_check . | head -100
```

---

## Enforcement Levels

### 🔴 ERROR (Hard-Ban)
- **Action**: Block code merge
- **Examples**: `from odoo.osv`, `self._cr`, `odoo.define()`
- **When**: Any production code
- **Exception**: None (rewrite required)

### 🟡 WARNING (Deprecated)
- **Action**: Flag in PR review
- **Examples**: Legacy patterns that still work
- **When**: Code requires update within next release
- **Exception**: With documented migration plan

### 🟢 INFO (Style)
- **Action**: Suggestion for improvement
- **Examples**: Code style recommendations
- **When**: Optional cleanup
- **Exception**: No

---

## Team Guidelines

### For Developers
1. Run `make odoo19_check` before pushing code
2. Fix any violations immediately
3. Use migration checklist for large refactors
4. Document any legacy code exceptions

### For Code Reviewers
1. Verify compliance check passes
2. Review violations list in PR
3. Require migration plan for exceptions
4. Block merge if violations exist

### For DevOps / CI Engineers
1. Add `make odoo19_check_strict` to CI pipeline
2. Fail builds on compliance violations
3. Report metrics to team dashboard
4. Archive compliance reports weekly

---

## FAQ

**Q: Can I ignore specific violations?**
A: No. The `--strict` flag blocks all violations. Update your code instead.

**Q: What if my module is for Odoo 18?**
A: Use the appropriate version. Odoo 19 compliance is only required for modules targeting O19.

**Q: Can I use legacy patterns if justified?**
A: In rare cases, add a comment explaining why, then file a migration ticket for the next release.

**Q: How do I report false positives?**
A: Open an issue on [GitHub](https://github.com/stanleykao72/claude-code-spec-workflow-odoo/issues) with details.

**Q: Does the check auto-fix violations?**
A: Not yet. Manual fixes are required using the mapping table in the compliance contract.

---

## Support & Resources

- **Documentation**: See `.odoo-dev/steering/odoo19-compliance-contract.md`
- **Script Help**: `./scripts/odoo19_check.sh --help`
- **Make Targets**: `make help | grep odoo19`
- **Issues**: Report on GitHub repository
- **Questions**: Check migration checklist first

---

**Version**: 1.0.0
**Last Updated**: 2026-01-08
**Maintained by**: Odoo 19 Compliance Team
