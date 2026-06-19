// Use-Case „Posten bezahlt markieren" (ADR-0002 §3) — bestätigt einen geplanten,
// diskreten Posten (Zahlungsregel/Vertrag) 1:1 als Ist, OHNE erneutes Erfassen.
// Erzeugt eine Ist-Buchung mit planRef; idempotent (Dedup über die Quelle).
//
// Bewusst NUR für Plan-Posten — variable Budget-Ausgaben bleiben Plan bis zum
// Bankimport (kein freies Haushaltsbuch, ADR-0002 §4).

import {
  FachlicherFehler,
  findeIstZuPlan,
  type IstBuchung,
  type Zahlungsregel,
} from "../core";
import type { LedgerPort } from "./ports";

export interface BezahltEingabe {
  /** Die Plan-Quelle (trägt Betrag, Charakter, Konto, Kategorie). */
  regel: Zahlungsregel;
  /** Die projizierte Fälligkeit, die bezahlt wird (ISO). */
  faelligkeit: string;
  /** Tatsächliches Buchungsdatum; Standard = Fälligkeit. */
  datum?: string;
  /** Konto, über das geflossen ist; Standard = regel.kontoId. */
  kontoId?: string;
}

/**
 * Markiert einen Plan-Posten als bezahlt. Existiert bereits eine Ist-Buchung zu
 * (regel, faelligkeit), wird sie unverändert zurückgegeben (idempotent, kein Doppel).
 */
export async function postenBezahltMarkieren(
  ledger: LedgerPort,
  e: BezahltEingabe,
): Promise<IstBuchung> {
  const kontoId = e.kontoId ?? e.regel.kontoId;
  if (!kontoId) {
    throw new FachlicherFehler("bezahlt.keinKonto");
  }

  const bestehende = await ledger.alle();
  const schon = findeIstZuPlan(bestehende, e.regel.id, e.faelligkeit);
  if (schon) return schon;

  const buchung: IstBuchung = {
    id: crypto.randomUUID(),
    datum: e.datum ?? e.faelligkeit,
    betrag: e.regel.betrag,
    kontoId,
    kategorieId: e.regel.kategorieId,
    charakter: e.regel.charakter,
    quelle: "bezahlt-markiert",
    planRef: { quelleId: e.regel.id, faelligkeit: e.faelligkeit },
  };
  await ledger.speichern(buchung);
  return buchung;
}

/**
 * Nimmt eine „bezahlt"-Markierung zurück (Häkchen entfernen). Löscht NUR manuell
 * markierte Buchungen; importierte Ist-Buchungen bleiben unangetastet.
 */
export async function bezahltZuruecknehmen(
  ledger: LedgerPort,
  regelId: string,
  faelligkeit: string,
): Promise<void> {
  const bestehende = await ledger.alle();
  const treffer = findeIstZuPlan(bestehende, regelId, faelligkeit);
  if (treffer && treffer.quelle === "bezahlt-markiert") {
    await ledger.loeschen(treffer.id);
  }
}
