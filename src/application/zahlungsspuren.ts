// Zahlungsspuren — der gebuchte Bestand in der Form, in der der Kern über Verträge
// nachdenkt (`core/vertragErkennung#Zahlungsspur`).
//
// Warum eine eigene Stelle: Empfänger und Gläubiger-ID stehen am `Umsatz`
// (Import-Kontext), Betrag und Datum an der `IstBuchung` — verbunden über
// `umsatz.istbuchungId`. Dieses Zusammenführen brauchen inzwischen zwei Wege (die
// Vorschläge und der Zuordnungs-Abgleich), und es zweimal zu schreiben hieße, zwei
// Antworten auf dieselbe Frage zu haben.

import type { Zahlungsspur } from "../core";
import type { LedgerPort, UmsatzRepository } from "./ports";

export async function zahlungsspuren(
  ledger: LedgerPort,
  umsatzRepo: UmsatzRepository,
): Promise<Zahlungsspur[]> {
  const [buchungen, umsaetze] = await Promise.all([ledger.alle(), umsatzRepo.alle()]);

  // Ein Umsatz je Buchung; bei mehreren gewinnt der erste — Empfänger und Gläubiger-ID
  // sind bei allen dieselben, sie stammen aus derselben Quellzeile.
  const umsatzZuBuchung = new Map<string, (typeof umsaetze)[number]>();
  for (const u of umsaetze) {
    if (u.istbuchungId && !umsatzZuBuchung.has(u.istbuchungId)) umsatzZuBuchung.set(u.istbuchungId, u);
  }

  return buchungen.map((b) => {
    const u = umsatzZuBuchung.get(b.id);
    return {
      id: b.id,
      datum: b.datum,
      betrag: b.betrag,
      gegenpartei: u?.gegenpartei ?? "",
      glaeubigerId: u?.glaeubigerId,
      kategorieId: b.kategorieId,
      kontoId: b.kontoId,
      charakter: b.charakter,
    };
  });
}
