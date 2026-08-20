// Budget — was pro Monat für eine Kategorie vorgesehen ist. Zwei Arten, EIN Aggregat:
//
//   • monatlich — der Rahmen setzt sich zum Ersten wieder auf den Monatsbetrag zurück.
//     Was im März übrig blieb, ist im April nicht mehr da. Der Normalfall für laufende
//     Ausgaben: Lebensmittel, Drogerie, Tanken.
//   • aufbauend — der Rahmen wächst Monat für Monat weiter und wird NIE zurückgesetzt.
//     Nicht Ausgegebenes bleibt liegen. Der Fall für alles, was sich sammelt, bis es
//     gebraucht wird: Urlaub, Reparaturen, das neue Rad.
//
// Mehr unterscheidet die Arten nicht. Kein Ziel, keine Frist, kein Schätzbetrag —
// eingegeben wird in beiden Fällen genau eine Zahl: der Betrag pro Monat.
//
// Vorgänger war ein Paar aus `Budget` (Rahmen je Periode monatlich/jährlich) und `Topf`
// (Puffer mit Schätzbetrag+Frist, Spartopf mit Zuführung+Sparziel, plus eigener
// Entnahme-Buchung über `Verwendung`). Drei Arten, vier Zielwert-Begriffe und zwei
// Tabellen für dieselbe Frage „was lege ich monatlich für X zurück?". Zusammengelegt
// 2026-08-19; die Töpfe waren zu dem Zeitpunkt leer (0 Zeilen, 0 Buchungen darauf).
//
// **Verträge zählen NICHT.** Ein Budget steuert Verhalten — „diesen Monat noch 120 € für
// Auswärtsessen". Eine Vertragsrate kann man nicht steuern; sie ist anderswo geplant und
// steht im Monatsausblick in ihrer eigenen Zeile. Zählte sie zusätzlich gegen das Budget,
// stünde dieselbe Zahlung zweimal in der Aufrechnung, und ein Rahmen, der (wie der
// Budgetvorschlag ihn errechnet) den Vertragsanteil schon abgezogen hat, würde gegen
// einen Verbrauch mitsamt Verträgen gemessen. Auf echten Daten: „Familie & Kinder",
// Rahmen 110 €, zeigte 425 € Verbrauch — die Kinderbetreuung, ein erfasster Vertrag.
//
// Welche Buchungen das sind, entscheidet der Kern NICHT selbst: die Verknüpfung
// Buchung↔Vertrag entsteht in `vertragszuordnung` (Anwendungsschicht) aus den
// Erkennungsmustern. Sie kommt deshalb als Pflichtfeld in der `BudgetSicht` herein —
// pflichtig, weil eine optionale Angabe genau an einer Aufrufstelle vergessen wird und
// dort still eine falsche Zahl erzeugt. Genau so ist dieser Fehler entstanden.
//
// **Verschachtelung.** Budgets dürfen ineinander liegen: „Freizeit" monatlich, darin
// „Urlaub" aufbauend. Dann gehört der Urlaub NICHT mehr zu Freizeit — weder sein Betrag
// noch sein Verbrauch. Sonst zählte dieselbe Ausgabe zweimal, und der Monatsbetrag der
// Hauptkategorie wäre die Summe aus sich selbst und seinen Teilen. Herausgerechnet wird
// automatisch und in BEIDE Richtungen (Betrag wie Verbrauch), damit die Zahlen zueinander
// passen: `budgetKategorien` ist die eine Stelle, die entscheidet, was zu wem zählt.

import type { Cent } from "../basis/geld";
import { kategorieAnteile, type IstBuchung } from "../buchung/istbuchung";
import { kategorieUnterbaum, type Kategorie } from "../kategorien/kategorie";
import { monateZwischen } from "../basis/datum";

export type Budgetart = "monatlich" | "aufbauend";

export interface Budget {
  readonly id: string;
  readonly kategorieId: string;
  /**
   * Konto, auf dem das Geld dieses Budgets liegt und über das seine Buchungen laufen.
   *
   * Pflicht: ein aufbauendes Budget ohne Konto ist eine Zahl ohne Deckung — man will
   * sehen können, ob die 3.400 € „angespart" auch wirklich irgendwo liegen. Der
   * VERBRAUCH wird bewusst NICHT auf dieses Konto eingeschränkt: dieselbe Kategorie
   * wird auch mal bar oder über die Kreditkarte bezahlt, und ein Budget, das solche
   * Buchungen still übersieht, zeigt zu viel Rest an.
   */
  readonly kontoId: string;
  /** Was pro Monat hineingeht, positiver Betrag in Cent (> 0). */
  readonly betragProMonat: Cent;
  readonly art: Budgetart;
  /**
   * Ab wann gerechnet wird (ISO). Kein Ziel und keine Frist — nur der Anker, ohne den
   * ein aufbauendes Budget nicht sagen kann, wie viele Monate es schon gesammelt hat.
   * Bei `monatlich` ohne Wirkung, das Feld bleibt trotzdem gesetzt (ein Feld, das mal
   * da ist und mal nicht, muss überall geprüft werden).
   */
  readonly start: string;
}

/**
 * Das Budget, in dem dieses hier liegt — der nächste Vorfahr der Kategorie, der selbst
 * ein Budget trägt. `undefined`, wenn es frei steht.
 *
 * „Nächster", nicht „irgendein": bei Konto → Freizeit → Urlaub mit Budgets auf allen
 * dreien gehört Urlaub zu Freizeit und nicht auch noch zu Konto, sonst würde er auf
 * zwei Ebenen gleichzeitig abgezogen.
 */
export function elternBudget(
  budget: Budget,
  alle: readonly Budget[],
  kategorien: readonly Kategorie[],
): Budget | undefined {
  const eltern = new Map(kategorien.map((k) => [k.id, k.elternId]));
  const budgetAn = new Map<string, Budget>();
  for (const b of alle) if (b.id !== budget.id) budgetAn.set(b.kategorieId, b);

  let aktuell = eltern.get(budget.kategorieId);
  // Der Zähler schützt gegen einen Zyklus im Baum (fachlich ausgeschlossen über
  // `wuerdeZyklusErzeugen`, aber hier läuft eine Schleife über fremde Daten).
  for (let i = 0; aktuell && i < 100; i++) {
    const treffer = budgetAn.get(aktuell);
    if (treffer) return treffer;
    aktuell = eltern.get(aktuell);
  }
  return undefined;
}

/** Die Budgets, die direkt in diesem hier liegen — ihre Beträge gehen von seinem ab. */
export function kindBudgets(
  budget: Budget,
  alle: readonly Budget[],
  kategorien: readonly Kategorie[],
): Budget[] {
  return alle.filter((b) => b.id !== budget.id && elternBudget(b, alle, kategorien)?.id === budget.id);
}

/**
 * Die Kategorien, die auf DIESES Budget zählen: sein Unterbaum, abzüglich der Unterbäume
 * der Budgets, die darin liegen.
 *
 * Die eine Stelle, an der „was gehört zu wem" entschieden wird — Betrag und Verbrauch
 * fragen beide hier, damit sie nicht auseinanderlaufen können.
 */
export function budgetKategorien(
  budget: Budget,
  alle: readonly Budget[],
  kategorien: readonly Kategorie[],
): Set<string> {
  const eigene = kategorieUnterbaum(kategorien, budget.kategorieId);
  for (const kind of kindBudgets(budget, alle, kategorien)) {
    for (const id of kategorieUnterbaum(kategorien, kind.kategorieId)) eigene.delete(id);
  }
  return eigene;
}

/**
 * Was pro Monat auf dieses Budget entfällt, nachdem die eingebetteten Budgets ihren
 * Teil bekommen haben.
 *
 * Kann NEGATIV werden, wenn die Unterbudgets zusammen mehr fordern als das Dach hergibt.
 * Bewusst nicht auf 0 geklemmt: das ist ein Widerspruch in der Planung, den man sehen
 * soll, und eine stille 0 sähe aus wie ein leeres Budget.
 */
export function effektiverMonatsbetrag(
  budget: Budget,
  alle: readonly Budget[],
  kategorien: readonly Kategorie[],
): Cent {
  return kindBudgets(budget, alle, kategorien).reduce((s, k) => s - k.betragProMonat, budget.betragProMonat);
}

/**
 * Geglätteter erwarteter Abfluss pro Monat (negativ) — was Planung und Monatsausblick
 * je Monat einrechnen. Für beide Arten derselbe Wert: auch ein aufbauendes Budget
 * kostet jeden Monat seine Rate, es gibt sie nur nicht am Monatsende zurück.
 */
export function geglaetteterMonatsabfluss(
  budget: Budget,
  alle: readonly Budget[],
  kategorien: readonly Kategorie[],
): Cent {
  return -effektiverMonatsbetrag(budget, alle, kategorien);
}

/**
 * Zeitfenster [von, bis) des Kalendermonats, in den `am` fällt. Reine String-Arithmetik
 * auf ISO-Daten, locale- und zeitzonenunabhängig.
 */
export function monatsFenster(am: string): { von: string; bis: string } {
  const [j, m] = am.split("-").map(Number);
  const von = `${j}-${String(m).padStart(2, "0")}-01`;
  const naechsterMonat = m === 12 ? 1 : m + 1;
  const jahr = m === 12 ? j + 1 : j;
  return { von, bis: `${jahr}-${String(naechsterMonat).padStart(2, "0")}-01` };
}

/**
 * Das Fenster, über das der Verbrauch eines Budgets zählt, wenn man auf den Monat von
 * `am` schaut:
 *   • monatlich — genau dieser Kalendermonat (Reset zum Ersten).
 *   • aufbauend — vom Start bis zum Ende dieses Monats (nie zurückgesetzt).
 */
export function verbrauchsFenster(budget: Budget, am: string): { von: string; bis: string } {
  const monat = monatsFenster(am);
  return budget.art === "monatlich" ? monat : { von: budget.start, bis: monat.bis };
}

/**
 * Was bis zum Monat von `am` insgesamt hineingegangen ist:
 *   • monatlich — der Monatsbetrag, jeden Monat neu.
 *   • aufbauend — der Monatsbetrag mal der Zahl der Monate seit Start (der laufende
 *     zählt mit; wer im Januar 50 € einplant, hat im Januar 50 € zur Verfügung).
 *
 * Vor dem Start ist der Rahmen 0 — ein Budget rückwirkend zu füllen wäre erfunden.
 */
export function budgetRahmen(
  budget: Budget,
  alle: readonly Budget[],
  kategorien: readonly Kategorie[],
  am: string,
): Cent {
  const proMonat = effektiverMonatsbetrag(budget, alle, kategorien);
  if (budget.art === "monatlich") return proMonat;
  const monate = monateZwischen(budget.start, monatsFenster(am).von) + 1;
  return monate <= 0 ? 0 : proMonat * monate;
}

/**
 * Ist-Verbrauch eines Budgets: die Summe der **Aufwands**-Abflüsse auf seinen Kategorien
 * im Fenster [von, bis), als positiver Betrag.
 *
 * Vorzeichenrichtig: Aufwände sind negativ und erhöhen den Verbrauch, ein positiver
 * Aufwand ist eine Erstattung und senkt ihn. Ein früheres `Math.abs` liess Retouren den
 * Verbrauch ERHÖHEN — Fehler in Höhe des doppelten Erstattungsbetrags, und die Historie
 * (die vorzeichenrichtig rechnet) zeigte für dieselben Daten andere Zahlen.
 *
 * Umschichtungen zählen NICHT — Geld, das nur das Konto wechselt, ist keine Ausgabe.
 * Nicht behandelt: eine Erstattung, die als `Ertrag` gebucht ist, bleibt draussen. Das
 * ist eine fachliche Frage (zählt jeder Zufluss auf einer Aufwandskategorie als
 * Entlastung?) und keine hier zu treffende Entscheidung.
 *
 * Gezählt wird über `budgetKategorien`, nicht über den rohen Unterbaum: was ein
 * eingebettetes Budget beansprucht, belastet das Dach nicht noch einmal.
 */
export interface BudgetSicht {
  readonly buchungen: readonly IstBuchung[];
  readonly kategorien: readonly Kategorie[];
  /** ALLE Budgets — für das Herausrechnen der ineinanderliegenden. */
  readonly budgets: readonly Budget[];
  /**
   * IDs der Buchungen, die zu einem Vertrag gehören. Sie zählen NICHT gegen ein Budget
   * (siehe Kopf). Pflichtfeld: eine leere Menge ist eine Aussage („keine Verträge
   * bekannt") und muss hingeschrieben werden, nicht durch Weglassen entstehen.
   */
  readonly vertragsBuchungen: ReadonlySet<string>;
}

export function budgetVerbrauch(sicht: BudgetSicht, budget: Budget, von: string, bis: string): Cent {
  return budgetBuchungen(sicht, budget, von, bis).reduce((s, p) => s + p.betrag, 0);
}

/** Ein Verbrauchsposten: welche Buchung mit welchem Teilbetrag auf das Budget zählt. */
export interface Verbrauchsposten {
  readonly buchung: IstBuchung;
  /**
   * Index des Anteils innerhalb der Buchung. Zusammen mit `buchung.id` der Schlüssel,
   * an dem der Monatsausblick erkennt, welche Anteile schon von einem Budget getragen
   * werden — der Rest gehört unter „Sonstiges". Ohne ihn wäre ein Anteil, den kein
   * Budget nimmt, unsichtbar, und die Ist-Spalte summierte nicht mehr auf.
   */
  readonly anteil: number;
  /** Die Kategorie DES ANTEILS — bei geteilten Buchungen nicht die der Buchung. */
  readonly kategorieId?: string;
  /** Beitrag zum Verbrauch, POSITIV (eine Erstattung ist entsprechend negativ). */
  readonly betrag: Cent;
}

/**
 * Die einzelnen Buchungen (genauer: Anteile) hinter `budgetVerbrauch`.
 *
 * Es gibt sie, damit die Oberfläche „woraus besteht dieser Verbrauch?" beantworten kann,
 * ohne die Auswahlregeln nachzubauen — `budgetVerbrauch` ist nur noch ihre Summe. Zwei
 * Stellen mit derselben Regel wären zwei Stellen, an denen sie auseinanderlaufen kann.
 */
export function budgetBuchungen(
  sicht: BudgetSicht,
  budget: Budget,
  von: string,
  bis: string,
): Verbrauchsposten[] {
  const { buchungen, kategorien, budgets, vertragsBuchungen } = sicht;
  const relevant = budgetKategorien(budget, budgets, kategorien);
  const raus: Verbrauchsposten[] = [];
  for (const b of buchungen) {
    if (b.charakter !== "Aufwand") continue;
    if (b.datum < von || b.datum >= bis) continue;
    // Vertragsraten sind anderswo geplant und stehen im Ausblick in ihrer eigenen Zeile.
    if (vertragsBuchungen.has(b.id)) continue;
    // Über die Anteile, nicht über b.kategorieId: eine geteilte Buchung (S-7) belastet
    // dieses Budget nur mit IHREM Teil, nicht mit dem vollen Betrag — und nicht gar nicht.
    kategorieAnteile(b).forEach((a, i) => {
      if (a.kategorieId && relevant.has(a.kategorieId)) {
        raus.push({ buchung: b, anteil: i, kategorieId: a.kategorieId, betrag: -a.betrag });
      }
    });
  }
  return raus.sort((x, y) => x.buchung.datum.localeCompare(y.buchung.datum));
}

/** Rahmen minus Verbrauch zum Monat von `am` — was noch da ist. Negativ = überzogen. */
export function budgetStand(
  sicht: BudgetSicht,
  budget: Budget,
  am: string,
): { rahmen: Cent; verbraucht: Cent; rest: Cent } {
  const { von, bis } = verbrauchsFenster(budget, am);
  const rahmen = budgetRahmen(budget, sicht.budgets, sicht.kategorien, am);
  const verbraucht = budgetVerbrauch(sicht, budget, von, bis);
  return { rahmen, verbraucht, rest: rahmen - verbraucht };
}
