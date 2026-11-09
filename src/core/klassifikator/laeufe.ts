// Trainingsläufe — was ein Lauf war und was sich zwischen zwei Läufen geändert hat.
//
// Bis 2026-11-09 gab es genau ein Modell und genau eine Messung: die vom letzten Klick.
// Wer zwei Varianten der Wortauswahl vergleichen wollte, musste sich die erste Zahl
// merken. Und selbst mit beiden Zahlen nebeneinander blieb verborgen, was man eigentlich
// wissen will: eine Trefferquote, die gleich bleibt, kann zehn Zeilen gewonnen und zehn
// verloren haben. Professionell heisst das „experiment tracking" — jeder Lauf hält fest,
// womit er trainiert wurde und was herauskam, und zwei Läufe lassen sich Zeile für Zeile
// vergleichen.
//
// Rein: der Kern vergleicht, gespeichert wird in der Anwendungsschicht.

import type { Merkmalsausschluss, Merkmalsherkunft } from "./merkmale";
import type { Vorhersage } from "./modell";

/** Was gemessen wurde — dieselben Zahlen, die die Oberfläche nach dem Training zeigt. */
export interface Laufkennzahlen {
  readonly genauigkeit: number;
  readonly grundlinie?: number;
  readonly empfaenger?: number;
  readonly macroF1?: number;
  readonly ece?: number;
  readonly pruefAnzahl: number;
  readonly pruefmenge: "handverlesen" | "alle";
  readonly stichtag?: string;
}

export interface Trainingslauf {
  readonly id: string;
  /** ISO-Zeitpunkt. */
  readonly zeitpunkt: string;
  /** Beispiele im endgültigen Modell. */
  readonly beispiele: number;
  /** Womit trainiert wurde — die Grundlage des Konfigurationsvergleichs. */
  readonly konfiguration: {
    readonly herkuenfte: readonly Merkmalsherkunft[];
    readonly ausschluesse: readonly Merkmalsausschluss[];
  };
  /** Fehlt, wenn zu wenig Material für eine Messung da war. */
  readonly kennzahlen?: Laufkennzahlen;
  /** Je Prüfzeile die Vorhersage — ohne Sicherheit, die braucht der Vergleich nicht. */
  readonly vorhersagen: readonly Pick<Vorhersage, "id" | "tatsaechlich" | "vorhergesagt">[];
}

/** Eine Zeile, die zwischen zwei Läufen von richtig auf falsch ging oder umgekehrt. */
export interface GekippteZeile {
  readonly id: string;
  readonly tatsaechlich: string;
  readonly vorher: string;
  readonly nachher: string;
  /** true: nachher richtig, vorher falsch. */
  readonly gewonnen: boolean;
}

export interface Laufvergleich {
  /** Prüfzeilen, die in BEIDEN Läufen geprüft wurden — nur an ihnen wird verglichen. */
  readonly gemeinsam: number;
  readonly gewonnen: number;
  readonly verloren: number;
  /** Gewonnene zuerst, dann verlorene; innerhalb in der Reihenfolge des neuen Laufs. */
  readonly gekippt: readonly GekippteZeile[];
  readonly herkuenfteDazu: readonly Merkmalsherkunft[];
  readonly herkuenfteWeg: readonly Merkmalsherkunft[];
  /** Wörter, die neu ausgeschlossen bzw. wieder zugelassen wurden (Listenform). */
  readonly ausgeschlossenDazu: readonly string[];
  readonly ausgeschlossenWeg: readonly string[];
}

/** Ein Ausschluss als vergleichbarer Schlüssel — Wort samt Einschränkung auf Herkünfte. */
function schluessel(a: Merkmalsausschluss): string {
  const h = a.herkuenfte?.length ? ` (${[...a.herkuenfte].sort().join(", ")})` : "";
  return `${a.wort}${h}`;
}

/**
 * Vergleicht zwei Läufe: welche Prüfzeilen gekippt sind und was an der Konfiguration
 * anders war.
 *
 * **Verglichen wird nur an Zeilen, die beide Läufe geprüft haben.** Die Prüfmenge sind
 * die jüngsten Buchungen; kommt zwischen zwei Läufen ein Import dazu, rutscht das Fenster
 * weiter. Zeilen, die nur einer der beiden kennt, sagen über den Unterschied der Modelle
 * nichts — `gemeinsam` steht deshalb dabei, damit man sieht, worauf sich die Zahl stützt.
 */
export function laeufeVergleichen(alt: Trainingslauf, neu: Trainingslauf): Laufvergleich {
  const vorher = new Map(alt.vorhersagen.filter((v) => v.id).map((v) => [v.id!, v]));
  const gekippt: GekippteZeile[] = [];
  let gemeinsam = 0;
  for (const n of neu.vorhersagen) {
    if (!n.id) continue;
    const v = vorher.get(n.id);
    if (!v) continue;
    gemeinsam++;
    const warRichtig = v.vorhergesagt === v.tatsaechlich;
    const istRichtig = n.vorhergesagt === n.tatsaechlich;
    if (warRichtig === istRichtig) continue;
    gekippt.push({ id: n.id, tatsaechlich: n.tatsaechlich, vorher: v.vorhergesagt, nachher: n.vorhergesagt, gewonnen: istRichtig });
  }
  gekippt.sort((a, b) => Number(b.gewonnen) - Number(a.gewonnen));

  const hAlt = new Set(alt.konfiguration.herkuenfte);
  const hNeu = new Set(neu.konfiguration.herkuenfte);
  const aAlt = new Set(alt.konfiguration.ausschluesse.map(schluessel));
  const aNeu = new Set(neu.konfiguration.ausschluesse.map(schluessel));

  return {
    gemeinsam,
    gewonnen: gekippt.filter((g) => g.gewonnen).length,
    verloren: gekippt.filter((g) => !g.gewonnen).length,
    gekippt,
    herkuenfteDazu: [...hNeu].filter((h) => !hAlt.has(h)),
    herkuenfteWeg: [...hAlt].filter((h) => !hNeu.has(h)),
    ausgeschlossenDazu: [...aNeu].filter((a) => !aAlt.has(a)).sort(),
    ausgeschlossenWeg: [...aAlt].filter((a) => !aNeu.has(a)).sort(),
  };
}
