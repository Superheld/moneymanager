// Zuständigkeit — wer einen Anteil einer Ausgabe trägt: ein monatliches Budget, eine
// Rücklage, mehrere (dann wartet er auf eine Zuordnung) oder niemand.
//
// Seit Paket 3 des Umbaus fragen hier die Einordnung (`core/einordnung.ts`) UND der
// Verbrauch eines Budgets (`budgetBuchungen`) — EINE Antwort für beide, sonst rechnete der
// Verbrauch eines Dachs anders als das Ergebnis.
//
// Gefragt wird nur für Ausgaben, die keine Umbuchung, keine Umschichtung, kein Ertrag und
// keine Vertragszahlung sind: diese Schritte bleiben, wie sie sind, und kommen vorher.
//
// **Warum in der Wurzel und in keinem der beiden Bereiche:** hier wird ABGEWOGEN — am
// selben Knoten gewinnt das Budget, darunter nimmt eine Rücklage dem Budget ihre Buchungen
// ab und umgekehrt. Das ist keine Eigenschaft des Budgets und keine der Rücklage, sondern
// eine Regel zwischen beiden. Bis 2026-11-16 stand sie in `ruecklagen/`, und die Rücklagen
// mussten dafür die Budgets kennen, während die Budgets für ihren Verbrauch bei den
// Rücklagen nachfragten — ein Kreis. Jetzt kennen die Budgets die Rücklagen (ein Budget
// zählt „ohne die Rücklage darunter"), die Rücklagen keine Budgets, und was beide
// gegeneinander abwägt, steht hier (`src/architektur.test.ts`, „Modulgrenzen").
//
// Aus demselben Grund steht hier die Sicht, über die gefragt wird
// (`Zustaendigkeitssicht`), und was aus ihr folgt: welche Anteile ein Budget oder eine
// Rücklage trägt (`getrageneBuchungen`), was jede Rücklage über ihre Kategorie gefunden
// hat (`ruecklagenEntnahmenAus`). Was nur die Rücklage betrifft — ihre Zuordnungen, an
// welchen Tagen sie findet, wer zur Wahl steht —, liegt in `ruecklagen/zuordnung.ts`.

import type { Cent } from "./basis/geld";
import { kategorieAnteile, type IstBuchung } from "./buchung/istbuchung";
import type { Budget } from "./budgets/budget";
import type { Kategorie } from "./kategorien/kategorie";
import type { Ruecklage, Ruecklagenzyklus } from "./ruecklagen/ruecklage";
import type { Ruecklagenentnahme } from "./ruecklagen/topf";
import { findetAm, type Ruecklagenzuordnung } from "./ruecklagen/zuordnung";

/** Der Anteil, nach dem gefragt wird. */
export interface Anteilsfrage {
  readonly istbuchungId: string;
  readonly kategorieId?: string;
  readonly datum: string;
  /** Wie an der Buchung; fehlt es, ist sie budgetrelevant (Vorgabe 1). */
  readonly budgetrelevant?: boolean;
}

export type Zustaendig =
  /** Ein monatliches Budget trägt ihn: laufende Kosten. */
  | { readonly art: "laufend"; readonly budgetId: string }
  /** Eine Rücklage trägt ihn: eine Entnahme nach der max-Regel. */
  | { readonly art: "ruecklage"; readonly ruecklageId: string }
  /**
   * Eine Entnahme über eine ALTE Verknüpfung: eine Ausbuchung nennt die Buchung. Ihre
   * Kosten rechnet `altabschlussKosten`, nicht die max-Regel — deshalb eine eigene Art.
   */
  | { readonly art: "ausgebucht"; readonly ruecklageIds: readonly string[] }
  /** Mehrere Rücklagen kämen in Frage: bis jemand zuordnet, ungeplant und offen. */
  | { readonly art: "wartet"; readonly kandidaten: readonly string[] }
  | { readonly art: "ungeplant" };

/**
 * Baut die Zuständigkeit für einen Bestand; zurück kommt eine Funktion, weil die Vorarbeit
 * (wer hängt an welcher Kategorie) einmal anfällt und nicht je Anteil.
 *
 * `ruecklagen` sind ALLE, beendete eingeschlossen: eine beendete trägt ihre Kategorie bis
 * zu ihrem Ende, und ein Monat davor soll nicht anders aussehen, nur weil sie inzwischen
 * beendet ist. `budgets` sind die monatlichen — seit Migration 81 gibt es keine anderen.
 * Am selben Knoten geht ein monatliches Budget jeder Rücklage vor: eine neue Rücklage
 * darf dort nicht angelegt werden, und im Altfall gewinnt das Budget.
 *
 * Bis Migration 81 ging dort auch das aufbauende Budget vor. Seither ist es eine
 * Rücklage der Sorte `fortlaufend` ohne Fundanfang (`findet_ab` leer). Hängen weitere
 * Rücklagen an derselben Kategorie, wartet eine Buchung erst ab DEREN `findet_ab` auf eine
 * Zuordnung — davor trägt die frühere allein, wie zuvor.
 *
 * Die Reihenfolge (Teil B des Entwurfs, Abschnitt 2):
 *
 *   1. Ausdrückliche Zuordnung — erst die für die Kategorie des Anteils, dann die für die
 *      ganze Buchung. Eine Zeile ohne Rücklage heisst „ausdrücklich keine": weiter, aber
 *      ohne Rücklagen.
 *   2. `budgetrelevant = false`: mit alter Verknüpfung über eine Ausbuchung →
 *      `ausgebucht`, sonst `ungeplant` (eine von Hand aus den Budgets genommene Ausgabe
 *      kostet ihren Monat).
 *   3. Der nächste Vorfahr der Kategorie, an dem etwas hängt. Ein monatliches Budget
 *      gewinnt dort gegen jede Rücklage (siehe oben).
 *      Eine Rücklage hängt dort nur, wenn ihr Fenster den Tag enthält — sonst fällt der
 *      Anteil zum Dach durch, wie heute vor der Umstellung. Eine → `ruecklage`, mehrere
 *      → `wartet`.
 *   4. Sonst `ungeplant`.
 *
 * Beispiel: Freizeit > Urlaub, an Freizeit ein monatliches Budget, an Urlaub zwei
 * Rücklagen ab 01.01. Eine Urlaubsbuchung ohne Zuordnung wartet auf beide; mit Zuordnung
 * gehört sie der einen; am 20.12. des Vorjahres gehört sie dem Budget Freizeit.
 */
export function zustaendigkeit(
  kategorien: readonly Kategorie[],
  budgets: readonly Budget[],
  ruecklagen: readonly Ruecklage[],
  zuordnungen: readonly Ruecklagenzuordnung[],
  abschluesse: readonly Ruecklagenzyklus[],
): (anteil: Anteilsfrage) => Zustaendig {
  const eltern = new Map(kategorien.map((k) => [k.id, k.elternId]));
  const budgetAn = new Map<string, Budget>();
  for (const b of budgets) budgetAn.set(b.kategorieId, b);
  const ruecklagenAn = new Map<string, Ruecklage[]>();
  for (const r of ruecklagen) {
    if (!r.kategorieId) continue;
    const liste = ruecklagenAn.get(r.kategorieId);
    if (liste) liste.push(r);
    else ruecklagenAn.set(r.kategorieId, [r]);
  }
  const bekannt = new Set(ruecklagen.map((r) => r.id));
  const zuordnung = new Map<string, Ruecklagenzuordnung>();
  for (const z of zuordnungen) zuordnung.set(`${z.istbuchungId}\u0000${z.kategorieId ?? ""}`, z);
  const ausgebucht = new Map<string, string[]>();
  for (const a of abschluesse) {
    if (!a.istbuchungId) continue;
    const liste = ausgebucht.get(a.istbuchungId);
    if (liste) liste.push(a.ruecklageId);
    else ausgebucht.set(a.istbuchungId, [a.ruecklageId]);
  }

  return (anteil) => {
    const ausdruecklich =
      (anteil.kategorieId ? zuordnung.get(`${anteil.istbuchungId}\u0000${anteil.kategorieId}`) : undefined) ??
      zuordnung.get(`${anteil.istbuchungId}\u0000`);
    // Eine Zuordnung auf eine Rücklage, die es nicht (mehr) gibt, sagt nichts — CASCADE
    // räumt sie in der App ab, hier wird sie nur nicht geglaubt.
    if (ausdruecklich?.ruecklageId && bekannt.has(ausdruecklich.ruecklageId)) {
      return { art: "ruecklage", ruecklageId: ausdruecklich.ruecklageId };
    }
    const ohneRuecklagen = !!ausdruecklich && !ausdruecklich.ruecklageId;

    // Eine alte Verknüpfung gilt nur, solange die Buchung aus den Budgets genommen ist —
    // so fragte die Einordnung vor der Umstellung, und wer einen ausgebuchten Kauf von
    // Hand wieder budgetrelevant stellt, hat ihn damit zurück in seine Kategorie gelegt.
    if (anteil.budgetrelevant === false) {
      const alt = ausgebucht.get(anteil.istbuchungId);
      return alt ? { art: "ausgebucht", ruecklageIds: alt } : { art: "ungeplant" };
    }

    let knoten = anteil.kategorieId;
    // Der Zähler schützt gegen einen Zyklus im Baum, wie in `elternBudget`.
    for (let i = 0; knoten && i < 100; i++) {
      const budget = budgetAn.get(knoten);
      if (budget) return { art: "laufend", budgetId: budget.id };
      const kandidaten = ohneRuecklagen
        ? []
        : (ruecklagenAn.get(knoten) ?? []).filter((r) => findetAm(r, anteil.datum)).map((r) => r.id);
      if (kandidaten.length === 1) return { art: "ruecklage", ruecklageId: kandidaten[0] };
      if (kandidaten.length > 1) return { art: "wartet", kandidaten };
      knoten = eltern.get(knoten);
    }
    return { art: "ungeplant" };
  };
}

/** Was zwischen Budgets und Rücklagen herausgerechnet wird, je Seite. */
export interface Herausgerechnet {
  /** Budget-ID → die Rücklagen, die ihm Buchungen abnehmen (sie hängen darunter). */
  readonly ausBudget: ReadonlyMap<string, readonly Ruecklage[]>;
  /** Rücklagen-ID → die Budgets, die ihr Buchungen abnehmen (sie hängen darunter). */
  readonly ausRuecklage: ReadonlyMap<string, readonly Budget[]>;
}

/**
 * Wer wem Buchungen abnimmt, am Tag `am` — für den Hinweis „ohne …" an einem Budget (und
 * an einer Rücklage), aus dem etwas herausgerechnet ist.
 *
 * Dieselbe Regel wie `zustaendigkeit`, nur über Knoten statt über Anteile: was an einer
 * Kategorie hängt, trägt sie samt Unterkategorien, bis ein näherer Träger kommt. Hängt
 * unter einem Budget eine Rücklage, deren Fenster den Tag enthält, fehlen dem Budget ihre
 * Buchungen — und umgekehrt. Am selben Knoten gewinnt das Budget; dann nimmt niemand
 * jemandem etwas ab. Eine Rücklage, die an diesem Tag nichts findet (eine
 * abschliessende ohne `findet_ab`, eine beendete), nimmt auch nichts ab.
 *
 * Bis Migration 81 stand das als `abgezogen` an den Budgetständen und wurde aus dem
 * Budgetbaum gelesen (`nachArtGetrennt`); seither ist die eine Seite eine Rücklage, und
 * die Frage gehört der Zuständigkeit.
 */
export function herausgerechnet(
  kategorien: readonly Kategorie[],
  budgets: readonly Budget[],
  ruecklagen: readonly Ruecklage[],
  am: string,
): Herausgerechnet {
  const eltern = new Map(kategorien.map((k) => [k.id, k.elternId]));
  const budgetAn = new Map<string, Budget>();
  for (const b of budgets) budgetAn.set(b.kategorieId, b);
  const ruecklagenAn = new Map<string, Ruecklage[]>();
  for (const r of ruecklagen) {
    if (!r.kategorieId || !findetAm(r, am)) continue;
    const liste = ruecklagenAn.get(r.kategorieId);
    if (liste) liste.push(r);
    else ruecklagenAn.set(r.kategorieId, [r]);
  }
  /** Der nächste Träger ÜBER dem Knoten (der Knoten selbst ausgenommen). */
  const darueber = (knoten: string): { budget?: Budget; ruecklagen?: Ruecklage[] } | undefined => {
    let k = eltern.get(knoten);
    for (let i = 0; k && i < 100; i++) {
      const b = budgetAn.get(k);
      if (b) return { budget: b };
      const rs = ruecklagenAn.get(k);
      if (rs) return { ruecklagen: rs };
      k = eltern.get(k);
    }
    return undefined;
  };

  const ausBudget = new Map<string, Ruecklage[]>();
  const ausRuecklage = new Map<string, Budget[]>();
  for (const [knoten, rs] of ruecklagenAn) {
    if (budgetAn.has(knoten)) continue;
    const t = darueber(knoten);
    if (t?.budget) ausBudget.set(t.budget.id, [...(ausBudget.get(t.budget.id) ?? []), ...rs]);
  }
  for (const b of budgets) {
    const t = darueber(b.kategorieId);
    for (const r of t?.ruecklagen ?? []) ausRuecklage.set(r.id, [...(ausRuecklage.get(r.id) ?? []), b]);
  }
  return { ausBudget, ausRuecklage };
}

/**
 * Alles, was die Frage „wer trägt diesen Anteil?" für einen Bestand braucht — Buchungen,
 * Kategorien, Budgets, Rücklagen samt Zuordnungen und Ausbuchungen, und welche Buchungen
 * zu einem Vertrag gehören.
 *
 * Bis 2026-11-16 hiess sie `BudgetSicht` und stand bei den Budgets; über sie fragten aber auch
 * Stand, Anspruch und Verlauf jeder Rücklage. Sie gehört der Abwägung zwischen
 * beiden und steht deshalb hier.
 */
export interface Zustaendigkeitssicht {
  readonly buchungen: readonly IstBuchung[];
  readonly kategorien: readonly Kategorie[];
  /** ALLE Budgets — für das Herausrechnen der ineinanderliegenden. */
  readonly budgets: readonly Budget[];
  /**
   * IDs der Buchungen, die zu einem Vertrag gehören. Sie zählen NICHT gegen ein Budget
   * (Kopf von `budgets/budget.ts`). Pflichtfeld: eine leere Menge ist eine Aussage („keine Verträge
   * bekannt") und muss hingeschrieben werden, nicht durch Weglassen entstehen.
   */
  readonly vertragsBuchungen: ReadonlySet<string>;
  /**
   * ALLE Rücklagen, beendete eingeschlossen — wer eine Kategorie trägt, entscheidet seit
   * Paket 3 des Umbaus die Zuständigkeit (oben), dieselbe wie in
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

const getragenJeSicht = new WeakMap<Zustaendigkeitssicht, readonly GetragenerAnteil[]>();

/**
 * Jeder Anteil jeder Aufwandsbuchung, die auf ein Budget oder eine Rücklage zählen kann,
 * und wer ihn trägt — EINMAL je Sicht gerechnet, weil Verbrauch, Stand und Anspruch jedes
 * Budgets und jeder Rücklage dieselbe Frage stellen.
 *
 * Ausgenommen wie bisher: alles ausser Aufwand und die Vertragsraten (Kopf von
 * `budgets/budget.ts`).
 * `budgetrelevant = false` fällt NICHT schon hier heraus, sondern in der Zuständigkeit —
 * dort entscheidet sich, ob eine ausdrückliche Zuordnung ihn trotzdem einer Rücklage gibt.
 * Einem Budget gibt sie ihn nie.
 */
function getrageneAnteile(sicht: Zustaendigkeitssicht): readonly GetragenerAnteil[] {
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
export function ruecklagenEntnahmenAus(sicht: Zustaendigkeitssicht): Map<string, Ruecklagenentnahme[]> {
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
 * warten — für die Ausgabenvorschläge (`ausgabenvorschlaege.ts`), die sie auslassen:
 * was eine Rücklage schon trägt, soll weder ein Budget messen noch eine zweite Rücklage.
 *
 * Bis Migration 81 hiess das `vonRuecklagenGetragen` und nahm die aufbauenden Budgets
 * aus (deren Kategorien schloss der Vorschlag ohnehin aus, weil dort ein Budget lag).
 * Seither sind sie Rücklagen, und die eine Regel deckt beide.
 */
export function ruecklagenAnteile(sicht: Zustaendigkeitssicht): Set<string> {
  const raus = new Set<string>();
  for (const x of getrageneAnteile(sicht)) {
    const t = x.traeger;
    if (t.art === "ruecklage" || t.art === "wartet") raus.add(`${x.buchung.id}#${x.anteil}`);
  }
  return raus;
}

/** Ein Verbrauchsposten: welche Buchung mit welchem Teilbetrag auf ein Budget oder eine Rücklage zählt. */
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
 * Die Anteile im Fenster [von, bis), die `id` trägt — ein Budget oder eine Rücklage. Die
 * eine Auswahl hinter dem Verbrauch eines Budgets und dem, was eine Rücklage im
 * Monatsausblick getragen hat.
 */
export function getrageneBuchungen(
  sicht: Zustaendigkeitssicht,
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

