# Dirección del producto

- El código actual es un starter multi-tenant; el producto objetivo es una plataforma para descubrir, diseñar, ejecutar y mejorar procesos operativos con comunicaciones y sistemas fragmentados.
- Empieza por discovery y diseño de procesos, y valida el valor mediante pilotos acotados antes de ampliar la automatización. No empieces por un constructor genérico de agentes.
- Combina IA para entradas ambiguas, reglas deterministas para decisiones de negocio y personas para excepciones. El sistema de registro del cliente sigue siendo la fuente autoritativa.
- El contexto de cada ejecución debe ser útil, trazable y aislado por organización; registra resultados y excepciones para medir y mejorar procesos posteriores.

# Estructura y fuentes de verdad

- `apps/web` es Next.js; `apps/api` es FastAPI; `supabase/migrations` contiene el esquema versionado. La entrada API es `apps/api/app/main.py`.
- Los datos de negocio siguen `Next.js -> FastAPI -> Supabase`. El navegador usa Supabase directamente solo para Auth y Storage autorizado.
- El starter neutral evoluciona aquí al producto de procesos: se permiten módulos de negocio; `docs/MODULE_PATTERN.md` sigue siendo el checklist de seguridad tenant-scoped.
- Consulta `ARCHITECTURE.md` para decisiones completas. Si sus comandos o rutas propuestas discrepan de manifests, scripts o CI, prevalecen las fuentes ejecutables.
- La cola/ejecución durable de workflows sigue pendiente en `ARCHITECTURE.md`; no des por existente un motor ni elijas uno sin decidir reintentos, idempotencia y esperas por intervención humana.

# Seguridad multi-tenant

- Cada request protegido valida JWT, membresía activa de `X-Organization-Id` y permiso por separado. La UI nunca es una barrera de autorización.
- Para operaciones de usuario, crea un cliente Supabase por request con el JWT del usuario para que RLS aplique `auth.uid()`. No compartas sesiones globales ni uses `service_role` salvo en jobs administrativos/migraciones explícitos; una conexión PostgreSQL directa requiere ADR sobre claims y limpieza del pool.
- Toda tabla de negocio lleva `organization_id` no nulo e inmutable, RLS con políticas por operación e índices; las relaciones entre tablas tenant-scoped incluyen la organización en sus claves foráneas.
- Declara permisos en `ROLE_PERMISSIONS`; los roles fijos son `owner`, `admin` y `member`. No permitas eliminar, degradar o dejar sin organización al último `owner`.
- La creación de organización y su primer `owner` es atómica y deriva el usuario solo de `auth.uid()`. Endurece funciones `security definer` con `search_path` fijo y privilegios mínimos.
- Storage aún no está implementado. Si se añade, usa buckets privados, rutas que comiencen por el UUID de organización y políticas RLS; no confíes en nombres de archivo del cliente.

# Comandos y verificación

- Instala con `pnpm install --frozen-lockfile` y `uv sync --directory apps/api --extra dev`. Inicia Supabase local con `pnpm exec supabase start`; sus puertos son 55321–55327.
- `pnpm setup:local` crea `.env` y `apps/web/.env.local`, pero se niega a sobrescribirlos; `--force` los reemplaza. `pnpm exec supabase db reset` borra los datos de la instancia local.
- Aplica migraciones incrementales con `pnpm exec supabase migration up --local`. No uses `db reset` fuera de un entorno local desechable.
- Arranque: API con `uv run --directory apps/api uvicorn app.main:app --reload`; web con `pnpm dev:web`.
- Verificación: `pnpm test:api`, `pnpm test:api:integration`, `pnpm test:web --coverage`, `pnpm lint:api`, `pnpm lint:web`, `pnpm --dir apps/web build` y `pnpm test:e2e`.
- Prueba focalizada: `uv run --directory apps/api pytest tests/unit/test_permissions.py`; web: `pnpm --dir apps/web exec vitest run tests/workspace.test.tsx`.
- Integración y E2E requieren Supabase local; rechazan destinos no locales. Integración usa JWT reales de dos organizaciones. E2E usa puertos 8001/3100 y Chromium; ejecútalos desde la raíz con sus comandos `pnpm`.
- Vitest simula API/Supabase; pytest cubre API y aislamiento RLS; Playwright cubre flujos críticos. No afirmes que un comando pasó si no lo ejecutaste.
