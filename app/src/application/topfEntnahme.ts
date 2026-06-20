// Use-Case „Topf-Entnahme" (ADR-0003 §6) — bucht eine Ist-Buchung mit Verwendung =
// Topf (das benannte Passiv-Gegenkonto), von einem Zahlungskonto. Senkt den Kontosaldo
// UND den Topf-Stand. Der Charakter wird NICHT gewählt, sondern aus dem Topf-Typ
// abgeleitet (entnahmeCharakter): Ersatz/Puffer → Umschichtung (gedeckte Auflösung),
// Spartopf → Aufwand (Konsum). Der Betrag ist immer ein Abfluss (negativ).
//
// `ersatzErsetzt` ist die Sonderform für Ersatz-Töpfe: Entnahme + Neustart des
// Abschreibungszyklus (synchron mit dem verknüpften Inventargegenstand), damit der
// Sollstand für die NÄCHSTE Anschaffung wieder bei null aufbaut.

import {
  FachlicherFehler,
  entnahmeCharakter,
  type Cent,
  type Ersatztopf,
  type IstBuchung,
  type Topf,
} from "../core";
import { vorzeichenbehaftet } from "./zahlungsregelAnlegen";
import type { InventarRepository, LedgerPort, TopfRepository } from "./ports";

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

export interface ErsatzErsetztEingabe {
  topf: Ersatztopf;
  kontoId: string;
  datum: string; // ISO — Anschaffungstag des Ersatzes, zugleich neuer Zyklus-Start
  betrag: Cent; // positiv
  notiz?: string;
}

export interface ErsatzErsetztErgebnis {
  buchung: IstBuchung;
  topf: Ersatztopf;
}

/**
 * „Ersetzt" — bucht die Entnahme UND startet den Abschreibungszyklus neu: `start` des
 * Ersatz-Topfes (und, falls verknüpft, die `anschaffung` des Inventargegenstands)
 * wandern auf den Anschaffungstag. So zählt der Sollstand ab jetzt wieder von null für
 * die nächste Wiederbeschaffung; die auslösende Entnahme gehört zum abgeschlossenen
 * alten Zyklus (topfStand fenstert sie aus).
 */
export async function ersatzErsetzt(
  ledger: LedgerPort,
  topfRepo: TopfRepository,
  inventarRepo: InventarRepository,
  e: ErsatzErsetztEingabe,
): Promise<ErsatzErsetztErgebnis> {
  const buchung = baueEntnahme({ ...e, topf: e.topf });
  await ledger.speichern(buchung);

  // Zyklus-Neustart: Inventargegenstand (die fachliche Wahrheit) und Topf gleichziehen.
  if (e.topf.inventarId) {
    const gegenstand = (await inventarRepo.alle()).find((g) => g.id === e.topf.inventarId);
    if (gegenstand) {
      await inventarRepo.speichern({ ...gegenstand, anschaffung: e.datum });
    }
  }
  const aktualisiert: Ersatztopf = { ...e.topf, start: e.datum };
  await topfRepo.speichern(aktualisiert);

  return { buchung, topf: aktualisiert };
}
