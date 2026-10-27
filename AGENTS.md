# Repository State

- This repository contains an implemented neutral starter: `apps/web` (Next.js),
  `apps/api` (FastAPI), Supabase migrations, Docker Compose, CI and test tooling.
- Executable manifests and automation take precedence over the proposed paths and
  commands in `ARCHITECTURE.md`. Do not claim a command passed without running it.

# Required Architecture

- Business data must flow `Next.js -> FastAPI -> Supabase PostgreSQL`. Browser access to Supabase is limited to Auth and authorized Storage operations.
- Protected API requests require a Supabase bearer JWT. Business endpoints also require `X-Organization-Id`; only explicitly global organization endpoints omit it.
- Resolve identity, active organization membership, and permission separately for every request. UI permission checks are never an authorization boundary.
- For user-initiated database work, create a Supabase client per request with that user's JWT so RLS evaluates `auth.uid()`. Never mutate auth on a global client or use `service_role` as the default API repository credential.
- Isolate any `service_role` use to explicit administrative jobs or migrations and cover it with authorization tests. A direct pooled PostgreSQL path for user requests requires an ADR defining transaction-scoped claims and cleanup.
- Every business table is tenant-scoped with immutable, non-null `organization_id`, RLS, operation-specific policies, and supporting indexes. Cross-table tenant relationships must use composite organization/resource foreign keys.
- Roles are the fixed PostgreSQL/API enum `owner`, `admin`, and `member`, but endpoints authorize through explicit permissions rather than scattered role-string comparisons. Never allow removal, departure, or demotion of the last owner.
- Create an organization and its first owner membership atomically through a PostgreSQL function deriving the user only from `auth.uid()`. Harden any `security definer` function with a fixed `search_path`, qualified names, validated arguments, and minimal grants.
- Multi-tenant Storage buckets are private and object paths begin `<organization_id>/<resource_type>/<resource_id>/<generated_filename>`. Enforce membership and permissions in `storage.objects` policies; do not trust user filenames.

# Verification Expectations

- Tenant isolation tests must use real JWTs for at least two organizations and cover cross-tenant reads and writes for every RLS operation, Storage path manipulation, and concurrent requests with different identities.
- Frontend unit tests mock FastAPI/Supabase and cover loading, failures, expired sessions, and permission-dependent UI. Integration tests must use local/ephemeral Supabase, never production.
- When scaffolding tooling, preserve the intended split: Vitest for frontend units, pytest for API units/integration, and a small Playwright suite for critical browser flows.

# Source Of Truth

- Read `ARCHITECTURE.md` for the complete design, API conventions, security rationale, and pending decisions. Once implementation exists, executable manifests and automation override its proposed commands and directory layout.
