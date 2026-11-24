// Use-Case „Vertrag anlegen" — schreibt den Vertrag samt seiner Zahlung. Bis Migration 84
// waren das zwei Zeilen in zwei Tabellen (Vertrag und abgeleitete Zahlungsregel); die
// Regel, die die Planung liest, wird seither aus dem Vertrag gebaut (`regelAusVertrag`).

import { FachlicherFehler, regelAusVertrag } from "../../core";
import type {
  Cent,
  Charakter,
  Rhythmus,
  Vertrag,
  Verlaengerungsart,
  Vertragsart,
  Vertragsstatus,
  Vertragszahlung,
  Zahlungsregel,
  Regelvorlage,
} from "../../core";
import type {
  VertragRepository,
  VertragserkennungRepository,
  VertragszuordnungRepository,
} from "../ports";
import { vorzeichenbehaftet } from "../buchung/vorzeichen";
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
  /** Abo (kündbar, wird überwacht) oder Dauervertrag (Arbeit, Miete). Fehlend = Abo. */
  art?: Vertragsart;
  kuendigungsfristMonate?: number;
  notizen?: string;
  // --- Zahlungsseite (→ `Vertrag.zahlung`) ---
  betrag: Cent;
  rhythmus: Rhythmus;
  charakter: Charakter;
  kategorieId?: string;
  kontoId?: string;
  /**
   * Zielkonto einer geplanten Umbuchung. Gesetzt macht die Regel aus der Zahlung eine
   * Verschiebung zwischen zwei eigenen Konten — nur sinnvoll mit `charakter:
   * "Umschichtung"`, und nur dann wird es übernommen.
   */
  gegenkontoId?: string;
  /** Erste Fälligkeit der Zahlung; Standard = Vertragsbeginn. */
  ersteZahlung?: string;
  /**
   * SEPA-Gläubiger-ID, sofern bekannt (kommt aus einem übernommenen Vorschlag). Landet
   * nicht am Vertrag, sondern in seiner Erkennungsregel: dort ist sie der präziseste
   * Schlüssel, den es gibt — sie identifiziert den Einzieher, während der Name eine
   * Normalisierung mit Unschärfe bleibt.
   */
  glaeubigerId?: string;
  /**
   * Was an einer erkannten Zahlungsreihe GEMESSEN wurde — Betragsgrenzen und
   * Fälligkeitsfenster (siehe `core/regelvorlage`). Kommt aus einem übernommenen
   * Vorschlag und landet wie die Gläubiger-ID nicht am Vertrag, sondern in seiner
   * Erkennungsregel.
   *
   * Optional, und fehlend heisst „nichts beobachtet": ein von Hand erfasster Vertrag hat
   * keine Reihe hinter sich, und dann gilt allein, was sich aus seinem Betrag ableiten
   * lässt. Die Vorlage ERWEITERT damit die Standardregel, sie ersetzt sie nicht.
   */
  vorlage?: Regelvorlage;
}

export interface VertragErgebnis {
  vertrag: Vertrag;
  /** Die Regel, als die die Planung den Vertrag liest — gebaut, nicht gespeichert. */
  regel: Zahlungsregel;
}

function zahlungAus(eingabe: VertragEingabe): Vertragszahlung {
  return {
    betrag: vorzeichenbehaftet(eingabe.betrag, eingabe.charakter),
    rhythmus: eingabe.rhythmus,
    ersteZahlung: eingabe.ersteZahlung || eingabe.beginn,
    charakter: eingabe.charakter,
    kontoId: eingabe.kontoId || undefined,
    // Nur bei einer Umschichtung. Bei Aufwand oder Ertrag verlässt das Geld den
    // erfassten Bereich, und ein Gegenkonto behauptete etwas anderes — die Erkennung
    // suchte dann nach einem zweiten Bein, das es nie geben wird.
    gegenkontoId: eingabe.charakter === "Umschichtung" ? eingabe.gegenkontoId || undefined : undefined,
  };
}

export async function vertragAnlegen(
  vertragRepo: VertragRepository,
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
    art: eingabe.art ?? "abo",
    kuendigungsfristMonate: eingabe.kuendigungsfristMonate,
    status,
    // Die Kategorisierungs-Kette fragt den Vertrag danach, weil die Vertragszuordnung
    // auf ihn zeigt; die Planung liest dieselbe Kategorie über die gebaute Regel.
    kategorieId: eingabe.kategorieId || undefined,
    notizen: eingabe.notizen?.trim() || undefined,
    zahlung: zahlungAus(eingabe),
  };

  await vertragRepo.speichern(vertrag);
  if (zuordnung) {
    await erkennungSicherstellen(
      zuordnung.erkennungRepo,
      vertrag.id,
      anbieter,
      eingabe.betrag,
      eingabe.glaeubigerId,
      eingabe.vorlage,
    );
  }
  return { vertrag, regel: regelAusVertrag(vertrag)! };
}

/**
 * Aktualisiert einen bestehenden Vertrag samt seiner Zahlung (die Id bleibt).
 */
export async function vertragAktualisieren(
  vertragRepo: VertragRepository,
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
    art: eingabe.art ?? "abo",
    kuendigungsfristMonate: eingabe.kuendigungsfristMonate,
    status: bestehend?.status ?? "aktiv",
    kategorieId: eingabe.kategorieId || undefined,
    notizen: eingabe.notizen?.trim() || undefined,
    zahlung: zahlungAus(eingabe),
  };

  await vertragRepo.speichern(vertrag);
  // Nur anlegen, wenn noch keine Regel da ist — eine nachgesteuerte darf ein
  // Namenswechsel im Vertrag nicht wegwischen (siehe `erkennungSicherstellen`).
  if (zuordnung) {
    await erkennungSicherstellen(
      zuordnung.erkennungRepo,
      vertragId,
      anbieter,
      eingabe.betrag,
      eingabe.glaeubigerId,
      eingabe.vorlage,
    );
  }
  return { vertrag, regel: regelAusVertrag(vertrag)! };
}

/** Löscht einen Vertrag samt seiner Zahlung und seiner Zuordnungen. */
export async function vertragLoeschen(
  vertragRepo: VertragRepository,
  vertragId: string,
  zuordnung?: VertragZuordnungsDeps,
): Promise<void> {
  if (zuordnung) {
    await vertragszuordnungenAbraeumen(zuordnung.erkennungRepo, zuordnung.zuordnungRepo, vertragId);
  }
  await vertragRepo.loeschen(vertragId);
}
