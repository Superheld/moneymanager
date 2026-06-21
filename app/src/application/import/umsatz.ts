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

export type UmsatzStatus = "neu" | "verbucht" | "duplikat" | "verworfen";

/** Woher der Kategorie-Vorschlag stammt — Transparenz und Basis des späteren Lern-Loops. */
export type VorschlagQuelle = "remapping" | "umbuchung" | "manuell" | "regel" | "ki";

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
  /** Quellen-agnostischer Dedup-Schlüssel (siehe rohHash). */
  readonly rohHash: string;
  /** Stabile native ID der Quelle (Finanzguru Buchungs-ID) — exakte Re-Import-Dedup. */
  readonly nativeId?: string;
  readonly status: UmsatzStatus;
  readonly vorschlag?: Kategorisierungsvorschlag;
  /** Gesetzt genau dann, wenn status === "verbucht". */
  readonly istbuchungId?: string;
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
