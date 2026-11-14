// Einzige Quelle der App-Version für das Frontend: package.json. Auch tauri.conf.json
// liest die Version von dort (eine Quelle, an einer Stelle bumpen).
import pkg from "../package.json";

export const APP_VERSION: string = pkg.version;

/**
 * Entwicklungsstadium. Steht sichtbar in der Seitenleiste, damit beim Draufschauen klar
 * ist, woran man ist (siehe CLAUDE.md → „Stadium"). Seit 0.30.0 **Beta**: der Bestand ist
 * schützenswert, eine Migration überführt, statt wegzunehmen. Davor Alpha.
 *
 * Bewusst NICHT im Versionsstring (`0.11.0-alpha`): tauri.conf.json liest die Version von
 * hier weiter an die Bundle-Metadaten, und ein Suffix dort ist eine eigene Entscheidung
 * mit Folgen für Signierung und Updater. Das Stadium ist eine Anzeige, keine Versionsangabe.
 *
 * Und bewusst NICHT über t(): „Beta" ist in beiden Sprachen dasselbe Wort und gehört zur
 * Versionsangabe, nicht zur Prosa — ein Übersetzungsschlüssel dafür wäre eine Stelle mehr,
 * an der die Anzeige vom Konstanten-Wert abdriften kann.
 */
export const APP_STADIUM = "Beta";

/**
 * Ob eine Version eine Vorabversion ist: Suffix `-pre`, mit oder ohne Nummer
 * (`0.31.0-pre.1`). Bis 0.30.0 hiessen sie `-beta.N` — seit das STADIUM Beta heisst, wäre
 * derselbe Name für den Kanal zwei verschiedene Aussagen in einem Wort gewesen.
 *
 * Ein anderes Suffix (`rc.1`, ein altes `beta.2`) ist keine: es fällt aufs Stadium zurück,
 * statt ein Abzeichen aus einem Wort zu raten.
 */
export function istVorabversion(version: string): boolean {
  return /^\d+\.\d+\.\d+-pre(\.|$)/.test(version);
}

/**
 * Was das Abzeichen neben der Version zeigt: bei einer Vorabversion den KANAL, sonst das
 * Stadium. Stimmen tun beide — das Stadium sagt, wie weit die App ist, der Kanal, dass
 * diese Fassung noch nicht für alle ist; wer eine Vorabversion laufen hat, für den ist das
 * Zweite die dringendere Auskunft.
 *
 * Das Wort für den Kanal kommt herein, weil es — anders als das Stadium — übersetzt wird
 * („Vorab" / „Pre-release"); `version.ts` kennt die Übersetzung nicht.
 */
export function abzeichenFuer(version: string, stadium: string, vorab: string): string {
  return istVorabversion(version) ? vorab : stadium;
}
