// app.config.ts
import { defineStartConfig } from "@tanstack/start";
import tsConfigPaths from "vite-tsconfig-paths";
var app_config_default = defineStartConfig({
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
