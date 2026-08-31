// Zahlungsspuren — der gebuchte Bestand in der Form, in der Vertragserkennung und
// Kategorisierung über ihn nachdenken (`core/vertragErkennung#Zahlungsspur`).
//
// Warum es diese Stelle gibt: Empfänger, Verwendungszweck und Gläubiger-ID stehen am
// `Umsatz` (Import-Kontext), Betrag und Datum an der `IstBuchung` — verbunden über
// `umsatz.istbuchungId`. Dieses Zusammenführen brauchen inzwischen mehrere Wege, und es
// mehrfach zu schreiben hieße, mehrere Antworten auf dieselbe Frage zu haben. Genau das
// war bis 2026-08-29 der Fall: `budgets/budgetvorschlaege` trug eine zweite, ÄRMERE
// Kopie desselben Joins (ohne Verwendungszweck, Herkunft, Aufteilung und Konto).
//
// **Laden und Zusammenführen sind getrennt**, und daran hing die Auflösung dieser
// Dublette: wer die Buchungen ohnehin schon geladen hat, ruft `spurenAus` auf und lädt
// sie nicht ein zweites Mal. Nur wer nichts hat, nimmt `zahlungsspuren`. Ohne die
// Trennung hätte der zweite Weg entweder doppelt geladen oder seinen eigenen Join
// behalten — und der erste Preis wird gezahlt, der zweite bleibt.

import { istGeteilt, type IstBuchung, type Zahlungsspur } from "../../core";
import type { Umsatz } from "../import/umsatz";
import { belegZuBuchung } from "./belegZuBuchung";
import type { LedgerPort, UmsatzRepository } from "../ports";

/** Die Spuren aus bereits geladenen Buchungen und Umsätzen — rein, kein IO. */
export function spurenAus(
  buchungen: readonly IstBuchung[],
  umsaetze: readonly Umsatz[],
): Zahlungsspur[] {
  const umsatzZuBuchung = belegZuBuchung(umsaetze);

  return buchungen.map((b) => {
    const u = umsatzZuBuchung.get(b.id);
    return {
      id: b.id,
      datum: b.datum,
      betrag: b.betrag,
      gegenpartei: u?.gegenpartei ?? "",
      verwendungszweck: u?.verwendungszweck ?? "",
      glaeubigerId: u?.glaeubigerId,
      kategorieId: b.kategorieId,
      kategorieHerkunft: b.kategorieHerkunft,
      geteilt: istGeteilt(b),
      kontoId: b.kontoId,
      gegenkontoId: b.gegenkontoId,
      charakter: b.charakter,
    };
  });
}

/** Dieselben Spuren, aber der Weg lädt sich seine Zutaten selbst. */
export async function zahlungsspuren(
  ledger: LedgerPort,
  umsatzRepo: UmsatzRepository,
): Promise<Zahlungsspur[]> {
  const [buchungen, umsaetze] = await Promise.all([ledger.alle(), umsatzRepo.alle()]);
  return spurenAus(buchungen, umsaetze);
}
