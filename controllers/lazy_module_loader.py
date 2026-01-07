# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

"""
Lazy Module Loader Controller

Handles on-demand loading of lazy modules for PDC POS Offline Phase 3.
Provides HTTP endpoints for serving module code with caching headers.

Key Features:
- Lazy module registry with dependencies
- Caching with TTL support
- Error handling and recovery
- Request logging and monitoring
"""

from odoo import http, fields
from datetime import datetime, timedelta
import logging
import os
import mimetypes

_logger = logging.getLogger(__name__)


class LazyModuleLoader(http.Controller):
    """Controller for serving lazy-loaded modules"""

    # Module registry with metadata
    LAZY_MODULES = {
        'reports': {
            'file': 'pdc_pos_offline/static/src/js/modules/reports.js',
            'dependencies': ['odoo.web', 'odoo.pos'],
            'cache': True,
            'ttl': 3600,
            'description': 'POS reporting and analytics features',
        },
        'settings': {
            'file': 'pdc_pos_offline/static/src/js/modules/settings.js',
            'dependencies': ['odoo.web', 'odoo.pos'],
            'cache': True,
            'ttl': 3600,
            'description': 'POS configuration and settings interface',
        },
        'advanced': {
            'file': 'pdc_pos_offline/static/src/js/modules/advanced.js',
            'dependencies': ['odoo.pos'],
            'cache': True,
            'ttl': 3600,
            'description': 'Advanced POS features (discounts, loyalty, etc)',
        },
        'printing': {
            'file': 'pdc_pos_offline/static/src/js/modules/printing.js',
            'dependencies': ['odoo.pos'],
            'cache': True,
            'ttl': 3600,
            'description': 'Receipt printing and label generation',
        },
        'customer_management': {
            'file': 'pdc_pos_offline/static/src/js/modules/customer_management.js',
            'dependencies': ['odoo.pos'],
            'cache': True,
            'ttl': 3600,
            'description': 'Customer profiles and management',
        },
    }

    @http.route('/pos/lazy-modules/list', type='json', auth='public')
    def list_modules(self):
        """List all available lazy modules with metadata"""
        try:
            modules = []
            for name, info in self.LAZY_MODULES.items():
                modules.append({
                    'name': name,
                    'dependencies': info.get('dependencies', []),
                    'description': info.get('description', ''),
                    'cache': info.get('cache', False),
                })

            _logger.info('Listed %d lazy modules', len(modules))
            return {
                'modules': modules,
                'timestamp': fields.Datetime.now().isoformat(),
                'status': 200,
            }
        except Exception as e:
            _logger.error('Error listing modules: %s', str(e))
            return {
                'error': 'Failed to list modules',
                'details': str(e),
                'status': 500,
            }

    @http.route('/pos/lazy-modules/<module_name>', type='http', auth='public')
    def get_module(self, module_name, **kwargs):
        """
        Serve lazy module with caching headers

        Args:
            module_name: Name of the module to load

        Returns:
            HTTP Response with module code and cache headers
        """
        if module_name not in self.LAZY_MODULES:
            _logger.warning('Requested non-existent module: %s', module_name)
            return http.Response(
                'Module not found',
                status=404,
                content_type='application/json',
                headers={
                    'Content-Type': 'application/json',
                }
            )

        module_info = self.LAZY_MODULES[module_name]

        try:
            # Get file path (handle both relative and absolute paths)
            module_path = module_info['file']
            if not os.path.isabs(module_path):
                # Relative to Odoo addons directory
                addons_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
                module_path = os.path.join(addons_path, module_path)

            # Check if file exists
            if not os.path.exists(module_path):
                _logger.error('Module file not found: %s', module_path)
                return http.Response(
                    'Module file not found',
                    status=404,
                    content_type='application/json',
                )

            # Read module code
            with open(module_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Create response
            response = http.Response(
                content,
                content_type='application/javascript',
            )

            # Set cache headers
            if module_info.get('cache', False):
                ttl = module_info.get('ttl', 3600)
                expires = datetime.utcnow() + timedelta(seconds=ttl)

                response.headers.update({
                    'Cache-Control': 'public, max-age={}'.format(ttl),
                    'Content-Type': 'application/javascript',
                    'ETag': '"{}"'.format(hash(content) & 0x7fffffff),
                    'Last-Modified': datetime.utcfromtimestamp(
                        os.path.getmtime(module_path)
                    ).strftime('%a, %d %b %Y %H:%M:%S GMT'),
                })

            _logger.info(
                'Served lazy module: %s (%d bytes)',
                module_name,
                len(content)
            )

            return response

        except IOError as e:
            _logger.error('IO error reading module %s: %s', module_name, str(e))
            return http.Response(
                'Error reading module file',
                status=500,
                content_type='application/json',
            )
        except Exception as e:
            _logger.error('Unexpected error loading module %s: %s', module_name, str(e))
            return http.Response(
                'Internal server error',
                status=500,
                content_type='application/json',
            )

    @http.route('/pos/lazy-modules/status', type='json', auth='public')
    def module_status(self):
        """
        Get comprehensive module status including availability and sizes

        Returns:
            JSON object with module metadata and statistics
        """
        try:
            available_modules = []
            total_size_bytes = 0
            modules_info = []

            for name, info in self.LAZY_MODULES.items():
                module_path = info['file']
                if not os.path.isabs(module_path):
                    addons_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
                    module_path = os.path.join(addons_path, module_path)

                try:
                    if os.path.exists(module_path):
                        file_size = os.path.getsize(module_path)
                        total_size_bytes += file_size
                        available_modules.append(name)
                        modules_info.append({
                            'name': name,
                            'size_bytes': file_size,
                            'size_kb': round(file_size / 1024, 2),
                            'cache_ttl': info.get('ttl', 0),
                            'available': True,
                        })
                    else:
                        modules_info.append({
                            'name': name,
                            'available': False,
                            'reason': 'File not found',
                        })
                except Exception as e:
                    modules_info.append({
                        'name': name,
                        'available': False,
                        'reason': str(e),
                    })

            _logger.info(
                'Module status requested: %d available, %d bytes total',
                len(available_modules),
                total_size_bytes
            )

            return {
                'available_modules': available_modules,
                'total_count': len(self.LAZY_MODULES),
                'available_count': len(available_modules),
                'total_size_bytes': total_size_bytes,
                'total_size_kb': round(total_size_bytes / 1024, 2),
                'modules': modules_info,
                'timestamp': fields.Datetime.now().isoformat(),
                'status': 200,
            }

        except Exception as e:
            _logger.error('Error getting module status: %s', str(e))
            return {
                'error': 'Failed to get module status',
                'details': str(e),
                'status': 500,
            }

    @http.route('/pos/lazy-modules/validate', type='json', auth='public', methods=['POST'])
    def validate_modules(self, **kwargs):
        """
        Validate that all lazy modules are properly configured and accessible

        Returns:
            JSON object with validation results
        """
        try:
            validation_results = {
                'valid': True,
                'modules': [],
                'issues': [],
            }

            for name, info in self.LAZY_MODULES.items():
                module_check = {
                    'name': name,
                    'valid': True,
                    'checks': {
                        'exists': False,
                        'readable': False,
                        'valid_dependencies': True,
                    }
                }

                try:
                    module_path = info['file']
                    if not os.path.isabs(module_path):
                        addons_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
                        module_path = os.path.join(addons_path, module_path)

                    # Check if file exists
                    if os.path.exists(module_path):
                        module_check['checks']['exists'] = True

                        # Check if readable
                        if os.access(module_path, os.R_OK):
                            module_check['checks']['readable'] = True
                        else:
                            module_check['valid'] = False
                            validation_results['issues'].append(
                                f"Module '{name}' is not readable at {module_path}"
                            )
                    else:
                        module_check['valid'] = False
                        validation_results['issues'].append(
                            f"Module '{name}' not found at {module_path}"
                        )

                    # Validate dependencies
                    dependencies = info.get('dependencies', [])
                    if not isinstance(dependencies, list):
                        module_check['checks']['valid_dependencies'] = False
                        module_check['valid'] = False
                        validation_results['issues'].append(
                            f"Module '{name}' has invalid dependencies configuration"
                        )

                except Exception as e:
                    module_check['valid'] = False
                    validation_results['issues'].append(
                        f"Error checking module '{name}': {str(e)}"
                    )

                if not module_check['valid']:
                    validation_results['valid'] = False

                validation_results['modules'].append(module_check)

            validation_results['timestamp'] = fields.Datetime.now().isoformat()
            validation_results['status'] = 200

            _logger.info(
                'Module validation complete: %s',
                'valid' if validation_results['valid'] else 'has issues'
            )

            return validation_results

        except Exception as e:
            _logger.error('Error validating modules: %s', str(e))
            return {
                'valid': False,
                'error': 'Validation failed',
                'details': str(e),
                'status': 500,
            }
