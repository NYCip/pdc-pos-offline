# Hive-Mind - Multi-Agent Swarm Orchestration

## Purpose
Launch and coordinate multi-agent swarms using Claude-Flow's Hive-Mind system. The Queen agent coordinates specialized workers for parallel task execution.

## Usage
```
/hive-mind [action] [options]
```

## Actions
- `spawn <objective>` - Spawn a new hive-mind swarm for an objective
- `status` - Check current swarm status and agent activity
- `stop` - Gracefully stop the active swarm
- `wizard` - Interactive wizard to configure and launch a swarm

---

## Quick Start

### Spawn a Swarm
```bash
/hive-mind spawn "Implement pos_loyalty module with tests"
```

This will:
1. Initialize a hierarchical swarm topology
2. Spawn a Queen agent for coordination
3. Spawn specialized worker agents (coder, tester, reviewer)
4. Execute the objective with parallel task distribution

### Check Status
```bash
/hive-mind status
```

Shows:
- Active agents and their roles
- Current task assignments
- Progress metrics
- Memory coordination state

---

## Swarm Topologies

### Hierarchical (Default)
```
        Queen (Strategic)
       /      |      \
   Coder   Tester  Reviewer
```
Best for: Complex multi-component tasks

### Mesh
```
  Agent1 ←→ Agent2
    ↕         ↕
  Agent3 ←→ Agent4
```
Best for: Tightly integrated components requiring peer coordination

### Star
```
      Agent1
        ↑
Agent2 ← Coordinator → Agent3
        ↓
      Agent4
```
Best for: Independent parallel tasks

---

## Implementation

When `/hive-mind spawn <objective>` is invoked:

### Step 1: Initialize Swarm
```bash
npx claude-flow@alpha swarm init --topology hierarchical --max-agents 8
```

### Step 2: Spawn Queen
```bash
npx claude-flow@alpha hive-mind spawn "<objective>" \
  --queen-type strategic \
  --max-workers 5 \
  --claude
```

### Step 3: Monitor Progress
The swarm will:
- Break down the objective into tasks
- Assign tasks to specialized workers
- Coordinate through shared memory
- Report progress in real-time

### Step 4: Collect Results
```bash
npx claude-flow@alpha hive-mind status
```

---

## Agent Types

| Agent | Role | Capabilities |
|-------|------|--------------|
| Queen | Strategic coordinator | Task planning, resource allocation, decision making |
| Coder | Implementation | Write code, create models, implement features |
| Tester | Quality assurance | Write tests, run coverage, validate functionality |
| Reviewer | Code review | Security audit, best practices, Odoo patterns |
| Researcher | Analysis | Explore codebase, find patterns, gather context |
| Optimizer | Performance | Optimize queries, reduce complexity, improve speed |

---

## Memory Coordination

Agents share context through Claude-Flow memory:

```bash
# Store decision
npx claude-flow@alpha memory store \
  --key "hive/decisions/architecture" \
  --value '{"pattern": "mixin", "reason": "reusability"}'

# Retrieve shared context
npx claude-flow@alpha memory search --pattern "hive/*"
```

---

## Integration with King

The `/king` orchestrator automatically uses Hive-Mind when:
- Task count exceeds threshold (4+ tasks)
- Parallel execution is beneficial
- Complex coordination is required

```bash
/king execute
# If 4+ pending tasks → spawns hive-mind swarm
# If 1-3 tasks → direct execution
```

---

## Example: Module Implementation

```bash
/hive-mind spawn "Implement pos_customer_display module"

# Swarm Activity:
#
# 👑 Queen: Analyzing objective...
#    - Breaking into 6 tasks
#    - Assigning to workers
#
# 🔨 Coder-1: Implementing models/pos_customer_display.py
# 🔨 Coder-2: Implementing static/src/js/customer_display.js
# 🧪 Tester-1: Writing tests/test_customer_display.py
# 📋 Reviewer-1: Reviewing architecture decisions
#
# Progress: [████████░░] 80% (5/6 tasks complete)
```

---

## Troubleshooting

### Swarm Won't Start
```bash
# Re-initialize hive-mind
npx claude-flow@alpha hive-mind init

# Check MCP server status
claude mcp list
```

### Agent Timeout
```bash
# Retry with fresh agent
/hive-mind stop
/hive-mind spawn "<objective>"
```

### Memory Issues
```bash
# Clear swarm memory
npx claude-flow@alpha memory namespace --namespace hive --action clear
```

---

$ARGUMENTS: action options
