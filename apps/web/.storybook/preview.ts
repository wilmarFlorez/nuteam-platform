import type { Preview } from "@storybook/nextjs-vite";
import "../app/styles.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: ["Foundations", "Components", ["Actions", "Forms", "Feedback", "Layout"]],
      },
    },
  },
};

export default preview;
