from odoo import models, fields, api
from datetime import timedelta
import logging

_logger = logging.getLogger(__name__)


class PosOfflineSession(models.Model):
    """
    POS Offline Session Management

    Tracks offline sessions per user and per browser tab.
    Enforces session timeout and prevents multi-tab data collision.

    Fix P0 #1: Multi-Tab Session Collision
    - Each user has unique sessions per browser tab
    - Sessions expire after configured timeout (8 hours default)
    - Database-backed tracking for audit trail
    """

    _name = 'pos.offline.session'
    _description = 'POS Offline Session'
    _order = 'created_at DESC'

    # User who created session
    user_id = fields.Many2one(
        'res.users',
        required=True,
        ondelete='cascade',
        string='User'
    )

    # Unique session key from JavaScript
    session_key = fields.Char(
        required=True,
        index=True,
        unique=True,
        help="Unique session identifier: user_{user_id}_tab_{tab_id}"
    )

    # Session lifecycle
    created_at = fields.Datetime(
        default=fields.Datetime.now,
        index=True,
        readonly=True
    )
    expires_at = fields.Datetime(
        compute='_compute_expires_at',
        store=True,
        index=True
    )
    is_active = fields.Boolean(
        compute='_compute_is_active',
        store=True,
        index=True,
        help="Session is active if current time < expires_at"
    )

    # Session metadata
    browser_tab = fields.Char(
        help="Browser tab identifier for UI tracking"
    )
    ip_address = fields.Char(
        help="IP address where session was created"
    )
    user_agent = fields.Text(
        help="User agent string for browser tracking"
    )

    # Session activity
    last_activity_at = fields.Datetime(
        default=fields.Datetime.now,
        help="Last activity timestamp"
    )

    @api.depends('created_at', 'user_id.offline_session_timeout')
    def _compute_expires_at(self):
        """Calculate session expiry based on timeout."""
        for session in self:
            # Get user's configured timeout, default to 8 hours
            timeout = session.user_id.offline_session_timeout or 28800

            # Calculate expiry: created_at + timeout
            session.expires_at = fields.Datetime.add(
                session.created_at,
                seconds=timeout
            )

    @api.depends('expires_at')
    def _compute_is_active(self):
        """Check if session is still active."""
        now = fields.Datetime.now()

        for session in self:
            session.is_active = (now < session.expires_at)

    @api.model
    def create_offline_session(self, session_key, browser_tab=''):
        """
        Create new offline session for current user.

        Args:
            session_key: Unique session identifier from JavaScript
            browser_tab: Browser tab ID from JavaScript

        Returns:
            Created session record
        """
        # Get client IP from request
        client_ip = self._get_client_ip()
        user_agent = self.env.context.get('user_agent', '')

        _logger.info(
            f"Creating offline session for user {self.env.user.id} "
            f"with key {session_key} from {client_ip}"
        )

        session = self.create({
            'user_id': self.env.user.id,
            'session_key': session_key,
            'browser_tab': browser_tab,
            'ip_address': client_ip,
            'user_agent': user_agent,
        })

        return session

    @api.model
    def verify_session(self, session_key):
        """
        Verify session is active and belongs to current user.

        Args:
            session_key: Session key to verify

        Returns:
            Session record if valid

        Raises:
            UserError if session invalid or expired
        """
        session = self.search([
            ('session_key', '=', session_key),
            ('user_id', '=', self.env.user.id),
            ('is_active', '=', True),
        ], limit=1)

        if not session:
            raise self.env['ir.exceptions'].UserError(
                "Session expired or invalid. Please log in again."
            )

        # Update last activity
        session.last_activity_at = fields.Datetime.now()

        return session

    def refresh_session(self):
        """
        Refresh session by resetting creation time.
        This extends the expiry by the full timeout period.
        """
        self.ensure_one()

        old_expires = self.expires_at
        self.created_at = fields.Datetime.now()

        _logger.info(
            f"Refreshed session {self.session_key}: "
            f"old expiry {old_expires} → new expiry {self.expires_at}"
        )

        return {
            'success': True,
            'expires_at': self.expires_at,
            'timeout_seconds': self.user_id.offline_session_timeout,
        }

    def get_session_status(self):
        """Get current session status information."""
        self.ensure_one()

        if not self.is_active:
            return {'valid': False, 'error': 'Session expired'}

        remaining = (self.expires_at - fields.Datetime.now()).total_seconds()

        return {
            'valid': True,
            'user_id': self.user_id.id,
            'expires_at': self.expires_at.isoformat(),
            'seconds_remaining': int(max(0, remaining)),
            'is_active': self.is_active,
        }

    def logout_session(self):
        """Logout this session (delete it)."""
        self.ensure_one()
        session_key = self.session_key
        self.unlink()
        _logger.info(f"Logged out session {session_key}")

    @api.model
    def cleanup_expired_sessions(self):
        """
        Scheduled action to cleanup expired sessions.
        Called daily by CRON.
        """
        expired = self.search([('is_active', '=', False)])
        count = len(expired)
        expired.unlink()

        if count > 0:
            _logger.info(f"Cleaned up {count} expired offline sessions")

    @api.model
    def cleanup_inactive_sessions(self, days=7):
        """
        Clean up sessions with no activity for specified days.
        """
        cutoff = fields.Datetime.subtract(
            fields.Datetime.now(),
            days=days
        )

        inactive = self.search([
            ('last_activity_at', '<', cutoff),
        ])

        count = len(inactive)
        inactive.unlink()

        _logger.info(f"Cleaned up {count} inactive offline sessions")

    def _get_client_ip(self):
        """Extract client IP address from HTTP request."""
        try:
            request = self.env['ir.http']._get_http_request()
            if request:
                # Check for proxy headers first
                return (
                    request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or
                    request.headers.get('X-Real-IP', '') or
                    request.remote_addr or
                    '0.0.0.0'
                )
        except Exception as e:
            _logger.warning(f"Could not get client IP: {e}")

        return '0.0.0.0'
