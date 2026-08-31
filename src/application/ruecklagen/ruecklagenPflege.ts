// Use-Cases rund um die Rücklagen. Die Rücklage steht für sich: was zurückgelegt ist,
// ist eine Rechnung und kein eigenes Sparvehikel. Wo das Geld liegt, sagt `kontoId`, und
// der Abgleich passiert beim Anzeigen.

import { FachlicherFehler, hatZiel, type Cent, type Ruecklage } from "../../core";
import type { LedgerPort, RuecklagenAusbuchung, RuecklagenRepository } from "../ports";

export interface RuecklagenEingabe {
  bezeichnung: string;
  /** Zielbetrag in Minor Units. Zusammen mit `fristMonate` oder gar nicht. */
  ziel?: Cent;
  fristMonate?: number;
  /** Freie Monatsrate in Minor Units — die Alternative zu Ziel und Frist. */
  rate?: Cent;
  beginn: string; // ISO
  kategorieId?: string;
  /** Zahlungskonto, auf dem die Rücklage tatsächlich liegt. */
  kontoId?: string;
}

/**
 * Prüft die Eingabe und baut die Rücklage; `id` erhält sie beim Bearbeiten.
 *
 * Die eigentliche Prüfung ist die auf GENAU EINE Form. Beides zugleich wäre keine
 * Doppelangabe, sondern ein Widerspruch: aus Ziel ÷ Frist ergäbe sich eine Rate, und
 * daneben stünde eine andere — welche gilt, entschiede dann die Reihenfolge im Code.
 */
function baue(e: RuecklagenEingabe, id: string): Ruecklage {
  const bezeichnung = e.bezeichnung.trim();
  if (!bezeichnung) throw new FachlicherFehler("bezeichnung.fehlt");

  // Runden VOR dem Prüfen: sonst besteht 0.4 die Schwelle und wird danach zu 0 — die
  // Rücklage teilt dann durch null, und aus Infinity wird an anderer Stelle NaN.
  const fristMonate = e.fristMonate == null ? undefined : Math.round(Number(e.fristMonate));
  const mitZiel = (e.ziel ?? 0) > 0 || (fristMonate ?? 0) > 0;
  const mitRate = (e.rate ?? 0) > 0;

  if (mitZiel && mitRate) throw new FachlicherFehler("ruecklage.zielOderRate");
  if (!mitZiel && !mitRate) throw new FachlicherFehler("ruecklage.zielOderRate");
  if (mitZiel) {
    if (!((e.ziel ?? 0) > 0)) throw new FachlicherFehler("ziel.groesserNull");
    if (!((fristMonate ?? 0) > 0)) throw new FachlicherFehler("frist.groesserNull");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.beginn)) throw new FachlicherFehler("beginn.ungueltig");

  return {
    id,
    bezeichnung,
    ziel: mitZiel ? e.ziel : undefined,
    fristMonate: mitZiel ? fristMonate : undefined,
    rate: mitRate ? e.rate : undefined,
    beginn: e.beginn,
    kategorieId: e.kategorieId || undefined,
    kontoId: e.kontoId || undefined,
  };
}

export async function ruecklageAnlegen(
  repo: RuecklagenRepository,
  e: RuecklagenEingabe,
): Promise<Ruecklage> {
  const r = baue(e, crypto.randomUUID());
  await repo.speichern(r);
  return r;
}

/** Aktualisiert eine Rücklage (ID erhalten). */
export async function ruecklageAktualisieren(
  repo: RuecklagenRepository,
  ruecklageId: string,
  e: RuecklagenEingabe,
): Promise<Ruecklage> {
  const r = baue(e, ruecklageId);
  await repo.speichern(r);
  return r;
}

export interface AusbuchenEingabe {
  datum: string; // ISO
  /** Was tatsächlich ausgegeben wurde. Ohne Angabe der Soll-Stand. */
  betrag?: Cent;
  /** Die Buchung, mit der ausgegeben wurde. */
  istbuchungId?: string;
  /** Bei einer Rücklage mit Ziel: das Ziel für den nächsten Zyklus (Preise steigen). */
  ziel?: Cent;
  notiz?: string;
}

/**
 * Ausbuchen — die Rücklage ist gebraucht worden.
 *
 * Was danach gilt, hängt an der Form der Rücklage, und das ist der Grund, warum es kein
 * eigenes Feld „wiederkehrend" gibt:
 *
 *   • MIT ZIEL UND FRIST beginnt sie von vorn. `beginn` wandert auf den Tag der Ausgabe,
 *     der Soll-Stand baut ab jetzt wieder von null auf. Was einmal ersetzt werden musste,
 *     muss es wieder — die Waschmaschine ist nicht die letzte.
 *   • OHNE ZIEL ist sie erledigt und verschwindet. Der Urlaub war einmal.
 *
 * GEBUCHT WIRD HIER NICHTS. Der Kauf ist eine ganz normale Ausgabe vom Konto, und weil
 * die Deckung gegen den realen Kontostand rechnet, fällt sie durch die Abbuchung von
 * selbst — eine zweite, kalkulatorische Buchung zeigte dieselbe Bewegung doppelt.
 *
 * Die VERKNÜPFUNG zur Buchung ist etwas anderes als eine Buchung: sie hält fest, WOFÜR
 * die Rücklage draufging, und sie nimmt die Ausgabe aus der Budgetbewertung. Eine
 * Neuanschaffung, für die man jahrelang zurückgelegt hat, ist keine Ausgabe, an der sich
 * ein Monatsbudget messen lassen müsste — sie würde jedes sprengen.
 */
export async function ruecklageAusbuchen(
  repo: RuecklagenRepository,
  ledger: LedgerPort,
  ruecklage: Ruecklage,
  e: AusbuchenEingabe,
): Promise<Ruecklage | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) throw new FachlicherFehler("ruecklage.datumUngueltig");
  if (e.ziel != null && !(e.ziel > 0)) throw new FachlicherFehler("ziel.groesserNull");

  const ausbuchung: RuecklagenAusbuchung = {
    id: crypto.randomUUID(),
    ruecklageId: ruecklage.id,
    datum: e.datum,
    betrag: e.betrag ?? 0,
    istbuchungId: e.istbuchungId,
    notiz: e.notiz,
  };
  // Zuerst die Aufzeichnung, dann der Zustandswechsel: bricht es dazwischen ab, steht
  // eine Ausbuchung ohne Folgen da. Andersherum wäre der Zyklus neu gestartet und
  // niemand wüsste, wofür.
  await repo.ausbuchungSpeichern(ausbuchung);

  // Die verknüpfte Buchung fällt aus der Budgetbewertung. Das ist der zweite Zweck der
  // Verknüpfung und nicht ein Nebeneffekt: eine Anschaffung, für die jahrelang
  // zurückgelegt wurde, spränge jeden Monatsrahmen, und der sagte danach nichts mehr
  // über das Verhalten aus, das er steuern soll.
  //
  // Gesetzt wird nur, was sich ändert: die Buchung wird gelesen und mit EINEM
  // geänderten Feld zurückgeschrieben. Ein Neuaufbau aus der Eingabe verlöre alles,
  // was hier nicht dasteht (Aufteilungen, Beleg-Hash, Marker).
  if (e.istbuchungId) {
    const buchung = (await ledger.alle()).find((b) => b.id === e.istbuchungId);
    if (buchung) await ledger.speichern({ ...buchung, budgetrelevant: false });
  }

  if (!hatZiel(ruecklage)) {
    await repo.loeschen(ruecklage.id);
    return null;
  }

  const neu: Ruecklage = {
    ...ruecklage,
    beginn: e.datum,
    ziel: e.ziel ?? ruecklage.ziel,
  };
  await repo.speichern(neu);
  return neu;
}

export async function ruecklageLoeschen(
  repo: RuecklagenRepository,
  ruecklageId: string,
): Promise<void> {
  await repo.loeschen(ruecklageId);
}
