// Umsatz — Aggregat des Import-Kontexts (TAKTIK-IMPORT §1). Der eingelesene Bankdatensatz
// mit eigenem Lebenszyklus; er überlebt den Import-Lauf und wird erst beim Verbuchen zur
// Ist-Buchung im Ledger. Reine Domäne (kein IO).
//
// Statusmaschine (Invariante):
//   neu ──verbuchen──▶ verbucht        (verbucht ⇒ istbuchungId vorhanden)
//    │  └─verwerfen──▶ verworfen
//    └────alsDuplikat▶ duplikat
// verbucht/duplikat/verworfen sind terminal. Im Status „neu" ist der Kategorie-Vorschlag
// frei editierbar — es gibt bewusst KEINE Zwischenstände „kategorisiert" und
// „bestätigt": die Review-Schicht arbeitet auf `vorschlag`, und ein eigener Status
// dafür wäre eine zweite Aussage über dasselbe (ist ein Vorschlag da oder nicht).

import { FachlicherFehler, type Cent, type Charakter } from "../../core";
import type { RohSammelposten } from "./rohUmsatz";
import type { Beleg } from "./belege";

export type UmsatzStatus = "neu" | "verbucht" | "duplikat" | "verworfen";

/** Woher der Kategorie-Vorschlag stammt — Transparenz und Basis des späteren Lern-Loops. */
export type VorschlagQuelle =
  | "umbuchung"
  | "manuell"
  | "regel"
  /** Die Quelldatei brachte eine Kategorie mit, die ihr Adapter übersetzen konnte. */
  | "fremdkategorie"
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
  /** SEPA-Verwendungszweckcode (`SALA`, `RENT` …) — eine Einordnung der Bank, nur CAMT. */
  readonly zweckCode?: string;
  /** Der Empfänger hinter einem Zahlungsdienstleister, soweit die Quelle ihn nennt. */
  readonly endempfaenger?: string;
  /** Institutseigene Referenz aus dem Freitext — Diagnose, ausdrücklich kein Schlüssel. */
  readonly bankreferenz?: string;
  // Vier CAMT-Angaben, die heute NICHTS auswertet. Sie stehen hier, weil ein Institut
  // Umsätze nur begrenzt vorhält: was nicht abgeholt wird, ist für die Vergangenheit
  // nicht nachzuholen. Die Begründung je Feld steht an `RohUmsatz`.
  /** `NtryRef` — die Referenz der Bank für den Eintrag, neben `bankreferenz`. Nur CAMT. */
  readonly eintragReferenz?: string;
  /** `BkTxCd.Prtry.Cd` — SWIFT-Typ und Geschäftsvorfallcode, das CAMT-Gegenstück zu `buchungsschluessel`. */
  readonly bankBuchungscode?: string;
  /** `Refs.TxId` — die Transaktionskennung der Bank. Kein Dedup-Schlüssel, siehe `RohUmsatz`. */
  readonly transaktionsId?: string;
  /** `RmtInf.Strd.CdtrRefInf.Ref` — die strukturierte Referenz eines Vorgangs (ISO 11649). */
  readonly strukturierteReferenz?: string;
  /** Die Zahlungen hinter einer Sammelbuchung, wo es mehrere sind. Siehe `RohUmsatz`. */
  readonly sammelposten?: readonly RohSammelposten[];
  /**
   * `BOOK` / `PDNG` / `INFO` — ob die BANK gebucht hat. Nur CAMT. Nicht zu verwechseln
   * mit `status` weiter unten: der ist unser Verarbeitungsstand. Siehe `RohUmsatz`.
   */
  readonly buchungsstand?: string;
  /** Ob die Zeile eine frühere aufhebt. Nur CAMT. */
  readonly istStorno?: boolean;
  /** Betrag vor der Umrechnung und der Kurs dazu — bei Zahlungen in fremder Währung. */
  readonly originalBetrag?: Cent;
  readonly originalWaehrung?: string;
  readonly wechselkurs?: number;
  /** Was die Bank für die Buchung genommen hat, wo sie es getrennt ausweist. */
  readonly gebuehrBetrag?: Cent;
  readonly gebuehrWaehrung?: string;
  /** Warum eine Zahlung zurückkam — Code und Text der Bank. */
  readonly ruecklaufCode?: string;
  readonly ruecklaufText?: string;
  /** MT940 die Kundenreferenz aus `:61:`, CAMT die E2E-Referenz — formatabhängig. */
  readonly kundenreferenz?: string;
  /** Was die Bank sonst noch sagte, unter den Namen der Bibliothek. Siehe `RohUmsatz`. */
  readonly bankfelder?: Readonly<Record<string, unknown>>;
  /** Quellen-agnostischer Dedup-Schlüssel (siehe rohHash). */
  readonly rohHash: string;
  /** Stabile native ID der Quelle (Finanzguru Buchungs-ID) — exakte Re-Import-Dedup. */
  readonly nativeId?: string;
  /**
   * Die Belege, aus denen diese Zahlung besteht — mindestens einer.
   *
   * Die Felder oben sind das ERGEBNIS ihrer Zusammenfuehrung (`belege.ts`), nicht der
   * Inhalt einer einzelnen Zeile. Wer wissen will, woher ein Wert stammt, sieht hier
   * nach: je Beleg stehen Quelle, Format und Lauf daneben.
   *
   * Optional, damit ein von Hand gebauter `Umsatz` in Tests nicht jedes Mal eine
   * Belegliste mitschleppen muss. Aus der Persistenz kommt sie immer.
   */
  readonly belege?: readonly Beleg[];
  readonly status: UmsatzStatus;
  readonly vorschlag?: Kategorisierungsvorschlag;
  /** Gesetzt genau dann, wenn status === "verbucht". */
  readonly istbuchungId?: string;
  // KEIN Dublettenverdacht an der Zeile. Er stand hier einmal und wurde beim Import
  // angeschrieben — gelesen hat ihn nie jemand. Alle Anzeigen rechnen ihn beim HINSEHEN
  // (`dubletten/dublettensicht.ts`), und das ist die richtige Stelle: ein angeschriebener
  // Verdacht gilt für den Stand von damals und wird nie korrigiert, wenn später aus einer
  // anderen Quelle etwas dazukommt.
}

// `ergaenze` stand hier bis zum 06.09.2026 und ist ersatzlos weg.
//
// Sie war die Antwort auf „nicht doppeln, wenn dann ergänzen": erkannte der
// Dublettenfinder eine Buchung wieder, bekam die VORHANDENE Zeile die fehlenden Felder
// und die eingehende verschwand. Der Preis war hoch und lange unsichtbar — wer erst aus
// einer Fremdsoftware importierte und danach dieselben Monate bei der Bank abrief, verlor
// die Bankfassung, und ein Institut hält Umsätze nur begrenzt vor.
//
// An ihre Stelle tritt `belege.ts`: die zweite Fassung legt sich als eigener Beleg
// daneben, und welcher Wert gilt, entscheidet das LESEN. Damit fällt auch die letzte
// Ausnahme von „ein Beleg ist unveränderlich" weg.

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
