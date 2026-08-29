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

import {
  addMonate,
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
  projiziereRegel,
  vertragstreue,
  betragInKategorie,
  buchungenDerKategorie,
  fruehesterMonat,
  istInterneUmbuchung,
  istMonatsverlauf,
  kategorieAggregat,
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
  type MonatsIst,
  type Zahlungskonto,
} from "../core";
import type { Umsatz } from "./import";
import { vertragsbindungLaden } from "./vertraege/vertragszuordnung";
import type {
  BudgetRepository,
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  VertragRepository,
  VertragszuordnungRepository,
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
}

export async function analyseLaden(deps: AnalyseDeps): Promise<Analysebasis> {
  const [buchungen, konten, kategorien, umsaetze, bindung, budgets, vertraege, regeln] =
    await Promise.all([
      deps.ledger.alle(),
      deps.kontoRepo.alle(),
      deps.kategorieRepo.alle(),
      deps.umsatzRepo.alle(),
      vertragsbindungLaden(deps.zuordnungRepo, deps.vertragRepo),
      deps.budgetRepo.alle(),
      deps.vertragRepo.alle(),
      deps.regelRepo.alle(),
    ]);
  const umsatzZuBuchung = new Map<string, Umsatz>();
  for (const u of umsaetze) if (u.istbuchungId) umsatzZuBuchung.set(u.istbuchungId, u);
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

/** Dieselbe Aufschlüsselung, zu Hauptgruppen gebündelt. */
export function analyseGruppen(basis: Analysebasis, items: readonly KategorieSumme[]): GruppenSumme[] {
  return nachHauptgruppe(items, basis.kategorien);
}

/** Eine Zeile der aufgeklappten Kategorie — schon mit dem, was am Umsatz hängt. */
export interface Analysezeile {
  readonly buchung: IstBuchung;
  /**
   * Der Betrag, mit dem diese Buchung auf DIESE Kategorie wirkt.
   *
   * Bei einer geteilten Buchung ihr Teil, sonst der volle Betrag — und deshalb nicht
   * dasselbe wie `buchung.betrag`. Die Liste steht unter einem Aggregat, das über
   * `kategorieAnteile` rechnet; zeigte sie den Gesamtbetrag, summierten sich ihre Zeilen
   * nicht auf die Zahl darüber, und der Wocheneinkauf stünde unter „Drogerie" mit dem
   * Betrag, den er insgesamt gekostet hat.
   */
  readonly betrag: Cent;
  readonly empfaenger: string;
  readonly verwendungszweck: string;
  readonly kontoName: string;
  /** Der Vertrag, zu dem die Buchung gehört — als Anbietername. Fehlt, wenn keiner. */
  readonly vertragsname?: string;
}

export function analyseBuchungen(
  basis: Analysebasis,
  kategorieId: string,
  von: string,
  bis: string,
): Analysezeile[] {
  return buchungenDerKategorie(basis.buchungen, kategorieId, von, bis).map((buchung) => {
    const u = basis.umsatzZuBuchung.get(buchung.id);
    return {
      buchung,
      betrag: betragInKategorie(buchung, kategorieId),
      empfaenger: u?.gegenpartei ?? buchung.notiz ?? "",
      verwendungszweck: u?.verwendungszweck ?? "",
      kontoName: basis.kontoNamen.get(buchung.kontoId) ?? "",
      vertragsname: basis.vertragsnamen.get(buchung.id),
    };
  });
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
  const monate = monateImFensterAus(von, bis);
  let soll = 0;
  for (const r of eigene) {
    for (const p of projiziereRegel(r, von, monate)) {
      if (p.betrag < 0) soll -= p.betrag;
    }
  }
  return soll;
}

/** Monate des Fensters, beide Enden eingeschlossen — wie im Kern. */
function monateImFensterAus(von: string, bis: string): number {
  const a = parseIso(von);
  const b = parseIso(bis);
  return Math.max(1, (b.y - a.y) * 12 + (b.m - a.m) + 1);
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
}

/**
 * Der Verlauf über die Gegenwart hinaus: `zurueck` gewesene Monate, `voraus` geplante.
 *
 * **Die Naht liegt am Monatsende und nicht bei „heute".** Der laufende Monat gehört zum
 * ISTEN — er ist zur Hälfte gebucht, und ihn als Plan zu zeigen hiesse, das Gebuchte
 * wegzuwerfen. Die Projektion setzt deshalb beim FOLGENDEN Monat an, auf dem Stand, den
 * der laufende bis heute erreicht hat.
 *
 * **Fortgeschrieben wird der Saldo der liquiden Konten**, weil der Ist-Verlauf genau den
 * liefert (`istMonatsverlauf` bildet seinen Sockel aus `liquideMittel`). Eine Vorschau,
 * die eine andere Bezugsgrösse fortschreibt als die Linie davor, hätte an der Naht einen
 * Sprung, den niemand erklären kann.
 *
 * Was ein Planmonat zum Saldo beiträgt, entscheidet `planWirkung` — Rücklagen und
 * Umschichtungen bleiben draussen (siehe dort). Die Rücklagen aus dem Inventar werden
 * hier deshalb gar nicht erst geladen.
 */
export function analyseAusblick(
  basis: Analysebasis,
  heute: string,
  zurueck: number,
  voraus: number,
): Verlaufspunkt[] {
  const jetzt = { ...parseIso(heute), d: 1 };
  const von = toIso(addMonate(jetzt, -Math.max(0, zurueck - 1)));
  const ist = istMonatsverlauf(basis.konten, basis.buchungen, von, toIso(jetzt));

  const punkte: Verlaufspunkt[] = ist.map((m) => ({
    monat: m.label,
    einnahmen: m.einnahmen,
    ausgaben: m.ausgaben,
    netto: m.netto,
    saldo: m.saldo,
    plan: false,
  }));

  const vertragsBuchungen = new Set(basis.vertragsnamen.keys());
  // `monatsAusblicke` beginnt beim laufenden Monat — der steht als Ist schon da, also
  // einen mehr holen und den ersten überspringen.
  const ausblicke = monatsAusblicke(
    {
      regeln: basis.regeln,
      budgets: basis.budgets,
      ist: basis.buchungen,
      kategorien: basis.kategorien,
      vertragsBuchungen,
      heute,
    },
    Math.max(0, voraus) + 1,
  ).slice(1);

  let saldo = punkte.length > 0 ? punkte[punkte.length - 1].saldo : 0;
  for (const a of ausblicke) {
    const w = planWirkung(a.zeilen.map((z) => ({ id: z.id, plan: z.plan })));
    saldo += w.netto;
    punkte.push({
      monat: a.label,
      einnahmen: w.einnahmen,
      ausgaben: w.ausgaben,
      netto: w.netto,
      saldo,
      plan: true,
    });
  }
  return punkte;
}
