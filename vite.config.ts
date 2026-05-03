import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` matches the GitHub Pages URL path: https://<user>.github.io/colonna/
export default defineConfig({
  plugins: [react()],
  base: "/colonna/",
  build: { outDir: "dist" },
});
