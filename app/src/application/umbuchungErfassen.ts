// Use-Case „Umbuchen" — ein Übertrag zwischen zwei eigenen Konten. Erzeugt ZWEI
// verknüpfte Ist-Buchungen (− auf Quelle, + auf Ziel), Charakter Umschichtung
// (Vermögensumschichtung, nicht erfolgswirksam). Beide Beine teilen eine transferId;
// die liquiden Mittel über alle Konten bleiben unverändert (netto 0).

import { euroZuCent, type IstBuchung } from "../core";
import type { LedgerPort } from "./ports";

export interface UmbuchungEingabe {
  vonKontoId: string;
  nachKontoId: string;
  datum: string; // ISO
  betragEuro: number; // positiv
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
  if (!e.vonKontoId || !e.nachKontoId) throw new Error("Bitte Quell- und Zielkonto wählen.");
  if (e.vonKontoId === e.nachKontoId) throw new Error("Quell- und Zielkonto müssen verschieden sein.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) throw new Error("Bitte ein gültiges Datum angeben.");
  if (!(e.betragEuro > 0)) throw new Error("Der Betrag muss größer als 0 sein.");

  const cent = euroZuCent(e.betragEuro);
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
