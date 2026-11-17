// Einzige Quelle der App-Version für das Frontend: package.json. Auch tauri.conf.json
// liest die Version von dort (eine Quelle, an einer Stelle bumpen).
import pkg from "../package.json";

export const APP_VERSION: string = pkg.version;

/**
 * Ob eine Version eine Vorabversion ist: Suffix `-pre`, mit oder ohne Nummer
 * (`0.31.0-pre.1`). Dann steht neben der Version das Abzeichen „Vorab" — sonst nichts.
 *
 * **Ein Stadium gibt es nicht mehr** (bis 0.30.0 „Alpha", als `APP_STADIUM`). Dass die
 * App noch nicht stabil ist, sagt die 0 vorne in der Version, nach SemVer genau dafür da;
 * ein Wort daneben wiederholte das nur — und warb, sobald es „Beta" hiess, mit demselben
 * Wort wie die Vorabversionen, die bis dahin `-beta.N` hiessen. Was am Stadium wirklich
 * hing, die Regel für Migrationen, steht in der `CLAUDE.md` des Projekts unter „Stadium".
 *
 * Ein anderes Suffix (`rc.1`, ein altes `beta.2`) ist keine Vorabversion im Sinne des
 * Kanals: es bekommt kein Abzeichen, statt eines aus einem Wort zu raten.
 */
export function istVorabversion(version: string): boolean {
  return /^\d+\.\d+\.\d+-pre(\.|$)/.test(version);
}

export const APP_IST_VORAB = istVorabversion(APP_VERSION);
