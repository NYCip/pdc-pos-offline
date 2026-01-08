# Technical Stack

## Backend
- **Framework**: Odoo 19
- **Language**: Python 3.12
- **Database**: PostgreSQL 15+
- **ORM**: Odoo ORM (NO raw SQL)

## Frontend
- **Components**: OWL (Odoo Web Library)
- **No jQuery**: Use OWL reactive patterns
- **Assets**: point_of_sale._assets_pos bundle

## Paths
- **Odoo Core**: /var/odoo/pwh19.iug.net/src/odoo
- **Addons**: /var/odoo/pwh19.iug.net/src/odoo/addons
- **Custom**: /var/odoo/pwh19.iug.net/extra-addons
- **Config**: /var/odoo/pwh19.iug.net/odoo.conf

## Testing
- **Unit**: pytest-odoo
- **E2E**: Playwright
- **Coverage**: 90% minimum
