# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
from odoo.exceptions import AccessDenied, ValidationError
import json
import re
import time
import logging
import threading
from collections import defaultdict

# Import performance optimization modules
from .compression import CompressionController
from .cache_headers import CacheHeadersController

_logger = logging.getLogger(__name__)

# Thread-safe rate limiting for password validation
_password_rate_limit_lock = threading.Lock()
_password_attempts = defaultdict(list)  # {user_id: [(timestamp, ip), ...]}
MAX_PASSWORD_ATTEMPTS = 5
PASSWORD_WINDOW_SECONDS = 60

# General rate limiting storage
_rate_limit_cache = {}
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX_REQUESTS = 10


def _get_client_ip():
    """Get client IP, handling proxy headers."""
    if request.httprequest.headers.get('X-Forwarded-For'):
        return request.httprequest.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.httprequest.remote_addr or 'unknown'


def _check_password_rate_limit(user_id, client_ip):
    """
    Thread-safe rate limiting for password validation.

    Args:
        user_id (int): User ID attempting password validation
        client_ip (str): Client IP address

    Returns:
        bool: True if request allowed, False if rate limit exceeded
    """
    with _password_rate_limit_lock:
        now = time.time()
        window_start = now - PASSWORD_WINDOW_SECONDS

        # Get attempts for this user
        if user_id not in _password_attempts:
            _password_attempts[user_id] = []

        # Remove expired attempts
        _password_attempts[user_id] = [
            (ts, ip) for ts, ip in _password_attempts[user_id]
            if ts > window_start
        ]

        # Check if limit exceeded
        if len(_password_attempts[user_id]) >= MAX_PASSWORD_ATTEMPTS:
            _logger.warning(
                f"[PDC-Security] Password rate limit exceeded for user {user_id} "
                f"from {client_ip} ({len(_password_attempts[user_id])} attempts in {PASSWORD_WINDOW_SECONDS}s)"
            )
            return False

        # Add current attempt
        _password_attempts[user_id].append((now, client_ip))
        return True


def _check_rate_limit(ip_address, endpoint):
    """Simple rate limiting check for general endpoints."""
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
    """Sanitize string input."""
    if not value:
        return None
    if not isinstance(value, str):
        return None
    value = value.strip()[:max_length]
    if pattern and not re.match(pattern, value):
        return None
    return value


class PDCPOSOfflineController(http.Controller):
    """Controller for PDC POS Offline module endpoints."""

    @http.route('/pdc_pos_offline/apply_optimizations', type='http', auth='public')
    def apply_optimizations(self):
        """
        Optimization middleware hook.

        This is a special route that applies performance optimizations
        (compression and cache headers) to responses.

        This demonstrates the optimization pipeline.
        """
        response = request.make_response('OK')

        # Apply gzip compression
        response = CompressionController.compress_response(response)

        # Apply cache headers
        response = CacheHeadersController.apply_cache_headers(
            response,
            filename='optimized_asset.js'
        )

        return response

    @http.route('/pdc_pos_offline/session_beacon', type='http', auth='user', csrf=False)
    def session_beacon(self):
        """
        Lightweight endpoint for session heartbeat monitoring.

        Security considerations:
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

    @http.route('/pdc_pos_offline/validate_password', type='jsonrpc', auth='user', website=False)
    def validate_password(self, user_id=None, password=None, **kw):
        """
        Validate offline password for a user.

        SIMPLIFIED v2: Uses same password as Odoo login (no separate PIN).
        Password hash is captured on successful login via _check_credentials override.

        Security measures:
        - Requires authenticated user (auth='user')
        - User-based rate limiting (5 attempts per minute per user)
        - Thread-safe rate limiting with lock
        - Input validation and sanitization
        - Audit logging of all attempts

        Args:
            user_id (int): User ID to validate password for
            password (str): Password to verify against cached hash

        Returns:
            dict: {'success': bool, 'user_data': dict} or {'success': False, 'error': str}
        """
        client_ip = _get_client_ip()

        # Input validation
        if not user_id or not isinstance(user_id, int) or user_id <= 0:
            _logger.warning(f"[PDC-Security] Invalid user_id in validate_password from {client_ip}")
            return {'success': False, 'error': 'Invalid user ID'}

        # Rate limiting (per user, thread-safe)
        if not _check_password_rate_limit(user_id, client_ip):
            return {
                'success': False,
                'error': 'Too many password attempts. Please wait 60 seconds.'
            }

        # Validate password is provided
        if not password or not isinstance(password, str):
            _logger.warning(f"[PDC-Security] Invalid password format from {client_ip} for user {user_id}")
            return {'success': False, 'error': 'Invalid password format'}

        password = _sanitize_string(password, max_length=128)
        if not password:
            _logger.warning(f"[PDC-Security] Password validation failed (format) for user {user_id} from {client_ip}")
            return {'success': False, 'error': 'Password required'}

        try:
            # sudo() required: pos_offline_auth_hash field is restricted to base.group_system
            # for security. Regular users cannot read password hashes directly.
            user = request.env['res.users'].sudo().browse(user_id)

            if not user.exists():
                _logger.warning(f"[PDC-Security] User {user_id} not found, request from {client_ip}")
                # Return same response to prevent user enumeration
                return {'success': False}

            # Check if user has offline auth hash set
            if not user.pos_offline_auth_hash:
                _logger.info(f"[PDC-Security] User {user_id} has no offline auth hash - need to login online first")
                return {'success': False, 'error': 'Please login online first to enable offline access'}

            # Verify password using SHA-256 (same algorithm as client-side)
            is_valid = user._verify_offline_password(password)

            if is_valid:
                _logger.info(f"[PDC-Security] Successful password validation for user {user_id} ({user.name}) from {client_ip}")
                return {
                    'success': True,
                    'user_data': {
                        'id': user.id,
                        'name': user.name,
                        'login': user.login,
                        'pos_offline_auth_hash': user.pos_offline_auth_hash,
                        'employee_ids': user.employee_ids.ids if user.employee_ids else [],
                    }
                }
            else:
                _logger.warning(
                    f"[PDC-Security] Failed password validation for user {user_id} ({user.name}) from {client_ip}"
                )
                return {'success': False}

        except Exception as e:
            _logger.error(f"[PDC-Security] Error in validate_password for user {user_id}: {str(e)}", exc_info=True)
            return {'success': False, 'error': 'Internal error'}

    # Legacy endpoint for backward compatibility
    @http.route('/pdc_pos_offline/validate_pin', type='jsonrpc', auth='user', website=False)
    def validate_pin(self, user_id=None, pin=None, **kw):
        """
        Legacy endpoint - redirects to validate_password.

        DEPRECATED: Use validate_password instead.
        This endpoint is kept for backward compatibility during migration.
        """
        _logger.warning("[PDC-Offline] validate_pin is deprecated, use validate_password")
        return self.validate_password(user_id=user_id, password=pin, **kw)

    @http.route('/pdc_pos_offline/get_offline_config', type='jsonrpc', auth='user', website=False)
    def get_offline_config(self, **kw):
        """
        Get offline mode configuration for the current user's POS session.

        Returns:
            dict: Configuration including sync interval, offline enabled, etc.
        """
        client_ip = _get_client_ip()

        # Rate limiting
        if not _check_rate_limit(client_ip, 'get_offline_config'):
            return {'error': 'Rate limit exceeded'}

        try:
            user = request.env.user

            # Get POS config (assume user has access to their POS config)
            pos_configs = request.env['pos.config'].search([
                ('id', 'in', user.pos_config_ids.ids)
            ], limit=1)

            if not pos_configs:
                return {'error': 'No POS configuration found'}

            config = pos_configs[0]

            return {
                'success': True,
                'config': {
                    'enable_offline_mode': getattr(config, 'enable_offline_mode', True),
                    'offline_sync_interval': getattr(config, 'offline_sync_interval', 300),  # 5 min default
                    # Note: offline_pin_required removed - simplified to password-based auth
                }
            }

        except Exception as e:
            _logger.error(f"[PDC-Offline] Error in get_offline_config: {str(e)}")
            return {'error': 'Internal error'}

    @http.route('/pdc_pos_offline/ping', type='http', auth='public', cors='*', csrf=False, methods=['GET', 'HEAD'])
    def ping(self, **kw):
        """
        Lightweight connectivity check endpoint.

        Wave 30 P0 Fix: Dedicated ping endpoint for connection monitoring.
        Returns JSON response that can be reliably detected (unlike HTML from /web/login).

        Features:
        - No authentication required (auth='public')
        - CORS enabled for cross-origin checks
        - Minimal response payload
        - Returns JSON content-type for reliable detection

        Returns:
            HTTP 200 with JSON: {"status": "ok", "timestamp": <unix_ms>}
        """
        import time
        response_data = json.dumps({
            'status': 'ok',
            'timestamp': int(time.time() * 1000),
            'server': 'pdc_pos_offline'
        })
        return request.make_response(
            response_data,
            headers=[
                ('Content-Type', 'application/json'),
                ('Cache-Control', 'no-cache, no-store, must-revalidate'),
                ('X-PDC-Ping', 'true')
            ]
        )
