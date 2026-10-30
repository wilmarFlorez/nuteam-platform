import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";
import { Card } from "./card";

const meta = {
  title: "Components/Layout/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="story-card" aria-labelledby="organization-card-title">
      <h2 id="organization-card-title">Organización activa</h2>
      <p className="text-muted">Gestiona los miembros y permisos de tu organización.</p>
      <Button variant="outline">Ver miembros</Button>
    </Card>
  ),
};
