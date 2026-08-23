// Use-Case „Budget anlegen". Eindeutigkeit „ein Budget je Kategorie" wird hier per
// Repository geprüft (SPEC US-D1: bewusst nicht synchron erzwungen).
//
// Je Kategorie EINES — nicht mehr wie früher „eines je Kategorie + Periode". Mit zwei
// Arten am selben Aggregat wäre ein zweites Budget auf derselben Kategorie keine
// Verfeinerung, sondern eine Doppelzählung: beide zögen dieselben Buchungen. Wer
// unterschiedlich behandeln will, legt das zweite Budget auf eine UNTERkategorie —
// dann rechnet der Kern es automatisch aus dem Dach heraus (core/budget).

import {
  FachlicherFehler,
  istCent,
  type Budget,
  type Budgetart,
  type Budgetbetrag,
  type Cent,
} from "../../core";
import type { BudgetRepository } from "../ports";

export interface BudgetEingabe {
  kategorieId: string;
  kontoId: string;
  /** Betrag pro Monat in Minor Units — die UI parst die Eingabe währungsgerecht (ADR-0004). */
  betragProMonat: Cent;
  art: Budgetart;
  /** ISO-Datum; fehlt es, zählt der Erste des angegebenen Monats bzw. `heute`. */
  start: string;
  /**
   * Ab welchem Monat (`YYYY-MM`) der Betrag gilt.
   *
   * Beim Anlegen ist das der Startmonat, beim Bearbeiten der laufende: ein geänderter
   * Rahmen gilt ab jetzt und nicht rückwirkend — sonst wäre nicht mehr feststellbar,
   * wogegen man in den Monaten davor gemessen hat. Ältere Versionen ändert man einzeln
   * über `budgetBetragSpeichern`.
   */
  abMonat: string;
}

export async function budgetAnlegen(
  repo: BudgetRepository,
  eingabe: BudgetEingabe,
  id?: string,
): Promise<Budget> {
  if (!eingabe.kategorieId) throw new FachlicherFehler("kategorie.waehlen");
  if (!eingabe.kontoId) throw new FachlicherFehler("konto.waehlen");
  if (!istCent(eingabe.betragProMonat) || eingabe.betragProMonat <= 0) {
    throw new FachlicherFehler("rahmen.groesserNull");
  }
  // Nur die FORM — ob es den Tag gibt, prüft der Kern beim Rechnen (CLAUDE.md).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.start)) throw new FachlicherFehler("startdatum.ungueltig");
  if (!/^\d{4}-\d{2}$/.test(eingabe.abMonat)) throw new FachlicherFehler("startdatum.ungueltig");

  const bestehende = await repo.alle();
  if (bestehende.some((b) => b.id !== id && b.kategorieId === eingabe.kategorieId)) {
    throw new FachlicherFehler("budget.existiert");
  }

  const vorhanden = bestehende.find((b) => b.id === id);
  // Die Betragsreihe kommt aus dem Bestand und wird ERGÄNZT, nicht ersetzt: `speichern`
  // rührt sie nicht an (siehe Repository), und ein Bearbeiten von Konto oder Art darf die
  // Planungshistorie nicht mitnehmen.
  const betraege = reiheMit(vorhanden?.betraege ?? [], {
    abMonat: eingabe.abMonat,
    betrag: eingabe.betragProMonat,
  });

  const budget: Budget = {
    id: id ?? crypto.randomUUID(),
    kategorieId: eingabe.kategorieId,
    kontoId: eingabe.kontoId,
    betraege,
    art: eingabe.art,
    // Ein aufbauendes Budget sammelt ab dem Monatsersten — mitten im Monat anzufangen
    // hiesse, den ersten Monat anteilig zu rechnen, und dafür gibt es keinen Grund.
    start: `${eingabe.start.slice(0, 7)}-01`,
  };
  // `speichern` schreibt das Aggregat ganz — die zusammengeführte Reihe kommt mit.
  await repo.speichern(budget);
  return budget;
}

/**
 * Die Reihe mit dieser Version — ersetzt eine gleichmonatige, sonst einsortiert.
 *
 * Aufsteigend sortiert, weil `betragImMonat` von vorne durchgeht und beim ersten
 * zukünftigen Eintrag abbricht. Eine unsortierte Reihe lieferte dort still den falschen
 * Betrag statt einen Fehler.
 */
function reiheMit(bisher: readonly Budgetbetrag[], neu: Budgetbetrag): Budgetbetrag[] {
  return [...bisher.filter((v) => v.abMonat !== neu.abMonat), neu].sort((a, b) =>
    a.abMonat.localeCompare(b.abMonat),
  );
}

/**
 * Eine Betragsversion entfernen — aber nie die letzte.
 *
 * Ein Budget ohne Betrag wäre eine Kategorie mit einem Etikett: es stünde in der Liste,
 * hätte überall 0 und liesse sich nur über den Umweg „bearbeiten" wiederbeleben. Wer es
 * loswerden will, löscht das Budget.
 */
export async function budgetBetragLoeschen(
  repo: BudgetRepository,
  budgetId: string,
  abMonat: string,
): Promise<void> {
  const budget = (await repo.alle()).find((b) => b.id === budgetId);
  if (!budget) throw new FachlicherFehler("budget.unbekannt");
  if (budget.betraege.length <= 1) throw new FachlicherFehler("budget.letzterBetrag");
  await repo.betragLoeschen(budgetId, abMonat);
}
