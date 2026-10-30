import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Select } from "./select";

const meta = {
  title: "Components/Forms/Select",
  component: Select,
  tags: ["autodocs"],
  args: { defaultValue: "member" },
  render: (args) => (
    <label className="ui-field" htmlFor="storybook-role">
      Rol de miembro
      <Select id="storybook-role" {...args}>
        <option value="member">Miembro</option>
        <option value="admin">Administrador</option>
        <option value="owner">Propietario</option>
      </Select>
    </label>
  ),
  argTypes: { disabled: { control: "boolean" } },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };
