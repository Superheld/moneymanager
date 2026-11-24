// Die Zahlungsregeln, wie die Planung sie liest — gebaut aus den Verträgen.
//
// Bis Migration 84 stand hier eine eigene Tabelle `zahlungsregel`. Seither trägt der
// Vertrag seine Zahlung selbst, und eine Regel ist eine Sicht auf ihn
// (`regelAusVertrag`). Der Port bleibt, damit die Leser der Planung (Übersicht, Analyse,
// Kontoauszug, Rücklagen) den Vertrag nicht kennen müssen. Geschrieben wird hier nichts
// mehr: wer eine Zahlung ändert, speichert den Vertrag.

import { regelnAusVertraegen } from "../../core";
import type { ZahlungsregelRepository } from "../../application/ports";
import { sqliteVertragRepository } from "./sqliteVertragRepository";

export const sqliteZahlungsregelRepository: ZahlungsregelRepository = {
  async alle() {
    return regelnAusVertraegen(await sqliteVertragRepository.alle());
  },
};
