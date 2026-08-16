// Use-Case „Umbuchung aus einer bestehenden Buchung" (S-1) — der Gegenpart zu
// `umbuchungErfassen`, das ZWEI neue Beine anlegt. Hier existiert eines bereits:
//
//  • S-1a  Gegenbein fehlt (typisch: Bargeld, wird nicht importiert) → wird erzeugt.
//  • S-1b  beide Beine existieren (zwei importierte Buchungen) → werden gepaart.
//
// Die automatische Paarung beim Import (`import/umsatzVerbuchen.ts`) macht dasselbe eine
// Ebene höher, auf UMSÄTZEN vor dem Verbuchen. Hier arbeiten wir auf IstBuchungen, also
// nach dem Verbuchen — deshalb eigene Logik statt Wiederverwendung.
//
// Die bestehende Buchung wird NICHT auf „Abgang" festgelegt: sie ist ein Bein, das
// Gegenbein trägt den negierten Betrag. So trägt derselbe Weg die Abhebung (Giro −,
// Bargeld +) und die Einzahlung (Giro +, Bargeld −). Netto 0 über alle Konten gilt
// unverändert.

import { FachlicherFehler, tageBis, type IstBuchung } from "../core";
import type { LedgerPort } from "./ports";

/**
 * Datumsfenster für Paarungs-VORSCHLÄGE. Großzügiger als die automatische Paarung beim
 * Import (3 Tage): dort entscheidet die App allein und muss vorsichtig sein, hier wählt
 * der Nutzer aus einer Liste — ein zu enges Fenster verbirgt nur den richtigen Treffer.
 */
export const MAX_VORSCHLAG_TAGE = 14;

/** Bereits verplantes Bein — kann nicht (noch einmal) gepaart werden. */
function schonGepaart(b: IstBuchung): boolean {
  return b.transferId != null;
}

/**
 * Mögliche Gegenbeine zu `buchung`: exakter Gegenbetrag (Netto-Null), anderes Konto,
 * noch frei, Buchungstag höchstens MAX_VORSCHLAG_TAGE entfernt. Sortiert nach
 * Datumsabstand (nächstes zuerst), dann stabil über Datum und Id.
 */
export function paarungsKandidaten(
  buchungen: readonly IstBuchung[],
  buchung: IstBuchung,
  maxTage: number = MAX_VORSCHLAG_TAGE,
): IstBuchung[] {
  if (schonGepaart(buchung)) return [];
  return buchungen
    .filter(
      (k) =>
        k.id !== buchung.id &&
        !schonGepaart(k) &&
        k.betrag === -buchung.betrag &&
        k.kontoId !== buchung.kontoId &&
        Math.abs(tageBis(buchung.datum, k.datum)) <= maxTage,
    )
    .sort(
      (a, b) =>
        Math.abs(tageBis(buchung.datum, a.datum)) - Math.abs(tageBis(buchung.datum, b.datum)) ||
        a.datum.localeCompare(b.datum) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * Macht aus einer Buchung ein Umbuchungs-Bein: Charakter Umschichtung, Gegenkonto und
 * Transfer-Verknüpfung gesetzt, Kategorie entfernt.
 *
 * Die Kategorie MUSS weg: Budget-Auswertungen summieren rein über `kategorieId`
 * (`core/budget.ts`) ohne Umbuchungs-Filter — eine kategorisierte Umschichtung liefe
 * sonst weiter gegen das Budget. Identität und Herkunft (id, quelle, rohHash, planRef)
 * bleiben, damit die Import-Spur nicht reißt.
 */
function alsBein(b: IstBuchung, transferId: string, gegenkontoId: string): IstBuchung {
  return {
    ...b,
    charakter: "Umschichtung",
    kategorieId: undefined,
    transferId,
    gegenkontoId,
  };
}

/**
 * S-1a — erzeugt das fehlende Gegenbein auf `nachKontoId` und verknüpft beide.
 * Datum und Notiz übernimmt das neue Bein von der bestehenden Buchung.
 */
export async function gegenbeinErzeugen(
  ledger: LedgerPort,
  buchung: IstBuchung,
  nachKontoId: string,
): Promise<{ bestehend: IstBuchung; erzeugt: IstBuchung }> {
  if (!nachKontoId) throw new FachlicherFehler("konto.waehlen");
  if (nachKontoId === buchung.kontoId) throw new FachlicherFehler("konten.verschieden");
  if (schonGepaart(buchung)) throw new FachlicherFehler("umbuchung.schonGepaart");

  const transferId = crypto.randomUUID();
  const bestehend = alsBein(buchung, transferId, nachKontoId);
  const erzeugt: IstBuchung = {
    id: crypto.randomUUID(),
    datum: buchung.datum,
    betrag: -buchung.betrag,
    kontoId: nachKontoId,
    charakter: "Umschichtung",
    quelle: "manuell",
    notiz: buchung.notiz,
    transferId,
    gegenkontoId: buchung.kontoId,
  };

  await ledger.speichern(bestehend);
  await ledger.speichern(erzeugt);
  return { bestehend, erzeugt };
}

/**
 * S-1b — paart zwei bestehende Buchungen nachträglich zu einer Umbuchung.
 * Beide behalten Identität und Herkunft; nur Charakter, Kategorie und die
 * Transfer-Verknüpfung ändern sich.
 */
export async function buchungenPaaren(
  ledger: LedgerPort,
  a: IstBuchung,
  b: IstBuchung,
): Promise<{ ab: IstBuchung; zu: IstBuchung }> {
  if (a.id === b.id) throw new FachlicherFehler("umbuchung.selbeBuchung");
  if (a.kontoId === b.kontoId) throw new FachlicherFehler("konten.verschieden");
  if (a.betrag + b.betrag !== 0) throw new FachlicherFehler("umbuchung.betragGegen");
  if (schonGepaart(a) || schonGepaart(b)) throw new FachlicherFehler("umbuchung.schonGepaart");

  const transferId = crypto.randomUUID();
  const ersterIstAbgang = a.betrag < 0;
  const ab = alsBein(ersterIstAbgang ? a : b, transferId, ersterIstAbgang ? b.kontoId : a.kontoId);
  const zu = alsBein(ersterIstAbgang ? b : a, transferId, ersterIstAbgang ? a.kontoId : b.kontoId);

  await ledger.speichern(ab);
  await ledger.speichern(zu);
  return { ab, zu };
}

/**
 * Ändert an einem Umbuchungs-Bein nur, was gefahrlos änderbar ist: Datum und Notiz.
 *
 * Warum nicht `buchungBearbeiten`? Das leitet das Vorzeichen über `vorzeichenbehaftet()`
 * aus dem Charakter ab — und eine Umschichtung wird dort IMMER negativ. Das Zugangs-Bein
 * (+500) kippte beim Speichern auf −500 und risse die Netto-Null der Umbuchung auf.
 * Betrag und Charakter gehören dem Paar, nicht dem einzelnen Bein; wer sie ändern will,
 * löst die Paarung erst.
 *
 * Die beiden Beine dürfen an verschiedenen Tagen liegen (so importiert Finanzguru sie),
 * deshalb wandert das Datum NICHT ans andere Bein mit.
 */
export async function umbuchungsBeinBearbeiten(
  ledger: LedgerPort,
  bein: IstBuchung,
  e: { datum: string; notiz?: string },
): Promise<IstBuchung> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) throw new FachlicherFehler("datum.ungueltig");

  const aktualisiert: IstBuchung = { ...bein, datum: e.datum, notiz: e.notiz?.trim() || undefined };
  await ledger.speichern(aktualisiert);
  return aktualisiert;
}

/**
 * Löst eine Paarung: Transfer-Verknüpfung und Gegenkonto fallen weg, BEIDE Buchungen
 * bleiben stehen. Bewusst nicht löschen — bei importierten Beinen wäre das
 * Datenverlust; das Löschen einzelner Beine gibt es weiterhin separat.
 *
 * Der Charakter bleibt „Umschichtung": was vorher galt, weiß niemand mehr (bei einem
 * per S-1a erzeugten Bein gab es gar kein Vorher). Korrigieren kann der Nutzer im
 * Bearbeiten-Dialog.
 */
export async function paarungLoesen(ledger: LedgerPort, transferId: string): Promise<IstBuchung[]> {
  const beine = (await ledger.alle()).filter((b) => b.transferId === transferId);
  const geloest = beine.map((b) => ({ ...b, transferId: undefined, gegenkontoId: undefined }));
  for (const b of geloest) await ledger.speichern(b);
  return geloest;
}
