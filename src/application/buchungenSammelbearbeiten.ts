// Sammelbearbeitung — dieselbe Änderung an vielen Buchungen.
//
// Der Fall, für den es das gibt: nach einem Import stehen dreissig Zeilen desselben
// Händlers ohne Kategorie da. Einzeln durch den Dialog sind das dreissig Mal fünf Klicks.
//
// Zwei Regeln, die den Use-Case von einer Schleife über `buchungBearbeiten` unterscheiden:
//
//   1. **Nur gesetzte Felder wirken.** `undefined` heisst „nicht anfassen", nicht „leeren".
//      Sonst löschte eine Sammeländerung der Kategorie nebenbei alle Notizen. Die
//      Kategorie zu LEEREN bleibt möglich — dafür steht `kategorieId: null`, ein anderer
//      Wert als „nicht angegeben".
//   2. **Betrag, Datum und Konto sind nicht dabei.** Sie sind je Buchung verschieden;
//      ein gemeinsamer Wert wäre in fast allen Fällen falsch. Wer sie ändern will, öffnet
//      die einzelne Buchung.
//
// Der Charakter wird NICHT mitgesetzt: er folgt der Kategorie (siehe BuchungDetail), und
// eine Buchung, deren Kategorie sich ändert, erbt ihn hier genauso.

import { FachlicherFehler, type IstBuchung, type Kategorie } from "../core";
import { verwerfen, zuruecksetzen } from "./import";
import type { LedgerPort, UmsatzRepository } from "./ports";

export interface SammelAenderung {
  /** Neue Kategorie; `null` leert sie ausdrücklich, `undefined` lässt sie stehen. */
  kategorieId?: string | null;
  /** Neue Bezeichnung/Notiz; leerer String leert sie, `undefined` lässt sie stehen. */
  notiz?: string;
}

/**
 * Wendet `aenderung` auf alle `buchungen` an und speichert jede einzeln.
 *
 * Kein „alles oder nichts": das Repository schreibt Zeile für Zeile, und eine Klammer
 * darüber gäbe es hier so wenig wie bei den Migrationen (siehe CLAUDE.md — der Pool
 * verteilt jedes execute auf eine eigene Verbindung). Bricht es in der Mitte ab, ist der
 * Teil davor geschrieben; das ist der ehrlichere Zustand als eine Transaktion, die nur
 * so aussieht.
 *
 * Umbuchungs-Beine bleiben AUSSEN VOR: sie tragen keine Kategorie (sie verschieben nur
 * eigenes Geld), und eine ihnen aufgezwungene Kategorie stünde gegen den Charakter
 * `Umschichtung`. Sie werden übersprungen, nicht als Fehler gemeldet — wer dreissig
 * Zeilen markiert, hat vielleicht eine Umbuchung mitgegriffen, und deshalb soll nicht
 * die ganze Aktion scheitern.
 */
export async function buchungenSammelbearbeiten(
  ledger: LedgerPort,
  buchungen: readonly IstBuchung[],
  aenderung: SammelAenderung,
  kategorien: readonly Kategorie[],
): Promise<{ geaendert: number; uebersprungen: number }> {
  const setztKategorie = aenderung.kategorieId !== undefined;
  const setztNotiz = aenderung.notiz !== undefined;
  if (!setztKategorie && !setztNotiz) throw new FachlicherFehler("sammel.nichtsGewaehlt");

  const kategorie = aenderung.kategorieId
    ? kategorien.find((k) => k.id === aenderung.kategorieId)
    : undefined;
  if (aenderung.kategorieId && !kategorie) throw new FachlicherFehler("kategorie.waehlen");

  let geaendert = 0;
  let uebersprungen = 0;
  for (const b of buchungen) {
    if (setztKategorie && b.transferId) {
      uebersprungen++;
      continue;
    }
    const neueKategorie = setztKategorie ? (aenderung.kategorieId ?? undefined) : b.kategorieId;
    const kategorieWechselt = setztKategorie && neueKategorie !== b.kategorieId;
    const aktualisiert: IstBuchung = {
      ...b,
      kategorieId: neueKategorie,
      // Die Herkunft beschreibt die KATEGORIE: sie springt nur um, wenn die sich
      // tatsächlich ändert. Wer nur die Bezeichnung setzt, trifft keine
      // Kategorie-Entscheidung — und entzieht die Buchung damit auch nicht der Automatik.
      kategorieHerkunft: kategorieWechselt ? "manuell" : b.kategorieHerkunft,
      // Der Charakter folgt der Kategorie, wie im Einzeldialog. Bei einer Umschichtung
      // bleibt er stehen (die kommt aus der Umbuchung, nicht aus der Kategorie).
      charakter: kategorieWechselt && kategorie && b.charakter !== "Umschichtung"
        ? kategorie.defaultCharakter
        : b.charakter,
      notiz: setztNotiz ? aenderung.notiz!.trim() || undefined : b.notiz,
    };
    await ledger.speichern(aktualisiert);
    geaendert++;
  }
  return { geaendert, uebersprungen };
}

/**
 * Löscht mehrere Buchungen. `gesperrteIds` sind die Buchungen, die aus einem BANKABRUF
 * stammen: was die Bank geliefert hat, wird nicht von Hand entfernt — beim nächsten Abruf
 * käme es ohnehin zurück, und bis dahin stimmte der Saldo nicht mehr mit ihr überein.
 * Wer eine solche Zeile loswerden will, verwirft sie im Abruf.
 *
 * Gesperrt ist die HERKUNFT, nicht das Konto: eine Zeile aus einem Dateiimport oder von
 * Hand ist auch auf einem Bankkonto löschbar — die Bank kennt sie nicht und holt sie
 * nicht zurück.
 *
 * **Der zugehörige Umsatz wird mit weggelegt.** Ohne das blieb er auf „verbucht" stehen
 * und zeigte auf eine Buchung, die es nicht mehr gibt — ein Widerspruch in den Daten mit
 * sichtbarer Folge: die Dublettenprüfung im Ledger mahnte weiter Zeilen an, die längst
 * entfernt waren (32 solche Umsätze im echten Bestand). Er wird `verworfen`, nicht
 * `neu`: wer dreißig Zeilen markiert und wegwirft, will sie nicht danach im Stapel
 * wiederfinden. In der Datenbank bleibt er — „das habe ich schon einmal weggeworfen" ist
 * genau die Auskunft, die der nächste Import braucht.
 *
 * Der Einzeldialog setzt stattdessen auf `neu` zurück, und das ist Absicht: dort löscht
 * man EINE falsch erfasste Buchung und will sie meist gleich richtig erfassen.
 */
export async function buchungenLoeschen(
  ledger: LedgerPort,
  buchungen: readonly IstBuchung[],
  gesperrteIds: ReadonlySet<string>,
  /** Ohne ihn wird nur das Ledger geräumt — die Umsätze bleiben dann stehen. */
  umsatzRepo?: UmsatzRepository,
): Promise<{ geloescht: number; gesperrt: number }> {
  const umsaetze = umsatzRepo ? await umsatzRepo.alle() : [];
  let geloescht = 0;
  let gesperrt = 0;
  for (const b of buchungen) {
    if (gesperrteIds.has(b.id)) {
      gesperrt++;
      continue;
    }
    await ledger.loeschen(b.id);
    const u = umsaetze.find((x) => x.istbuchungId === b.id && x.status === "verbucht");
    if (u && umsatzRepo) await umsatzRepo.speichern(verwerfen(zuruecksetzen(u)));
    geloescht++;
  }
  return { geloescht, gesperrt };
}
