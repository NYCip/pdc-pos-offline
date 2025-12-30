# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
from odoo.exceptions import AccessDenied, ValidationError
import json
import re
import hashlib
import time
import logging

_logger = logging.getLogger(__name__)

# Rate limiting storage (simple in-memory, should be Redis in production)
_rate_limit_cache = {}
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 10  # max requests per window per IP


def _get_client_ip():
    """Get client IP, handling proxy headers"""
    if request.httprequest.headers.get('X-Forwarded-For'):
        return request.httprequest.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.httprequest.remote_addr or 'unknown'


def _check_rate_limit(ip_address, endpoint):
    """Simple rate limiting check"""
    key = f"{endpoint}:{ip_address}"
    now = time.time()

    # Clean old entries
    cutoff = now - RATE_LIMIT_WINDOW
    for k in list(_rate_limit_cache.keys()):
        if _rate_limit_cache[k]['first_request'] < cutoff:
            del _rate_limit_cache[k]

    if key not in _rate_limit_cache:
        _rate_limit_cache[key] = {'count': 1, 'first_request': now}
        return True

    entry = _rate_limit_cache[key]
    if now - entry['first_request'] > RATE_LIMIT_WINDOW:
        _rate_limit_cache[key] = {'count': 1, 'first_request': now}
        return True

    entry['count'] += 1
    if entry['count'] > RATE_LIMIT_MAX_REQUESTS:
        _logger.warning(f"[PDC-Offline] Rate limit exceeded for {ip_address} on {endpoint}")
        return False

    return True


def _sanitize_string(value, max_length=255, pattern=None):
    """Sanitize string input"""
    if not value:
        return None
    if not isinstance(value, str):
        return None
    value = value.strip()[:max_length]
    if pattern and not re.match(pattern, value):
        return None
    return value


class PDCPOSOfflineController(http.Controller):

    @http.route('/pdc_pos_offline/session_beacon', type='http', auth='public', methods=['POST'], csrf=False)
    def session_beacon(self, **kw):
        """
        Receive session backup beacon during page unload.

        This endpoint receives sendBeacon() calls from session_persistence.js
        when the browser is closing. It's a best-effort backup mechanism.

        Security notes:
        - auth='public' because session cookie may not be available during unload
        - CSRF disabled because sendBeacon doesn't support custom headers
        - Data is logged but not used for critical operations
        - Rate limiting protects against abuse
        """
        client_ip = _get_client_ip()

        # Rate limiting
        if not _check_rate_limit(client_ip, 'session_beacon'):
            return 'rate_limited'

        try:
            # Parse JSON from request body
            data = json.loads(request.httprequest.get_data(as_text=True) or '{}')

            # Log for debugging/monitoring (not used for critical operations)
            session_id = data.get('sessionId')
            user_id = data.get('userId')
            timestamp = data.get('timestamp')

            if session_id and user_id:
                _logger.debug(
                    f"[PDC-Offline] Session beacon received: session={session_id}, "
                    f"user={user_id}, time={timestamp}, ip={client_ip}"
                )

            # Return minimal response (beacon doesn't wait for response)
            return 'ok'

        except Exception as e:
            _logger.warning(f"[PDC-Offline] Session beacon error: {str(e)}")
            return 'error'

    @http.route('/pdc_pos_offline/validate_pin', type='jsonrpc', auth='user', website=False)
    def validate_pin(self, user_id=None, pin_hash=None, **kw):
        """
        Validate offline PIN hash for a user.

        Security measures:
        - Requires authenticated user (auth='user')
        - Rate limiting per IP
        - Input validation and sanitization
        - Constant-time comparison to prevent timing attacks
        - Logging of access attempts
        """
        client_ip = _get_client_ip()

        # Rate limiting
        if not _check_rate_limit(client_ip, 'validate_pin'):
            _logger.warning(f"[PDC-Offline] Rate limit exceeded for validate_pin from {client_ip}")
            return {'success': False, 'error': 'Too many requests. Please wait.'}

        # Input validation
        if not user_id or not isinstance(user_id, int) or user_id <= 0:
            _logger.warning(f"[PDC-Offline] Invalid user_id in validate_pin from {client_ip}")
            return {'success': False, 'error': 'Invalid user ID'}

        # Validate pin_hash format (should be 64 char hex for SHA-256)
        pin_hash = _sanitize_string(pin_hash, max_length=64, pattern=r'^[a-fA-F0-9]{64}$')
        if not pin_hash:
            _logger.warning(f"[PDC-Offline] Invalid pin_hash format from {client_ip}")
            return {'success': False, 'error': 'Invalid PIN format'}

        try:
            user = request.env['res.users'].sudo().browse(user_id)

            if not user.exists():
                _logger.warning(f"[PDC-Offline] User {user_id} not found, request from {client_ip}")
                # Return same response to prevent user enumeration
                return {'success': False}

            # Check if user has offline PIN enabled
            if not user.pos_offline_pin_hash:
                _logger.info(f"[PDC-Offline] User {user_id} has no offline PIN set")
                return {'success': False}

            # Constant-time comparison to prevent timing attacks
            stored_hash = user.pos_offline_pin_hash.lower() if user.pos_offline_pin_hash else ''
            provided_hash = pin_hash.lower()

            # Use hmac.compare_digest for constant-time comparison
            import hmac
            is_valid = hmac.compare_digest(stored_hash, provided_hash)

            if is_valid:
                _logger.info(f"[PDC-Offline] Successful PIN validation for user {user_id} from {client_ip}")
                return {
                    'success': True,
                    'user_data': {
                        'id': user.id,
                        'name': user.name,
                        'login': user.login,
                        # Only include POS-relevant data
                        'employee_ids': user.employee_ids.ids if user.employee_ids else [],
                    }
                }
            else:
                _logger.warning(f"[PDC-Offline] Failed PIN validation for user {user_id} from {client_ip}")
                return {'success': False}

        except Exception as e:
            _logger.error(f"[PDC-Offline] Error in validate_pin: {str(e)}")
            return {'success': False, 'error': 'Internal error'}

    @http.route('/pdc_pos_offline/get_offline_config', type='jsonrpc', auth='user', website=False)
    def get_offline_config(self, config_id=None, **kw):
        """
        Get POS configuration for offline mode.

        Security measures:
        - Requires authenticated user
        - Validates config access rights
        - Only returns safe configuration data
        """
        client_ip = _get_client_ip()

        # Rate limiting
        if not _check_rate_limit(client_ip, 'get_offline_config'):
            return {'success': False, 'error': 'Too many requests'}

        # Input validation
        if not config_id or not isinstance(config_id, int) or config_id <= 0:
            return {'success': False, 'error': 'Invalid config ID'}

        try:
            config = request.env['pos.config'].browse(config_id)

            if not config.exists():
                return {'success': False, 'error': 'Configuration not found'}

            # Check if user has access to this POS config
            # (they should be in the allowed users list or have POS manager rights)
            user = request.env.user
            has_access = (
                user.has_group('point_of_sale.group_pos_manager') or
                user in config.pos_session_ids.mapped('user_id')
            )

            if not has_access:
                _logger.warning(f"[PDC-Offline] User {user.id} denied access to config {config_id}")
                return {'success': False, 'error': 'Access denied'}

            # Return only safe configuration data
            return {
                'success': True,
                'config': {
                    'id': config.id,
                    'name': config.name,
                    'iface_offline_enabled': getattr(config, 'iface_offline_enabled', True),
                    'offline_session_timeout': getattr(config, 'offline_session_timeout', 24),
                    # Add other safe config fields as needed
                }
            }

        except Exception as e:
            _logger.error(f"[PDC-Offline] Error in get_offline_config: {str(e)}")
            return {'success': False, 'error': 'Internal error'}