// Use-Case „Vertrag anlegen" — schreibt in ZWEI Kontexte (SPEC US-B2): den Vertrag
// (Stammdaten) und eine daraus abgeleitete Zahlungsregel (Planung), verknüpft über
// vertragId. Bewusst kein gemeinsames Aggregat; die Anwendungsschicht orchestriert.

import { FachlicherFehler } from "../core";
import type {
  Cent,
  Charakter,
  Rhythmus,
  Vertrag,
  Verlaengerungsart,
  Vertragsstatus,
  Zahlungsregel,
} from "../core";
import type { VertragRepository, ZahlungsregelRepository } from "./ports";
import { vorzeichenbehaftet } from "./zahlungsregelAnlegen";

export interface VertragEingabe {
  anbieter: string;
  vertragsnummer?: string;
  inhaberId?: string;
  beginn: string; // ISO
  mindestlaufzeitMonate?: number;
  verlaengerung: Verlaengerungsart;
  verlaengerungMonate?: number;
  kuendigungsfristMonate?: number;
  notizen?: string;
  // --- Zahlungsseite (→ abgeleitete Zahlungsregel) ---
  betrag: Cent;
  rhythmus: Rhythmus;
  charakter: Charakter;
  kategorieId?: string;
  kontoId?: string;
  /** Erste Fälligkeit der Zahlung; Standard = Vertragsbeginn. */
  ersteZahlung?: string;
}

export interface VertragErgebnis {
  vertrag: Vertrag;
  regel: Zahlungsregel;
}

export async function vertragAnlegen(
  vertragRepo: VertragRepository,
  regelRepo: ZahlungsregelRepository,
  eingabe: VertragEingabe,
): Promise<VertragErgebnis> {
  const anbieter = eingabe.anbieter.trim();
  if (!anbieter) throw new FachlicherFehler("anbieter.fehlt");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.beginn)) throw new FachlicherFehler("beginn.ungueltig");
  if (!(eingabe.betrag > 0)) throw new FachlicherFehler("betrag.groesserNull");

  const status: Vertragsstatus = "aktiv";
  const vertrag: Vertrag = {
    id: crypto.randomUUID(),
    anbieter,
    vertragsnummer: eingabe.vertragsnummer?.trim() || undefined,
    inhaberId: eingabe.inhaberId || undefined,
    beginn: eingabe.beginn,
    mindestlaufzeitMonate: eingabe.mindestlaufzeitMonate,
    verlaengerung: eingabe.verlaengerung,
    verlaengerungMonate: eingabe.verlaengerung === "automatisch" ? eingabe.verlaengerungMonate : undefined,
    kuendigungsfristMonate: eingabe.kuendigungsfristMonate,
    status,
    notizen: eingabe.notizen?.trim() || undefined,
  };

  const regel: Zahlungsregel = {
    id: crypto.randomUUID(),
    bezeichnung: anbieter,
    betrag: vorzeichenbehaftet(eingabe.betrag, eingabe.charakter),
    rhythmus: eingabe.rhythmus,
    startdatum: eingabe.ersteZahlung || eingabe.beginn,
    charakter: eingabe.charakter,
    kontoId: eingabe.kontoId || undefined,
    kategorieId: eingabe.kategorieId || undefined,
    vertragId: vertrag.id,
  };

  // Eventual consistent: erst Stammdaten, dann die abgeleitete Planungsregel.
  await vertragRepo.speichern(vertrag);
  await regelRepo.speichern(regel);
  return { vertrag, regel };
}

/**
 * Aktualisiert einen bestehenden Vertrag und seine abgeleitete Zahlungsregel
 * (IDs bleiben erhalten). Findet die verknüpfte Regel über vertragId.
 */
export async function vertragAktualisieren(
  vertragRepo: VertragRepository,
  regelRepo: ZahlungsregelRepository,
  vertragId: string,
  eingabe: VertragEingabe,
): Promise<VertragErgebnis> {
  const anbieter = eingabe.anbieter.trim();
  if (!anbieter) throw new FachlicherFehler("anbieter.fehlt");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.beginn)) throw new FachlicherFehler("beginn.ungueltig");
  if (!(eingabe.betrag > 0)) throw new FachlicherFehler("betrag.groesserNull");

  const bestehend = (await vertragRepo.alle()).find((v) => v.id === vertragId);
  const vertrag: Vertrag = {
    id: vertragId,
    anbieter,
    vertragsnummer: eingabe.vertragsnummer?.trim() || undefined,
    inhaberId: eingabe.inhaberId || undefined,
    beginn: eingabe.beginn,
    mindestlaufzeitMonate: eingabe.mindestlaufzeitMonate,
    verlaengerung: eingabe.verlaengerung,
    verlaengerungMonate: eingabe.verlaengerung === "automatisch" ? eingabe.verlaengerungMonate : undefined,
    kuendigungsfristMonate: eingabe.kuendigungsfristMonate,
    status: bestehend?.status ?? "aktiv",
    notizen: eingabe.notizen?.trim() || undefined,
  };

  const regelId = (await regelRepo.alle()).find((r) => r.vertragId === vertragId)?.id ?? crypto.randomUUID();
  const regel: Zahlungsregel = {
    id: regelId,
    bezeichnung: anbieter,
    betrag: vorzeichenbehaftet(eingabe.betrag, eingabe.charakter),
    rhythmus: eingabe.rhythmus,
    startdatum: eingabe.ersteZahlung || eingabe.beginn,
    charakter: eingabe.charakter,
    kontoId: eingabe.kontoId || undefined,
    kategorieId: eingabe.kategorieId || undefined,
    vertragId,
  };

  await vertragRepo.speichern(vertrag);
  await regelRepo.speichern(regel);
  return { vertrag, regel };
}

/** Löscht einen Vertrag samt seiner abgeleiteten Zahlungsregel(n). */
export async function vertragLoeschen(
  vertragRepo: VertragRepository,
  regelRepo: ZahlungsregelRepository,
  vertragId: string,
): Promise<void> {
  const regeln = await regelRepo.alle();
  for (const r of regeln) {
    if (r.vertragId === vertragId) await regelRepo.loeschen(r.id);
  }
  await vertragRepo.loeschen(vertragId);
}
