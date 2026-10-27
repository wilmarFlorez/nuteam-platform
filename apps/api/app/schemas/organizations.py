from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OrganizationCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=120)


class Organization(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    is_active: bool
    created_at: datetime


class OrganizationRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class MembershipCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: UUID
    role: OrganizationRole = OrganizationRole.MEMBER


class MembershipUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: OrganizationRole
    is_active: bool


class Membership(BaseModel):
    organization_id: UUID
    user_id: UUID
    role: OrganizationRole
    is_active: bool
    created_at: datetime


class OrganizationAccess(BaseModel):
    organization_id: UUID
    user_id: UUID
    role: OrganizationRole
    permissions: list[str]


class AuditLog(BaseModel):
    id: int
    organization_id: UUID
    actor_id: UUID | None
    action: str
    resource_type: str
    resource_id: UUID | None
    metadata: dict
    created_at: datetime
