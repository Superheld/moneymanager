// Tests der FinTS-Übersetzung. Kein Netz, kein Zustand — das ist der Teil, der ohne
// Bank prüfbar ist.
//
// ALLE Daten hier sind ERFUNDEN: die IBANs sind Dokumentations-IBANs, Empfänger und
// Beträge frei gewählt. Die Struktur der Freitexte ist echt (aus dem Spike abgeschaut),
// der Inhalt nicht. Das Repo ist öffentlich, und genau an dieser Stelle lag schon einmal
// monatelang eine echte IBAN in zwei Import-Tests.

import { describe, expect, it } from "vitest";
import { waehrungNachCode } from "../../core";
import {
  auszugsProben,
  auszugsStaende,
  bankbetragZuCent,
  klartextAnreicherung,
  isoDatum,
  zuRohUmsatz,
  zuVormerkung,
  type FintsBuchung,
} from "./uebersetzung";

describe("bankbetragZuCent", () => {
  it("rechnet Euro-Fließkomma in Cent um, auch wo die Multiplikation kippt", () => {
    // -128.14 * 100 ist in IEEE 754 -12813.999999999998. Ohne Rundung stünde hier ein
    // gebrochener Cent — und die Anwendungsgrenze (istCent) wiese ihn zurück.
    expect(bankbetragZuCent(-128.14)).toBe(-12814);
    expect(bankbetragZuCent(-8.37)).toBe(-837);
    expect(bankbetragZuCent(300)).toBe(30000);
    expect(bankbetragZuCent(0)).toBe(0);
  });

  it("folgt der Skala der Währung statt fest mit 100 zu multiplizieren", () => {
    expect(bankbetragZuCent(1234, waehrungNachCode("JPY"))).toBe(1234); // 0 Nachkommastellen
    expect(bankbetragZuCent(1.234, waehrungNachCode("KWD"))).toBe(1234); // 3 Nachkommastellen
  });

  it("wirft, statt einen unbrauchbaren Betrag durchzulassen", () => {
    expect(() => bankbetragZuCent(Number.NaN)).toThrow();
    expect(() => bankbetragZuCent(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => bankbetragZuCent(1e15)).toThrow(); // jenseits des sicheren Integer-Bereichs
  });
});

describe("isoDatum", () => {
  it("nimmt den lokalen Kalendertag, nicht den UTC-Tag", () => {
    // lib-fints parst Datumsangaben auf LOKALE Mitternacht. In Mitteleuropa ist das
    // …T22:00Z bzw. T23:00Z — ein toISOString().slice(0,10) läge einen Tag zurück, bei
    // jeder Buchung, und verschöbe damit auch jede Monatsgrenze. Der Aufbau hier gilt in
    // jeder Zeitzone: konstruiert wird lokale Mitternacht, erwartet wird derselbe Tag.
    const lokaleMitternacht = new Date(2026, 7, 1, 0, 0, 0);
    expect(isoDatum(lokaleMitternacht)).toBe("2026-08-01");

    const monatsgrenze = new Date(2026, 0, 1, 0, 0, 0);
    expect(isoDatum(monatsgrenze)).toBe("2026-01-01");
  });

  it("polstert das Jahr vierstellig, weil die Datumsordnung über Stringvergleiche läuft", () => {
    const frueh = new Date(2026, 0, 5, 0, 0, 0);
    frueh.setFullYear(83);
    expect(isoDatum(frueh)).toBe("0083-01-05");
  });

  it("wirft bei einem kaputten Datum", () => {
    expect(() => isoDatum(new Date("Unfug"))).toThrow();
  });
});

describe("klartextAnreicherung", () => {
  it("zerlegt die Klartext-Etiketten ohne Trennzeichen", () => {
    // So kleben diese Banken es zusammen: kein CRED+/MREF+/SVWZ+, sondern deutsche Etiketten
    // direkt aneinander. Ein Wert endet dort, wo das nächste bekannte Etikett beginnt.
    const zweck =
      "LASTSCHRIFT / BELASTUNGBEISPIELHAENDLER - LASTSCHRIFTEINZUG 4711" +
      "END-TO-END-REF.:4711CORE / MANDATSREF.:900001GLÄUBIGER-ID:DE98ZZZ09999999901Ref. A1B2C3D4E5F6G7H8";

    const a = klartextAnreicherung(zweck);
    expect(a.buchungstext).toBe("LASTSCHRIFT / BELASTUNG");
    expect(a.zweck).toBe("BEISPIELHAENDLER - LASTSCHRIFTEINZUG 4711");
    // Die SEPA-Sequenzart („CORE") klebt am Ende der Referenz — manche Banken trennen sie
    // nicht ab. Bleibt so: `e2eReferenz` wandert nicht in den RohUmsatz, sie ist
    // Diagnosewert. Getrimmt wird nur der Separator „ / ".
    expect(a.e2eReferenz).toBe("4711CORE");
    expect(a.mandatsreferenz).toBe("900001");
    expect(a.glaeubigerId).toBe("DE98ZZZ09999999901");
    expect(a.bankreferenz).toBe("A1B2C3D4E5F6G7H8");
  });

  it('behandelt „NICHT ANGEGEBEN" als leer, nicht als Wert', () => {
    const a = klartextAnreicherung("KARTENVERFÜGUNGIRGENDEIN LADENMANDATSREF.:NICHT ANGEGEBENRef. Z9Y8X7W6V5U4T3S2");
    expect(a.mandatsreferenz).toBeUndefined();
    expect(a.zweck).toBe("IRGENDEIN LADEN");
    expect(a.bankreferenz).toBe("Z9Y8X7W6V5U4T3S2");
  });

  it("lässt einen Zweck ohne bekannte Muster unangetastet", () => {
    // Das ist der Punkt der eigenen Naht: greift nichts, fehlen nur die Zusatzfelder.
    const a = klartextAnreicherung("Miete August, Wohnung 3");
    expect(a.zweck).toBe("Miete August, Wohnung 3");
    expect(a.buchungstext).toBeUndefined();
    expect(a.glaeubigerId).toBeUndefined();
  });

  it("kommt mit leerem und fehlendem Zweck klar", () => {
    expect(klartextAnreicherung(undefined).zweck).toBe("");
    expect(klartextAnreicherung("   ").zweck).toBe("");
  });
});

describe("zuRohUmsatz", () => {
  const buchung = (over: Partial<FintsBuchung> = {}): FintsBuchung => ({
    valueDate: new Date(2026, 7, 3, 0, 0, 0),
    entryDate: new Date(2026, 7, 4, 0, 0, 0),
    amount: -49.9,
    purpose: "LASTSCHRIFT / BELASTUNGSTROMWERKE NORDABSCHLAG 08/2026GLÄUBIGER-ID:DE98ZZZ09999999901",
    remoteName: "Stromwerke Nord",
    ...over,
  });

  it("übersetzt die Felder, auf die die Import-Kette angewiesen ist", () => {
    const u = zuRohUmsatz(buchung(), { iban: "DE31999999980000000002", name: "Girokonto", waehrung: "EUR" });

    expect(u.buchungstag).toBe("2026-08-04"); // entryDate
    expect(u.valuta).toBe("2026-08-03"); // valueDate
    expect(u.betrag).toBe(-4990);
    expect(u.waehrung).toBe("EUR");
    expect(u.gegenpartei).toBe("Stromwerke Nord");
    expect(u.verwendungszweck).toBe("STROMWERKE NORDABSCHLAG 08/2026");
    expect(u.glaeubigerId).toBe("DE98ZZZ09999999901");
    expect(u.kontoIban).toBe("DE31999999980000000002");
    expect(u.kontoName).toBe("Girokonto");
    expect(u.quelle).toBe("fints");
  });

  it("kommt ohne Valuta aus, aber nicht ohne Buchungstag", () => {
    // Seit dem CAMT-Ausbau der Bibliothek sind beide Daten optional — für eine noch nicht
    // gebuchte Zeile, der die Bank gar kein Datum mitgibt. Die stehen in `notedStatements`,
    // das wir nicht lesen; kommt trotzdem eine an, entscheidet die Form von `RohUmsatz`:
    // `valuta` ist optional und bleibt dann leer, `buchungstag` ist Pflicht und wirft.
    // Der Wurf ist der Punkt — die Schleife im Adapter macht daraus eine Warnung zu DIESER
    // Zeile, ein erfundenes Datum stünde dagegen für immer unauffällig im Bestand.
    expect(zuRohUmsatz(buchung({ valueDate: undefined }), {}).valuta).toBeUndefined();
    expect(() => zuRohUmsatz(buchung({ entryDate: undefined }), {})).toThrow(/Buchungstag/);
  });

  it("reicht die vier CAMT-Angaben durch, die heute niemand auswertet", () => {
    // Sie kommen mit, WEIL sie später nicht mehr zu holen sind: ein Institut hält Umsätze
    // begrenzt vor. Der Test steht hier, damit sie nicht beim nächsten Umbau der
    // Übersetzung still herausfallen — auffallen würde es sonst nirgends.
    const u = zuRohUmsatz(
      buchung({
        entryReference: "NTRY-4711",
        proprietaryCode: "NTRF+117",
        transactionId: "TX-2026-0042",
        creditorReference: "RF18539007547034",
      }),
      {},
    );
    expect(u.eintragReferenz).toBe("NTRY-4711");
    expect(u.bankBuchungscode).toBe("NTRF+117");
    expect(u.transaktionsId).toBe("TX-2026-0042");
    expect(u.strukturierteReferenz).toBe("RF18539007547034");
    // Und die Transaktionskennung geht ausdrücklich NICHT als native ID durch: dort
    // trüge sie die Dedup, und ob sie über zwei Abrufe stabil ist, weiss niemand.
    expect(u.nativeId).toBeUndefined();
  });

  it("uebersetzt die Zahlungen hinter einer Sammelbuchung", () => {
    // Die Buchung traegt die Summe und keine Gegenpartei — es gibt nicht eine. Was sie
    // enthielt, steht nur hier, und nach der Speicherfrist der Bank nirgends mehr.
    const u = zuRohUmsatz(
      buchung({
        remoteName: undefined,
        amount: -1250,
        details: [
          { amount: { value: -450, currency: "EUR" }, remoteName: "Kesselmann", purpose: "Abschlag" },
          { amount: { value: -800 }, remoteName: "Ohlert", purposeCode: "SALA" },
        ],
      }),
      { waehrung: "EUR" },
    );
    expect(u.sammelposten).toHaveLength(2);
    expect(u.sammelposten?.[0]).toMatchObject({ betrag: -45000, gegenpartei: "Kesselmann" });
    // Ohne eigene Waehrung gilt die des Kontos.
    expect(u.sammelposten?.[1]).toMatchObject({ betrag: -80000, zweckCode: "SALA" });
  });

  it("laesst einen unbrauchbaren Postenbetrag den Posten stehen, statt die Zeile zu kippen", () => {
    // Die Posten sind Beiwerk: der Betrag der BUCHUNG kommt von der Bank und stimmt.
    // Wer daran wirft, verliert eine richtige Buchung wegen einer Nebenangabe.
    const u = zuRohUmsatz(
      buchung({ details: [{ amount: { value: Number.NaN }, remoteName: "Vibora" }] }),
      {},
    );
    expect(u.sammelposten?.[0].betrag).toBeUndefined();
    expect(u.sammelposten?.[0].gegenpartei).toBe("Vibora");
  });

  it("macht aus einer leeren Detailliste keinen Sammelposten", () => {
    expect(zuRohUmsatz(buchung({ details: [] }), {}).sammelposten).toBeUndefined();
  });

  it("uebernimmt, was die Bank ueber die Zahlung sonst noch sagt", () => {
    const u = zuRohUmsatz(
      buchung({
        status: "PDNG",
        isReversal: true,
        originalAmount: { value: -24.99, currency: "USD" },
        exchangeRate: 1.0842,
        charges: { value: -1.75, currency: "EUR" },
        returnReason: { code: "AC04", text: "Konto aufgeloest" },
        customerReference: "NONREF",
      }),
      { waehrung: "EUR" },
    );
    expect(u.buchungsstand).toBe("PDNG");
    expect(u.istStorno).toBe(true);
    expect([u.originalBetrag, u.originalWaehrung, u.wechselkurs]).toEqual([-2499, "USD", 1.0842]);
    expect([u.gebuehrBetrag, u.gebuehrWaehrung]).toEqual([-175, "EUR"]);
    expect([u.ruecklaufCode, u.ruecklaufText]).toEqual(["AC04", "Konto aufgeloest"]);
    expect(u.kundenreferenz).toBe("NONREF");
  });

  it("sammelt die Felder ohne eigene Aussage unter ihren Namen aus der Bibliothek", () => {
    // Der Zweck ist, dass beim naechsten Stand der Bibliothek nichts auf den Boden
    // faellt, bloss weil hier keine Spalte dafuer steht.
    const u = zuRohUmsatz(
      buchung({ transactionType: "NTRF", primeNotesNr: "  ", batch: { numberOfTransactions: 3 } }),
      {},
    );
    expect(u.bankfelder).toEqual({ transactionType: "NTRF", batch: { numberOfTransactions: 3 } });
    // Ein leeres Feld ist keine Angabe und steht deshalb nicht drin.
    expect(u.bankfelder).not.toHaveProperty("primeNotesNr");
  });

  it("laesst ein leeres Sammelfeld ganz weg", () => {
    expect(zuRohUmsatz(buchung(), {}).bankfelder).toBeUndefined();
  });

  it("laesst einen unbrauchbaren Nebenbetrag die Zeile nicht kippen", () => {
    // Gebuehr und Originalbetrag stehen NEBEN dem Betrag der Buchung, und der stimmt.
    const u = zuRohUmsatz(buchung({ charges: { value: Number.NaN, currency: "EUR" } }), {});
    expect(u.gebuehrBetrag).toBeUndefined();
    expect(u.betrag).toBe(-4990);
  });

  it("uebersetzt eine Vormerkung — und laesst sie ohne Datum durch", () => {
    // GENAU DIESER FALL ist der Grund, warum die Bibliothek beide Datumsfelder optional
    // gemacht hat. Bei einer Buchung waere ein fehlendes Datum ein Grund, die Zeile
    // abzuweisen; bei einer Vormerkung ist es eine ohne Termin — und die ist mehr wert
    // als keine.
    const ohne = zuVormerkung(
      buchung({ entryDate: undefined, valueDate: undefined, status: "PDNG" }),
      "EUR",
    );
    expect(ohne.datum).toBeUndefined();
    expect(ohne.betrag).toBe(-4990);
    expect(ohne.buchungsstand).toBe("PDNG");
    expect(ohne.gegenpartei).toBe("Stromwerke Nord");

    // Mit Datum gewinnt der Buchungstag, wie bei einer Buchung auch.
    expect(zuVormerkung(buchung(), "EUR").datum).toBe("2026-08-04");
  });

  it("nimmt die Valuta, wenn nur sie dasteht", () => {
    expect(zuVormerkung(buchung({ entryDate: undefined }), "EUR").datum).toBe("2026-08-03");
  });

  it("lässt nativeId leer — FinTS liefert hier keine stabile Buchungs-ID", () => {
    // customerReference ist durchgehend NONREF, bankReference („POS 54") ein Zähler über
    // das abgefragte Fenster. Eine instabile ID wäre schlimmer als keine: die Dedup würde
    // echte Buchungen verwerfen. Sie läuft deshalb allein über rohHash.
    expect(zuRohUmsatz(buchung(), {}).nativeId).toBeUndefined();
  });

  it("markiert nichts als Umbuchung — FinTS kennt die anderen Konten des Nutzers nicht", () => {
    expect(zuRohUmsatz(buchung(), {}).istUmbuchung).toBe(false);
  });

  it("übernimmt die Gegenpartei-IBAN nur, wenn es wirklich eine ist", () => {
    // MT940 füllt remoteAccountNumber je nach Bank mit IBAN ODER nationaler Kontonummer.
    // Eine Kontonummer als IBAN weiterzureichen ergäbe im Konto-Match und im rohHash Müll.
    const mitIban = zuRohUmsatz(buchung({ remoteAccountNumber: "DE66999999970000000003" }), {});
    expect(mitIban.gegenparteiIban).toBe("DE66999999970000000003");

    const mitKontonummer = zuRohUmsatz(buchung({ remoteAccountNumber: "137075030" }), {});
    expect(mitKontonummer.gegenparteiIban).toBeUndefined();
  });

  it("nimmt ein befülltes remoteIdentifier vor dem geparsten Freitext", () => {
    // Heute füllt lib-fints das Feld nie. Täte es das eines Tages, ist die typisierte
    // Angabe die verlässlichere — der Parser ist nur der Ersatz dafür.
    const u = zuRohUmsatz(buchung({ remoteIdentifier: "DE98ZZZ09999999999" }), {});
    expect(u.glaeubigerId).toBe("DE98ZZZ09999999999");
  });

  it("verträgt eine Buchung ohne Gegenpartei und ohne Zweck", () => {
    // Kommt vor: remoteName fehlte im Spike bei 8 von 54 Buchungen.
    const u = zuRohUmsatz(buchung({ remoteName: undefined, purpose: undefined }), {});
    expect(u.gegenpartei).toBe("");
    expect(u.verwendungszweck).toBe("");
  });
});

/**
 * Die Stände aus den Auszügen sind die Grundlage des Kontoabgleichs — und die Stelle, an
 * der eine Erfindung der Bibliothek gefährlich wird: der CAMT-Parser legt einen
 * Anfangssaldo von NULL an, wenn die Bank keinen mitschickt. Ungeprüft übernommen wäre das
 * ein Anker „an diesem Tag lag nichts auf dem Konto", und der meldet die gesamte
 * Kontodeckung als Fehlbetrag.
 */
describe("auszugsStaende", () => {
  const stand = (iso: string, euro: number) => ({
    date: new Date(`${iso}T00:00:00`),
    currency: "EUR",
    value: euro,
  });

  it("nimmt Anfangs- und Schlusssaldo, wenn sie auf verschiedene Tage fallen", () => {
    const staende = auszugsStaende([
      { openingBalance: stand("2026-07-31", 1200), closingBalance: stand("2026-08-22", 1330.5) },
    ]);
    expect(staende).toEqual([
      { datum: "2026-07-31", betrag: 120000 },
      { datum: "2026-08-22", betrag: 133050 },
    ]);
  });

  it("lässt einen Anfangssaldo weg, der auf denselben Tag fällt wie der Schluss", () => {
    // Genau die Form, die der CAMT-Parser erfindet: Wert null, Datum vom Schluss.
    const staende = auszugsStaende([
      { openingBalance: stand("2026-08-22", 0), closingBalance: stand("2026-08-22", 843.07) },
    ]);
    expect(staende).toEqual([{ datum: "2026-08-22", betrag: 84307 }]);
  });

  it("nimmt mehrere Auszüge in ihrer Reihenfolge", () => {
    const staende = auszugsStaende([
      { openingBalance: stand("2026-06-30", 100), closingBalance: stand("2026-07-31", 200) },
      { openingBalance: stand("2026-07-31", 200), closingBalance: stand("2026-08-31", 300) },
    ]);
    expect(staende.map((s) => s.datum)).toEqual([
      "2026-06-30", "2026-07-31", "2026-07-31", "2026-08-31",
    ]);
  });

  it("kommt ohne Schlusssaldo klar, statt zu werfen", () => {
    expect(auszugsStaende([{ openingBalance: stand("2026-08-01", 500) }])).toEqual([]);
  });

  it("übergeht einen Auszug mit kaputtem Datum und vermerkt es", () => {
    const warnungen: string[] = [];
    const kaputt = { date: new Date("nichts"), currency: "EUR", value: 5 };
    const staende = auszugsStaende(
      [{ closingBalance: kaputt }, { closingBalance: stand("2026-08-22", 10) }],
      warnungen,
    );
    expect(staende).toEqual([{ datum: "2026-08-22", betrag: 1000 }]);
    expect(warnungen).toHaveLength(1);
  });
});

/**
 * Die Summenprobe. Der Fall aus der Praxis, gegen den sie gebaut ist: EINE Zeile mit
 * falschem Vorzeichen. Im Bestand ist die später nicht mehr auffindbar — der Kontoabgleich
 * zeigt sie als konstanten Versatz über alle Anker, und genau so sieht auch ein zu hoch
 * geschätzter Anfangsbestand aus. Die beiden sind ohne einen Anker VOR dem Fehler nicht zu
 * unterscheiden. Hier ist der Fehler dagegen auf einen Auszug eingegrenzt.
 *
 * Ebenso wichtig ist, wann die Probe SCHWEIGT: ein Wächter, der bei jedem Lauf meldet,
 * wird abgeschaltet statt gelesen.
 */
describe("auszugsProben", () => {
  const stand = (iso: string, euro: number, currency = "EUR") => ({
    date: new Date(`${iso}T00:00:00`),
    currency,
    value: euro,
  });
  const b = (euro: number) => ({ amount: euro });

  it("schweigt, wenn die Buchungen die gemeldete Veränderung ergeben", () => {
    expect(
      auszugsProben([
        {
          openingBalance: stand("2026-07-31", 1000),
          closingBalance: stand("2026-08-31", 940.1),
          transactions: [b(-50), b(-20.15), b(10.25)],
        },
      ]),
    ).toEqual([]);
  });

  it("findet eine Zeile mit falschem Vorzeichen und nennt die doppelte Lücke", () => {
    // Die Bank buchte 49,95 ab, geliefert kam sie als Zufluss. Der Fehler verschiebt um
    // 2 × Betrag — dieselbe Signatur, die core/CLAUDE.md für ein gedrehtes Vorzeichen nennt.
    const proben = auszugsProben([
      {
        openingBalance: stand("2026-07-31", 1000),
        closingBalance: stand("2026-08-31", 950.05),
        transactions: [b(49.95)],
      },
    ]);
    expect(proben).toHaveLength(1);
    expect(proben[0]).toMatchObject({ datum: "2026-08-31", luecke: -9990, buchungen: 1 });
  });

  it("findet eine fehlende Buchung", () => {
    const proben = auszugsProben([
      {
        openingBalance: stand("2026-07-31", 1000),
        closingBalance: stand("2026-08-31", 800),
        transactions: [b(-150)],
      },
    ]);
    expect(proben[0].luecke).toBe(-5000);
  });

  it("schweigt ohne Anfangssaldo — da gibt es nichts zu prüfen", () => {
    expect(
      auszugsProben([{ closingBalance: stand("2026-08-31", 800), transactions: [b(-150)] }]),
    ).toEqual([]);
  });

  /**
   * Der wichtigste Schweigefall. Der CAMT-Parser der Bibliothek erfindet einen
   * Anfangssaldo von NULL mit dem Datum des Schlusssaldos, wenn die Bank keinen liefert.
   * Dagegen geprüft meldete die Probe bei jedem solchen Auszug den vollen Kontostand als
   * Lücke — dieselbe Regel wie in `auszugsStaende`, aus demselben Grund.
   */
  it("schweigt bei einem Anfangssaldo, den die Bibliothek erfunden hat", () => {
    expect(
      auszugsProben([
        {
          openingBalance: stand("2026-08-31", 0),
          closingBalance: stand("2026-08-31", 843.07),
          transactions: [b(-150)],
        },
      ]),
    ).toEqual([]);
  });

  it("schweigt, wenn die beiden Salden in verschiedenen Währungen stehen", () => {
    expect(
      auszugsProben([
        {
          openingBalance: stand("2026-07-31", 1000, "CHF"),
          closingBalance: stand("2026-08-31", 800, "EUR"),
          transactions: [b(-150)],
        },
      ]),
    ).toEqual([]);
  });

  it("prüft jeden Auszug für sich", () => {
    const proben = auszugsProben([
      {
        openingBalance: stand("2026-06-30", 100),
        closingBalance: stand("2026-07-31", 50),
        transactions: [b(-50)],
      },
      {
        openingBalance: stand("2026-07-31", 50),
        closingBalance: stand("2026-08-31", 30),
        transactions: [b(-10)],
      },
    ]);
    expect(proben.map((p) => p.datum)).toEqual(["2026-08-31"]);
  });
});

describe("zuRohUmsatz — was die Bank ausdruecklich nennt", () => {
  const konto = { iban: "DE31999999980000000002", name: "Girokonto", waehrung: "EUR" };
  const buchung = (over: Partial<FintsBuchung> = {}): FintsBuchung => ({
    valueDate: new Date(2026, 7, 3, 0, 0, 0),
    entryDate: new Date(2026, 7, 4, 0, 0, 0),
    amount: -49.9,
    purpose: "Rechnung",
    remoteName: "Talmberg Energie",
    ...over,
  });

  /**
   * Der Grund, warum es beide Felder gibt. `remoteAccountNumber` traegt, was das Format
   * gerade hergibt — in CAMT die IBAN, in MT940 die nationale Kontonummer aus `?31` —, und
   * keine Angabe sagt, welches von beiden. `remoteIban` ist dagegen eine Zusage.
   */
  it("nimmt die ausdrueckliche IBAN, auch wenn daneben eine Kontonummer steht", () => {
    const u = zuRohUmsatz(
      buchung({ remoteIban: "DE04999999980000000003", remoteAccountNumber: "234567" }),
      konto,
    );
    expect(u.gegenparteiIban).toBe("DE04999999980000000003");
  });

  it("faellt auf remoteAccountNumber zurueck, wenn dort eine IBAN steht", () => {
    const u = zuRohUmsatz(buchung({ remoteAccountNumber: "DE04999999980000000003" }), konto);
    expect(u.gegenparteiIban).toBe("DE04999999980000000003");
  });

  /**
   * Die MT940-Kontonummer aus `?31` darf NICHT als IBAN durchgehen: Konto-Match und
   * rohHash normalisieren IBANs, eine Kontonummer wuerde dort stillschweigend zu Muell.
   */
  it("laesst eine nationale Kontonummer nicht als IBAN durch", () => {
    const u = zuRohUmsatz(buchung({ remoteAccountNumber: "234567" }), konto);
    expect(u.gegenparteiIban).toBeUndefined();
  });

  it("uebernimmt Zweckcode und Endempfaenger, wo die Bank sie nennt", () => {
    const u = zuRohUmsatz(
      buchung({
        purposeCode: "SALA",
        ultimateParty: "Buchhandlung Talmberg",
        remoteName: "Zahlungsdienstleister",
      }),
      konto,
    );
    expect(u.zweckCode).toBe("SALA");
    // Die direkte Gegenpartei bleibt, was sie ist — der Endempfaenger steht DANEBEN.
    // Wer beides vermischt, verliert die Information, ueber wen gezahlt wurde.
    expect(u.gegenpartei).toBe("Zahlungsdienstleister");
    expect(u.endempfaenger).toBe("Buchhandlung Talmberg");
  });

  /**
   * MT940 liefert beides nie. Das ist eine ehrliche Luecke und kein Grund, etwas zu
   * erfinden — ein aus dem Verwendungszweck geratener Endempfaenger saehe aus wie eine
   * Angabe der Bank.
   */
  it("laesst beide leer, wo das Format sie nicht kennt", () => {
    const u = zuRohUmsatz(buchung(), konto);
    expect(u.zweckCode).toBeUndefined();
    expect(u.endempfaenger).toBeUndefined();
  });

  it("behandelt Leerstrings wie fehlende Angaben", () => {
    const u = zuRohUmsatz(buchung({ purposeCode: "  ", ultimateParty: "" }), konto);
    expect(u.zweckCode).toBeUndefined();
    expect(u.endempfaenger).toBeUndefined();
  });
});
