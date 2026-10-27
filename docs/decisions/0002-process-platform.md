# ADR 0002: Plataforma de procesos con discovery primero

**Estado:** aceptado.

## Contexto

El repositorio ya implementa una base multi-tenant de autenticación y acceso. El
producto objetivo es ayudar a empresas a descubrir, diseñar, ejecutar y mejorar
procesos operativos que dependen de comunicaciones y sistemas fragmentados. La base
no incluye todavía módulos de procesos ni ejecución durable de workflows.

## Decisión

- Evolucionar este repositorio hacia la plataforma de procesos; los módulos de negocio
  se implementan aquí, no en repositorios derivados.
- Empezar por discovery y diseño de procesos, y validar el valor mediante pilotos
  acotados antes de ampliar la automatización.
- Usar IA para entradas ambiguas, lógica determinista para reglas de negocio explícitas
  y personas para excepciones y decisiones que requieran criterio.
- Mantener los sistemas de registro del cliente como fuentes autoritativas. Guardar
  contexto, resultados y excepciones con trazabilidad y aislamiento por organización.
- Aplicar a cada módulo tenant-scoped el checklist de seguridad de
  `docs/MODULE_PATTERN.md`.

## Consecuencias

- La primera capacidad de producto prevista es discovery y diseño: documentar procesos
  actuales, sus canales y sistemas, métricas base, decisiones y excepciones para elegir
  un piloto verificable.
- No empezar por un constructor genérico de agentes ni asumir que ya existe un motor
  para ejecutar workflows.
- Antes de añadir ejecución durable, decidir en un ADR los reintentos, la idempotencia,
  los estados de espera humana y el comportamiento ante fallos.
- La base actual sigue siendo únicamente la capa de identidad, organizaciones y
  permisos; no se debe documentar como implementada una capacidad aún pendiente.
