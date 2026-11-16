// Einordnung — was eine Buchung kaufmännisch IST. Eine Antwort für die ganze App.
//
// Bis 2026-11-15 beantwortete das jede Sicht selbst: die Monatskarte über Betragsnähe zu
// einem Plan-Posten, die Budgetliste über Kategorie und Vertragszuordnung, die Analyse
// über den Charakter. Dieselbe Buchung zählte deshalb an drei Stellen als drei
// verschiedene Dinge, und keine der Stellen wusste von den anderen.
//
// Hier steht die Frage EINMAL. Wer auswertet — Ergebnis, Budgets, Analyse, der
// Kontoauszug —, fragt hier und sortiert nicht selbst. Die Begriffe dazu stehen in
// `core/CLAUDE.md` unter „Auszahlung und Kosten".
//
// Eingeordnet wird der ANTEIL, nicht die Buchung: eine geteilte Buchung kann zur Hälfte
// laufende Kosten sein und zur anderen aus einer Rücklage kommen.
//
// Die Reihenfolge der Fragen ist die Regel, und sie ist dieselbe, die `budgetBuchungen`
// für den Verbrauch eines Budgets anlegt — sonst zeigte die Budgetliste einen Verbrauch,
// den die Ergebnisrechnung woanders verbucht:
//
//   1. Zwei Beine (`transferId`)  → Umbuchung; führt sie auf ein Vorsorgekonto, Vorsorge.
//   2. Umschichtung ohne Gegenbein → Vorsorge. Das Geld verlässt die erfassten Konten,
//      bleibt aber Vermögen (der Wertpapierkauf, die Tilgung).
//   3. Ertrag                      → Einnahme.
//   4. Aufwand mit Vertrag         → Fixkosten.
//   5. Alles Weitere beantwortet die Zuständigkeit (`ruecklagen/zustaendigkeit.ts`), je
//      Anteil, in dieser Reihenfolge (Teil B des Entwurfs zu ADR-0006, Abschnitt 2):
//        a. eine ausdrückliche Zuordnung zu einer Rücklage → Entnahme aus ihr;
//        b. nicht budgetrelevant → Entnahme, WENN für die Buchung vor der Umstellung
//           eine Rücklage ausgebucht wurde; sonst ungeplant;
//        c. der nächste Vorfahr der Kategorie mit einem Träger: ein monatliches Budget
//           (laufende Kosten) oder EINE Rücklage, deren Fundfenster den
//           Tag enthält (Entnahme), MEHRERE solche Rücklagen (ungeplant, bis jemand
//           zuordnet — `wartetAuf`);
//        d. sonst ungeplant.
//
// **Eine Art `ruecklage` für beide Formen** (seit Paket 3). Bis dahin hiess die Entnahme
// aus einem aufbauenden Budget `topf` und die aus einer Rücklage von Hand `ruecklage`;
// für den Nutzer ist es dieselbe Sache, und die Ergebnisrechnung rechnet sie inzwischen
// nach denselben Bausteinen. Woher sie kommt, sagt `ruecklageId` — seit Migration 81 auch
// für das frühere aufbauende Budget, das jetzt selbst eine Rücklage ist.
//
// **Schritt b fragt nach der AUSBUCHUNG, nicht nach `budgetrelevant` allein.** Das Feld
// sagt „zählt in kein Budget" und wird beim Ausbuchen gesetzt — aber auch von Hand.
// Zunächst galt es allein als „aus Erspartem bezahlt"; damit kostete eine von Hand
// markierte Ausgabe nie etwas, obwohl niemand dafür zurückgelegt hatte.
//
// **Die Kategorie einer Rücklage von Hand findet erst ab `findetAb`.** Davor gilt bei der
// Einordnung, was ohne sie gälte — das Budget darüber oder „ungeplant" —, und deshalb
// trägt kein Monat vor der Umstellung eine andere Zahl.
//
// Keine Migration, kein neues Feld: die Einordnung ist ABGELEITET. Ein gespeicherter Wert
// könnte der Kategorie, dem Vertrag oder dem Budget widersprechen, aus denen er folgt. Die
// ausdrückliche Zuordnung ist keiner: sie ist eine Entscheidung des Nutzers, die nur dort
// gebraucht wird, wo die Kategorie allein nicht entscheidet.

import type { Cent } from "./basis/geld";
import { kategorieAnteile, type IstBuchung } from "./buchung/istbuchung";
import type { Budget } from "./budgets/budget";
import type { Kategorie } from "./kategorien/kategorie";
import type { Ruecklage, Ruecklagenzyklus } from "./ruecklagen/ruecklage";
import type { Ruecklagenzuordnung } from "./ruecklagen/zuordnung";
import { zustaendigkeit } from "./zustaendigkeit";

export type Einordnungsart =
  | "einnahme"
  | "fixkosten"
  | "laufend"
  | "ruecklage"
  | "vorsorge"
  | "umbuchung"
  | "ungeplant";

/** Ein eingeordneter Anteil einer Buchung. */
export interface Einordnung {
  readonly buchung: IstBuchung;
  /** Index des Anteils in der Buchung — mit `buchung.id` zusammen der Schlüssel. */
  readonly anteil: number;
  readonly kategorieId?: string;
  /** Vorzeichenbehaftet wie die Buchung (Abfluss negativ). */
  readonly betrag: Cent;
  readonly art: Einordnungsart;
  /** Bei `laufend`: das monatliche Budget. */
  readonly budgetId?: string;
  /**
   * Bei `ruecklage`: die Rücklage, die den Anteil trägt. Fehlt bei einer Entnahme über
   * eine alte Ausbuchung — die rechnet nach der alten Regel (`ausgebucht`).
   */
  readonly ruecklageId?: string;
  /** Bei `ruecklage` über eine alte Ausbuchung: die Rücklagen, deren Ausbuchung sie nennt. */
  readonly ausgebucht?: readonly string[];
  /**
   * Bei `ungeplant`: die Rücklagen, zwischen denen zu wählen ist — mehrere hängen an der
   * Kategorie, und keine Zuordnung sagt, welche es war. Bis dahin kostet der Anteil seinen
   * Monat wie jede ungeplante Ausgabe.
   */
  readonly wartetAuf?: readonly string[];
  /** Der Vertrag der Buchung, falls zugeordnet — bei jeder Art, nicht nur Fixkosten. */
  readonly vertragId?: string;
  /**
   * Hat die Buchung ein Gegenbein auf einem erfassten Konto? Dann ändert sie die Summe
   * aller Kontostände nicht. Bei `umbuchung` immer, bei `vorsorge` nur, wenn das Geld
   * auf ein eigenes Vorsorgekonto ging.
   */
  readonly intern: boolean;
}

export interface Einordnungskontext {
  readonly kategorien: readonly Kategorie[];
  /** Die Budgets — seit Migration 81 nur noch monatliche. */
  readonly budgets: readonly Budget[];
  /**
   * Buchungs-ID → Vertrags-ID, nur für zugeordnete Buchungen. Pflichtfeld aus demselben
   * Grund wie `vertragsBuchungen` in der `Zustaendigkeitssicht`: eine leere Abbildung ist eine
   * Aussage und muss hingeschrieben werden.
   */
  readonly vertragJeBuchung: ReadonlyMap<string, string>;
  /** Die Konten, die der Vorsorge dienen (`istVorsorgekonto`). */
  readonly vorsorgeKonten: ReadonlySet<string>;
  /**
   * ALLE Rücklagen, beendete eingeschlossen: eine beendete trägt ihre Kategorie bis zu
   * ihrem Ende. Pflicht — fehlten sie, fände keine Rücklage je eine Ausgabe, und niemand
   * sähe es.
   */
  readonly ruecklagen: readonly Ruecklage[];
  /** Die ausdrücklichen Zuordnungen (`ruecklage_zuordnung`). */
  readonly ruecklagenzuordnungen: readonly Ruecklagenzuordnung[];
  /**
   * Die Ausbuchungen. Nur die mit einer verknüpften Buchung zählen hier: sie machen
   * einen nicht budgetrelevanten Kauf zur Entnahme. `budgetrelevant === false` allein
   * genügt seit 2026-11-15 nicht mehr — wer es von Hand setzt, ohne dass eine Rücklage
   * dahintersteht, hat damit nichts angespart.
   */
  readonly ausbuchungen: readonly Ruecklagenzyklus[];
}

/**
 * Baut die Einordnung für einen Bestand. Zurück kommt eine Funktion, weil die
 * Vorarbeit (wer trägt welche Kategorie) einmal anfällt und nicht je Buchung.
 */
export function einordner(kontext: Einordnungskontext): (b: IstBuchung) => Einordnung[] {
  const traeger = zustaendigkeit(
    kontext.kategorien,
    kontext.budgets,
    kontext.ruecklagen,
    kontext.ruecklagenzuordnungen,
    kontext.ausbuchungen,
  );

  return (b) => {
    const vertragId = kontext.vertragJeBuchung.get(b.id);
    const intern = b.transferId != null;
    const alsGanzes = (art: Einordnungsart, i = intern): Einordnung[] =>
      kategorieAnteile(b).map((a, anteil) => ({
        buchung: b,
        anteil,
        kategorieId: a.kategorieId,
        betrag: a.betrag,
        art,
        vertragId,
        intern: i,
      }));

    if (intern) {
      const aufVorsorge =
        !!b.gegenkontoId &&
        kontext.vorsorgeKonten.has(b.gegenkontoId) &&
        !kontext.vorsorgeKonten.has(b.kontoId);
      return alsGanzes(aufVorsorge ? "vorsorge" : "umbuchung");
    }
    if (b.charakter === "Umschichtung") return alsGanzes("vorsorge");
    if (b.charakter === "Ertrag") return alsGanzes("einnahme");
    if (vertragId) return alsGanzes("fixkosten");

    return kategorieAnteile(b).map((a, anteil): Einordnung => {
      const basis = { buchung: b, anteil, kategorieId: a.kategorieId, betrag: a.betrag, vertragId, intern: false };
      const z = traeger({ istbuchungId: b.id, kategorieId: a.kategorieId, datum: b.datum, budgetrelevant: b.budgetrelevant });
      switch (z.art) {
        case "laufend":
          return { ...basis, art: "laufend", budgetId: z.budgetId };
        case "ruecklage":
          return { ...basis, art: "ruecklage", ruecklageId: z.ruecklageId };
        case "ausgebucht":
          return { ...basis, art: "ruecklage", ausgebucht: z.ruecklageIds };
        case "wartet":
          return { ...basis, art: "ungeplant", wartetAuf: z.kandidaten };
        case "ungeplant":
          return { ...basis, art: "ungeplant" };
      }
    });
  };
}

/** Alle Anteile eines Bestands, eingeordnet. */
export function einordnen(
  buchungen: readonly IstBuchung[],
  kontext: Einordnungskontext,
): Einordnung[] {
  return buchungen.flatMap(einordner(kontext));
}
