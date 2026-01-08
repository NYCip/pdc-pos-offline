# Odoo 19 Migration Checklist

> **Purpose**: Systematic migration guide from legacy Odoo patterns to Odoo 19 standards.
> Use this checklist when refactoring existing modules to enforce Odoo 19 compliance.

---

## Pre-Migration Assessment

- [ ] Document current Odoo version (O14-O18)
- [ ] Identify all deprecated patterns in codebase (use `./scripts/odoo19_check.sh`)
- [ ] Estimate effort and timeline
- [ ] Plan rollback strategy
- [ ] Schedule testing phases
- [ ] Notify team of migration scope

---

## Phase 1: Python ORM Migration

### 1.1 Import Statements

- [ ] **Audit**: Find all `from odoo.osv import ...` statements
  ```bash
  rg "from odoo\.osv\b" --type py
  ```

- [ ] **Replace**: Update to modern imports
  ```python
  # ❌ OLD
  from odoo.osv import fields, osv

  # ✅ NEW
  from odoo import models, fields, api
  from odoo.exceptions import UserError, ValidationError
  ```

- [ ] **Remove**: Delete old openerp imports
  ```bash
  rg "from openerp\b" --type py
  ```

### 1.2 Environment Access

- [ ] **Audit**: Find all direct environment attribute access
  ```bash
  rg "\._cr\b|\._uid\b|\._context\b" --type py
  ```

- [ ] **Replace**: Use environment proxy
  ```python
  # ❌ OLD
  cr = self._cr
  uid = self._uid
  ctx = self._context

  # ✅ NEW
  cr = self.env.cr
  uid = self.env.uid
  ctx = self.env.context
  ```

- [ ] **Test**: Verify all ORM operations still work

### 1.3 Deprecated Decorators

- [ ] **Audit**: Find @api.multi and @api.one
  ```bash
  rg "@api\.multi\b|@api\.one\b" --type py
  ```

- [ ] **Replace**: Remove decorators and iterate in method
  ```python
  # ❌ OLD
  @api.multi
  def process_records(self):
      for record in self:
          record.do_something()

  # ✅ NEW
  def process_records(self):
      for record in self:
          record.do_something()
  ```

- [ ] **Test**: Ensure batch operations work correctly

### 1.4 Deprecated ORM Methods

- [ ] **Audit**: Find read_group() calls
  ```bash
  rg "\bread_group\s*\(" --type py
  ```

- [ ] **Replace**: Use _read_group() or formatted_read_group()
  ```python
  # ❌ OLD
  result = self.env['model'].read_group(
      domain,
      fields=['amount'],
      groupby=['category_id']
  )

  # ✅ NEW
  result = self.env['model']._read_group(
      domain=[('field', '=', value)],
      groupby=['category_id'],
      aggregates=['amount:sum']
  )
  ```

- [ ] **Audit**: Find search_fetch() calls
  ```bash
  rg "\bsearch_fetch\s*\(" --type py
  ```

- [ ] **Replace**: Use _search() + browse()
  ```python
  # ❌ OLD
  records = self.env['model'].search_fetch(domain, fields)

  # ✅ NEW
  ids = self.env['model']._search(domain)
  records = self.env['model'].browse(ids)
  ```

### 1.5 Legacy Pool Access

- [ ] **Audit**: Find self.pool references
  ```bash
  rg "\.pool\.get\s*\(|\.pool\s*\[" --type py
  ```

- [ ] **Replace**: Use self.env access
  ```python
  # ❌ OLD
  partner_obj = self.pool.get('res.partner')
  account = self.pool['account.move']

  # ✅ NEW
  partner_obj = self.env['res.partner']
  account = self.env['account.move']
  ```

---

## Phase 2: JavaScript/OWL Migration

### 2.1 Module Definition

- [ ] **Audit**: Find odoo.define() calls
  ```bash
  rg "odoo\.define\s*\(" --type js
  ```

- [ ] **Convert**: Use ES modules with @odoo-module header
  ```javascript
  // ❌ OLD
  odoo.define('my_module.MyWidget', function (require) {
      var Widget = require('web.Widget');
      var MyWidget = Widget.extend({
          events: { 'click': 'onClick' }
      });
      return MyWidget;
  });

  // ✅ NEW
  /** @odoo-module */
  import { Component } from "@odoo/owl";

  export class MyWidget extends Component {
      static template = "my_module.MyWidget";
      onClick() { }
  }
  ```

### 2.2 Imports & Dependencies

- [ ] **Audit**: Find legacy require() patterns
  ```bash
  rg "require\s*\(['\"]web\.|require\s*\(['\"]point_of_sale\." --type js
  ```

- [ ] **Replace**: Use modern ES imports
  ```javascript
  // ❌ OLD
  var Widget = require('web.Widget');
  var utils = require('web.utils');
  var PosBaseWidget = require('point_of_sale.BaseWidget');

  // ✅ NEW
  import { Component } from "@odoo/owl";
  import { registry } from "@web/core/registry";
  import { useService } from "@web/core/utils/hooks";
  ```

### 2.3 Class Extension

- [ ] **Audit**: Find .extend() patterns
  ```bash
  rg "\.extend\s*\(\{" --type js
  ```

- [ ] **Replace**: Use class inheritance or patch()
  ```javascript
  // ❌ OLD
  var MyClass = BaseClass.extend({
      init: function() { },
      method: function() { }
  });

  // ✅ NEW
  import { patch } from "@web/core/utils/patch";

  patch(BaseClass.prototype, {
      init() { },
      method() { }
  });
  ```

### 2.4 Event Handling

- [ ] **Audit**: Find jQuery event binding
  ```bash
  rg "\$\([^)]+\)\.(on|click)\s*\(" --type js
  ```

- [ ] **Replace**: Use OWL event handlers
  ```xml
  <!-- ❌ OLD (requires jQuery) -->
  <div id="my-element">Click me</div>

  <script>
  $('my-element').on('click', function() { });
  </script>

  <!-- ✅ NEW (OWL) -->
  <div t-on-click.prevent="onClick">Click me</div>
  ```

### 2.5 Action Registry

- [ ] **Audit**: Find legacy action registry usage
  ```bash
  rg "core\.action_registry" --type js
  ```

- [ ] **Replace**: Use new registry
  ```javascript
  // ❌ OLD
  core.action_registry.add('my_action', MyAction);

  // ✅ NEW
  import { registry } from "@web/core/registry";
  registry.category("actions").add("my_action", MyAction);
  ```

---

## Phase 3: XML & View Migration

### 3.1 XPath Expressions

- [ ] **Audit**: Find hasclass() in XPath
  ```bash
  rg "hasclass\s*\(" --type xml
  ```

- [ ] **Replace**: Use contains() for class matching
  ```xml
  <!-- ❌ OLD (removed in Odoo 19) -->
  <xpath expr="//div[hasclass('o_form_sheet')]" position="inside">

  <!-- ✅ NEW -->
  <xpath expr="//div[contains(@class, 'o_form_sheet')]" position="inside">
  ```

### 3.2 Action Windows

- [ ] **Audit**: Find deprecated <act_window> shortcuts
  ```bash
  rg "<act_window\s" --type xml
  ```

- [ ] **Replace**: Use explicit action records
  ```xml
  <!-- ❌ OLD -->
  <act_window name="Orders"
              res_model="sale.order"
              view_mode="tree,form"/>

  <!-- ✅ NEW -->
  <record id="action_sale_orders" model="ir.actions.act_window">
      <field name="name">Orders</field>
      <field name="res_model">sale.order</field>
      <field name="view_mode">tree,form</field>
  </record>
  ```

### 3.3 Manifest Assets

- [ ] **Audit**: Check __manifest__.py asset configuration
  ```bash
  grep -n "assets" __manifest__.py
  ```

- [ ] **Update**: Use Odoo 19 asset bundles
  ```python
  # ❌ OLD
  {
      'js': ['static/src/js/**/*.js'],
      'css': ['static/src/css/**/*.css']
  }

  # ✅ NEW
  {
      'assets': {
          'point_of_sale._assets_pos': [
              'my_module/static/src/js/**/*.js',
              'my_module/static/src/scss/**/*.scss'
          ],
          'web.assets_backend': [
              'my_module/static/src/backend/**/*'
          ]
      }
  }
  ```

---

## Phase 4: Manifest & Metadata

- [ ] **Update**: Version to 19.0.x.x.x format
  ```python
  'version': '19.0.1.0.0',  # Odoo 19
  ```

- [ ] **Review**: Check all dependencies
  - [ ] Remove references to deprecated modules
  - [ ] Add modern module dependencies
  - [ ] Update depends list

- [ ] **Verify**: Required manifest fields
  - [ ] `name` - Module display name
  - [ ] `version` - Semantic versioning
  - [ ] `category` - Module category
  - [ ] `depends` - Module dependencies
  - [ ] `data` - Data files
  - [ ] `assets` - Asset bundles (not `js`/`css`)
  - [ ] `installable` - True for production
  - [ ] `license` - LGPL-3 or compatible

---

## Phase 5: Testing & Validation

### 5.1 Unit Tests

- [ ] Create/update test files
  ```python
  # tests/test_module.py
  from odoo.tests import TransactionCase

  class TestMyModule(TransactionCase):
      def setUp(self):
          super().setUp()
          self.model = self.env['my.model']

      def test_something(self):
          # Modern test pattern
          pass
  ```

- [ ] Run tests
  ```bash
  pytest tests/ -v --cov=. --cov-report=html
  ```

- [ ] Achieve 80%+ code coverage

### 5.2 Compliance Check

- [ ] **Run** compliance scan
  ```bash
  ./scripts/odoo19_check.sh /path/to/module --strict
  ```

- [ ] **Verify**: Zero violations
  ```
  Odoo 19 Compliance: PASS
  - Scanned: X files
  - Violations: 0
  ```

- [ ] **Review**: Spot-check manual fixes

### 5.3 Integration Tests

- [ ] Test in actual Odoo 19 environment
- [ ] Verify data migrations (if needed)
- [ ] Test cross-module interactions
- [ ] Check console logs for deprecation warnings

### 5.4 Performance Validation

- [ ] Benchmark key operations
- [ ] Compare before/after performance
- [ ] Document any performance changes
- [ ] Optimize hot paths if needed

---

## Phase 6: Code Review & Merge

### 6.1 Pre-PR Checklist

- [ ] All compliance checks pass
- [ ] Test coverage ≥80%
- [ ] No deprecation warnings
- [ ] Code follows Odoo 19 style guide
- [ ] Documentation updated

### 6.2 Commit Messages

```
refactor: migrate module to Odoo 19 standards

- Update Python imports to modern style
- Convert JavaScript to ES modules + OWL
- Update manifest asset configuration
- Fix XPath expressions (hasclass → contains)
- Add Odoo 19 compliance tests

Fixes: Odoo 19 compatibility
Tests: 40+ tests passing, 95% coverage
Compliance: ./scripts/odoo19_check.sh --strict PASS
```

### 6.3 PR Review Gate

- [ ] Compliance check passes (`--strict` mode)
- [ ] All tests pass
- [ ] Code review approved
- [ ] No regressions in QA testing
- [ ] Performance baseline maintained

---

## Phase 7: Deployment & Monitoring

### 7.1 Pre-Deployment

- [ ] Database backup created
- [ ] Rollback procedure documented
- [ ] Release notes prepared
- [ ] Support team briefed
- [ ] Monitoring alerts configured

### 7.2 Deployment

- [ ] Update module version
- [ ] Run database migrations (if needed)
- [ ] Restart Odoo services
- [ ] Verify module loads
- [ ] Run smoke tests

### 7.3 Post-Deployment

- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] Verify user workflows
- [ ] Collect feedback
- [ ] Document any issues

---

## Rollback Plan

If deployment fails:

1. **Immediate**:
   - Revert to previous module version
   - Clear browser cache
   - Restart Odoo services

2. **Investigation**:
   - Check error logs
   - Review compliance violations
   - Identify root cause

3. **Resolution**:
   - Fix specific issue
   - Run compliance check
   - Test in staging environment
   - Redeploy

---

## Success Criteria

✅ **All phases complete when**:

- [ ] Zero Odoo 19 compliance violations (`./scripts/odoo19_check.sh --strict` passes)
- [ ] All unit and integration tests pass (80%+ coverage)
- [ ] No deprecation warnings in Odoo logs
- [ ] Code review approved
- [ ] Performance baseline maintained
- [ ] Documentation updated
- [ ] Deployment successful
- [ ] No production issues after 24 hours

---

## Common Issues & Solutions

### Issue: read_group() not found

**Solution**:
```python
# Check if you're using the right method signature
result = self.env['model']._read_group(
    domain=[],
    groupby=['field'],
    aggregates=['amount:sum', 'qty:count']
)
# Note: aggregates format is different in Odoo 19
```

### Issue: XPath expressions fail

**Cause**: `hasclass()` was removed in Odoo 19

**Solution**:
```xml
<!-- Before -->
<xpath expr="//button[hasclass('btn-primary')]" position="after">

<!-- After -->
<xpath expr="//button[contains(@class, 'btn-primary')]" position="after">
```

### Issue: JavaScript module not found

**Cause**: Legacy odoo.define or require() pattern

**Solution**:
```javascript
// Check asset bundle is configured in manifest
'assets': {
    'point_of_sale._assets_pos': ['my_module/static/src/js/**/*.js']
}

// Use modern imports
import { Component } from "@odoo/owl";
```

---

## References

- [Odoo 19 Compliance Contract](./ odoo19-compliance-contract.md)
- [Odoo 19 API Documentation](https://docs.odoo.com)
- [OWL Components Guide](https://owl.odoo.com)
- [Odoo 19 Upgrade Guide](https://docs.odoo.com/19.0/upgrade.html)

---

**Version**: 1.0.0
**Last Updated**: 2026-01-08
**Maintainer**: Odoo 19 Compliance Team
