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

describe("Was NICHT mehr in den Vektor geht", () => {
  it("kennt die drei Textquellen und den Betrag", () => {
    // Das rohe VORZEICHEN und die Gläubiger-ID sind 2026-08-29 gefallen. Der Wächter
    // steht hier, weil ihr Wiederkommen sonst unbemerkt bliebe: sie tauchten als Zeilen
    // in einer Liste von WÖRTERN auf, und ein `+` ist keins.
    //
    // `betrag` kam 2026-08-31 dazu und ist etwas anderes als das damals gefallene
    // Vorzeichen: er trägt eine GRÖSSENORDNUNG, also eine Klasse, die sich wiederholt —
    // das Vorzeichen allein war ein Vektor aus einem einzigen Wert und lieferte für jede
    // textlose Zeile dieselbe Kategorie.
    expect(MERKMALSHERKUENFTE).toEqual(["empGanz", "empWort", "vwz", "betrag"]);
  });

  it("legt aus einer Zahlung ohne Text gar kein Merkmal an", () => {
    // Vorher blieb das Vorzeichen übrig — ein Vektor, der wie ein Beispiel aussah und
    // für jede textlose Zeile dieselbe Kategorie lieferte.
    expect(merkmaleFuer({ gegenpartei: "", verwendungszweck: "" })).toEqual([]);
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

  it("namensraum liest das Präfix beider Trennzeichen", () => {
    expect(namensraum("emp=kesselmann markt")).toBe("emp");
    expect(namensraum("emp:kesselmann")).toBe("emp");
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
    expect(b.verworfen).toContainEqual({
      wort: "einkauf", grund: "ausgeschlossen", herkunft: "vwz", listenform: "einkauf",
    });
  });

  it("ein Ausschluss trägt die Form der Liste mit, wenn sie vom Auszug abweicht", () => {
    // `wort` bleibt das Original — sonst stünde in der Anzeige ein Wort, das so nirgends
    // in den Daten steht. `token` ist die Form, an der die Ausschlussliste hängt.
    const k = { herkuenfte: MERKMALSHERKUENFTE, ausschluesse: [{ wort: "bankkarte" }] };
    const b = merkmalsbefund(quelle({ verwendungszweck: "Bankkarte2026" }), k);
    expect(b.verworfen).toContainEqual({
      wort: "bankkarte2026", grund: "ausgeschlossen", herkunft: "vwz", listenform: "bankkarte",
    });
  });

  it("ein strukturell verworfenes Wort trägt keine Listenform — es gibt keinen Eintrag dazu", () => {
    const b = merkmalsbefund(quelle({ verwendungszweck: "RE2026004711" }));
    expect(b.verworfen.find((v) => v.wort === "re2026004711")?.listenform).toBeUndefined();
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

  // Ausdrücklich NICHT alle: ein neues Merkmal, das sich selbst einschaltet, ändert
  // jedes bestehende Modell, ohne dass jemand es gemessen hat.
  it("hat in der Grundausstattung die Textquellen, aber nicht den Betrag", () => {
    expect(STANDARD_KONFIGURATION.herkuenfte).toEqual(["empGanz", "empWort", "vwz"]);
    expect(STANDARD_KONFIGURATION.ausschluesse.length).toBe(STOPPWOERTER.size);
    expect(STANDARD_KONFIGURATION.ausschluesse.every((a) => !a.herkuenfte)).toBe(true);
  });

  it("herkunftVon liest die Herkunft aus dem Präfix", () => {
    expect(herkunftVon("emp=kesselmann markt")).toBe("empGanz");
    expect(herkunftVon("emp:kesselmann")).toBe("empWort");
    expect(herkunftVon("vwz:einkauf")).toBe("vwz");
    // Die Präfixe der gefallenen Quellen sind jetzt unbekannt wie jedes andere.
    expect(herkunftVon("gid:DE98")).toBeNull();
    expect(herkunftVon("vz:-")).toBeNull();
    expect(herkunftVon("ohnepraefix")).toBeNull();
  });
});

/**
 * Der Betrag als Merkmal — Grössenordnung, nicht Wert.
 *
 * Der genaue Betrag wäre ein Token, das genau einmal vorkommt: das Modell lernt nichts
 * daraus und das Vokabular wüchse um eine Zeile je Zahlung.
 */
describe("Der Betrag als Merkmal", () => {
  const mit = { herkuenfte: MERKMALSHERKUENFTE, ausschluesse: [] };

  it("liefert nichts, solange die Herkunft nicht eingeschaltet ist", () => {
    expect(merkmaleFuer({ gegenpartei: "Ohlert", verwendungszweck: "", betrag: -1234 })).toEqual([
      "emp=ohlert",
    ]);
  });

  it("fasst zu Grössenordnungen zusammen", () => {
    const von = (betrag: number) =>
      merkmaleFuer({ gegenpartei: "", verwendungszweck: "", betrag }, mit)[0];
    expect(von(-500)).toBe("bet:ab-u10");
    expect(von(-1000)).toBe("bet:ab-u50");
    expect(von(-4999)).toBe("bet:ab-u50");
    expect(von(-20000)).toBe("bet:ab-u1000");
    expect(von(-500000)).toBe("bet:ab-gross");
  });

  // Sonst fielen eine Rückerstattung und ein Einkauf derselben Höhe in dasselbe Token,
  // obwohl sie fachlich das Gegenteil voneinander sind.
  it("trennt Abfluss und Zufluss", () => {
    const von = (betrag: number) =>
      merkmaleFuer({ gegenpartei: "", verwendungszweck: "", betrag }, mit)[0];
    expect(von(-2000)).toBe("bet:ab-u50");
    expect(von(2000)).toBe("bet:zu-u50");
  });

  it("liefert ohne Betrag und bei 0 nichts", () => {
    expect(merkmaleFuer({ gegenpartei: "", verwendungszweck: "" }, mit)).toEqual([]);
    expect(merkmaleFuer({ gegenpartei: "", verwendungszweck: "", betrag: 0 }, mit)).toEqual([]);
  });

  // Er geht an den WORTfiltern vorbei (er ist kein Wort), aber nicht an der
  // Ausschlussliste: was dort steht, bleibt draussen.
  it("lässt sich ausschliessen wie jedes andere Token", () => {
    const ohne = { herkuenfte: MERKMALSHERKUENFTE, ausschluesse: [{ wort: "ab-u50" }] };
    expect(merkmaleFuer({ gegenpartei: "", verwendungszweck: "", betrag: -2000 }, ohne)).toEqual([]);
  });

  it("kennt seine Herkunft am Präfix", () => {
    expect(herkunftVon("bet:ab-u50")).toBe("betrag");
  });
});
