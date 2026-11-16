// Budget — was pro Monat für eine Kategorie vorgesehen ist. Der Rahmen setzt sich zum
// Ersten wieder auf den Monatsbetrag zurück: was im März übrig blieb, ist im April nicht
// mehr da. Der Fall für laufende Ausgaben: Lebensmittel, Drogerie, Tanken.
//
// **Seit Migration 81 ist ein Budget nur noch monatlich.** Bis dahin gab es eine zweite
// Art, `aufbauend`, deren Rahmen weiterwuchs und nie zurückgesetzt wurde — für alles, was
// sich sammelt, bis es gebraucht wird. Das ist eine Rücklage (`ruecklagen/`, Sorte
// `fortlaufend`), und dorthin ist sie umgezogen (ADR-0006). Die Spalte `budget.art` bleibt
// im Schema; das Repository liest nur noch `monatlich`.
//
// Kein Ziel, keine Frist, kein Schätzbetrag — eingegeben wird genau eine Zahl: der Betrag
// pro Monat. Der ändert sich
// über die Zeit, und deshalb steht er als REIHE am Budget (`betraege`) und nicht als Wert:
// wer im August von 400 auf 450 geht, hat im Juli mit 400 geplant, und das soll so
// stehenbleiben. Wer den Betrag eines Monats braucht, fragt `betragImMonat`.
//
// Vorgänger war ein Paar aus `Budget` (Rahmen je Periode monatlich/jährlich) und `Topf`
// (Puffer mit Schätzbetrag+Frist, Spartopf mit Zuführung+Sparziel, plus eigener
// Entnahme-Buchung über `Verwendung`). Drei Arten, vier Zielwert-Begriffe und zwei
// Tabellen für dieselbe Frage „was lege ich monatlich für X zurück?". Zusammengelegt
// 2026-08-19; die Töpfe waren zu dem Zeitpunkt leer.
//
// **Verträge zählen NICHT.** Ein Budget steuert Verhalten — „diesen Monat noch 120 € für
// Auswärtsessen". Eine Vertragsrate kann man nicht steuern; sie ist anderswo geplant und
// steht im Monatsausblick in ihrer eigenen Zeile. Zählte sie zusätzlich gegen das Budget,
// stünde dieselbe Zahlung zweimal in der Aufrechnung, und ein Rahmen, der (wie der
// Budgetvorschlag ihn errechnet) den Vertragsanteil schon abgezogen hat, würde gegen
// einen Verbrauch mitsamt Verträgen gemessen — ein Rahmen, der eingehalten ist, stünde
// dann als überzogen da, nur weil ein erfasster Vertrag in seiner Kategorie liegt.
//
// Welche Buchungen das sind, entscheidet der Kern NICHT selbst: die Verknüpfung
// Buchung↔Vertrag entsteht in `vertragszuordnung` (Anwendungsschicht) aus den
// Erkennungsmustern. Sie kommt deshalb als Pflichtfeld in der `Zustaendigkeitssicht` herein —
// pflichtig, weil eine optionale Angabe genau an einer Aufrufstelle vergessen wird und
// dort still eine falsche Zahl erzeugt. Genau so ist dieser Fehler entstanden.
//
// **Verschachtelung: das Dach gilt für alles AUSSER seinen Unterbudgets.** Budgets dürfen
// ineinander liegen: „Mobilität" mit 50 €, darunter „Tanken" mit 100 €. Dann sind die
// 50 € für alles in Mobilität ausser Tanken da, und die 100 € fürs Tanken — zwei
// getrennte Rahmen, zusammen 150 € im Monat. Eine Rücklage darunter nimmt dem Dach
// ihre Kategorie ebenso ab (`zustaendigkeit`). Das Unterbudget hat auf das Dach KEINEN
// Einfluss: weder zählt sein Verbrauch gegen das Dach (`budgetKategorien` nimmt seinen
// Unterbaum heraus), noch geht sein Betrag vom Dach ab.
//
// **Bis 2026-11-09 ging er ab.** Das Dach bekam „seinen Betrag minus die Beträge darin",
// gedacht als Aufteilung EINES Rahmens auf seine Teile. So ist ein Budget aber nicht
// gemeint, und es ergab Unsinn, sobald das Kind mehr bekam als das Dach: Mobilität bekam
// jeden Monat −50 €, und ein aufbauendes Dach (damals gab es das) SANK Monat für Monat,
// ohne dass etwas ausgegeben wurde. Wer den Abzug zurückbringt, bringt das mit.

import type { Cent } from "../basis/geld";
import { kategorieUnterbaum, type Kategorie } from "../kategorien/kategorie";
import { addMonate, parseIso, toIso } from "../basis/datum";
// Wer einen Anteil trägt — dieses Budget, ein anderes, eine Rücklage darunter —, wägt die
// Zuständigkeit in der Wurzel ab; hier wird nur noch gezählt.
import { getrageneBuchungen, type Verbrauchsposten, type Zustaendigkeitssicht } from "../zustaendigkeit";

/** Seit Migration 81 die einzige Art; `aufbauend` ist eine Rücklage geworden. */
export type Budgetart = "monatlich";

/**
 * Ein Betrag und der Monat, ab dem er gilt (`YYYY-MM`).
 *
 * Ein Budget hat davon eine REIHE, nicht einen Wert. Bis dahin überschrieb eine Änderung
 * die Vergangenheit: wer im August von 400 auf 450 ging, sah rückwirkend jeden Monat mit
 * 450 geplant, und es war nicht mehr feststellbar, wogegen er damals gemessen hatte. Bei
 * einem aufbauenden Budget rechnete es zusätzlich den ganzen Sockel neu.
 *
 * MONAT und nicht Datum: ein Budget ist eine Monatsgrösse. Ein Wechsel mitten im Monat
 * müsste anteilig gerechnet werden, und dafür gibt es keinen fachlichen Grund.
 */
export interface Budgetbetrag {
  /** `YYYY-MM`. */
  readonly abMonat: string;
  /** Positiver Betrag in Cent (> 0). */
  readonly betrag: Cent;
}

export interface Budget {
  readonly id: string;
  readonly kategorieId: string;
  /**
   * Das Konto, auf dem das Geld dieses Budgets liegt, bis es ausgegeben ist — EINE
   * Bedeutung, seit 2026-10-26 (vorher trug das Feld drei, und die versprochene vierte
   * wurde nirgends gerechnet).
   *
   * Daraus folgt alles Weitere: die Liquiditätsvorschau lässt den Monatsrest von hier
   * abfliessen, und
   * die Übersicht plant die Rate eines Budgets auf einem nicht liquiden Konto nicht —
   * sie kommt dort über eine Umbuchung an.
   *
   * Der VERBRAUCH wird bewusst NICHT auf dieses Konto eingeschränkt: dieselbe Kategorie
   * wird auch mal bar oder über die Kreditkarte bezahlt, und ein Budget, das solche
   * Buchungen still übersieht, zeigt zu viel Rest an.
   */
  readonly kontoId: string;
  /**
   * Was pro Monat hineingeht — aufsteigend nach `abMonat`, mindestens ein Eintrag.
   *
   * Nicht leer, und das ist eine Invariante und keine Bequemlichkeit: ein Budget ohne
   * Betrag ist eine Kategorie mit einem Etikett. Der Use-Case lässt deshalb die letzte
   * verbleibende Version nicht löschen.
   */
  readonly betraege: readonly Budgetbetrag[];
  readonly art: Budgetart;
  /**
   * Der Tag des Anlegens (ISO). Ohne Wirkung auf die Rechnung — er war der Sammelanker
   * des aufbauenden Budgets; das Feld bleibt gesetzt (ein Feld, das mal da ist und mal
   * nicht, muss überall geprüft werden).
   */
  readonly start: string;
}

/**
 * Der Betrag, der im Monat `monat` (`YYYY-MM`) gilt: die jüngste Version, die nicht in der
 * Zukunft liegt.
 *
 * **0 vor der ersten Version** — nicht der erste Betrag. Vor seiner ersten Version war das
 * Budget nicht geplant, und einen Rahmen rückwirkend anzunehmen hiesse, eine Planung zu
 * erfinden, die es nie gab. Genau darum geht es bei der Versionierung.
 */
export function betragImMonat(budget: Budget, monat: string): Cent {
  let treffer = 0;
  for (const v of budget.betraege) {
    if (v.abMonat > monat) break;
    treffer = v.betrag;
  }
  return treffer;
}

/**
 * Der erste Monat, für den dieses Budget etwas aussagt: der seiner ersten Betragsversion.
 *
 * **`start` wird hier nicht vorausgesetzt, obwohl der Typ es zusagt.** Die Spalte
 * `budget.start` ist nullable, und das Repository reicht sie unverändert durch. Ohne
 * Betragsversion (über die App nicht herzustellen) dient er als Rückfall; fehlt auch er,
 * ist der Monat leer, und das Budget rechnet nichts — statt beim Laden zu werfen und den
 * ganzen Budgets-Screen mitzureissen.
 */
export function ersterBudgetmonat(budget: Budget): string {
  return budget.betraege[0]?.abMonat ?? (budget.start ?? "").slice(0, 7);
}

/**
 * Was in `monat` in dieses Budget hineingeht — 0, solange der Monat vor seinem ersten
 * liegt. Unterbudgets ändern daran nichts (siehe Kopf).
 *
 * Die eine Stelle, die „wieviel bekommt dieses Budget in DIESEM Monat" beantwortet.
 * `budgetRahmen` und die Fortschreibung fragen beide hier, damit sie nicht auseinander
 * laufen können, wenn eine Version dazukommt.
 */
export function zufuehrungIm(budget: Budget, monat: string): Cent {
  if (monat < ersterBudgetmonat(budget)) return 0;
  return betragImMonat(budget, monat);
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

/** Die Budgets, die direkt in diesem hier liegen — ihr Unterbaum zählt nicht aufs Dach. */
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
 * Die eine Stelle, an der „was gehört zu wem" entschieden wird. Seit 2026-11-09 nur noch
 * für den Verbrauch — der Betrag eines Budgets ist sein eigener (siehe Kopf).
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

/** Geglätteter erwarteter Abfluss pro Monat (negativ) — was Planung und Monatsausblick je Monat einrechnen. */
export function geglaetteterMonatsabfluss(budget: Budget, monat: string): Cent {
  return -betragImMonat(budget, monat);
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
 * `am` schaut: genau dieser Kalendermonat (Reset zum Ersten).
 */
export function verbrauchsFenster(_budget: Budget, am: string): { von: string; bis: string } {
  return monatsFenster(am);
}

/**
 * Was im Monat von `am` zur Verfügung steht: der Monatsbetrag, jeden Monat neu. Vor der
 * ersten Version 0 — ein Budget rückwirkend zu füllen wäre erfunden.
 */
export function budgetRahmen(budget: Budget, am: string): Cent {
  return zufuehrungIm(budget, am.slice(0, 7));
}

/** `YYYY-MM` einen Monat weiter — reine String-Arithmetik über die Datumshelfer. */
export function monatDanach(monat: string): string {
  return toIso(addMonate(parseIso(`${monat}-01`), 1)).slice(0, 7);
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
export function budgetVerbrauch(sicht: Zustaendigkeitssicht, budget: Budget, von: string, bis: string): Cent {
  return budgetBuchungen(sicht, budget, von, bis).reduce((s, p) => s + p.betrag, 0);
}

/**
 * Die einzelnen Buchungen (genauer: Anteile) hinter `budgetVerbrauch`.
 *
 * Es gibt sie, damit die Oberfläche „woraus besteht dieser Verbrauch?" beantworten kann,
 * ohne die Auswahlregeln nachzubauen — `budgetVerbrauch` ist nur noch ihre Summe. Zwei
 * Stellen mit derselben Regel wären zwei Stellen, an denen sie auseinanderlaufen kann.
 */
export function budgetBuchungen(
  sicht: Zustaendigkeitssicht,
  budget: Budget,
  von: string,
  bis: string,
): Verbrauchsposten[] {
  return getrageneBuchungen(sicht, budget.id, von, bis);
}

/** Rahmen minus Verbrauch zum Monat von `am` — was noch da ist. Negativ = überzogen. */
export function budgetStand(
  sicht: Zustaendigkeitssicht,
  budget: Budget,
  am: string,
): { rahmen: Cent; verbraucht: Cent; rest: Cent } {
  const { von, bis } = verbrauchsFenster(budget, am);
  const rahmen = budgetRahmen(budget, am);
  const verbraucht = budgetVerbrauch(sicht, budget, von, bis);
  return { rahmen, verbraucht, rest: rahmen - verbraucht };
}
