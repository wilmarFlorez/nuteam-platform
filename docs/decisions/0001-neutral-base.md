# ADR 0001: Base multi-tenant sin módulo de negocio

**Estado:** supersedido como decisión de alcance de producto por
[ADR 0002](0002-process-platform.md). Las decisiones de identidad y seguridad
multi-tenant descritas aquí siguen vigentes.

## Contexto

Al iniciar el repositorio como base SaaS reutilizable, se decidió separar las
capacidades comunes de autenticación y organizaciones de cualquier dominio de negocio.

## Decisión

La primera entrega incluyó identidad, organizaciones, membresías, roles, permisos,
auditoría genérica y las barreras de seguridad multi-tenant. Cada recurso de negocio
debía añadirse como módulo con migraciones, endpoints, pantallas, políticas RLS y
pruebas propias.

## Consecuencias

La primera entrega no implementó Storage ni invitaciones. Storage requiere definir
el recurso propietario, sus reglas de acceso y su política de retención. La decisión
de convertir este repositorio en un producto de procesos permite ahora añadir módulos
de negocio aquí; no elimina el checklist de seguridad de `docs/MODULE_PATTERN.md`.
