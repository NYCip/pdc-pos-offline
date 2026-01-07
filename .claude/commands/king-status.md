# King Status - Quick Orchestrator Dashboard

## Purpose
Display comprehensive status of the PDC Standard development environment including project configuration, steering documents, specifications, and hive-mind swarms.

## Usage
```
/king-status [--verbose] [--json]
```

---

## Implementation Instructions

When the user invokes `/king-status`, execute these checks and display the dashboard:

### Step 1: Gather Project Information

```bash
# Check Odoo config
if [ -f ".odoo-dev/config.json" ]; then
  ODOO_VERSION=$(cat .odoo-dev/config.json | jq -r '.odoo_version // "unknown"')
  PROJECT_TYPE="Odoo $ODOO_VERSION"
else
  PROJECT_TYPE="Not Configured"
fi

# Check steering documents
STEERING_COUNT=0
[ -f ".odoo-dev/steering/business-rules.md" ] && ((STEERING_COUNT++))
[ -f ".odoo-dev/steering/technical-stack.md" ] && ((STEERING_COUNT++))
[ -f ".odoo-dev/steering/module-standards.md" ] && ((STEERING_COUNT++))

# Check specs
SPEC_DIRS=$(find custom_addons -name ".spec" -type d 2>/dev/null)
SPEC_COUNT=$(echo "$SPEC_DIRS" | grep -c ".spec" || echo "0")

# Check hive-mind
npx claude-flow@alpha hive-mind status 2>/dev/null
```

### Step 2: Display Dashboard

```
╔══════════════════════════════════════════════════════════════════╗
║                    👑 KING ORCHESTRATOR STATUS                    ║
╠══════════════════════════════════════════════════════════════════╣
║ PROJECT CONFIGURATION                                            ║
║ ─────────────────────────────────────────────────────────────── ║
║ Project Type:    [Odoo 19.0 / Not Configured]                    ║
║ Python Version:  [3.12+]                                         ║
║ Database:        [odoo_dev @ localhost:5432]                     ║
╠══════════════════════════════════════════════════════════════════╣
║ STEERING DOCUMENTS                                               ║
║ ─────────────────────────────────────────────────────────────── ║
║ [✓/✗] business-rules.md    - POS workflows, payment rules        ║
║ [✓/✗] technical-stack.md   - Hardware, offline, integrations     ║
║ [✓/✗] module-standards.md  - Odoo 19 development patterns        ║
╠══════════════════════════════════════════════════════════════════╣
║ ACTIVE SPECIFICATIONS                                            ║
║ ─────────────────────────────────────────────────────────────── ║
║ Module          │ Phase          │ Progress │ Tasks              ║
║ ────────────────┼────────────────┼──────────┼────────────────── ║
║ [module_name]   │ [PHASE]        │ [XX%]    │ [X/Y complete]     ║
╠══════════════════════════════════════════════════════════════════╣
║ HIVE-MIND SWARMS                                                 ║
║ ─────────────────────────────────────────────────────────────── ║
║ Active Swarms:  [N]                                              ║
║ Total Agents:   [N] (Queen + Workers)                            ║
║ Tasks:          [Pending: X │ In Progress: Y │ Completed: Z]     ║
╠══════════════════════════════════════════════════════════════════╣
║ 🎯 RECOMMENDED NEXT ACTION                                       ║
║ ─────────────────────────────────────────────────────────────── ║
║ [Specific recommendation based on current state]                 ║
╚══════════════════════════════════════════════════════════════════╝
```

### Step 3: Determine Recommendation

Based on the gathered information, provide ONE of these recommendations:

1. **No Steering** → "Run /odoo-steering to create project foundations"
2. **No Specs** → "Run /king start <module-name> to begin a new module"
3. **Spec in Requirements** → "Requirements need validation - run /king continue"
4. **Spec in Design** → "Design needs validation - run /king continue"
5. **Spec in Tasks** → "Ready for implementation - run /king execute"
6. **Implementation in Progress** → "Monitor with: npx claude-flow hive-mind status --watch"
7. **All Complete** → "Ready for testing - run /king test"

---

## Verbose Output (--verbose)

When `--verbose` flag is provided, also show:

```
╔══════════════════════════════════════════════════════════════════╗
║ DETAILED SPECIFICATION STATUS                                    ║
╠══════════════════════════════════════════════════════════════════╣
║ Module: [name]                                                   ║
║ ─────────────────────────────────────────────────────────────── ║
║ Requirements:                                                    ║
║   - [requirement 1]                                              ║
║   - [requirement 2]                                              ║
║                                                                  ║
║ Tasks:                                                           ║
║   [✓] Task 1 - Description                                       ║
║   [✓] Task 2 - Description                                       ║
║   [○] Task 3 - Description (in progress)                         ║
║   [ ] Task 4 - Description (pending)                             ║
╠══════════════════════════════════════════════════════════════════╣
║ HIVE-MIND AGENT DETAILS                                          ║
╠══════════════════════════════════════════════════════════════════╣
║ Swarm: [swarm-id]                                                ║
║ Queen: [strategic/tactical/adaptive]                             ║
║ Workers:                                                         ║
║   - researcher-1: [idle/working] - [current task]                ║
║   - coder-2: [idle/working] - [current task]                     ║
║   - tester-3: [idle/working] - [current task]                    ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## JSON Output (--json)

When `--json` flag is provided, output structured JSON:

```json
{
  "project": {
    "type": "odoo",
    "version": "19.0",
    "python": "3.12",
    "database": "odoo_dev"
  },
  "steering": {
    "configured": true,
    "documents": ["business-rules.md", "technical-stack.md", "module-standards.md"]
  },
  "specs": [
    {
      "name": "module_name",
      "phase": "TASKS",
      "progress": 60,
      "tasks": {"total": 10, "completed": 6, "pending": 4}
    }
  ],
  "hivemind": {
    "active_swarms": 1,
    "total_agents": 5,
    "tasks": {"pending": 2, "in_progress": 1, "completed": 3}
  },
  "recommendation": {
    "action": "/king execute",
    "reason": "Spec ready for implementation"
  }
}
```

---

$ARGUMENTS: --verbose --json
