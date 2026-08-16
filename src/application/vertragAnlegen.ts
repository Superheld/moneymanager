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
import type {
  VertragRepository,
  VertragserkennungRepository,
  VertragszuordnungRepository,
  ZahlungsregelRepository,
} from "./ports";
import { vorzeichenbehaftet } from "./zahlungsregelAnlegen";
import { erkennungSicherstellen, vertragszuordnungenAbraeumen } from "./vertragszuordnung";

/**
 * Die Zuordnungsseite eines Vertrags — seine Erkennungsregel und die Zuordnungen, die
 * auf ihn zeigen (siehe `core/vertragZuordnung`). Optional, weil der Vertrag auch ohne
 * sie vollständig ist: dann wird er eben nicht automatisch an Buchungen erkannt. Wer sie
 * mitgibt, bekommt die Regel angelegt bzw. beim Löschen abgeräumt.
 */
export interface VertragZuordnungsDeps {
  readonly erkennungRepo: VertragserkennungRepository;
  readonly zuordnungRepo: VertragszuordnungRepository;
}

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
  /**
   * SEPA-Gläubiger-ID, sofern bekannt (kommt aus einem übernommenen Vorschlag). Landet
   * nicht am Vertrag, sondern in seiner Erkennungsregel: dort ist sie der präziseste
   * Schlüssel, den es gibt — sie identifiziert den Einzieher, während der Name eine
   * Normalisierung mit Unschärfe bleibt.
   */
  glaeubigerId?: string;
}

export interface VertragErgebnis {
  vertrag: Vertrag;
  regel: Zahlungsregel;
}

export async function vertragAnlegen(
  vertragRepo: VertragRepository,
  regelRepo: ZahlungsregelRepository,
  eingabe: VertragEingabe,
  zuordnung?: VertragZuordnungsDeps,
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
    // Auch am VERTRAG, nicht nur an der abgeleiteten Zahlungsregel: die
    // Kategorisierungs-Kette fragt den Vertrag, weil die Vertragszuordnung auf ihn zeigt.
    kategorieId: eingabe.kategorieId,
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
  if (zuordnung) {
    await erkennungSicherstellen(
      zuordnung.erkennungRepo,
      vertrag.id,
      anbieter,
      eingabe.betrag,
      eingabe.glaeubigerId,
    );
  }
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
  zuordnung?: VertragZuordnungsDeps,
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
    kategorieId: eingabe.kategorieId,
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
  // Nur anlegen, wenn noch keine Regel da ist — eine nachgesteuerte darf ein
  // Namenswechsel im Vertrag nicht wegwischen (siehe `erkennungSicherstellen`).
  if (zuordnung) {
    await erkennungSicherstellen(
      zuordnung.erkennungRepo,
      vertragId,
      anbieter,
      eingabe.betrag,
      eingabe.glaeubigerId,
    );
  }
  return { vertrag, regel };
}

/** Löscht einen Vertrag samt seiner abgeleiteten Zahlungsregel(n) und seiner Zuordnungen. */
export async function vertragLoeschen(
  vertragRepo: VertragRepository,
  regelRepo: ZahlungsregelRepository,
  vertragId: string,
  zuordnung?: VertragZuordnungsDeps,
): Promise<void> {
  const regeln = await regelRepo.alle();
  for (const r of regeln) {
    if (r.vertragId === vertragId) await regelRepo.loeschen(r.id);
  }
  if (zuordnung) {
    await vertragszuordnungenAbraeumen(zuordnung.erkennungRepo, zuordnung.zuordnungRepo, vertragId);
  }
  await vertragRepo.loeschen(vertragId);
}
