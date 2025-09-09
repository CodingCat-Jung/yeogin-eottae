// app.config.ts
import { defineConfig } from "@tanstack/react-start/config";
import tsConfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "unenv";
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
    },
    preset: "cloudflare-pages",
    unenv: cloudflare
  }
});
export {
  app_config_default as default
};
