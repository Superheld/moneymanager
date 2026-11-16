// Eine Rücklage abschliessen — der Handgriff für eine Rücklage, die „wird abgeschlossen",
// sobald sie an einer Kategorie hängt (ADR-0006, Paket 5). „Mit dem Kauf" und „am Ende des
// Urlaubs" sind derselbe Handgriff: die Ausgaben hat sie über ihre Kategorie (oder die
// Zuordnung) längst gefunden, hier wird nur noch gesagt, dass der Zyklus zu Ende ist.
//
// Drei Dinge daran sind entschieden und keine Mechanik:
//
//   • **Was übrig ist, wird frei — nur auf dem Konto.** Der Anspruch der Rücklage fällt um
//     den Rest, die Ergebnisrechnung bekommt dafür keinen Posten: die Raten bleiben Kosten
//     ihrer Monate (ADR-0006, „Konservativ gelöst"). Ein Minus hat seinen Monat schon
//     gekostet; beim Abschliessen passiert damit nichts weiter.
//   • **Neu beginnen oder beenden wählt der Nutzer**, nicht die Form. Bis Paket 4 entschied
//     die Form beim Ausbuchen (mit Ziel neu, frei beendet); das bleibt beim Ausbuchen einer
//     Rücklage ohne Kategorie so (`ruecklageAusbuchen`).
//   • **Gebucht und verknüpft wird nichts.** Geschrieben wird eine Zeile in
//     `ruecklage_ausbuchung` ohne Buchung und ohne Betrag — dieselbe Aufzeichnung des
//     beendeten Zyklus wie beim Ausbuchen, damit `zyklen()` ihn als abgeschlossen sieht.
//     Eine eigene Tabelle dafür hätte eine Migration gekostet und zwei Stellen für
//     dasselbe Ereignis geschaffen.
//
// Gerechnet wird im Kern (`abschliessen` in `core/ruecklagen/topf.ts`), gegen dieselben
// Entnahmen, aus denen der Anspruch auf dem Konto rechnet (`anspruchsbestandLaden`).

import {
  FachlicherFehler,
  abschliessen,
  hatZiel,
  istCent,
  ruecklagenart,
  zyklen,
  type Cent,
  type Ruecklage,
} from "../../core";
import type { RuecklagenAusbuchung } from "../ports";
import { anspruchsbestandLaden, type BudgetanspruchDeps } from "../konten/kontobelegung";

export interface AbschliessenEingabe {
  /** Der Tag des Abschlusses (ISO) — im laufenden Monat, nicht später als heute, nicht vor dem Beginn. */
  readonly datum: string;
  /** `neu`: ab dem Abschlusstag von vorn; `ende`: die Rücklage ist erledigt. */
  readonly folge: "neu" | "ende";
  /** Bei `neu` und einer Rücklage mit Ziel: das Ziel des nächsten Zyklus. */
  readonly ziel?: Cent;
}

export interface Abschlussergebnis {
  /** Die Rücklage danach; beendet, wenn `folge` es so wollte. */
  readonly ruecklage: Ruecklage;
  /** Was auf dem Konto frei geworden ist, positiv. */
  readonly frei: Cent;
  /** Was mehr getragen wurde, als da war — hat seinen Monat schon gekostet. */
  readonly ungedeckt: Cent;
}

/**
 * Prüft an der Anwendungsgrenze, rechnet im Kern, schreibt Aufzeichnung und Zustand.
 *
 * Abgewiesen wird: eine Rücklage, die weiterläuft (sie beginnt nie neu); eine ohne
 * Kategorie (sie wird wie vorher mit ihrer Buchung ausgebucht); ein Tag nach heute (ein
 * Abschluss in der Zukunft beendete heute schon einen Zyklus, der noch läuft), einer vor
 * dem laufenden Monat (er änderte vergangene Monate) und einer vor dem Beginn des
 * laufenden Zyklus.
 */
export async function ruecklageAbschliessen(
  deps: BudgetanspruchDeps,
  ruecklageId: string,
  e: AbschliessenEingabe,
  heute: string,
): Promise<Abschlussergebnis> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) throw new FachlicherFehler("ruecklage.datumUngueltig");
  if (e.folge !== "neu" && e.folge !== "ende") throw new FachlicherFehler("ruecklage.folgeWaehlen");
  const [ruecklagen, { bestand }] = await Promise.all([deps.ruecklagenRepo.alle(), anspruchsbestandLaden(deps)]);
  const r = ruecklagen.find((x) => x.id === ruecklageId);
  if (!r) throw new FachlicherFehler("ruecklage.unbekannt");
  if (ruecklagenart(r) === "fortlaufend") throw new FachlicherFehler("ruecklage.laeuftWeiterAbschluss");
  if (!r.kategorieId) throw new FachlicherFehler("ruecklage.ohneKategorie");
  if (e.datum > heute) throw new FachlicherFehler("ruecklage.abschlussZukunft");
  // Nur im laufenden Monat: ein Tag davor schöbe die Rate jenes Monats und die Ausgaben
  // danach in den neuen Zyklus — ein vergangener Monat kostete dann anders. So ändert das
  // Abschliessen nie einen abgeschlossenen Monat (Paket 5, im Zweifel am wenigsten).
  if (e.datum.slice(0, 7) < heute.slice(0, 7)) throw new FachlicherFehler("ruecklage.abschlussVormonat");

  const abschluesse = (bestand.abschluesse ?? []).filter((a) => a.ruecklageId === r.id);
  const laufend = zyklen(r, abschluesse).find((z) => !z.ende);
  if (!laufend?.beginn || e.datum < laufend.beginn) throw new FachlicherFehler("ruecklage.abschlussVorBeginn");

  const neuesZiel = e.folge === "neu" && hatZiel(r) ? e.ziel : undefined;
  if (neuesZiel != null && (!(neuesZiel > 0) || !istCent(neuesZiel))) throw new FachlicherFehler("ziel.groesserNull");

  const a = abschliessen(r, abschluesse, bestand.entnahmen?.get(r.id) ?? [], e.datum, e.folge, neuesZiel);
  const zeile: RuecklagenAusbuchung = { ...a.abschluss, id: crypto.randomUUID(), betrag: 0 };
  // Zuerst die Aufzeichnung, dann der Zustandswechsel — dieselbe Reihenfolge wie beim
  // Ausbuchen und aus demselben Grund: bricht es dazwischen ab, steht ein Abschluss ohne
  // Folgen da, und nicht ein neuer Zyklus, von dem niemand weiss, wo der alte blieb.
  await deps.ruecklagenRepo.ausbuchungSpeichern(zeile);
  await deps.ruecklagenRepo.speichern(a.ruecklage);
  return { ruecklage: a.ruecklage, frei: a.frei, ungedeckt: a.ungedeckt };
}
