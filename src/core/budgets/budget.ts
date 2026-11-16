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
import { kategorieAnteile, type IstBuchung } from "../buchung/istbuchung";
import { kategorieUnterbaum, type Kategorie } from "../kategorien/kategorie";
import { addMonate, parseIso, toIso } from "../basis/datum";
import type { Ruecklage, Ruecklagenzyklus } from "../ruecklagen/ruecklage";
import type { Ruecklagenentnahme } from "../ruecklagen/topf";
import { zustaendigkeit, type Ruecklagenzuordnung, type Zustaendig } from "../ruecklagen/zustaendigkeit";

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
  /**
   * ALLE Rücklagen, beendete eingeschlossen — wer eine Kategorie trägt, entscheidet seit
   * Paket 3 des Umbaus die Zuständigkeit (`ruecklagen/zustaendigkeit.ts`), dieselbe wie in
   * der Einordnung. Eine Rücklage auf einer Unterkategorie nimmt dem Budget darüber ab
   * ihrem Fundfenster ihre Buchungen weg, wie ein Unterbudget.
   *
   * Optional, und das ist eine Abwägung: ohne Rücklagen rechnet die Sicht genau wie vor
   * der Umstellung (die Budgets tragen ihre Kategorien allein). Der Monatsausblick lässt
   * sie bewusst weg (er rechnet unverändert); jede Sicht, die neben der Ergebnisrechnung
   * steht, gibt sie mit.
   */
  readonly ruecklagen?: readonly Ruecklage[];
  readonly ruecklagenzuordnungen?: readonly Ruecklagenzuordnung[];
  /** Die Ausbuchungen — ein ausgebuchter Kauf trägt keine Kategorie mehr. */
  readonly ausbuchungen?: readonly Ruecklagenzyklus[];
}

/** Ein Anteil einer Aufwandsbuchung und wer ihn trägt. */
interface GetragenerAnteil {
  readonly buchung: IstBuchung;
  readonly anteil: number;
  readonly kategorieId?: string;
  /** Wie an der Buchung, vorzeichenbehaftet. */
  readonly betrag: Cent;
  readonly traeger: Zustaendig;
}

const getragenJeSicht = new WeakMap<BudgetSicht, readonly GetragenerAnteil[]>();

/**
 * Jeder Anteil jeder Aufwandsbuchung, die auf ein Budget oder eine Rücklage zählen kann,
 * und wer ihn trägt — EINMAL je Sicht gerechnet, weil Verbrauch, Stand und Anspruch jedes
 * Budgets und jeder Rücklage dieselbe Frage stellen.
 *
 * Ausgenommen wie bisher: alles ausser Aufwand und die Vertragsraten (siehe Kopf).
 * `budgetrelevant = false` fällt NICHT schon hier heraus, sondern in der Zuständigkeit —
 * dort entscheidet sich, ob eine ausdrückliche Zuordnung ihn trotzdem einer Rücklage gibt.
 * Einem Budget gibt sie ihn nie.
 */
function getrageneAnteile(sicht: BudgetSicht): readonly GetragenerAnteil[] {
  const gemerkt = getragenJeSicht.get(sicht);
  if (gemerkt) return gemerkt;
  const traeger = zustaendigkeit(
    sicht.kategorien,
    sicht.budgets,
    sicht.ruecklagen ?? [],
    sicht.ruecklagenzuordnungen ?? [],
    sicht.ausbuchungen ?? [],
  );
  const raus: GetragenerAnteil[] = [];
  for (const b of sicht.buchungen) {
    if (b.charakter !== "Aufwand") continue;
    // Vertragsraten sind anderswo geplant und stehen im Ausblick in ihrer eigenen Zeile.
    if (sicht.vertragsBuchungen.has(b.id)) continue;
    // Über die Anteile, nicht über b.kategorieId: eine geteilte Buchung (S-7) belastet
    // ein Budget nur mit IHREM Teil, nicht mit dem vollen Betrag — und nicht gar nicht.
    kategorieAnteile(b).forEach((a, i) => {
      raus.push({
        buchung: b,
        anteil: i,
        kategorieId: a.kategorieId,
        betrag: a.betrag,
        traeger: traeger({ istbuchungId: b.id, kategorieId: a.kategorieId, datum: b.datum, budgetrelevant: b.budgetrelevant }),
      });
    });
  }
  getragenJeSicht.set(sicht, raus);
  return raus;
}

/** Trägt `id` (ein Budget oder eine Rücklage) den Anteil? */
function traegt(t: Zustaendig, id: string): boolean {
  return (t.art === "laufend" && t.budgetId === id) || (t.art === "ruecklage" && t.ruecklageId === id);
}

/**
 * Die Anteile, die eine Rücklage über die Zuständigkeit trägt — für ihren Stand und ihren
 * Anspruch auf dem Konto. Dieselbe Auswahl wie der Verbrauch eines Budgets.
 */
export function ruecklagenEntnahmenAus(sicht: BudgetSicht): Map<string, Ruecklagenentnahme[]> {
  const raus = new Map<string, Ruecklagenentnahme[]>();
  for (const x of getrageneAnteile(sicht)) {
    if (x.traeger.art !== "ruecklage") continue;
    const e = { datum: x.buchung.datum, betrag: x.betrag };
    const liste = raus.get(x.traeger.ruecklageId);
    if (liste) liste.push(e);
    else raus.set(x.traeger.ruecklageId, [e]);
  }
  return raus;
}

/**
 * Die Anteile (`buchungId#index`), die eine Rücklage trägt oder die auf eine Zuordnung
 * warten — für die Ausgabenvorschläge (`../ausgabenvorschlaege.ts`), die sie auslassen:
 * was eine Rücklage schon trägt, soll weder ein Budget messen noch eine zweite Rücklage.
 *
 * Bis Migration 81 hiess das `vonRuecklagenGetragen` und nahm die aufbauenden Budgets
 * aus (deren Kategorien schloss der Vorschlag ohnehin aus, weil dort ein Budget lag).
 * Seither sind sie Rücklagen, und die eine Regel deckt beide.
 */
export function ruecklagenAnteile(sicht: BudgetSicht): Set<string> {
  const raus = new Set<string>();
  for (const x of getrageneAnteile(sicht)) {
    const t = x.traeger;
    if (t.art === "ruecklage" || t.art === "wartet") raus.add(`${x.buchung.id}#${x.anteil}`);
  }
  return raus;
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
  return getrageneBuchungen(sicht, budget.id, von, bis);
}

/**
 * Die Anteile im Fenster [von, bis), die `id` trägt — ein Budget oder eine Rücklage. Die
 * eine Auswahl hinter dem Verbrauch eines Budgets und dem, was eine Rücklage im
 * Monatsausblick getragen hat.
 */
export function getrageneBuchungen(
  sicht: BudgetSicht,
  id: string,
  von: string,
  bis: string,
): Verbrauchsposten[] {
  // Wer den Anteil trägt, sagt die Zuständigkeit — dieselbe Frage wie in der Einordnung.
  // Ein eingebettetes Budget oder eine Rücklage darunter nimmt dem Dach seine Kategorien
  // ab (`budgetKategorien` beschreibt dasselbe für Budgets allein); die eine teure
  // Anschaffung, für die zurückgelegt wurde, trägt kein Budget (`budgetrelevant`).
  const raus: Verbrauchsposten[] = [];
  for (const x of getrageneAnteile(sicht)) {
    if (x.buchung.datum < von || x.buchung.datum >= bis) continue;
    if (!x.kategorieId || !traegt(x.traeger, id)) continue;
    raus.push({ buchung: x.buchung, anteil: x.anteil, kategorieId: x.kategorieId, betrag: -x.betrag });
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
  const rahmen = budgetRahmen(budget, am);
  const verbraucht = budgetVerbrauch(sicht, budget, von, bis);
  return { rahmen, verbraucht, rest: rahmen - verbraucht };
}
