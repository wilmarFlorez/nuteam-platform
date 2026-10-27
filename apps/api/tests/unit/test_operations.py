import json
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
from supabase_auth.errors import AuthApiError

from app.core.config import Settings
from app.core.observability import sanitize_event
from app.core.rate_limit import RateLimiter
from app.main import app, limiter, settings


@pytest.mark.parametrize("exception,status,code", [
    (AuthApiError("expired", 401, None), 401, "invalid_token"),
    (AuthApiError("upstream secret", 503, None), 503, "auth_unavailable"),
    (httpx.ConnectError("sensitive upstream URL"), 503, "upstream_unavailable"),
    (RuntimeError("secret-token"), 500, "internal_error"),
])
def test_auth_failures_have_safe_distinct_errors(monkeypatch, caplog, exception, status, code):
    client = MagicMock()
    client.auth.get_user.side_effect = exception
    monkeypatch.setattr("app.api.dependencies.create_user_client", lambda *_: client)
    response = TestClient(app).get("/api/v1/organizations", headers={
        "Authorization": "Bearer secret-token", "X-Request-Id": "untrusted-secret",
        "Origin": "http://localhost:3000",
    })
    assert response.status_code == status
    assert response.json()["code"] == code
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "secret" not in response.text
    assert "secret" not in caplog.text
    assert response.headers["x-request-id"] != "untrusted-secret"
    client.auth.close.assert_called_once()
    client.postgrest.session.close.assert_called_once()


def test_cors_only_allows_configured_origins():
    client = TestClient(app)
    for origin, expected in [("http://localhost:3000", 200), ("https://untrusted.test", 400)]:
        response = client.options("/api/v1/members", headers={"Origin": origin,
            "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "Authorization,X-Organization-Id"})
        assert response.status_code == expected


def test_unknown_route_uses_error_contract():
    assert TestClient(app).get("/missing").json() == {"code": "http_error", "message": "Not Found", "details": None}


def test_validation_does_not_echo_sensitive_input():
    response = TestClient(app).get("/api/v1/organizations", headers={"Authorization": ""})
    assert set(response.json()) == {"code", "message", "details"}


@pytest.mark.asyncio
async def test_rate_limit_window_and_buckets(monkeypatch):
    local = RateLimiter(None)
    monkeypatch.setattr("app.core.rate_limit.time.time", lambda: 120)
    assert await local.allow("user-a", 1)
    assert not await local.allow("user-a", 1)
    assert await local.allow("user-b", 1)
    assert await local.allow("user-a", 1, "writes")
    monkeypatch.setattr("app.core.rate_limit.time.time", lambda: 180)
    assert await local.allow("user-a", 1)


def test_rate_limit_returns_retry_after(monkeypatch):
    limiter.windows.clear()
    monkeypatch.setattr(settings, "rate_limit_per_minute", 1)
    client = TestClient(app)
    assert client.get("/api/v1/organizations").status_code == 401
    response = client.get("/api/v1/organizations")
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert response.json()["code"] == "rate_limited"
    assert client.get("/health").status_code == 200
    limiter.windows.clear()


def test_production_requires_distributed_limits_and_explicit_https_origins():
    with pytest.raises(ValueError):
        Settings(environment="production", supabase_url="https://supabase.test", supabase_anon_key="key", _env_file=None)


def test_error_tracking_scrubs_sensitive_data():
    result = sanitize_event({"request": {"headers": {"Authorization": "secret"}}, "user": {"email": "secret"},
        "exception": {"values": [{"type": "RuntimeError", "value": "secret", "stacktrace": {"frames": [{"vars": {"token": "secret"}}]}}]}}, None)
    assert "secret" not in json.dumps(result)


@pytest.mark.asyncio
@pytest.mark.parametrize("dbcode,message,status,code", [
    ("23505", "secret", 409, "resource_conflict"),
    ("P0001", "last_owner", 409, "last_owner"),
    ("42501", "secret", 403, "permission_denied"),
    ("unavailable", "secret", 503, "database_unavailable"),
])
async def test_database_errors(dbcode, message, status, code):
    from app.core.errors import database_error_handler
    response = await database_error_handler(None, APIError({"code": dbcode, "message": message, "details": "secret", "hint": "secret"}))
    assert response.status_code == status
    assert json.loads(response.body)["code"] == code
    assert b"secret" not in response.body
