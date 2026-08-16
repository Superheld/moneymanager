// Einzige Quelle der App-Version für das Frontend: package.json. Auch tauri.conf.json
// liest die Version von dort (eine Quelle, an einer Stelle bumpen).
import pkg from "../package.json";

export const APP_VERSION: string = pkg.version;

/**
 * Entwicklungsstadium. Steht sichtbar in der Seitenleiste, damit beim Draufschauen klar
 * ist, woran man ist: die App ist NICHT veröffentlicht, und das Datenschema darf sich
 * noch ohne Rücksicht ändern (siehe CLAUDE.md → „Stadium").
 *
 * Bewusst NICHT im Versionsstring (`0.11.0-alpha`): tauri.conf.json liest die Version von
 * hier weiter an die Bundle-Metadaten, und ein Suffix dort ist eine eigene Entscheidung
 * mit Folgen für Signierung und Updater. Das Stadium ist eine Anzeige, keine Versionsangabe.
 *
 * Und bewusst NICHT über t(): „Alpha" ist in beiden Sprachen dasselbe Wort und gehört zur
 * Versionsangabe, nicht zur Prosa — ein Übersetzungsschlüssel dafür wäre eine Stelle mehr,
 * an der die Anzeige vom Konstanten-Wert abdriften kann.
 */
export const APP_STADIUM = "Alpha";
