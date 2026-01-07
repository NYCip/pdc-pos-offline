# Odoo Steering - Generate Project Steering Documents

## Purpose
Generate or update the project steering documents that define Odoo development standards, business rules, and technical stack.

## Usage
```
/odoo-steering
```

---

## Implementation

### Step 1: Check Existing Steering Documents
Check if `.odoo-dev/steering/` exists with:
- business-rules.md
- technical-stack.md
- module-standards.md

### Step 2: Ask Configuration Questions (if new project)

**Question Set 1 - Project Type:**
- POS/Retail System
- Restaurant/Food Service
- Both (Grocery + Restaurant)

**Question Set 2 - Deployment:**
- Cloud (SaaS)
- On-premise Server
- Hybrid

**Question Set 3 - Integrations:**
- Hardware/IoT (printers, scales, drawers)
- Payment Gateways
- External APIs
- All of the above

**Question Set 4 - Testing Requirements:**
- Standard (70% coverage)
- Strict TDD (90%+ coverage)

**Question Set 5 - Hardware (if applicable):**
- Receipt printers (Epson, Star)
- Label printers (Zebra)
- Cash drawers
- Scales
- Barcode scanners

**Question Set 6 - Offline Requirements:**
- Online only
- Basic offline (queue orders)
- Full offline POS

**Question Set 7 - Multi-tenant:**
- Single store
- Multi-store chain
- Franchise model
- Multi-company

### Step 3: Generate Documents

Copy templates from `.claude/steering/` to `.odoo-dev/steering/` and customize based on answers:

#### business-rules.md
- POS transaction workflows
- Payment processing rules
- Multi-store/franchise architecture
- White-label requirements
- Testing requirements

#### technical-stack.md
- Odoo version and dependencies
- Hardware integration protocols
- Offline mode architecture
- Performance standards

#### module-standards.md
- Module structure
- Naming conventions
- Manifest template
- Model inheritance patterns
- Version numbering

### Step 4: Update Config
Update `.odoo-dev/config.json` with project settings.

### Step 5: Display Confirmation

```
╔══════════════════════════════════════════════════════════════════╗
║            ✅ STEERING DOCUMENTS GENERATED                        ║
╠══════════════════════════════════════════════════════════════════╣
║ Location: .odoo-dev/steering/                                    ║
║                                                                  ║
║ Created:                                                         ║
║   📋 business-rules.md    - Business workflows & rules           ║
║   🏗️  technical-stack.md   - Technology & architecture           ║
║   📐 module-standards.md  - Coding standards & conventions       ║
║                                                                  ║
║ Configuration: .odoo-dev/config.json                             ║
║                                                                  ║
║ Next Steps:                                                      ║
║   1. Review and customize steering documents                     ║
║   2. Run /odoo-spec-create <module> to create specifications     ║
║   3. Run /king <module> to start development                     ║
╚══════════════════════════════════════════════════════════════════╝
```

$ARGUMENTS: none
