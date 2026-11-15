// Welche Wörter ein Budget in der Oberfläche trägt — nach seiner Art.
//
// Seit 2026-11-15 steht ein aufbauendes Budget im Bereich Rücklagen und heisst dort
// „Rücklage" (Regel: eine Sache heisst überall wie ihr Bereich). Tabelle, Dialog und
// Verlauf sind für beide Arten dieselben Bausteine; nur die Sätze, in denen das Wort
// „Budget" steht oder die nur für eine Art stimmen, kommen für das aufbauende aus
// `ruecklagen.kategorie.*`.
//
// Ausdrücklich aufgezählt statt per `i18n.exists` gesucht: ein Schlüssel, der unter
// `ruecklagen.kategorie` fehlt, fiele sonst still auf den Budget-Text zurück, und das
// Wort stünde wieder da, ohne dass ein Test es merkt. So meldet der i18n-Test die Lücke.

import type { Budgetart } from "../../../application";

const ALS_RUECKLAGE: ReadonlySet<string> = new Set([
  "anlegen",
  "modalBearbeiten",
  "modalUntertitel",
  "feldKontoHinweis",
  "loeschenFolgen",
  "verlaufVorStart",
  "verlaufMonatLeer",
  "legendeOhnePlan",
  "verlaufOhnePlan",
  "verlaufOhnePlanZurueck",
  "verlaufOhnePlanKurz",
  "verlaufOhnePlanKurzZurueck",
]);

/** Der i18n-Schlüssel für `schluessel` (relativ zu `budgets.`) bei einem Budget der Art `art`. */
export function budgetText(art: Budgetart, schluessel: string): string {
  return art === "aufbauend" && ALS_RUECKLAGE.has(schluessel)
    ? `ruecklagen.kategorie.${schluessel}`
    : `budgets.${schluessel}`;
}

/** Für den i18n-Test: jeder Schlüssel, der für das aufbauende umgeleitet wird. */
export const BUDGETTEXTE_ALS_RUECKLAGE: readonly string[] = [...ALS_RUECKLAGE];
