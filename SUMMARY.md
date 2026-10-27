# Resumen de implementación

**Vigencia:** snapshot de la primera implementación de la base multi-tenant. Describe
el estado técnico de esa entrega, no la dirección actual del producto. El alcance
vigente está en `README.md` y `docs/decisions/0002-process-platform.md`.

## Estado

La primera entrega implementó la base de autenticación, organizaciones y membresías
descrita en `ARCHITECTURE.md` en ese momento. No incluía módulos de procesos; ahora
el producto evoluciona en este mismo repositorio según el ADR 0002.

## Decisiones tomadas

- Se usa un monorepo liviano: `apps/web` para Next.js y `apps/api` para FastAPI.
- En esta entrega no se incluyó un módulo de negocio; los futuros recursos del
  producto se añaden aquí con migración, RLS, API, UI y pruebas.
- FastAPI crea un cliente Supabase nuevo por request con el JWT del usuario. No se
  configuró ni se requiere `service_role` para requests de usuario.
- La validación de identidad se delega a `supabase.auth.get_user(token)`, que valida
  el JWT contra Supabase Auth. La membresía y permiso se resuelven de nuevo en cada
  request que contiene `X-Organization-Id`.
- Los permisos se centralizan en un mapa Python. Los roles se mantienen como enum
  fijo en PostgreSQL y se reflejan con políticas RLS por operación.
- La creación de organización se hace mediante `public.create_organization`, una
  función `security definer` que toma el usuario únicamente de `auth.uid()` y crea
  atómicamente su membresía `owner`.
- Storage, invitaciones, pagos y jobs permanecen fuera del alcance. No se creó un
  bucket sin tener definido un recurso que lo referencie y su retención.
- La base incluye rate limiting, readiness, métricas protegidas y Sentry opcional;
  proveedores externos, alertas y backups siguen sin configurar.

## Artefactos creados

- Migraciones con tablas, índices, RLS, políticas, función de bootstrap,
  membresías activas, límites de administración, invariantes del último owner y
  auditoría genérica para módulos futuros.
- API versionada con health checks, manejo consistente de errores, CORS configurable
  y endpoints para organizaciones y miembros.
- UI Next.js para registro, sesión y recuperación con Supabase Auth, y para
  crear/cambiar organización mediante FastAPI.
- Pruebas base con Vitest, pytest y Playwright, Docker para la API y un archivo
  `.env.example` sin secretos.
- Flujo de CI para migraciones locales, pruebas unitarias, RLS, lint, build web y
  Playwright en cada pull request.
- Guía `docs/MODULE_PATTERN.md` para incorporar módulos tenant-scoped de forma segura.

## Configuración requerida

1. Instalar Node.js, pnpm, Python 3.12+, `uv`, Docker y Supabase CLI.
2. Ejecutar `supabase start` y copiar sus URL/anon key a `.env` y
   `apps/web/.env.local`, usando `.env.example` como referencia.
3. Aplicar cambios incrementales con `pnpm exec supabase migration up --local`.
   `supabase db reset` borra datos locales y se reserva para entornos desechables.
4. Iniciar la API con `docker compose up --build` o `uvicorn app.main:app --reload`
   desde `apps/api`, y el frontend con `pnpm dev:web`.

Los archivos locales `.env` y `apps/web/.env.local` se ignoran en Git. Docker usa
`host.docker.internal` para que la API en contenedor pueda alcanzar Supabase local
en el host; la API ejecutada con `uv` utiliza `http://127.0.0.1:55321`.

## Verificación realizada

- `pnpm test:web --coverage` pasa (12 pruebas), `pnpm test:api` pasa (23 pruebas)
  y `pnpm test:api:integration` pasa (13 pruebas con JWT reales locales).
- `pnpm lint:api`, `pnpm lint:web` y `pnpm --dir apps/web build` pasan.
- El build de Next.js delimita explícitamente la raíz del monorepo para no usar
  lockfiles ajenos ubicados fuera de este repositorio.
- Los comandos se verificaron localmente con Python 3.13.12; Docker y CI usan
  Python 3.12.
- `docker compose up --build --wait` construye la imagen FastAPI y deja saludable
  la API con Redis real.
- La API usa `uv` para crear su entorno y gestionar sus dependencias, por lo que no
  requiere instalar `python3.12-venv`.
- La migración incremental se aplicó con `pnpm exec supabase migration up --local`.

El entorno local de Supabase usa los puertos `55321` a `55327` para no interferir
con otro proyecto Supabase local que ya usaba los puertos predeterminados.

Supabase local inició y aplicó correctamente las migraciones. `pnpm
test:api:integration` pasa y cubre JWTs reales para dos usuarios, lecturas y
mutaciones cruzadas de membresías, concurrencia sin fuga de identidad, membresías
inactivas y prevención de escalada de `admin` a `owner`.
El endpoint `/ready` comprueba la salud de Supabase Auth sin realizar una consulta
anónima que RLS deba rechazar.
Supabase, la API en Docker y sus endpoints `/health` y `/ready` se verificaron
juntos contra el entorno local.

## Pendiente que requiere definición

- Pruebas de Storage, una vez esté definido el recurso de negocio que tendrá
  archivos.
- Decisión de producto para invitaciones, Storage, proveedor de email, retención,
  pagos, cola y plataforma de observabilidad.
- La descarga local de Chromium de Playwright está bloqueada por timeouts de red,
  incluso con 120 segundos por intento. CI conserva la instalación y ejecución.
- El wrapper E2E usa Chrome o Chromium local cuando está disponible, evitando la
  descarga de Chromium desde la CDN; CI usa Chromium gestionado por Playwright.
- `pnpm test:e2e` pasa (5 pruebas): pantalla sin sesión, registro, creación y
  cambio de organizaciones, logout, gestión de miembros, protección del último
  owner y recuperación completa por correo local. Las trazas se conservan ante
  fallos.
- CORS permite explícitamente los orígenes locales `localhost` y `127.0.0.1` usados
  por desarrollo, E2E y Docker.
- Falta probar migraciones desde cero en una instancia efímera, fallos reales de
  Auth/REST/Redis y límites distribuidos con Redis caído. Requieren un entorno
  aislado o interrumpir dependencias locales activas.
