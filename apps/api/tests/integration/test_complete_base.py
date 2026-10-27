"""Real JWT / HTTP tests. The admin connection is only local fixture setup/cleanup.

No application repository uses this connection or bypasses RLS.
"""
import os
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from threading import Barrier
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
from supabase import create_client

from app.core.config import Settings, get_settings
from app.main import app, limiter, settings

URL = os.getenv("SUPABASE_TEST_URL")
KEY = os.getenv("SUPABASE_TEST_ANON_KEY")
DB_URL = os.getenv("SUPABASE_TEST_DB_URL")
pytestmark = pytest.mark.skipif(not URL or not KEY or not DB_URL, reason="Local Supabase test configuration required")


@dataclass
class Identity:
    id: str
    token: str
    client: object

    def headers(self, organization=None):
        return {"Authorization": f"Bearer {self.token}", **({"X-Organization-Id": organization} if organization else {})}


@pytest.fixture
def environment(monkeypatch):
    assert urlparse(URL).hostname in {"127.0.0.1", "localhost"}
    assert urlparse(DB_URL).hostname in {"127.0.0.1", "localhost"}
    users, organizations = [], []
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_url=URL, supabase_anon_key=KEY)
    monkeypatch.setattr(settings, "rate_limit_per_minute", 10000)
    monkeypatch.setattr(settings, "rate_limit_writes_per_minute", 10000)
    limiter.windows.clear()

    def identity():
        client = create_client(URL, KEY)
        auth = client.auth.sign_up({"email": f"base-{uuid4()}@example.test", "password": "A-secure-test-password-123"})
        assert auth.session
        user = Identity(auth.user.id, auth.session.access_token, client)
        client.postgrest.auth(user.token)
        users.append(user)
        return user

    def organization(user, slug=None):
        response = TestClient(app).post("/api/v1/organizations", headers=user.headers(),
            json={"name": "Test organization", "slug": slug or f"test-{uuid4()}"})
        assert response.status_code == 201, response.text
        organizations.append(response.json()["id"])
        return response.json()["id"]

    yield identity, organization
    app.dependency_overrides.clear()
    limiter.windows.clear()
    # Only the random IDs created by this fixture; keep all pre-existing data.
    with psycopg.connect(DB_URL) as connection:
        connection.execute("set local session_replication_role = replica")
        for organization_id in organizations:
            connection.execute("delete from public.audit_logs where organization_id = %s", (organization_id,))
            connection.execute("delete from public.organization_members where organization_id = %s", (organization_id,))
            connection.execute("delete from public.organizations where id = %s", (organization_id,))
        connection.execute("set local session_replication_role = origin")
        for user in users:
            connection.execute("delete from auth.users where id = %s", (user.id,))
            user.client.auth.close()
            user.client.postgrest.session.close()


def test_member_lifecycle_permissions_and_audit(environment):
    identity, organization = environment
    owner, admin, member = identity(), identity(), identity()
    org = organization(owner)
    api = TestClient(app)
    for user, role in [(admin, "admin"), (member, "member")]:
        response = api.post("/api/v1/members", headers=owner.headers(org), json={"user_id": user.id, "role": role})
        assert response.status_code == 201
    assert api.post("/api/v1/members", headers=member.headers(org), json={"user_id": owner.id}).status_code == 403
    assert api.patch(f"/api/v1/members/{owner.id}", headers=admin.headers(org), json={"role": "member", "is_active": True}).status_code == 403
    assert api.patch(f"/api/v1/members/{admin.id}", headers=admin.headers(org), json={"role": "owner", "is_active": True}).status_code == 403
    assert api.patch(f"/api/v1/members/{member.id}", headers=admin.headers(org), json={"role": "member", "is_active": False}).status_code == 200
    assert api.get("/api/v1/members", headers=member.headers(org)).status_code == 404
    assert api.patch(f"/api/v1/members/{member.id}", headers=admin.headers(org), json={"role": "member", "is_active": True}).status_code == 200
    assert api.get("/api/v1/audit-logs", headers=member.headers(org)).status_code == 403
    assert api.delete("/api/v1/members/me", headers=member.headers(org)).status_code == 204
    events = api.get("/api/v1/audit-logs", headers=owner.headers(org)).json()
    assert {event["action"] for event in events} == {"organization.created", "member.added", "member.updated", "member.removed"}
    assert all(event["actor_id"] in {owner.id, admin.id, member.id} for event in events)
    before = len(events)
    response = api.patch(f"/api/v1/members/{owner.id}", headers=owner.headers(org), json={"role": "member", "is_active": True})
    assert response.status_code == 409 and response.json()["code"] == "last_owner"
    assert len(api.get("/api/v1/audit-logs", headers=owner.headers(org)).json()) == before
    page = api.get("/api/v1/audit-logs?limit=2", headers=owner.headers(org)).json()
    next_page = api.get(f"/api/v1/audit-logs?limit=2&before={page[-1]['id']}", headers=owner.headers(org)).json()
    assert not {e["id"] for e in page} & {e["id"] for e in next_page}


@pytest.mark.parametrize("operation", ["demote", "deactivate", "leave"])
def test_concurrent_last_owner_changes_through_fastapi(environment, operation):
    identity, organization = environment
    first, second = identity(), identity()
    org = organization(first)
    first.client.table("organization_members").insert({"organization_id": org, "user_id": second.id, "role": "owner"}).execute()
    barrier = Barrier(2)

    def change(user):
        barrier.wait(timeout=10)
        api = TestClient(app)
        if operation == "leave":
            return api.delete("/api/v1/members/me", headers=user.headers(org))
        return api.patch(f"/api/v1/members/{user.id}", headers=user.headers(org), json={
            "role": "member" if operation == "demote" else "owner", "is_active": operation != "deactivate"})

    with psycopg.connect(DB_URL) as lock, ThreadPoolExecutor(max_workers=2) as pool:
        lock.execute("select id from public.organizations where id = %s for update", (org,))
        futures = [pool.submit(change, user) for user in (first, second)]
        # Wait until BOTH requests reach the SQL trigger, not just the HTTP barrier.
        deadline = time.monotonic() + 10
        with psycopg.connect(DB_URL, autocommit=True) as observer:
            while time.monotonic() < deadline:
                waiting = observer.execute("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query like '%%organization_members%%'").fetchone()[0]
                if waiting >= 2:
                    break
                time.sleep(0.02)
            else:
                lock.rollback()
                pytest.fail("Concurrent requests did not both reach the owner lock")
        lock.commit()
        responses = [future.result(timeout=15) for future in futures]
    assert sorted(response.status_code for response in responses) == ([204, 409] if operation == "leave" else [200, 409])
    assert next(response for response in responses if response.status_code == 409).json()["code"] == "last_owner"
    with psycopg.connect(DB_URL) as connection:
        assert connection.execute("select active_owner_count from public.organizations where id = %s", (org,)).fetchone()[0] == 1
        assert connection.execute("select count(*) from public.organization_members where organization_id = %s and role = 'owner' and is_active", (org,)).fetchone()[0] == 1


def test_real_http_tokens_and_cross_tenant_operations(environment):
    identity, organization = environment
    first, second = identity(), identity()
    org_a, org_b = organization(first), organization(second)
    def visible(user):
        return TestClient(app).get("/api/v1/organizations", headers=user.headers()).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(visible, [first, second] * 4))
    assert [[item["id"] for item in result] for result in results] == [[org_a], [org_b]] * 4
    api = TestClient(app)
    for method, path, body in [("GET", "/members", None), ("POST", "/members", {"user_id": first.id}),
        ("PATCH", f"/members/{second.id}", {"role": "member", "is_active": True}), ("DELETE", f"/members/{second.id}", None), ("GET", "/audit-logs", None)]:
        response = api.request(method, f"/api/v1{path}", headers=first.headers(org_b), json=body)
        assert response.status_code == 404
    assert first.client.table("audit_logs").select("id").eq("organization_id", org_b).execute().data == []
    for table, row in [("audit_logs", {"organization_id": org_b, "action": "forged", "resource_type": "members"}),
        ("organizations", {"id": org_b, "name": "forged", "slug": "forged"}),
        ("profiles", {"id": second.id, "email": "forged@example.test"})]:
        for operation in ("insert", "update", "delete"):
            with pytest.raises(APIError):
                query = getattr(first.client.table(table), operation)(row) if operation != "delete" else first.client.table(table).delete()
                if operation != "insert":
                    query = query.eq("organization_id" if table == "audit_logs" else "id", org_b if table != "profiles" else second.id)
                query.execute()
    assert first.client.table("profiles").select("id").eq("id", second.id).execute().data == []


def test_inactive_organization_is_hidden_by_api_and_rls(environment):
    identity, organization = environment
    owner, another = identity(), identity()
    org = organization(owner)
    with psycopg.connect(DB_URL) as connection:
        connection.execute("update public.organizations set is_active = false where id = %s", (org,))
    api = TestClient(app)
    assert api.get("/api/v1/organizations", headers=owner.headers()).json() == []
    assert api.get("/api/v1/members", headers=owner.headers(org)).status_code == 404
    for table in ("organizations", "organization_members", "audit_logs"):
        assert owner.client.table(table).select("*").execute().data == []
    with pytest.raises(APIError):
        owner.client.table("organization_members").insert({"organization_id": org, "user_id": another.id}).execute()
    assert owner.client.table("organization_members").update({"role": "member"}).eq("organization_id", org).execute().data == []
    assert owner.client.table("organization_members").delete().eq("organization_id", org).execute().data == []


def test_bootstrap_is_authenticated_atomic_and_validated(environment):
    identity, organization = environment
    owner = identity()
    slug = f"unique-{uuid4()}"
    org = organization(owner, slug)
    api = TestClient(app)
    assert api.post("/api/v1/organizations", headers=owner.headers(), json={"name": "duplicate", "slug": slug}).status_code == 409
    assert api.post("/api/v1/organizations", headers=owner.headers(), json={"name": "   ", "slug": "valid"}).status_code == 422
    assert api.post("/api/v1/organizations", json={"name": "anonymous", "slug": "anonymous"}).status_code == 401
    with pytest.raises(APIError):
        create_client(URL, KEY).rpc("create_organization", {"organization_name": "anonymous", "organization_slug": "anonymous"}).execute()
    assert [item["id"] for item in api.get("/api/v1/organizations", headers=owner.headers()).json()] == [org]


def test_concurrent_bootstrap_with_duplicate_slug_is_atomic(environment):
    identity, _ = environment
    owner = identity()
    slug = f"concurrent-{uuid4()}"
    barrier = Barrier(2)

    def create():
        barrier.wait(timeout=10)
        return TestClient(app).post(
            "/api/v1/organizations",
            headers=owner.headers(),
            json={"name": "Concurrent organization", "slug": slug},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: create(), range(2)))

    assert sorted(response.status_code for response in responses) == [201, 409]
    organization_id = next(response for response in responses if response.status_code == 201).json()["id"]
    with psycopg.connect(DB_URL) as connection:
        assert connection.execute(
            "select active_owner_count from public.organizations where id = %s", (organization_id,)
        ).fetchone()[0] == 1
        assert connection.execute(
            "select count(*) from public.organization_members where organization_id = %s", (organization_id,)
        ).fetchone()[0] == 1
        assert connection.execute(
            "select count(*) from public.audit_logs where organization_id = %s and action = 'organization.created'", (organization_id,)
        ).fetchone()[0] == 1
        # Fixture cleanup is administrative local-only work; bypass the owner
        # invariant because this organization is deliberately being destroyed.
        connection.execute("set local session_replication_role = replica")
        connection.execute("delete from public.audit_logs where organization_id = %s", (organization_id,))
        connection.execute("delete from public.organization_members where organization_id = %s", (organization_id,))
        connection.execute("delete from public.organizations where id = %s", (organization_id,))
