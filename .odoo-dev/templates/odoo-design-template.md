# Technical Design: {{MODULE_NAME}}

## Document Information
- **Module**: {{module_technical_name}}
- **Version**: 19.0.1.0.0
- **Odoo Version**: 19.0
- **Python Version**: 3.12+
- **Created**: {{date}}

---

## 1. Architecture Overview

### 1.1 High-Level Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                            │
│  OWL Components │ QWeb Templates │ POS Screens                  │
├─────────────────────────────────────────────────────────────────┤
│                    BUSINESS LOGIC LAYER                          │
│  Python Models │ Services │ Controllers                         │
├─────────────────────────────────────────────────────────────────┤
│                    DATA LAYER                                    │
│  PostgreSQL │ IndexedDB (offline) │ Redis (sessions)            │
├─────────────────────────────────────────────────────────────────┤
│                    INTEGRATION LAYER                             │
│  Hardware │ Payment Terminals │ External APIs                   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Module Structure
```
{{module_technical_name}}/
├── __init__.py
├── __manifest__.py
├── controllers/
│   ├── __init__.py
│   └── main.py
├── data/
│   └── data.xml
├── models/
│   ├── __init__.py
│   └── [model files]
├── reports/
├── security/
│   ├── ir.model.access.csv
│   └── security.xml
├── static/src/
│   ├── js/
│   ├── xml/
│   └── scss/
├── views/
│   └── [view files]
├── wizard/
└── tests/
    ├── __init__.py
    └── [test files]
```

---

## 2. Data Models

### 2.1 Model: {{module}}.main
**Purpose**: [Primary model description]

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | Char(128) | Yes | Display name |
| active | Boolean | No | Archive flag (default: True) |
| company_id | Many2one | Yes | Company reference |
| sequence | Integer | No | Ordering sequence |

**Computed Fields**:
| Field | Depends | Description |
|-------|---------|-------------|
| display_name | name | Formatted display |

**Constraints**:
- `_sql_constraints`: unique name per company
- `@api.constrains`: validation rules

**Methods**:
| Method | Purpose | Returns |
|--------|---------|---------|
| action_confirm() | Confirm record | Action dict |
| compute_totals() | Calculate totals | None |

### 2.2 Model: {{module}}.line
**Purpose**: [Line item model]

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| parent_id | Many2one | Yes | Parent reference |
| product_id | Many2one | Yes | Product reference |
| quantity | Float | Yes | Item quantity |
| price_unit | Float | Yes | Unit price |

---

## 3. Views

### 3.1 Form View
**XML ID**: `{{module}}_view_form`
```xml
<form>
    <header>
        <button name="action_confirm" type="object" string="Confirm"/>
        <field name="state" widget="statusbar"/>
    </header>
    <sheet>
        <group>
            <group>
                <field name="name"/>
                <field name="company_id"/>
            </group>
            <group>
                <field name="date"/>
                <field name="user_id"/>
            </group>
        </group>
        <notebook>
            <page string="Lines">
                <field name="line_ids">
                    <tree editable="bottom">
                        <field name="product_id"/>
                        <field name="quantity"/>
                        <field name="price_unit"/>
                    </tree>
                </field>
            </page>
        </notebook>
    </sheet>
</form>
```

### 3.2 List View
**XML ID**: `{{module}}_view_tree`

### 3.3 Search View
**XML ID**: `{{module}}_view_search`

### 3.4 Kanban View (if applicable)
**XML ID**: `{{module}}_view_kanban`

---

## 4. Security

### 4.1 Groups
| Group | XML ID | Parent | Purpose |
|-------|--------|--------|---------|
| User | {{module}}.group_user | base.group_user | Basic access |
| Manager | {{module}}.group_manager | {{module}}.group_user | Full access |

### 4.2 Access Rights (ir.model.access.csv)
```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_{{module}}_user,{{module}}.main user,model_{{module}}_main,{{module}}.group_user,1,1,1,0
access_{{module}}_manager,{{module}}.main manager,model_{{module}}_main,{{module}}.group_manager,1,1,1,1
```

### 4.3 Record Rules
| Rule | Domain | Groups |
|------|--------|--------|
| Company rule | `[('company_id','=',company_id)]` | All users |
| Own records | `[('user_id','=',user.id)]` | Users only |

---

## 5. OWL Components (POS)

### 5.1 Component: {{ModuleName}}Screen
**Template**: `{{module}}.{{ModuleName}}Screen`
**Registry**: `pos_screens`

```javascript
/** @odoo-module */
import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";

export class {{ModuleName}}Screen extends Component {
    static template = "{{module}}.{{ModuleName}}Screen";

    setup() {
        this.state = useState({
            isLoading: false,
            data: [],
        });
    }

    async onClickAction() {
        // Implementation
    }
}

registry.category("pos_screens").add("{{ModuleName}}Screen", {{ModuleName}}Screen);
```

### 5.2 Component: {{ModuleName}}Button
**Template**: `{{module}}.{{ModuleName}}Button`
**Registry**: `pos_product_action_buttons`

---

## 6. API Endpoints (Controllers)

### 6.1 REST Endpoints
| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | /api/{{module}}/list | user | List records |
| POST | /api/{{module}}/create | user | Create record |
| PUT | /api/{{module}}/<id> | user | Update record |
| DELETE | /api/{{module}}/<id> | manager | Delete record |

### 6.2 RPC Methods
| Model | Method | Parameters | Returns |
|-------|--------|------------|---------|
| {{module}}.main | get_dashboard_data | {} | dict |
| {{module}}.main | process_action | {'ids': list} | bool |

---

## 7. Hardware Integration

### 7.1 Printer Integration
- Protocol: ESC/POS
- Connection: Network (port 9100)
- Commands: INIT, CUT, BOLD, CENTER, DRAWER

### 7.2 Payment Terminal
- Pax: REST API on port 10009
- SoundPayment: WebSocket
- Timeout: 120 seconds

---

## 8. Offline Support

### 8.1 IndexedDB Schema
```javascript
const schema = {
    {{module}}_records: {
        keyPath: 'local_id',
        indexes: ['id', 'sync_status', 'created_at']
    }
};
```

### 8.2 Sync Strategy
1. Save locally first
2. Queue for sync
3. Retry on failure
4. Resolve conflicts

---

## 9. Testing Strategy

### 9.1 Unit Tests
- Model CRUD operations
- Computed field calculations
- Constraint validations

### 9.2 Integration Tests
- Controller endpoints
- Multi-model workflows
- Security rules

### 9.3 E2E Tests (Playwright)
- User workflows
- Hardware mocking
- Offline scenarios

---

## 10. Performance Considerations

- Prefetch related records in lists
- Use `read_group` for aggregations
- Cache expensive computations with `@ormcache`
- Batch operations in chunks of 1000

---

## Appendix: Manifest

```python
{
    'name': '{{Module Display Name}}',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': '{{Brief description}}',
    'depends': ['point_of_sale', 'stock'],
    'data': [
        'security/security.xml',
        'security/ir.model.access.csv',
        'views/menu_views.xml',
        'data/data.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            '{{module}}/static/src/**/*',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
```
