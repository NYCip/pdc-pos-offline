# Valid Odoo 19 Compliant Code - All Patterns PASS

from odoo import models, fields, api
from odoo.exceptions import ValidationError

class GroceryProduct(models.Model):
    _name = 'grocery.product'
    _description = 'Grocery Product'

    name = fields.Char('Product Name', required=True)
    price = fields.Float('Price', required=True)
    category_id = fields.Many2one('product.category', 'Category')
    description = fields.Text('Description')

    @api.constrains('price')
    def _check_price(self):
        for record in self:
            if record.price < 0:
                raise ValidationError('Price cannot be negative')

    def compute_total_sales(self):
        """Odoo 19 compliant method using env.cr"""
        query = "SELECT SUM(amount_total) FROM sale_order WHERE state='done'"
        self.env.cr.execute(query)
        result = self.env.cr.fetchone()
        return result[0] if result else 0.0

    def get_category(self):
        """Using env[] instead of pool.get()"""
        return self.env['product.category'].browse(self.category_id.id)

    def search_by_name(self, name):
        """Using _search() instead of search_fetch()"""
        results = self.env['grocery.product']._search([('name', '=', name)])
        return self.env['grocery.product'].browse(results)

    def group_by_category(self):
        """Using _read_group() instead of read_group()"""
        groups = self.env['grocery.product']._read_group(
            domain=[],
            groupby=['category_id'],
            aggregates=['price:sum']
        )
        return groups

class SaleOrder(models.Model):
    _name = 'sale.order'
    _description = 'Sale Order'

    name = fields.Char('Order Number')
    partner_id = fields.Many2one('res.partner', 'Customer')
    amount_total = fields.Float('Total Amount')
    state = fields.Selection([
        ('draft', 'Draft'),
        ('confirmed', 'Confirmed'),
        ('done', 'Done'),
    ], 'Status')

    def action_confirm(self):
        """Valid Odoo 19 action using env.uid and env.context"""
        current_user_id = self.env.uid
        company_id = self.env.context.get('company_id')

        for order in self:
            order.state = 'confirmed'

        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }

    def get_context_data(self):
        """Valid access to environment context"""
        context = self.env.context
        return {
            'company_id': context.get('company_id'),
            'lang': context.get('lang'),
        }
