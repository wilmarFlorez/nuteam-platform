# ADR 0001: Base sin módulo de negocio

## Contexto

Este repositorio se clonará como punto de partida para productos distintos. Un
recurso de ejemplo ejecutable convertiría una decisión de producto en parte del
starter.

## Decisión

La base incluye solo identidad, organizaciones, membresías, roles, permisos,
auditoría genérica y las barreras de seguridad multi-tenant. Los módulos de negocio
se añaden en los repositorios derivados mediante migraciones, endpoints, pantallas,
políticas RLS y pruebas propias.

## Consecuencias

Storage se implementará cuando un módulo defina el recurso propietario, sus reglas
de acceso y su política de retención. Las invitaciones permanecen fuera del alcance
hasta que un producto necesite ese patrón.
