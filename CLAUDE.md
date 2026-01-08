# PDC Standard - Claude Code Configuration

## Overview
PDC Standard is the unified Odoo POS development environment. It orchestrates Odoo module development using specification workflows and Claude-Flow swarms.

## Quick Start

```bash
# Install PDC Standard
./install.sh .               # Local project
./install.sh --global        # All projects
./install.sh --system        # System-wide (creates pdc-install command)

# Start working
/king status                 # Check environment
/king start pos_loyalty      # Start new module
/king smart pos_loyalty      # Guided autopilot mode
```

## Session Start - Load Memory

**On EVERY new session, load both global and local memory:**

```bash
# 1. Load global Odoo patterns (shared across ALL projects)
npx claude-flow@alpha memory search --pattern "*" --namespace "odoo-global"

# 2. Load this project's decisions
npx claude-flow@alpha memory search --pattern "*" --namespace "project:$(basename $PWD)"
```

### Memory Routing Rules

| Prefix | Scope | Use When |
|--------|-------|----------|
| `local:` | This project only | Module-specific decisions, client customization |
| `global:` | All projects | Odoo 19 patterns, reusable fixes, best practices |

```bash
# Store project-specific decision
/king remember local:arch "Custom mixin for this client"

# Store reusable Odoo pattern
/king remember global:orm "with_context for multi-company"
```

## Core Commands

| Command | Purpose |
|---------|---------|
| `/king` | Main orchestrator - coordinates all workflows |
| `/king status` | Show project status, phase, recommendations |
| `/king start <module>` | Begin new Odoo module spec workflow |
| `/king smart <module>` | Guided autopilot - asks before each phase |
| `/king execute` | Execute tasks (auto-chooses direct or swarm) |
| `/king test` | Run pytest-odoo tests |
| `/king remember <k> <v>` | Store decision in memory |
| `/king recall <topic>` | Retrieve past decisions |
| `/king compact` | Reduce context (archive completed work) |
| `/odoo-spec-create` | Create new module specification |
| `/odoo-steering` | Setup/view steering documents |

## Required MCP Servers

```json
{
  "claude-flow": "npx claude-flow@alpha mcp start",
  "memory": "npx -y @modelcontextprotocol/server-memory",
  "context7": "npx -y @upstash/context7-mcp",
  "sequential-thinking": "npx -y @modelcontextprotocol/server-sequential-thinking"
}
```

**Note**: `flow-nexus` and `ruv-swarm` are **OPTIONAL** cloud features, not required for base functionality.

## Workflow

```
1. STEERING    → Project standards (.odoo-dev/steering/)
2. SPEC CREATE → Requirements → Design → Tasks
3. EXECUTE     → Direct (simple) or Hive-Mind swarm (complex)
4. TEST        → pytest-odoo + Playwright E2E
5. COMPLETE    → Finalize and verify
```

### Complexity-Based Execution

King automatically chooses execution strategy:
- **Score < 8**: Direct execution (odoo-spec-execute)
- **Score >= 8**: Hive-Mind swarm (parallel)
- **Score >= 15 + payment**: Byzantine consensus (safety-critical)

## Odoo 19 Quick Reference

### ORM Only (No Raw SQL)
```python
# ✅ CORRECT
self.env['model'].search([('field', '=', val)])
self.env['model'].with_context(key=val).create({})

# ❌ NEVER
self.env.cr.execute("SELECT...")
```

### OWL Components (Not jQuery)
```javascript
// ✅ CORRECT
export class MyComponent extends Component {
    static template = "module.MyComponent";
    setup() { this.state = useState({}); }
}

// ❌ NEVER
Widget.extend({...})
$('.selector')
```

### POS Asset Bundle
```python
'assets': {
    'point_of_sale._assets_pos': [
        'module/static/src/**/*',
    ],
}
```

**Full standards**: See `.odoo-dev/steering/odoo19-standards.md` or use `/king standards`

## File Organization

```
project/
├── .claude/
│   ├── commands/     # King commands
│   ├── agents/       # Specialized agents
│   ├── templates/    # Module templates
│   └── steering/     # Development standards
├── .odoo-dev/
│   ├── steering/     # Odoo project standards
│   ├── specs/        # Module specifications
│   └── config.json   # Project config
├── custom_addons/    # Odoo modules
└── CLAUDE.md         # This file
```

## Module Templates

When starting a module, King offers templates:
- `pos-loyalty` - Loyalty programs, points, rewards
- `pos-payment` - Payment integrations, EBT
- `pos-hardware` - Scale, printer, scanner
- `pos-ui` - Custom OWL components
- `pos-report` - Reporting and analytics
- `blank` - Empty structure

## Context Management

**Target: Keep context under 15KB per action**

```bash
/king compact          # Archive completed work (50-70% reduction)
/king context          # Check current usage
/king focus <task>     # Load single task only (~800 tokens)
/king recall all       # Load cached decisions (fast session restore)
```

## Session Protocols

### Fresh Session
```bash
/king recall all          # Load decisions from memory
/king status --summary    # Brief status
/king focus <task>        # Load current task
```

### End Session
```bash
/king remember <key> <decision>  # Save decisions
/king compact                     # Archive work
```

## Key Principles

1. **ORM Only** - Never use raw SQL
2. **OWL Components** - No jQuery or legacy widgets
3. **Tiered Context** - Load only what's needed
4. **Decision Caching** - Store decisions in memory
5. **Complexity Scoring** - Auto-choose execution strategy
6. **Spec Phases** - Requirements → Design → Tasks → Implement → Verify

## Support

- PDC Standard: https://github.com/NYCip/dev_king
- Claude-Flow: https://github.com/ruvnet/claude-flow
- Odoo Spec Workflow: https://github.com/stanleykao72/claude-code-spec-workflow-odoo

---

## PDC POS Offline v2.0 - Complete Rewrite (2026-01-08)

### CRITICAL DISCOVERY

After deep source analysis of Odoo 19 native code, we discovered the v1 module was fundamentally flawed:

| v1 Wrong Approach | Correct Approach |
|-------------------|------------------|
| Caches `res.users` | Cache `hr.employee` |
| Uses SHA-256 hash | Native uses SHA-1 |
| Custom auth flow | Native `select_cashier_mixin.js` |
| Blocking banner | Native navbar icon |
| Didn't solve "Page Not Found" | Need Service Worker |

### The THREE Offline Problems

| Problem | Native Handles? | Our Solution |
|---------|-----------------|--------------|
| Mid-session offline | ✅ Yes (unsyncData[]) | None needed |
| Browser refresh offline | ❌ "Page Not Found" | **Service Worker** |
| Re-login with no data | ❌ Empty employee list | **IndexedDB cache** |

### v2.0 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER                                      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    SERVICE WORKER (sw.js)                      │  │
│  │  - Cache-First: /pos/ui (main entry)                          │  │
│  │  - Stale-While-Revalidate: /web/assets/* (JS/CSS)            │  │
│  │  - Network-First: /web/dataset/* (RPC calls)                  │  │
│  └─────────────────────────┬────────────────────────────────────┘  │
│                            │                                        │
│  ┌─────────────────────────▼────────────────────────────────────┐  │
│  │                    NATIVE ODOO 19 POS                         │  │
│  │  LoginScreen, PosStore, select_cashier_mixin (ALL NATIVE)    │  │
│  │                            │                                  │  │
│  │  ┌─────────────────────────▼──────────────────────────────┐  │  │
│  │  │           PosData (PATCHED - ONLY integration point)    │  │  │
│  │  │  loadInitialData() → cache success / load from cache    │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                               │                                      │
│  ┌────────────────────────────▼──────────────────────────────────┐  │
│  │                      INDEXEDDB                                 │  │
│  │  employees: hr.employee with _pin (SHA-1), _barcode           │  │
│  │  pos_data: products, categories, taxes, payment methods       │  │
│  │  cache_metadata: timestamps for TTL validation                │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Insight: POS "Login" Is NOT Server Auth

**Native Odoo 19 login flow**:
1. `load_data` RPC loads `hr.employee` with `_pin` (SHA-1 hashed on server)
2. LoginScreen shows employee list
3. User selects employee, enters PIN
4. `select_cashier_mixin.js` validates: `Sha1.hash(inputPin) === employee._pin`
5. No server call - just local comparison

**This means**: If we cache `hr.employee` with `_pin`, native login works offline!

### v2.0 Module Structure

```
pdc_pos_offline/
├── controllers/
│   └── service_worker_controller.py    # Serves SW
├── static/src/
│   ├── service_worker/
│   │   ├── sw.js                       # Service Worker
│   │   └── offline_error.html          # First-time error
│   └── js/
│       ├── offline_db.js               # IndexedDB wrapper
│       ├── pos_data_patch.js           # ONLY patch needed
│       └── pos_offline_boot.js         # SW registration
└── views/
    └── assets.xml
```

### Memory Keys

```bash
# Load v2 architecture
npx claude-flow@alpha memory search --pattern "v2*" --namespace "project:pdc-pos-offline"
npx claude-flow@alpha memory search --pattern "odoo19-pos-offline*" --namespace "odoo-global"
```

### Implementation Status

**Spec**: `.odoo-dev/specs/offline-relogin-redesign/tasks-v2.md`
**Architecture**: `.odoo-dev/steering/ARCHITECTURE_V2.md`
**Research**: `.odoo-dev/steering/DEEP_RESEARCH_FINDINGS.md`

### DO NOT (v1 Mistakes)

- ❌ Use SHA-256 (native uses SHA-1)
- ❌ Cache `res.users` (cache `hr.employee`)
- ❌ Create blocking UI (use native navbar icon)
- ❌ Patch LoginScreen or PosStore (patch PosData only)
- ❌ Custom authentication logic (native handles it)

### Native Odoo 19 PIN Validation (Reference)

```javascript
// pos_hr/static/src/app/utils/select_cashier_mixin.js
if (!inputPin || employee._pin !== Sha1.hash(inputPin)) {
    notification.add(_t("PIN not found"), { type: "warning" });
    return false;
}
```

```python
# pos_hr/models/hr_employee.py
def get_barcodes_and_pin_hashed(self):
    e['pin'] = hashlib.sha1(e['pin'].encode('utf8')).hexdigest()
```

---

**Remember**: Use `/king` for everything. It coordinates spec workflow and swarms automatically.
