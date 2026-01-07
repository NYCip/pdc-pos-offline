# Odoo Spec Create - Create Module Specification

## Purpose
Initialize a new Odoo module specification with all required documents following the spec-workflow pattern.

## Usage
```
/odoo-spec-create <module-name> [description]
```

---

## Implementation

### Step 1: Create Module Directory Structure
```bash
mkdir -p custom_addons/<module-name>/.spec
```

### Step 2: Generate Specification Documents

Create the following in `custom_addons/<module-name>/.spec/`:

#### requirements.md
```markdown
# Requirements: <Module Name>

## Overview
[Module description and business purpose]

## Functional Requirements
### FR-001: [Requirement Name]
- **Priority**: High/Medium/Low
- **Description**: [What the system must do]
- **Acceptance Criteria**:
  - [ ] Criterion 1
  - [ ] Criterion 2

## Non-Functional Requirements
### NFR-001: Performance
- Response time < 200ms for POS operations
- Support 100+ concurrent sessions

### NFR-002: Offline Support
- Full offline capability required
- Sync within 30 seconds when online

## Dependencies
- point_of_sale
- stock
- [other modules]
```

#### design.md
```markdown
# Technical Design: <Module Name>

## Architecture Overview
[High-level architecture diagram/description]

## Models
### <model.name>
| Field | Type | Description |
|-------|------|-------------|
| name | Char | Display name |

## Views
- Form view: <module>_view_form
- List view: <module>_view_tree
- Kanban: <module>_view_kanban

## Security
- Groups: <module>.group_user, <module>.group_manager
- Record rules: [describe access rules]

## OWL Components
- [Component name and purpose]
```

#### tasks.md
```markdown
# Implementation Tasks: <Module Name>

## Phase 1: Foundation
- [ ] TASK-001: Create module scaffold
- [ ] TASK-002: Define base models
- [ ] TASK-003: Create security groups

## Phase 2: Core Features
- [ ] TASK-004: Implement [feature 1]
- [ ] TASK-005: Implement [feature 2]

## Phase 3: UI/UX
- [ ] TASK-006: Create form views
- [ ] TASK-007: Create list views
- [ ] TASK-008: Add OWL components

## Phase 4: Testing
- [ ] TASK-009: Unit tests (90%+ coverage)
- [ ] TASK-010: Integration tests
- [ ] TASK-011: E2E tests with Playwright
```

### Step 3: Initialize Module Scaffold
```bash
# Create basic module structure
mkdir -p custom_addons/<module-name>/{models,views,security,static/src/{js,xml,scss},tests,data,controllers,wizard,reports}

# Create __init__.py
echo "from . import models" > custom_addons/<module-name>/__init__.py

# Create models/__init__.py
touch custom_addons/<module-name>/models/__init__.py
```

### Step 4: Create Manifest
```python
# __manifest__.py
{
    'name': '<Module Display Name>',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': '<Brief description>',
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            '<module-name>/static/src/**/*',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
```

### Step 5: Display Confirmation
```
╔══════════════════════════════════════════════════════════════════╗
║           ✅ SPECIFICATION CREATED: <module-name>                 ║
╠══════════════════════════════════════════════════════════════════╣
║ Location: custom_addons/<module-name>/.spec/                     ║
║                                                                  ║
║ Created Documents:                                               ║
║   📋 requirements.md  - Define functional requirements           ║
║   🏗️  design.md        - Technical architecture                  ║
║   📝 tasks.md         - Implementation tasks                     ║
║                                                                  ║
║ Next Steps:                                                      ║
║   1. Edit requirements.md with your requirements                 ║
║   2. Run /odoo-spec-status <module-name> to check progress       ║
║   3. Run /king <module-name> to start implementation             ║
╚══════════════════════════════════════════════════════════════════╝
```

$ARGUMENTS: module-name description
