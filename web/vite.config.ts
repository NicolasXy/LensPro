import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em desenvolvimento (npm run dev), o Vite serve o front em :5173 e repassa /api para o servidor em :3000.
// Em producao o proprio servidor (server/) entrega web/dist: um unico processo, sem CORS.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
  build: { outDir: "dist", sourcemap: false },
});
