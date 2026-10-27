# Plataforma de procesos operativos

Plataforma para descubrir, diseñar, ejecutar y mejorar procesos operativos que hoy
dependen de comunicaciones y sistemas fragmentados. La dirección de producto
empieza por discovery y diseño, y valida el valor con pilotos acotados antes de
ampliar la automatización. Combina IA para entradas ambiguas, reglas explícitas
para decisiones de negocio y personas para excepciones; los sistemas de registro
del cliente siguen siendo autoritativos.

## Estado actual

El código implementa la base multi-tenant: autenticación, organizaciones,
membresías, permisos, auditoría y aislamiento RLS con Next.js, FastAPI y Supabase.
El módulo de discovery de procesos, la ejecución durable de workflows, las
integraciones operativas y Storage aún no están implementados. Consulta
[`docs/decisions/0002-process-platform.md`](docs/decisions/0002-process-platform.md)
para la decisión de producto y `ARCHITECTURE.md` para las decisiones técnicas.

## Requisitos

- Node.js 22, pnpm 9.15.0, Python 3.12+ y `uv`.
- Docker y Supabase CLI.

## Inicio local

1. Ejecuta `pnpm install --frozen-lockfile` y `uv sync --directory apps/api --extra dev`.
2. Inicia Supabase con `pnpm exec supabase start`.
3. Genera la configuración local con `pnpm setup:local`. El comando se niega a
   reemplazar `.env` o `apps/web/.env.local`; revísalos o usa `--force` solo si
   deseas regenerarlos.
4. Aplica las migraciones con `pnpm exec supabase migration up --local`.
5. Inicia la API con `uv run --directory apps/api uvicorn app.main:app --reload`
   y la web con `pnpm dev:web`.

Supabase local usa los puertos 55321 a 55327. La API usa el puerto 8000 y la web
el 3000. Los E2E usan 8001 y 3100 para no reutilizar servidores de desarrollo.

## Uso

Registra una cuenta desde la web, crea una organización y añade miembros mediante
su UUID de usuario, que cada persona puede consultar en su propia sesión. Los roles
son `owner`, `admin` y `member`; la API resuelve permisos en cada request y exige
`X-Organization-Id` en rutas tenant-scoped.

La recuperación solicita un correo de Supabase Auth. En local, consulta Mailpit en
`http://127.0.0.1:55324`; en producción configura SMTP y los redirects antes de
habilitarla.

## Verificación

```bash
pnpm test:api
pnpm test:api:integration
pnpm test:web --coverage
pnpm lint:api
pnpm lint:web
pnpm --dir apps/web build
pnpm test:e2e
docker compose up --build --wait
```

Las integraciones y E2E rechazan destinos que no sean Supabase local. Los E2E usan
Chromium instalado por Playwright; si no está disponible, `scripts/local.py` usa
Chrome o Chromium instalado localmente. Las trazas se conservan ante fallos.

## Evolución del producto

El siguiente módulo previsto es discovery y diseño de procesos: documentar el flujo
actual, canales, sistemas, métricas, decisiones y excepciones para seleccionar un
piloto medible. Los módulos de negocio pertenecen a este producto, no a un repositorio
derivado. Sigue [`docs/MODULE_PATTERN.md`](docs/MODULE_PATTERN.md) para cada recurso
tenant-scoped: migración, RLS, permisos API, UI a través de FastAPI, auditoría y
pruebas con dos tenants y JWT reales.

## Operación

Consulta [`docs/OPERATIONS.md`](docs/OPERATIONS.md) antes de desplegar. El repositorio
no configura proveedores de SMTP, Sentry, alertas ni backups gestionados.
