// Tests der FinTS-Übersetzung. Kein Netz, kein Zustand — das ist der Teil, der ohne
// Bank prüfbar ist.
//
// ALLE Daten hier sind ERFUNDEN: die IBANs sind Dokumentations-IBANs, Empfänger und
// Beträge frei gewählt. Die Struktur der Freitexte ist echt (aus dem Spike abgeschaut),
// der Inhalt nicht. Das Repo ist öffentlich, und genau an dieser Stelle lag schon einmal
// monatelang eine echte IBAN in zwei Import-Tests.

import { describe, expect, it } from "vitest";
import { waehrungNachCode } from "../../core";
import { bankbetragZuCent, comdirectAnreicherung, isoDatum, zuRohUmsatz, type FintsBuchung } from "./uebersetzung";

describe("bankbetragZuCent", () => {
  it("rechnet Euro-Fließkomma in Cent um, auch wo die Multiplikation kippt", () => {
    // -102.55 * 100 ist in IEEE 754 -10254.999999999998. Ohne Rundung stünde hier ein
    // gebrochener Cent — und die Anwendungsgrenze (istCent) wiese ihn zurück.
    expect(bankbetragZuCent(-102.55)).toBe(-10255);
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

describe("comdirectAnreicherung", () => {
  it("zerlegt die Klartext-Etiketten ohne Trennzeichen", () => {
    // So klebt comdirect es zusammen: kein CRED+/MREF+/SVWZ+, sondern deutsche Etiketten
    // direkt aneinander. Ein Wert endet dort, wo das nächste bekannte Etikett beginnt.
    const zweck =
      "LASTSCHRIFT / BELASTUNGBEISPIELHAENDLER - LASTSCHRIFTEINZUG 4711" +
      "END-TO-END-REF.:4711CORE / MANDATSREF.:900001GLÄUBIGER-ID:DE17ZZZ00000001797Ref. A1B2C3D4E5F6G7H8";

    const a = comdirectAnreicherung(zweck);
    expect(a.buchungstext).toBe("LASTSCHRIFT / BELASTUNG");
    expect(a.zweck).toBe("BEISPIELHAENDLER - LASTSCHRIFTEINZUG 4711");
    // Die SEPA-Sequenzart („CORE") klebt am Ende der Referenz — comdirect trennt sie
    // nicht ab. Bleibt so: `e2eReferenz` wandert nicht in den RohUmsatz, sie ist
    // Diagnosewert. Getrimmt wird nur der Separator „ / ".
    expect(a.e2eReferenz).toBe("4711CORE");
    expect(a.mandatsreferenz).toBe("900001");
    expect(a.glaeubigerId).toBe("DE17ZZZ00000001797");
    expect(a.bankreferenz).toBe("A1B2C3D4E5F6G7H8");
  });

  it('behandelt „NICHT ANGEGEBEN" als leer, nicht als Wert', () => {
    const a = comdirectAnreicherung("KARTENVERFÜGUNGIRGENDEIN LADENMANDATSREF.:NICHT ANGEGEBENRef. Z9Y8X7W6V5U4T3S2");
    expect(a.mandatsreferenz).toBeUndefined();
    expect(a.zweck).toBe("IRGENDEIN LADEN");
    expect(a.bankreferenz).toBe("Z9Y8X7W6V5U4T3S2");
  });

  it("lässt einen Zweck ohne bekannte Muster unangetastet", () => {
    // Das ist der Punkt der eigenen Naht: greift nichts, fehlen nur die Zusatzfelder.
    const a = comdirectAnreicherung("Miete August, Wohnung 3");
    expect(a.zweck).toBe("Miete August, Wohnung 3");
    expect(a.buchungstext).toBeUndefined();
    expect(a.glaeubigerId).toBeUndefined();
  });

  it("kommt mit leerem und fehlendem Zweck klar", () => {
    expect(comdirectAnreicherung(undefined).zweck).toBe("");
    expect(comdirectAnreicherung("   ").zweck).toBe("");
  });
});

describe("zuRohUmsatz", () => {
  const buchung = (over: Partial<FintsBuchung> = {}): FintsBuchung => ({
    valueDate: new Date(2026, 7, 3, 0, 0, 0),
    entryDate: new Date(2026, 7, 4, 0, 0, 0),
    amount: -49.9,
    purpose: "LASTSCHRIFT / BELASTUNGSTROMWERKE NORDABSCHLAG 08/2026GLÄUBIGER-ID:DE17ZZZ00000001797",
    remoteName: "Stromwerke Nord",
    ...over,
  });

  it("übersetzt die Felder, auf die die Import-Kette angewiesen ist", () => {
    const u = zuRohUmsatz(buchung(), { iban: "DE02120300000000202051", name: "Girokonto", waehrung: "EUR" });

    expect(u.buchungstag).toBe("2026-08-04"); // entryDate
    expect(u.valuta).toBe("2026-08-03"); // valueDate
    expect(u.betrag).toBe(-4990);
    expect(u.waehrung).toBe("EUR");
    expect(u.gegenpartei).toBe("Stromwerke Nord");
    expect(u.verwendungszweck).toBe("STROMWERKE NORDABSCHLAG 08/2026");
    expect(u.glaeubigerId).toBe("DE17ZZZ00000001797");
    expect(u.kontoIban).toBe("DE02120300000000202051");
    expect(u.kontoName).toBe("Girokonto");
    expect(u.quelle).toBe("fints");
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
    const mitIban = zuRohUmsatz(buchung({ remoteAccountNumber: "DE02500105170137075030" }), {});
    expect(mitIban.gegenparteiIban).toBe("DE02500105170137075030");

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
