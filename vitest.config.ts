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
    // Worktrees unter `.claude/` sind KOPIEN des Projekts mit eigenem Stand. Ohne diesen
    // Ausschluss laufen ihre Tests mit, verdoppeln die Zahlen und melden Fehler aus einem
    // fremden Branch als eigene — eine Messung, die schlimmer ist als keine. Die
    // Vorgabe-Ausschlüsse (node_modules, dist) gehen dabei verloren, deshalb stehen sie
    // hier wieder mit.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/worktrees/**"],
    coverage: {
      provider: "v8",
      all: true,
      // AUCH `.js` und `.jsx`. Bis 2026-11-10 lagen die Bausteine aus der
      // Design-System-Vorlage als `.jsx` da, und diese Zeile nannte nur `.ts` und `.tsx`:
      // der meistbenutzte Code der Oberfläche fehlte in der Messung. Heute ist dort alles
      // TypeScript; die Zeile bleibt, damit ein neues `.js` nicht wieder unbemerkt
      // herausfällt.
      include: ["src/**/*.{ts,tsx,js,jsx}"],
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
      // **Eine Sperrklinke, kein Ziel.** Das Ziel bleibt 90 % — es stand jahrelang nur im
      // Kommentar oben, und eine Zahl, die niemand prüft, sinkt. Die Werte hier sind der
      // gemessene Stand, abgerundet: der Lauf wird rot, wenn die Abdeckung FÄLLT. Wer sie
      // hebt, zieht die Schwelle nach; gesenkt wird sie nur mit einem Grund, der hier
      // dabeisteht. Seit 2026-11-10 erreichen die ZEILEN das Ziel; das grösste Loch ist
      // inzwischen die Oberfläche selbst (Wege über den Bankabruf), danach `adapters/fints`
      // und `src/vendor/` — beides Netzwege, die eine Attrappe des Abrufadapters braucht
      // (Vorlage: `konten/bankzugangPruefen.test.tsx`).
      thresholds: {
        statements: 88,
        branches: 81,
        functions: 85,
        lines: 90,
      },
    },
  },
});
