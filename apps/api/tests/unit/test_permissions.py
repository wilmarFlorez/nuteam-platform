import pytest

from app.api.dependencies import OrganizationContext, require_permission


@pytest.mark.asyncio
async def test_members_cannot_manage_members():
    dependency = require_permission("members:manage")
    context = OrganizationContext(id="00000000-0000-0000-0000-000000000001", role="member", client=None)  # type: ignore[arg-type]

    with pytest.raises(Exception) as error:
        await dependency(context)

    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_manage_members():
    dependency = require_permission("members:manage")
    context = OrganizationContext(id="00000000-0000-0000-0000-000000000001", role="admin", client=None)  # type: ignore[arg-type]

    assert await dependency(context) == context
