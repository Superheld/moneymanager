// Use-Case „Buchung splitten" (S-7) — eine Buchung auf mehrere Kategorien aufteilen
// (Wocheneinkauf: Lebensmittel + Drogerie + Tierbedarf).
//
// Was sich NICHT ändert: der Ledger-Betrag. Die Buchung bleibt EINE Zeile mit ihrem
// vollen Betrag; Saldo, Konto-Register und die Netto-Null von Umbuchungen rechnen
// unverändert weiter. Aufgeteilt wird allein die Kategorie-Zuordnung — deshalb hängen
// die Teile als Value Objects am Aggregat und nicht als eigene Buchungen im Journal.
//
// Nicht zu verwechseln mit den Split-Zeilen, die Finanzguru selbst liefert
// (`adapters/import/finanzguruAdapter.ts` zählt sie und warnt). Deren Mehrfachzählung ist
// ein Import-Thema und wird hier nicht gelöst — das Modell trägt beide Fälle, der Weg
// dorthin ist ein anderer.

import {
  FachlicherFehler,
  aufteilungsSumme,
  istCent,
  type Aufteilung,
  type IstBuchung,
} from "../../core";
import type { LedgerPort } from "../ports";

/** Eingabe einer Teilzeile — Betrag POSITIV, das Vorzeichen kommt von der Buchung. */
export interface AufteilungEingabe {
  kategorieId: string;
  betrag: number;
  notiz?: string;
}

/**
 * Teilt eine Buchung auf. Prüft an der Anwendungsgrenze:
 *  • mindestens zwei Teile (ein Teil ist kein Split, das ist eine Kategorie),
 *  • jeder Teil mit Kategorie und mit einem Betrag > 0 in ganzen Cent,
 *  • Σ Teile trifft den Betrag der Buchung EXAKT — kein Rest, kein Rundungsschlupf.
 *
 * Umbuchungs-Beine sind ausgenommen: sie tragen keine Kategorie und sind keine Ausgabe,
 * ein Split hätte dort keine Bedeutung.
 */
export async function buchungSplitten(
  ledger: LedgerPort,
  buchung: IstBuchung,
  eingaben: readonly AufteilungEingabe[],
): Promise<IstBuchung> {
  if (buchung.transferId) throw new FachlicherFehler("split.umbuchung");
  if (eingaben.length < 2) throw new FachlicherFehler("split.zweiTeile");

  const vorzeichen = buchung.betrag < 0 ? -1 : 1;
  const teile: Aufteilung[] = [];
  for (const e of eingaben) {
    if (!e.kategorieId) throw new FachlicherFehler("kategorie.waehlen");
    if (!istCent(e.betrag) || e.betrag <= 0) throw new FachlicherFehler("betrag.groesserNull");
    teile.push({
      kategorieId: e.kategorieId,
      betrag: vorzeichen * e.betrag,
      notiz: e.notiz?.trim() || undefined,
    });
  }

  const summe = aufteilungsSumme(teile);
  if (summe !== buchung.betrag) {
    throw new FachlicherFehler("split.summe", { differenz: buchung.betrag - summe });
  }

  // Die Teile sind ab jetzt die Wahrheit — eine Buchung mit BEIDEM hätte zwei davon.
  const geteilt: IstBuchung = { ...buchung, kategorieId: undefined, aufteilungen: teile };
  await ledger.speichern(geteilt);
  return geteilt;
}

/**
 * Hebt eine Aufteilung auf. Die Buchung fällt auf „eine Kategorie" zurück — welche, weiß
 * niemand mehr, deshalb bleibt sie leer statt zu raten. Der Betrag war nie geteilt und
 * ändert sich nicht.
 */
export async function splitAufheben(ledger: LedgerPort, buchung: IstBuchung): Promise<IstBuchung> {
  // Auch die Herkunft zurücksetzen: die Buchung steht jetzt ohne Kategorie da, und ein
  // stehengebliebenes „manuell" würde sie dauerhaft von jeder Automatik ausschließen —
  // ausgerechnet in dem Zustand, in dem sie einen Vorschlag am nötigsten hat.
  const ungeteilt: IstBuchung = {
    ...buchung,
    aufteilungen: undefined,
    kategorieId: undefined,
    kategorieHerkunft: undefined,
  };
  await ledger.speichern(ungeteilt);
  return ungeteilt;
}

/**
 * Was von einer Buchung noch zu verteilen ist — für die Rest-Anzeige im Dialog.
 * Positiv = noch offen, negativ = zu viel verteilt. Rechnet in Beträgen OHNE Vorzeichen,
 * weil die Eingabe positiv ist.
 */
export function offenerRest(buchung: IstBuchung, eingaben: readonly AufteilungEingabe[]): number {
  const verteilt = eingaben.reduce((s, e) => s + (Number.isFinite(e.betrag) ? e.betrag : 0), 0);
  return Math.abs(buchung.betrag) - verteilt;
}
