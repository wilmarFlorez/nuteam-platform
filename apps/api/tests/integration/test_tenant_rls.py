import os
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
import pytest
from postgrest.exceptions import APIError
from supabase import Client, create_client

SUPABASE_URL = os.getenv("SUPABASE_TEST_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_TEST_ANON_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_TEST_DB_URL")
pytestmark = pytest.mark.skipif(
    not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_DB_URL,
    reason="Local Supabase test configuration is required for RLS integration tests.",
)


@pytest.fixture
def local_data():
    assert urlparse(SUPABASE_URL).hostname in {"127.0.0.1", "localhost"}
    assert urlparse(SUPABASE_DB_URL).hostname in {"127.0.0.1", "localhost"}
    users: list[tuple[Client, str]] = []
    organizations: list[str] = []

    def authenticated_client() -> tuple[Client, str]:
        public_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        credentials = public_client.auth.sign_up(
            {"email": f"rls-{uuid4()}@example.test", "password": "A-secure-test-password-123"}
        )
        assert credentials.session is not None, "Local Supabase must auto-confirm test users."
        assert credentials.user is not None
        client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        client.postgrest.auth(credentials.session.access_token)
        users.append((client, credentials.user.id))
        return client, credentials.user.id

    def create_organization(client: Client, prefix: str) -> dict[str, str]:
        result = client.rpc(
            "create_organization",
            {"organization_name": f"{prefix} organization", "organization_slug": f"{prefix}-{uuid4().hex[:12]}"},
        ).execute()
        organization = result.data[0] if isinstance(result.data, list) else result.data
        organizations.append(organization["id"])
        return organization

    yield authenticated_client, create_organization

    with psycopg.connect(SUPABASE_DB_URL) as connection:
        connection.execute("set local session_replication_role = replica")
        for organization_id in organizations:
            connection.execute("delete from public.audit_logs where organization_id = %s", (organization_id,))
            connection.execute("delete from public.organization_members where organization_id = %s", (organization_id,))
            connection.execute("delete from public.organizations where id = %s", (organization_id,))
        connection.execute("set local session_replication_role = origin")
        for client, user_id in users:
            connection.execute("delete from auth.users where id = %s", (user_id,))
            client.auth.close()
            client.postgrest.session.close()


def test_rls_prevents_cross_tenant_membership_operations(local_data):
    authenticated_client, create_organization = local_data
    first_client, first_user_id = authenticated_client()
    second_client, second_user_id = authenticated_client()
    first_organization = create_organization(first_client, "first")
    second_organization = create_organization(second_client, "second")

    visible_to_first = first_client.table("organizations").select("id").execute().data
    assert visible_to_first == [{"id": first_organization["id"]}]

    with pytest.raises(APIError):
        first_client.table("organization_members").insert({
            "organization_id": second_organization["id"],
            "user_id": first_user_id,
            "role": "member",
        }).execute()

    first_client.table("organization_members").update({"role": "member"}).eq(
        "organization_id", second_organization["id"]
    ).eq("user_id", second_user_id).execute()
    first_client.table("organization_members").delete().eq(
        "organization_id", second_organization["id"]
    ).eq("user_id", second_user_id).execute()

    second_membership = second_client.table("organization_members").select("role").eq(
        "organization_id", second_organization["id"]
    ).eq("user_id", second_user_id).execute().data
    assert second_membership == [{"role": "owner"}]


def test_requests_with_distinct_tokens_do_not_leak_identity(local_data):
    authenticated_client, create_organization = local_data
    first_client, _ = authenticated_client()
    second_client, _ = authenticated_client()
    first_organization = create_organization(first_client, "concurrent-first")
    second_organization = create_organization(second_client, "concurrent-second")

    def visible_ids(client: Client) -> set[str]:
        return {organization["id"] for organization in client.table("organizations").select("id").execute().data}

    with ThreadPoolExecutor(max_workers=2) as executor:
        first_result, second_result = executor.map(visible_ids, (first_client, second_client))

    assert first_result == {first_organization["id"]}
    assert second_result == {second_organization["id"]}


def test_admin_cannot_grant_owner_or_manage_existing_owner(local_data):
    authenticated_client, create_organization = local_data
    owner_client, owner_user_id = authenticated_client()
    admin_client, admin_user_id = authenticated_client()
    organization = create_organization(owner_client, "role-boundaries")

    owner_client.table("organization_members").insert({
        "organization_id": organization["id"],
        "user_id": admin_user_id,
        "role": "admin",
    }).execute()

    with pytest.raises(APIError):
        admin_client.table("organization_members").update({"role": "owner"}).eq(
            "organization_id", organization["id"]
        ).eq("user_id", admin_user_id).execute()

    admin_client.table("organization_members").update({"role": "member"}).eq(
        "organization_id", organization["id"]
    ).eq("user_id", owner_user_id).execute()
    owner_membership = owner_client.table("organization_members").select("role").eq(
        "organization_id", organization["id"]
    ).eq("user_id", owner_user_id).execute().data
    assert owner_membership == [{"role": "owner"}]

    with pytest.raises(APIError):
        admin_client.table("organization_members").insert({
            "organization_id": organization["id"],
            "user_id": str(uuid4()),
            "role": "owner",
        }).execute()


def test_inactive_members_lose_access_and_membership_identity_is_immutable(local_data):
    authenticated_client, create_organization = local_data
    owner_client, _ = authenticated_client()
    member_client, member_user_id = authenticated_client()
    first_organization = create_organization(owner_client, "inactive-member")
    second_organization = create_organization(owner_client, "identity-target")

    owner_client.table("organization_members").insert({
        "organization_id": first_organization["id"],
        "user_id": member_user_id,
        "role": "member",
    }).execute()

    with pytest.raises(APIError):
        owner_client.table("organization_members").update({
            "organization_id": second_organization["id"]
        }).eq("organization_id", first_organization["id"]).eq(
            "user_id", member_user_id
        ).execute()

    with pytest.raises(APIError):
        owner_client.table("organization_members").update({"user_id": str(uuid4())}).eq(
            "organization_id", first_organization["id"]
        ).eq("user_id", member_user_id).execute()

    owner_client.table("organization_members").update({"is_active": False}).eq(
        "organization_id", first_organization["id"]
    ).eq("user_id", member_user_id).execute()
    assert member_client.table("organizations").select("id").execute().data == []


def test_internal_owner_counter_cannot_be_written_by_authenticated_user(local_data):
    authenticated_client, create_organization = local_data
    owner_client, _ = authenticated_client()
    organization = create_organization(owner_client, "counter-guard")

    with pytest.raises(APIError):
        owner_client.table("organizations").update({"active_owner_count": 99}).eq(
            "id", organization["id"]
        ).execute()
