# Odoo Module Development Standards

## Document Information
- **Odoo Version**: 19.0
- **Python Version**: 3.12+

---

## 1. Module Structure

```
your_module/
├── __init__.py
├── __manifest__.py
├── controllers/
├── data/
├── models/
├── reports/
├── security/
│   ├── ir.model.access.csv
│   └── security_rules.xml
├── static/src/{js,xml,scss}/
├── views/
├── wizard/
└── tests/
```

---

## 2. Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Module Name | snake_case | pdc_rms |
| Model Name | dot.separated | pdc.rms.order |
| Python File | snake_case.py | order.py |
| XML ID | module.type_name | pdc_rms.view_order_form |
| Class Name | PascalCase | PdcRmsOrder |

---

## 3. Manifest Template

```python
{
    'name': 'Module Name',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Brief description',
    'depends': ['point_of_sale', 'stock'],
    'data': [
        'security/ir.model.access.csv',
        'views/menu_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'module_name/static/src/**/*',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
```

---

## 4. Model Inheritance

### Classical (extend existing)
```python
class ResPartner(models.Model):
    _inherit = 'res.partner'
    loyalty_points = fields.Integer()
```

### Prototype (new based on existing)
```python
class LoyaltyPartner(models.Model):
    _name = 'loyalty.partner'
    _inherit = 'res.partner'
```

### Delegation (composition)
```python
class LoyaltyMember(models.Model):
    _name = 'loyalty.member'
    _inherits = {'res.partner': 'partner_id'}
```

---

## 5. Version Numbering

```
ODOO_VERSION.MAJOR.MINOR.PATCH
Example: 19.0.1.0.0
```

---

## 6. Testing Requirements

- pytest-odoo for unit tests
- Playwright for E2E tests
- 90%+ coverage required
- All payment flows: 100% coverage
