// Dateiinhalt → Text, mit Encoding-Erkennung.
//
// `File.text()` dekodiert IMMER als UTF-8 und ist dabei fehlertolerant: eine Latin-1-Datei
// (in deutschen Bank-Exporten weiterhin verbreitet) wird stillschweigend verstümmelt —
// aus „Müller" wird „M\uFFFDller". Das ist doppelt teuer, weil Gegenpartei und
// Verwendungszweck Suchfelder sind UND in den Roh-Hash eingehen: nach einer späteren
// Encoding-Korrektur dedupliziert nichts mehr gegen die alten Zeilen.
//
// Deshalb: erst strikt als UTF-8 versuchen (wirft bei ungültigen Sequenzen), sonst auf
// Latin-1 zurückfallen. Das ist verlustfrei, weil jedes Byte in Latin-1 gültig ist.

export function textAusPuffer(puffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(puffer);
  } catch {
    return new TextDecoder("windows-1252").decode(puffer);
  }
}

/** Bequemer Weg für File/Blob aus dem Datei-Dialog. */
export async function textAusDatei(datei: Blob): Promise<string> {
  return textAusPuffer(await datei.arrayBuffer());
}
