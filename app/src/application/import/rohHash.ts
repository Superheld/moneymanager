// Roh-Hash + Duplikaterkennung (TAKTIK-IMPORT §2/§3). Quellen-AGNOSTISCH: derselbe
// Schlüssel entsteht aus Konto + Datum + Betrag + normalisiertem Zweck, egal aus welcher
// Quelle — so greift die Dedup später auch über Quellen hinweg (Bank-CSV ↔ Finanzguru).
// Kein kryptografischer Hash (Webview-kompatibel, kein node:crypto): ein normalisierter
// Verbund-Schlüssel reicht und bleibt nebenbei lesbar/debugbar.
//
// Gewählte Strategie (Bruce): native ID UND Roh-Hash. Die native Buchungs-ID fängt exakte
// Re-Imports derselben Quelle ab; der Roh-Hash fängt dieselbe Buchung aus anderer Quelle.

import { normalisiereIban } from "../../core";
import type { RohUmsatz } from "./rohUmsatz";

function normZweck(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function rohHash(
  u: Pick<RohUmsatz, "kontoIban" | "buchungstag" | "betrag" | "verwendungszweck">,
): string {
  const konto = u.kontoIban ? normalisiereIban(u.kontoIban) : "";
  return [konto, u.buchungstag, u.betrag, normZweck(u.verwendungszweck)].join("|");
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
