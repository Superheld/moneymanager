// Eine Buchung, wie sie in einer Liste steht — EINE Form für jede Stelle, die Buchungen
// unter einer Auswertung zeigt (Budget in der Übersicht, Budget-Verlauf, Analyse).
//
// **Warum es das gibt.** Bis 2026-11-12 baute jede dieser Stellen ihre Zeile selbst, aus
// einem eigenen Typ (`Verbrauchsposten` plus Empfänger-Map, `Analysezeile`), und die
// Oberfläche setzte daraus je eigene Spalten zusammen. Ergebnis: dieselbe Buchung hiess
// unter einem Budget nach der Notiz und in der Analyse nach dem Empfänger, ihr Betrag
// stand einmal ohne und einmal mit Vorzeichen da, und Konto, Zweck und Vertrag kannte nur
// die Analyse. Der Umbau vom 09.11. hatte nur die FLÄCHE vereinheitlicht
// (`Aufklapptabelle`); der Inhalt war je Stelle geblieben.
//
// Was hier entschieden wird, gilt deshalb für alle:
//
// - **Der Name** nach EINER Regel (`buchungsname`) — dieselbe wie im Kontoauszug.
// - **Der Betrag mit Vorzeichen**, und zwar der, mit dem die Buchung in DIESER Auswertung
//   wirkt: bei einer geteilten Buchung ihr Anteil. Eine Liste unter einer Summe muss sich
//   auf diese Summe addieren.
//
// Die Monatskarten und der Kontoauszug bleiben eigene Formen: dort stehen auch geplante
// Posten, die keine Buchung sind, bzw. eine Arbeitsliste mit Saldo und Bearbeiten.

import type { Cent, IstBuchung, Kategorie, Zahlungskonto } from "../../core";
import type { Umsatz } from "../import/umsatz";
import { belegZuBuchung } from "./belegZuBuchung";

export interface Buchungszeile {
  /** Die Buchung selbst — zum Öffnen im Dialog. */
  readonly buchung: IstBuchung;
  /**
   * Der Betrag, mit dem die Buchung in DIESER Auswertung wirkt, mit Vorzeichen (eine
   * Ausgabe ist negativ). Bei einer geteilten Buchung ihr Anteil — nicht `buchung.betrag`.
   */
  readonly betrag: Cent;
  /** Nach `buchungsname`; leer, wenn die Buchung gar nichts trägt. */
  readonly name: string;
  readonly verwendungszweck: string;
  /** Die Kategorie DES ANTEILS, bei geteilten Buchungen nicht die der Buchung. */
  readonly kategorieName: string;
  readonly kontoName: string;
  /** Der Vertrag, zu dem die Buchung gehört — als Anbietername. Fehlt, wenn keiner. */
  readonly vertragsname?: string;
}

/** Was eine Zeile über die Buchung hinaus braucht — einmal je Sicht gebaut. */
export interface Zeilenkontext {
  readonly umsatzZuBuchung: ReadonlyMap<string, Umsatz>;
  readonly kontoNamen: ReadonlyMap<string, string>;
  readonly kategorieNamen: ReadonlyMap<string, string>;
  readonly vertragsnamen: ReadonlyMap<string, string>;
}

export function zeilenkontext(
  umsaetze: readonly Umsatz[],
  konten: readonly Zahlungskonto[],
  kategorien: readonly Kategorie[],
  vertragsnamen: ReadonlyMap<string, string>,
): Zeilenkontext {
  return {
    umsatzZuBuchung: belegZuBuchung(umsaetze),
    kontoNamen: new Map(konten.map((k) => [k.id, k.bezeichnung])),
    kategorieNamen: new Map(kategorien.map((k) => [k.id, k.name])),
    vertragsnamen,
  };
}

/**
 * Wie eine Buchung heisst — von der eigenen Angabe zur fremden:
 *
 *   eigene Notiz → Empfänger aus dem Import → Verwendungszweck
 *
 * Der Verwendungszweck steht in der Kette, weil ein Teil der Bankzeilen gar keinen
 * Empfänger mitbringt (MT940 füllt das Feld je nach Institut nicht); ohne ihn stünde die
 * Zeile ohne Beschriftung da, obwohl die Angabe vorhanden ist. Die Kategorie steht NICHT
 * in der Kette: sie hat ihre eigene Spalte, und als Name gelesen sähe sie aus wie ein
 * Empfänger.
 */
export function buchungsname(notiz: string | undefined, umsatz: Umsatz | undefined): string {
  return notiz || umsatz?.gegenpartei || umsatz?.verwendungszweck || "";
}

export function buchungszeile(
  buchung: IstBuchung,
  betrag: Cent,
  kategorieId: string | undefined,
  k: Zeilenkontext,
): Buchungszeile {
  const umsatz = k.umsatzZuBuchung.get(buchung.id);
  return {
    buchung,
    betrag,
    name: buchungsname(buchung.notiz, umsatz),
    verwendungszweck: umsatz?.verwendungszweck ?? "",
    kategorieName: kategorieId ? k.kategorieNamen.get(kategorieId) ?? "" : "",
    kontoName: k.kontoNamen.get(buchung.kontoId) ?? "",
    vertragsname: k.vertragsnamen.get(buchung.id),
  };
}
