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

/**
 * Was das Abzeichen neben der Version zeigt: bei einer Vorabversion den KANAL, sonst das
 * Stadium. Seit es den Beta-Kanal gibt (0.29.3), trägt eine Beta ihr Suffix doch im
 * Versionsstring (`0.30.0-beta.2`), und daneben „Alpha" las sich wie ein Widerspruch —
 * zwei Reifegrade für dieselbe Fassung. Stimmen tun beide: das Stadium sagt, dass Schema
 * und Daten noch nicht festgeschrieben sind, der Kanal, dass diese Fassung noch nicht für
 * alle ist. Wer eine Beta laufen hat, für den ist das Zweite die dringendere Auskunft; das
 * Erste gilt ohnehin, solange `APP_STADIUM` dasteht.
 *
 * Nur `beta` wird übersetzt, weil es nur diesen Kanal gibt. Ein anderes Suffix (`rc.1`)
 * fällt aufs Stadium zurück, statt ein Abzeichen aus einem Wort zu raten.
 */
export function abzeichenFuer(version: string, stadium: string): string {
  return /^\d+\.\d+\.\d+-beta(\.|$)/.test(version) ? "Beta" : stadium;
}

export const APP_ABZEICHEN = abzeichenFuer(APP_VERSION, APP_STADIUM);
