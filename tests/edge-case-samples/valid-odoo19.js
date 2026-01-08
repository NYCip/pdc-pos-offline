/** @odoo-module */

// Valid Odoo 19 JavaScript - All Patterns PASS

import { Component, xml } from '@odoo/owl';
import { registry } from '@web/core/registry';
import { useService } from '@web/core/utils/hooks';

/**
 * GroceryProductList - OWL Component for Odoo 19
 * Uses modern JavaScript ES modules and OWL patterns
 */
export class GroceryProductList extends Component {
    static template = xml`
        <div class="grocery-list">
            <div t-foreach="products" t-as="product" class="product-item">
                <span t-esc="product.name"/>
                <span t-esc="product.price"/>
                <button t-on-click="() => this.selectProduct(product)">
                    Select
                </button>
            </div>
        </div>
    `;

    static props = {
        products: Array,
        onSelect: Function,
    };

    constructor(props) {
        super(props);
        this.orm = useService('orm');
    }

    async selectProduct(product) {
        await this.orm.call('grocery.product', 'do_something', [product.id]);
        this.props.onSelect(product);
    }
}

/**
 * GroceryProductForm - OWL Component for product editing
 */
export class GroceryProductForm extends Component {
    static template = 'grocery_module.ProductForm';
    static components = {
        GroceryProductList,
    };

    setup() {
        this.state = useState({
            loading: false,
            error: null,
        });
    }

    async handleSave() {
        this.state.loading = true;
        try {
            // Use OWL patterns instead of jQuery
            const form = document.querySelector('form.product-form');
            const data = new FormData(form);
            // Process form data
        } catch (error) {
            this.state.error = error.message;
        } finally {
            this.state.loading = false;
        }
    }
}

/**
 * Action handler using modern registry system
 */
registry.category('actions').add(
    'grocery_module.product_list_action',
    async (env, action) => {
        const products = await env.services.orm.search_read(
            'grocery.product',
            [],
            ['id', 'name', 'price']
        );

        return {
            type: 'ir.actions.client',
            tag: 'grocery_list',
            context: {
                products: products,
            },
        };
    }
);

/**
 * Valid event handlers using OWL t-on-* directives
 * NOT using jQuery .on() or .click()
 */
export class ProductActions extends Component {
    handleProductClick(product) {
        // Handle click using OWL event handler
        console.log('Product clicked:', product.name);
    }

    handleFormSubmit(event) {
        // Handle form submission using standard events
        event.preventDefault();
        console.log('Form submitted');
    }

    render() {
        return xml`
            <div>
                <button t-on-click="handleProductClick">Click Me</button>
                <form t-on-submit="handleFormSubmit">
                    <input name="product_name"/>
                </form>
            </div>
        `;
    }
}

/**
 * Service using modern Odoo 19 patterns
 */
export class GroceryService {
    constructor(orm) {
        this.orm = orm;
    }

    async getProducts() {
        return await this.orm.search_read(
            'grocery.product',
            [],
            ['id', 'name', 'price', 'category_id']
        );
    }

    async createProduct(data) {
        return await this.orm.create('grocery.product', [data]);
    }

    async updateProduct(id, data) {
        return await this.orm.write('grocery.product', [id], data);
    }
}

// Register service
registry.category('services').add('grocery', GroceryService);
