from fastapi import APIRouter, Depends, status

from app.api.dependencies import CurrentUser, get_current_user
from app.core.errors import api_error
from app.schemas.organizations import Organization, OrganizationCreate

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=list[Organization])
def list_organizations(user: CurrentUser = Depends(get_current_user)):
    client = user.client
    result = client.table("organization_members").select("organizations(*)").eq("user_id", str(user.id)).eq("is_active", True).execute()
    return [entry["organizations"] for entry in result.data if entry["organizations"] is not None]


@router.post("", response_model=Organization, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreate,
    user: CurrentUser = Depends(get_current_user),
):
    client = user.client
    result = client.rpc("create_organization", {"organization_name": payload.name, "organization_slug": payload.slug}).execute()
    if not result.data:
        raise api_error(500, "organization_creation_failed", "The organization could not be created.")
    return result.data[0] if isinstance(result.data, list) else result.data
