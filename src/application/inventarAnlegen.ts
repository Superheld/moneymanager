// Use-Cases rund ums Inventar (SPEC US-C1). Der Gegenstand steht für sich: seine
// Rücklage ist eine Rechnung aus Wiederbeschaffung und Nutzungsdauer, kein eigenes
// Sparvehikel. Das frühere Paar „Gegenstand + Ersatz-Topf" ist 2026-08-16 entfallen —
// wo das Geld liegt, sagt jetzt `kontoId`, und der Abgleich passiert beim Anzeigen.

import { FachlicherFehler, type Cent, type Inventargegenstand } from "../core";
import type { InventarRepository } from "./ports";

export interface InventarEingabe {
  bezeichnung: string;
  wiederbeschaffung: Cent; // Minor Units (die UI parst währungsgerecht)
  nutzungsdauerMonate: number;
  anschaffung: string; // ISO
  kategorieId?: string;
  /** Zahlungskonto, auf dem die Rücklage tatsächlich liegt. */
  kontoId?: string;
}

/** Prüft die Eingabe und baut den Gegenstand; `id` erhält ihn beim Bearbeiten. */
function baue(e: InventarEingabe, id: string): Inventargegenstand {
  const bezeichnung = e.bezeichnung.trim();
  if (!bezeichnung) throw new FachlicherFehler("bezeichnung.fehlt");
  if (!(e.wiederbeschaffung > 0)) throw new FachlicherFehler("wiederbeschaffung.groesserNull");
  // Runden VOR dem Prüfen: sonst besteht 0.4 die Schwelle und wird danach zu 0 — die
  // Rücklage teilt dann durch null, und aus Infinity wird an anderer Stelle NaN.
  const nutzungsdauerMonate = Math.round(Number(e.nutzungsdauerMonate));
  if (!(nutzungsdauerMonate > 0)) throw new FachlicherFehler("nutzungsdauer.groesserNull");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.anschaffung)) throw new FachlicherFehler("anschaffung.ungueltig");

  return {
    id,
    bezeichnung,
    wiederbeschaffung: e.wiederbeschaffung,
    nutzungsdauerMonate,
    anschaffung: e.anschaffung,
    kategorieId: e.kategorieId || undefined,
    kontoId: e.kontoId || undefined,
  };
}

export async function inventarAnlegen(
  repo: InventarRepository,
  e: InventarEingabe,
): Promise<Inventargegenstand> {
  const gegenstand = baue(e, crypto.randomUUID());
  await repo.speichern(gegenstand);
  return gegenstand;
}

/** Aktualisiert einen Inventargegenstand (ID erhalten). */
export async function inventarAktualisieren(
  repo: InventarRepository,
  gegenstandId: string,
  e: InventarEingabe,
): Promise<Inventargegenstand> {
  const gegenstand = baue(e, gegenstandId);
  await repo.speichern(gegenstand);
  return gegenstand;
}

/**
 * „Ersetzt" — startet den Rücklagen-Zyklus neu: die Anschaffung wandert auf den Tag der
 * Ersatzbeschaffung, der Soll-Stand baut ab jetzt wieder von null auf. Optional lässt
 * sich dabei der Wiederbeschaffungswert nachziehen (Preise steigen).
 *
 * Gebucht wird hier NICHTS: der Kauf ist eine ganz normale Ausgabe vom Konto, und weil
 * die Deckung gegen den realen Kontostand rechnet, fällt sie durch die Abbuchung von
 * selbst — ohne dass eine zweite, kalkulatorische Buchung dieselbe Bewegung doppelt.
 */
export async function inventarErsetzt(
  repo: InventarRepository,
  gegenstand: Inventargegenstand,
  anschaffung: string,
  wiederbeschaffung?: Cent,
): Promise<Inventargegenstand> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anschaffung)) throw new FachlicherFehler("anschaffung.ungueltig");
  if (wiederbeschaffung != null && !(wiederbeschaffung > 0))
    throw new FachlicherFehler("wiederbeschaffung.groesserNull");

  const neu: Inventargegenstand = {
    ...gegenstand,
    anschaffung,
    wiederbeschaffung: wiederbeschaffung ?? gegenstand.wiederbeschaffung,
  };
  await repo.speichern(neu);
  return neu;
}

export async function inventarLoeschen(
  repo: InventarRepository,
  gegenstandId: string,
): Promise<void> {
  await repo.loeschen(gegenstandId);
}
