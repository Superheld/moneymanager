import { describe, expect, it } from "vitest";
import {
  herkunftVon,
  MERKMALSHERKUENFTE,
  merkmaleFuer,
  merkmalsbefund,
  namensraum,
  STANDARD_KONFIGURATION,
  STOPPWOERTER,
  type Merkmalsherkunft,
} from "./merkmale";

function quelle(over: Partial<Parameters<typeof merkmaleFuer>[0]> = {}) {
  return { gegenpartei: "REWE Markt GmbH", verwendungszweck: "", betrag: -1234, ...over };
}

describe("Empfänger", () => {
  it("liefert den ganzen normalisierten Namen als ein Token", () => {
    // Rechtsform ist über anbieterSchluessel schon draußen.
    expect(merkmaleFuer(quelle())).toContain("emp=rewe markt");
  });

  it("liefert zusätzlich die Einzelwörter — sie generalisieren auf fremde Anbieter", () => {
    const m = merkmaleFuer(quelle({ gegenpartei: "Apotheke am Markt" }));
    expect(m).toContain("emp:apotheke");
    expect(m).toContain("emp:markt");
    // Das Teil-Token „am" fällt als Stoppwort weg …
    expect(m).not.toContain("emp:am");
  });

  it("der ganze Schlüssel bleibt die ungefilterte Form von anbieterSchluessel", () => {
    // … der GANZE Schlüssel behält es aber. Er muss Zeichen für Zeichen dem entsprechen,
    // was die Vertragserkennung als Anbieterschlüssel führt — sonst trägt derselbe
    // Anbieter in den beiden Systemen zwei verschiedene Namen.
    expect(merkmaleFuer(quelle({ gegenpartei: "Apotheke am Markt" }))).toContain("emp=apotheke am markt");
  });

  it("ein einwortiger Name bekommt KEIN Teil-Token", () => {
    // Sonst zählte derselbe Anbieter doppelt und bekäme gegenüber mehrwortigen Namen
    // stillschweigend mehr Gewicht.
    const m = merkmaleFuer(quelle({ gegenpartei: "Vibora GmbH" }));
    expect(m).toContain("emp=vibora");
    expect(m).not.toContain("emp:vibora");
  });

  it("Umlaute und Schreibweisen fallen zusammen", () => {
    const a = merkmaleFuer(quelle({ gegenpartei: "Müller Drogerie" }));
    const b = merkmaleFuer(quelle({ gegenpartei: "MUELLER DROGERIE" }));
    expect(a).toEqual(b);
  });
});

describe("Verwendungszweck", () => {
  it("nimmt die Wörter, in eigenem Namensraum", () => {
    const m = merkmaleFuer(quelle({ verwendungszweck: "Monatsbeitrag Fitnessstudio" }));
    expect(m).toContain("vwz:monatsbeitrag");
    expect(m).toContain("vwz:fitnessstudio");
  });

  it("wirft Referenznummern und Ziffernfolgen weg", () => {
    const b = merkmalsbefund(
      quelle({ verwendungszweck: "Rechnung RE2026004711 vom 15.03.2026 IBAN DE93999999990000000001" }),
    );
    expect(b.merkmale.some((m) => m.includes("2026004711"))).toBe(false);
    expect(b.merkmale.some((m) => m.includes("de93999999990000000001"))).toBe(false);
    expect(b.verworfen.map((v) => v.grund)).toContain("ziffern");
  });

  it("lässt kurze ziffernhaltige Marken stehen", () => {
    // Die Grenze existiert genau für diesen Fall: „o2" ist ein Anbieter, keine Referenz.
    expect(merkmaleFuer(quelle({ verwendungszweck: "o2 Mobilfunk" }))).toContain("vwz:o2");
  });

  it("schneidet angeklebte Nummern ab, statt das Wort wegzuwerfen", () => {
    // Am echten Bestand gemessen: Banken setzen zwischen Bezeichnung und Nummer kein
    // Leerzeichen. Ohne das Abschneiden fielen zwei der häufigsten Wörter überhaupt
    // komplett aus dem Vokabular — der Kartenname und der Name der Bank.
    const m = merkmaleFuer(quelle({ verwendungszweck: "DEBITKARTE2025 3386MUSTERBANK" }));
    expect(m).toContain("vwz:debitkarte");
    expect(m).toContain("vwz:musterbank");
  });

  it("behält eine dreistellige Abkürzung nach dem Abschneiden", () => {
    expect(merkmaleFuer(quelle({ verwendungszweck: "3386KDN" }))).toContain("vwz:kdn");
  });

  it("wirft weg, wenn nach dem Abschneiden nur ein Präfix übrig bleibt", () => {
    // „de" aus der IBAN und „re" aus der Rechnungsnummer sind keine Wörter, sondern die
    // Reste von Nummern — sie kämen massenhaft vor und bedeuteten nichts.
    const b = merkmalsbefund(quelle({ verwendungszweck: "DE93999999990000000001 RE2026004711" }));
    expect(b.merkmale).not.toContain("vwz:de");
    expect(b.merkmale).not.toContain("vwz:re");
    expect(b.verworfen.every((v) => v.grund === "ziffern")).toBe(true);
  });

  it("erkennt maskierte Kartennummern als Platzhalter", () => {
    // „xxxx" gehört zu den häufigsten Wörtern überhaupt. Was es verdeckt, wäre das
    // Interessante.
    const b = merkmalsbefund(quelle({ verwendungszweck: "VISA XXXX" }));
    expect(b.merkmale).not.toContain("vwz:xxxx");
    expect(b.verworfen).toContainEqual({ wort: "xxxx", grund: "platzhalter", herkunft: "vwz" });
    expect(b.merkmale).toContain("vwz:visa"); // der Rest bleibt
  });

  it("die Statistik nennt das Originalwort, nicht den gekürzten Kern", () => {
    // Sonst stünde in der Anzeige ein Wort, das so nirgends in den Daten vorkommt.
    const b = merkmalsbefund(quelle({ verwendungszweck: "RE2026004711" }));
    expect(b.verworfen).toContainEqual({ wort: "re2026004711", grund: "ziffern", herkunft: "vwz" });
  });

  it("wirft Bank-Boilerplate über die Ausschlussliste weg", () => {
    const b = merkmalsbefund(quelle({ verwendungszweck: "SEPA Lastschrift Mandatsreferenz Kundennummer" }));
    expect(b.merkmale.filter((m) => namensraum(m) === "vwz")).toHaveLength(0);
    expect(b.verworfen.every((v) => v.grund === "ausgeschlossen")).toBe(true);
  });

  it("behält Zahlungsarten — die korrelieren durchaus mit Kategorien", () => {
    expect(STOPPWOERTER.has("kartenzahlung")).toBe(false);
    expect(merkmaleFuer(quelle({ verwendungszweck: "Kartenzahlung" }))).toContain("vwz:kartenzahlung");
  });
});

describe("Gläubiger-ID und Vorzeichen", () => {
  it("nimmt die Gläubiger-ID als eigenes Token auf, in Großschreibung", () => {
    expect(merkmaleFuer(quelle({ glaeubigerId: "de98zzz09999999999" }))).toContain("gid:DE98ZZZ09999999999");
  });

  it("ohne Gläubiger-ID entsteht kein Token", () => {
    expect(merkmaleFuer(quelle()).some((m) => namensraum(m) === "gid")).toBe(false);
  });

  it("trennt Abfluss und Zufluss", () => {
    // Ohne das wäre eine Supermarkt-Gutschrift vom Einkauf nicht zu unterscheiden.
    expect(merkmaleFuer(quelle({ betrag: -1234 }))).toContain("vz:-");
    expect(merkmaleFuer(quelle({ betrag: 1234 }))).toContain("vz:+");
  });

  it("Betrag 0 bekommt kein Vorzeichen-Token", () => {
    expect(merkmaleFuer(quelle({ betrag: 0 })).some((m) => namensraum(m) === "vz")).toBe(false);
  });
});

describe("Form des Ergebnisses", () => {
  it("enthält keine Dubletten", () => {
    const m = merkmaleFuer(quelle({ gegenpartei: "Markt Markt", verwendungszweck: "markt" }));
    expect(new Set(m).size).toBe(m.length);
  });

  it("Namensräume trennen gleiche Wörter aus verschiedenen Feldern", () => {
    // „markt" im Empfängerfeld und „markt" im Zweck sind zwei verschiedene Belege —
    // sonst könnte ein Wort aus dem Zweck ein Empfänger-Token überstimmen.
    const m = merkmaleFuer(quelle({ gegenpartei: "Apotheke am Markt", verwendungszweck: "Markt" }));
    expect(m).toContain("emp:markt");
    expect(m).toContain("vwz:markt");
  });

  it("leere Eingabe liefert nur das Vorzeichen", () => {
    expect(merkmaleFuer({ gegenpartei: "", verwendungszweck: "", betrag: -100 })).toEqual(["vz:-"]);
  });

  it("namensraum liest das Präfix beider Trennzeichen", () => {
    expect(namensraum("emp=rewe markt")).toBe("emp");
    expect(namensraum("emp:rewe")).toBe("emp");
    expect(namensraum("ohnepraefix")).toBe("");
  });
});

describe("Steuerung über die Konfiguration", () => {
  const nur = (...herkuenfte: Merkmalsherkunft[]) => ({ herkuenfte, ausschluesse: [] });

  it("eine abgeschaltete Herkunft liefert keine Tokens", () => {
    const m = merkmaleFuer(quelle({ verwendungszweck: "Einkauf" }), nur("empGanz"));
    expect(m).toEqual(["emp=rewe markt"]);
  });

  it("abgeschaltet heißt nicht verworfen — sie wurde gar nicht gefragt", () => {
    // Sonst stünde jedes Wort des Verwendungszwecks in der Verwurfsliste, obwohl es
    // dort nie zur Prüfung stand.
    const b = merkmalsbefund(quelle({ verwendungszweck: "Einkauf Markt" }), nur("empGanz"));
    expect(b.verworfen).toEqual([]);
  });

  it("trennt emp= und emp: — sie wirken verschieden und sind einzeln schaltbar", () => {
    expect(merkmaleFuer(quelle(), nur("empGanz"))).toEqual(["emp=rewe markt"]);
    expect(merkmaleFuer(quelle(), nur("empWort"))).toEqual(["emp:rewe", "emp:markt"]);
  });

  it("schließt ein Wort überall aus, wenn keine Herkunft genannt ist", () => {
    const k = {
      herkuenfte: MERKMALSHERKUENFTE,
      ausschluesse: [{ wort: "markt" }],
    };
    const m = merkmaleFuer(quelle({ verwendungszweck: "Markt" }), k);
    expect(m).not.toContain("emp:markt");
    expect(m).not.toContain("vwz:markt");
    expect(m).toContain("emp:rewe");
  });

  it("schließt nur in der genannten Herkunft aus", () => {
    // Der Fall, für den die Einschränkung existiert: dasselbe Wort ist im Empfängerfeld
    // brauchbar und im Verwendungszweck Rauschen.
    const k = {
      herkuenfte: MERKMALSHERKUENFTE,
      ausschluesse: [{ wort: "markt", herkuenfte: ["vwz" as const] }],
    };
    const m = merkmaleFuer(quelle({ verwendungszweck: "Markt" }), k);
    expect(m).toContain("emp:markt");
    expect(m).not.toContain("vwz:markt");
  });

  it("„überall“ schlägt eine Einschränkung zum selben Wort", () => {
    const k = {
      herkuenfte: MERKMALSHERKUENFTE,
      ausschluesse: [{ wort: "markt", herkuenfte: ["vwz" as const] }, { wort: "markt" }],
    };
    const m = merkmaleFuer(quelle({ verwendungszweck: "Markt" }), k);
    expect(m).not.toContain("emp:markt");
    expect(m).not.toContain("vwz:markt");
  });

  it("ein Ausschluss erscheint mit Grund und Herkunft im Befund", () => {
    const k = { herkuenfte: MERKMALSHERKUENFTE, ausschluesse: [{ wort: "einkauf" }] };
    const b = merkmalsbefund(quelle({ verwendungszweck: "Einkauf" }), k);
    expect(b.verworfen).toContainEqual({ wort: "einkauf", grund: "ausgeschlossen", herkunft: "vwz" });
  });

  it("greift auf die BEREINIGTE Form, nicht auf die Schreibweise im Auszug", () => {
    // Ausgeschlossen wird das Wort, das ohne den Ausschluss zum Token geworden wäre.
    const k = { herkuenfte: MERKMALSHERKUENFTE, ausschluesse: [{ wort: "debitkarte" }] };
    expect(merkmaleFuer(quelle({ verwendungszweck: "DEBITKARTE2025" }), k)).not.toContain("vwz:debitkarte");
  });

  it("schließt auch den ganzen Empfängernamen aus", () => {
    const k = { herkuenfte: MERKMALSHERKUENFTE, ausschluesse: [{ wort: "rewe markt" }] };
    expect(merkmaleFuer(quelle(), k)).not.toContain("emp=rewe markt");
  });

  it("leere Konfiguration liefert gar nichts", () => {
    expect(merkmaleFuer(quelle({ verwendungszweck: "Einkauf" }), { herkuenfte: [], ausschluesse: [] })).toEqual([]);
  });

  it("die Grundausstattung hat alle Herkünfte und die mitgelieferten Stoppwörter", () => {
    expect(STANDARD_KONFIGURATION.herkuenfte).toEqual(MERKMALSHERKUENFTE);
    expect(STANDARD_KONFIGURATION.ausschluesse.length).toBe(STOPPWOERTER.size);
    expect(STANDARD_KONFIGURATION.ausschluesse.every((a) => !a.herkuenfte)).toBe(true);
  });

  it("herkunftVon liest die Herkunft aus dem Präfix", () => {
    expect(herkunftVon("emp=rewe markt")).toBe("empGanz");
    expect(herkunftVon("emp:rewe")).toBe("empWort");
    expect(herkunftVon("vwz:einkauf")).toBe("vwz");
    expect(herkunftVon("gid:DE98")).toBe("gid");
    expect(herkunftVon("vz:-")).toBe("vz");
    expect(herkunftVon("ohnepraefix")).toBeNull();
  });
});
