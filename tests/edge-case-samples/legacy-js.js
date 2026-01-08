// LEGACY JavaScript Patterns - These SHOULD be flagged

// ============================================================================
// PATTERN 1: Legacy odoo.define() (SHOULD BE FLAGGED)
// ============================================================================

odoo.define('my_module.LegacyWidget', function(require) {
    var Widget = require('web.Widget');
    var core = require('web.core');

    var LegacyWidget = Widget.extend({
        template: 'my_module.LegacyWidget',
        events: {
            'click .button': '_on_button_click'
        },

        _on_button_click: function() {
            console.log('Button clicked');
        },

        do_something: function() {
            return 'legacy code';
        }
    });

    return LegacyWidget;
});

// ============================================================================
// PATTERN 2: Legacy require('web.*') (SHOULD BE FLAGGED)
// ============================================================================

var session = require('web.session');
var core = require('web.core');
var time = require('web.time');
var utils = require('web.utils');
var field_utils = require('web.field_utils');

// ============================================================================
// PATTERN 3: Legacy require('point_of_sale.*') (SHOULD BE FLAGGED)
// ============================================================================

var PosDB = require('point_of_sale.DB');
var PosModel = require('point_of_sale.models');
var PosDeviceProxy = require('point_of_sale.DeviceProxy');

// ============================================================================
// PATTERN 4: .extend() pattern (SHOULD BE FLAGGED)
// ============================================================================

var BaseClass = function() {};

BaseClass.extend = function(properties) {
    var Child = function() {};
    Child.prototype = Object.create(this.prototype);
    for (var key in properties) {
        Child.prototype[key] = properties[key];
    }
    return Child;
};

var MyClass = BaseClass.extend({
    name: 'MyClass',
    method: function() {
        return 'doing something';
    }
});

// ============================================================================
// PATTERN 5: jQuery Event Binding (SHOULD BE FLAGGED)
// ============================================================================

$('.my-button').on('click', function() {
    console.log('Clicked!');
});

$('.my-link').on('mouseenter', function() {
    $(this).addClass('highlighted');
});

// ============================================================================
// PATTERN 6: jQuery click() (SHOULD BE FLAGGED)
// ============================================================================

$('.submit-btn').click(function() {
    console.log('Form submitted');
});

// ============================================================================
// PATTERN 7: Legacy action registry (SHOULD BE FLAGGED)
// ============================================================================

core.action_registry.add('my_module.legacy_action', function(session, model) {
    return {
        type: 'ir.actions.client',
        tag: 'legacy_action',
        res_model: 'my.model',
    };
});

// ============================================================================
// EDGE CASE: Patterns in Comments (KNOWN FALSE POSITIVE)
// ============================================================================

// OLD: odoo.define('module', function(require) { ... })
// OLD: var Widget = require('web.Widget');
// OLD: MyClass.extend({ ... })
// OLD: $().on('click', handler);

// See migration guide at:
// https://docs.odoo.com/api/odoo.define-deprecated
// https://docs.odoo.com/api/require-web-deprecated
// https://docs.odoo.com/api/extend-pattern-removed

// ============================================================================
// EDGE CASE: Patterns in Strings (KNOWN FALSE POSITIVE)
// ============================================================================

const migrationGuide = `
ODOO 19 MIGRATION - JavaScript Patterns:

OLD (Don't use):
  - odoo.define('module', function(require) { })
  - var Widget = require('web.Widget');
  - MyClass.extend({ properties })
  - $().on('click', handler)
  - $().click(handler)
  - core.action_registry.add(...)

NEW (Use):
  - /** @odoo-module */
  - import { Component } from '@odoo/owl';
  - class MyClass extends BaseClass { }
  - <Component t-on-click="handler" />
  - registry.category('actions').add(...)
`;

// ============================================================================
// EDGE CASE: Variable names containing patterns (EDGE CASE)
// ============================================================================

const odoo_define_deprecated = true;
const require_web_module = null;
const extend_pattern_removed = false;
