// Use-Case „Topf-Entnahme" (ADR-0003 §6) — bucht eine Ist-Buchung mit Verwendung =
// Topf (das benannte Passiv-Gegenkonto), von einem Zahlungskonto. Senkt den Kontosaldo
// UND den Topf-Stand. Der Charakter wird NICHT gewählt, sondern aus dem Topf-Typ
// abgeleitet (entnahmeCharakter): Puffer → Umschichtung (gedeckte Auflösung),
// Spartopf → Aufwand (Konsum). Der Betrag ist immer ein Abfluss (negativ).

import {
  FachlicherFehler,
  entnahmeCharakter,
  type Cent,
  type IstBuchung,
  type Topf,
} from "../core";
import { vorzeichenbehaftet } from "./zahlungsregelAnlegen";
import type { LedgerPort } from "./ports";

export interface TopfEntnahmeEingabe {
  /** Der Topf, aus dem entnommen wird (trägt Typ → Charakter, und die Kategorie). */
  topf: Topf;
  /** Zahlungskonto, über das das Geld tatsächlich abfließt. */
  kontoId: string;
  datum: string; // ISO
  /** Positiver Betrag in Minor Units; das Vorzeichen ergibt sich aus dem Charakter. */
  betrag: Cent;
  notiz?: string;
}

function baueEntnahme(e: TopfEntnahmeEingabe, id?: string): IstBuchung {
  if (!e.kontoId) throw new FachlicherFehler("konto.waehlen");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) throw new FachlicherFehler("datum.ungueltig");
  if (!(e.betrag > 0)) throw new FachlicherFehler("betrag.groesserNull");

  const charakter = entnahmeCharakter(e.topf.typ);
  return {
    id: id ?? crypto.randomUUID(),
    datum: e.datum,
    betrag: vorzeichenbehaftet(e.betrag, charakter),
    kontoId: e.kontoId,
    kategorieId: e.topf.kategorieId,
    charakter,
    quelle: "manuell",
    notiz: e.notiz?.trim() || undefined,
    verwendung: { art: "topf", topfId: e.topf.id },
  };
}

/** Bucht eine Entnahme aus einem beliebigen Topf. */
export async function topfEntnahme(
  ledger: LedgerPort,
  e: TopfEntnahmeEingabe,
  id?: string,
): Promise<IstBuchung> {
  const buchung = baueEntnahme(e, id);
  await ledger.speichern(buchung);
  return buchung;
}
