# Odoo Spec Execute - Execute Specification Tasks

## Purpose
Execute tasks from a module specification using the Hive-Mind swarm for complex tasks or direct execution for simple ones.

## Usage
```
/odoo-spec-execute <module-name> [task-id]
```

---

## Implementation

1. Load spec context from `custom_addons/<module>/.spec/`
2. If task-id provided, execute that specific task
3. Otherwise, execute all pending tasks
4. For 4+ tasks, spawn Hive-Mind swarm
5. Track progress and mark tasks complete

```bash
npx claude-flow hive-mind spawn \
  "Execute tasks for <module>" \
  --queen-type strategic \
  --max-workers <task-count>
```

$ARGUMENTS: module-name task-id
