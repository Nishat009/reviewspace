import type React from "react";
import type { Preview } from "@storybook/nextjs-vite";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: { layout: "centered", controls: { expanded: true } },
  decorators: [
    (Story) => (
      <TooltipProvider>
        {/* The app loads Geist through next/font; stories use the system stack. */}
        <div className="font-sans antialiased" style={{ "--font-sans": "ui-sans-serif, system-ui, sans-serif" } as React.CSSProperties}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default preview;
