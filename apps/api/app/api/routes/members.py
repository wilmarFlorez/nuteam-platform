from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.api.dependencies import ROLE_PERMISSIONS, OrganizationContext, require_permission
from app.core.errors import api_error
from app.schemas.organizations import (
    Membership,
    MembershipCreate,
    MembershipUpdate,
    OrganizationRole,
)

router = APIRouter(prefix="/members", tags=["members"])


@router.get("", response_model=list[Membership])
def list_members(context: OrganizationContext = Depends(require_permission("members:read"))):
    result = context.client.table("organization_members").select("*").eq("organization_id", str(context.id)).execute()
    return result.data


def authorize_target(context: OrganizationContext, *roles: OrganizationRole):
    if OrganizationRole.OWNER in roles and "owners:manage" not in ROLE_PERMISSIONS[context.role]:
        raise api_error(403, "permission_denied", "Managing owners requires the owners:manage permission.")


def find_member(context: OrganizationContext, user_id: UUID):
    result = context.client.table("organization_members").select("*").eq(
        "organization_id", str(context.id)
    ).eq("user_id", str(user_id)).execute()
    if not result.data:
        raise api_error(404, "member_not_found", "The member was not found.")
    return result.data[0]


@router.post("", response_model=Membership, status_code=201)
def add_member(payload: MembershipCreate, context: OrganizationContext = Depends(require_permission("members:manage"))):
    authorize_target(context, payload.role)
    result = context.client.table("organization_members").insert({
        **payload.model_dump(mode="json"), "organization_id": str(context.id)
    }).execute()
    return result.data[0]


@router.delete("/me", status_code=204)
def leave_organization(context: OrganizationContext = Depends(require_permission("members:leave"))):
    context.client.table("organization_members").delete().eq(
        "organization_id", str(context.id)
    ).eq("user_id", str(context.user_id)).execute()
    return Response(status_code=204)


@router.patch("/{user_id}", response_model=Membership)
def update_member(user_id: UUID, payload: MembershipUpdate, context: OrganizationContext = Depends(require_permission("members:manage"))):
    target = find_member(context, user_id)
    authorize_target(context, OrganizationRole(target["role"]), payload.role)
    result = context.client.table("organization_members").update(payload.model_dump(mode="json")).eq(
        "organization_id", str(context.id)
    ).eq("user_id", str(user_id)).execute()
    if not result.data:
        raise api_error(409, "membership_changed", "Membership changed; reload and try again.")
    return result.data[0]


@router.delete("/{user_id}", status_code=204)
def remove_member(user_id: UUID, context: OrganizationContext = Depends(require_permission("members:manage"))):
    target = find_member(context, user_id)
    authorize_target(context, OrganizationRole(target["role"]))
    result = context.client.table("organization_members").delete().eq(
        "organization_id", str(context.id)
    ).eq("user_id", str(user_id)).execute()
    if not result.data:
        raise api_error(409, "membership_changed", "Membership changed; reload and try again.")
    return Response(status_code=204)
