// Trainingsmaterial — was vom gebuchten Bestand als Lernbeispiel taugt, und was nicht.
//
// Die Frage steht VOR dem Modell, nicht daneben: ein Klassifikator, der auf 4426 Zeilen
// trainiert, von denen 300 gar keine Kategorie tragen und 40 aufgeteilt sind, lernt
// stillschweigend etwas anderes, als man glaubt. Deshalb wird hier gezählt und begründet,
// bevor irgendwo gerechnet wird — und dasselbe Ergebnis speist die Anzeige in den
// Einstellungen.
//
// Reine Anwendungsschicht: lädt über die Ports, rechnet mit dem Kern
// (`core/klassifikator/merkmale`), entscheidet nichts über Modelle.

import { merkmalsbefund, namensraum, type Verwurfsgrund, type Zahlungsspur } from "../core";
import type { LedgerPort, UmsatzRepository } from "./ports";
import { zahlungsspuren } from "./zahlungsspuren";

/** Ein fertiges Lernbeispiel: Tokens plus die Kategorie, die dabei herauskommen soll. */
export interface Lernbeispiel {
  readonly istbuchungId: string;
  readonly merkmale: readonly string[];
  readonly kategorieId: string;
}

/** Warum eine Buchung nicht als Beispiel taugt. */
export type Ausschlussgrund =
  /** Keine Kategorie — es gibt nichts zu lernen, das ist ja gerade die offene Frage. */
  | "ohneKategorie"
  /** Aufgeteilt: mehrere Kategorien auf einer Zeile, kein eindeutiges Label. */
  | "geteilt"
  /** Umschichtung — eigenes Geld, das das Konto wechselt. Trägt fachlich keine Kategorie. */
  | "umschichtung"
  /** Weder Empfänger noch Verwendungszweck noch Gläubiger-ID: der Vektor wäre leer. */
  | "ohneText";

export interface Materialbefund {
  /** Alle gebuchten Zahlungen, die betrachtet wurden. */
  readonly gesamt: number;
  /** Die brauchbaren Beispiele — die Grundlage jedes Trainings. */
  readonly beispiele: readonly Lernbeispiel[];
  /** Wie viele Buchungen aus welchem Grund draußen blieben. */
  readonly ausgeschlossen: Readonly<Record<Ausschlussgrund, number>>;
  /** Wie viele verschiedene Kategorien überhaupt belegt sind (die Klassen des Modells). */
  readonly kategorien: number;
  /**
   * Kategorien mit sehr wenigen Beispielen. Sie sind der häufigste Grund für eine
   * Klasse, die das Modell faktisch nie vorhersagt — sichtbar zu machen ist billiger,
   * als sich später über eine Kategorie zu wundern, die nie vorkommt.
   */
  readonly duenneKategorien: readonly { readonly kategorieId: string; readonly anzahl: number }[];
  readonly vokabular: Vokabularbefund;
}

export interface Vokabularbefund {
  /** Verschiedene Tokens insgesamt. */
  readonly groesse: number;
  /** Tokens je Namensraum (`emp`, `vwz`, `gid`, `vz`). */
  readonly jeNamensraum: Readonly<Record<string, number>>;
  /** Die häufigsten Tokens mit ihrer Belegzahl — was das Modell am stärksten sieht. */
  readonly haeufigste: readonly { readonly merkmal: string; readonly anzahl: number }[];
  /**
   * Tokens, die genau EINMAL vorkommen. Sie können nichts generalisieren und sind das
   * beste Maß dafür, ob die Filter zu lasch sind: steigt der Anteil, rutscht wieder
   * Referenznummern-Müll durch.
   */
  readonly einmalige: number;
  /** Wie viele Wörter die Filter verworfen haben, nach Grund. */
  readonly verworfen: Readonly<Record<Verwurfsgrund, number>>;
  /** Die häufigsten verworfenen Wörter — die Probe aufs Exempel für die Ausschlussliste. */
  readonly haeufigsteVerworfen: readonly { readonly wort: string; readonly grund: Verwurfsgrund; readonly anzahl: number }[];
}

/** Ab wie wenigen Beispielen eine Kategorie als dünn gilt. */
const DUENN_AB = 5;

/** Wie viele Spitzenreiter in den Listen erscheinen. */
const TOP_N = 25;

/**
 * Wertet den gebuchten Bestand als Trainingsmaterial aus. Reine Funktion über bereits
 * geladene Spuren — die Ladung steckt in `trainingsmaterial()`.
 */
export function materialBefund(spuren: readonly Zahlungsspur[]): Materialbefund {
  const beispiele: Lernbeispiel[] = [];
  const ausgeschlossen: Record<Ausschlussgrund, number> = {
    ohneKategorie: 0, geteilt: 0, umschichtung: 0, ohneText: 0,
  };
  const jeKategorie = new Map<string, number>();
  const tokenZaehler = new Map<string, number>();
  const verworfen: Record<Verwurfsgrund, number> = { zuKurz: 0, ziffern: 0, stoppwort: 0, platzhalter: 0 };
  const verworfenZaehler = new Map<string, { grund: Verwurfsgrund; anzahl: number }>();

  for (const s of spuren) {
    // Reihenfolge der Prüfungen = Reihenfolge der Aussagekraft. Eine geteilte Buchung
    // ohne Kategorie soll als „geteilt" gezählt werden, nicht als „ohne Kategorie" —
    // sonst liest sich die Anzeige, als fehlte dort nur ein Eintrag.
    if (s.geteilt) {
      ausgeschlossen.geteilt++;
      continue;
    }
    if (s.charakter === "Umschichtung") {
      ausgeschlossen.umschichtung++;
      continue;
    }
    if (!s.kategorieId) {
      ausgeschlossen.ohneKategorie++;
      continue;
    }

    const befund = merkmalsbefund({
      gegenpartei: s.gegenpartei,
      verwendungszweck: s.verwendungszweck ?? "",
      glaeubigerId: s.glaeubigerId,
      betrag: s.betrag,
    });

    // Ein Vektor, in dem nur das Vorzeichen steht, ist kein Beispiel — er behauptet,
    // „Abfluss" allein bestimme die Kategorie, und zieht das Modell zur häufigsten Klasse.
    const inhalt = befund.merkmale.filter((m) => namensraum(m) !== "vz");
    if (inhalt.length === 0) {
      ausgeschlossen.ohneText++;
      continue;
    }

    // Verwurf und Vokabular werden über DIESELBE Grundmenge gezählt: die Beispiele.
    // Verlockend wäre, den Verwurf über alle Zeilen laufen zu lassen — auch die noch
    // unkategorisierten, deren Text ja ebenfalls durch die Filter geht. Dann bezögen sich
    // „5321 Tokens im Vokabular" und „1284 Wörter verworfen" aber auf verschiedene Mengen
    // und ließen sich nicht mehr gegeneinander lesen. Genau dafür stehen die Zahlen da.
    for (const v of befund.verworfen) {
      verworfen[v.grund]++;
      const eintrag = verworfenZaehler.get(v.wort);
      if (eintrag) eintrag.anzahl++;
      else verworfenZaehler.set(v.wort, { grund: v.grund, anzahl: 1 });
    }

    beispiele.push({ istbuchungId: s.id, merkmale: befund.merkmale, kategorieId: s.kategorieId });
    jeKategorie.set(s.kategorieId, (jeKategorie.get(s.kategorieId) ?? 0) + 1);
    for (const m of befund.merkmale) tokenZaehler.set(m, (tokenZaehler.get(m) ?? 0) + 1);
  }

  const jeNamensraum: Record<string, number> = {};
  let einmalige = 0;
  for (const [merkmal, anzahl] of tokenZaehler) {
    const raum = namensraum(merkmal);
    jeNamensraum[raum] = (jeNamensraum[raum] ?? 0) + 1;
    if (anzahl === 1) einmalige++;
  }

  return {
    gesamt: spuren.length,
    beispiele,
    ausgeschlossen,
    kategorien: jeKategorie.size,
    duenneKategorien: [...jeKategorie]
      .filter(([, n]) => n < DUENN_AB)
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([kategorieId, anzahl]) => ({ kategorieId, anzahl })),
    vokabular: {
      groesse: tokenZaehler.size,
      jeNamensraum,
      haeufigste: bestenliste(tokenZaehler, TOP_N).map(([merkmal, anzahl]) => ({ merkmal, anzahl })),
      einmalige,
      verworfen,
      haeufigsteVerworfen: [...verworfenZaehler]
        .sort((a, b) => b[1].anzahl - a[1].anzahl || a[0].localeCompare(b[0]))
        .slice(0, TOP_N)
        .map(([wort, e]) => ({ wort, grund: e.grund, anzahl: e.anzahl })),
    },
  };
}

/** Die n häufigsten Einträge, bei Gleichstand alphabetisch — damit die Anzeige stabil ist. */
function bestenliste(zaehler: ReadonlyMap<string, number>, n: number): [string, number][] {
  return [...zaehler].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

/** Lädt den Bestand und wertet ihn aus. */
export async function trainingsmaterial(
  ledger: LedgerPort,
  umsatzRepo: UmsatzRepository,
): Promise<Materialbefund> {
  return materialBefund(await zahlungsspuren(ledger, umsatzRepo));
}
