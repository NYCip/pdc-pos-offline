# Context Optimization & Bloat Prevention

## Problem
Claude Code loads MCP servers, skills, and agents at session start. Each adds tokens:
- **MCP tools**: ~600 tokens per tool (280+ tools = 168K tokens)
- **Skills**: ~400 tokens each (50+ skills = 20K tokens)
- **Agents**: ~200 tokens each (50+ agents = 10K tokens)

Without optimization, a session can start at **200K+ tokens** before any work begins.

## Token Budget Target

| Component | Target | Max |
|-----------|--------|-----|
| MCP Tools | 30K | 50K |
| Skills | 10K | 20K |
| Agents | 5K | 10K |
| **Total Overhead** | **45K** | **80K** |

Leave 120K+ tokens for actual work.

---

## MCP Server Rules

### Essential Servers (4 - Always Include)
```json
{
  "memory": "Persistent storage - REQUIRED",
  "sequential-thinking": "Multi-step reasoning - REQUIRED",
  "context7": "Documentation lookup - REQUIRED for Odoo",
  "claude-flow": "Swarm orchestration - REQUIRED"
}
```

### Never Include Together (Duplicates)
| Duplicate | Overlaps With | Solution |
|-----------|---------------|----------|
| `claude-flow@alpha` | `claude-flow` | Use only `claude-flow` |
| `ruv-swarm` | `claude-flow` | Use only `claude-flow` |
| `flow-nexus` | `claude-flow` | Add only for cloud features |

### Add On-Demand Only
```bash
# Add playwright ONLY when running E2E tests
claude mcp add playwright -s project -- npx @anthropic-ai/mcp-playwright

# Add flow-nexus ONLY when using cloud swarms
claude mcp add flow-nexus -s project -- npx flow-nexus-mcp
```

### MCP Audit Command
```bash
# Check all MCP servers and their scopes
claude mcp list

# Remove duplicates
claude mcp remove SERVER_NAME -s local
claude mcp remove SERVER_NAME -s project
```

---

## Skills Rules

### One Scope Only
Skills should exist at **USER level only** (`~/.claude/skills/`).

**NEVER** create skills at project level (`.claude/skills/`) because:
1. User skills are already available in all projects
2. Duplicate skills double token usage
3. Skills don't have project-specific logic

### Audit & Fix
```bash
# Check for project-level skills (should be empty)
ls -la .claude/skills/

# Remove if duplicates exist
rm -rf .claude/skills/*

# Verify user skills
ls ~/.claude/skills/
```

### Install Script Rule
```bash
# CORRECT - don't create skills directory at project level
mkdir -p .claude/{commands,agents,templates,steering}

# WRONG - creates duplicate space
mkdir -p .claude/{commands,agents,templates,skills,steering}
```

---

## Agents Rules

### Project vs User Level
| Level | Location | Use For |
|-------|----------|---------|
| User | `~/.claude/agents/` | Generic agents (reviewer, tester) |
| Project | `.claude/agents/` | Project-specific agents (odoo-specialist) |

### Avoid Duplication
If an agent is generic (works for any project), put it at user level only.

### Agent Naming Convention
```
{scope}-{specialty}-{role}.md

Examples:
- odoo-pos-specialist.md (project)
- generic-code-reviewer.md (user)
```

---

## Quick Audit Checklist

Run this before starting work if context seems high:

```bash
# 1. Check MCP servers
claude mcp list

# 2. Check for duplicate skills
ls .claude/skills/ 2>/dev/null | wc -l

# 3. Check project .mcp.json
cat .mcp.json | jq '.mcpServers | keys'

# 4. Check total context (in Claude)
/context
```

### Expected Results
- MCP servers: 4-6 (not 10+)
- Project skills: 0 (empty directory)
- `.mcp.json` servers: 4 essential only

---

## Prevention Strategy

### 1. Install Script Enforces Optimization
The `install.sh` script:
- Creates only 4 essential MCP servers
- Does NOT create `.claude/skills/` directory
- Includes comments explaining token savings

### 2. Regular Audits
Every month, run:
```bash
# Full audit
/king audit-context
```

### 3. New Server/Skill Checklist
Before adding ANY new MCP server or skill:
- [ ] Is there an existing one that does this?
- [ ] Does it duplicate another tool's functionality?
- [ ] Is it needed for THIS project specifically?
- [ ] What's the token cost (check after adding)?

### 4. Project Template Rule
When creating new PDC Standard projects:
- Use `./install.sh .` (optimized config)
- Don't manually add MCP servers
- Don't copy skills to project level

---

## Recovery: If Context Explodes

1. **Identify bloat source**
   ```bash
   /context  # In Claude session
   ```

2. **Remove duplicate MCPs**
   ```bash
   claude mcp remove DUPLICATE_NAME -s local
   claude mcp remove DUPLICATE_NAME -s project
   ```

3. **Clear project skills**
   ```bash
   rm -rf .claude/skills/*
   ```

4. **Restart Claude session**
   ```bash
   exit  # Then start new session
   ```

5. **Verify reduction**
   ```bash
   /context
   ```

Target: **Under 100K total overhead** (leaves 100K+ for work)

---

## Reference: Token Costs

| Item | Tokens | Example |
|------|--------|---------|
| 1 MCP tool | ~600 | `mcp__claude-flow__swarm_init` |
| 1 Skill | ~400 | `agentdb-learning.md` |
| 1 Agent | ~200 | `odoo-specialist.md` |
| CLAUDE.md | ~2000 | Project instructions |
| .claude/settings.json | ~500 | Hooks, permissions |

### Cost Examples
| Configuration | Estimated Tokens |
|--------------|------------------|
| 4 MCP servers (40 tools) | ~24K |
| 10 MCP servers (280 tools) | ~168K |
| 26 skills (user) | ~10K |
| 52 skills (user + project) | ~21K |

**Optimization impact**: 168K → 24K = **144K saved** (85% reduction)
