import type { StorybookConfig } from "@storybook/nextjs-vite";
import tailwindcss from "@tailwindcss/vite";

/** Component docs for the reusable UI pieces (pnpm storybook). */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  async viteFinal(viteConfig) {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    viteConfig.build ??= {};
    // The Storybook runtime contains an indivisible ~812 kB module. Application
    // and vendor modules are split below; allow that documentation runtime.
    viteConfig.build.chunkSizeWarningLimit = 900;
    viteConfig.build.rolldownOptions ??= {};
    const options = viteConfig.build.rolldownOptions;
    // Timing diagnostics are profiling output, not build correctness checks.
    options.checks = { ...options.checks, bundlerTimings: false };
    const previousOnLog = options.onLog;
    options.onLog = (level, log, handler) => {
      // Storybook renders everything in the browser; RSC boundaries have no
      // meaning here. Keep warnings about any other directive or problem.
      if (log.code === "MODULE_LEVEL_DIRECTIVE" && log.message.includes('"use client"')) return;
      if (previousOnLog) previousOnLog(level, log, handler);
      else handler(level, log);
    };
    options.output = {
      ...options.output,
      codeSplitting: {
        groups: [
          { name: "storybook", test: /[\\/]node_modules[\\/](?:@storybook|storybook)[\\/]/, maxSize: 400_000 },
          { name: "react", test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/ },
          { name: "vendor", test: /[\\/]node_modules[\\/]/, maxSize: 400_000 },
        ],
      },
    };
    return viteConfig;
  },
};

export default config;
