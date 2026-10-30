import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  title: "Foundations/Design Tokens",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const colors = [
  ["Primario", "--color-primary"],
  ["Primario hover", "--color-primary-hover"],
  ["Fondo", "--color-background"],
  ["Superficie", "--color-surface"],
  ["Texto principal", "--color-text"],
  ["Texto secundario", "--color-text-muted"],
  ["Borde", "--color-border"],
  ["Éxito", "--color-success"],
  ["Advertencia", "--color-warning"],
  ["Error", "--color-danger"],
  ["Información", "--color-info"],
];

const spacing = [
  ["1 · 4 px", "--space-1"],
  ["2 · 8 px", "--space-2"],
  ["3 · 12 px", "--space-3"],
  ["4 · 16 px", "--space-4"],
  ["6 · 24 px", "--space-6"],
  ["8 · 32 px", "--space-8"],
  ["12 · 48 px", "--space-12"],
];

function Foundations() {
  return (
    <main className="foundation-page">
      <header className="foundation-header">
        <p className="eyebrow">NuTeam · Sistema visual</p>
        <h1>Foundations</h1>
        <p className="text-muted">Tokens compartidos por la aplicación y sus componentes.</p>
      </header>

      <section className="foundation-section" aria-labelledby="foundation-colors">
        <h2 id="foundation-colors">Color</h2>
        <div className="foundation-colors">
          {colors.map(([label, token]) => (
            <div className="foundation-color" key={token}>
              <span className="foundation-color__swatch" style={{ backgroundColor: `var(${token})` }} />
              <span>{label}</span>
              <code>{token}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="foundation-section" aria-labelledby="foundation-type">
        <h2 id="foundation-type">Tipografía</h2>
        <div className="foundation-type">
          <p className="foundation-type__sample foundation-type__sample--display">Diseño claro para operaciones complejas</p>
          <p className="foundation-type__sample foundation-type__sample--heading">Título de sección</p>
          <p className="foundation-type__sample">Texto de interfaz: estados, instrucciones y datos.</p>
          <p className="foundation-type__sample foundation-type__sample--small text-muted">Texto auxiliar · 14 px</p>
          <code>system-ui · escalas semánticas</code>
        </div>
      </section>

      <section className="foundation-section" aria-labelledby="foundation-spacing">
        <h2 id="foundation-spacing">Espaciado</h2>
        <div className="foundation-spacing">
          {spacing.map(([label, token]) => (
            <div className="foundation-spacing__item" key={token}>
              <span>{label}</span>
              <span className="foundation-spacing__bar" style={{ width: `var(${token})` }} />
              <code>{token}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="foundation-section" aria-labelledby="foundation-shape">
        <h2 id="foundation-shape">Forma y elevación</h2>
        <div className="foundation-shapes">
          <div className="foundation-shape foundation-shape--sm">Radio pequeño</div>
          <div className="foundation-shape foundation-shape--md">Radio medio</div>
          <div className="foundation-shape foundation-shape--lg">Radio amplio</div>
        </div>
      </section>
    </main>
  );
}

export const Overview: Story = { render: () => <Foundations /> };
