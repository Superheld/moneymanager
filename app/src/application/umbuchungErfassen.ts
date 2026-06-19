// Use-Case „Umbuchen" — ein Übertrag zwischen zwei eigenen Konten. Erzeugt ZWEI
// verknüpfte Ist-Buchungen (− auf Quelle, + auf Ziel), Charakter Umschichtung
// (Vermögensumschichtung, nicht erfolgswirksam). Beide Beine teilen eine transferId;
// die liquiden Mittel über alle Konten bleiben unverändert (netto 0).

import { FachlicherFehler, type Cent, type IstBuchung } from "../core";
import type { LedgerPort } from "./ports";

export interface UmbuchungEingabe {
  vonKontoId: string;
  nachKontoId: string;
  datum: string; // ISO
  betrag: Cent; // positiv, Minor Units
  notiz?: string;
}

export interface UmbuchungErgebnis {
  ab: IstBuchung; // Abgang (Quelle)
  zu: IstBuchung; // Zugang (Ziel)
}

export async function umbuchungErfassen(
  ledger: LedgerPort,
  e: UmbuchungEingabe,
): Promise<UmbuchungErgebnis> {
  if (!e.vonKontoId || !e.nachKontoId) throw new FachlicherFehler("konten.quelleZiel");
  if (e.vonKontoId === e.nachKontoId) throw new FachlicherFehler("konten.verschieden");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) throw new FachlicherFehler("datum.ungueltig");
  if (!(e.betrag > 0)) throw new FachlicherFehler("betrag.groesserNull");

  const cent = e.betrag;
  const transferId = crypto.randomUUID();
  const notiz = e.notiz?.trim() || undefined;

  const ab: IstBuchung = {
    id: crypto.randomUUID(),
    datum: e.datum,
    betrag: -cent,
    kontoId: e.vonKontoId,
    charakter: "Umschichtung",
    quelle: "manuell",
    notiz,
    transferId,
    gegenkontoId: e.nachKontoId,
  };
  const zu: IstBuchung = {
    id: crypto.randomUUID(),
    datum: e.datum,
    betrag: cent,
    kontoId: e.nachKontoId,
    charakter: "Umschichtung",
    quelle: "manuell",
    notiz,
    transferId,
    gegenkontoId: e.vonKontoId,
  };

  await ledger.speichern(ab);
  await ledger.speichern(zu);
  return { ab, zu };
}

/** Löscht beide Beine einer Umbuchung über ihre transferId. */
export async function umbuchungLoeschen(ledger: LedgerPort, transferId: string): Promise<void> {
  const beine = (await ledger.alle()).filter((b) => b.transferId === transferId);
  for (const b of beine) await ledger.loeschen(b.id);
}
