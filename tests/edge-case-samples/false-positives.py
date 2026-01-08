# Edge Case: False Positive Tests - Python
# These contain patterns but should be evaluated for false positives

# ============================================================================
# TEST 1: Patterns in Comments (KNOWN FALSE POSITIVE)
# ============================================================================

# OLD PATTERN (deprecated): from odoo.osv import osv
# This is just documentation in a comment
# See: https://docs.odoo.com/from_odoo_osv_import

# @api.multi decorator is deprecated in Odoo 19
# Use plain method instead (no decorator needed)

# Direct access to private attributes is bad:
# - self._cr should become self.env.cr
# - self._uid should become self.env.uid
# - self._context should become self.env.context

# ============================================================================
# TEST 2: Patterns in String Documentation (KNOWN FALSE POSITIVE)
# ============================================================================

MIGRATION_GUIDE = """
ODOO 19 MIGRATION CHECKLIST
============================

OLD CODE (Don't use these):
  - from odoo.osv import osv
  - @api.multi decorator
  - self.pool.get('model.name')
  - self.read_group(...)
  - self.search_fetch(...)

NEW CODE (Use these):
  - from odoo import models, fields, api
  - Plain def method(self): (no decorator)
  - self.env['model.name']
  - self.env['model.name']._read_group(...)
  - self.env['model.name']._search(...)
"""

# ============================================================================
# TEST 3: Patterns in Docstrings (KNOWN FALSE POSITIVE)
# ============================================================================

def example_method(self):
    """
    Example of OLD vs NEW patterns.

    OLD (deprecated):
        @api.multi
        def compute_total(self):
            self.total = self._cr.execute("SELECT SUM(amount) ...")

    NEW (Odoo 19 compliant):
        def compute_total(self):
            self.total = self.env.cr.execute("SELECT SUM(amount) ...")
    """
    pass

# ============================================================================
# TEST 4: Patterns in Error Messages (KNOWN FALSE POSITIVE)
# ============================================================================

class ModelValidator:
    def validate_imports(self):
        if 'from odoo.osv import' in self.file_content:
            raise ValueError("Legacy OSV import detected!")

        if '@api.multi' in self.decorators:
            raise ValueError("@api.multi decorator is deprecated")

        if 'self._cr' in self.code:
            raise DeprecationWarning("Direct _cr access should use self.env.cr")

# ============================================================================
# TEST 5: Patterns in Changelog (KNOWN FALSE POSITIVE)
# ============================================================================

CHANGELOG = """
## Version 1.0.0 (2026-01-08)
- BREAKING: Removed support for from odoo.osv import usage
- BREAKING: Removed @api.multi and @api.one decorators
- CHANGED: Updated all self.pool.get() calls to use self.env[]
- CHANGED: Migrated read_group() to _read_group()
- CHANGED: Replaced search_fetch() with _search() + browse()

## Version 0.9.0 (2025-01-01)
- DEPRECATED: @api.multi will be removed in v1.0
- DEPRECATED: from odoo.osv import will be removed in v1.0
"""

# ============================================================================
# TEST 6: Patterns in URL Comments (KNOWN FALSE POSITIVE)
# ============================================================================

# See documentation at:
# https://docs.odoo.com/path/from/odoo/osv/import
# https://docs.odoo.com/api/self._cr/access
# https://docs.odoo.com/deprecated/@api.multi

DOCS_LINK = "https://docs.odoo.com/?search=@api.multi+deprecated"

# ============================================================================
# TEST 7: Valid Code (Should be IGNORED)
# ============================================================================

from odoo import models, fields, api

class GroceryProduct(models.Model):
    _name = 'grocery.product'
    _description = 'Grocery Product'

    name = fields.Char('Product Name')
    price = fields.Float('Price')

    def compute_total(self):
        """Valid Odoo 19 code - no violations"""
        total = self.env.cr.execute(
            "SELECT SUM(amount) FROM sale_order WHERE state='done'"
        )
        return total

# ============================================================================
# TEST 8: Pattern in Variable Names (EDGE CASE)
# ============================================================================

# Variable names that CONTAIN patterns but aren't violations
from_odoo_osv_import_deprecated = True  # Variable NAME contains pattern
api_multi_handler_function = lambda x: x  # Variable NAME contains pattern
self_cr_cache = {}  # Variable NAME contains pattern

# ============================================================================
# TEST 9: Multi-line Pattern Variations (TEST VARIATIONS)
# ============================================================================

# Pattern with newline after method name
result1 = self.pool.get(
    'model.name'
)

# Pattern with extra spaces
result2 = self  .  pool  .  get('model.name')

# Pattern with tabs
result3 = self	.	pool	.	get('model.name')
