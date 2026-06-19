// Use-Case „Buchung erfassen" (ADR-0002, revidiert) — eine FREIE Ist-Buchung ohne
// Plan-Bezug. Für Bar die Dauerquelle (kein Import möglich); für Bankkonten vorläufig,
// bis der Import sie abgleicht. quelle = 'manuell', kein planRef.

import { FachlicherFehler, type Cent, type Charakter, type IstBuchung } from "../core";
import type { LedgerPort } from "./ports";
import { vorzeichenbehaftet } from "./zahlungsregelAnlegen";

export interface BuchungEingabe {
  kontoId: string;
  datum: string; // ISO
  /** Positiver Betrag in Minor Units; das Vorzeichen ergibt sich aus dem Charakter. */
  betrag: Cent;
  charakter: Charakter;
  kategorieId?: string;
  notiz?: string;
}

export async function buchungErfassen(
  ledger: LedgerPort,
  e: BuchungEingabe,
  id?: string,
): Promise<IstBuchung> {
  if (!e.kontoId) throw new FachlicherFehler("konto.waehlen");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) throw new FachlicherFehler("datum.ungueltig");
  if (!(e.betrag > 0)) throw new FachlicherFehler("betrag.groesserNull");

  const buchung: IstBuchung = {
    id: id ?? crypto.randomUUID(),
    datum: e.datum,
    betrag: vorzeichenbehaftet(e.betrag, e.charakter),
    kontoId: e.kontoId,
    kategorieId: e.kategorieId || undefined,
    charakter: e.charakter,
    quelle: "manuell",
    notiz: e.notiz?.trim() || undefined,
  };
  await ledger.speichern(buchung);
  return buchung;
}

/** Löscht eine Ist-Buchung (UI bietet das nur für manuelle Buchungen an). */
export async function buchungLoeschen(ledger: LedgerPort, id: string): Promise<void> {
  await ledger.loeschen(id);
}
