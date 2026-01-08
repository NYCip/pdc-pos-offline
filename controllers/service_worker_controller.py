# -*- coding: utf-8 -*-
# Copyright 2024-2026 POS.com
# Part of POS.com Retail Management System
"""
Service Worker Controller

Serves the Service Worker JavaScript file with correct headers.
The Service Worker must be served from the same origin with specific headers
to function correctly for PWA-style offline caching.
"""

import os
import logging

from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class ServiceWorkerController(http.Controller):
    """Controller to serve Service Worker with correct MIME type and scope."""

    @http.route('/pos_offline/sw.js', type='http', auth='public', cors='*', csrf=False)
    def service_worker(self):
        """
        Serve the Service Worker JavaScript file.

        Headers:
        - Content-Type: application/javascript (required for SW)
        - Service-Worker-Allowed: / (allows SW to control entire origin)
        - Cache-Control: no-cache (SW spec recommends no caching)

        Returns:
            Response: The Service Worker JavaScript with appropriate headers
        """
        try:
            # Get path to sw.js relative to this module
            module_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            sw_path = os.path.join(
                module_path,
                'static', 'src', 'service_worker', 'sw.js'
            )

            if not os.path.exists(sw_path):
                _logger.error("Service Worker file not found at: %s", sw_path)
                return Response(
                    "// Service Worker not found",
                    status=404,
                    mimetype='application/javascript'
                )

            with open(sw_path, 'r', encoding='utf-8') as f:
                content = f.read()

            _logger.info("Serving Service Worker from: %s", sw_path)

            return Response(
                content,
                mimetype='application/javascript',
                headers={
                    # Allow SW to control the entire /pos/ scope
                    'Service-Worker-Allowed': '/pos/',
                    # Don't cache the SW file itself (browser will check for updates)
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                }
            )

        except Exception as e:
            _logger.exception("Error serving Service Worker: %s", e)
            return Response(
                f"// Error loading Service Worker: {e}",
                status=500,
                mimetype='application/javascript'
            )

    @http.route('/pos_offline/sw/status', type='json', auth='public', cors='*')
    def service_worker_status(self):
        """
        Return Service Worker status and version info.

        Returns:
            dict: Status information including version and cache info
        """
        return {
            'status': 'active',
            'version': '2.0.0',
            'module': 'pdc_pos_offline',
            'scope': '/pos/',
        }
