// Encoding-Erkennung des Datei-Lesepfads.
//
// Diese Schicht hat derzeit KEINEN Aufrufer: seit der Finanzguru-Adapter xlsx liest
// (2026-08-16), stellt sich die Encoding-Frage dort nicht mehr — XML ist immer UTF-8.
// Sie bleibt für die nächste textbasierte Quelle stehen (Bank-CSV, Roadmap S-6), und
// deshalb bleibt auch ihr Test stehen: der Fund, den er belegt, ist teuer.
//
// Zuvor lag dieser Test in `robustheit-import.test.ts` und ging über den Adapter. Hier
// prüft er die Schicht, um die es tatsächlich geht.

import { describe, expect, it } from "vitest";
import { textAusPuffer } from "./dateiText";

/** Buffer → ArrayBuffer, ohne den Rest des Node-Pools mitzuschleppen. */
function puffer(text: string, encoding: BufferEncoding): ArrayBuffer {
  const b = Buffer.from(text, encoding);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe("textAusPuffer", () => {
  /**
   * FUND 4: `File.text()` dekodiert IMMER als UTF-8 und ist dabei fehlertolerant — aus
   * „Müller" wird stillschweigend „M�ller". Doppelt teuer, weil Gegenpartei und
   * Verwendungszweck Suchfelder sind UND in den rohHash eingehen: nach einer späteren
   * Encoding-Korrektur dedupliziert nichts mehr gegen die alten Zeilen.
   */
  it("verstümmelt Latin-1-Umlaute nicht", () => {
    expect(textAusPuffer(puffer("Müller & Söhne", "latin1"))).toBe("Müller & Söhne");
  });

  it("liest sauberes UTF-8 unverändert", () => {
    expect(textAusPuffer(puffer("Müller & Söhne", "utf8"))).toBe("Müller & Söhne");
  });

  it("kommt mit einem leeren Puffer zurecht", () => {
    expect(textAusPuffer(new ArrayBuffer(0))).toBe("");
  });

  /** Reines ASCII ist in beiden Kodierungen byte-gleich — darf sich nie unterscheiden. */
  it("behandelt ASCII in beiden Kodierungen gleich", () => {
    expect(textAusPuffer(puffer("Trinkgut;-6,55", "latin1"))).toBe("Trinkgut;-6,55");
    expect(textAusPuffer(puffer("Trinkgut;-6,55", "utf8"))).toBe("Trinkgut;-6,55");
  });
});
