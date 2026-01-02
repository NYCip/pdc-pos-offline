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

_logger = logging.getLogger(__name__)

# Thread-safe rate limiting for PIN validation
_pin_rate_limit_lock = threading.Lock()
_pin_attempts = defaultdict(list)  # {user_id: [(timestamp, ip), ...]}
MAX_PIN_ATTEMPTS = 5
PIN_WINDOW_SECONDS = 60

# General rate limiting storage
_rate_limit_cache = {}
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX_REQUESTS = 10


def _get_client_ip():
    """Get client IP, handling proxy headers."""
    if request.httprequest.headers.get('X-Forwarded-For'):
        return request.httprequest.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.httprequest.remote_addr or 'unknown'


def _check_pin_rate_limit(user_id, client_ip):
    """
    Thread-safe rate limiting for PIN validation.

    Args:
        user_id (int): User ID attempting PIN validation
        client_ip (str): Client IP address

    Returns:
        bool: True if request allowed, False if rate limit exceeded
    """
    with _pin_rate_limit_lock:
        now = time.time()
        window_start = now - PIN_WINDOW_SECONDS

        # Get attempts for this user
        if user_id not in _pin_attempts:
            _pin_attempts[user_id] = []

        # Remove expired attempts
        _pin_attempts[user_id] = [
            (ts, ip) for ts, ip in _pin_attempts[user_id]
            if ts > window_start
        ]

        # Check if limit exceeded
        if len(_pin_attempts[user_id]) >= MAX_PIN_ATTEMPTS:
            _logger.warning(
                f"[PDC-Security] PIN rate limit exceeded for user {user_id} "
                f"from {client_ip} ({len(_pin_attempts[user_id])} attempts in {PIN_WINDOW_SECONDS}s)"
            )
            return False

        # Add current attempt
        _pin_attempts[user_id].append((now, client_ip))
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

    @http.route('/pdc_pos_offline/validate_pin', type='jsonrpc', auth='user', website=False)
    def validate_pin(self, user_id=None, pin=None, **kw):
        """
        Validate offline PIN for a user using Argon2id hashing.

        Security measures:
        - Requires authenticated user (auth='user')
        - User-based rate limiting (5 attempts per minute per user)
        - Thread-safe rate limiting with lock
        - Argon2id verification (memory-hard, constant-time)
        - Input validation and sanitization
        - Audit logging of all attempts

        Args:
            user_id (int): User ID to validate PIN for
            pin (str): 4-digit PIN (plaintext, will be verified against Argon2id hash)

        Returns:
            dict: {'success': bool, 'user_data': dict} or {'success': False, 'error': str}
        """
        client_ip = _get_client_ip()

        # Input validation
        if not user_id or not isinstance(user_id, int) or user_id <= 0:
            _logger.warning(f"[PDC-Security] Invalid user_id in validate_pin from {client_ip}")
            return {'success': False, 'error': 'Invalid user ID'}

        # Rate limiting (per user, thread-safe)
        if not _check_pin_rate_limit(user_id, client_ip):
            return {
                'success': False,
                'error': 'Too many PIN attempts. Please wait 60 seconds.'
            }

        # Validate PIN format
        if not pin or not isinstance(pin, str):
            _logger.warning(f"[PDC-Security] Invalid PIN format from {client_ip} for user {user_id}")
            return {'success': False, 'error': 'Invalid PIN format'}

        pin = _sanitize_string(pin, max_length=4, pattern=r'^\d{4}$')
        if not pin:
            _logger.warning(f"[PDC-Security] PIN validation failed (format) for user {user_id} from {client_ip}")
            return {'success': False, 'error': 'PIN must be exactly 4 digits'}

        try:
            # Get user with sudo() to access PIN hash
            user = request.env['res.users'].sudo().browse(user_id)

            if not user.exists():
                _logger.warning(f"[PDC-Security] User {user_id} not found, request from {client_ip}")
                # Return same response to prevent user enumeration
                return {'success': False}

            # Check if user has PIN hash set
            if not user.pos_offline_pin_hash:
                _logger.info(f"[PDC-Security] User {user_id} has no offline PIN set")
                return {'success': False}

            # Verify PIN using Argon2id (constant-time comparison)
            is_valid = user._verify_pin(pin)

            if is_valid:
                _logger.info(f"[PDC-Security] Successful PIN validation for user {user_id} ({user.name}) from {client_ip}")
                return {
                    'success': True,
                    'user_data': {
                        'id': user.id,
                        'name': user.name,
                        'login': user.login,
                        'employee_ids': user.employee_ids.ids if user.employee_ids else [],
                    }
                }
            else:
                _logger.warning(
                    f"[PDC-Security] Failed PIN validation for user {user_id} ({user.name}) from {client_ip}"
                )
                return {'success': False}

        except Exception as e:
            _logger.error(f"[PDC-Security] Error in validate_pin for user {user_id}: {str(e)}", exc_info=True)
            return {'success': False, 'error': 'Internal error'}

    @http.route('/pdc_pos_offline/get_offline_config', type='jsonrpc', auth='user', website=False)
    def get_offline_config(self, **kw):
        """
        Get offline mode configuration for the current user's POS session.

        Returns:
            dict: Configuration including sync interval, PIN requirement, etc.
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
                    'offline_pin_required': getattr(config, 'offline_pin_required', True),
                }
            }

        except Exception as e:
            _logger.error(f"[PDC-Offline] Error in get_offline_config: {str(e)}")
            return {'error': 'Internal error'}
