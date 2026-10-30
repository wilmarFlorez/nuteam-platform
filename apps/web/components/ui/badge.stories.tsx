import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "./badge";

const meta = {
  title: "Components/Feedback/Badge",
  component: Badge,
  tags: ["autodocs"],
  args: { children: "Miembro" },
  argTypes: {
    variant: { control: "select", options: ["neutral", "primary", "success", "warning", "danger", "info"] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const Statuses: Story = {
  render: () => (
    <div className="story-row">
      <Badge variant="neutral">Miembro</Badge>
      <Badge variant="primary">Administrador</Badge>
      <Badge variant="success">Activo</Badge>
      <Badge variant="warning">Pendiente</Badge>
      <Badge variant="danger">Suspendido</Badge>
      <Badge variant="info">Auditoría</Badge>
    </div>
  ),
};
