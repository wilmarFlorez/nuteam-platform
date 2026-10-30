import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "./input";

const meta = {
  title: "Components/Forms/Input",
  component: Input,
  tags: ["autodocs"],
  args: { type: "email", placeholder: "nombre@empresa.com" },
  argTypes: { type: { control: "select", options: ["text", "email", "password", "search"] } },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <label className="ui-field" htmlFor="storybook-email">
      Correo electrónico
      <Input id="storybook-email" {...args} />
    </label>
  ),
};

export const Invalid: Story = {
  args: { defaultValue: "no-es-un-correo", "aria-invalid": true },
  render: (args) => (
    <label className="ui-field" htmlFor="storybook-email-invalid">
      Correo electrónico
      <Input id="storybook-email-invalid" {...args} />
      <span className="ui-field__error">Introduce un correo electrónico válido.</span>
    </label>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "solo lectura" },
  render: (args) => (
    <label className="ui-field" htmlFor="storybook-input-disabled">
      Campo deshabilitado
      <Input id="storybook-input-disabled" {...args} />
    </label>
  ),
};
