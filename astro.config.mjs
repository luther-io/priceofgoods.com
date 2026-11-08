// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

import markdoc from "@astrojs/markdoc";

export default defineConfig({
  integrations: [react(), sitemap(), markdoc()],
  vite: {
    plugins: [tailwindcss()],
  },
  site: "https://www.priceofgoods.com",
  output: "static",
  compressHTML: true,
});
