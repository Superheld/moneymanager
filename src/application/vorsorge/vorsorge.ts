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
  vorsorgestand,
  vorsorgevermoegen,
  type Cent,
  type Nettovermoegen,
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
    stand,
    ohneSparenMonatlich:
      annahme.renteMonatlich +
      moeglicheEntnahme(stand.hochgerechnet, annahme.entnahmeMonate, annahme.renditeBp),
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

/** Legt das Ziel an oder ändert es. Die Annahmen gelten ab dem Monat von `heute`. */
export async function vorsorgezielFestlegen(
  deps: Pick<VorsorgeDeps, "vorsorgeRepo">,
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

/** Löscht das Ziel samt seinen Annahmen. Die Vermögenswerte bleiben, ohne Zuordnung. */
export async function vorsorgezielLoeschen(deps: Pick<VorsorgeDeps, "vorsorgeRepo">): Promise<void> {
  const ziel = (await deps.vorsorgeRepo.ziele())[0];
  if (ziel) await deps.vorsorgeRepo.zielLoeschen(ziel.id);
}
