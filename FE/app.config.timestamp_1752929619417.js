// app.config.ts
import { defineConfig } from "@tanstack/start";
import tsConfigPaths from "vite-tsconfig-paths";
var app_config_default = defineConfig({
  vite: {
    plugins: [
      tsConfigPaths({
        projects: ["./tsconfig.json"]
      })
    ]
  },
  server: {
    prerender: {
      routes: ["/"],
      crawlLinks: true
    }
  }
});
export {
  app_config_default as default
};
