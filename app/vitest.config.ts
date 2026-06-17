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
      include: [
        "src/core/**/*.ts",
        "src/application/**/*.ts",
        "src/adapters/persistence/migrations.ts",
      ],
      exclude: ["**/*.test.ts", "src/core/index.ts"],
      reporter: ["text", "html"],
    },
  },
});
