# -*- coding: utf-8 -*-
# Copyright 2024-2025 POS.com
# Part of POS.com Retail Management System
# See LICENSE file for full copyright and licensing details.

"""
Lazy Modules Controller - Complete Infrastructure

Provides comprehensive HTTP endpoints for managing lazy-loaded modules
with caching, monitoring, error recovery, and performance tracking.

Endpoints:
- /pos/lazy-modules/list - List available modules
- /pos/lazy-modules/<name> - Serve specific module
- /pos/lazy-modules/status - Get module status
- /pos/lazy-modules/validate - Validate configuration
- /pos/lazy-modules/metrics - Get performance metrics
"""

from odoo import http, fields
from odoo.exceptions import AccessDenied
from datetime import datetime, timedelta
import logging
import os
import hashlib
import json
from collections import defaultdict

_logger = logging.getLogger(__name__)


class LazyModulesController(http.Controller):
    """Complete lazy modules management controller"""

    # Module registry with full metadata
    LAZY_MODULES = {
        'reports': {
            'file': 'pdc_pos_offline/static/src/js/modules/reports.js',
            'dependencies': ['odoo.web', 'odoo.pos'],
            'cache': True,
            'ttl': 3600,
            'description': 'POS reporting and analytics features',
            'weight': 'medium',
            'priority': 'low',
            'bundle_size_kb': 45,
        },
        'settings': {
            'file': 'pdc_pos_offline/static/src/js/modules/settings.js',
            'dependencies': ['odoo.web', 'odoo.pos'],
            'cache': True,
            'ttl': 3600,
            'description': 'POS configuration and settings interface',
            'weight': 'light',
            'priority': 'low',
            'bundle_size_kb': 32,
        },
        'advanced': {
            'file': 'pdc_pos_offline/static/src/js/modules/advanced.js',
            'dependencies': ['odoo.pos'],
            'cache': True,
            'ttl': 3600,
            'description': 'Advanced POS features (discounts, loyalty)',
            'weight': 'medium',
            'priority': 'low',
            'bundle_size_kb': 58,
        },
        'printing': {
            'file': 'pdc_pos_offline/static/src/js/modules/printing.js',
            'dependencies': ['odoo.pos'],
            'cache': True,
            'ttl': 3600,
            'description': 'Receipt printing and label generation',
            'weight': 'light',
            'priority': 'medium',
            'bundle_size_kb': 28,
        },
        'customer_management': {
            'file': 'pdc_pos_offline/static/src/js/modules/customer_management.js',
            'dependencies': ['odoo.pos'],
            'cache': True,
            'ttl': 3600,
            'description': 'Customer profiles and management',
            'weight': 'light',
            'priority': 'medium',
            'bundle_size_kb': 35,
        },
    }

    # In-memory metrics storage
    _metrics = {
        'requests': defaultdict(int),
        'errors': defaultdict(int),
        'cache_hits': defaultdict(int),
        'load_times': defaultdict(list),
        'started_at': datetime.utcnow(),
    }

    @http.route('/pos/lazy-modules/list', type='json', auth='public')
    def list_modules(self):
        """List all available lazy modules"""
        try:
            modules = []
            for name, info in self.LAZY_MODULES.items():
                modules.append({
                    'name': name,
                    'description': info.get('description', ''),
                    'dependencies': info.get('dependencies', []),
                    'weight': info.get('weight', 'unknown'),
                    'priority': info.get('priority', 'unknown'),
                    'cache_ttl': info.get('ttl', 0),
                    'bundle_size_kb': info.get('bundle_size_kb', 0),
                })

            return {
                'success': True,
                'modules': modules,
                'total': len(modules),
                'timestamp': fields.Datetime.now().isoformat(),
                'status': 200,
            }
        except Exception as e:
            _logger.error('Error listing modules: %s', str(e))
            return self._error_response('Failed to list modules', str(e), 500)

    @http.route('/pos/lazy-modules/<module_name>', type='http', auth='public')
    def get_module(self, module_name, **kwargs):
        """
        Serve lazy module with caching headers and metrics tracking

        Args:
            module_name: Name of the module to load

        Returns:
            HTTP Response with module code and cache headers
        """
        self._metrics['requests'][module_name] += 1

        if module_name not in self.LAZY_MODULES:
            self._metrics['errors'][module_name] += 1
            _logger.warning('Requested non-existent module: %s', module_name)
            return http.Response('Module not found', status=404)

        module_info = self.LAZY_MODULES[module_name]

        try:
            module_path = self._resolve_module_path(module_info['file'])

            if not os.path.exists(module_path):
                self._metrics['errors'][module_name] += 1
                _logger.error('Module file not found: %s', module_path)
                return http.Response('Module file not found', status=404)

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
                etag = self._generate_etag(content)
                mtime = datetime.utcfromtimestamp(os.path.getmtime(module_path))

                response.headers.update({
                    'Cache-Control': 'public, max-age={}'.format(ttl),
                    'ETag': etag,
                    'Last-Modified': mtime.strftime('%a, %d %b %Y %H:%M:%S GMT'),
                    'Vary': 'Accept-Encoding',
                })

                self._metrics['cache_hits'][module_name] += 1

            _logger.info('Served lazy module: %s (%d bytes)', module_name, len(content))
            return response

        except Exception as e:
            self._metrics['errors'][module_name] += 1
            _logger.error('Error loading module %s: %s', module_name, str(e))
            return http.Response('Internal server error', status=500)

    @http.route('/pos/lazy-modules/status', type='json', auth='public')
    def module_status(self):
        """Get comprehensive module status"""
        try:
            modules_info = []
            total_size = 0

            for name, info in self.LAZY_MODULES.items():
                module_path = self._resolve_module_path(info['file'])
                available = os.path.exists(module_path) and os.access(module_path, os.R_OK)

                module_data = {
                    'name': name,
                    'available': available,
                    'description': info.get('description', ''),
                }

                if available:
                    size = os.path.getsize(module_path)
                    total_size += size
                    module_data.update({
                        'size_bytes': size,
                        'size_kb': round(size / 1024, 2),
                        'cache_ttl': info.get('ttl', 0),
                    })

                modules_info.append(module_data)

            return {
                'success': True,
                'modules': modules_info,
                'total_size_kb': round(total_size / 1024, 2),
                'timestamp': fields.Datetime.now().isoformat(),
                'status': 200,
            }
        except Exception as e:
            _logger.error('Error getting module status: %s', str(e))
            return self._error_response('Failed to get module status', str(e), 500)

    @http.route('/pos/lazy-modules/validate', type='json', auth='public', methods=['POST'])
    def validate_modules(self, **kwargs):
        """Validate lazy modules configuration and accessibility"""
        try:
            validation_results = {
                'valid': True,
                'modules': [],
                'issues': [],
            }

            for name, info in self.LAZY_MODULES.items():
                check_result = self._validate_module(name, info)

                if not check_result['valid']:
                    validation_results['valid'] = False

                validation_results['modules'].append(check_result)
                validation_results['issues'].extend(check_result.get('issues', []))

            validation_results['timestamp'] = fields.Datetime.now().isoformat()
            validation_results['status'] = 200

            return validation_results

        except Exception as e:
            _logger.error('Error validating modules: %s', str(e))
            return self._error_response('Validation failed', str(e), 500)

    @http.route('/pos/lazy-modules/metrics', type='json', auth='public')
    def get_metrics(self):
        """Get performance metrics for lazy module loading"""
        try:
            metrics_data = {
                'requests': dict(self._metrics['requests']),
                'errors': dict(self._metrics['errors']),
                'cache_hits': dict(self._metrics['cache_hits']),
                'uptime_seconds': (datetime.utcnow() - self._metrics['started_at']).total_seconds(),
            }

            # Calculate load time statistics
            load_time_stats = {}
            for module_name, times in self._metrics['load_times'].items():
                if times:
                    load_time_stats[module_name] = {
                        'min': min(times),
                        'max': max(times),
                        'avg': sum(times) / len(times),
                        'count': len(times),
                    }

            metrics_data['load_times'] = load_time_stats

            # Calculate cache hit rate
            total_requests = sum(self._metrics['requests'].values())
            total_hits = sum(self._metrics['cache_hits'].values())
            metrics_data['cache_hit_rate'] = (
                (total_hits / total_requests * 100) if total_requests > 0 else 0
            )

            return {
                'success': True,
                'metrics': metrics_data,
                'timestamp': fields.Datetime.now().isoformat(),
                'status': 200,
            }

        except Exception as e:
            _logger.error('Error getting metrics: %s', str(e))
            return self._error_response('Failed to get metrics', str(e), 500)

    @http.route('/pos/lazy-modules/reset-metrics', type='json', auth='public', methods=['POST'])
    def reset_metrics(self, **kwargs):
        """Reset performance metrics (useful for testing)"""
        try:
            self._metrics['requests'].clear()
            self._metrics['errors'].clear()
            self._metrics['cache_hits'].clear()
            self._metrics['load_times'].clear()
            self._metrics['started_at'] = datetime.utcnow()

            _logger.info('Metrics reset')
            return {
                'success': True,
                'message': 'Metrics reset successfully',
                'timestamp': fields.Datetime.now().isoformat(),
                'status': 200,
            }
        except Exception as e:
            _logger.error('Error resetting metrics: %s', str(e))
            return self._error_response('Failed to reset metrics', str(e), 500)

    # Private helper methods

    @staticmethod
    def _resolve_module_path(relative_path):
        """Resolve module path from relative to absolute"""
        if os.path.isabs(relative_path):
            return relative_path

        addons_path = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        return os.path.join(addons_path, relative_path)

    @staticmethod
    def _generate_etag(content):
        """Generate ETag from content"""
        content_hash = hashlib.md5(content.encode()).hexdigest()
        return '"{}"'.format(content_hash)

    @staticmethod
    def _validate_module(name, info):
        """Validate a single module"""
        result = {
            'name': name,
            'valid': True,
            'issues': [],
            'checks': {
                'exists': False,
                'readable': False,
                'has_dependencies': False,
            }
        }

        try:
            module_path = LazyModulesController._resolve_module_path(info['file'])

            # Check existence
            if os.path.exists(module_path):
                result['checks']['exists'] = True

                # Check readability
                if os.access(module_path, os.R_OK):
                    result['checks']['readable'] = True
                else:
                    result['valid'] = False
                    result['issues'].append(f"Module '{name}' is not readable")
            else:
                result['valid'] = False
                result['issues'].append(f"Module '{name}' file not found")

            # Check dependencies
            deps = info.get('dependencies', [])
            if isinstance(deps, list) and len(deps) > 0:
                result['checks']['has_dependencies'] = True
            else:
                result['issues'].append(f"Module '{name}' has no dependencies defined")

        except Exception as e:
            result['valid'] = False
            result['issues'].append(f"Error validating module '{name}': {str(e)}")

        return result

    @staticmethod
    def _error_response(message, details='', status_code=500):
        """Create standardized error response"""
        return {
            'success': False,
            'error': message,
            'details': details,
            'timestamp': fields.Datetime.now().isoformat(),
            'status': status_code,
        }
