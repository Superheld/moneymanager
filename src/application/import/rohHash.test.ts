import { describe, expect, it } from "vitest";
import { klassifiziere, rohHash } from "./rohHash";

const leererBestand = { hashes: [], nativeIds: [] };

describe("rohHash", () => {
  it("ist deterministisch für gleiche fachliche Daten", () => {
    const a = { kontoIban: "DE12 3456", buchungstag: "2022-01-01", betrag: -655, gegenpartei: "Brandeis", verwendungszweck: "Kasse 1" };
    const b = { kontoIban: "de123456", buchungstag: "2022-01-01", betrag: -655, gegenpartei: "brandeis", verwendungszweck: "kasse 1" };
    // IBAN-Normalisierung (Spaces/Case) sowie Zweck- und Gegenpartei-Normalisierung
    // greifen → gleicher Schlüssel.
    expect(rohHash(a)).toBe(rohHash(b));
  });

  it("normalisiert Whitespace im Verwendungszweck", () => {
    const a = rohHash({ buchungstag: "2022-01-01", betrag: -1, gegenpartei: "x", verwendungszweck: "Foo   Bar" });
    const b = rohHash({ buchungstag: "2022-01-01", betrag: -1, gegenpartei: "x", verwendungszweck: "foo bar" });
    expect(a).toBe(b);
  });

  it("unterscheidet bei abweichendem Betrag", () => {
    const a = rohHash({ buchungstag: "2022-01-01", betrag: -655, gegenpartei: "x", verwendungszweck: "x" });
    const b = rohHash({ buchungstag: "2022-01-01", betrag: -656, gegenpartei: "x", verwendungszweck: "x" });
    expect(a).not.toBe(b);
  });

  it("unterscheidet zwei Händler bei leerem Verwendungszweck", () => {
    // Kartenzahlung: der Zweck ist regelmäßig leer, nur die Gegenpartei trennt.
    const a = rohHash({ kontoIban: "DE1", buchungstag: "2022-01-01", betrag: -2000, gegenpartei: "Rewe", verwendungszweck: "" });
    const b = rohHash({ kontoIban: "DE1", buchungstag: "2022-01-01", betrag: -2000, gegenpartei: "Aldi", verwendungszweck: "" });
    expect(a).not.toBe(b);
  });

  it("lässt sich nicht durch verschobene Feldgrenzen nachbauen", () => {
    // Ein Trennzeichen im Referenzkonto darf keinen fremden Schlüssel erzeugen.
    const a = rohHash({ kontoIban: 'K","2020-01-01', buchungstag: "x", betrag: -5, gegenpartei: "", verwendungszweck: "" });
    const b = rohHash({ kontoIban: "K", buchungstag: "2020-01-01", betrag: -5, gegenpartei: "", verwendungszweck: "" });
    expect(a).not.toBe(b);
  });
});

describe("klassifiziere — Duplikaterkennung", () => {
  it("hält gegen leeren Bestand alles für neu", () => {
    const k = [{ rohHash: "h1", nativeId: "n1" }, { rohHash: "h2" }];
    expect(klassifiziere(k, leererBestand).neu).toHaveLength(2);
  });

  it("erkennt Dubletten über die native ID (exakt)", () => {
    const k = [{ rohHash: "anders", nativeId: "n1" }];
    const { neu, duplikate } = klassifiziere(k, { hashes: [], nativeIds: ["n1"] });
    expect(neu).toHaveLength(0);
    expect(duplikate).toHaveLength(1);
  });

  it("erkennt Dubletten über den Roh-Hash, wenn keine native ID vorhanden ist (quellenübergreifend)", () => {
    const k = [{ rohHash: "h1" }];
    const { duplikate } = klassifiziere(k, { hashes: ["h1"], nativeIds: [] });
    expect(duplikate).toHaveLength(1);
  });

  it("behält zwei Buchungen mit gleichem Roh-Hash, aber verschiedenen native IDs (keine Falsch-Dublette)", () => {
    const k = [{ rohHash: "h1", nativeId: "n1" }, { rohHash: "h1", nativeId: "n2" }];
    const { neu, duplikate } = klassifiziere(k, leererBestand);
    expect(neu).toHaveLength(2);
    expect(duplikate).toHaveLength(0);
  });

  it("dedupliziert ID-lose Zeilen innerhalb desselben Stapels", () => {
    const k = [{ rohHash: "h1" }, { rohHash: "h1" }];
    const { neu, duplikate } = klassifiziere(k, leererBestand);
    expect(neu).toHaveLength(1);
    expect(duplikate).toHaveLength(1);
  });
});
