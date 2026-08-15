import { defineConfig } from "vitest/config";

// Eigene Test-Konfiguration (getrennt von vite.config.ts, das die Tauri-Dev-Server-
// Optionen trägt). Coverage bewusst auf die getesteten Schichten fokussiert — Kern,
// Use-Cases und die Migrationskette —, damit die Zahlen aussagekräftig bleiben und
// die noch ungetesteten Ränder (UI, SQLite-Adapter) sie nicht verwässern.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.ts",
        "src/core/index.ts",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
      reporter: ["text", "html"],
    },
  },
});
