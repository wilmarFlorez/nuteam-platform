import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";

const meta = {
  title: "Components/Actions/Button",
  component: Button,
  tags: ["autodocs"],
  args: { children: "Guardar cambios", type: "button" },
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "outline", "ghost", "destructive", "link"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    type: { control: false },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const Disabled: Story = { args: { disabled: true } };

export const Variants: Story = {
  render: () => (
    <div className="story-row">
      <Button>Primario</Button>
      <Button variant="secondary">Secundario</Button>
      <Button variant="outline">Contorno</Button>
      <Button variant="ghost">Neutro</Button>
      <Button variant="destructive">Eliminar</Button>
      <Button variant="link">Enlace</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="story-row story-row--align-center">
      <Button size="sm">Pequeño</Button>
      <Button size="md">Mediano</Button>
      <Button size="lg">Grande</Button>
    </div>
  ),
};
