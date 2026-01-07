# Odoo Spec Status - Show Module Specification Status

## Purpose
Display the current status of an Odoo module specification, including phase progress, task completion, and validation status.

## Usage
```
/odoo-spec-status [module-name]
```

---

## Implementation

When invoked, check `custom_addons/*/spec/` directories and display:

```
╔══════════════════════════════════════════════════════════════════╗
║              📋 SPECIFICATION STATUS: [module_name]               ║
╠══════════════════════════════════════════════════════════════════╣
║ [✓] Requirements  → requirements.md (complete)                   ║
║ [✓] Design        → design.md (complete)                         ║
║ [○] Tasks         → tasks.md (in progress)                       ║
║ [ ] Implementation                                               ║
╠══════════════════════════════════════════════════════════════════╣
║ Tasks: 6/15 complete [████████░░░░░░░░] 40%                      ║
╚══════════════════════════════════════════════════════════════════╝
```

$ARGUMENTS: module-name
