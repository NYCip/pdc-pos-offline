# Project Paths Configuration

## Odoo Instance: pwh19.iug.net
**Version**: Odoo 19

## Directory Structure

| Path | Description |
|------|-------------|
| `/var/odoo/pwh19.iug.net/src/odoo/addons` | Odoo core addons |
| `/var/odoo/pwh19.iug.net/extra-addons` | Custom/extra addons |
| `/var/odoo/pwh19.iug.net/odoo.conf` | Odoo configuration |
| `/var/odoo/pwh19.iug.net/src/odoo` | Odoo source |

## Quick Commands

```bash
# Restart Odoo service
sudo systemctl restart odoo@pwh19.iug.net

# View logs
sudo journalctl -u odoo@pwh19.iug.net -f

# Check module list
ls /var/odoo/pwh19.iug.net/extra-addons/

# Search native modules
find /var/odoo/pwh19.iug.net/src/odoo/addons -maxdepth 1 -type d -name "*keyword*"
```

## CRITICAL: Check Native First

Before building ANY feature, search Odoo native modules:
```bash
find /var/odoo/pwh19.iug.net/src/odoo/addons -maxdepth 1 -type d | sort
```

Common native modules (DO NOT REBUILD):
- `/var/odoo/pwh19.iug.net/src/odoo/addons/point_of_sale` - Core POS
- `/var/odoo/pwh19.iug.net/src/odoo/addons/pos_loyalty` - Loyalty programs
- `/var/odoo/pwh19.iug.net/src/odoo/addons/pos_discount` - Discounts
- `/var/odoo/pwh19.iug.net/src/odoo/addons/pos_gift_card` - Gift cards
- `/var/odoo/pwh19.iug.net/src/odoo/addons/pos_sale` - Sale integration

## Context7 for Documentation

```
mcp__context7__query-docs { libraryId: "/odoo/odoo", query: "POS module Odoo 19" }
```
