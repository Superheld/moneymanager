// Welche fremden Kategorien in einer Importdatei stecken — und worauf sie hier hinauslaufen.
//
// **Wozu.** Der Adapter übersetzt die Kategorien seiner Quelle in unser Vokabular
// (`adapters/import/finanzguruKategorien.ts`), und bis hierher passierte das unsichtbar:
// die Zuordnung stand als Tabelle im Code, wirkte beim Übernehmen und war vorher nirgends
// zu sehen. Das ging, solange die Tabelle zum Katalog passte — und genau das ist die
// Annahme, die nicht trägt: **jeder legt seine eigenen Kategorien an.** Eine eingebaute
// Tabelle kann für den Bestand, in dem sie entstand, richtig sein und für den nächsten
// falsch, ohne dass jemand es merkt. Eine Zeile, die nicht übersetzt werden konnte, fällt
// still ans Modell zurück; ein Fehlschlag ohne Fehlermeldung.
//
// Was hier entsteht, ist deshalb kein Bericht, sondern eine ENTSCHEIDUNGSGRUNDLAGE: die
// fremden Namen dieser Datei, wie oft sie vorkommen, was die Übersetzung daraus macht und
// ob es das Ziel im eigenen Katalog überhaupt gibt.
//
// **Nur die Namen dieser Datei, nicht die ganze Tabelle.** Die Übersetzung kennt Dutzende
// Einträge; eine Monatsdatei benutzt eine Handvoll davon. Alle zu zeigen hiesse, die
// Entscheidung zwischen Zeilen zu verstecken, die niemanden betreffen.

import type { Kategorie } from "../../core";
import { katalogNachName } from "./vorschlag";
import type { RohUmsatz } from "./rohUmsatz";

/** Ein fremder Kategoriename aus der Datei, mit dem, was heute daraus würde. */
export interface Fremdkategoriezeile {
  /** Wie die Quelle sie nennt — unübersetzt, so wie sie am Beleg steht. */
  readonly fremdName: string;
  /** Wie oft sie in dieser Datei vorkommt. */
  readonly anzahl: number;
  /**
   * Was die Übersetzung des Adapters daraus macht — ein NAME in unserem Vokabular.
   * Fehlt, wenn die Tabelle den fremden Namen nicht kennt.
   */
  readonly uebersetzung?: string;
  /**
   * Die Kategorie, auf die das im Katalog dieses Bestands wirklich hinausläuft.
   *
   * **Steht `uebersetzung` da und `kategorieId` nicht**, ist das der interessante Fall:
   * die Tabelle hat eine Meinung, und dieser Haushalt hat die Kategorie nicht. Genau der
   * war vorher unsichtbar — die Zeile fiel wortlos ans Modell.
   */
  readonly kategorieId?: string;
}

/** Was in einer Datei an fremden Kategorien steckt, samt dem, was daneben liegt. */
export interface Fremdkategorienbefund {
  readonly zeilen: readonly Fremdkategoriezeile[];
  /** Zeilen ohne Kategorieangabe der Quelle — für sie entscheidet das Modell. */
  readonly ohneAngabe: number;
  /**
   * Zeilen, die die Quelle als Umbuchung markiert hat.
   *
   * Sie stehen hier, weil sie NICHT mitzählen dürfen: eine Umbuchung wird ganz oben in
   * der Kette entschieden und erreicht die Kategorie-Stufe nie. Sie in eine Zuordnung
   * einzurechnen ergäbe eine Zahl, die nichts über das Ergebnis sagt.
   */
  readonly umbuchungen: number;
}

/**
 * Die fremden Kategorien einer Datei, häufigste zuerst.
 *
 * Sortiert nach Anzahl, bei Gleichstand nach Namen: die Reihenfolge ist die der
 * Wirkung — wer die Liste von oben abarbeitet und in der Mitte aufhört, hat das Meiste
 * entschieden. Alphabetisch wäre sie stabiler zu lesen und weniger wert.
 */
export function fremdkategorienInDatei(
  rohUmsaetze: readonly RohUmsatz[],
  kategorien: readonly Kategorie[],
): Fremdkategorienbefund {
  const nachName = katalogNachName(kategorien);
  const anzahlen = new Map<string, number>();
  let ohneAngabe = 0;
  let umbuchungen = 0;

  for (const roh of rohUmsaetze) {
    if (roh.istUmbuchung) {
      umbuchungen++;
      continue;
    }
    const fremd = roh.kategorieHinweis?.trim();
    if (!fremd) {
      ohneAngabe++;
      continue;
    }
    anzahlen.set(fremd, (anzahlen.get(fremd) ?? 0) + 1);
  }

  // Die Übersetzung steht an der ZEILE, nicht in dieser Datei: sie ist Sache des
  // Adapters, und der hat sie beim Lesen schon vorgenommen. Hier wird sie nur wieder
  // eingesammelt — sonst müsste diese Schicht wissen, welche Quelle sie vor sich hat.
  const uebersetzt = new Map<string, string>();
  for (const roh of rohUmsaetze) {
    const fremd = roh.kategorieHinweis?.trim();
    if (fremd && roh.kategorieVorschlag && !uebersetzt.has(fremd)) {
      uebersetzt.set(fremd, roh.kategorieVorschlag);
    }
  }

  const zeilen = [...anzahlen.entries()]
    .map(([fremdName, anzahl]) => {
      const uebersetzung = uebersetzt.get(fremdName);
      return {
        fremdName,
        anzahl,
        uebersetzung,
        kategorieId: uebersetzung ? nachName.get(uebersetzung)?.id : undefined,
      };
    })
    .sort((a, b) => b.anzahl - a.anzahl || a.fremdName.localeCompare(b.fremdName, "de"));

  return { zeilen, ohneAngabe, umbuchungen };
}

/**
 * Die Zuordnung, mit der ein Import startet: fremder Name → Kategorie-Id.
 *
 * Sie ist der VORSCHLAG der eingebauten Übersetzung, kein fester Wert — der Mensch
 * überschreibt sie, bevor er übernimmt. Was er nicht anfasst, bleibt so.
 */
export function vorbelegteZuordnung(befund: Fremdkategorienbefund): Record<string, string> {
  const karte: Record<string, string> = {};
  for (const z of befund.zeilen) if (z.kategorieId) karte[z.fremdName] = z.kategorieId;
  return karte;
}
