import { describe, expect, it } from "vitest";
import { belegSchluessel, neueBelege, rohHash } from "./rohHash";

const zeile = {
  kontoIban: "DE02999999120000000001",
  buchungstag: "2026-03-14",
  betrag: -1990,
  gegenpartei: "Kesselmann",
  verwendungszweck: "Rechnung 4",
};

describe("rohHash", () => {
  it("trennt nach Konto, Tag, Betrag, Gegenpartei und Zweck", () => {
    const h = rohHash(zeile);
    expect(rohHash({ ...zeile, betrag: -1991 })).not.toBe(h);
    expect(rohHash({ ...zeile, buchungstag: "2026-03-15" })).not.toBe(h);
    expect(rohHash({ ...zeile, gegenpartei: "Ohlert" })).not.toBe(h);
    expect(rohHash({ ...zeile, verwendungszweck: "Rechnung 5" })).not.toBe(h);
  });

  it("liest dieselbe IBAN in jeder Schreibweise gleich", () => {
    expect(rohHash({ ...zeile, kontoIban: "de02 9999 9912 0000 000001" })).toBe(rohHash(zeile));
  });

  /**
   * Das Loch, das bis zum 06.09.2026 offen stand: ohne IBAN begann der Schlüssel mit
   * einem LEEREN Kontofeld, und zwei Zeilen verschiedener Konten trugen denselben Hash.
   * Die Kontogrenze, die überall sonst hart ist, fiel ausgerechnet hier weg.
   */
  it("nimmt das Konto der App, wenn die Quelle keine IBAN liefert", () => {
    const ohne = { ...zeile, kontoIban: undefined };
    expect(rohHash(ohne, "konto-a")).not.toBe(rohHash(ohne, "konto-b"));
  });

  it("lässt einen Hash MIT IBAN unverändert", () => {
    // Nachgereicht statt eingesetzt: sonst änderten sich alle bestehenden Hashes, und der
    // nächste Import fände den Bestand nicht wieder.
    expect(rohHash(zeile, "konto-a")).toBe(rohHash(zeile));
  });
});

describe("neueBelege", () => {
  const beleg = (rohHash: string, nativeId?: string) => ({ rohHash, nativeId });

  it("lässt denselben Inhalt aus einer ANDEREN Quelle durch", () => {
    // Der Fall, um den es geht: die Bankfassung einer Zahlung, die schon aus einer
    // Fremdsoftware im Bestand liegt. Sie trägt mehr, also gehört sie gespeichert.
    const bestand = { belegSchluessel: [belegSchluessel("finanzguru", "h1")] };
    expect(neueBelege([beleg("h1")], "fints", bestand).neu).toHaveLength(1);
  });

  it("hält denselben Inhalt aus DERSELBEN Quelle zurück", () => {
    // Jeder Abruf überlappt bewusst um sieben Tage. Ohne diese Grenze füllte sich die
    // Tabelle mit bitgleichen Kopien.
    const bestand = { belegSchluessel: [belegSchluessel("fints", "h1")] };
    expect(neueBelege([beleg("h1")], "fints", bestand).bekannt).toHaveLength(1);
  });

  it("unterscheidet zwei Zeilen derselben Quelle an ihrer nativen Id", () => {
    // Zweimal derselbe Kaffee am selben Tag: gleicher Hash, verschiedene Id. Wo die
    // Quelle Ids vergibt, sind es zwei Zahlungen.
    const { neu } = neueBelege([beleg("h1", "a"), beleg("h1", "b")], "finanzguru", {
      belegSchluessel: [],
    });
    expect(neu).toHaveLength(2);
  });

  it("zählt den Stapel mit", () => {
    // Eine Datei kann dieselbe Zeile zweimal enthalten; ohne Mitwachsen entstünden aus
    // einem Lauf zwei identische Belege.
    const { neu, bekannt } = neueBelege([beleg("h1"), beleg("h1")], "fints", {
      belegSchluessel: [],
    });
    expect(neu).toHaveLength(1);
    expect(bekannt).toHaveLength(1);
  });
});
