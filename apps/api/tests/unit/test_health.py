from unittest.mock import MagicMock
from uuid import UUID

import httpx
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

from app.api.dependencies import CurrentUser, get_current_user
from app.main import app


def test_health_is_public():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_business_route_requires_token():
    response = TestClient(app).get("/api/v1/organizations")

    assert response.status_code == 401
    assert response.json()["code"] == "missing_token"


def test_business_route_rejects_invalid_token(monkeypatch):
    invalid_client = MagicMock()
    invalid_client.auth.get_user.side_effect = AuthApiError("invalid token", 401, None)
    monkeypatch.setattr("app.api.dependencies.create_user_client", lambda *_: invalid_client)
    response = TestClient(app).get(
        "/api/v1/organizations", headers={"Authorization": "Bearer invalid"}
    )

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


def test_tenant_route_requires_organization_header():
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=UUID("00000000-0000-0000-0000-000000000001"), token="jwt"
    )
    try:
        response = TestClient(app).get("/api/v1/members")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_ready_reports_unavailable_upstreams(monkeypatch):
    class UnavailableClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def get(self, *_args, **_kwargs):
            raise httpx.ConnectError("unavailable")

    monkeypatch.setattr("app.main.httpx.AsyncClient", lambda **_kwargs: UnavailableClient())
    response = TestClient(app).get("/ready")

    assert response.status_code == 503
    assert response.json()["code"] == "not_ready"


def test_metrics_requires_its_bearer_token(monkeypatch):
    monkeypatch.setattr("app.main.settings.metrics_token", "test-metrics-token")
    client = TestClient(app)

    assert client.get("/metrics").status_code == 401
    response = client.get("/metrics", headers={"Authorization": "Bearer test-metrics-token"})
    assert response.status_code == 200
    assert "api_requests_total" in response.text
