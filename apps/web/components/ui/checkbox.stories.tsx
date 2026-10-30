import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Checkbox } from "./checkbox";

const meta = {
  title: "Components/Forms/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  render: (args) => (
    <label className="ui-checkbox-field">
      <Checkbox id="storybook-active" {...args} />
      <span>Membresía activa</span>
    </label>
  ),
  argTypes: { disabled: { control: "boolean" }, defaultChecked: { control: "boolean" } },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };
