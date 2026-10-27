# Operación

## Configuración por entorno

`ENVIRONMENT=staging` y `ENVIRONMENT=production` exigen Redis, `METRICS_TOKEN` y
`LOG_HASH_KEY` de al menos 32 caracteres, y orígenes CORS HTTPS explícitos. Nunca
uses `service_role` como credencial normal de la API ni expongas secretos mediante
variables `NEXT_PUBLIC_*`.

La API expone `/health` para liveness y `/ready` para Auth, REST y Redis cuando se
configura. `/metrics` solo responde con `Authorization: Bearer <METRICS_TOKEN>`;
no lo publiques sin autenticación. Compose usa Redis real y la API se ejecuta como
usuario sin privilegios.

El rate limiter identifica por `request.client.host`. Configura el proxy inverso
para que la dirección del cliente sea confiable antes de habilitar cabeceras
reenviadas. No aceptes `X-Forwarded-For` directamente desde el navegador.

## Supabase Auth

Para producción configura SMTP, confirmación de correo, `site_url`, redirects
permitidos por dominio y límites de Auth adecuados para la carga real. Los límites
elevados de `supabase/config.toml` son exclusivos de pruebas locales. Comprueba la
recuperación completa desde un navegador contra un buzón de pruebas antes de cada
despliegue.

## Observabilidad y alertas

Sentry es opcional mediante `SENTRY_DSN`; los eventos se sanitizan y no deben
incluir tokens ni PII. Configura en el proveedor elegido alertas para 5xx, latencia
elevada, indisponibilidad de Redis y fallos de jobs. No hay alertas ni proyecto
Sentry configurados en este repositorio.

Limita la retención y el acceso a logs, artefactos de Playwright y cobertura. Antes
de compartirlos, confirma que no contienen variables de entorno ni credenciales.

## Backups y restauración

Activa backups administrados en el proyecto Supabase de cada entorno. Al menos
periódicamente, restaura en un destino aislado y verifica: acceso RLS cruzado,
auditoría, membresías y `active_owner_count`. Registra fecha, origen, destino,
duración y resultado de cada simulacro. Este repositorio no configura backups ni una
automatización de restauración.

## Administración y retención

No existe endpoint ni UI para activar, desactivar o borrar organizaciones. Define
un proceso administrativo autorizado y auditado antes de operar organizaciones
inactivas. Las restricciones de propietario y auditoría impiden improvisar borrados
físicos; define retención y purga por producto antes de introducirlos.

## Comprobaciones de despliegue

1. Ejecuta las suites de README y aplica migraciones en una instancia efímera.
2. Construye `docker compose up --build --wait` con Redis disponible.
3. Comprueba `/health`, `/ready` y autorización de `/metrics`.
4. Simula indisponibilidad de Auth, REST y Redis, y valida respuestas 503.
5. Valida límites 429 y `Retry-After` desde procesos distintos con Redis real.
