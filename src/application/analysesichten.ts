// Analyse-Sichten — Monatsverlauf, Aufschlüsselung nach Kategorien, Einzelbuchungen.
//
// Anders geschnitten als die Übersicht, weil der Bereich INTERAKTIV ist: Zeitraum,
// gewählter Monat und Ebene ändern sich, ohne dass sich die Daten ändern. Ein Ladevorgang
// pro Klick wäre nicht nur langsam, er würde auch gegen einen inzwischen anderen Bestand
// rechnen als die Kennzahl daneben.
//
// Deshalb zwei Sorten Funktion: `analyseLaden` holt EINMAL alles, und die reinen
// `analyse…`-Funktionen rechnen daraus die jeweilige Sicht. Die Oberfläche fasst dabei
// nichts aus `core/` an — sie kennt weder `istMonatsverlauf` noch `kategorieAggregat`
// und kann deshalb auch nicht versehentlich eine andere Buchungsmenge hineinreichen als
// die Nachbarzahl.

import { belegZuBuchung } from "./buchung/belegZuBuchung";
import { buchungszeile, type Buchungszeile, type Zeilenkontext } from "./buchung/buchungszeile";
import {
  addMonate,
  addTage,
  istLiquide,
  liquiditaetsvorschau,
  type Verlaufsbefund,
  type Vormerkung,
  ergebnisbasis,
  hatGeschichte,
  type Ruecklagenzyklus,
  ergebnisKennzahlen,
  KOSTENZEILEN,
  monatsErgebnis,
  monatsKosten,
  ruecklagenrateFehlt,
  zeilenIst,
  type ErgebnisKennzahlen,
  type ErgebnisVorsorge,
  type KostenZeileId,
  type Ruecklage,
  blindeFlecken,
  budgetKategorien,
  budgetStand,
  budgettreue,
  empfaengerRangliste,
  festUndFrei,
  groessteposten,
  kategorienutzung,
  kennzahlen,
  monatsAusblicke,
  planWirkung,
  tiefstandImMonat,
  projiziereRegel,
  vertragstreue,
  betragInKategorie,
  buchungenDerKategorie,
  fruehesterMonat,
  istInterneUmbuchung,
  istMonatsverlauf,
  kategorieAggregat,
  kategorieReihen,
  monateImFenster,
  nachHauptgruppe,
  parseIso,
  tageImMonat,
  toIso,
  type BlinderFleck,
  type Budget,
  type BudgetSicht,
  type Budgettreue,
  type Cent,
  type Empfaengerzeile,
  type Grossposten,
  type GruppenSumme,
  type IstBuchung,
  type Kategorienutzung,
  type Kennzahlen,
  type MonatFestFrei,
  type Vertrag,
  type Vertragstreue,
  type Zahlungsregel,
  type Kategorie,
  type KategorieSumme,
  type KategorieReihe,
  type MonatsIst,
  type Zahlungskonto,
  bilanzJeKlasse,
  staendeJeKlasse,
  reichweite,
  reichweitenMonate,
  REICHWEITE_MINDESTENS,
  type Reichweite,
} from "../core";
import { belegungssicht } from "./konten/kontobelegung";
import type { Umsatz } from "./import";
import { vertragsbindungLaden } from "./vertraege/vertragszuordnung";
import { ergebnisvorsorgeLaden, type VorsorgeDeps } from "./vorsorge/vorsorge";
import type {
  BudgetRepository,
  KategorieRepository,
  LedgerPort,
  RuecklagenRepository,
  UmsatzRepository,
  VertragRepository,
  VertragszuordnungRepository,
  VormerkungRepository,
  ZahlungskontoRepository,
  ZahlungsregelRepository,
} from "./ports";

/** Wie weit zurück ausgewertet wird. */
export type Zeitraum = "12" | "24" | "jahr" | "alles";

export interface AnalyseDeps {
  readonly ledger: LedgerPort;
  readonly kontoRepo: ZahlungskontoRepository;
  readonly kategorieRepo: KategorieRepository;
  readonly umsatzRepo: UmsatzRepository;
  /** Für die Vertragsmarkierung in den aufgeklappten Zeilen. */
  readonly zuordnungRepo: VertragszuordnungRepository;
  readonly vertragRepo: VertragRepository;
  /** Für die Befunde: hält der Plan, und was steht ausserhalb von ihm? */
  readonly budgetRepo: BudgetRepository;
  readonly regelRepo: ZahlungsregelRepository;
  /** Für die Kostensicht: Rücklagen kosten ihre Rate, und ihre Ausbuchungen begrenzen den Rückblick. */
  readonly ruecklagenRepo: RuecklagenRepository;
  /** Für „Reicht das Geld?": was die Bank schon kennt, ist vom Stand faktisch weg. */
  readonly vormerkungRepo: VormerkungRepository;
  /** Für die Kostensicht: mit Vorsorgeziel kostet ein Monat dessen Rate, nicht die Überweisung. */
  readonly vorsorge: VorsorgeDeps;
}

export interface Analysebasis {
  readonly buchungen: readonly IstBuchung[];
  readonly konten: readonly Zahlungskonto[];
  readonly kategorien: readonly Kategorie[];
  readonly kontoNamen: ReadonlyMap<string, string>;
  /** Buchungs-ID → Umsatz: Empfänger und Verwendungszweck stehen dort, nicht an der Buchung. */
  readonly umsatzZuBuchung: ReadonlyMap<string, Umsatz>;
  /** Buchungs-ID → Anbieter des Vertrags, zu dem sie gehört. */
  readonly vertragsnamen: ReadonlyMap<string, string>;
  /** Dieselbe Menge mit dem Schlüssel statt dem Namen — für die Auswertung je Vertrag. */
  readonly vertragZuBuchung: ReadonlyMap<string, string>;
  readonly budgets: readonly Budget[];
  readonly vertraege: readonly Vertrag[];
  readonly regeln: readonly Zahlungsregel[];
  readonly ruecklagen: readonly Ruecklage[];
  /**
   * Die Tage aller Ausbuchungen — auch von Rücklagen, die es nicht mehr gibt. Nur die
   * Daten, weil die Kostensicht nur eines daraus liest: vor welchem Monat ihr eine Rate
   * fehlt (`ruecklagenrateFehlt`).
   */
  readonly ausbuchungsdaten: readonly string[];
  /** Die Ausbuchungen selbst — aus ihnen kommen die Raten vergangener Zyklen. */
  readonly ausbuchungen: readonly Ruecklagenzyklus[];
  /**
   * Buchungs-ID → Vertrags-ID, so wie die ERGEBNISRECHNUNG sie liest: jede Zuordnung mit
   * Vertrag, auch wenn der Vertrag dahinter fehlt.
   *
   * Das ist nicht `vertragZuBuchung` (oben), und der Unterschied ist Absicht: jene Karte
   * übergeht Verweise ins Leere, weil sie Namen zeigt. Diese ist dieselbe, die die
   * Übersicht ihrer Ergebnisrechnung gibt (`uebersichtLaden`) — derselbe Monat muss in
   * Übersicht und Analyse dieselbe Zahl tragen, und mit zwei Lesarten der Zuordnung täte
   * er es bei einem einzigen verwaisten Verweis nicht mehr.
   */
  readonly vertragJeBuchung: ReadonlyMap<string, string>;
  /** Was die Bank kennt und noch nicht gebucht hat — der Startpunkt der Liquiditätsvorschau. */
  readonly vormerkungen: readonly Vormerkung[];
  /**
   * Das Vorsorgeziel für die Kostensicht, `undefined` ohne Ziel — dieselbe Angabe, die
   * die Übersicht ihrer Ergebnisrechnung gibt, damit derselbe Monat dort und hier
   * dieselbe Zahl trägt.
   */
  readonly vorsorge?: ErgebnisVorsorge;
}

export async function analyseLaden(deps: AnalyseDeps): Promise<Analysebasis> {
  const [buchungen, konten, kategorien, umsaetze, bindung, budgets, vertraege, regeln, ruecklagen, ausbuchungen, zuordnungen, vormerkungen, vorsorge] =
    await Promise.all([
      deps.ledger.alle(),
      deps.kontoRepo.alle(),
      deps.kategorieRepo.alle(),
      deps.umsatzRepo.alle(),
      vertragsbindungLaden(deps.zuordnungRepo, deps.vertragRepo),
      deps.budgetRepo.alle(),
      deps.vertragRepo.alle(),
      deps.regelRepo.alle(),
      deps.ruecklagenRepo.alle(),
      deps.ruecklagenRepo.ausbuchungen(),
      deps.zuordnungRepo.alle(),
      deps.vormerkungRepo.alle(),
      ergebnisvorsorgeLaden(deps.vorsorge),
    ]);
  const umsatzZuBuchung = belegZuBuchung(umsaetze);
  const vertragJeBuchung = new Map<string, string>();
  for (const z of zuordnungen) if (z.vertragId) vertragJeBuchung.set(z.istbuchungId, z.vertragId);
  return {
    buchungen,
    konten,
    kategorien,
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    umsatzZuBuchung,
    vertragsnamen: bindung.namen,
    vertragZuBuchung: bindung.vertragIds,
    budgets,
    vertraege,
    regeln,
    ruecklagen,
    // Nur Ausbuchungen OHNE festgehaltenen Zyklus lassen Monate unvollständig: seit
    // Migration 76 kennt jede neue ihre Geschichte, und die Rate davor wird gerechnet.
    ausbuchungsdaten: ausbuchungen.filter((a) => !hatGeschichte(a)).map((a) => a.datum),
    ausbuchungen,
    vertragJeBuchung,
    vormerkungen,
    vorsorge,
  };
}

/** Das Fenster [von, bis] eines Zeitraums, bezogen auf den laufenden Monat. */
export function analyseFenster(
  basis: Analysebasis,
  zeitraum: Zeitraum,
  heute: string,
): { von: string; bis: string } {
  const bisYmd = { ...parseIso(heute), d: 1 };
  const bis = toIso(bisYmd);
  if (zeitraum === "jahr") return { von: `${bisYmd.y}-01-01`, bis };
  if (zeitraum === "alles") return { von: fruehesterMonat(basis.buchungen) ?? bis, bis };
  return { von: toIso(addMonate(bisYmd, zeitraum === "24" ? -23 : -11)), bis };
}

/**
 * Dasselbe Fenster, aber TAGGENAU zu Ende gedacht.
 *
 * `analyseFenster` liefert Monatsmarken: `bis` ist der ERSTE des laufenden Monats, weil
 * der Monatsverlauf in Monaten rechnet und jeden Monat an seinem Ersten benennt. Für
 * alles, was an einzelnen TAGEN hängt, ist diese Marke die falsche Grenze — sie schneidet
 * den halben laufenden Monat weg.
 *
 * Genau daran ging der Depot-Verlauf leer aus: seine Stichtage sind Abruftage, liegen
 * also mitten im Monat und damit hinter dem Ersten. Die Analyse meldete „zu wenig
 * Punkte", während die Stände vollzählig in der Datenbank standen — ein Fehler, der wie
 * verlorene Daten aussieht und keine sind.
 *
 * Deshalb hier der LETZTE Tag desselben Monats: das Fenster meint den ganzen Monat, und
 * bei einem laufenden Monat schliesst das jeden Tag ein, der schon vergangen ist.
 */
export function analyseFensterTaggenau(bis: string): string {
  const { y, m } = parseIso(bis);
  return toIso({ y, m, d: tageImMonat(y, m) });
}

export function analyseVerlauf(basis: Analysebasis, von: string, bis: string): MonatsIst[] {
  return istMonatsverlauf(basis.konten, basis.buchungen, von, bis);
}

/**
 * Aufschlüsselung nach Kategorien im Fenster.
 *
 * Interne Umbuchungen bleiben draußen — sie verschieben Geld zwischen eigenen Konten und
 * wären in einer Ausgaben-Aufstellung eine Ausgabe, die es nie gab.
 */
export function analyseAufschluesselung(
  basis: Analysebasis,
  von: string,
  bis: string,
): KategorieSumme[] {
  const relevant = basis.buchungen.filter((b) => !istInterneUmbuchung(b));
  return kategorieAggregat(relevant, von, bis, basis.kategorien);
}

/** Die Kategorien eines Fensters Monat für Monat — das Register „Kategorien". */
export interface Kategorienreihen {
  /** „YYYY-MM", in der Reihenfolge der Spalten in `zeilen[].monate`. */
  readonly monate: readonly string[];
  readonly zeilen: readonly KategorieReihe[];
}

/**
 * Wie `analyseAufschluesselung`, aber über die Zeit statt als eine Summe — und mit
 * denselben Ausschlüssen: interne Umbuchungen bleiben draussen.
 *
 * Der Trend endet beim VORMONAT von heute: der laufende Monat ist halb gebucht und
 * drückte jeden Vergleich nach unten (siehe `kategorieReihen`).
 */
export function analyseKategorienreihen(
  basis: Analysebasis,
  von: string,
  bis: string,
  heute: string,
  nachGruppe = false,
): Kategorienreihen {
  const start = { ...parseIso(von), d: 1 };
  const monate = Array.from({ length: monateImFenster(von, bis) }, (_, i) => toIso(addMonate(start, i)).slice(0, 7));
  const vormonat = toIso(addMonate({ ...parseIso(heute), d: 1 }, -1)).slice(0, 7);
  const relevant = basis.buchungen.filter((b) => !istInterneUmbuchung(b));
  return {
    monate,
    zeilen: kategorieReihen(relevant, basis.kategorien, monate, { abgeschlossenBis: vormonat, nachGruppe }),
  };
}

/** Dieselbe Aufschlüsselung, zu Hauptgruppen gebündelt. */
export function analyseGruppen(basis: Analysebasis, items: readonly KategorieSumme[]): GruppenSumme[] {
  return nachHauptgruppe(items, basis.kategorien);
}

/**
 * Die Buchungen einer aufgeklappten Kategorie — als `Buchungszeile`, dieselbe Form wie
 * unter einem Budget. Der Betrag ist der, mit dem die Buchung auf DIESE Kategorie wirkt:
 * bei einer geteilten Buchung ihr Teil, sonst der volle. Die Liste steht unter einem
 * Aggregat, das über `kategorieAnteile` rechnet; zeigte sie den Gesamtbetrag, summierten
 * sich ihre Zeilen nicht auf die Zahl darüber.
 */
export function analyseBuchungen(
  basis: Analysebasis,
  kategorieId: string,
  von: string,
  bis: string,
): Buchungszeile[] {
  const kontext: Zeilenkontext = {
    umsatzZuBuchung: basis.umsatzZuBuchung,
    kontoNamen: basis.kontoNamen,
    kategorieNamen: new Map(basis.kategorien.map((k) => [k.id, k.name])),
    vertragsnamen: basis.vertragsnamen,
  };
  return buchungenDerKategorie(basis.buchungen, kategorieId, von, bis).map((buchung) =>
    buchungszeile(buchung, betragInKategorie(buchung, kategorieId), kategorieId, kontext),
  );
}

/**
 * Die Befunde: was die Zahlen über den Zeitraum sagen, jenseits von „wie viel wohin".
 *
 * Alles in EINEM Rutsch gerechnet und nicht je Karte einzeln — aus demselben Grund, aus
 * dem `analyseLaden` einmal lädt: zwei Kennzahlen auf einem Bildschirm müssen dieselbe
 * Buchungsmenge meinen. Eine Karte, die sich ihre Menge selbst holt, rechnet früher oder
 * später gegen eine andere.
 */
export interface Befunde {
  readonly kennzahlen: Kennzahlen;
  readonly festFrei: readonly MonatFestFrei[];
  readonly empfaenger: readonly Empfaengerzeile[];
  readonly kategorien: readonly Kategorienutzung[];
  readonly budgets: readonly Budgettreue[];
  readonly blindeFlecken: readonly BlinderFleck[];
  readonly vertraege: readonly Vertragstreue[];
  readonly grossposten: readonly Grossposten[];
}

export function analyseBefunde(basis: Analysebasis, von: string, bis: string): Befunde {
  // Zu einem Vertrag gehört, was die Vertragszuordnung kennt — dieselbe Menge, die auch
  // die Budgets aussparen. Sie hier neu zu bestimmen hiesse, zwei Wahrheiten darüber zu
  // haben, was „vertraglich gebunden" ist.
  const vertragsBuchungen = new Set(basis.vertragsnamen.keys());
  const kategorieName = new Map(basis.kategorien.map((k) => [k.id, k.name]));

  const zahlen = kennzahlen(basis.buchungen, basis.konten, vertragsBuchungen, von, bis);

  const budgetierte = new Set<string>();
  for (const b of basis.budgets) {
    for (const id of budgetKategorien(b, basis.budgets, basis.kategorien)) budgetierte.add(id);
  }
  const sicht: BudgetSicht = {
    buchungen: basis.buchungen,
    kategorien: basis.kategorien,
    budgets: basis.budgets,
    vertragsBuchungen,
  };
  const budgetJeId = new Map(basis.budgets.map((b) => [b.id, b]));

  return {
    kennzahlen: zahlen,
    festFrei: festUndFrei(basis.buchungen, vertragsBuchungen, von, bis),
    empfaenger: empfaengerRangliste(
      basis.buchungen,
      // Der Empfänger steht am UMSATZ, nicht an der Buchung — von Hand erfasste Zeilen
      // haben stattdessen eine Notiz. Ohne beides bliebe eine ganze Sorte Buchung aus
      // der Rangliste, und zwar unsichtbar.
      (b) => basis.umsatzZuBuchung.get(b.id)?.gegenpartei ?? b.notiz ?? "",
      von,
      bis,
    ),
    kategorien: kategorienutzung(basis.buchungen, basis.kategorien, von, bis),
    budgets: budgettreue(
      // Ein Budget hat keinen eigenen Namen — es IST seine Kategorie. Der Name kommt
      // deshalb von dort, und ohne Kategorie bleibt der Strich stehen, statt eine
      // leere Zeile zu zeigen.
      basis.budgets.map((b) => ({ id: b.id, name: kategorieName.get(b.kategorieId) ?? "—" })),
      (id, monat) => {
        const budget = budgetJeId.get(id);
        if (!budget) return { rahmen: 0, verbraucht: 0 };
        const { rahmen, verbraucht } = budgetStand(sicht, budget, `${monat}-01`);
        return { rahmen, verbraucht };
      },
      von,
      bis,
    ),
    blindeFlecken: blindeFlecken(
      basis.buchungen,
      budgetierte,
      vertragsBuchungen,
      basis.kategorien,
      von,
      bis,
    ),
    vertraege: vertragstreue(
      basis.vertraege.map((v) => ({ id: v.id, anbieter: v.anbieter })),
      basis.buchungen,
      (b) => basis.vertragZuBuchung.get(b.id),
      (vertragId) => sollImFenster(basis.regeln, vertragId, von, bis),
      (id) => kategorieName.get(id),
      von,
      bis,
    ),
    grossposten: groessteposten(basis.buchungen, von, bis, zahlen.ausgabenJeMonat),
  };
}

/**
 * Was ein Vertrag im Fenster laut seiner Zahlungsregel hätte kosten sollen.
 *
 * Über die PROJEKTION und nicht „Rate mal Monate": ein Vertrag, der quartalsweise oder
 * jährlich zahlt, hätte sonst zwölf Raten im Jahresfenster. `projiziereRegel` kennt den
 * Rhythmus und liefert genau die Fälligkeiten, die in das Fenster fallen.
 *
 * Ohne Regel gibt es kein Soll — und `undefined` ist dann die ehrliche Antwort. Eine 0
 * hiesse „es sollte nichts fliessen", und daneben stünde ein Ist: der Vertrag sähe aus,
 * als koste er unerwartet Geld, obwohl nur die Planung fehlt.
 */
function sollImFenster(
  regeln: readonly Zahlungsregel[],
  vertragId: string,
  von: string,
  bis: string,
): Cent | undefined {
  const eigene = regeln.filter((r) => r.vertragId === vertragId);
  if (eigene.length === 0) return undefined;
  const monate = monateImFenster(von, bis);
  let soll = 0;
  for (const r of eigene) {
    for (const p of projiziereRegel(r, von, monate)) {
      if (p.betrag < 0) soll -= p.betrag;
    }
  }
  return soll;
}

/** Ein Monat im Verlauf — gewesen oder geplant. */
export interface Verlaufspunkt {
  /** „YYYY-MM". */
  readonly monat: string;
  /** Vorzeichenbehaftet, wie im Ist-Verlauf. */
  readonly einnahmen: Cent;
  readonly ausgaben: Cent;
  readonly netto: Cent;
  /** Stand am Monatsende — bei Planmonaten fortgeschrieben. */
  readonly saldo: Cent;
  /** true = projiziert, nicht gebucht. */
  readonly plan: boolean;
  /**
   * Nur an Planmonaten: der tiefste Stand INNERHALB des Monats und sein Tag
   * (`tiefstandImMonat`). Die Linie zeigt das Monatsende; wann es dazwischen eng wird,
   * steht hier.
   */
  readonly tiefstand?: Cent;
  readonly tiefstandAm?: string;
}

/**
 * Der Verlauf über die Gegenwart hinaus: `zurueck` abgeschlossene Monate als Ist, ab dem
 * laufenden Monat `voraus` Monate als Plan.
 *
 * **Die Naht liegt am Ende des VORMONATS** (seit 2026-11-11). Der laufende Monat ist
 * halb gebucht; als Ist zeigte er einen halben Monat — die Ausgaben bis heute, das Gehalt
 * vom Monatsende noch nicht —, und die Linie knickte genau dort ein, wo der Plan ansetzt.
 * Bis dahin gehörte er zum Ist; ein Tag lang stand er doppelt da (Stand heute plus
 * geplanter Rest), und auch das sprang. Ganz als Plan läuft die Linie durch.
 *
 * **Fortgeschrieben wird der Saldo der liquiden Konten**, weil der Ist-Verlauf genau den
 * liefert (`istMonatsverlauf` bildet seinen Sockel aus `liquideMittel`). Eine Vorschau,
 * die eine andere Bezugsgrösse fortschreibt als die Linie davor, hätte an der Naht einen
 * Sprung, den niemand erklären kann.
 *
 * Was ein Planmonat zum Saldo beiträgt, entscheidet `planWirkung` — Rücklagen und
 * Umschichtungen bleiben draussen (siehe dort). Die Rücklagen werden
 * hier deshalb gar nicht erst geladen.
 */
export function analyseAusblick(
  basis: Analysebasis,
  heute: string,
  zurueck: number,
  voraus: number,
): Verlaufspunkt[] {
  const jetzt = { ...parseIso(heute), d: 1 };
  const vormonat = addMonate(jetzt, -1);
  const von = toIso(addMonate(jetzt, -Math.max(1, zurueck)));
  const ist = zurueck > 0 ? istMonatsverlauf(basis.konten, basis.buchungen, von, toIso(vormonat)) : [];

  const punkte: Verlaufspunkt[] = ist.map((m) => ({
    monat: m.label,
    einnahmen: m.einnahmen,
    ausgaben: m.ausgaben,
    netto: m.netto,
    saldo: m.saldo,
    plan: false,
  }));

  const vertragsBuchungen = new Set(basis.vertragsnamen.keys());
  const ausblicke = monatsAusblicke(
    {
      regeln: basis.regeln,
      budgets: basis.budgets,
      ist: basis.buchungen,
      kategorien: basis.kategorien,
      vertragsBuchungen,
      heute,
    },
    Math.max(0, voraus),
  );

  // Der Sockel ist der Stand am Ende des Vormonats — auch wenn kein gewesener Monat
  // gezeigt wird; dann über ein Fenster genau dieses einen Monats.
  let saldo =
    punkte.length > 0
      ? punkte[punkte.length - 1].saldo
      : (istMonatsverlauf(basis.konten, basis.buchungen, toIso(vormonat), toIso(vormonat))[0]?.saldo ?? 0);
  for (const a of ausblicke) {
    const w = planWirkung(a.zeilen.map((z) => ({ id: z.id, plan: z.plan })));
    const tief = tiefstandImMonat(saldo, a.label, a.zeilen);
    saldo += w.netto;
    punkte.push({
      monat: a.label,
      einnahmen: w.einnahmen,
      ausgaben: w.ausgaben,
      netto: w.netto,
      saldo,
      plan: true,
      tiefstand: tief.tiefstand,
      tiefstandAm: tief.am,
    });
  }
  return punkte;
}

// ---------------------------------------------------------------- Kostensicht

/**
 * Die Eingabe der Ergebnisrechnung aus der Analysebasis — EINE Stelle für Kostensicht und
 * Reichweite. Dieselbe Eingabe wie die Monatskarten der Übersicht (`uebersichtLaden`):
 * derselbe Monat muss überall dieselben Kosten tragen.
 */
function kostenbasis(basis: Analysebasis, heute: string) {
  return ergebnisbasis({
    regeln: basis.regeln,
    budgets: basis.budgets,
    ruecklagen: basis.ruecklagen,
    ausbuchungen: basis.ausbuchungen,
    ist: basis.buchungen,
    kategorien: basis.kategorien,
    konten: basis.konten,
    vertragJeBuchung: basis.vertragJeBuchung,
    heute,
    // Mit Vorsorgeziel kostet der Monat dessen Sparrate — in Kostensicht UND Reichweite.
    vorsorge: basis.vorsorge,
  });
}
//
// Die zweite FRAGE des Verlaufs. `analyseVerlauf` oben sagt, wofür Geld vom Konto ging
// (Auszahlung); das hier sagt, was der Monat gekostet hat (Kosten). Die Begriffe stehen
// in `core/CLAUDE.md` unter „Auszahlung und Kosten" — jede Zahl gehört in genau eine der
// beiden Sichten, und deshalb sind es zwei Use-Cases und nicht einer mit Schalter.

/** Ein Monat der Kostensicht. */
export interface KostenMonat {
  /** „YYYY-MM". */
  readonly monat: string;
  /** Der laufende Monat: sein Ist ist ein Zwischenstand (siehe `analyseKostenverlauf`). */
  readonly laufend: boolean;
  readonly einnahmen: Cent;
  /**
   * Je Kostenart, POSITIV (die negierte Zeile). Kann in einem Monat mit Erstattungen
   * unter null fallen — das ist richtig und bleibt so stehen; wer daraus eine Fläche
   * zeichnet, muss selbst bei null abschneiden.
   */
  readonly kosten: Readonly<Record<KostenZeileId, Cent>>;
  readonly kostenGesamt: Cent;
  /** „Bleibt wirklich frei", vorzeichenbehaftet. */
  readonly ergebnis: Cent;
  /** Diesem Monat fehlt die Rate einer später ausgebuchten Rücklage (`ruecklagenrateFehlt`). */
  readonly ruecklagenUnvollstaendig: boolean;
}

export interface Kostenverlauf {
  /** Älteste zuerst, wie `analyseVerlauf`. */
  readonly monate: readonly KostenMonat[];
  /** Über die ABGESCHLOSSENEN Monate des Fensters. */
  readonly kennzahlen: ErgebnisKennzahlen;
  /** Trifft die Einschränkung mindestens einen gezeigten Monat? */
  readonly ruecklagenUnvollstaendig: boolean;
}

/**
 * Die Ergebnisrechnung je Monat des Fensters — „Was hat der Monat gekostet?".
 *
 * Gerechnet wird über ALLE Konten, mit derselben Eingabe wie die Monatskarten der
 * Übersicht (`uebersichtLaden`): der laufende Monat trägt hier dieselbe Zahl wie dort
 * unter „bisher". Die Ausgabensicht daneben rechnet über die liquiden Konten; das ist
 * kein Widerspruch, sondern der Unterschied der Fragen — Kosten hängen nicht daran, von
 * wo bezahlt wurde.
 *
 * **Der LAUFENDE Monat erscheint, zählt aber in keine Kennzahl.** Zwei Gründe, einer je
 * Hälfte der Entscheidung:
 *
 *   • Er ERSCHEINT, weil die Ausgabensicht ihn auch zeigt und die Übersicht ihn zeigt.
 *     Fehlte er hier, verlöre der Verlauf beim Wechsel der Frage einen Monat, und die
 *     Zahl aus der Übersicht wäre in der Analyse nicht wiederzufinden. Er ist markiert
 *     (`laufend`), weil sein Ist ein Zwischenstand ist.
 *   • Er ZÄHLT NICHT, weil er schief ist, und zwar in eine Richtung: Rücklagen und
 *     aufbauende Budgets stehen schon mit der vollen Monatsrate da, das Gehalt vom
 *     Monatsende aber noch nicht. Im Durchschnitt drückte er das Ergebnis, in den Quoten
 *     stünde eine ganze Rate gegen halbe Einnahmen. Dieselbe Überlegung wie bei
 *     `analyseAusblick`, wo er deshalb ganz als Plan läuft — nur ist die Antwort hier eine
 *     andere, weil ein Rückblick keinen Plan zeigt.
 *
 * **BEKANNTE GRENZE: ausgebuchte Rücklagen.** Eine Rücklage kennt ihren Stand nur für den
 * laufenden Zyklus (`sollRuecklage` ab `beginn`). Nach dem Ausbuchen beginnt sie neu oder
 * ist gelöscht — und die Monate DAVOR zeigen für sie keine Rate mehr, obwohl damals
 * zurückgelegt wurde. Deren Kosten stehen zu niedrig, ihr Ergebnis zu hoch. Die Sicht
 * rechnet das nicht schön, sie sagt es: `ruecklagenUnvollstaendig` je Monat und für das
 * Fenster, und die Oberfläche schreibt es offen neben die Zahlen. Beheben liesse es sich
 * nur mit einer Geschichte der Zyklen; die gibt es nicht.
 *
 * Künftige Monate kommen nicht vor: das Fenster endet beim laufenden Monat.
 */
export function analyseKostenverlauf(basis: Analysebasis, von: string, bis: string, heute: string): Kostenverlauf {
  const rechenbasis = kostenbasis(basis, heute);
  const start = { ...parseIso(von), d: 1 };
  const ergebnisse = Array.from({ length: monateImFenster(von, bis) }, (_, i) =>
    monatsErgebnis(rechenbasis, toIso(addMonate(start, i))),
  ).filter((m) => !m.zukunft);

  const monate = ergebnisse.map((m): KostenMonat => {
    const kosten = {} as Record<KostenZeileId, Cent>;
    for (const id of KOSTENZEILEN) kosten[id] = -zeilenIst(m, id) || 0;
    return {
      monat: m.label,
      laufend: m.laufend,
      einnahmen: zeilenIst(m, "einnahmen"),
      kosten,
      kostenGesamt: monatsKosten(m),
      ergebnis: m.ergebnis.ist ?? 0,
      ruecklagenUnvollstaendig: ruecklagenrateFehlt(m.label, basis.ausbuchungsdaten),
    };
  });

  return {
    monate,
    kennzahlen: ergebnisKennzahlen(ergebnisse.filter((m) => !m.laufend)),
    ruecklagenUnvollstaendig: monate.some((m) => m.ruecklagenUnvollstaendig),
  };
}

// ---------------------------------------------------------------- Reicht das Geld?

/**
 * Wie weit die Liquiditätsvorschau rechnet. Dieselbe Spanne wie die Vorschau der
 * Übersicht („Was noch kommt"): darüber hinaus trägt die erwartete Linie nicht mehr —
 * sie verteilt Budgets gleichmässig, und nach einem Quartal ist das Annahme auf Annahme.
 */
export const LIQUIDITAET_TAGE = 90;

/** Ein Konto in „Reicht das Geld?". */
export interface Liquiditaetszeile {
  readonly kontoId: string;
  readonly name: string;
  /** Der Stand heute, abzüglich dessen, was die Bank schon vorgemerkt hat. */
  readonly start: Cent;
  /** Nur datierte Verpflichtungen. */
  readonly fest: Verlaufsbefund;
  /** Dazu der Budgetrest, gleichmässig verteilt. */
  readonly erwartet: Verlaufsbefund;
}

export interface Liquiditaetssicht {
  /** Der letzte Tag des gerechneten Fensters — die Aussage gilt nur bis hierher. */
  readonly bis: string;
  readonly zeilen: readonly Liquiditaetszeile[];
}

/**
 * Die Liquiditätsvorschau je liquidem, aktivem Konto (`core/konten/liquiditaet.ts`).
 *
 * Sie stand bis 2026-11-08 als Warnkarte ganz oben in der Übersicht und war dort zu
 * laut. Hier ist sie eine Tabelle im Register „Ausblick" — und anders als die Karte
 * zeigt sie JEDES Konto, nicht nur die mit Handlungsbedarf: eine Tabelle, die nur
 * erscheint, wenn etwas brennt, wäre wieder die Warnkarte.
 *
 * **Nur liquide Konten.** Gefragt ist, ob das Geld für das reicht, was abgeht — und
 * abgebucht wird vom Girokonto, nicht vom Depotverrechnungskonto. Die alte Karte nahm
 * alle Konten, weil sie nur Ausnahmen zeigte; als vollständige Liste stünden Rücklagen-
 * und Vorsorgekonten hier Zeile für Zeile ohne Aussage. Stillgelegte filtert der Kern.
 *
 * **Was hier NICHT im Minus steht, läuft im gerechneten Fenster nicht ins Minus — mehr
 * ist nicht geprüft.** Die Oberfläche schreibt das offen daneben; `bis` kommt deshalb
 * mit heraus.
 */
export function analyseLiquiditaet(basis: Analysebasis, heute: string, tage = LIQUIDITAET_TAGE): Liquiditaetssicht {
  const vorschauen = liquiditaetsvorschau({
    konten: basis.konten.filter(istLiquide),
    buchungen: basis.buchungen,
    regeln: basis.regeln,
    // Dieselbe Budgetsicht wie überall: was einem Vertrag gehört, zählt in kein Budget —
    // sonst zöge die erwartete Linie eine Rate zweimal ab, einmal datiert und einmal
    // als Budgetverbrauch.
    budgetsicht: {
      buchungen: basis.buchungen,
      kategorien: basis.kategorien,
      budgets: basis.budgets,
      vertragsBuchungen: new Set(basis.vertragJeBuchung.keys()),
    },
    vormerkungen: basis.vormerkungen,
    heute,
    tage,
  });
  return {
    bis: toIso(addTage(parseIso(heute), tage)),
    zeilen: vorschauen.map((v) => ({
      kontoId: v.kontoId,
      name: basis.kontoNamen.get(v.kontoId) ?? v.kontoId,
      start: v.start,
      fest: v.fest,
      erwartet: v.erwartet,
    })),
  };
}

// ---------------------------------------------------------------- Wie lange reicht es?

export interface Reichweitensicht {
  /** `null`: zu wenige abgeschlossene Monate für eine Aussage (`REICHWEITE_MINDESTENS`). */
  readonly reichweite: Reichweite | null;
  /** Ab wie vielen abgeschlossenen Monaten es eine Aussage gibt — für den Satz, wenn nicht. */
  readonly mindestens: number;
  /**
   * Fehlt einem der gemittelten Monate die Rate einer später ausgebuchten Rücklage
   * (`ruecklagenrateFehlt`)? Dann stehen ALLE Kosten zu niedrig da und die zweite Zahl zu
   * hoch — dieselbe Grenze wie in der Kostensicht.
   */
  readonly ruecklagenUnvollstaendig: boolean;
}

/**
 * „Wie lange reicht es ohne Einnahmen?" — das freie Geld der liquiden Konten gegen die
 * durchschnittlichen Kosten eines Monats (`core/reichweite.ts`).
 *
 * **Der Zähler ist die Zahl aus „Was da ist"**, nicht eine eigene: dieselbe Belegung
 * (`belegungssicht`), dieselbe Summe je Klasse (`bilanzJeKlasse`), die Klasse `liquide`.
 * Stillgelegte Konten zählen deshalb mit wie dort — Restgeld auf einer aufgegebenen Kasse
 * ist da. Und wie dort zählt ein Konto im Minus mit 0, nicht mit seinem Minus: die
 * Belegung rechnet je Konto, und was fehlt, steht in `fehlt`, nicht in `frei`.
 *
 * **Der Nenner hängt an keinem Zeitraum des Screens**, wie alles im Ausblick: gemittelt
 * wird über die letzten abgeschlossenen Monate (`reichweitenMonate`), höchstens
 * `REICHWEITE_MONATE`. Ein Jahr, weil Ungeplantes jahreszeitlich schwankt und ein Jahr
 * jede Jahreszeit einmal enthält; Verträge sind ohnehin periodisiert.
 *
 * Ohne liquides Konto gibt es nichts, womit man auskäme: `null`, und die Karte entfällt.
 */
export function analyseReichweite(basis: Analysebasis, heute: string): Reichweitensicht | null {
  if (!basis.konten.some(istLiquide)) return null;

  const belegung = belegungssicht(
    {
      konten: basis.konten,
      buchungen: [...basis.buchungen],
      ruecklagen: basis.ruecklagen,
      sicht: {
        buchungen: [...basis.buchungen],
        kategorien: basis.kategorien,
        budgets: basis.budgets,
        vertragsBuchungen: new Set(basis.vertragJeBuchung.keys()),
      },
    },
    heute,
  );
  const frei = bilanzJeKlasse(staendeJeKlasse(basis.konten, basis.buchungen), belegung.jeKonto).find((k) => k.klasse === "liquide")?.frei ?? 0;

  const rechenbasis = kostenbasis(basis, heute);
  const monate = reichweitenMonate(heute, basis.buchungen);
  const r = reichweite(frei, monate.map((m) => monatsErgebnis(rechenbasis, m)));

  return {
    reichweite: r,
    mindestens: REICHWEITE_MINDESTENS,
    ruecklagenUnvollstaendig: !!r && monate.some((m) => ruecklagenrateFehlt(m.slice(0, 7), basis.ausbuchungsdaten)),
  };
}

