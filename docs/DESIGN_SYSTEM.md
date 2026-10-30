# Design System de NuTeam

## Propósito

Este sistema visual estandariza la interfaz existente de autenticación y administración
multi-tenant. Conserva la paleta azul de la aplicación y permite incorporar módulos de
discovery y diseño de procesos sin duplicar estilos ni componentes.

## Arquitectura

```text
apps/web/
  app/styles.css                 # Tokens, reset, layouts y estilos de componentes
  components/ui/                 # Primitivas compartidas y sus historias
  stories/foundations.stories.tsx # Catálogo visual de foundations
  .storybook/                    # Configuración de Storybook
```

- **Foundations:** tokens CSS primitivos y semánticos para color, tipografía, espaciado,
  radios, sombras, focus y breakpoints documentados.
- **Primitivas:** Button, Input, Select, Checkbox, Card, Badge, Alert y Spinner.
- **Composición:** las pantallas de autenticación y workspace componen estas primitivas;
  las reglas de sesión, permisos y llamadas API siguen en sus componentes actuales.
- **Documentación:** Storybook importa la misma hoja global y las mismas primitivas que
  utiliza la aplicación. Las historias no duplican implementaciones visuales.

## Decisiones visuales

- **Color:** se mantiene el azul actual `#1d4ed8` y su hover `#1e40af`; ambos conservan
  contraste suficiente sobre blanco. La paleta se amplía con neutros y colores semánticos
  para información, éxito, advertencia y error.
- **Tema:** claro como única apariencia por ahora, coherente con la aplicación existente.
- **Tipografía:** stack de sistema, sin descargar una fuente ni añadir una dependencia.
- **Espaciado:** escala de 4 px con pasos de 4, 8, 12, 16, 20, 24, 32, 40, 48 y 64 px.
- **Controles:** variantes explícitas, foco de teclado visible, estados activos y disabled;
  los controles nativos conservan su semántica y navegación por teclado.
- **Responsive:** contenido fluido con puntos de adaptación en 640 y 768 px; los formularios
  de varias columnas pasan a una columna en pantallas pequeñas.

## Componentes disponibles

| Componente | Uso actual |
| --- | --- |
| `Button` | Acciones primarias, secundarias, de texto y destructivas |
| `Input` | Credenciales, nombre/slug de organización e IDs |
| `Select` | Organización y roles |
| `Checkbox` | Estado de membresía |
| `Card` | Secciones de organización, membresías y auditoría |
| `Badge` | Roles y estado de membresía |
| `Alert` | Mensajes de éxito, información y error |
| `Spinner` | Carga de sesión y datos |

Se añadirán primitivas nuevas cuando exista una pantalla que las use; no se crean
componentes vacíos para escenarios hipotéticos.

## Storybook

Storybook usa `@storybook/nextjs-vite` y `@storybook/addon-a11y`. Las historias se agrupan
en Foundations y Components, y documentan controles, tamaños, estados deshabilitados y
casos de error.

Desde la raíz del monorepo:

```bash
pnpm --dir apps/web storybook
pnpm --dir apps/web build-storybook
```

Al añadir un componente:

1. Confirma que el caso de uso exista en una pantalla o requisito aprobado.
2. Define su API, variantes, tamaño, semántica y estados de teclado.
3. Implementa estilos con tokens semánticos; evita valores hexadecimales sueltos.
4. Migra al menos una pantalla real para que Storybook refleje uso de producción.
5. Añade historias con controles y estados relevantes; revisa el addon de accesibilidad.
6. Ejecuta tests/lint de web y `build-storybook`.
