import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Alert } from "./alert";

const meta = {
  title: "Components/Feedback/Alert",
  component: Alert,
  tags: ["autodocs"],
  args: { children: "La organización se actualizó correctamente." },
  argTypes: {
    variant: { control: "select", options: ["neutral", "info", "success", "warning", "danger"] },
    role: { control: "select", options: ["status", "alert"] },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const States: Story = {
  render: () => (
    <div className="story-stack">
      <Alert variant="info">Se enviaron las instrucciones de acceso.</Alert>
      <Alert variant="success">La membresía quedó actualizada.</Alert>
      <Alert variant="warning">Esta acción afecta a todos los miembros.</Alert>
      <Alert variant="danger" role="alert">No se pudo guardar el cambio. Inténtalo de nuevo.</Alert>
    </div>
  ),
};
