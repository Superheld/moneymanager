// Umsatz — Aggregat des Import-Kontexts (TAKTIK-IMPORT §1). Der eingelesene Bankdatensatz
// mit eigenem Lebenszyklus; er überlebt den Import-Lauf und wird erst beim Verbuchen zur
// Ist-Buchung im Ledger. Reine Domäne (kein IO).
//
// Statusmaschine (Invariante):
//   neu ──verbuchen──▶ verbucht        (verbucht ⇒ istbuchungId vorhanden)
//    │  └─verwerfen──▶ verworfen
//    └────alsDuplikat▶ duplikat
// verbucht/duplikat/verworfen sind terminal. Im Status „neu" ist der Kategorie-Vorschlag
// frei editierbar (das deckt TAKTIK-IMPORTs „kategorisiert/bestätigt" pragmatisch ab —
// die Review-Schicht arbeitet auf `vorschlag`, nicht auf eigenen Zwischenständen).

import { FachlicherFehler, type Cent, type Charakter } from "../../core";
import type { RohUmsatz } from "./rohUmsatz";

export type UmsatzStatus = "neu" | "verbucht" | "duplikat" | "verworfen";

/** Woher der Kategorie-Vorschlag stammt — Transparenz und Basis des späteren Lern-Loops. */
export type VorschlagQuelle =
  | "remapping"
  | "umbuchung"
  | "manuell"
  | "festlegung"
  | "regel"
  | "ki";

export interface Kategorisierungsvorschlag {
  /** Ziel-Kategorie; optional, weil Umbuchungen/unklare (noch) keine konkrete Kategorie haben. */
  readonly kategorieId?: string;
  readonly charakter: Charakter;
  readonly quelle: VorschlagQuelle;
}

export interface Umsatz {
  readonly id: string;
  /** Herkunft: der ImportLauf, aus dem dieser Umsatz stammt. */
  readonly laufId: string;
  /** Zugeordnetes Zahlungskonto (aus dem Konto-Match). */
  readonly zahlungskontoId: string;
  readonly buchungstag: string; // ISO
  readonly valuta?: string; // ISO
  readonly betrag: Cent;
  readonly waehrung: string;
  readonly gegenpartei: string;
  readonly verwendungszweck: string;
  /** SEPA-Gläubiger-ID der Gegenpartei, falls die Quelle sie liefert. Schlüssel für die
   *  Vertragserkennung: eindeutiger als ein Empfängername. */
  readonly glaeubigerId?: string;
  /** IBAN der Gegenpartei, falls die Quelle sie liefert — starkes Signal beim Abgleich. */
  readonly gegenparteiIban?: string;
  /** SEPA-Mandatsreferenz; mit der Gläubiger-ID der einzige echte Bankschlüssel. */
  readonly mandatsreferenz?: string;
  /** SEPA-End-to-End-Referenz, soweit die Quelle sie liefert. */
  readonly e2eReferenz?: string;
  /** Art der Buchung in der Sprache der Quelle („KARTENVERFÜGUNG" / „Kartenzahlung"). */
  readonly umsatzart?: string;
  /** Geschäftsvorfallcode der Bank (MT940 `:61:`). */
  readonly buchungsschluessel?: string;
  /** Institutseigene Referenz aus dem Freitext — Diagnose, ausdrücklich kein Schlüssel. */
  readonly bankreferenz?: string;
  /** Quellen-agnostischer Dedup-Schlüssel (siehe rohHash). */
  readonly rohHash: string;
  /** Stabile native ID der Quelle (Finanzguru Buchungs-ID) — exakte Re-Import-Dedup. */
  readonly nativeId?: string;
  readonly status: UmsatzStatus;
  readonly vorschlag?: Kategorisierungsvorschlag;
  /** Gesetzt genau dann, wenn status === "verbucht". */
  readonly istbuchungId?: string;
  /**
   * Verdacht des Dublettenfinders: auf welchen vorhandenen Umsatz diese Zeile
   * vermutlich zeigt. Bewusst KEIN eigener Status — die Zeile ist ganz normal „neu"
   * und lässt sich verbuchen; der Verdacht ist ein Hinweis für die Durchsicht, keine
   * Sperre.
   */
  readonly verdachtAufId?: string;
  /** Warum der Finder das vermutet — in Klartext, für die Anzeige. */
  readonly verdachtGruende?: readonly string[];
}

/**
 * Trägt nach, was eine andere Quelle mehr weiß — und nur das.
 *
 * Das ist die Antwort auf „nicht doppeln, wenn dann ergänzen": erkennt der
 * Dublettenfinder eine Buchung wieder, entsteht keine zweite Zeile, sondern die
 * vorhandene bekommt die Felder, die ihr fehlen. Bestehende Werte werden NIE
 * überschrieben — die erste Quelle behält recht, denn sie hat die Zeile erzeugt und
 * alles daran (Vorschlag, Verbuchung, Aufteilungen) hängt an ihr.
 *
 * Gibt `null` zurück, wenn nichts zu ergänzen war; dann muss auch nichts geschrieben
 * werden.
 */
export function ergaenze(u: Umsatz, roh: RohUmsatz): Umsatz | null {
  const ergaenzt: Umsatz = {
    ...u,
    valuta: u.valuta ?? roh.valuta,
    glaeubigerId: u.glaeubigerId ?? roh.glaeubigerId,
    gegenparteiIban: u.gegenparteiIban ?? roh.gegenparteiIban,
    mandatsreferenz: u.mandatsreferenz ?? roh.mandatsreferenz,
    e2eReferenz: u.e2eReferenz ?? roh.e2eReferenz,
    umsatzart: u.umsatzart ?? roh.umsatzart,
    buchungsschluessel: u.buchungsschluessel ?? roh.buchungsschluessel,
    bankreferenz: u.bankreferenz ?? roh.bankreferenz,
    // Die native ID der ANDEREN Quelle nur setzen, wenn noch keine dasteht: sie ist der
    // Schlüssel für den Reimport genau dieser Quelle.
    nativeId: u.nativeId ?? roh.nativeId,
  };
  const felder: (keyof Umsatz)[] = [
    "valuta", "glaeubigerId", "gegenparteiIban", "mandatsreferenz",
    "e2eReferenz", "umsatzart", "buchungsschluessel", "bankreferenz", "nativeId",
  ];
  return felder.some((f) => ergaenzt[f] !== u[f]) ? ergaenzt : null;
}

function nurNeu(u: Umsatz, aktion: string): void {
  if (u.status !== "neu") {
    throw new FachlicherFehler("import.umsatz.terminal", { status: u.status, aktion });
  }
}

/** Setzt/ersetzt den Kategorie-Vorschlag (nur im Status „neu"). */
export function kategorisieren(u: Umsatz, vorschlag: Kategorisierungsvorschlag): Umsatz {
  nurNeu(u, "kategorisieren");
  return { ...u, vorschlag };
}

/** Verbucht den Umsatz: neu → verbucht, verknüpft die erzeugte Ist-Buchung. */
export function verbuchen(u: Umsatz, istbuchungId: string): Umsatz {
  nurNeu(u, "verbuchen");
  if (!istbuchungId) throw new FachlicherFehler("import.umsatz.istbuchungFehlt");
  return { ...u, status: "verbucht", istbuchungId };
}

/** Markiert den Umsatz als Dublette (Endzustand, wird nicht verbucht). */
export function alsDuplikat(u: Umsatz): Umsatz {
  nurNeu(u, "alsDuplikat");
  return { ...u, status: "duplikat" };
}

/** Verwirft den Umsatz aus dem Entwurfs-Stapel (Endzustand). */
export function verwerfen(u: Umsatz): Umsatz {
  nurNeu(u, "verwerfen");
  return { ...u, status: "verworfen" };
}

/**
 * Holt eine weggelegte Zeile zurück in den Entwurfs-Stapel (verworfen/duplikat → neu).
 *
 * Der Rückweg fehlte, und das war ein Loch mit Folgen: „verworfen" heißt bei einer
 * BANKZEILE nicht „gab es nicht", sondern „ich buche sie nicht". Wer sich dabei vertut,
 * verliert nicht nur die Zeile, sondern den Betrag im Kontostand — und weil verworfene
 * Zeilen nirgends angezeigt wurden, gab es weder Hinweis noch Weg zurück. Die Daten waren
 * die ganze Zeit da; erreichbar waren sie nicht.
 *
 * Verbuchte bleiben außen vor: die haben mit `zuruecksetzen` einen eigenen Rückweg, der
 * zusätzlich die Ist-Buchung berücksichtigen muss.
 */
export function zurueckholen(u: Umsatz): Umsatz {
  if (u.status !== "verworfen" && u.status !== "duplikat") {
    throw new FachlicherFehler("import.umsatz.nichtWeggelegt", { status: u.status });
  }
  return { ...u, status: "neu" };
}

/**
 * Setzt einen verbuchten Umsatz zurück in die Inbox (verbucht → neu) — die Umkehrung von
 * verbuchen, z. B. wenn die erzeugte Ist-Buchung im Konto gelöscht wurde. Die Ist-Buchungs-
 * Referenz fällt weg; der Kategorie-Vorschlag bleibt erhalten.
 */
export function zuruecksetzen(u: Umsatz): Umsatz {
  if (u.status !== "verbucht") throw new FachlicherFehler("import.umsatz.nichtVerbucht", { status: u.status });
  return { ...u, status: "neu", istbuchungId: undefined };
}
