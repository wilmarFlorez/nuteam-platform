-- Upgrade existing installations without resetting data. This counter is internal:
-- application roles cannot write organizations or bypass membership triggers.
alter table public.organizations add column active_owner_count integer not null default 0
  check (active_owner_count >= 0);
update public.organizations o set active_owner_count = (
  select count(*) from public.organization_members m
  where m.organization_id = o.id and m.role = 'owner' and m.is_active
);
do $$ begin
  if exists (select 1 from public.organizations where active_owner_count = 0) then
    raise exception 'Repair organizations without an active owner before applying this migration';
  end if;
end $$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_organization_id and m.user_id = auth.uid()
      and m.is_active and o.is_active
  );
$$;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_organization_id and m.user_id = auth.uid()
      and m.is_active and o.is_active and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_manage_membership(
  target_organization_id uuid, target_role public.organization_role
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_organization_id and m.user_id = auth.uid()
      and m.is_active and o.is_active
      and (m.role = 'owner' or (m.role = 'admin' and target_role <> 'owner'))
  );
$$;

drop trigger members_keep_owner_before_update on public.organization_members;
drop trigger members_keep_owner_before_delete on public.organization_members;
drop function public.prevent_last_owner_removal();

create function public.maintain_active_owners()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
  was_owner integer := 0;
  becomes_owner integer := 0;
begin
  if tg_op <> 'INSERT' then
    target_id := old.organization_id;
    was_owner := (old.role = 'owner' and old.is_active)::integer;
  end if;
  if tg_op <> 'DELETE' then
    target_id := new.organization_id;
    becomes_owner := (new.role = 'owner' and new.is_active)::integer;
  end if;

  -- Serialize membership changes on the parent, including concurrent role grants.
  -- UPDATE's predicate is rechecked against the latest row after a lock wait;
  -- no snapshot-based count of other owners is used to enforce the invariant.
  if becomes_owner < was_owner then
    update public.organizations set active_owner_count = active_owner_count - 1
    where id = target_id and active_owner_count > 1;
    if not found then
      raise exception using errcode = 'P0001', message = 'last_owner';
    end if;
  else
    update public.organizations
    set active_owner_count = active_owner_count + becomes_owner - was_owner
    where id = target_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger members_maintain_active_owners before insert or update or delete
on public.organization_members for each row execute function public.maintain_active_owners();
revoke all on function public.maintain_active_owners() from public, anon, authenticated;

-- Self-departure is a separate operation; changing one's role still needs manage.
create policy "members may leave" on public.organization_members for delete to authenticated
using (user_id = auth.uid() and public.is_organization_member(organization_id));

create function public.audit_base_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  tenant_id uuid;
  target_id uuid;
  event_name text;
  event_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'organizations' then
    tenant_id := new.id;
    target_id := new.id;
    if tg_op = 'INSERT' then
      event_name := 'organization.created';
    elsif (old.name, old.slug, old.is_active) is distinct from (new.name, new.slug, new.is_active) then
      event_name := 'organization.updated';
      event_metadata := pg_catalog.jsonb_build_object('is_active', new.is_active);
    else
      return new; -- Counter maintenance is not an administrative event.
    end if;
  else
    if tg_op = 'DELETE' then
      tenant_id := old.organization_id;
      target_id := old.user_id;
      event_name := 'member.removed';
      event_metadata := pg_catalog.jsonb_build_object('previous_role', old.role, 'previous_active', old.is_active);
    else
      tenant_id := new.organization_id;
      target_id := new.user_id;
      if tg_op = 'INSERT' then
        event_name := 'member.added';
      elsif (old.role, old.is_active) is distinct from (new.role, new.is_active) then
        event_name := 'member.updated';
        event_metadata := pg_catalog.jsonb_build_object('previous_role', old.role, 'previous_active', old.is_active);
      else
        return new;
      end if;
      event_metadata := event_metadata || pg_catalog.jsonb_build_object('role', new.role, 'is_active', new.is_active);
    end if;
  end if;
  insert into public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, metadata)
  values (tenant_id, auth.uid(), event_name, tg_table_name, target_id, event_metadata);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger organizations_audit after insert or update on public.organizations
for each row execute function public.audit_base_change();
create trigger members_audit after insert or update or delete on public.organization_members
for each row execute function public.audit_base_change();
revoke all on function public.audit_base_change() from public, anon, authenticated;

drop policy "members read audit logs" on public.audit_logs;
create policy "managers read audit logs" on public.audit_logs for select to authenticated
using (public.can_manage_organization(organization_id));

-- Explicit privileges override Supabase's permissive default table grants.
revoke all on public.profiles, public.organizations, public.organization_members, public.audit_logs
from anon, authenticated;
grant select on public.profiles, public.organizations, public.organization_members, public.audit_logs to authenticated;
grant insert, update, delete on public.organization_members to authenticated;
revoke all on sequence public.audit_logs_id_seq from anon, authenticated;

create or replace function public.create_organization(organization_name text, organization_slug text)
returns public.organizations language plpgsql security definer set search_path = '' as $$
declare
  created_organization public.organizations;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if organization_name is null or char_length(trim(organization_name)) not between 1 and 120
    or organization_slug is null or char_length(organization_slug) not between 1 and 120
    or organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'invalid organization';
  end if;
  insert into public.organizations (name, slug) values (trim(organization_name), organization_slug)
  returning * into created_organization;
  insert into public.organization_members (organization_id, user_id, role)
  values (created_organization.id, current_user_id, 'owner');
  select * into created_organization from public.organizations where id = created_organization.id;
  return created_organization;
end;
$$;

-- Existing grants on replaced functions remain; explicitly harden all helpers.
revoke all on function public.create_organization(text, text), public.is_organization_member(uuid),
  public.can_manage_organization(uuid), public.can_manage_membership(uuid, public.organization_role)
from public, anon;
grant execute on function public.create_organization(text, text), public.is_organization_member(uuid),
  public.can_manage_organization(uuid), public.can_manage_membership(uuid, public.organization_role)
to authenticated;
