// Zahlungsspur — eine gebuchte Zahlung mit den Merkmalen, an denen sie erkannt wird.
//
// Sie liegt bei der BUCHUNG und nicht mehr bei den Verträgen, obwohl sie dort entstand.
// Der Grund steht in ihren eigenen Feldern: `verwendungszweck`, `kategorieId`,
// `kategorieHerkunft` und `geteilt` tragen alle den Vermerk, dass sie für die
// KATEGORISIERUNG da sind, nicht für die Vertragserkennung. Ein Typ, dessen halbe
// Feldliste einem anderen Bereich gehört, ist kein Typ dieses Bereichs mehr.
//
// Gebraucht wird sie inzwischen von der Vertragserkennung, dem Kategorie-Abgleich, dem
// Trainingsmaterial, der Merkmalskonfiguration und den Budgetvorschlägen. Zusammengebaut
// wird sie an genau einer Stelle: `application/buchung/zahlungsspuren`.
//
// Warum sie überhaupt existiert und nicht einfach `IstBuchung` ist: Empfänger,
// Verwendungszweck und Gläubiger-ID stehen NICHT an der Buchung, sondern am `Umsatz` aus
// dem Import. Solange das so ist, braucht die Erkennung einen Typ, der beides
// zusammenführt. Verschwindet diese Trennung, verschwindet auch dieser Typ.

import type { Cent } from "../basis/geld";

/**
 * Eine gebuchte Zahlung, so weit sie für die Erkennung zählt. Bewusst eine eigene,
 * flache Form statt `IstBuchung`: Empfänger und Gläubiger-ID stehen am `Umsatz`
 * (Import-Kontext), nicht an der Buchung — das Zusammenführen ist Sache der
 * aufrufenden Schicht, nicht des Kerns.
 */
export interface Zahlungsspur {
  readonly id: string;
  /** ISO „YYYY-MM-DD". */
  readonly datum: string;
  /** Vorzeichenbehaftet; negativ = Abfluss. */
  readonly betrag: Cent;
  readonly gegenpartei: string;
  /**
   * Verwendungszweck der Quellzeile.
   *
   * Die Vertragserkennung nutzt ihn NICHT VON SELBST — ein Vertrag hängt am Empfänger,
   * nicht am Text, und `standardErkennung` legt nie ein Zweck-Merkmal an. Seit
   * 2026-08-28 kann man von Hand eines eintragen (`Merkmalsart: "verwendungszweck"`),
   * für den Fall, in dem der Empfänger nichts hergibt: eine Dauerüberweisung an eine
   * Privatperson, bei der nur der Zweck sagt, worum es geht.
   *
   * Er steht ohnehin hier, weil die Kategorisierung ihn braucht und aus demselben Join
   * stammt (`application/zahlungsspuren`); ein zweiter Lader für dieselbe Verbindung
   * wären zwei Antworten auf dieselbe Frage.
   */
  readonly verwendungszweck?: string;
  readonly glaeubigerId?: string;
  readonly kategorieId?: string;
  /**
   * Wer die Kategorie gesetzt hat. Wie `kategorieId` und `geteilt` steht das hier für die
   * Kategorisierung, nicht für die Vertragserkennung: der rückwirkende Abgleich muss eine
   * Handentscheidung erkennen können, ohne sich die Ist-Buchung dazu nochmal zu holen.
   * Fehlend zählt als `automatisch`.
   */
  readonly kategorieHerkunft?: "automatisch" | "manuell";
  /**
   * Trägt die Buchung eine Aufteilung? Dann hat sie mehrere Kategorien und taugt weder
   * als Trainingsbeispiel noch als Ziel eines automatischen Laufs.
   */
  readonly geteilt?: boolean;
  /** Konto, über das die Zahlung lief — der Vorschlag reicht es an die Maske durch. */
  readonly kontoId?: string;
  /**
   * `Aufwand` und `Ertrag` können ein Vertrag sein, `Umschichtung` nicht. Ohne diese
   * Prüfung stand auf echten Daten das eigene „Tagesgeldkonto" als Vertragsvorschlag
   * in der Liste: eine monatliche Umbuchung aufs Sparkonto ist perfekt regelmäßig —
   * und trotzdem keine Zahlung an jemanden, sondern eigenes Geld, das den Platz wechselt.
   */
  readonly charakter: "Aufwand" | "Ertrag" | "Umschichtung";
}
