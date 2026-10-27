from collections.abc import Iterator
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, Request
from supabase import Client, create_client
from supabase_auth.errors import AuthApiError

from app.core.config import Settings, get_settings
from app.core.errors import api_error
from app.schemas.organizations import OrganizationRole

ROLE_PERMISSIONS = {
    OrganizationRole.OWNER: {"members:read", "members:manage", "owners:manage", "members:leave", "audit:read"},
    OrganizationRole.ADMIN: {"members:read", "members:manage", "members:leave", "audit:read"},
    OrganizationRole.MEMBER: {"members:read", "members:leave"},
}


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    token: str
    client: Client | None = None


@dataclass(frozen=True)
class OrganizationContext:
    id: UUID
    role: OrganizationRole
    client: Client
    user_id: UUID | None = None


def create_user_client(token: str, settings: Settings) -> Client:
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.postgrest.auth(token)
    return client


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> Iterator[CurrentUser]:
    if not authorization or not authorization.startswith("Bearer "):
        raise api_error(401, "missing_token", "A bearer token is required.")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise api_error(401, "invalid_token", "The bearer token is invalid.")
    client = create_user_client(token, settings)
    try:
        try:
            user = client.auth.get_user(token).user
        except AuthApiError as error:
            if error.status >= 500 or error.status == 429:
                raise api_error(503, "auth_unavailable", "Authentication is temporarily unavailable.") from error
            raise api_error(401, "invalid_token", "The bearer token is invalid or expired.") from error
        if user is None:
            raise api_error(401, "invalid_token", "The bearer token is invalid or expired.")
        request.state.user_id = user.id
        yield CurrentUser(id=UUID(user.id), token=token, client=client)
    finally:
        client.auth.close()
        client.postgrest.session.close()


def get_organization_context(
    x_organization_id: UUID = Header(alias="X-Organization-Id"),
    user: CurrentUser = Depends(get_current_user),
) -> OrganizationContext:
    client = user.client
    organization = client.table("organizations").select("id, is_active").eq("id", str(x_organization_id)).execute()
    if not organization.data or not organization.data[0]["is_active"]:
        raise api_error(404, "organization_not_found", "The organization was not found.")
    membership = (
        client.table("organization_members")
        .select("role")
        .eq("organization_id", str(x_organization_id))
        .eq("user_id", str(user.id))
        .eq("is_active", True)
        .execute()
    )
    if not membership.data:
        raise api_error(403, "organization_access_denied", "You are not an active organization member.")
    return OrganizationContext(id=x_organization_id, role=OrganizationRole(membership.data[0]["role"]), client=client, user_id=user.id)


def require_permission(permission: str):
    async def dependency(context: OrganizationContext = Depends(get_organization_context)) -> OrganizationContext:
        if permission not in ROLE_PERMISSIONS.get(context.role, set()):
            raise api_error(403, "permission_denied", "You do not have permission for this operation.")
        return context

    return dependency
