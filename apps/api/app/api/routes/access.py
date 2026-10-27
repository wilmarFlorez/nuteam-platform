from fastapi import APIRouter, Depends, Query

from app.api.dependencies import ROLE_PERMISSIONS, OrganizationContext, require_permission
from app.schemas.organizations import AuditLog, OrganizationAccess

router = APIRouter(tags=["organization"])


@router.get("/organization", response_model=OrganizationAccess)
def organization_access(context: OrganizationContext = Depends(require_permission("members:read"))):
    return OrganizationAccess(organization_id=context.id, user_id=context.user_id,
                              role=context.role, permissions=sorted(ROLE_PERMISSIONS[context.role]))


@router.get("/audit-logs", response_model=list[AuditLog])
def audit_logs(
    before: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    context: OrganizationContext = Depends(require_permission("audit:read")),
):
    query = context.client.table("audit_logs").select("*").eq("organization_id", str(context.id))
    if before is not None:
        query = query.lt("id", before)
    return query.order("id", desc=True).limit(limit).execute().data
