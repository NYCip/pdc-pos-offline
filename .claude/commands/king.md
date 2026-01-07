# King - PDC Standard Odoo Orchestrator

## Purpose
The **King** command is the supreme orchestrator for **PDC Standard** - the unified Odoo POS development environment. It intelligently coordinates Odoo spec workflows and Claude-Flow swarms, provides decision recommendations with **pros/cons/risks**, and ensures strict adherence to specification phases.

## Usage
```
/king [action] [target] [options]
```

## Actions
- `status` - Analyze current state and recommend next steps with pros/cons
- `start <module>` - Begin a new Odoo module from scratch
- `continue` - Auto-detect and continue the current workflow
- `execute` - Execute pending tasks with hive-mind swarm
- `test [module]` - Run pytest-odoo tests with intelligent strategy
- `test --coverage` - Run with coverage report (90% target)
- `test --tdd` - TDD mode: write failing tests first
- `complete` - Finalize and verify completion
- `decide <question>` - Get recommendation with pros/cons/risks analysis

---

## Core Philosophy

### Decision Framework
Every recommendation includes:
1. **Options** - Available paths forward
2. **Pros** - Benefits of each option
3. **Cons** - Drawbacks of each option
4. **Risks** - Potential issues and mitigation
5. **Recommendation** - What the King would do and why

### Spec Phase Enforcement
The King **strictly enforces** specification phases:
```
REQUIREMENTS → DESIGN → TASKS → IMPLEMENTATION → VERIFICATION → DONE
```
**No phase skipping allowed.** Each phase must be validated before advancing.

---

## Auto-Setup (First Run Detection)

**CRITICAL**: When `/king` is invoked, FIRST check if the environment is set up:

### Step 0: Environment & Package Detection

Run these checks in order:

```bash
# Check 1: Is Odoo Spec Workflow package installed globally?
npm list -g @stanleykao72/claude-code-spec-workflow-odoo 2>/dev/null || NEED_ODOO_PKG=true

# Check 2: Is Claude-Flow initialized in this project?
if [ ! -d ".claude-flow" ] && [ ! -d ".swarm" ]; then
    NEED_CLAUDE_FLOW=true
fi

# Check 3: Is Odoo steering configured for this project?
if [ ! -d ".odoo-dev/steering" ] && [ ! -f ".odoo-dev/config.json" ]; then
    NEED_ODOO_SETUP=true
fi

# Check 4: Are MCP servers configured?
claude mcp list 2>/dev/null | grep -q "claude-flow" || NEED_MCP=true

# Check 5: Is pytest-odoo installed?
python3 -c "import pytest_odoo" 2>/dev/null || NEED_PYTEST=true
```

### Auto-Setup Actions

**If ANY check fails, King MUST run the appropriate setup:**

```
╔══════════════════════════════════════════════════════════════════╗
║            👑 KING - FIRST RUN SETUP DETECTED                    ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║ Checking environment...                                          ║
║   [?] Odoo Spec Workflow package                                 ║
║   [?] Claude-Flow & Hive-Mind                                    ║
║   [?] Project steering documents                                 ║
║   [?] MCP Servers                                                ║
║                                                                  ║
║ Running automatic setup for missing components...                ║
╚══════════════════════════════════════════════════════════════════╝
```

**Execute these commands based on what's missing:**

```bash
# 1. Install Odoo Spec Workflow package (if not installed)
if [ "$NEED_ODOO_PKG" = true ]; then
    echo "📦 Installing Odoo Spec Workflow package..."
    npm install -g @stanleykao72/claude-code-spec-workflow-odoo
fi

# 2. Initialize Claude-Flow (if not initialized)
if [ "$NEED_CLAUDE_FLOW" = true ]; then
    echo "🔧 Initializing Claude-Flow..."
    npx claude-flow@alpha init --force
    npx claude-flow@alpha hive-mind init
fi

# 3. Setup Odoo project (if not configured)
if [ "$NEED_ODOO_SETUP" = true ]; then
    echo "📋 Setting up Odoo Spec Workflow..."
    npx @stanleykao72/claude-code-spec-workflow-odoo setup
    npx @stanleykao72/claude-code-spec-workflow-odoo odoo-setup
fi

# 4. Add MCP servers (if missing)
if [ "$NEED_MCP" = true ]; then
    echo "🔌 Configuring MCP servers..."
    claude mcp add claude-flow -- npx claude-flow@alpha mcp start
    claude mcp add memory -- npx -y @modelcontextprotocol/server-memory
fi
```

### Setup Complete Display

```
╔══════════════════════════════════════════════════════════════════╗
║            👑 KING - SETUP COMPLETE                              ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║ ✅ Odoo Spec Workflow package installed                          ║
║ ✅ Claude-Flow & Hive-Mind initialized                           ║
║ ✅ Project steering ready                                        ║
║ ✅ MCP Servers configured                                        ║
║                                                                  ║
║ Proceeding with normal King operations...                        ║
╚══════════════════════════════════════════════════════════════════╝
```

**After setup, proceed with normal King logic.**

---

## Decision Logic

```
┌─────────────────────────────────────────────────────────────────┐
│              👑 KING DECISION TREE (PDC Standard)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  0. CHECK: Is environment set up?                               │
│     NO  → RUN AUTO-SETUP (Claude-Flow + Odoo Spec Workflow)     │
│     YES → Continue                                              │
│                                                                 │
│  1. CHECK: Does steering context exist?                         │
│     NO  → DECISION: Run /odoo-steering first                    │
│     YES → Continue                                              │
│                                                                 │
│  2. CHECK: Does specification exist for target?                 │
│     NO  → DECISION: Create spec with /odoo-spec-create          │
│     YES → Check current phase                                   │
│                                                                 │
│  3. DETECT & ENFORCE PHASE:                                     │
│     REQUIREMENTS → Validate completeness → DESIGN               │
│     DESIGN       → Validate architecture → TASKS                │
│     TASKS        → Validate breakdown    → IMPLEMENTATION       │
│     IMPLEMENT    → Execute with swarm    → VERIFICATION         │
│     VERIFY       → Run all tests         → DONE                 │
│                                                                 │
│  4. EXECUTION STRATEGY:                                         │
│     1-3 tasks  → Direct execution (faster, less overhead)       │
│     4+ tasks   → Hive-Mind swarm (parallel, coordinated)        │
│     Critical   → Byzantine consensus (safety-first)             │
│                                                                 │
│  5. EVERY DECISION: Provide pros/cons/risks analysis            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Status Dashboard

When invoked, display:

```
╔══════════════════════════════════════════════════════════════════╗
║            👑 PDC STANDARD - KING ORCHESTRATOR                   ║
╠══════════════════════════════════════════════════════════════════╣
║ Project:      [Project Name]                                     ║
║ Odoo Version: [19.0 / 18.0 / etc.]                               ║
║ Steering:     [✓ Configured / ✗ Not Setup]                       ║
║ Active Specs: [X features, Y bugs]                               ║
║ Claude-Flow:  [Active: N agents / Inactive]                      ║
╠══════════════════════════════════════════════════════════════════╣
║ CURRENT PHASE: [REQUIREMENTS/DESIGN/TASKS/IMPLEMENTATION/DONE]   ║
║ PROGRESS:      [████████░░] 80% (8/10 tasks)                     ║
╠══════════════════════════════════════════════════════════════════╣
║ 🎯 RECOMMENDED ACTION:                                           ║
║    [Specific action]                                             ║
║                                                                  ║
║ 📊 ANALYSIS:                                                     ║
║    ✅ Pros:  [Benefits]                                          ║
║    ⚠️  Cons:  [Drawbacks]                                         ║
║    🔴 Risks: [Potential issues]                                  ║
║                                                                  ║
║ 💡 KING'S DECISION: [What I would do and why]                    ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Phase Enforcement & Recommendations

### Phase 1: REQUIREMENTS
**Gate Criteria**: All functional and non-functional requirements documented

```
📋 REQUIREMENTS PHASE

Current State: [X/Y criteria met]

OPTIONS:
┌─────────────────────────────────────────────────────────────────┐
│ Option A: Advance to Design (if criteria met)                   │
│   ✅ Pros:  Move faster, maintain momentum                       │
│   ⚠️  Cons:  May miss edge cases discovered later                │
│   🔴 Risks: Rework if requirements incomplete (Medium)          │
├─────────────────────────────────────────────────────────────────┤
│ Option B: Refine Requirements Further                           │
│   ✅ Pros:  More complete picture, fewer surprises               │
│   ⚠️  Cons:  Slower start, potential over-engineering            │
│   🔴 Risks: Analysis paralysis (Low)                            │
├─────────────────────────────────────────────────────────────────┤
│ Option C: Split into smaller modules                            │
│   ✅ Pros:  Faster delivery, easier testing                      │
│   ⚠️  Cons:  More specs to manage, integration complexity        │
│   🔴 Risks: Fragmented implementation (Medium)                  │
└─────────────────────────────────────────────────────────────────┘

💡 KING'S DECISION: [Specific recommendation based on state]
```

### Phase 2: DESIGN
**Gate Criteria**: Odoo architecture, models, views, and security defined

```
🏗️ DESIGN PHASE

Current State: [X/Y components designed]

OPTIONS:
┌─────────────────────────────────────────────────────────────────┐
│ Option A: Extend Existing Odoo Models                           │
│   ✅ Pros:  Faster, leverages Odoo framework                     │
│   ⚠️  Cons:  May inherit unwanted behavior                       │
│   🔴 Risks: Upgrade compatibility issues (Medium)               │
├─────────────────────────────────────────────────────────────────┤
│ Option B: Create New Models                                     │
│   ✅ Pros:  Clean design, full control                           │
│   ⚠️  Cons:  More code to maintain, miss Odoo features           │
│   🔴 Risks: Reinventing the wheel (Medium)                      │
├─────────────────────────────────────────────────────────────────┤
│ Option C: Mixin Approach                                        │
│   ✅ Pros:  Reusable, composable, Odoo-idiomatic                 │
│   ⚠️  Cons:  Requires careful design of mixin boundaries         │
│   🔴 Risks: Mixin conflicts if not careful (Low)                │
└─────────────────────────────────────────────────────────────────┘

💡 KING'S DECISION: [Specific recommendation based on Odoo patterns]
```

### Phase 3: TASKS
**Gate Criteria**: All tasks atomic, testable, with clear acceptance criteria

```
📝 TASKS PHASE

Current State: [X tasks defined, Y validated]

EXECUTION STRATEGY OPTIONS:
┌─────────────────────────────────────────────────────────────────┐
│ Option A: Sequential Execution (Direct)                         │
│   ✅ Pros:  Simple, predictable, easy to debug                   │
│   ⚠️  Cons:  Slower for many tasks, no parallelism               │
│   🔴 Risks: Blocked by dependencies (Low)                       │
│   Best for: 1-3 simple tasks                                    │
├─────────────────────────────────────────────────────────────────┤
│ Option B: Parallel Swarm (Hive-Mind)                            │
│   ✅ Pros:  Fast execution, specialized agents                   │
│   ⚠️  Cons:  More coordination overhead, potential conflicts     │
│   🔴 Risks: Merge conflicts, race conditions (Medium)           │
│   Best for: 4+ independent tasks                                │
├─────────────────────────────────────────────────────────────────┤
│ Option C: Staged Rollout                                        │
│   ✅ Pros:  Verify incrementally, catch issues early             │
│   ⚠️  Cons:  Slower overall, more checkpoints                    │
│   🔴 Risks: Scope creep between stages (Low)                    │
│   Best for: High-risk or complex modules                        │
└─────────────────────────────────────────────────────────────────┘

💡 KING'S DECISION: Based on [X] tasks with [Y] dependencies,
   I recommend [Option] because [reason].
```

### Phase 4: IMPLEMENTATION
**Gate Criteria**: All tasks complete with passing tests

```
⚙️ IMPLEMENTATION PHASE

Progress: [X/Y tasks complete]

SWARM CONFIGURATION:
┌─────────────────────────────────────────────────────────────────┐
│ Topology Options:                                               │
│                                                                 │
│ • Hierarchical: Queen coordinates specialists                   │
│   Best for: Complex multi-component modules                     │
│                                                                 │
│ • Mesh: Peer-to-peer coordination                               │
│   Best for: Tightly integrated components                       │
│                                                                 │
│ • Star: Central coordinator with workers                        │
│   Best for: Independent parallel tasks                          │
└─────────────────────────────────────────────────────────────────┘

Claude-Flow Command:
npx claude-flow hive-mind spawn \
  "Implement [module] tasks" \
  --queen-type strategic \
  --max-workers [count]
```

### Phase 5: VERIFICATION
**Gate Criteria**: All tests pass, coverage met, Odoo-specific validations complete

```
✅ VERIFICATION PHASE

Test Results:
  Unit Tests:        [✓/✗] [X/Y passing]
  Integration Tests: [✓/✗] [X/Y passing]
  Odoo Tests:        [✓/✗] [X/Y passing]
  Coverage:          [X%] (target: 90%)

OPTIONS:
┌─────────────────────────────────────────────────────────────────┐
│ Option A: Mark Complete (if all pass)                           │
│   ✅ Pros:  Ship faster, get feedback                            │
│   ⚠️  Cons:  May miss edge cases                                 │
│   🔴 Risks: Production issues (Low if tests comprehensive)      │
├─────────────────────────────────────────────────────────────────┤
│ Option B: Add More Tests                                        │
│   ✅ Pros:  Higher confidence, better coverage                   │
│   ⚠️  Cons:  Delayed delivery, diminishing returns               │
│   🔴 Risks: Over-testing simple code (Low)                      │
├─────────────────────────────────────────────────────────────────┤
│ Option C: Manual QA Review                                      │
│   ✅ Pros:  Human verification, UX validation                    │
│   ⚠️  Cons:  Time consuming, subjective                          │
│   🔴 Risks: Inconsistent quality bar (Medium)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Test Command (/king test)

**Intelligent test execution using pytest-odoo:**

### Usage Examples

```bash
# Run all tests for a module
/king test pos_loyalty

# Run with coverage (enforces 90% threshold)
/king test pos_loyalty --coverage

# TDD mode: generate test scaffolding first
/king test pos_loyalty --tdd

# Run only failing tests (fast iteration)
/king test pos_loyalty --failed

# Run specific test type
/king test pos_loyalty --unit
/king test pos_loyalty --integration
/king test pos_loyalty --e2e
```

### Test Execution Strategy

```
/king test [module] [options]

👑 KING TEST ORCHESTRATION:

STEP 1: Detect test configuration
────────────────────────────────
• Check: custom_addons/[module]/tests/ exists
• Check: pytest.ini or pyproject.toml config
• Check: conftest.py fixtures present

STEP 2: Select test strategy
────────────────────────────────
┌─────────────────────────────────────────────────────────────────┐
│ --tdd (Test-Driven Development)                                 │
│   1. Generate test file scaffolding                             │
│   2. Write failing test stubs for each spec task                │
│   3. Run pytest to confirm RED state                            │
│   4. User implements → tests go GREEN                           │
├─────────────────────────────────────────────────────────────────┤
│ --coverage (Coverage Report)                                    │
│   pytest tests/ --cov=custom_addons/[module] \                  │
│     --cov-report=term-missing \                                 │
│     --cov-report=html \                                         │
│     --cov-fail-under=90                                         │
├─────────────────────────────────────────────────────────────────┤
│ --failed (Only Failed Tests)                                    │
│   pytest tests/ --lf -v --tb=short                              │
│   → Fast iteration during development                           │
├─────────────────────────────────────────────────────────────────┤
│ --unit / --integration / --e2e (Test Type)                      │
│   pytest tests/ -m "[type]" -v                                  │
│   → Run only specific test category                             │
├─────────────────────────────────────────────────────────────────┤
│ (default) Full Suite                                            │
│   pytest tests/ -v --tb=short                                   │
│   → Run all tests with concise output                           │
└─────────────────────────────────────────────────────────────────┘

STEP 3: Execute and report
────────────────────────────────
╔══════════════════════════════════════════════════════════════════╗
║                    🧪 TEST RESULTS                               ║
╠══════════════════════════════════════════════════════════════════╣
║ Module:     pos_loyalty                                          ║
║ Total:      24 tests                                             ║
║ Passed:     22 ✓                                                 ║
║ Failed:     2 ✗                                                  ║
║ Skipped:    0                                                    ║
║ Coverage:   87% (target: 90%)                                    ║
╠══════════════════════════════════════════════════════════════════╣
║ FAILURES:                                                        ║
║   tests/test_loyalty.py::TestRewardCalc::test_point_expiry       ║
║   tests/test_loyalty.py::TestRewardCalc::test_tier_upgrade       ║
╠══════════════════════════════════════════════════════════════════╣
║ 💡 KING'S RECOMMENDATION:                                        ║
║    Fix 2 failing tests before proceeding.                        ║
║    Coverage needs 3% more to meet target.                        ║
║    Run: /king test pos_loyalty --failed                          ║
╚══════════════════════════════════════════════════════════════════╝
```

### TDD Scaffolding

When `/king test [module] --tdd` is invoked:

```python
# Generated: custom_addons/[module]/tests/test_[feature].py

from odoo.tests import TransactionCase, tagged

@tagged('at_install', '-post_install')
class TestLoyaltyProgram(TransactionCase):
    """Tests for loyalty program functionality."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # TODO: Setup test data
        cls.loyalty_program = cls.env['loyalty.program'].create({
            'name': 'Test Program',
        })

    def test_point_calculation(self):
        """Task 1: Points should be calculated based on order total."""
        # TODO: Implement test
        self.fail("Not implemented yet")

    def test_reward_redemption(self):
        """Task 2: Rewards should be redeemable at checkout."""
        # TODO: Implement test
        self.fail("Not implemented yet")

    def test_tier_upgrade(self):
        """Task 3: Customer tier should upgrade at thresholds."""
        # TODO: Implement test
        self.fail("Not implemented yet")
```

---

## Integrated Tool Orchestration

The King intelligently combines **three power tools** based on the task at hand:

```
┌─────────────────────────────────────────────────────────────────┐
│                    👑 KING'S TOOL ARSENAL                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔷 CLAUDE-FLOW        │  Multi-agent swarm orchestration       │
│  ─────────────────────│──────────────────────────────────────  │
│  • Hive-Mind          │  Queen-led parallel execution           │
│  • Memory             │  Cross-agent context sharing            │
│  • Swarm Topologies   │  Hierarchical, Mesh, Star, Ring         │
│                                                                 │
│  🟢 ODOO SPEC WORKFLOW │  Specification-driven development      │
│  ─────────────────────│──────────────────────────────────────  │
│  • spec-create        │  Generate module specifications         │
│  • spec-execute       │  Execute spec tasks systematically      │
│  • steering           │  Project standards & tech stack         │
│                                                                 │
│  🧪 PYTEST-ODOO        │  Test-Driven Development               │
│  ─────────────────────│──────────────────────────────────────  │
│  • Unit tests         │  Model and method testing               │
│  • Integration tests  │  Multi-model workflow tests             │
│  • Odoo test tags     │  at_install, post_install               │
│  • Coverage reports   │  pytest-cov with 90% target             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Tool Selection Logic

```
KING'S DECISION MATRIX - Which Tool When?

┌──────────────────────────┬─────────────┬─────────────┬─────────────┐
│ SITUATION                │ CLAUDE-FLOW │ ODOO-SPEC   │ PYTEST      │
├──────────────────────────┼─────────────┼─────────────┼─────────────┤
│ Starting new module      │     ○       │     ●       │     ○       │
│ Planning architecture    │     ○       │     ●       │     ○       │
│ Writing tests first      │     ○       │     ○       │     ●       │
│ Implementing 1-3 tasks   │     ○       │     ●       │     ●       │
│ Implementing 4+ tasks    │     ●       │     ●       │     ●       │
│ Complex multi-file work  │     ●       │     ○       │     ○       │
│ Verifying implementation │     ○       │     ●       │     ●       │
│ Running test suite       │     ○       │     ○       │     ●       │
│ Code review              │     ●       │     ○       │     ○       │
│ Memory/context sharing   │     ●       │     ○       │     ○       │
└──────────────────────────┴─────────────┴─────────────┴─────────────┘
  ● = Primary tool   ○ = Supporting/Not needed
```

### pytest-odoo Integration

**Test-Driven Development Flow:**

```bash
# 1. BEFORE implementation - Write failing tests
pytest custom_addons/[module]/tests/ -v --tb=short

# 2. Run specific test class
pytest custom_addons/[module]/tests/test_[feature].py::Test[Feature] -v

# 3. Run with coverage
pytest custom_addons/[module]/tests/ --cov=custom_addons/[module] --cov-report=term-missing

# 4. Odoo-specific test tags
pytest custom_addons/[module]/tests/ -m "at_install"
pytest custom_addons/[module]/tests/ -m "post_install"

# 5. Run only failed tests (fast iteration)
pytest custom_addons/[module]/tests/ --lf -v
```

**King's Test Strategy:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    🧪 TEST PYRAMID FOR ODOO                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                         ┌─────────┐                             │
│                        │   E2E   │  Playwright UI tests         │
│                       │  Tests  │  (10% - critical flows)      │
│                      └─────────┘                                │
│                     ┌───────────────┐                           │
│                    │  Integration  │  Multi-model tests         │
│                   │     Tests     │  (30% - workflows)         │
│                  └───────────────┘                              │
│                ┌─────────────────────┐                          │
│               │      Unit Tests      │  Model/method tests      │
│              │    (60% - fast)       │  Mock external deps      │
│             └─────────────────────────┘                         │
│                                                                 │
│  TARGET: 90% coverage with meaningful tests                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Claude-Flow Swarm Management

```bash
# King automatically spawns swarms when needed
npx claude-flow@alpha swarm init --topology hierarchical --max-agents 8

# Spawn specialized agents for Odoo tasks
npx claude-flow@alpha hive-mind spawn "[objective]" \
  --queen-type strategic \
  --max-workers 5

# Monitor swarm progress
npx claude-flow@alpha hive-mind status

# Memory coordination
npx claude-flow@alpha memory store --key "module/[name]/decisions" --value "[JSON]"
npx claude-flow@alpha memory search --pattern "module/*"
```

### Combined Workflow Example

```
/king start pos_loyalty_rewards

👑 KING ORCHESTRATION SEQUENCE:

PHASE 1: SPECIFICATION (Odoo Spec Workflow)
───────────────────────────────────────────
1. /odoo-spec-create pos_loyalty_rewards
2. Gather requirements interactively
3. Generate design document
4. Break into atomic tasks
→ Output: .odoo-dev/specs/pos_loyalty_rewards/

PHASE 2: TEST SCAFFOLDING (pytest-odoo)
───────────────────────────────────────────
1. Generate test file structure
   tests/
   ├── __init__.py
   ├── test_loyalty_models.py      # Unit tests
   ├── test_loyalty_workflow.py    # Integration
   └── test_loyalty_ui.py          # E2E (Playwright)

2. Write failing tests for each task
   pytest tests/ -v  # All should FAIL initially
→ Output: Red tests awaiting implementation

PHASE 3: IMPLEMENTATION (Claude-Flow + Odoo Spec)
───────────────────────────────────────────
Decision: 6 tasks → USE HIVE-MIND SWARM

npx claude-flow@alpha hive-mind spawn \
  "Implement pos_loyalty_rewards module" \
  --queen-type strategic \
  --max-workers 4

Swarm executes:
├── Coder-1: models/loyalty_program.py
├── Coder-2: models/loyalty_reward.py
├── Coder-3: static/src/js/loyalty_pos.js
├── Tester-1: Running tests after each impl
└── Queen: Coordinating, resolving conflicts

pytest tests/ --lf  # Run only failing tests
→ Output: Green tests, implemented code

PHASE 4: VERIFICATION (pytest-odoo)
───────────────────────────────────────────
1. Full test suite
   pytest tests/ -v --cov --cov-report=html

2. Coverage check
   Coverage: 92% ✓ (target: 90%)

3. Odoo test validation
   pytest tests/ -m "post_install"
→ Output: Verified, ready for review

PHASE 5: COMPLETION
───────────────────────────────────────────
1. Update spec status to DONE
2. Generate summary report
3. Clean up swarm resources
→ Output: Module complete with full test coverage
```

---

## Decision Command

Use `/king decide <question>` for any architectural or implementation decision:

```
/king decide "Should we extend pos.order or create a custom model?"

╔══════════════════════════════════════════════════════════════════╗
║                    👑 KING'S DECISION ANALYSIS                    ║
╠══════════════════════════════════════════════════════════════════╣
║ Question: Extend pos.order vs custom model                       ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║ OPTION A: Extend pos.order (_inherit)                            ║
║ ────────────────────────────────────────────────────────────────║
║ ✅ Pros:                                                          ║
║    • Inherits all existing POS order functionality               ║
║    • Works with existing reports and workflows                   ║
║    • Odoo-standard approach, easier upgrades                     ║
║                                                                  ║
║ ⚠️  Cons:                                                         ║
║    • May inherit unwanted constraints or behaviors               ║
║    • Changes affect ALL pos.order records                        ║
║    • Potential conflicts with other modules                      ║
║                                                                  ║
║ 🔴 Risks:                                                         ║
║    • Upgrade breakage if pos.order changes (Medium)              ║
║    • Performance impact on existing orders (Low)                 ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║ OPTION B: Custom Model (new model)                               ║
║ ────────────────────────────────────────────────────────────────║
║ ✅ Pros:                                                          ║
║    • Complete control over fields and behavior                   ║
║    • No conflicts with other modules                             ║
║    • Can optimize for specific use case                          ║
║                                                                  ║
║ ⚠️  Cons:                                                         ║
║    • Must reimplement POS integration                            ║
║    • More code to maintain                                       ║
║    • May miss Odoo improvements to pos.order                     ║
║                                                                  ║
║ 🔴 Risks:                                                         ║
║    • Reinventing the wheel (Medium)                              ║
║    • Integration bugs with POS UI (Medium)                       ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║ 💡 KING'S RECOMMENDATION:                                         ║
║                                                                  ║
║ Extend pos.order with _inherit. This is the Odoo-standard        ║
║ approach and ensures compatibility with the POS ecosystem.       ║
║                                                                  ║
║ Why: Custom models for core POS functionality create            ║
║ maintenance burden and integration complexity. Use mixin         ║
║ patterns if you need reusability across multiple models.         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Odoo Spec Workflow Commands

The King coordinates these PDC Standard Odoo commands:

| Command | Purpose |
|---------|---------|
| `/odoo-steering` | Initialize project standards and tech stack |
| `/odoo-spec-create <name>` | Create new Odoo module specification |
| `/odoo-spec-status [name]` | Check specification progress |
| `/odoo-spec-execute [name]` | Execute specification tasks |
| `/odoo-spec-list` | List all specifications |
| `/odoo-bug-create` | Create bug fix specification |
| `/odoo-bug-verify` | Verify bug fix completion |

---

## Example Workflows

### Start New Odoo Module
```bash
/king start pos_loyalty_advanced

# King Analysis:
# - No spec exists for this module
# - Steering documents: ✓ Present
# - Recommended: Create specification first

# King executes: /odoo-spec-create pos_loyalty_advanced
# Guides through requirements → design → tasks
# Then spawns swarm for implementation
```

### Continue Work
```bash
/king continue

# King detects:
# - Active spec: "pos_customer_display" in TASKS phase
# - 5 tasks defined, 2 completed
# - Recommended: Execute remaining 3 tasks

# King provides options with pros/cons
# User selects, King executes with swarm
```

### Make Decision
```bash
/king decide "Database: PostgreSQL vs MySQL for multi-tenant Odoo?"

# King provides full analysis:
# - PostgreSQL pros/cons/risks
# - MySQL pros/cons/risks
# - Recommendation with reasoning (PostgreSQL, as Odoo requires it)
```

---

## Error Handling

### Validation Failure
```
⚠️ PHASE GATE BLOCKED: Requirements incomplete

Missing Criteria:
1. Non-functional requirements not defined
2. Security access rules missing
3. Performance targets not specified

OPTIONS:
┌─────────────────────────────────────────────────────────────────┐
│ A: Complete missing requirements (Recommended)                  │
│    ✅ Ensures solid foundation                                   │
│    🔴 Risk if skipped: Rework later (High)                      │
├─────────────────────────────────────────────────────────────────┤
│ B: Mark as N/A with justification                               │
│    ✅ Faster if truly not applicable                             │
│    🔴 Risk: May bite you later (Medium)                         │
├─────────────────────────────────────────────────────────────────┤
│ C: Override gate (Not Recommended)                              │
│    ⚠️  Violates PDC Standard process                             │
│    🔴 Risk: Technical debt, bugs (High)                         │
└─────────────────────────────────────────────────────────────────┘

💡 KING'S DECISION: Complete the requirements. Taking shortcuts
   here costs 10x more to fix later. I'll help you define them.
```

### Swarm Failure Recovery
```
🔴 SWARM ISSUE: Agent failure detected

Failed: coder-worker-3
Task: Implement receipt printing
Error: Timeout after 5 minutes

RECOVERY OPTIONS:
┌─────────────────────────────────────────────────────────────────┐
│ A: Retry same agent                                             │
│    ✅ Simple, may work on transient issues                       │
│    🔴 Risk: Same failure if systemic (Medium)                   │
├─────────────────────────────────────────────────────────────────┤
│ B: Reassign to fresh agent                                      │
│    ✅ Clean state, different approach possible                   │
│    ⚠️  May take longer to ramp up context                        │
├─────────────────────────────────────────────────────────────────┤
│ C: Execute manually (break out of swarm)                        │
│    ✅ Direct control, can debug interactively                    │
│    ⚠️  Loses parallelism benefits                                │
└─────────────────────────────────────────────────────────────────┘

💡 KING'S DECISION: Try B first. Fresh agent often succeeds
   where previous failed. If B fails, fall back to C.
```

---

## Configuration

### PDC Standard Settings
```json
{
  "stack": "PDC Standard",
  "odoo_version": "19.0",
  "phases": ["requirements", "design", "tasks", "implementation", "verification"],
  "phase_gates": {
    "requirements": ["functional", "non_functional", "security", "performance"],
    "design": ["models", "views", "security_rules", "api"],
    "tasks": ["atomic", "testable", "acceptance_criteria"],
    "implementation": ["code_complete", "tests_pass"],
    "verification": ["coverage_90", "odoo_tests_pass", "security_audit"]
  },
  "swarm": {
    "threshold": 4,
    "default_topology": "hierarchical",
    "consensus_required": ["security", "architecture"]
  }
}
```

---

## The King's Principles

> **"Every decision has tradeoffs. The King's role is to illuminate them."**
>
> 1. **No phase skipping** - Each phase exists for a reason
> 2. **Pros/cons always** - Informed decisions beat fast decisions
> 3. **Risk awareness** - Know what can go wrong before it does
> 4. **Swarm for scale** - Parallel execution when complexity demands
> 5. **Spec is law** - The specification is the source of truth
> 6. **Flow for coordination** - Claude-Flow orchestrates the swarm
>
> **PDC Standard ensures Odoo quality. The King enforces it.**

---

$ARGUMENTS: action target options
