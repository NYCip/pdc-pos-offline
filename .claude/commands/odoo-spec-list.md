# Odoo Spec List - List All Module Specifications

## Purpose
Display all Odoo module specifications in the project with their current status.

## Usage
```
/odoo-spec-list
```

---

## Implementation

### Step 1: Scan for Specifications
Search `custom_addons/*/` for directories containing `.spec/` folders.

### Step 2: Analyze Each Spec
For each found specification:
- Check for requirements.md, design.md, tasks.md
- Count completed vs total tasks
- Determine current phase

### Step 3: Display Summary

```
╔══════════════════════════════════════════════════════════════════╗
║                    📋 ODOO MODULE SPECIFICATIONS                  ║
╠══════════════════════════════════════════════════════════════════╣
║ Module          │ Phase        │ Tasks    │ Progress             ║
╠═════════════════╪══════════════╪══════════╪══════════════════════╣
║ pdc_rms         │ DESIGN       │ 0/15     │ [░░░░░░░░░░]   0%   ║
║ pdc_loyalty     │ IMPLEMENT    │ 8/12     │ [██████░░░░]  67%   ║
║ pdc_kds         │ REQUIREMENTS │ 0/0      │ [░░░░░░░░░░]   0%   ║
║ pdc_reports     │ DONE         │ 10/10    │ [██████████] 100%   ║
╠══════════════════════════════════════════════════════════════════╣
║ Total: 4 modules │ 18/37 tasks complete                          ║
╚══════════════════════════════════════════════════════════════════╝

Commands:
  /odoo-spec-status <module>   - Detailed status for a module
  /odoo-spec-create <module>   - Create new specification
  /odoo-spec-execute <module>  - Execute pending tasks
  /king <module>               - Full orchestration
```

### Phase Detection Logic

| Condition | Phase |
|-----------|-------|
| No requirements.md | NOT_STARTED |
| requirements.md incomplete | REQUIREMENTS |
| design.md missing/incomplete | DESIGN |
| tasks.md missing/incomplete | TASKS |
| Tasks < 100% complete | IMPLEMENTATION |
| All tasks complete | DONE |

$ARGUMENTS: none
