// useBetragUndRichtung — Höhe und Richtung eines Betrags im Buchungsdialog.
//
// Herausgezogen aus `BuchungFormular` (2026-11-10, K1 der Oberflächenliste): drei
// Zustände und drei Handgriffe, die nur einander kennen und am Ende EINE Zahl liefern
// (`gebuchterBetrag`). Das Verhalten ist unverändert; die Begründungen stehen hier, wo
// die Mechanik steht.
//
// **HÖHE und RICHTUNG stehen getrennt** — zwei Felder, beide sichtbar. Der Betrag im
// Ledger ist vorzeichenbehaftet; die Maske zerlegt ihn beim Öffnen und setzt ihn beim
// Speichern wieder zusammen. Die Richtung ist damit nicht etwas, das man dem Feld
// ansehen (oder erraten) muss, sondern eine Wahl mit zwei Möglichkeiten nebeneinander.
//
// **`vonHand` merkt sich, WER zuletzt gesprochen hat, und nur das.** Solange niemand die
// Auswahl angefasst hat, folgt sie der Kategorie — Aufwand fliesst ab, Ertrag fliesst zu;
// sobald jemand sie anfasst, gilt seine Wahl und kein Kategoriewechsel nimmt sie ihm
// wieder weg. Eine bestehende Buchung zählt von Anfang an als von Hand gesetzt: ihre
// Richtung ist eine Tatsache (beim Import die der Bank). Das ist NICHT die alte Ableitung
// mit anderem Namen: die lief unsichtbar hinter dem Feld; diese bewegt einen Schalter,
// den man vor sich sieht.

import { useState } from "react";
import type { Charakter } from "../../../application";
import type { Geld } from "../bausteine/einstellungenKontext";
import { betragsHoehe, richtungVon, vorzeichenAbspalten, type Richtung } from "./Richtungswahl";

export function useBetragUndRichtung(startBetrag: number | undefined, geld: Geld) {
  const [betrag, setBetrag] = useState(startBetrag == null ? "" : betragsHoehe(startBetrag, geld));
  const [richtung, setRichtung] = useState<Richtung>(startBetrag == null ? "ab" : richtungVon(startBetrag));
  const [vonHand, setVonHand] = useState(startBetrag != null);

  return {
    betrag,
    richtung,
    /**
     * Was ins Betragsfeld getippt wird, ist die Höhe. Bringt es ein Vorzeichen mit
     * (getippt oder eingefügt), wandert das in die Richtungsauswahl, statt im Feld
     * stehenzubleiben — dort hätte es keine Wirkung und sähe trotzdem aus, als hätte es
     * eine.
     */
    betragTippen(text: string) {
      const { rest, richtung: gemeint } = vorzeichenAbspalten(text);
      setBetrag(rest);
      if (gemeint) {
        setRichtung(gemeint);
        setVonHand(true);
      }
    },
    richtungWaehlen(gewaehlt: Richtung) {
      setRichtung(gewaehlt);
      setVonHand(true);
    },
    /**
     * Die Kategorie hat gewechselt: die Richtung folgt ihr — aber nur, solange sie
     * niemand selbst gesetzt hat. Der Normalfall bleibt damit ein Handgriff: Kategorie
     * wählen, Höhe tippen, fertig.
     */
    kategorieGewechselt(charakter: Charakter) {
      if (!vonHand) setRichtung(charakter === "Ertrag" ? "zu" : "ab");
    },
    /**
     * Was beim Speichern in den Ledger geht — Höhe mal Richtung, sonst nichts. Keine
     * Ableitung an dieser Stelle: ein Zufluss auf einer Aufwandskategorie ist erlaubt
     * und richtig — eine Erstattung gehört in die Kategorie der Ausgabe, dort entlastet
     * sie deren Budget.
     */
    gebuchterBetrag: (richtung === "ab" ? -1 : 1) * Math.abs(geld.parse(betrag) ?? 0),
  };
}
