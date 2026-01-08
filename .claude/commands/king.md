# King - PDC Standard Odoo Orchestrator

## Purpose
The **King** command is the supreme orchestrator for **PDC Standard** - unified Odoo POS development. It intelligently coordinates Odoo spec workflows and Claude-Flow swarms with context-optimized tiered loading.

## Usage
```
/king [action] [target] [options]
```

## Actions
| Action | Description |
|--------|-------------|
| `status` | Show project status and recommendations |
| `start <module>` | Begin new Odoo module spec workflow |
| `continue` | Auto-continue current phase |
| `execute` | Execute tasks (direct or swarm based on complexity) |
| `test [module]` | Run pytest-odoo tests |
| `complete` | Finalize module |
| `smart <module>` | **Guided Autopilot** - asks before each phase |
| `remember <k> <v>` | Store decision in memory |
| `recall <topic>` | Retrieve past decisions |
| `verify` | Check all tools installed |
| `compact` | Reduce context (archive completed work) |
| `context` | Show context usage report |
| `focus <task>` | Load single task context only |
| `mcp [add|remove|list]` | Manage MCP servers for context optimization |

---

## Quick Reference (Odoo 19)

### ORM Only - No Raw SQL
```python
# ✅ CORRECT
self.env['model'].search([('field', '=', val)])
self.env['model'].with_context(key=val).create({})

# ❌ DEPRECATED
self.env.cr.execute("SELECT...")  # Never use raw SQL
```

### OWL Components (Not jQuery)
```javascript
// ✅ CORRECT
export class MyComponent extends Component {
    static template = "module.MyComponent";
    setup() { this.state = useState({}); }
}

// ❌ DEPRECATED
Widget.extend({...})  // Legacy widgets
$('.selector')  // jQuery
```

### Asset Bundle
```python
'assets': {
    'point_of_sale._assets_pos': [  # POS assets
        'module/static/src/**/*',
    ],
    'web.assets_backend': [  # Backend assets
        'module/static/src/backend/**/*',
    ],
}
```

**Full standards:** Load via `/king standards` or Context7 MCP.

---

## MCP Optimization (Context Management)

**PROBLEM**: Each MCP server adds 2-10KB+ to context. Too many = wasted tokens.

### MCP Tiers

| Tier | Servers | Context Cost | When to Use |
|------|---------|--------------|-------------|
| **ESSENTIAL** | `memory`, `sequential-thinking` | ~3KB | Always |
| **RECOMMENDED** | `context7` | ~2KB | Odoo docs lookup |
| **OPTIONAL** | `claude-flow` | ~5KB | Complex swarms only |
| **HEAVY** | `flow-nexus`, `ruv-swarm` | ~15KB each | Cloud features, rarely needed |

### Minimal Config (Recommended)

Create `.mcp.json` in your project root:
```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```
**Total: ~5KB context** (vs 40KB+ with all MCPs)

### Disable Heavy MCPs

**Option 1: Project-level override**
Create `.mcp.json` in project root (overrides global settings)

**Option 2: Remove from global config**
```bash
# Edit global settings
nano ~/.claude/settings.json
# Remove flow-nexus, ruv-swarm, etc.
```

**Option 3: Use @-mention to toggle**
In Claude Code, type `@mcp-server-name` to disable/enable

### When to Add Heavy MCPs

| Feature Needed | Add This MCP |
|----------------|--------------|
| Complex multi-agent swarms | `claude-flow` |
| Cloud sandbox execution | `flow-nexus` |
| Advanced neural training | `ruv-swarm` |
| Playwright E2E testing | `playwright` |

### Context Budget Rule

```
Target: Keep MCP context under 10KB
─────────────────────────────────────
Essential MCPs:     ~5KB  (always)
+ claude-flow:      +5KB  (when needed)
+ context7 queries: +2KB  (on-demand)
─────────────────────────────────────
AVOID: flow-nexus + ruv-swarm together (~30KB)
```

### /king mcp - Manage MCP Servers

```bash
/king mcp list              # Show current MCPs and context cost
/king mcp add claude-flow   # Add swarm orchestration
/king mcp remove flow-nexus # Remove heavy MCP
/king mcp minimal           # Reset to minimal config
/king mcp swarm             # Add MCPs needed for swarm mode
```

**Implementation:**
```bash
# /king mcp list
echo "Current MCP servers:"
cat .mcp.json | jq '.mcpServers | keys[]' 2>/dev/null || echo "No project .mcp.json"
echo ""
echo "Global MCPs (~/.claude/settings.json):"
cat ~/.claude/settings.json | jq '.mcpServers | keys[]' 2>/dev/null || echo "None"

# /king mcp add <server>
case "$SERVER" in
  claude-flow)
    claude mcp add claude-flow -- npx claude-flow@alpha mcp start
    ;;
  playwright)
    claude mcp add playwright -- npx -y @playwright/mcp@latest
    ;;
esac

# /king mcp minimal (reset to essentials)
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "memory": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"]},
    "sequential-thinking": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]},
    "context7": {"command": "npx", "args": ["-y", "@upstash/context7-mcp"]}
  }
}
EOF
```

---

## Implementation Instructions

### Step 0: Environment Check (Every Invocation)

```bash
# Quick checks (fast, minimal context)
[ -d ".claude-flow" ] || [ -d ".swarm" ] || NEED_INIT=true
[ -d ".odoo-dev/steering" ] || NEED_STEERING=true
npm list -g @stanleykao72/claude-code-spec-workflow-odoo 2>/dev/null || NEED_PKG=true
```

If `NEED_INIT=true`: Run `/king verify` to setup.
If `NEED_STEERING=true`: Run `/odoo-steering` first.

---

### Step 1: Detect Action & Load Context

**CRITICAL: Tiered Context Loading**

| Action | Context Loaded | ~Tokens |
|--------|----------------|---------|
| `status` | Spec summary only | 500 |
| `focus <task>` | Single task + related files | 800 |
| `continue` | Current phase doc only | 1500 |
| `execute` | Tasks + target files | 2500 |
| `smart` | Phase-by-phase (ask before each) | 1500/phase |
| `standards` | Full Odoo 19 via Context7 | On-demand |

**Never load all specs at once. Load per-action.**

---

### Step 2: Decision Engine

```
┌─────────────────────────────────────────────────────────────┐
│               👑 KING DECISION ENGINE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Check Memory: Previous decision on this topic?          │
│     YES → Apply cached decision (skip re-analysis)          │
│     NO  → Continue analysis                                 │
│                                                             │
│  2. Detect Phase:                                           │
│     REQUIREMENTS → Design next                              │
│     DESIGN       → Tasks next                               │
│     TASKS        → Implementation next                      │
│     IMPLEMENT    → Verify next                              │
│     VERIFY       → Complete                                 │
│                                                             │
│  3. Complexity Score (for swarm decision):                  │
│     Score = tasks * avg_difficulty + dependencies + risk    │
│     Score < 8  → Direct execution                           │
│     Score >= 8 → Hive-Mind swarm                            │
│                                                             │
│  4. Every choice: Pros/Cons/Risks analysis                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Step 3: Complexity-Based Swarm Detection

**Don't just count tasks - score complexity:**

```
COMPLEXITY SCORING:
────────────────────
Base Score:
  • 1-3 simple tasks = 3 points
  • 4-6 medium tasks = 8 points
  • 7+ tasks = 15 points

Modifiers:
  + 3 if has POS UI changes
  + 3 if has payment flow logic
  + 2 if multi-model dependencies
  + 2 if has JS/OWL components
  + 1 per external integration
  - 2 if similar to previous module (use memory)

DECISION:
  Score < 8  → Direct execution (odoo-spec-execute)
  Score >= 8 → Hive-Mind swarm (parallel execution)
  Score >= 15 + payment → Byzantine consensus (safety)
```

---

### Step 4: Execute Based on Decision

#### Direct Execution (Score < 8)
```bash
npx @stanleykao72/claude-code-spec-workflow-odoo execute <task-id> <module>
```

#### Hive-Mind Swarm (Score >= 8)
```bash
# Initialize swarm with appropriate topology
npx claude-flow@alpha swarm init --topology hierarchical --max-agents 6

# Spawn queen with Odoo context
npx claude-flow@alpha hive-mind spawn --queen tactical \
  --workers "coder:2,tester:1,reviewer:1" \
  --context ".odoo-dev/specs/$MODULE"

# Execute all tasks in parallel
npx claude-flow@alpha hive-mind execute --spec "$MODULE" --parallel
```

#### Byzantine Consensus (Payment/Critical)
```bash
npx claude-flow@alpha swarm init --topology mesh --consensus byzantine
npx claude-flow@alpha hive-mind spawn --queen strategic \
  --workers "coder:2,validator:2,security:1"
```

---

## /king smart - Guided Autopilot

**Ask before each phase, never fully autonomous:**

```
/king smart pos_loyalty

╔══════════════════════════════════════════════════════════════════╗
║            👑 KING SMART MODE - GUIDED AUTOPILOT                 ║
╠══════════════════════════════════════════════════════════════════╣
║ Module: pos_loyalty                                              ║
║ Mode: ASK before each phase                                      ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║ PHASE 1: REQUIREMENTS                                            ║
║ ─────────────────────────────────────────────────────────────── ║
║ Will create requirements.md based on module description.         ║
║                                                                  ║
║ 🎯 Proceed with Requirements phase? [Y/n/skip/stop]              ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

After each phase:
1. Show summary of what was done
2. Check decision cache before next phase
3. Ask to proceed
4. Store decisions in memory for future reference

---

## /king remember & /king recall

### Store Decision
```bash
/king remember architecture "Use pos.order mixin for loyalty"
/king remember payment-flow "Bypass native validation for EBT"

# Stored via Claude-Flow memory:
npx claude-flow@alpha memory store \
  --key "king/decisions/architecture" \
  --value "Use pos.order mixin for loyalty" \
  --namespace "pdc-standard"
```

### Recall Decision
```bash
/king recall architecture
/king recall all  # Load all decisions for new session

# Retrieved via:
npx claude-flow@alpha memory search \
  --pattern "king/decisions/*" \
  --namespace "pdc-standard"
```

---

## Memory Routing Rules (LOCAL vs GLOBAL)

**CRITICAL: Agents must route memory correctly for multi-project setups.**

### Namespace Classification

| Namespace | Scope | Used For |
|-----------|-------|----------|
| `project:{name}` | LOCAL (this project only) | Module decisions, project bugs, local architecture |
| `odoo-global` | GLOBAL (all projects) | Odoo 19 patterns, common fixes, reusable solutions |
| `pdc-standard` | GLOBAL (all projects) | PDC development patterns, swarm configurations |

### Auto-Routing Rules

**Store to LOCAL (`project:{name}`) when:**
- Decision is about THIS specific module
- Bug fix is project-specific
- Architecture choice only applies here
- Customer-specific customization

**Store to GLOBAL (`odoo-global`) when:**
- Odoo 19 pattern discovered (ORM, OWL, etc.)
- Bug fix applies to ANY Odoo 19 project
- Best practice that's reusable
- Common pitfall/solution

### Implementation

```bash
# LOCAL - project-specific decision
/king remember local:architecture "Use custom mixin for this client's loyalty"
npx claude-flow@alpha memory store \
  --key "decisions/architecture" \
  --value "..." \
  --namespace "project:pdc_pos_grocery"

# GLOBAL - reusable Odoo 19 pattern
/king remember global:orm-pattern "Use with_context for multi-company"
npx claude-flow@alpha memory store \
  --key "odoo19/orm-patterns/multi-company" \
  --value "..." \
  --namespace "odoo-global"
```

### On Session Start - Load Both

```bash
# Always load global patterns (shared knowledge)
npx claude-flow@alpha memory search --pattern "*" --namespace "odoo-global"

# Load this project's decisions
npx claude-flow@alpha memory search --pattern "*" --namespace "project:$(basename $PWD)"
```

### Quick Decision Tree

```
Is this decision reusable in OTHER Odoo projects?
├─ YES → Store GLOBAL (odoo-global namespace)
│        Examples: ORM patterns, OWL fixes, POS behaviors
└─ NO  → Store LOCAL (project:{name} namespace)
         Examples: Client customization, module-specific arch
```

---

## /king compact

Reduce context by archiving completed work:

```bash
/king compact

# Actions:
1. Archive completed task specs to .odoo-dev/specs/archive/
2. Summarize decisions → store in memory
3. Clear swarm history (keep last 10)
4. Clear verbose test output

# Target: 50-70% context reduction
```

See `/king-compact` for full implementation.

---

## /king verify

Check all tools are installed:

```bash
/king verify

╔══════════════════════════════════════════════════════════════════╗
║            👑 KING - ENVIRONMENT VERIFICATION                    ║
╠══════════════════════════════════════════════════════════════════╣
║ [✓] Node.js v20.x                                                ║
║ [✓] npm packages installed                                       ║
║ [✓] @stanleykao72/claude-code-spec-workflow-odoo                 ║
║ [✓] Claude-Flow initialized                                      ║
║ [✓] Hive-Mind system ready                                       ║
║ [✓] Memory database connected                                    ║
║ [✓] pytest-odoo available                                        ║
║ [✓] MCP servers: claude-flow, memory, context7                   ║
╠══════════════════════════════════════════════════════════════════╣
║ ✅ All systems operational                                       ║
╚══════════════════════════════════════════════════════════════════╝
```

If anything missing, auto-install:
```bash
# Missing packages
npm install -g @stanleykao72/claude-code-spec-workflow-odoo

# Missing Claude-Flow
npx claude-flow@alpha init --force
npx claude-flow@alpha hive-mind init

# Missing MCP
claude mcp add claude-flow -- npx claude-flow@alpha mcp start
claude mcp add context7 -- npx -y @upstash/context7-mcp
```

---

## /king standards

Load full Odoo 19 standards via Context7 (on-demand, not preloaded):

```bash
/king standards

# Uses Context7 MCP to fetch latest Odoo 19 docs:
mcp__context7__resolve-library-id { libraryName: "odoo", query: "Odoo 19 ORM models" }
mcp__context7__query-docs { libraryId: "/odoo/odoo", query: "OWL components Odoo 19" }
```

Or load from steering if Context7 unavailable:
```bash
cat .odoo-dev/steering/module-standards.md
cat .odoo-dev/steering/deprecated-patterns.md
```

---

## Module Templates

When `/king start <module>` is called, offer templates:

```
Available Templates:
  1. pos-loyalty     - Loyalty programs, points, rewards
  2. pos-payment     - Payment method integration
  3. pos-hardware    - Scale, printer, scanner integration
  4. pos-ui          - Custom UI components (OWL)
  5. pos-report      - Reporting and analytics
  6. pos-integration - External service integration
  7. blank           - Empty module structure

Select template or enter 'blank': _
```

Templates are in `.claude/templates/odoo-*.md`

---

## Status Dashboard

```
/king status

╔══════════════════════════════════════════════════════════════════╗
║            👑 PDC STANDARD - KING ORCHESTRATOR                   ║
╠══════════════════════════════════════════════════════════════════╣
║ Project:      [Project Name]                                     ║
║ Odoo Version: 19.0                                               ║
║ Steering:     [✓ Configured / ✗ Run /odoo-steering]              ║
║ Claude-Flow:  [Active / Inactive]                                ║
║ Memory:       [X decisions cached]                               ║
╠══════════════════════════════════════════════════════════════════╣
║ ACTIVE MODULE: [module_name]                                     ║
║ PHASE:         [REQUIREMENTS/DESIGN/TASKS/IMPLEMENT/VERIFY]      ║
║ PROGRESS:      [████████░░] 80% (8/10 tasks)                     ║
║ COMPLEXITY:    Score 12 → Swarm execution                        ║
╠══════════════════════════════════════════════════════════════════╣
║ CACHED DECISIONS:                                                ║
║   • architecture: "Use pos.order mixin"                          ║
║   • payment: "Bypass native for EBT"                             ║
╠══════════════════════════════════════════════════════════════════╣
║ 🎯 NEXT: /king continue (advance to DESIGN phase)                ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Auto-Create Steering

If steering docs don't exist, King creates them:

```bash
/king start pos_loyalty

# Detects missing steering:
if [ ! -d ".odoo-dev/steering" ]; then
    echo "⚠️  No steering docs found. Creating..."
    mkdir -p .odoo-dev/steering

    # Copy from PDC Standard templates
    cp ~/.claude/steering/*.md .odoo-dev/steering/ 2>/dev/null || \
    npx @stanleykao72/claude-code-spec-workflow-odoo odoo-setup

    echo "✅ Steering docs created in .odoo-dev/steering/"
fi
```

---

## Context Budget

**Target: Keep total context under 15KB per action**

| Component | Budget |
|-----------|--------|
| King core | 3KB |
| Current phase spec | 2KB |
| Target files (2-3) | 5KB |
| Test context | 2KB |
| Conversation | 3KB |
| **Total** | **15KB** |

If exceeding budget: Run `/king compact`

---

## Session Protocols

### Fresh Session Start
```bash
/king recall all          # Load cached decisions (fast)
/king status --summary    # Brief status (200 tokens)
/king focus <task>        # Load current task only
```

### End of Session
```bash
/king remember <key> <decision>  # Save important decisions
/king compact                     # Archive completed work
```

---

$ARGUMENTS: status start continue execute test complete smart remember recall verify compact context focus standards
