import { defineConfig } from "vitest/config";

// Eigene Test-Konfiguration (getrennt von vite.config.ts, das die Tauri-Dev-Server-
// Optionen trägt).
//
// Coverage misst das GESAMTE Projekt (Ziel: 90% global) — vorher waren UI und
// SQLite-Adapter ausgenommen, was die Zahl schmeichelhaft aber unvollständig machte.
// Ausgenommen bleiben nur Dinge ohne eigene Logik: Testdateien, das Test-Werkzeug,
// Typdeklarationen, der Barrel-Export des Kerns und der Einstiegspunkt main.tsx.
//
// UI-Tests laufen unter jsdom; die Umgebung wird pro Datei über den Docblock
// `@vitest-environment jsdom` gesetzt, damit die Kern- und Use-Case-Tests weiterhin in
// der schnellen Node-Umgebung bleiben.
export default defineConfig({
  test: {
    setupFiles: ["./src/testwerkzeug/setup.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "src/testwerkzeug/**",
        "src/core/index.ts",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
      reporter: ["text", "html"],
    },
  },
});
