import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite + React setup. Static JSON served from public/data/ is
// available at /data/... with no extra configuration.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
