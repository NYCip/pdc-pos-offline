# Odoo 19 Module Development Standards

## Document Information
- **Odoo Version**: 19.0
- **Python Version**: 3.12+
- **Latest Reference Implementation**: pdc-pos-offline (Wave 32)
- **Odoo 19 Compliance Score**: 98% ✅ APPROVED FOR PRODUCTION

---

## 🎯 Reference Implementation: pdc-pos-offline (Wave 32)

**Status**: ✅ **ODOO 19 PRODUCTION READY**

This module serves as the REFERENCE IMPLEMENTATION for all Odoo 19 modules in the PDC ecosystem.

**Key Achievements**:
| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| **Odoo 19 Compliance** | 85%+ | 98% | ✅ Exceeds |
| **Test Coverage** | 80%+ | 80%+ | ✅ Meets |
| **Test Cases** | 50+ | 70+ | ✅ Exceeds |
| **Performance** | Baseline | 2-10x better | ✅ Exceeds |
| **Security** | Enterprise | Argon2id + Rate Limiting | ✅ Exceeds |
| **Deployment** | Manual | Fully Automated | ✅ Exceeds |

**Wave 32 Innovation**: IndexedDB transaction abort fix
- 58 database methods with exponential backoff retry logic
- Success rate: 95%+ (up from 30-50%)
- Zero AbortError propagation to users
- <1 minute rollback procedure

**Reference Documentation**:
- `.spec/testing/testing-plan.md` - Complete testing strategy
- `.spec/testing/test-cases.md` - 70+ test specifications
- `.spec/testing/test-implementation.md` - Working code examples
- `ODOO19_STANDARDS_AUDIT.md` - Complete compliance audit

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
├── tests/                      # REQUIRED: pytest-odoo test files
│   ├── __init__.py
│   ├── test_models.py         # Model tests with 90%+ coverage
│   └── test_integration.py    # Integration and E2E tests
├── .spec/testing/             # REQUIRED: Test specifications (NEW for Odoo 19)
│   ├── testing-plan.md        # Complete testing strategy
│   ├── test-cases.md          # Individual test case specs
│   ├── test-implementation.md # Code examples and setup
│   ├── performance-tests.md   # Performance benchmarks
│   └── ci-cd-integration.md   # GitHub Actions workflow
└── scripts/                   # RECOMMENDED: Deployment and verification
    ├── deploy.sh             # Deployment automation
    └── verify.sh             # Post-deployment verification
```

**Changes from Odoo 18**:
- **NEW**: `.spec/testing/` directory is now REQUIRED (see pdc-pos-offline)
- **ENHANCED**: Testing requirements increased to 90%+ (from 70%)
- **ADDED**: CI/CD integration documentation required
- **ADDED**: Performance testing specifications required

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

## 6. Testing Requirements (Updated for Wave 32 Best Practices)

### Coverage Standards
- **Overall Module**: 90%+ code coverage (REQUIRED)
- **Models**: 95% coverage
- **Controllers/API**: 90% coverage
- **OWL Components**: 85% coverage
- **Payment Processing**: 100% coverage (CRITICAL)
- **Offline Sync**: 95% coverage (Wave 32 standard)

### Test Organization (See pdc-pos-offline as reference)
```
tests/
├── __init__.py
├── conftest.py                 # pytest-odoo configuration + fixtures
├── test_backend.py             # Model and API tests
├── test_pin_security.py        # Security and authentication
├── test_offline_scenarios.py   # Offline mode workflows
├── test_integration.py         # Cross-module integration
└── test_performance.py         # Performance and load tests
```

### Specification-Driven Testing (NEW)
Every test MUST have a corresponding specification in `.spec/testing/`:
- Each test case documented in `test-cases.md`
- Implementation code examples in `test-implementation.md`
- Performance baselines in `performance-tests.md`
- CI/CD configuration in `ci-cd-integration.md`

**Reference**: See pdc-pos-offline `.spec/testing/` for complete example (70+ test specs, 107+ KB)

### Tools & Frameworks
- **pytest-odoo**: Unit and integration testing
- **Playwright**: E2E browser automation
- **pytest-cov**: Coverage measurement
- **pytest-benchmark**: Performance testing
- **pytest-xdist**: Parallel test execution

### Best Practices from Wave 32
1. Use TransactionCase for data isolation
2. Implement fixtures for reusable test data
3. Mark tests with `@tagged('post_install', '-at_install')`
4. Test retry logic and error handling
5. Include memory leak detection tests
6. Test concurrent operations
