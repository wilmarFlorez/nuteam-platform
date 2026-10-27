create type public.organization_role as enum ('owner', 'admin', 'member');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_organization_idx
  on public.organization_members (user_id, organization_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_organization_created_at_idx
  on public.audit_logs (organization_id, created_at desc);

create or replace function public.prevent_last_owner_removal()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.role = 'owner' and old.is_active and (
    tg_op = 'DELETE' or new.role <> 'owner' or not new.is_active
  ) and not exists (
    select 1 from public.organization_members
    where organization_id = old.organization_id
      and user_id <> old.user_id
      and role = 'owner'
      and is_active
  ) then
    raise exception 'an organization must retain an owner';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.prevent_membership_identity_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
    raise exception 'membership identity cannot be changed';
  end if;
  return new;
end;
$$;

create trigger members_keep_owner_before_update before update on public.organization_members
for each row execute function public.prevent_last_owner_removal();
create trigger members_keep_owner_before_delete before delete on public.organization_members
for each row execute function public.prevent_last_owner_removal();
create trigger members_keep_identity_before_update before update on public.organization_members
for each row execute function public.prevent_membership_identity_change();

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and is_active
  );
$$;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and is_active
  );
$$;

create or replace function public.can_manage_membership(
  target_organization_id uuid,
  target_role public.organization_role
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members actor
    where actor.organization_id = target_organization_id
      and actor.user_id = auth.uid()
      and actor.is_active
      and (
        actor.role = 'owner'
        or (actor.role = 'admin' and target_role <> 'owner')
      )
  );
$$;

create or replace function public.create_organization(organization_name text, organization_slug text)
returns public.organizations language plpgsql security definer set search_path = '' as $$
declare
  created_organization public.organizations;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;
  if char_length(trim(organization_name)) not between 1 and 120 then
    raise exception 'organization name must contain between 1 and 120 characters';
  end if;
  if organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'organization slug is invalid';
  end if;

  insert into public.organizations (name, slug)
  values (trim(organization_name), organization_slug)
  returning * into created_organization;

  insert into public.organization_members (organization_id, user_id, role)
  values (created_organization.id, current_user_id, 'owner');

  return created_organization;
end;
$$;

create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger auth_user_profile after insert on auth.users
for each row execute function public.create_profile_for_user();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_logs enable row level security;

create policy "users read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "members read organizations" on public.organizations for select to authenticated using (public.is_organization_member(id));
create policy "members read memberships" on public.organization_members for select to authenticated using (public.is_organization_member(organization_id));
create policy "owners and admins add members" on public.organization_members for insert to authenticated with check (public.can_manage_membership(organization_id, role));
create policy "owners and admins update members" on public.organization_members for update to authenticated using (public.can_manage_membership(organization_id, role)) with check (public.can_manage_membership(organization_id, role));
create policy "owners and admins remove members" on public.organization_members for delete to authenticated using (public.can_manage_membership(organization_id, role));
create policy "members read audit logs" on public.audit_logs for select to authenticated using (public.is_organization_member(organization_id));

revoke all on public.profiles, public.organizations, public.organization_members, public.audit_logs from anon;
grant select on public.profiles, public.organizations, public.organization_members, public.audit_logs to authenticated;
grant insert, update, delete on public.organization_members to authenticated;
revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.can_manage_organization(uuid) from public;
revoke all on function public.can_manage_membership(uuid, public.organization_role) from public;
revoke all on function public.create_organization(text, text) from public;
revoke all on function public.prevent_last_owner_removal() from public;
revoke all on function public.prevent_membership_identity_change() from public;
revoke all on function public.create_profile_for_user() from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.can_manage_organization(uuid) to authenticated;
grant execute on function public.can_manage_membership(uuid, public.organization_role) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
