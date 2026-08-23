// Use-Case „Buchung erfassen" (ADR-0002, revidiert) — eine FREIE Ist-Buchung ohne
// Plan-Bezug. Für Bar die Dauerquelle (kein Import möglich); für Bankkonten vorläufig,
// bis der Import sie abgleicht. quelle = 'manuell', kein planRef.

import { FachlicherFehler, istCent, type Cent, type Charakter, type IstBuchung } from "../../core";
import type { LedgerPort } from "../ports";
import { vorzeichenbehaftet } from "./zahlungsregelAnlegen";

export interface BuchungEingabe {
  kontoId: string;
  datum: string; // ISO
  /** Positiver Betrag in Minor Units; das Vorzeichen ergibt sich aus dem Charakter. */
  betrag: Cent;
  charakter: Charakter;
  kategorieId?: string;
  notiz?: string;
}

export async function buchungErfassen(
  ledger: LedgerPort,
  e: BuchungEingabe,
  id?: string,
): Promise<IstBuchung> {
  if (!e.kontoId) throw new FachlicherFehler("konto.waehlen");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) throw new FachlicherFehler("datum.ungueltig");
  if (!istCent(e.betrag) || e.betrag <= 0) throw new FachlicherFehler("betrag.groesserNull");

  const buchung: IstBuchung = {
    id: id ?? crypto.randomUUID(),
    datum: e.datum,
    betrag: vorzeichenbehaftet(e.betrag, e.charakter),
    kontoId: e.kontoId,
    kategorieId: e.kategorieId || undefined,
    // Wer die Buchung von Hand erfasst UND dabei eine Kategorie wählt, hat entschieden —
    // das überlebt jeden späteren automatischen Lauf. Ohne Kategorie bleibt die Zeile
    // bewusst offen: dann soll die Automatik sie später gerade füllen dürfen.
    kategorieHerkunft: e.kategorieId ? "manuell" : undefined,
    charakter: e.charakter,
    quelle: "manuell",
    notiz: e.notiz?.trim() || undefined,
  };
  await ledger.speichern(buchung);
  return buchung;
}

/**
 * Bearbeitet eine bestehende Ist-Buchung. Anders als buchungErfassen bleiben Identität und
 * Herkunft erhalten (id, quelle, rohHash, planRef, transfer/Gegenkonto) — nur Konto, Datum,
 * Betrag, Charakter, Kategorie und Notiz ändern sich. So lassen sich auch importierte
 * Buchungen korrigieren, ohne ihre Import-Spur zu verlieren.
 */
export async function buchungBearbeiten(
  ledger: LedgerPort,
  original: IstBuchung,
  e: { datum: string; betrag: Cent; charakter: Charakter; kategorieId?: string; notiz?: string; kontoId?: string },
): Promise<IstBuchung> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) throw new FachlicherFehler("datum.ungueltig");
  if (!istCent(e.betrag) || e.betrag <= 0) throw new FachlicherFehler("betrag.groesserNull");
  // Das Konto darf sich ändern — der Konto-Match des Imports ist eine Vermutung, und wer
  // die Buchung vor sich hat, weiß es besser. NICHT bei einem Umbuchungs-Bein: dort hängt
  // das Gegenkonto der anderen Seite daran, und ein einseitiger Wechsel würde die Paarung
  // auf zwei verschiedene Aussagen auseinanderziehen.
  if (e.kontoId && e.kontoId !== original.kontoId && original.transferId) {
    throw new FachlicherFehler("konten.kontoWechselGepaart");
  }

  // Die Herkunft beschreibt die KATEGORIE, nicht die Buchung: sie springt nur um, wenn
  // sich die Kategorie tatsächlich ändert. Wer nur die Notiz korrigiert, macht damit
  // keine Kategorie-Entscheidung — und eine Buchung, die nur durchs Speichern der Maske
  // läuft, soll der Automatik nicht stillschweigend entzogen werden.
  //
  // Die Kategorie zu LEEREN ist dabei ebenfalls eine Entscheidung („die gehört in keine
  // Kategorie") und wird genauso festgehalten; sonst käme beim nächsten Lauf zurück,
  // was jemand gerade weggenommen hat.
  const neueKategorie = e.kategorieId || undefined;
  const kategorieGeaendert = neueKategorie !== original.kategorieId;

  // DIE RICHTUNG KOMMT BEIM IMPORT VOM BELEG, nicht aus dem Charakter.
  //
  // Bei einer von Hand erfassten Buchung ist das Vorzeichen eine Folge der Einordnung:
  // man tippt eine Betragshöhe und sagt „Aufwand", und daraus wird ein Abfluss. Bei einer
  // importierten Buchung ist es umgekehrt — die Bank hat gebucht, in welche Richtung das
  // Geld geflossen ist. Das ist eine TATSACHE, und der Charakter ist eine EINORDNUNG;
  // eine Einordnung darf eine Tatsache nicht umdrehen.
  //
  // Gemeldet und nachgemessen an einer Erstattung: sie kam als Zufluss herein, wurde in
  // die Kategorie gelegt, in der die Ausgabe stattgefunden hatte — und weil deren Vorgabe
  // „Aufwand" ist, wurde daraus ein Abfluss. Im Budget belastete sie damit, statt zu
  // entlasten. Das Betragsfeld war dabei GESPERRT (Online-Konto), es hat also niemand
  // etwas eingegeben, das sich hätte ändern dürfen.
  //
  // Eine Erstattung ist damit ein Aufwand mit positivem Betrag, und das ist kein
  // Widerspruch: „Aufwand" sagt, WOFÜR das Geld war, das Vorzeichen sagt, wohin es floss.
  // Die Budgetrechnung ist darauf ausgelegt — `Verbrauchsposten.betrag` ist ausdrücklich
  // „POSITIV (eine Erstattung ist entsprechend negativ)".
  const ausDemBeleg = original.quelle === "import";
  const aktualisiert: IstBuchung = {
    ...original,
    kontoId: e.kontoId || original.kontoId,
    datum: e.datum,
    betrag: ausDemBeleg
      ? Math.sign(original.betrag) * Math.abs(e.betrag)
      : vorzeichenbehaftet(e.betrag, e.charakter),
    charakter: e.charakter,
    kategorieId: neueKategorie,
    kategorieHerkunft: kategorieGeaendert ? "manuell" : original.kategorieHerkunft,
    notiz: e.notiz?.trim() || undefined,
  };
  await ledger.speichern(aktualisiert);
  return aktualisiert;
}

/** Löscht eine Ist-Buchung. */
export async function buchungLoeschen(ledger: LedgerPort, id: string): Promise<void> {
  await ledger.loeschen(id);
}
