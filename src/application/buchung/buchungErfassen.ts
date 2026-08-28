// Use-Case „Buchung erfassen" (ADR-0002, revidiert) — eine FREIE Ist-Buchung ohne
// Plan-Bezug. Für Bar die Dauerquelle (kein Import möglich); für Bankkonten vorläufig,
// bis der Import sie abgleicht. quelle = 'manuell', kein planRef.

import { FachlicherFehler, istCent, type Cent, type Charakter, type IstBuchung } from "../../core";
import type { LedgerPort } from "../ports";

export interface BuchungEingabe {
  kontoId: string;
  datum: string; // ISO
  /**
   * Betrag VORZEICHENBEHAFTET in Minor Units: negativ = abgeflossen, positiv = zugeflossen.
   *
   * Das Vorzeichen ist die RICHTUNG, und die kommt hier vollständig vom Aufrufer — nichts
   * leitet sie mehr aus dem Charakter ab. Der Charakter sagt, WOFÜR das Geld war; wohin es
   * floss, sagt allein diese Zahl. Wo beide auseinanderfallen (eine Erstattung ist ein
   * Aufwand, bei dem Geld hereinkam; eine Retoure in bar ebenso), gewinnt das Vorzeichen,
   * ohne dass es dafür ein zweites Feld braucht.
   *
   * Bis 2026-08-25 stand hier eine Höhe ohne Vorzeichen, und die Richtung ergab sich aus
   * `charakter` — mit einem Schalter `gegenrichtung`, der die Ableitung umdrehte. Das
   * scheiterte an drei Stellen zugleich: die Maske zeigte den gespeicherten Betrag ohne
   * sein Vorzeichen, ein eingetipptes Minus wurde als Fehler abgewiesen, und bei einer
   * importierten Zeile musste eine Sonderregel das Vorzeichen des Belegs gegen die
   * Ableitung verteidigen. Eine Zahl, die die Richtung schon trägt, braucht davon nichts.
   */
  betrag: Cent;
  charakter: Charakter;
  kategorieId?: string;
  notiz?: string;
}

/**
 * Ein Betrag von 0 ist keine Buchung, ein gebrochener Cent keine Zahlung — beides fliegt
 * raus. Das Vorzeichen dagegen ist frei: ein Abfluss auf einer Ertragskategorie
 * (Rückbuchung) und ein Zufluss auf einer Aufwandskategorie (Erstattung, Retoure) sind
 * beide gültige Sachverhalte, und keiner von beiden hängt daran, welches Konto oder
 * welche Kategorie beteiligt ist.
 */
function betragPruefen(betrag: Cent): void {
  if (!istCent(betrag) || betrag === 0) throw new FachlicherFehler("betrag.nichtNull");
}

export async function buchungErfassen(
  ledger: LedgerPort,
  e: BuchungEingabe,
  id?: string,
): Promise<IstBuchung> {
  if (!e.kontoId) throw new FachlicherFehler("konto.waehlen");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) throw new FachlicherFehler("datum.ungueltig");
  betragPruefen(e.betrag);

  const buchung: IstBuchung = {
    id: id ?? crypto.randomUUID(),
    datum: e.datum,
    betrag: e.betrag,
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
  betragPruefen(e.betrag);
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

  // DAS VORZEICHEN IST DIE RICHTUNG, UND DIE KOMMT AUS DER EINGABE — sonst nirgendwoher.
  //
  // Hier stand bis 2026-08-25 eine Fallunterscheidung: bei `quelle === "import"` das
  // Vorzeichen des Originals behalten, sonst aus dem Charakter ableiten. Sie war nötig,
  // weil die Ableitung eine importierte Erstattung umgedreht hätte — der Charakter
  // „Aufwand" machte aus einem Zufluss einen Abfluss, und im Budget belastete sie dann,
  // statt zu entlasten.
  //
  // Nötig ist die Fallunterscheidung nur, solange es die Ableitung gibt. Ohne sie trägt
  // die Eingabe das Vorzeichen selbst, und beide Fälle fallen zusammen: wer nichts an der
  // Richtung ändert, reicht das Vorzeichen des Belegs unverändert durch (die Maske füllt
  // das Feld vorzeichenbehaftet vor), und wer es ändert, meint genau das. Der Satz aus
  // CLAUDE.md gilt unverändert und sogar strenger: eine EINORDNUNG dreht keine Tatsache
  // um — nur ein Mensch tut das, ausdrücklich und sichtbar.
  //
  // Wo das Feld gar nicht angefasst werden DARF (Online-Konto, Umbuchungs-Bein), sperrt
  // die Maske es; gespeichert wird dann der vorgefüllte Wert, also der bisherige.
  const aktualisiert: IstBuchung = {
    ...original,
    kontoId: e.kontoId || original.kontoId,
    datum: e.datum,
    betrag: e.betrag,
    charakter: e.charakter,
    kategorieId: neueKategorie,
    kategorieHerkunft: kategorieGeaendert ? "manuell" : original.kategorieHerkunft,
    notiz: e.notiz?.trim() || undefined,
  };
  await ledger.speichern(aktualisiert);
  return aktualisiert;
}

/**
 * Löscht eine Ist-Buchung — und lässt dabei keine halbe Umbuchung zurück.
 *
 * Eine Umbuchung besteht aus zwei Beinen auf zwei Konten, verbunden über `transferId`.
 * Verschwindet eines davon, steht das andere mit einer `transferId` da, zu der es kein
 * Paar mehr gibt, und einem `gegenkontoId`, auf dem nichts mehr steht. Die Zeile sieht
 * danach aus wie eine gewöhnliche Umschichtung — nur dass das Geld auf der Gegenseite
 * nie ankam. Am echten Bestand ist genau das einmal passiert und war hinterher nicht
 * mehr auffindbar.
 *
 * Deshalb wird das übrige Bein GELÖST, nicht mitgelöscht. Der Unterschied ist fachlich:
 *
 *   • Wer eine UMBUCHUNG wegwirft, meint beide Beine — dafür gibt es
 *     `umbuchungLoeschen`, und der Buchungsdialog ruft genau das auf.
 *   • Wer EINE BUCHUNG löscht (ein Duplikat, eine falsch erfasste Zeile), meint diese
 *     eine. Das Bein auf dem anderen Konto ist keine Dublette und keine Falscherfassung;
 *     es hat nur seinen Partner verloren. Es zu löschen wäre eine Aussage über ein
 *     Konto, über das niemand etwas gesagt hat.
 *
 * Dieselbe Auflösung nimmt `bankzeileVerwerfen` seit jeher vor. Sie steht jetzt hier,
 * damit sie für JEDEN Aufrufer gilt und nicht für die, die daran gedacht haben.
 */
export async function buchungLoeschen(ledger: LedgerPort, id: string): Promise<void> {
  const alle = await ledger.alle();
  const buchung = alle.find((b) => b.id === id);
  if (buchung?.transferId) {
    for (const bein of alle) {
      if (bein.transferId !== buchung.transferId || bein.id === id) continue;
      await ledger.speichern({ ...bein, transferId: undefined, gegenkontoId: undefined });
    }
  }
  await ledger.loeschen(id);
}
