# Patrón para módulos derivados

Cada módulo de negocio se implementa en el repositorio que clona esta base. No se
añaden recursos de ejemplo al starter.

## Checklist obligatorio

1. Crear una migración que incluya `organization_id uuid not null`, clave foránea a
   `public.organizations`, índice por organización y unicidad con alcance tenant.
2. Habilitar RLS en la misma migración y declarar políticas separadas para `select`,
   `insert`, `update` y `delete`. Las relaciones entre recursos tenant-scoped usan
   claves foráneas compuestas con `organization_id`.
3. Declarar el permiso del módulo en `ROLE_PERMISSIONS` y proteger cada endpoint con
   `require_permission`. El header `X-Organization-Id` nunca reemplaza el tenant
   persistido del recurso.
4. Añadir schemas Pydantic, ruta FastAPI bajo `/api/v1`, UI que consume FastAPI y
   estados de carga, error y sesión expirada.
5. Registrar acciones sensibles en `audit_logs` desde un caso de uso o trigger
   seguro. No permitir que el navegador escriba logs de auditoría arbitrarios.
6. Añadir pruebas unitarias y de integración con JWT reales de dos organizaciones,
   incluyendo todos los verbos RLS, intentos cruzados y requests concurrentes.

## Archivos

- SQL: `supabase/migrations/<timestamp>_<module>.sql`
- API: `apps/api/app/api/routes/<module>.py` y `apps/api/app/schemas/<module>.py`
- UI: `apps/web/app/` o componentes del módulo
- Tests: `apps/api/tests/` y `apps/web/tests/`
