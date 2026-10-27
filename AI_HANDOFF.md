# Contexto y tareas pendientes para la siguiente IA

Actualizado: 10 de septiembre de 2026.

## 1. Instrucción del usuario y punto de corte

El usuario pidió implementar las recomendaciones del diagnóstico para completar
el starter. Durante la implementación cambió el alcance:

> termina la tarea que estas ejecutando lo demas no lo implementes delega las tareas a travez de un documento md que servira como contexto a otra ai

Se cerraron las verificaciones y los ajustes mínimos de los cambios ya escritos.
**Las tareas restantes se delegan mediante este documento. No se ha completado
todo el plan original ni se declara el starter listo para producción.**

La siguiente IA debe revisar el estado existente antes de continuar; no volver a
implementar funcionalidades que ya están presentes. No se lanzaron subagentes.

## 2. Entorno y fuentes de verdad

### Actualización posterior

- `pnpm test:e2e` ya pasa con cinco flujos: autenticación, organizaciones,
  miembros, último owner y recuperación completa a través de Mailpit local.
- `docker compose up --build --wait` ya construyó y dejó saludable la API con
  Redis real; el stack se detuvo al finalizar la comprobación.
- La prueba concurrente de bootstrap con slug duplicado, las protecciones de
  identidad de membresía y del contador interno ya están en integración.
- `README.md` y `docs/OPERATIONS.md` ya existen. Las secciones de tareas de este
  documento describen el estado previo y solo siguen vigentes para los puntos
  operativos, de migración efímera y de proveedores externos que no se puedan
  comprobar sin infraestructura adicional.

- Ruta: `/home/wilmar/Documentos/projects/own/base`.
- Monorepo: Next.js/React/TypeScript en `apps/web`, FastAPI/Python en `apps/api`,
  PostgreSQL/Auth de Supabase local y CLI en `supabase`.
- Gestores: pnpm 9.15.0 y uv. Existen `pnpm-lock.yaml` y `apps/api/uv.lock`.
- La verificación local de Python usó 3.13.12; Docker/CI están configurados con 3.12.
- No se hicieron commits. El entorno informó que este directorio no era un repo Git.
- Leer `ARCHITECTURE.md`, `AGENTS.md`, `docs/decisions/0001-neutral-base.md` y
  `docs/MODULE_PATTERN.md`.
- **`AGENTS.md` está desactualizado en su sección Repository State:** dice que solo
  existe documentación. Sus restricciones de arquitectura siguen siendo válidas.
- `SUMMARY.md` también necesita reconciliarse con el código actual.
- No se editaron `.env` ni `apps/web/.env.local`; no sobrescribir sus valores.

### Restricciones arquitectónicas que deben preservarse

1. Negocio: `Next.js -> FastAPI -> Supabase PostgreSQL`.
2. Supabase directo desde navegador únicamente para Auth y Storage autorizado.
3. JWT por request; header `X-Organization-Id` en endpoints tenant-scoped.
4. Identidad, organización/membresía activa y permisos se validan por separado.
5. Cliente Supabase por request con JWT del usuario; nunca `service_role` como
   credencial normal de repositorios y nunca cambiar auth en un cliente global.
6. Roles fijos `owner`, `admin`, `member`; permisos explícitos en API y RLS en SQL.
7. Nunca dejar una organización sin propietario activo, incluso con concurrencia.
8. Bootstrap organización + owner atómico, con identidad derivada de `auth.uid()`.
9. Datos tenant-scoped con RLS, índices, tenant inmutable y FK compuestas cuando
   relacionen recursos tenant-scoped.
10. Pruebas de integración solo contra Supabase local/efímero.

El ADR neutral excluye deliberadamente módulos de negocio, pagos, invitaciones
por correo y Storage hasta que un producto los necesite. No añadirlos como forma
de “completar” este trabajo.

## 3. Cambios implementados

### 3.1 SQL: propietarios, organizaciones inactivas y auditoría

Archivo nuevo:

`supabase/migrations/20260910010000_complete_neutral_base.sql`

- Migración incremental: conserva la migración inicial y los datos existentes.
- Añade `organizations.active_owner_count`, interno y sin permisos de escritura
  para roles de aplicación; inicializa el contador a partir de las membresías.
- Aborta si ya existen organizaciones sin propietario activo: requiere reparar
  explícitamente esos datos antes de migrar.
- Sustituye la comprobación anterior del último owner por un trigger con UPDATE
  atómico del contador del padre. Al decrementar exige `active_owner_count > 1`.
- Los cambios de membresías se serializan mediante la fila de organización.
- No sustituir esta garantía por un simple `SELECT count(*)` sin coordinación:
  las comprobaciones basadas únicamente en snapshots permitían carreras.
- Los helpers RLS comprueban organización activa y membresía activa.
- Permite salida propia mediante política DELETE específica; la restricción del
  último owner continúa aplicándose.
- Auditoría transaccional mediante triggers para creación/actualización de
  organización y alta/cambio/retiro de membresías. No registra cambios internos
  del contador ni operaciones fallidas.
- Lectura de auditoría restringida a owner/admin. Escrituras directas de clientes
  a auditoría revocadas. También se endurecen grants de tablas y funciones.
- Bootstrap valida argumentos nulos, formato y longitud; deriva el usuario del JWT.

**Ya se ejecutó con éxito** `pnpm exec supabase migration up --local`.
No se hizo `supabase db reset`, ni se reinició Supabase después de editar su
configuración de Auth.

### 3.2 API

Archivos principales:

- `apps/api/app/api/dependencies.py`
- `apps/api/app/api/routes/{organizations,members,access}.py`
- `apps/api/app/schemas/organizations.py`
- `apps/api/app/core/{errors,config,rate_limit,observability}.py`
- `apps/api/app/main.py`

Implementación:

- Dependencias y rutas que usan el SDK síncrono son funciones síncronas, ejecutadas
  por FastAPI fuera del event loop.
- Se reutiliza un cliente Supabase durante el request y se cierran sus transportes
  Auth/PostgREST al finalizar la dependencia.
- Enum API `OrganizationRole`; eliminado el permiso residual `projects:read`.
- Permisos: `members:read`, `members:manage`, `owners:manage`, `members:leave`,
  `audit:read`, según rol.
- Errores diferenciados: JWT inválido/expirado, fallos de Auth/DB, conflictos,
  restricciones y último propietario; formato `code`, `message`, `details`.
- Validación no devuelve los valores de entrada sensibles.
- Frontera de errores inesperados devuelve 500 genérico; request ID generado por
  servidor y logs JSON sin tokens, con usuario seudonimizado mediante HMAC.

Endpoints actuales, todos bajo `/api/v1`:

| Método/ruta | Alcance |
| --- | --- |
| `GET /organizations` | Global autenticado: organizaciones visibles y activas |
| `POST /organizations` | Global autenticado: bootstrap atómico |
| `GET /organization` | Tenant: identidad, rol y permisos efectivos |
| `GET /members` | Tenant: lista de membresías |
| `POST /members` | Tenant: agregar cuenta existente por `user_id` UUID y rol |
| `PATCH /members/{user_id}` | Tenant: cambiar rol/estado; body exige `role` e `is_active` |
| `DELETE /members/{user_id}` | Tenant: retirar miembro |
| `DELETE /members/me` | Tenant: abandonar organización |
| `GET /audit-logs?limit=50&before=<id>` | Tenant: auditoría con cursor, máximo 100 |

La incorporación de miembros usa UUID de una cuenta ya registrada, visible en su
propia sesión. No se añadió búsqueda pública por email ni invitaciones.

### 3.3 Frontend

- `apps/web/app/page.tsx`: sesión, organizaciones, selección y creación; manejo
  específico de 401; cancelación de cargas y limpieza de datos al cambiar tenant.
- `apps/web/components/auth-panel.tsx`: registro, login, solicitud de recuperación,
  formulario de nueva contraseña y confirmación, `updateUser`, cierre local de
  sesión al completar el cambio.
- Recuperación mediante `PASSWORD_RECOVERY` y redirect `/?recovery=1`; estados
  para enlaces inválidos/expirados.
- `apps/web/components/workspace.tsx`: permisos recibidos desde API, gestión de
  miembros, rol/estado, salida y auditoría paginada. Controles owner ocultos a admin.
- `apps/web/lib/api.ts`: `ApiError` conserva status/code/request ID.
- `apps/web/lib/types.ts`: contratos de UI.
- Se corrige el uso de `event.currentTarget` después de `await` al crear organización.
- Build usa `.next-build`; desarrollo normal mantiene `.next`; configuración E2E
  prepara `.next-e2e`. Esto evita la colisión original build/dev.
- Next añadió `.next-build/types/**/*.ts` a `apps/web/tsconfig.json` durante el build.

### 3.4 Operación y tooling: escritos, aún por terminar de verificar

- Rate limiting por IP de transporte, general y de escrituras. Redis atómico para
  despliegues; fallback en memoria acotado solo para desarrollo/pruebas.
- Staging/producción exigen Redis, secretos de métricas/HMAC de 32+ caracteres y
  orígenes CORS HTTPS explícitos.
- Métricas Prometheus en `/metrics`, protegidas con `METRICS_TOKEN` y deshabilitadas
  si no se configura. Contadores/latencia por plantilla de ruta.
- Integración opcional Sentry con sanitización; **no hay alertas desplegadas**.
- `/ready` consulta Auth, REST y Redis si está configurado. Consultar la raíz REST
  no demuestra por sí solo que una consulta SQL de negocio pueda ejecutarse.
- `docker-compose.yml`: variable anon key corregida, Redis y healthchecks; montaje
  solo del código API para no ocultar el entorno virtual de la imagen.
- Dockerfile con uv y lockfile, usuario sin privilegios y `.dockerignore`.
- `.github/workflows/ci.yml`: orden de pnpm corregido, entorno local con claves
  permitidas explícitamente, cobertura, build y Chromium.
- `scripts/local.py`: comandos `env`, `ci-env`, `e2e`. Solo exporta configuración
  pública permitida de Supabase local. `env` rechaza sobrescribir archivos salvo
  `--force`. **No se ejecutó contra los archivos .env existentes.**
- `scripts/test-api-integration.sh`: pasa también DSN local a fixtures y admite
  argumentos adicionales de pytest.
- `supabase/config.toml`: redirects locales, longitud mínima y límites Auth para
  pruebas. Los límites altos locales **no son una configuración de producción**.
- `apps/web/playwright.config.ts`: Chromium, puertos API 8001/web 3100, sin reutilizar
  servidores previos; ejecución prevista desde `pnpm test:e2e`.
- Actualizados manifiestos, lockfiles, ignores y configuración de Vitest/ESLint.

## 4. Evidencia de verificación

Resultados de esta implementación, no del diagnóstico anterior:

| Comando | Resultado |
| --- | --- |
| `uv sync --directory apps/api --extra dev` | Correcto; lock y dependencias actualizados |
| `pnpm install --prefer-offline` | Correcto; resolvió un timeout de instalación anterior |
| `pnpm exec supabase migration up --local` | Migración aplicada |
| `uv run --directory apps/api pytest tests/unit` | **21 aprobadas** |
| `pnpm test:api:integration` | **11 aprobadas** con Supabase local |
| `pnpm test:web --coverage` | **12 aprobadas**, reporte en `apps/web/coverage/` |
| `pnpm lint:api` | Aprobado |
| `pnpm lint:web` | Aprobado |
| `pnpm --dir apps/web build` | Aprobado, incluyendo tipos |

El wrapper `test:web` se corrigió a `pnpm --dir apps/web run test` para reenviar
`--coverage`; ese comando ya pasó después del ajuste.

### Qué cubren las nuevas pruebas

- `apps/api/tests/integration/test_complete_base.py`: ciclo de membresías,
  restricciones admin/owner, auditoría y rollback, paginación, aislamiento HTTP y
  RLS, organización inactiva, bootstrap autenticado y validado.
- Tres pruebas concurrentes reales atravesando FastAPI: degradar, desactivar y
  salir con dos propietarios. Se bloquea temporalmente la fila padre desde una
  conexión local de fixture y se espera que ambos requests alcancen el bloqueo SQL.
  Se verifica un éxito + un 409 `last_owner`, y contador/filas finales iguales a 1.
- Pruebas concurrentes con distintos JWT a FastAPI, además de las anteriores de
  clientes Supabase directos en `test_tenant_rls.py`.
- Fixtures nuevas usan conexión PostgreSQL administrativa **solo local** para
  preparación/inspección/limpieza de sus IDs aleatorios. No es un repositorio de
  usuario ni se añadió `service_role` al runtime.
- `apps/api/tests/unit/test_operations.py`: errores seguros, CORS, cierre de clientes,
  rate limiting en memoria y sanitización de eventos.
- `apps/web/tests/{home,workspace}.test.tsx`: carga, errores, 401, cambio de tenant,
  respuesta tardía de otro tenant, UI por permisos y recuperación de contraseña.

### No verificado todavía

- E2E con la implementación nueva.
- Build/arranque de la nueva imagen Docker y healthcheck con Redis.
- Pipeline completo de GitHub Actions.
- Rate limiting compartido entre procesos con Redis real y caída de Redis.
- Exportación de métricas y envío real a Sentry.
- Cobertura pytest XML mediante los comandos nuevos de CI.
- Migración completa en una instancia vacía/efímera desde cero.
- Recuperación completa por correo real de Supabase local en navegador.

No se reconstruyó el contenedor API preexistente. Puede necesitar reconstrucción
para disponer de las dependencias nuevas. No se detuvieron servidores del usuario
ni se reinició Supabase tras cambiar `config.toml`.

## 5. Trabajo delegado, en orden recomendado

### Tarea A — Validar y cerrar E2E del núcleo

1. Revisar `scripts/local.py` y `apps/web/playwright.config.ts`.
2. Aplicar la configuración local de Auth mediante el procedimiento de reinicio
   de Supabase que preserve datos; no resetear la instancia de trabajo para ello.
3. Instalar Chromium: `pnpm --dir apps/web exec playwright install chromium`.
4. Ejecutar `pnpm test:e2e`.
5. Ampliar `apps/web/e2e/smoke.spec.ts`: sigue conteniendo solo los tres tests
   anteriores, no se reescribió en esta implementación.
6. Cubrir: crear/cambiar dos organizaciones, agregar cuenta registrada, cambiar
   rol/estado, acceso rechazado, último owner, logout y recuperación hasta login
   con la contraseña nueva. Usar el correo local, no producción.
7. Confirmar que no se muestren miembros/auditoría del tenant anterior durante
   cargas, cambios de sesión o respuestas tardías.

Criterio de cierre: flujos reales aprobados y trazas conservadas al fallar; no
reutilizar el servidor del usuario en 3000 para los E2E.

### Tarea B — Completar verificación de integridad y regresiones

- Añadir bootstrap concurrente con slug duplicado: exactamente una organización,
  un primer owner y auditoría consistente, sin filas huérfanas.
- Ampliar eliminación/desactivación/reactivación y límites admin/owner donde falte
  cobertura; no duplicar pruebas ya existentes.
- Verificar manipulación de ambas columnas de identidad de membresía y escritura
  indebida al contador interno.
- Revisar que todos los tests de integración rechacen destinos de producción,
  incluidos los heredados en `test_tenant_rls.py`.
- Revisar limpieza de fixtures heredadas: las nuevas limpian sus propios datos;
  los tests anteriores crean usuarios/organizaciones aleatorios sin limpieza.
- Probar migraciones desde cero en Supabase efímero, conservando la base local.

### Tarea C — Estabilizar operación y CI

- Construir y arrancar Compose con las dependencias/lock actuales y Redis real.
- Validar `pnpm setup:local` en entorno nuevo sin sobrescribir configuración del
  usuario; `ci-env` debe exportar solo valores necesarios y sin comillas residuales.
- Ejecutar el equivalente local de CI y revisar los artefactos de cobertura.
- Verificar readiness con fallo real de Auth, REST/DB y Redis; decidir una
  comprobación SQL efectiva con privilegios mínimos si es necesaria.
- Probar límites distribuidos, respuestas 429/Retry-After y comportamiento 503
  cuando Redis está caído.
- Documentar/configurar proxy de confianza: el limitador usa `request.client.host`;
  no confiar indiscriminadamente en headers reenviados del navegador.
- Verificar acceso autorizado/denegado a `/metrics` y cardinalidad acotada.
- Configurar la integración real de errores y reglas de alertas para 5xx y latencia;
  si se requieren decisiones de proveedor/destino, pedirlas al usuario.
- Revisar que logs/runtime/artefactos nunca incluyan credenciales.

### Tarea D — Documentación y preparación para despliegue

- Crear `README.md` con instalación, comandos reales, puertos, migraciones,
  recuperación, permisos, alta por UUID, pruebas y desarrollo de módulos.
- Actualizar estado de `AGENTS.md` y reconciliar `SUMMARY.md`.
- Crear `docs/OPERATIONS.md`: **todavía no existe**, aunque `config.toml` ya lo cita.
- Documentar configuración de producción de Supabase Auth (SMTP, confirmación,
  URLs permitidas y rate limits), CORS, Redis, métricas y Sentry.
- Documentar backups y una prueba periódica de restauración a destino aislado con
  verificación de RLS, auditoría, membresías y contador de propietarios.
- Definir y documentar recuperación administrativa de organización desactivada;
  no existe endpoint/UI para activar o desactivar organizaciones.
- Documentar retención/purga: auditoría e invariantes de owner restringen borrados
  físicos; no improvisar un borrado de organizaciones/usuarios.
- No afirmar que backups, alertas o servicios externos están configurados solo
  porque existe documentación. Registrar lo efectivamente probado.

## 6. Comandos de continuación

```bash
pnpm install --frozen-lockfile
uv sync --directory apps/api --frozen --extra dev
pnpm test:api
pnpm test:api:integration
pnpm test:web --coverage
pnpm lint:api
pnpm lint:web
pnpm --dir apps/web build
```

Para las tareas operativas/E2E pendientes, después de revisar configuración:

```bash
docker compose up --build --wait
pnpm --dir apps/web exec playwright install chromium
pnpm test:e2e
```

Los tests E2E tienen sus propios puertos y directorio de Next. No ejecutar builds
y servidores que compartan el mismo `distDir`. No sobrescribir `.env` con
`pnpm setup:local --force` sin revisar primero la configuración existente.
