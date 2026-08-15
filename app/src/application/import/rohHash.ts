// Roh-Hash + Duplikaterkennung (TAKTIK-IMPORT §2/§3). Quellen-AGNOSTISCH: derselbe
// Schlüssel entsteht aus Konto + Datum + Betrag + normalisiertem Zweck, egal aus welcher
// Quelle — so greift die Dedup später auch über Quellen hinweg (Bank-CSV ↔ Finanzguru).
// Kein kryptografischer Hash (Webview-kompatibel, kein node:crypto): ein normalisierter
// Verbund-Schlüssel reicht und bleibt nebenbei lesbar/debugbar.
//
// Gewählte Strategie (Bruce): native ID UND Roh-Hash. Die native Buchungs-ID fängt exakte
// Re-Imports derselben Quelle ab; der Roh-Hash fängt dieselbe Buchung aus anderer Quelle.
//
// OFFEN — Altbestand (Stand 2026-08-15): Die Formel wurde um die Gegenpartei erweitert.
// Bereits gespeicherte Umsätze tragen weiter den alten Schlüssel in `umsatz.roh_hash`.
// Solange jede Quelle native IDs liefert (heute: Finanzguru, alle 5198 Bestandszeilen),
// ist das folgenlos — die Dedup entscheidet dort über die ID, nicht über den Hash.
// VOR der ersten ID-losen Quelle (Bank-CSV, FinTS) müssen die Bestands-Hashes einmalig
// neu berechnet werden, sonst deduppt der erste Abruf nicht gegen den Bestand und legt
// alles doppelt an. Der Backfill braucht die Konto-IBAN, die nicht am Umsatz, sondern am
// Zahlungskonto liegt (Join über zahlungskonto_id).

import { normalisiereIban } from "../../core";
import type { RohUmsatz } from "./rohUmsatz";

function normZweck(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function rohHash(
  u: Pick<RohUmsatz, "kontoIban" | "buchungstag" | "betrag" | "verwendungszweck" | "gegenpartei">,
): string {
  const konto = u.kontoIban ? normalisiereIban(u.kontoIban) : "";
  // Die Gegenpartei gehört in den Schlüssel: bei Kartenzahlungen ist der Verwendungszweck
  // regelmäßig leer, dann unterscheiden Konto+Tag+Betrag zwei verschiedene Händler nicht
  // mehr — und die zweite Buchung würde als Dublette verworfen. Im Bestand vom 2026-08-15
  // trafen 7 Hash-Gruppen genau diesen Fall.
  //
  // JSON statt "|"-Verkettung, damit die Feldgrenzen eindeutig bleiben: ein "|" im
  // Referenzkonto konnte vorher einen Schlüssel nachbauen, der zu einer anderen Buchung
  // gehört.
  return JSON.stringify([
    konto,
    u.buchungstag,
    u.betrag,
    normZweck(u.gegenpartei),
    normZweck(u.verwendungszweck),
  ]);
}

export interface Bestand {
  readonly hashes: Iterable<string>;
  readonly nativeIds: Iterable<string>;
}

export interface DublettenBefund<T> {
  readonly neu: T[];
  readonly duplikate: T[];
}

/**
 * Teilt Kandidaten in neu/duplikat — gegen den Bestand UND innerhalb des Stapels.
 *
 * Schlüsselwahl pro Kandidat:
 *  - MIT native ID: nur die ID entscheidet. Dieselbe Quelle vergibt eindeutige IDs, also
 *    sind zwei Zeilen mit verschiedenen IDs verschiedene Buchungen — auch wenn Tag/Betrag/
 *    Zweck zufällig kollidieren (z. B. zweimal derselbe Kaffee). Verhindert falsch-positive
 *    Dubletten, die echte Buchungen verschlucken würden.
 *  - OHNE native ID: der Roh-Hash entscheidet (so deduppt eine ID-lose Quelle gegen alles
 *    Bisherige, auch quellenübergreifend).
 * Der Roh-Hash wird für JEDEN neuen Umsatz mitgeschrieben, damit eine spätere ID-lose
 * Quelle gegen ihn matchen kann.
 */
export function klassifiziere<T extends { rohHash: string; nativeId?: string }>(
  kandidaten: readonly T[],
  bestand: Bestand,
): DublettenBefund<T> {
  const hashes = new Set(bestand.hashes);
  const nativeIds = new Set(bestand.nativeIds);
  const neu: T[] = [];
  const duplikate: T[] = [];
  for (const k of kandidaten) {
    const dup = k.nativeId !== undefined ? nativeIds.has(k.nativeId) : hashes.has(k.rohHash);
    if (dup) {
      duplikate.push(k);
      continue;
    }
    neu.push(k);
    hashes.add(k.rohHash);
    if (k.nativeId !== undefined) nativeIds.add(k.nativeId);
  }
  return { neu, duplikate };
}
