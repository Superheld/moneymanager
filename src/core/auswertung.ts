/**
 * Auswertungen über einen Zeitraum — die Fragen, die man einem Haushalt stellt.
 *
 * Sie liegen in der WURZEL des Kerns und nicht in einem Bereichsordner, weil jede von
 * ihnen über mehrere Bereiche rechnet: Buchungen gegen Verträge, Kategorien gegen
 * Budgets, Konten gegen Ausgaben. Dieselbe Begründung wie bei `monatsausblick.ts`.
 *
 * ## Das Vorzeichen, einmal für alle Funktionen hier
 *
 * Eine Ist-Buchung trägt ihr Vorzeichen selbst (Abfluss negativ). Eine Rangliste von
 * Ausgaben liest sich mit negativen Zahlen aber schlecht, und ein Balken bräuchte
 * trotzdem einen Betrag. Deshalb dreht jede AUSGABEN-Größe hier das Vorzeichen um —
 * **durch Negieren der Summe, nie mit `Math.abs`**:
 *
 *     summe = -(Σ vorzeichenbehaftete Beträge)
 *
 * Der Unterschied ist der ganze Punkt. Wer im Zeitraum 200 ausgegeben und 50 erstattet
 * bekommen hat, steht mit 150 da. Mit `Math.abs` je Buchung stünden dort 250, und aus
 * „es kam Geld zurück" würde „es wurde noch mehr ausgegeben". Eine Kategorie, die im
 * Zeitraum unterm Strich Geld zurückgebracht hat, bekommt hier folgerichtig eine
 * NEGATIVE Ausgabe — dieselbe Regel wie bei `Verbrauchsposten.betrag`.
 */

import type { Cent } from "./basis/geld";
import { addMonate, parseIso, toIso } from "./basis/datum";
import { kategorieAnteile, type IstBuchung } from "./buchung/istbuchung";
import { istInterneUmbuchung } from "./buchung/historie";
import { istLiquide, type Zahlungskonto } from "./konten/konto";
import type { Kategorie } from "./kategorien/kategorie";

/** Der Monat einer ISO-Datumsangabe: „2026-08-13" → „2026-08". */
function monat(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Die Buchungen im Fenster, ohne interne Umbuchungen.
 *
 * Umbuchungen bleiben in JEDER Auswertung hier draussen: Geld, das das Konto wechselt,
 * ist weder Einnahme noch Ausgabe, und es stünde in einer Rangliste ganz oben, ohne dass
 * etwas passiert wäre. Das Fenster ist monatsgenau und schliesst beide Enden ein —
 * dieselbe Grenze wie in `kategorieAggregat`, damit zwei Zahlen auf einem Bildschirm
 * dieselbe Menge meinen.
 */
export function imFenster(
  buchungen: readonly IstBuchung[],
  von: string,
  bis: string,
): IstBuchung[] {
  const vonM = monat(von);
  const bisM = monat(bis);
  return buchungen.filter(
    (b) => !istInterneUmbuchung(b) && monat(b.datum) >= vonM && monat(b.datum) <= bisM,
  );
}

/** Wie viele Monate das Fenster umfasst — mindestens einer. */
export function monateImFenster(von: string, bis: string): number {
  const a = parseIso(von);
  const b = parseIso(bis);
  return Math.max(1, (b.y - a.y) * 12 + (b.m - a.m) + 1);
}

// ---------------------------------------------------------------- Kennzahlen

export interface Kennzahlen {
  readonly monate: number;
  /** Durchschnitt je Monat, positiv. */
  readonly einnahmenJeMonat: Cent;
  /** Durchschnitt je Monat, positiv (siehe Vorzeichen-Regel im Kopf). */
  readonly ausgabenJeMonat: Cent;
  /** Der Teil der Ausgaben, der aus Verträgen kommt — je Monat, positiv. */
  readonly festJeMonat: Cent;
  /** Alles übrige — je Monat, positiv. */
  readonly freiJeMonat: Cent;
  /** Liquide Mittel heute: Anfangsbestände plus alle Buchungen der liquiden Konten. */
  readonly liquide: Cent;
  /**
   * Anteile als Bruchteil (0,42 = 42 %). `undefined` heisst „nicht bestimmbar" und
   * nicht „null" — ohne Einnahmen gibt es keine Quote, und eine 0 zu zeigen behauptete,
   * es sei nichts fest, statt zuzugeben, dass die Bezugsgrösse fehlt.
   */
  readonly fixkostenquote?: number;
  readonly sparquote?: number;
  /** Wie viele Monate die liquiden Mittel bei diesem Ausgabenschnitt tragen. */
  readonly reichweiteMonate?: number;
}

/**
 * Die vier Zahlen, die zusammen „wie steht es" beantworten.
 *
 * **Warum der Durchschnitt und nicht der letzte Monat:** ein einzelner Monat trägt die
 * Jahresrechnung der Versicherung oder eben nicht. Wer daraus eine Quote bildet, misst
 * den Zufall des Kalenders. Der Zeitraum-Schnitt ist der Massstab, gegen den ein
 * einzelner Monat überhaupt erst etwas aussagt.
 *
 * **Die Reichweite rechnet mit den liquiden Mitteln**, nicht mit dem Gesamtvermögen: eine
 * Rücklage, an die man nicht will, und ein Depot, das man nicht auflösen will, tragen
 * einen nicht durch den nächsten Monat. Das ist genau die Trennung, für die es die
 * `Kontoklasse` gibt.
 */
export function kennzahlen(
  buchungen: readonly IstBuchung[],
  konten: readonly Zahlungskonto[],
  vertragsBuchungen: ReadonlySet<string>,
  von: string,
  bis: string,
): Kennzahlen {
  const monate = monateImFenster(von, bis);
  const relevant = imFenster(buchungen, von, bis);

  let ein = 0;
  let aus = 0;
  let fest = 0;
  for (const b of relevant) {
    if (b.betrag > 0) ein += b.betrag;
    else {
      aus += b.betrag;
      if (vertragsBuchungen.has(b.id)) fest += b.betrag;
    }
  }

  // Liquide Mittel: Anfangsbestand plus Bewegungen — und beides mit DERSELBEN Regel
  // gefiltert. Nimmt man den Saldo eines Kontos heraus und seine Buchungen nicht, kommt
  // ein Stand heraus, den es nie gab (siehe CLAUDE.md).
  const liquideKonten = konten.filter(istLiquide);
  const liquideIds = new Set(liquideKonten.map((k) => k.id));
  const liquide =
    liquideKonten.reduce((s, k) => s + k.saldo, 0) +
    buchungen.reduce((s, b) => (liquideIds.has(b.kontoId) ? s + b.betrag : s), 0);

  const einnahmenJeMonat = Math.round(ein / monate);
  const ausgabenJeMonat = Math.round(-aus / monate);
  const festJeMonat = Math.round(-fest / monate);

  return {
    monate,
    einnahmenJeMonat,
    ausgabenJeMonat,
    festJeMonat,
    freiJeMonat: ausgabenJeMonat - festJeMonat,
    liquide,
    fixkostenquote: ein > 0 ? -fest / ein : undefined,
    sparquote: ein > 0 ? (ein + aus) / ein : undefined,
    // Ein Haushalt ohne Ausgaben hat keine Reichweite, sondern eine unbegrenzte — und
    // „unbegrenzt" als Zahl auszugeben wäre eine Behauptung über einen leeren Bestand.
    reichweiteMonate: ausgabenJeMonat > 0 ? liquide / ausgabenJeMonat : undefined,
  };
}

// ------------------------------------------------------------- Fest und frei

export interface MonatFestFrei {
  readonly monat: string;
  /** Positiv. */
  readonly fest: Cent;
  /** Positiv. */
  readonly frei: Cent;
  /** Positiv. */
  readonly einnahmen: Cent;
}

/**
 * Je Monat: was durch Verträge gebunden war und was frei verfügbar blieb.
 *
 * **Gebunden heisst „gehört zu einem Vertrag"** — nicht „ist gross" und nicht „kommt
 * regelmässig vor". Das ist die einzige Zuordnung, die im Bestand wirklich steht
 * (`ist_buchung.vertrag_id`), und sie ist eine Entscheidung des Nutzers oder der
 * Erkennung, keine Schätzung dieser Funktion. Eine Miete ohne Vertrag zählt hier als
 * frei — das ist kein Fehler der Auswertung, sondern ein fehlender Vertrag, und diese
 * Lücke soll sichtbar bleiben statt weggerechnet zu werden.
 */
export function festUndFrei(
  buchungen: readonly IstBuchung[],
  vertragsBuchungen: ReadonlySet<string>,
  von: string,
  bis: string,
): MonatFestFrei[] {
  const reihe = new Map<string, { fest: Cent; frei: Cent; einnahmen: Cent }>();
  let cursor = { ...parseIso(von), d: 1 };
  const bisM = monat(bis);
  while (monat(toIso(cursor)) <= bisM) {
    reihe.set(monat(toIso(cursor)), { fest: 0, frei: 0, einnahmen: 0 });
    cursor = addMonate(cursor, 1);
  }

  for (const b of imFenster(buchungen, von, bis)) {
    const e = reihe.get(monat(b.datum));
    if (!e) continue;
    if (b.betrag > 0) e.einnahmen += b.betrag;
    else if (vertragsBuchungen.has(b.id)) e.fest -= b.betrag;
    else e.frei -= b.betrag;
  }

  return [...reihe.entries()].map(([m, e]) => ({ monat: m, ...e }));
}

// ---------------------------------------------------------------- Empfänger

export interface Empfaengerzeile {
  readonly name: string;
  /** Positiv, siehe Vorzeichen-Regel. */
  readonly summe: Cent;
  readonly anzahl: number;
  /** Wie viele verschiedene Monate — trennt das Abo vom einmaligen Grosskauf. */
  readonly monate: number;
  readonly letzte: string;
}

/**
 * Wohin das Geld geht, an der Kategorie vorbei.
 *
 * Der Empfänger ist die einzige Angabe, die NICHT von unserer Einordnung abhängt: eine
 * falsch kategorisierte Buchung steht hier trotzdem an der richtigen Stelle. Deshalb ist
 * diese Liste oft aufschlussreicher als die Kategorien daneben — und sie ist die Probe
 * darauf, ob die Kategorien stimmen.
 *
 * `monate` steht dabei neben `anzahl`, weil erst beide zusammen etwas sagen: zwölf
 * Zahlungen in zwölf Monaten sind ein Abo, zwölf Zahlungen in einem Monat ein Einkauf,
 * der zufällig oft passiert.
 */
export function empfaengerRangliste(
  buchungen: readonly IstBuchung[],
  empfaengerVon: (b: IstBuchung) => string,
  von: string,
  bis: string,
): Empfaengerzeile[] {
  const map = new Map<string, { summe: Cent; anzahl: number; monate: Set<string>; letzte: string }>();
  for (const b of imFenster(buchungen, von, bis)) {
    if (b.betrag > 0) continue;
    const name = empfaengerVon(b).trim();
    if (!name) continue;
    const e = map.get(name) ?? { summe: 0, anzahl: 0, monate: new Set<string>(), letzte: b.datum };
    e.summe -= b.betrag;
    e.anzahl++;
    e.monate.add(monat(b.datum));
    if (b.datum > e.letzte) e.letzte = b.datum;
    map.set(name, e);
  }
  return [...map.entries()]
    .map(([name, e]) => ({ name, summe: e.summe, anzahl: e.anzahl, monate: e.monate.size, letzte: e.letzte }))
    .sort((a, b) => b.summe - a.summe);
}

// ------------------------------------------------------------ Kategorien: wie oft

export interface Kategorienutzung {
  readonly kategorieId?: string;
  readonly name: string;
  readonly anzahl: number;
  /** Positiv, siehe Vorzeichen-Regel. */
  readonly summe: Cent;
  /** Summe ÷ Anzahl — was ein einzelner Posten dieser Kategorie typischerweise kostet. */
  readonly schnitt: Cent;
  /** Der grösste Einzelposten, positiv. */
  readonly groesster: Cent;
  /** In wie vielen verschiedenen Monaten sie überhaupt vorkam. */
  readonly monate: number;
  readonly letzte: string;
}

/**
 * Nicht „wie viel", sondern „wie oft und wie schwer".
 *
 * Die Aufschlüsselung daneben sortiert nach Summe und zeigt damit immer dieselben drei
 * Kategorien oben. Diese Sicht trennt die zwei Arten, auf die eine Kategorie gross wird:
 * **selten und teuer** (ein Posten im Jahr, hoher Schnitt) oder **oft und klein** (der
 * tägliche Griff, niedriger Schnitt, viele Monate). Dagegen hilft Verschiedenes — das
 * eine plant man ein, das andere gewöhnt man sich ab.
 *
 * Gezählt wird über die ANTEILE: eine geteilte Buchung ist in jeder ihrer Kategorien ein
 * Posten, und ihr Betrag verteilt sich. Sonst zählte ein Wocheneinkauf, der auf drei
 * Kategorien aufgeteilt ist, dreimal mit vollem Betrag.
 */
export function kategorienutzung(
  buchungen: readonly IstBuchung[],
  kategorien: readonly Kategorie[],
  von: string,
  bis: string,
): Kategorienutzung[] {
  const byId = new Map(kategorien.map((k) => [k.id, k]));
  const map = new Map<
    string,
    { id?: string; summe: Cent; anzahl: number; groesster: Cent; monate: Set<string>; letzte: string }
  >();

  for (const b of imFenster(buchungen, von, bis)) {
    for (const a of kategorieAnteile(b)) {
      if (a.betrag > 0) continue;
      const key = a.kategorieId ?? "__ohne__";
      const e =
        map.get(key) ??
        { id: a.kategorieId, summe: 0, anzahl: 0, groesster: 0, monate: new Set<string>(), letzte: b.datum };
      e.summe -= a.betrag;
      e.anzahl++;
      e.groesster = Math.max(e.groesster, -a.betrag);
      e.monate.add(monat(b.datum));
      if (b.datum > e.letzte) e.letzte = b.datum;
      map.set(key, e);
    }
  }

  return [...map.values()]
    .map((e): Kategorienutzung => ({
      kategorieId: e.id,
      name: (e.id && byId.get(e.id)?.name) || "—",
      anzahl: e.anzahl,
      summe: e.summe,
      schnitt: Math.round(e.summe / e.anzahl),
      groesster: e.groesster,
      monate: e.monate.size,
      letzte: e.letzte,
    }))
    .sort((a, b) => b.anzahl - a.anzahl || b.summe - a.summe);
}

// ------------------------------------------------------------------ Ausreisser

export interface Grossposten {
  readonly buchung: IstBuchung;
  /** Positiv. */
  readonly betrag: Cent;
  /** Das Wievielfache des Monatsschnitts der Ausgaben. */
  readonly vielfaches?: number;
}

/**
 * Die grössten Einzelabflüsse des Zeitraums.
 *
 * Die billigste Auswertung von allen und regelmässig die mit dem grössten Ertrag: was
 * einen Monat gekippt hat, steht hier in der ersten Zeile. Das `vielfaches` setzt sie ins
 * Verhältnis — 4.000 Euro sind bei einem Monatsschnitt von 1.000 etwas anderes als bei
 * 20.000.
 */
export function groessteposten(
  buchungen: readonly IstBuchung[],
  von: string,
  bis: string,
  ausgabenJeMonat: Cent,
): Grossposten[] {
  return imFenster(buchungen, von, bis)
    .filter((b) => b.betrag < 0)
    .map((b) => ({
      buchung: b,
      betrag: -b.betrag,
      vielfaches: ausgabenJeMonat > 0 ? -b.betrag / ausgabenJeMonat : undefined,
    }))
    .sort((a, b) => b.betrag - a.betrag);
}

// ------------------------------------------------------------------- Budgets

export interface Budgettreue {
  readonly budgetId: string;
  readonly name: string;
  /** Summe der Rahmen aller Monate im Fenster, positiv. */
  readonly rahmen: Cent;
  /** Summe der Verbräuche, positiv (eine Erstattung senkt sie). */
  readonly verbraucht: Cent;
  /** In wie vielen Monaten der Rahmen gehalten hat. */
  readonly gehalten: number;
  readonly monate: number;
  /** Der schlechteste Monat: wie weit er über den Rahmen ging. 0 = nie überzogen. */
  readonly schlimmste: Cent;
}

/**
 * Hält der Plan? — Monat für Monat, nicht über den ganzen Zeitraum aufsummiert.
 *
 * **Der Grund für die monatsweise Zählung ist der eigentliche Befund.** Ein Budget, das
 * im Jahr genau aufgeht, kann in sechs Monaten überzogen und in sechs unterschritten
 * worden sein — die Jahressumme sagt „passt", und gestimmt hat es in keinem einzigen
 * Monat. `gehalten` von 12 zählt die Monate, in denen der Rahmen wirklich reichte, und
 * `schlimmste` nennt den Ausschlag, den die Summe verschluckt.
 *
 * Gerechnet wird über `budgetStand`-Bausteine (Rahmen und Verbrauch), damit hier keine
 * zweite Auswahlregel entsteht: welche Buchung auf welches Budget zählt, entscheidet
 * `budgetBuchungen` und sonst niemand.
 */
export function budgettreue(
  budgets: readonly { id: string; name: string }[],
  /**
   * Rahmen und Verbrauch dieses Budgets zum genannten Monat.
   *
   * Als Rückruf und nicht als Rechnung hier drin, weil die beiden Budget-ARTEN
   * verschiedene Fragen stellen und die Antwort schon im Bereich steht: ein
   * monatliches Budget wird jeden Monat zurückgesetzt und gegen SEINEN Monat gemessen,
   * ein aufbauendes trägt seinen Rest weiter und wird gegen alles seit dem Start
   * gemessen. `budgetStand` kennt den Unterschied (`verbrauchsFenster`); hier noch
   * einmal zu entscheiden, was ein Monat bedeutet, wären zwei Stellen mit derselben
   * Regel.
   */
  standIm: (budgetId: string, monat: string) => { rahmen: Cent; verbraucht: Cent },
  von: string,
  bis: string,
): Budgettreue[] {
  const monate: string[] = [];
  let cursor = { ...parseIso(von), d: 1 };
  const bisM = monat(bis);
  while (monat(toIso(cursor)) <= bisM) {
    monate.push(monat(toIso(cursor)));
    cursor = addMonate(cursor, 1);
  }

  return budgets.map((b) => {
    let rahmen = 0;
    let verbraucht = 0;
    let gehalten = 0;
    let schlimmste = 0;
    for (const m of monate) {
      const { rahmen: r, verbraucht: v } = standIm(b.id, m);
      rahmen += r;
      verbraucht += v;
      // Ein Monat ohne Rahmen zählt nicht als gehalten und nicht als gerissen: vor dem
      // ersten Budgetmonat gab es keinen Plan, gegen den etwas hätte verstossen können.
      if (r <= 0) continue;
      if (v <= r) gehalten++;
      else schlimmste = Math.max(schlimmste, v - r);
    }
    return { budgetId: b.id, name: b.name, rahmen, verbraucht, gehalten, monate: monate.length, schlimmste };
  });
}

export interface BlinderFleck {
  readonly kategorieId?: string;
  readonly name: string;
  /** Positiv. */
  readonly summe: Cent;
  /** Anteil an allen Ausgaben des Zeitraums (0,12 = 12 %). */
  readonly anteil: number;
}

/**
 * Ausgaben in Kategorien, die von keinem Budget erfasst sind.
 *
 * **Die wichtigste Auswertung im Budget-Block, und die einzige, die von selbst nie
 * auffällt.** Wer auf seine Budgets schaut, sieht ausschliesslich das, was er schon
 * geplant hat; was daneben abfliesst, kommt in keiner Budgetzeile vor. Ein Haushalt kann
 * jedes Budget einhalten und trotzdem im Minus landen — dann liegt das Geld genau hier.
 *
 * Nicht budgetiert heisst dabei ausdrücklich NICHT „falsch": Vertragsraten stehen
 * bewusst ausserhalb der Budgets (sie sind anderswo geplant, siehe `budgetBuchungen`),
 * und sie sind deshalb hier auch nicht mitzuzählen. Übrig bleibt, was weder geplant noch
 * vertraglich gebunden ist.
 */
export function blindeFlecken(
  buchungen: readonly IstBuchung[],
  budgetierteKategorien: ReadonlySet<string>,
  vertragsBuchungen: ReadonlySet<string>,
  kategorien: readonly Kategorie[],
  von: string,
  bis: string,
): BlinderFleck[] {
  const byId = new Map(kategorien.map((k) => [k.id, k]));
  const map = new Map<string, { id?: string; summe: Cent }>();
  let gesamt = 0;

  for (const b of imFenster(buchungen, von, bis)) {
    if (b.charakter !== "Aufwand") continue;
    for (const a of kategorieAnteile(b)) {
      if (a.betrag > 0) continue;
      gesamt -= a.betrag;
      if (vertragsBuchungen.has(b.id)) continue;
      if (a.kategorieId && budgetierteKategorien.has(a.kategorieId)) continue;
      const key = a.kategorieId ?? "__ohne__";
      const e = map.get(key) ?? { id: a.kategorieId, summe: 0 };
      e.summe -= a.betrag;
      map.set(key, e);
    }
  }

  return [...map.values()]
    .filter((e) => e.summe > 0)
    .map((e): BlinderFleck => ({
      kategorieId: e.id,
      name: (e.id && byId.get(e.id)?.name) || "—",
      summe: e.summe,
      anteil: gesamt > 0 ? e.summe / gesamt : 0,
    }))
    .sort((a, b) => b.summe - a.summe);
}

// ------------------------------------------------------------------ Verträge

export interface Vertragstreue {
  readonly vertragId: string;
  readonly anbieter: string;
  /** Was laut Zahlungsregel im Fenster hätte fliessen sollen, positiv. `undefined` = keine Regel. */
  readonly soll?: Cent;
  /** Was tatsächlich zugeordnet wurde, positiv. */
  readonly ist: Cent;
  readonly anzahl: number;
  /** Kleinste und grösste Einzelzahlung — die Spanne, die eine feste Rate nicht kennt. */
  readonly kleinste: Cent;
  readonly groesste: Cent;
  /** Name der Kategorie, in der die Zahlungen liegen. Mehrere = die Zuordnung streut. */
  readonly kategorien: readonly string[];
}

/**
 * Soll gegen Ist je Vertrag — und die Spanne, die dazwischen liegt.
 *
 * Drei Befunde stecken darin, und alle drei sind ohne diese Sicht unsichtbar:
 *
 * - **Ein Vertrag, dessen Ist deutlich unter dem Soll liegt**, hat Zahlungen, die ihm
 *   nicht zugeordnet wurden — die Erkennung greift zu eng. Das ist kein Sparerfolg.
 * - **Eine grosse Spanne zwischen kleinster und grösster Zahlung** heisst, dass die
 *   einzelne Rate im Vertrag eine Fiktion ist (Verbrauchsabrechnung, Fremdwährung). Die
 *   daraus abgeleitete Erkennungsspanne trifft dann fast nie.
 * - **Mehr als eine Kategorie** bedeutet, dass dieselbe Zahlung mal hier und mal dort
 *   landet — jede Auswertung nach Kategorien wird dadurch unscharf.
 */
export function vertragstreue(
  vertraege: readonly { id: string; anbieter: string }[],
  buchungen: readonly IstBuchung[],
  vertragVon: (b: IstBuchung) => string | undefined,
  sollVon: (vertragId: string) => Cent | undefined,
  kategorieName: (id: string) => string | undefined,
  von: string,
  bis: string,
): Vertragstreue[] {
  const je = new Map<string, { ist: Cent; anzahl: number; kleinste: Cent; groesste: Cent; kategorien: Set<string> }>();
  for (const b of imFenster(buchungen, von, bis)) {
    const id = vertragVon(b);
    if (!id || b.betrag > 0) continue;
    const e = je.get(id) ?? { ist: 0, anzahl: 0, kleinste: Infinity, groesste: 0, kategorien: new Set<string>() };
    const betrag = -b.betrag;
    e.ist += betrag;
    e.anzahl++;
    e.kleinste = Math.min(e.kleinste, betrag);
    e.groesste = Math.max(e.groesste, betrag);
    const kat = b.kategorieId ? kategorieName(b.kategorieId) : undefined;
    if (kat) e.kategorien.add(kat);
    je.set(id, e);
  }

  return vertraege
    .map((v): Vertragstreue => {
      const e = je.get(v.id);
      return {
        vertragId: v.id,
        anbieter: v.anbieter,
        soll: sollVon(v.id),
        ist: e?.ist ?? 0,
        anzahl: e?.anzahl ?? 0,
        kleinste: e && e.kleinste !== Infinity ? e.kleinste : 0,
        groesste: e?.groesste ?? 0,
        kategorien: e ? [...e.kategorien].sort() : [],
      };
    })
    .sort((a, b) => b.ist - a.ist);
}

// ------------------------------------------------------------ Blick nach vorn

/**
 * Was ein geplanter Monat für den KONTOSTAND bedeutet — Zufluss und Abfluss getrennt.
 *
 * Der Monatsausblick rechnet mehr zusammen, als ein Saldo tragen darf, und die Auswahl
 * hier ist die eigentliche Entscheidung dieser Funktion:
 *
 * | Zeile | zählt | warum |
 * |---|---|---|
 * | `einnahmen` | ja | Geld kommt an |
 * | `vertraege` | ja | Geld geht weg |
 * | `budgets` | ja | Geld geht weg |
 * | `sonstiges` | ja | Geld geht weg |
 * | `ruecklagen` | **nein** | kalkulatorisch — sie werden NIE gebucht |
 * | `umschichtung` | **nein** | wechselt das Konto, verlässt den Bestand nicht |
 *
 * Die Rücklage aus dem Inventar ist die wichtigere der beiden Ausnahmen: sie sagt, was
 * man zurücklegen SOLLTE, und kein Euro davon verlässt das Konto. Sie in eine
 * Saldo-Vorschau zu nehmen hiesse, jeden Monat eine Abbuchung zu erfinden, die nie
 * kommt — der vorhergesagte Stand liefe immer weiter unter den echten.
 */
export const SALDOWIRKSAME_ZEILEN = ["einnahmen", "vertraege", "budgets", "sonstiges"] as const;

export function planWirkung(zeilen: readonly { id: string; plan: Cent }[]): {
  einnahmen: Cent;
  ausgaben: Cent;
  netto: Cent;
} {
  let einnahmen = 0;
  let ausgaben = 0;
  for (const z of zeilen) {
    if (!(SALDOWIRKSAME_ZEILEN as readonly string[]).includes(z.id)) continue;
    if (z.plan > 0) einnahmen += z.plan;
    else ausgaben += z.plan;
  }
  return { einnahmen, ausgaben, netto: einnahmen + ausgaben };
}
