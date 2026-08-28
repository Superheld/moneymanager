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
  buchungenDerKategorie,
  fruehesterMonat,
  istInterneUmbuchung,
  istMonatsverlauf,
  kategorieAggregat,
  nachHauptgruppe,
  parseIso,
  tageImMonat,
  toIso,
  type GruppenSumme,
  type IstBuchung,
  type Kategorie,
  type KategorieSumme,
  type MonatsIst,
  type Zahlungskonto,
} from "../core";
import type { Umsatz } from "./import";
import { vertragsnamenLaden } from "./vertraege/vertragszuordnung";
import type {
  KategorieRepository,
  LedgerPort,
  UmsatzRepository,
  VertragRepository,
  VertragszuordnungRepository,
  ZahlungskontoRepository,
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
}

export async function analyseLaden(deps: AnalyseDeps): Promise<Analysebasis> {
  const [buchungen, konten, kategorien, umsaetze, vertragsnamen] = await Promise.all([
    deps.ledger.alle(),
    deps.kontoRepo.alle(),
    deps.kategorieRepo.alle(),
    deps.umsatzRepo.alle(),
    vertragsnamenLaden(deps.zuordnungRepo, deps.vertragRepo),
  ]);
  const umsatzZuBuchung = new Map<string, Umsatz>();
  for (const u of umsaetze) if (u.istbuchungId) umsatzZuBuchung.set(u.istbuchungId, u);
  return {
    buchungen,
    konten,
    kategorien,
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    umsatzZuBuchung,
    vertragsnamen,
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
      empfaenger: u?.gegenpartei ?? buchung.notiz ?? "",
      verwendungszweck: u?.verwendungszweck ?? "",
      kontoName: basis.kontoNamen.get(buchung.kontoId) ?? "",
      vertragsname: basis.vertragsnamen.get(buchung.id),
    };
  });
}
