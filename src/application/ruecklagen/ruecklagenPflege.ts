// Use-Cases rund um die Rücklagen. Die Rücklage steht für sich: was zurückgelegt ist,
// ist eine Rechnung und kein eigenes Sparvehikel. Wo das Geld liegt, sagt `kontoId`, und
// der Abgleich passiert beim Anzeigen.

import { FachlicherFehler, freieRate, hatZiel, type Cent, type Ruecklage } from "../../core";
import type { BudgetRepository, LedgerPort, RuecklagenAusbuchung, RuecklagenRepository } from "../ports";

/**
 * Darf an dieser Kategorie eine Rücklage hängen? Nicht an der eines MONATLICHEN Budgets:
 * dort gewinnt das Budget (`zustaendigkeit`), und die Rücklage fände nie etwas von selbst.
 * Wer beides will, nimmt eine Unterkategorie (Teil B des Entwurfs zu ADR-0006,
 * Abschnitt 5). Ein Altfall bleibt stehen, wie er ist — geprüft wird nur, wo eine
 * Kategorie neu gewählt wird.
 *
 * Optional, damit ein Aufrufer ohne Budgets (Tests der Formen) nicht eines mitbringen
 * muss; `dienste` gibt es immer mit.
 */
async function kategoriePruefen(budgetRepo: BudgetRepository | undefined, kategorieId: string | undefined): Promise<void> {
  if (!budgetRepo || !kategorieId) return;
  const budgets = await budgetRepo.alle();
  if (budgets.some((b) => b.art === "monatlich" && b.kategorieId === kategorieId)) {
    throw new FachlicherFehler("ruecklage.kategorieHatBudget");
  }
}

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

/**
 * Legt eine Rücklage an. Sie ist `abschliessend` (die einzige Sorte, die es in der Tabelle
 * vor Paket 4 gibt), und mit Kategorie findet sie ihre Ausgaben ab ihrem Beginn — eine
 * neue Rücklage hat keine Vergangenheit, die sich verschieben könnte.
 *
 * Die freie Rate steht seit Migration 80 in der Reihe, nicht in `rate`: die erste Zeile
 * gilt ab dem Monat des Beginns.
 */
export async function ruecklageAnlegen(
  repo: RuecklagenRepository,
  e: RuecklagenEingabe,
  budgetRepo?: BudgetRepository,
): Promise<Ruecklage> {
  const gebaut = baue(e, crypto.randomUUID());
  await kategoriePruefen(budgetRepo, gebaut.kategorieId);
  const r: Ruecklage = {
    ...gebaut,
    rate: undefined,
    art: "abschliessend",
    findetAb: gebaut.kategorieId ? gebaut.beginn : undefined,
    raten: gebaut.rate ? [{ abMonat: gebaut.beginn.slice(0, 7), betrag: gebaut.rate }] : [],
  };
  await repo.speichern(r);
  if (gebaut.rate) await repo.rateSpeichern(r.id, { abMonat: gebaut.beginn.slice(0, 7), betrag: gebaut.rate });
  return r;
}

/**
 * Aktualisiert eine Rücklage (ID erhalten).
 *
 * Drei Dinge trägt die Eingabe nicht, und sie dürfen beim Bearbeiten nicht verloren gehen:
 *
 *   • `art` und `findetAb` kommen von der gespeicherten Rücklage. Ohne sie fiele ein
 *     gesetztes Fundfenster beim ersten Speichern auf leer, und die Rücklage fände
 *     nichts mehr. **Wird eine Kategorie NACHGETRAGEN**, findet sie ab `heute` — nicht ab
 *     ihrem Beginn, sonst änderte das Nachtragen vergangene Monate.
 *   • Die freie Rate ist eine Reihe. Eine geänderte Rate gilt ab dem laufenden Monat (oder
 *     ab dem Beginn, wenn der später liegt); die Monate davor behalten ihre. Eine Rücklage
 *     ohne Reihe (vor Migration 80, oder nie mit Rate) bekommt ihre erste Zeile ab dem
 *     Monat des Beginns. `rate` bleibt danach leer: zwei Stellen für dieselbe Zahl wären
 *     zwei Wahrheiten.
 */
export async function ruecklageAktualisieren(
  repo: RuecklagenRepository,
  ruecklageId: string,
  e: RuecklagenEingabe,
  heute: string,
  budgetRepo?: BudgetRepository,
): Promise<Ruecklage> {
  const gebaut = baue(e, ruecklageId);
  const vorher = (await repo.alle()).find((r) => r.id === ruecklageId);
  if (gebaut.kategorieId !== vorher?.kategorieId) await kategoriePruefen(budgetRepo, gebaut.kategorieId);
  const reihe = vorher?.raten ?? [];
  const nachgetragen = !!gebaut.kategorieId && !vorher?.kategorieId;
  const findetAb = nachgetragen ? heute : vorher?.findetAb;

  let raten = reihe;
  if (gebaut.rate) {
    const beginnMonat = gebaut.beginn.slice(0, 7);
    if (reihe.length === 0) {
      raten = [{ abMonat: beginnMonat, betrag: gebaut.rate }];
    } else if (freieRateIm(reihe, heute.slice(0, 7)) !== gebaut.rate) {
      const ab = heute.slice(0, 7) > beginnMonat ? heute.slice(0, 7) : beginnMonat;
      raten = [...reihe.filter((x) => x.abMonat !== ab), { abMonat: ab, betrag: gebaut.rate }].sort((a, b) =>
        a.abMonat.localeCompare(b.abMonat),
      );
    }
  }
  const r: Ruecklage = {
    ...gebaut,
    rate: undefined,
    art: vorher?.art ?? "abschliessend",
    findetAb,
    raten,
  };
  await repo.speichern(r);
  for (const x of raten) {
    if (!reihe.some((y) => y.abMonat === x.abMonat && y.betrag === x.betrag)) await repo.rateSpeichern(ruecklageId, x);
  }
  return r;
}

/** Die Rate der Reihe in `monat` — die jüngste, die nicht später gilt; davor die erste. */
function freieRateIm(reihe: readonly { abMonat: string; betrag: Cent }[], monat: string): Cent {
  let treffer = reihe[0]?.betrag ?? 0;
  for (const v of reihe) {
    if (v.abMonat > monat) break;
    treffer = v.betrag;
  }
  return treffer;
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
    // Der Zyklus, der hier endet — festgehalten, bevor `beginn` unten überschrieben
    // wird. Ohne das wäre nach dem Ausbuchen weder die Rate der Monate davor noch der
    // Stand am Tag des Kaufs zu rechnen.
    zyklusBeginn: ruecklage.beginn,
    zyklusZiel: ruecklage.ziel,
    zyklusFrist: ruecklage.fristMonate,
    // Seit Migration 80 steht die freie Rate in der Reihe. Trägt die nur EINE Zeile, wird
    // sie hier festgehalten, wie vorher `rate` — die Geschichte rechnet ihr „angespart"
    // aus dem Abschluss allein. Mit mehreren Zeilen trägt die Reihe den Zyklus selbst
    // (`zyklen` in `core/ruecklagen/topf.ts`); eine einzelne Zahl wäre dann falsch.
    zyklusRate: hatZiel(ruecklage) ? undefined : (ruecklage.raten?.length ?? 0) > 1 ? undefined : freieRate(ruecklage) || undefined,
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
    // Beenden statt löschen: mit der Rücklage ginge ihre Ausbuchung per CASCADE mit,
    // und die ist die einzige Aufzeichnung, wofür sie draufging.
    await repo.speichern({ ...ruecklage, beendetAm: e.datum });
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
