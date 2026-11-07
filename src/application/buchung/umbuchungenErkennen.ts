// Use-Case „Umbuchungen erkennen": nach dem Verbuchen zwei Buchungen verbinden, die
// nachweislich dieselbe Umbuchung sind. Die Regel steht in `core/buchung/exakteUmbuchung`,
// das Verbinden ist dasselbe wie von Hand (`buchungenPaaren`).
//
// Der Grund für einen eigenen Schritt NACH dem Verbuchen: **die zwei Beine kommen fast nie
// im selben Lauf.** Ein Abruf gilt genau einem Konto, also trifft `paareUmbuchungen`
// (das nur den laufenden Stapel sieht) sie nie an. Hier sucht jedes neue Bein auch im
// schon Gebuchten.
//
// Es läuft bewusst nicht in `umsaetzeVerbuchen`: der Use-Case schreibt Fakten ins Ledger,
// die Verbindung ist eine Interpretation darüber. Und nicht dort, wo jemand gerade eine
// einzelne Zeile entscheidet (`BuchungDetail`): die Automatik käme ihm zuvor.

import { exakteUmbuchungen, kontenNachIban } from "../../core";
import type { LedgerPort, UmsatzRepository, ZahlungskontoRepository } from "../ports";
import { buchungenPaaren, MAX_VORSCHLAG_TAGE } from "./umbuchungAusBuchung";

export interface UmbuchungenErkennenDeps {
  readonly ledgerRepo: LedgerPort;
  readonly umsatzRepo: UmsatzRepository;
  readonly kontoRepo: ZahlungskontoRepository;
}

/**
 * Sucht zu den frisch verbuchten Umsätzen ihre Gegenbeine und verbindet, was exakt passt.
 * Gibt die Zahl der entstandenen Umbuchungen zurück.
 *
 * Das Zeitfenster ist dasselbe wie bei den Vorschlägen im Dialog und nicht die drei Tage
 * der Stapelpaarung: dort entscheidet allein das Datum mit, hier stehen Absender und Ziel
 * fest, und eine Überweisung zwischen zwei Banken darf ihre Zeit brauchen.
 *
 * Beide Beine werden als „noch anzusehen" markiert, auch das schon gesehene: an ihm hat
 * sich gerade etwas geändert, ohne dass jemand dabei war.
 */
export async function umbuchungenErkennen(
  umsatzIds: readonly string[],
  deps: UmbuchungenErkennenDeps,
): Promise<number> {
  if (umsatzIds.length === 0) return 0;

  const [buchungen, umsaetze, konten] = await Promise.all([
    deps.ledgerRepo.alle(),
    deps.umsatzRepo.alle(),
    deps.kontoRepo.alle(),
  ]);

  const frisch = new Set(umsatzIds);
  const neueIds = new Set<string>();
  const gegenIbanNachBuchung = new Map<string, string>();
  for (const u of umsaetze) {
    if (!u.istbuchungId) continue;
    if (frisch.has(u.id)) neueIds.add(u.istbuchungId);
    if (u.gegenparteiIban) gegenIbanNachBuchung.set(u.istbuchungId, u.gegenparteiIban);
  }

  const paare = exakteUmbuchungen({
    neueIds,
    buchungen,
    gegenIbanNachBuchung,
    kontoNachIban: kontenNachIban(konten),
    maxTage: MAX_VORSCHLAG_TAGE,
  });

  for (const [ab, zu] of paare) {
    await buchungenPaaren(deps.ledgerRepo, { ...ab, zuPruefen: true }, { ...zu, zuPruefen: true });
  }
  return paare.length;
}
