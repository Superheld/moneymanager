// Was zwei Exporte teilen: wohin geschrieben wird und wie die Datei heisst.
//
// **Warum das hier steht und nicht im Konfigurationsexport.** Bis 2026-08-30 gab es genau
// einen Export, und beides lag bei ihm. Seit der Bestandsexport daneben steht, benutzen
// zwei Use-Cases denselben Port — und ein Port, den zwei benutzen, gehoert keinem von
// beiden. Ohne diesen Schritt haette `bestandsexport` von `konfiguration` importieren
// muessen, obwohl die beiden fachlich nichts miteinander zu tun haben.
//
// **Der Unterschied zwischen den beiden Dateien ist keine Formsache**, und deshalb faellt
// er hier zusammen mit dem Namen: `konfiguration-…` sagt, wie der Haushalt ORDNET, und
// darf weitergegeben werden; `bestand-…` sagt, was in ihm passiert ist, und darf es nicht.
// Wer eine dritte Art anlegt, entscheidet mit dem Praefix, in welche der beiden Klassen
// sie faellt — und die Antwort gehoert in denselben Kommentar wie diese hier.

/**
 * Wohin eine Exportdatei geht.
 *
 * Der Port kennt keinen Pfad, nur einen Dateinamen: WO exportiert wird, entscheidet der
 * Adapter (und dahinter das Rust-Kommando), nicht der Use-Case. Ein Use-Case, der ein
 * Verzeichnis benennt, haette eine Meinung ueber das Dateisystem — und die gehoert nicht
 * in die Anwendungsschicht.
 */
export interface ExportZiel {
  /** Schreibt die Datei und meldet, wo sie gelandet ist. */
  schreiben(name: string, inhalt: string): Promise<string>;
}

/**
 * Was fuer ein Export es ist — und damit, wie die Datei heisst.
 *
 * Zwei Werte, zwei Zusicherungen: `konfiguration` traegt keine Zahlung und darf deshalb
 * das Haus verlassen, `bestand` traegt IBANs, Salden und jeden Verwendungszweck. Der Name
 * ist die einzige Stelle, an der man einer Datei von aussen ansieht, welche der beiden man
 * vor sich hat — im Dateimanager, im Anhang einer Mail, in einem Ordner voller Exporte.
 */
export type Exportart = "konfiguration" | "bestand";

/**
 * Der Dateiname zu einer Art, einem Tag und einem Bestand.
 *
 * **Die Bestandskennung ist nicht Zierrat.** Der echte Bestand und der Spielstand liegen
 * in zwei Dateien, aber im SELBEN App-Datenverzeichnis — der Identifier trennt sie nicht
 * (siehe `datenbankdatei.ts`). Ohne Kennung schreiben beide Apps denselben Namen, und ein
 * Export aus der installierten App ueberschriebe den des Spielstands wortlos. Die beiden
 * sehen von aussen gleich aus; welcher gemeint war, wuesste danach niemand mehr.
 *
 * Ein Export je Art, Tag und Bestand, der neuere ersetzt den aelteren. Bei einer
 * Momentaufnahme ist das richtig — anders als bei den Sicherungen, wo der ALTE Stand der
 * wertvolle ist.
 */
export function exportDateiname(art: Exportart, erzeugt: Date, bestand: string): string {
  const kennung = bestand.replace(/\.db$/, "");
  return `${art}-${kennung}-${erzeugt.toISOString().slice(0, 10)}.json`;
}
