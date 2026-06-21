// Use-Case „Verbuchen": macht aus bestätigten Entwurfs-Umsätzen Ist-Buchungen im Ledger
// (wirkt auf Salden/Liquidität). Pro Umsatz eine einseitige Ist-Buchung auf seinem Konto —
// auch Umbuchungen (Charakter Umschichtung, ohne Kategorie): −500 Giro / +500 Tagesgeld
// stimmen pro Konto und zählen nicht in Budgets/Analysen. Der Roh-Hash wandert mit, damit
// ein späterer Bankimport gegen die verbuchte Zeile deduppen kann.
//
// Verbucht werden nur Umsätze im Status „neu" MIT Vorschlag (Kategorie oder Umbuchung);
// unkategorisierte werden übersprungen und bleiben in der Inbox.

import type { IstBuchung } from "../../core";
import type { LedgerPort, UmsatzRepository } from "../ports";
import { verbuchen, type Umsatz } from "./umsatz";

export interface VerbuchenDeps {
  readonly ledgerRepo: LedgerPort;
  readonly umsatzRepo: UmsatzRepository;
  readonly id: () => string;
}

export interface VerbuchenErgebnis {
  readonly verbucht: number;
  readonly uebersprungen: number;
}

export async function umsaetzeVerbuchen(
  umsaetze: readonly Umsatz[],
  deps: VerbuchenDeps,
): Promise<VerbuchenErgebnis> {
  let verbucht = 0;
  let uebersprungen = 0;
  for (const u of umsaetze) {
    if (u.status !== "neu" || !u.vorschlag) {
      uebersprungen++;
      continue;
    }
    const ist: IstBuchung = {
      id: deps.id(),
      datum: u.buchungstag,
      betrag: u.betrag,
      kontoId: u.zahlungskontoId,
      kategorieId: u.vorschlag.kategorieId,
      charakter: u.vorschlag.charakter,
      quelle: "import",
      rohHash: u.rohHash,
    };
    await deps.ledgerRepo.speichern(ist);
    await deps.umsatzRepo.speichern(verbuchen(u, ist.id));
    verbucht++;
  }
  return { verbucht, uebersprungen };
}
