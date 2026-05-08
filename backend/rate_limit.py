"""Shared slowapi Limiter instance used by both server.py and audit_routes.py.

Lives in its own module to avoid the circular import that would otherwise
result from server.py importing audit_routes.py while audit_routes.py also
needs the Limiter created in server.py.
"""
from fastapi import Request
from slowapi import Limiter


def _client_ip_key(request: Request) -> str:
    """Resolve the originating client IP, honoring k8s ingress X-Forwarded-For."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


limiter = Limiter(key_func=_client_ip_key, default_limits=[])
