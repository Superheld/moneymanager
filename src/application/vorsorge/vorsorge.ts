// Das Vorsorgeziel: laden, festlegen, löschen.
//
// Gerechnet wird im Kern (`core/vorsorge/vorsorge.ts`). Hier wird geholt, geprüft und
// die Kette für die Oberfläche zusammengestellt.
//
// **Für den Anfang gibt es EIN Ziel je Haushalt.** Das Schema trägt mehrere; mit mehreren
// bräuchte aber jedes Konto und jedes Depot eine Zuordnung, welchem Ziel es dient. Mit
// einem ist die Frage beantwortet: alles, was Vorsorge ist, dient diesem. Die Use-Cases
// nehmen deshalb keine Id — es ist immer „das" Ziel.
//
// **Eine Änderung gilt ab dem laufenden Monat.** Sie schreibt eine neue Zeile in die
// Reihe der Annahmen (oder überschreibt die des laufenden Monats); was davor galt,
// bleibt stehen. Wer heute die Rendite senkt, hat damit nichts über das letzte Jahr
// gesagt.

import {
  FachlicherFehler,
  annahmeIm,
  istCent,
  moeglicheEntnahme,
  vorsorgeposten,
  vorsorgestand,
  vorsorgevermoegen,
  type Cent,
  type ErgebnisVorsorge,
  type Nettovermoegen,
  type VermoegensEingabe,
  type Vorsorgeposten,
  type Vorsorgestand,
  type Vorsorgeziel,
  type Vorsorgezielannahme,
} from "../../core";
import type { VorsorgeRepository } from "../ports";
import { vermoegensbestandLaden, type VermoegensbestandDeps } from "../vermoegen/vermoegensichten";

export interface VorsorgeDeps extends VermoegensbestandDeps {
  readonly vorsorgeRepo: VorsorgeRepository;
}

export interface Vorsorgesicht {
  readonly ziel: Vorsorgeziel;
  /** Die Annahmen, die heute gelten. */
  readonly annahme: Vorsorgezielannahme;
  /** Was heute für das Ziel da ist, mit seinen Teilen (Schulden stehen hier nie). */
  readonly vermoegen: Nettovermoegen;
  /**
   * Was in `vermoegen` steckt, Posten für Posten: Depots (mit ihrem Verrechnungskonto),
   * die übrigen Konten der Klassen Vorsorge und Investment, die zugeordneten
   * Vermögenswerte. Geht auf `vermoegen.netto` auf (`vorsorgeposten`).
   */
  readonly posten: readonly Vorsorgeposten[];
  readonly stand: Vorsorgestand;
  /**
   * Was im Ruhestand im Monat da wäre, wenn ab heute nichts mehr dazukommt: die Rente
   * plus das, was das hochgerechnete Vermögen über die Entnahmezeit hergibt. Die
   * Gegenprobe zur Sparrate — dieselbe Lücke, von der anderen Seite gesehen.
   */
  readonly ohneSparenMonatlich: Cent;
}

/** `null`, solange kein Ziel angelegt ist. */
export async function vorsorgeLaden(deps: VorsorgeDeps, heute: string): Promise<Vorsorgesicht | null> {
  const [ziele, annahmen, bestand] = await Promise.all([
    deps.vorsorgeRepo.ziele(),
    deps.vorsorgeRepo.annahmen(),
    vermoegensbestandLaden(deps),
  ]);
  const ziel = ziele[0];
  if (!ziel) return null;
  const annahme = annahmeIm(
    annahmen.filter((a) => a.zielId === ziel.id),
    heute.slice(0, 7),
  );
  // Ein Ziel ohne geltende Annahme entsteht über die Use-Cases nicht; käme es aus einem
  // fremden Bestand, gäbe es nichts zu rechnen.
  if (!annahme) return null;

  const vermoegen = vorsorgevermoegen(bestand, ziel.id, heute);
  const stand = vorsorgestand(annahme, vermoegen.netto, heute);
  return {
    ziel,
    annahme,
    vermoegen,
    posten: vorsorgeposten(bestand, ziel.id, heute),
    stand,
    ohneSparenMonatlich:
      annahme.renteMonatlich +
      moeglicheEntnahme(stand.hochgerechnet, annahme.entnahmeMonate, annahme.renditeBp),
  };
}

/**
 * Was die Ergebnisrechnung braucht, um die Rate des Ziels je Monat selbst zu rechnen
 * (`vorsorgerateIm` im Kern) — `undefined`, solange kein Ziel angelegt ist.
 *
 * Die GANZE Reihe der Annahmen, nicht die von heute: ein vergangener Monat kostet die
 * Rate, die damals galt. Und derselbe Bestand wie in `vorsorgeLaden`, damit die Rate in
 * der Übersicht dieselbe ist wie die auf der Karte im Bereich Vermögen.
 */
export async function ergebnisvorsorgeLaden(
  deps: VorsorgeDeps,
  /**
   * Der Bestand, wenn der Aufrufer ihn schon geladen hat — die Übersicht braucht ihn
   * auch für die Schulden und holt ihn deshalb nur einmal.
   */
  geladen?: Promise<VermoegensEingabe>,
): Promise<ErgebnisVorsorge | undefined> {
  const [ziele, annahmen, bestand] = await Promise.all([
    deps.vorsorgeRepo.ziele(),
    deps.vorsorgeRepo.annahmen(),
    geladen ?? vermoegensbestandLaden(deps),
  ]);
  const ziel = ziele[0];
  if (!ziel) return undefined;
  return {
    zielId: ziel.id,
    bezeichnung: ziel.bezeichnung,
    annahmen: annahmen.filter((a) => a.zielId === ziel.id),
    bestand,
  };
}

export interface VorsorgezielEingabe {
  bezeichnung: string;
  /** „YYYY-MM" — ab dann wird entnommen. */
  zielMonat: string;
  /** Was im Monat zur Verfügung stehen soll, heutige Kaufkraft. */
  wunschMonatlich: Cent;
  /** Erwartete Renten im Monat, heutige Kaufkraft. */
  renteMonatlich: Cent;
  /** Wie viele Jahre das Geld reichen soll. */
  entnahmeJahre: number;
  /** Rendite über Inflation im Jahr, in Basispunkten (300 = 3,00 %). */
  renditeBp: number;
}

/**
 * Die Grenzen der Annahmen. Sie sind weit gezogen und sollen nur Tippfehler fangen —
 * welche Rendite jemand für plausibel hält, ist seine Annahme und steht neben dem
 * Ergebnis. Null ist erlaubt: wer mit „real kein Ertrag" rechnen will, darf das.
 */
const ENTNAHME_JAHRE_HOECHSTENS = 60;
const RENDITE_BP_HOECHSTENS = 1500;

function ganzzahlIn(wert: unknown, von: number, bis: number): wert is number {
  return typeof wert === "number" && Number.isInteger(wert) && wert >= von && wert <= bis;
}

/**
 * Legt das Ziel an oder ändert es. Die Annahmen gelten ab dem Monat von `heute`.
 *
 * **Beim ANLEGEN zählen alle Depots zum Ziel.** Bis Migration 83 zählte jedes Depot,
 * ohne dass jemand gefragt wurde; ein neu angelegtes Ziel soll nicht mit weniger
 * rechnen als ein bestehendes. Abwählen lässt es sich je Depot. Ohne Ziel trägt kein
 * Depot eine Zuordnung (das Löschen des Ziels löst sie), es wird also nichts
 * überschrieben, was jemand entschieden hätte.
 */
export async function vorsorgezielFestlegen(
  deps: Pick<VorsorgeDeps, "vorsorgeRepo" | "depotRepo">,
  e: VorsorgezielEingabe,
  heute: string,
  erfasstAm: string,
): Promise<Vorsorgeziel> {
  const bezeichnung = (e.bezeichnung ?? "").trim();
  if (!bezeichnung) throw new FachlicherFehler("bezeichnung.fehlt");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.zielMonat ?? "")) throw new FachlicherFehler("vorsorge.zielMonatUngueltig");
  if (!istCent(e.wunschMonatlich) || e.wunschMonatlich <= 0) throw new FachlicherFehler("vorsorge.wunschUngueltig");
  if (!istCent(e.renteMonatlich) || e.renteMonatlich < 0) throw new FachlicherFehler("vorsorge.renteUngueltig");
  if (!ganzzahlIn(e.entnahmeJahre, 1, ENTNAHME_JAHRE_HOECHSTENS)) throw new FachlicherFehler("vorsorge.entnahmeUngueltig");
  if (!ganzzahlIn(e.renditeBp, 0, RENDITE_BP_HOECHSTENS)) throw new FachlicherFehler("vorsorge.renditeUngueltig");

  const bisher = (await deps.vorsorgeRepo.ziele())[0];
  const ziel: Vorsorgeziel = { id: bisher?.id ?? crypto.randomUUID(), bezeichnung };
  await deps.vorsorgeRepo.zielSpeichern(ziel, erfasstAm);
  if (!bisher) {
    for (const d of await deps.depotRepo.alle()) {
      if (!d.vorsorgezielId) await deps.depotRepo.speichern({ ...d, vorsorgezielId: ziel.id });
    }
  }
  await deps.vorsorgeRepo.annahmeSpeichern({
    zielId: ziel.id,
    abMonat: heute.slice(0, 7),
    zielMonat: e.zielMonat,
    wunschMonatlich: e.wunschMonatlich,
    renteMonatlich: e.renteMonatlich,
    entnahmeMonate: e.entnahmeJahre * 12,
    renditeBp: e.renditeBp,
  });
  return ziel;
}

/**
 * Das Ziel, dem ein neu abgerufenes Depot zugeordnet wird — `undefined`, solange es keines
 * gibt. Ein neues Depot zählt, wie bisher jedes: wer fürs Alter anlegt, tut es meist in
 * einem Depot, und ein Depot, das still NICHT zählte, fiele erst auf, wenn die Sparrate
 * schon zu hoch dastand. Abwählen lässt es sich im Bereich Vermögen.
 *
 * Ein eigener Use-Case, weil der Abruf (`abrufAusfuehren`) das Ziel nicht kennen darf:
 * er bekommt die Antwort hereingereicht (`DepotUebernahmeDeps.vorgabeVorsorgeziel`).
 */
export async function vorsorgezielFuerNeueDepots(
  deps: Pick<VorsorgeDeps, "vorsorgeRepo">,
): Promise<string | undefined> {
  return (await deps.vorsorgeRepo.ziele())[0]?.id;
}

/** Löscht das Ziel samt seinen Annahmen. Vermögenswerte und Depots bleiben, ohne Zuordnung. */
export async function vorsorgezielLoeschen(deps: Pick<VorsorgeDeps, "vorsorgeRepo">): Promise<void> {
  const ziel = (await deps.vorsorgeRepo.ziele())[0];
  if (ziel) await deps.vorsorgeRepo.zielLoeschen(ziel.id);
}
