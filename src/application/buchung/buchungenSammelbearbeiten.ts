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

import { FachlicherFehler, type IstBuchung, type Kategorie } from "../../core";
import { verwerfen, zuruecksetzen } from "../import";
import type { LedgerPort, UmsatzRepository } from "../ports";

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
 * entfernt waren (am echten Bestand ein paar Dutzend). Er wird `verworfen`, nicht
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
  // Für die Umbuchungen: das ganze Ledger, nicht nur die Auswahl. Das Gegenbein liegt auf
  // einem ANDEREN Konto und steht deshalb fast nie mit in der Markierung — der Auszug
  // zeigt ja immer nur eines.
  const alle = await ledger.alle();

  let geloescht = 0;
  let gesperrt = 0;
  const erledigt = new Set<string>();

  for (const b of buchungen) {
    if (erledigt.has(b.id)) continue;

    // EINE UMBUCHUNG IST EIN PAAR ODER NICHTS.
    //
    // Hier stand bis 2026-08-28 ein blosses `ledger.loeschen(b.id)`, und damit liess der
    // Sammelmodus ein Bein allein zurück: mit `transferId` auf ein Paar, das es nicht
    // mehr gibt, und `gegenkontoId` auf ein Konto, auf dem nichts mehr steht. Am echten
    // Bestand ist das genau einmal passiert und danach nicht mehr auffindbar gewesen —
    // die Buchung sieht aus wie jede andere Umschichtung, nur dass das Geld auf der
    // Gegenseite nie ankam.
    //
    // Der Einzeldialog macht es seit jeher richtig (`umbuchungLoeschen` nimmt beide
    // Beine). Dieselbe Handlung an zwei Orten muss dasselbe bedeuten.
    const beine = b.transferId ? alle.filter((x) => x.transferId === b.transferId) : [b];

    // Ist EIN Bein geschützt, bleibt das ganze Paar stehen. Ein halb gelöschtes Paar wäre
    // genau der Zustand, den dieser Block verhindert — und „das eine ging, das andere
    // nicht" ist keine Auskunft, mit der jemand etwas anfangen kann.
    if (beine.some((x) => gesperrteIds.has(x.id))) {
      gesperrt++;
      for (const x of beine) erledigt.add(x.id);
      continue;
    }

    for (const x of beine) {
      await ledger.loeschen(x.id);
      const u = umsaetze.find((y) => y.istbuchungId === x.id && y.status === "verbucht");
      if (u && umsatzRepo) await umsatzRepo.speichern(verwerfen(zuruecksetzen(u)));
      erledigt.add(x.id);
    }
    // Ein Paar zählt als EINE Löschung: der Nutzer hat eine Zeile markiert und eine
    // Umbuchung weggeworfen. „2 gelöscht" bei einer Markierung wäre eine Zahl, die
    // niemand nachvollziehen kann.
    geloescht++;
  }
  return { geloescht, gesperrt };
}
