import React from "react";
import ReactDOM from "react-dom/client";
import { Fehlergrenze } from "./adapters/ui/bausteine/Fehlergrenze";
import { Meldungen } from "./adapters/ui/bausteine/Meldungen";
import App from "./App";
import "./i18n/i18n"; // i18next initialisieren (Seiteneffekt), bevor Komponenten rendern
import "./styles/tokens.css";
import "./styles/app.css";

/**
 * In der Entwicklung OHNE Tauri-Shell (`npm run vorschau`, im Browser oder auf dem
 * Handy) tritt eine Attrappe an die Stelle der Tauri-Naht.
 *
 * Ohne sie scheitert der allererste Aufruf (`zugang_stand`), die App bleibt im Zustand
 * „laedt" und rendert `null` — eine weisse Seite ohne Meldung. Was die Vorschau leistet
 * und was nicht, steht in `testwerkzeug/browservorschau.ts`.
 *
 * Der Import ist DYNAMISCH und unter `import.meta.env.DEV` gekapselt: so landet weder
 * sql.js noch der Spielstand im ausgelieferten Bundle.
 */
async function start(): Promise<void> {
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in globalThis)) {
    const { vorschauEinrichten } = await import("./testwerkzeug/browservorschau");
    await vorschauEinrichten();
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      {/* Die äussere Grenze: für alles, was VOR den Screens schiefgeht (Sperrbildschirm,
          Rahmen, der erste Aufruf an Rust). Die innere steht in App.tsx um den Inhalt. */}
      <Fehlergrenze>
        {/* Die Meldungen für alles, was ausserhalb des Zeichnens scheitert — die Grenze
            selbst sieht davon nichts (siehe bausteine/Meldungen.tsx). */}
        <Meldungen>
          <App />
        </Meldungen>
      </Fehlergrenze>
    </React.StrictMode>,
  );
}

void start();
