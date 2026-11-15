// Use-Cases rund um Vermögenswerte und Schulden: Stammsatz anlegen, ändern, stilllegen,
// löschen — und Beobachtungen eintragen oder wieder entfernen.
//
// Gebucht wird hier nichts. Ein Wert zum Stichtag ist eine Beobachtung (siehe
// `core/vermoegen/vermoegen.ts`): er bewegt kein Konto und belastet kein Budget.
//
// Die Prüfungen stehen hier, weil hier fremde Werte ankommen. Zwei davon sind fachlich
// und nicht nur Form:
//
//   • EIN STICHTAG, EINE BEOBACHTUNG. Ein zweiter Betrag zum selben Tag wird abgewiesen,
//     nicht übernommen — wer sich vertippt hat, entfernt den alten und trägt neu ein.
//     Still zu überschreiben hiesse, dass eine Zahl in der Reihe sich ändern kann, ohne
//     dass jemand es so gemeint hat.
//   • KEIN STICHTAG IN DER ZUKUNFT. Eine Beobachtung von morgen hat niemand gemacht.

import {
  FachlicherFehler,
  VERBINDLICHKEITSARTEN,
  VERMOEGENSARTEN,
  istCent,
  parseIso,
  type Cent,
  type Verbindlichkeit,
  type Verbindlichkeitsart,
  type Vermoegensart,
  type Vermoegensgegenstand,
} from "../../core";
import type { VermoegenRepository, VertragRepository } from "../ports";

export interface VermoegenPflegeDeps {
  readonly vermoegenRepo: VermoegenRepository;
  /** Nur um zu prüfen, dass ein gewählter Vertrag existiert. */
  readonly vertragRepo: VertragRepository;
}

export interface VermoegenswertEingabe {
  bezeichnung: string;
  art: Vermoegensart;
}

export interface SchuldEingabe {
  bezeichnung: string;
  art: Verbindlichkeitsart;
  /** Der Vertrag, über den die Rate läuft. Gespeichert, noch nicht verrechnet. */
  vertragId?: string;
  /** Der Vermögenswert, den die Schuld finanziert. Gespeichert, noch nicht verrechnet. */
  gegenstandId?: string;
}

export interface BeobachtungEingabe {
  stichtag: string; // ISO
  /** Wert bzw. Restschuld in Minor Units, nie negativ. */
  betrag: Cent;
}

function bezeichnungVon(roh: string): string {
  const bezeichnung = (roh ?? "").trim();
  if (!bezeichnung) throw new FachlicherFehler("bezeichnung.fehlt");
  return bezeichnung;
}

function pruefeStichtag(stichtag: string, heute: string): void {
  // Die Form hier, die Existenz im Kern: `parseIso` wirft bei einem 31. Februar.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stichtag ?? "")) throw new FachlicherFehler("datum.ungueltig");
  parseIso(stichtag);
  if (stichtag > heute) throw new FachlicherFehler("vermoegen.stichtagZukunft");
}

// --- Vermögenswerte ----------------------------------------------------------

function baueGegenstand(e: VermoegenswertEingabe, id: string, aktiv: boolean): Vermoegensgegenstand {
  const bezeichnung = bezeichnungVon(e.bezeichnung);
  if (!VERMOEGENSARTEN.includes(e.art)) throw new FachlicherFehler("vermoegen.artUnbekannt");
  return { id, bezeichnung, art: e.art, aktiv };
}

async function gegenstandHolen(repo: VermoegenRepository, id: string): Promise<Vermoegensgegenstand> {
  const g = (await repo.gegenstaende()).find((x) => x.id === id);
  if (!g) throw new FachlicherFehler("vermoegen.unbekannt");
  return g;
}

export async function vermoegenswertAnlegen(
  deps: VermoegenPflegeDeps,
  e: VermoegenswertEingabe,
): Promise<Vermoegensgegenstand> {
  const g = baueGegenstand(e, crypto.randomUUID(), true);
  await deps.vermoegenRepo.gegenstandSpeichern(g);
  return g;
}

/** Ändert Bezeichnung und Art. Ob er noch geführt wird, bleibt, wie es war. */
export async function vermoegenswertAendern(
  deps: VermoegenPflegeDeps,
  id: string,
  e: VermoegenswertEingabe,
): Promise<Vermoegensgegenstand> {
  const bisher = await gegenstandHolen(deps.vermoegenRepo, id);
  const g = baueGegenstand(e, id, bisher.aktiv !== false);
  await deps.vermoegenRepo.gegenstandSpeichern(g);
  return g;
}

/**
 * Stilllegen oder wieder aufnehmen.
 *
 * Stillgelegt zählt der Vermögenswert nach seiner letzten Beobachtung nicht mehr zum
 * Nettovermögen; die Reihe bleibt und steht weiter im Verlauf. Das ist der Weg für
 * „verkauft" — löschen nähme die Geschichte mit.
 */
export async function vermoegenswertFuehren(
  deps: VermoegenPflegeDeps,
  id: string,
  aktiv: boolean,
): Promise<void> {
  const bisher = await gegenstandHolen(deps.vermoegenRepo, id);
  await deps.vermoegenRepo.gegenstandSpeichern({ ...bisher, aktiv });
}

export async function vermoegenswertLoeschen(deps: VermoegenPflegeDeps, id: string): Promise<void> {
  await deps.vermoegenRepo.gegenstandLoeschen(id);
}

export async function wertEintragen(
  deps: VermoegenPflegeDeps,
  gegenstandId: string,
  e: BeobachtungEingabe,
  heute: string,
  erfasstAm: string,
): Promise<void> {
  await gegenstandHolen(deps.vermoegenRepo, gegenstandId);
  pruefeStichtag(e.stichtag, heute);
  if (!istCent(e.betrag) || e.betrag < 0) throw new FachlicherFehler("vermoegen.wertUngueltig");
  const belegt = (await deps.vermoegenRepo.werte()).some(
    (w) => w.gegenstandId === gegenstandId && w.stichtag === e.stichtag,
  );
  if (belegt) throw new FachlicherFehler("vermoegen.stichtagBelegt");
  await deps.vermoegenRepo.wertEintragen(
    { gegenstandId, stichtag: e.stichtag, wert: e.betrag },
    erfasstAm,
  );
}

export async function wertEntfernen(
  deps: VermoegenPflegeDeps,
  gegenstandId: string,
  stichtag: string,
): Promise<void> {
  await deps.vermoegenRepo.wertEntfernen(gegenstandId, stichtag);
}

// --- Schulden ----------------------------------------------------------------

async function baueVerbindlichkeit(
  deps: VermoegenPflegeDeps,
  e: SchuldEingabe,
  id: string,
  aktiv: boolean,
): Promise<Verbindlichkeit> {
  const bezeichnung = bezeichnungVon(e.bezeichnung);
  if (!VERBINDLICHKEITSARTEN.includes(e.art)) throw new FachlicherFehler("vermoegen.artUnbekannt");

  // Ein Verweis ins Leere scheiterte in der App erst am Fremdschlüssel, mit einer
  // Meldung aus SQLite. Hier geprüft, steht ein Satz da.
  const vertragId = e.vertragId || undefined;
  if (vertragId && !(await deps.vertragRepo.alle()).some((v) => v.id === vertragId)) {
    throw new FachlicherFehler("vermoegen.verweisUnbekannt");
  }
  const gegenstandId = e.gegenstandId || undefined;
  if (gegenstandId && !(await deps.vermoegenRepo.gegenstaende()).some((g) => g.id === gegenstandId)) {
    throw new FachlicherFehler("vermoegen.verweisUnbekannt");
  }
  return { id, bezeichnung, art: e.art, vertragId, gegenstandId, aktiv };
}

async function verbindlichkeitHolen(repo: VermoegenRepository, id: string): Promise<Verbindlichkeit> {
  const v = (await repo.verbindlichkeiten()).find((x) => x.id === id);
  if (!v) throw new FachlicherFehler("vermoegen.unbekannt");
  return v;
}

export async function schuldAnlegen(deps: VermoegenPflegeDeps, e: SchuldEingabe): Promise<Verbindlichkeit> {
  const v = await baueVerbindlichkeit(deps, e, crypto.randomUUID(), true);
  await deps.vermoegenRepo.verbindlichkeitSpeichern(v);
  return v;
}

export async function schuldAendern(
  deps: VermoegenPflegeDeps,
  id: string,
  e: SchuldEingabe,
): Promise<Verbindlichkeit> {
  const bisher = await verbindlichkeitHolen(deps.vermoegenRepo, id);
  const v = await baueVerbindlichkeit(deps, e, id, bisher.aktiv !== false);
  await deps.vermoegenRepo.verbindlichkeitSpeichern(v);
  return v;
}

/** Stilllegen oder wieder aufnehmen — der Weg für „abgezahlt". */
export async function schuldFuehren(deps: VermoegenPflegeDeps, id: string, aktiv: boolean): Promise<void> {
  const bisher = await verbindlichkeitHolen(deps.vermoegenRepo, id);
  await deps.vermoegenRepo.verbindlichkeitSpeichern({ ...bisher, aktiv });
}

export async function schuldLoeschen(deps: VermoegenPflegeDeps, id: string): Promise<void> {
  await deps.vermoegenRepo.verbindlichkeitLoeschen(id);
}

export async function restschuldEintragen(
  deps: VermoegenPflegeDeps,
  verbindlichkeitId: string,
  e: BeobachtungEingabe,
  heute: string,
  erfasstAm: string,
): Promise<void> {
  await verbindlichkeitHolen(deps.vermoegenRepo, verbindlichkeitId);
  pruefeStichtag(e.stichtag, heute);
  // Positiv gespeichert, immer: das Vorzeichen setzt erst die Rechnung. Eine negative
  // Eingabe wäre nach dem Abziehen ein Guthaben.
  if (!istCent(e.betrag) || e.betrag < 0) throw new FachlicherFehler("vermoegen.restschuldUngueltig");
  const belegt = (await deps.vermoegenRepo.staende()).some(
    (s) => s.verbindlichkeitId === verbindlichkeitId && s.stichtag === e.stichtag,
  );
  if (belegt) throw new FachlicherFehler("vermoegen.stichtagBelegt");
  await deps.vermoegenRepo.standEintragen(
    { verbindlichkeitId, stichtag: e.stichtag, restschuld: e.betrag },
    erfasstAm,
  );
}

export async function restschuldEntfernen(
  deps: VermoegenPflegeDeps,
  verbindlichkeitId: string,
  stichtag: string,
): Promise<void> {
  await deps.vermoegenRepo.standEntfernen(verbindlichkeitId, stichtag);
}
