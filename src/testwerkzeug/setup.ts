// Globales Test-Setup für die UI-Tests: jest-dom-Matcher (toBeInTheDocument etc.) und
// Aufräumen nach jedem Test. Nur für Dateien mit jsdom-Umgebung relevant.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom kennt kein Layout und deshalb auch kein `scrollIntoView` — die Methode fehlt am
// Element ganz, statt nichts zu tun. Jede Komponente, die eine markierte Zeile ins Bild
// holt (Kategorie-Picker), stirbt daran im Test, obwohl sie im Browser richtig ist. Die
// Attrappe hier ist die ehrliche Antwort: „gescrollt wird nicht, weil es nichts zu
// scrollen gibt" — nicht ein Fallschirm im Produktivcode, der die Frage offen liesse, ob
// die Methode wirklich existiert.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
