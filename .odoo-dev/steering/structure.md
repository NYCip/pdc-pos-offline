# Project Structure

## Odoo Instance: pwh19.iug.net

```
/var/odoo/pwh19.iug.net/
├── src/odoo/                    # Odoo source
│   ├── addons/                  # Core addons (/var/odoo/pwh19.iug.net/src/odoo/addons)
│   │   ├── point_of_sale/       # Core POS
│   │   ├── pos_loyalty/         # Native loyalty
│   │   ├── pos_discount/        # Native discounts
│   │   └── ...
│   └── odoo/                    # Odoo framework
├── extra-addons/                # Custom modules (/var/odoo/pwh19.iug.net/extra-addons)
│   ├── pdc_*/                   # PDC modules
│   └── ...
├── odoo.conf                    # Configuration
└── logs/                        # Log files
```

## Module Template
```
module_name/
├── __init__.py
├── __manifest__.py
├── models/
├── views/
├── security/
│   └── ir.model.access.csv
├── static/src/
│   ├── js/                      # OWL components
│   ├── xml/                     # Templates
│   └── scss/                    # Styles
└── tests/
```

## Commands
```bash
# Restart Odoo
sudo systemctl restart odoo@pwh19.iug.net

# View logs
sudo journalctl -u odoo@pwh19.iug.net -f

# Update module
odoo -c /var/odoo/pwh19.iug.net/odoo.conf -u module_name -d database
```
