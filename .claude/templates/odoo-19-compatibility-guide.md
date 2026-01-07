# Odoo 19 Compatibility Guide - Migration from Odoo 17/18

## Overview

This guide provides comprehensive information for migrating PDC modules from Odoo 17/18 to Odoo 19. It covers all deprecated patterns, breaking changes, and required syntax updates.

**Target Audience:** Odoo developers, module maintainers, QA engineers
**Odoo Versions Covered:** Migration from 17.0/18.0 to 19.0
**Last Updated:** 2026-01-06

---

## Critical Breaking Changes

### 1. View Syntax: `<tree>` → `<list>` (MANDATORY)

**Status:** ❌ BREAKING CHANGE - Module installation will fail if not updated

**Odoo 17/18 (Deprecated):**
```xml
<record id="view_model_tree" model="ir.ui.view">
    <field name="name">model.tree</field>
    <field name="model">my.model</field>
    <field name="arch" type="xml">
        <tree string="Records">
            <field name="name"/>
            <field name="state"/>
        </tree>
    </field>
</record>
```

**Odoo 19 (Required):**
```xml
<record id="view_model_list" model="ir.ui.view">
    <field name="name">model.list</field>
    <field name="model">my.model</field>
    <field name="arch" type="xml">
        <list string="Records">
            <field name="name"/>
            <field name="state"/>
        </list>
    </field>
</record>
```

**Migration Checklist:**
- [ ] Replace all `<tree>` opening tags with `<list>`
- [ ] Replace all `</tree>` closing tags with `</list>`
- [ ] Update view record IDs from `_tree` suffix to `_list` suffix
- [ ] Update view names from `.tree` to `.list`

**Find Command:**
```bash
# Find all XML files with <tree> tags
grep -r "<tree" --include="*.xml" .

# Find all view IDs with _tree suffix
grep -r "id=\".*_tree\"" --include="*.xml" .
```

---

### 2. Visibility Syntax: `attrs=` → Simplified Attributes (MANDATORY)

**Status:** ❌ BREAKING CHANGE - Old syntax deprecated, may cause errors

**Odoo 17/18 (Deprecated):**
```xml
<button name="action_confirm" type="object"
        string="Confirm"
        attrs="{'invisible': [('state', '!=', 'draft')]}"/>

<field name="partner_id"
       attrs="{'required': [('state', '=', 'confirmed')],
               'readonly': [('state', 'in', ('done', 'cancelled'))]}"/>
```

**Odoo 19 (Required):**
```xml
<button name="action_confirm" type="object"
        string="Confirm"
        invisible="state != 'draft'"/>

<field name="partner_id"
       required="state == 'confirmed'"
       readonly="state in ('done', 'cancelled')"/>
```

**Syntax Conversion Table:**

| Odoo 17/18 | Odoo 19 |
|------------|---------|
| `attrs="{'invisible': [('field', '=', value)]}"` | `invisible="field == value"` |
| `attrs="{'invisible': [('field', '!=', value)]}"` | `invisible="field != value"` |
| `attrs="{'invisible': [('field', 'in', (a, b))]}"` | `invisible="field in (a, b)"` |
| `attrs="{'invisible': [('field', 'not in', (a, b))]}"` | `invisible="field not in (a, b)"` |
| `attrs="{'required': [('field', '=', True)]}"` | `required="field"` |
| `attrs="{'readonly': [('field', '=', True)]}"` | `readonly="field"` |

**Complex Conditions:**
```xml
<!-- Odoo 17/18 -->
<field name="field1"
       attrs="{'invisible': ['|', ('state', '=', 'draft'), ('type', '=', 'internal')]}"/>

<!-- Odoo 19 -->
<field name="field1"
       invisible="state == 'draft' or type == 'internal'"/>
```

**Migration Checklist:**
- [ ] Replace all `attrs="{'invisible': ...}"` with `invisible="..."`
- [ ] Replace all `attrs="{'required': ...}"` with `required="..."`
- [ ] Replace all `attrs="{'readonly': ...}"` with `readonly="..."`
- [ ] Convert domain syntax to Python-like boolean expressions
- [ ] Test all conditional visibility logic

---

### 3. Filter Syntax: Invalid Shorthand Removed

**Status:** ⚠️ XML PARSING ERROR - Will cause module installation failure

**Odoo 17/18 (Invalid):**
```xml
<filter "Group By" context="{'group_by': 'state'}"/>
```

**Odoo 19 (Required):**
```xml
<filter string="Group By" context="{'group_by': 'state'}"/>
```

**Migration Checklist:**
- [ ] Add `string=` attribute to all `<filter>` tags
- [ ] Ensure `string=` value is descriptive for UI display

---

### 4. Cron Job Fields: `numbercall` Removed

**Status:** ❌ FIELD REMOVED - Will cause database errors if present

**Odoo 17/18 (Has numbercall):**
```xml
<record id="ir_cron_task" model="ir.cron">
    <field name="name">Daily Task</field>
    <field name="model_id" ref="model_my_model"/>
    <field name="state">code</field>
    <field name="code">model._run_task()</field>
    <field name="interval_number">1</field>
    <field name="interval_type">days</field>
    <field name="numbercall">-1</field>  <!-- REMOVED IN ODOO 19 -->
    <field name="doall" eval="False"/>
</record>
```

**Odoo 19 (Field removed):**
```xml
<record id="ir_cron_task" model="ir.cron">
    <field name="name">Daily Task</field>
    <field name="model_id" ref="model_my_model"/>
    <field name="state">code</field>
    <field name="code">model._run_task()</field>
    <field name="interval_number">1</field>
    <field name="interval_type">days</field>
    <!-- numbercall field no longer exists -->
    <field name="doall" eval="False"/>
</record>
```

**Migration Checklist:**
- [ ] Remove all `<field name="numbercall">` entries from cron records
- [ ] Verify cron jobs work correctly without numbercall field

---

## System Requirements

### Python Version

| Odoo Version | Python Requirement |
|--------------|-------------------|
| Odoo 17 | Python 3.10+ |
| Odoo 18 | Python 3.10+ |
| **Odoo 19** | **Python 3.10+** (unchanged) |

**No migration required** - Python version remains the same.

---

### PostgreSQL Version

| Odoo Version | PostgreSQL Requirement |
|--------------|----------------------|
| Odoo 17 | PostgreSQL 12-15 |
| Odoo 18 | PostgreSQL 12-15 |
| **Odoo 19** | **PostgreSQL 12-16** |

**Recommended:** PostgreSQL 14.x or 15.x for optimal performance with Odoo 19.

**Migration Notes:**
- PostgreSQL 16 is now supported and tested
- No breaking changes in database schema
- Standard pg_upgrade process supported

---

### Browser Compatibility

All modern browsers remain supported:
- Chrome/Chromium (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

**No migration required** - Browser support unchanged.

---

## Module Structure Best Practices (Odoo 19)

### File Naming Conventions

**✅ Odoo 19 Best Practice:**
```
my_module/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── product.py              # Descriptive name, NOT my_module_product.py
│   ├── sale_order.py           # Descriptive name
│   └── inventory.py            # Descriptive name
├── views/
│   ├── product_views.xml       # Match model name
│   ├── sale_order_views.xml
│   └── menus.xml
```

**❌ Deprecated Pattern:**
```
my_module/
├── models/
│   ├── my_module_product.py    # Redundant module prefix
│   ├── my_module_sale.py       # Redundant module prefix
```

---

### Frontend Components (Odoo 19)

**✅ Odoo 19 Structure:**
```
static/
└── src/
    └── components/              # Component-based organization
        └── my_component/        # Individual component folder
            ├── my_component.js
            ├── my_component.xml
            └── my_component.scss
```

**❌ Old Structure:**
```
static/
├── js/
│   └── my_component.js
├── xml/
│   └── my_component.xml
└── css/
    └── my_component.css
```

---

## Common Migration Errors

### Error 1: ParseError - Invalid Filter Syntax

**Error Message:**
```
ParseError: Invalid XML while parsing
  <filter "Group By" context="{'group_by': 'state'}"/>
```

**Cause:** Missing `string=` attribute in filter tag

**Fix:**
```xml
<filter string="Group By" context="{'group_by': 'state'}"/>
```

---

### Error 2: Field Does Not Exist - numbercall

**Error Message:**
```
psycopg2.errors.UndefinedColumn: column ir_cron.numbercall does not exist
```

**Cause:** Cron record references removed `numbercall` field

**Fix:** Remove all `<field name="numbercall">` from cron records

---

### Error 3: Module Not Found Despite Correct Structure

**Error Message:**
```
Module 'my_module' not found in addons path
```

**Cause (Common for Nested Modules):**
- Symlink points to wrong directory level (outer directory without `__manifest__.py`)
- Module has nested structure: `outer_dir/inner_dir/__manifest__.py`
- Symlink should point to `inner_dir`, not `outer_dir`

**Fix:**
```bash
# Check current symlink
ls -la /var/odoo/instance/extra-addons/my_module

# If pointing to wrong level, recreate symlink
rm /var/odoo/instance/extra-addons/my_module
ln -s /home/user/projects/my_module/my_module /var/odoo/instance/extra-addons/my_module

# Verify __manifest__.py is accessible
cat /var/odoo/instance/extra-addons/my_module/__manifest__.py
```

**Post-Fix Action:** Update Odoo Apps List via UI (Apps → Update Apps List)

---

### Error 4: View References Non-existent Fields

**Error Message:**
```
ParseError: while parsing /path/to/views/pos_config_views.xml:5
Field 'salon_appointments_enabled' does not exist
```

**Cause:** View XML created before Python model fields

**Fix Options:**
1. **Option A:** Remove view file references from `__manifest__.py` until models are ready
2. **Option B:** Add missing fields to Python model:
```python
# models/pos_config.py
from odoo import models, fields

class PosConfig(models.Model):
    _inherit = 'pos.config'

    salon_appointments_enabled = fields.Boolean(string="Enable Appointments")
    salon_recommendations_enabled = fields.Boolean(string="Enable Recommendations")
```

---

## Migration Automation Scripts

### Script 1: Convert `<tree>` to `<list>` Tags

```bash
#!/bin/bash
# convert_tree_to_list.sh - Convert all tree tags to list tags

find . -name "*.xml" -type f -exec sed -i 's/<tree\(.*\)>/<list\1>/g' {} \;
find . -name "*.xml" -type f -exec sed -i 's/<\/tree>/<\/list>/g' {} \;

echo "✓ Converted all <tree> tags to <list> tags"
```

### Script 2: Validate Odoo 19 XML Files

```python
#!/usr/bin/env python3
"""
validate_odoo19_xml.py - Check for Odoo 19 incompatibilities
"""
import os
import re
import xml.etree.ElementTree as ET

errors = []
warnings = []

def check_xml_file(filepath):
    """Check single XML file for Odoo 19 issues"""
    with open(filepath, 'r') as f:
        content = f.read()

    # Check for <tree> tags
    if re.search(r'<tree[\s>]', content):
        errors.append(f"{filepath}: Contains deprecated <tree> tag (use <list>)")

    # Check for attrs= syntax
    if re.search(r'attrs=', content):
        warnings.append(f"{filepath}: Contains deprecated attrs= syntax")

    # Check for invalid filter syntax
    if re.search(r'<filter\s+"[^"]*"', content):
        errors.append(f"{filepath}: Invalid filter syntax (missing string= attribute)")

    # Check for numbercall in cron
    if 'ir.cron' in content and 'numbercall' in content:
        errors.append(f"{filepath}: Contains removed field 'numbercall' in cron job")

# Scan all XML files
for root, dirs, files in os.walk('.'):
    for file in files:
        if file.endswith('.xml'):
            filepath = os.path.join(root, file)
            check_xml_file(filepath)

# Report results
if errors:
    print("❌ ERRORS (Must Fix):")
    for error in errors:
        print(f"  - {error}")

if warnings:
    print("\n⚠️ WARNINGS (Should Fix):")
    for warning in warnings:
        print(f"  - {warning}")

if not errors and not warnings:
    print("✅ All XML files are Odoo 19 compatible!")

exit(1 if errors else 0)
```

---

## Testing Checklist

### Pre-Migration Testing
- [ ] Backup database and codebase
- [ ] Document current module versions and states
- [ ] Create test environment with Odoo 19
- [ ] Install modules in test environment
- [ ] Document all errors encountered

### Migration Validation
- [ ] All XML files pass validation (no `<tree>`, no invalid `attrs=`, no `numbercall`)
- [ ] All view files use `<list>` tags instead of `<tree>`
- [ ] All conditional visibility uses simplified syntax (no `attrs=`)
- [ ] All filter tags have `string=` attribute
- [ ] All cron jobs have `numbercall` field removed
- [ ] Module installs successfully in Odoo 19
- [ ] All views render correctly
- [ ] All workflows function as expected
- [ ] All reports generate correctly

### Post-Migration Testing
- [ ] Full regression test suite passes
- [ ] User acceptance testing completed
- [ ] Performance benchmarks meet expectations
- [ ] No console errors in browser
- [ ] No Python exceptions in Odoo logs

---

## Support Resources

### Official Documentation
- Odoo 19 Release Notes: https://www.odoo.com/odoo-19
- Odoo Developer Documentation: https://www.odoo.com/documentation/19.0/developer.html
- Odoo Community Forum: https://www.odoo.com/forum

### PDC Standard References
- `odoo-design-template.md` - Updated Odoo 19 view examples
- `odoo-tasks-template.md` - Odoo 19 task patterns
- `odoo-requirements-template.md` - Odoo 19 technical constraints

---

## Quick Reference Card

### Deprecated → Required Changes

| Category | Odoo 17/18 | Odoo 19 |
|----------|-----------|---------|
| **List View Tag** | `<tree>` | `<list>` ✅ |
| **View ID Suffix** | `view_model_tree` | `view_model_list` ✅ |
| **Invisible Attr** | `attrs="{'invisible': [...]}"` | `invisible="..."` ✅ |
| **Required Attr** | `attrs="{'required': [...]}"` | `required="..."` ✅ |
| **Readonly Attr** | `attrs="{'readonly': [...]}"` | `readonly="..."` ✅ |
| **Filter String** | `<filter "Text">` | `<filter string="Text">` ✅ |
| **Cron Numbercall** | `<field name="numbercall">` | ❌ Remove completely |

---

**Document Version:** 1.0
**Last Updated:** 2026-01-06
**Maintained By:** PDC Development Team
**Status:** Official Migration Guide
