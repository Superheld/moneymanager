// Der Bestandsexport, wieder hereingelesen.
//
// Die wichtigste Zusicherung steht ganz unten: was `bestandExportieren` hinausschreibt,
// muss dieser Adapter aufnehmen können. Ein Export und ein Import, die getrennt geprüft
// werden, driften auseinander — und man merkt es an dem Tag, an dem man die Datei
// wirklich braucht.

import { describe, expect, it } from "vitest";
import { bestandsAdapter } from "./bestandsAdapter";
import {
  BESTANDSEXPORT_FASSUNG,
  bestandExportieren,
  type Bestandsexport,
  type ExportBuchung,
} from "../../application";

function datei(inhalt: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(inhalt, null, 2));
}

const KONTO = {
  id: "ko-1",
  bezeichnung: "Alltagskonto",
  typ: "Giro",
  klasse: "liquide",
  iban: "DE02999999010000001002",
  inhaberIds: [],
  saldo: 100_00,
};

const BELEG = {
  gegenpartei: "Kesselmann",
  verwendungszweck: "Monatsbeitrag 03/2026",
  glaeubigerId: "DE98ZZZ09999999999",
  gegenparteiIban: null,
  mandatsreferenz: "M-4711",
  endempfaenger: null,
  zweckCode: null,
  umsatzart: null,
  buchungsschluessel: null,
  bankBuchungscode: null,
  strukturierteReferenz: null,
  sammelposten: null,
  buchungsstand: "BOOK",
  istStorno: null,
  originalBetrag: null,
  originalWaehrung: null,
  wechselkurs: null,
  gebuehrBetrag: null,
  gebuehrWaehrung: null,
  ruecklaufCode: null,
  ruecklaufText: null,
  waehrung: "EUR",
  valuta: "2026-03-05",
  laufId: "lauf-1",
};

const BUCHUNG = {
  id: "bu-1",
  datum: "2026-03-04",
  betrag: -19_90,
  kontoId: "ko-1",
  kategorieId: "kat-7",
  kategorie: "Versicherungen",
  kategorieHerkunft: "manuell",
  charakter: "Aufwand",
  quelle: "import",
  notiz: null,
  transferId: null,
  gegenkontoId: null,
  vertragId: null,
  vertragHerkunft: null,
  aufteilungen: [],
  zuPruefen: false,
  beleg: BELEG,
};

function bestand(teil: Partial<Bestandsexport> = {}): Uint8Array {
  return datei({
    fassung: BESTANDSEXPORT_FASSUNG,
    erzeugt: "2026-09-22T08:00:00.000Z",
    personen: [],
    konten: [KONTO],
    vertraege: [],
    buchungen: [BUCHUNG],
    ...teil,
  });
}

describe("bestandsAdapter.erkennt", () => {
  it("erkennt einen Bestandsexport", () => {
    expect(bestandsAdapter.erkennt(bestand())).toBe(true);
  });

  /**
   * Der Fall, der die Heuristik überhaupt begründet: eine Konfigurationsdatei trägt
   * ebenfalls `fassung` und `erzeugt`. Wer nur danach sucht, hält sie für einen Bestand
   * und liest anschliessend null Zeilen aus einer Datei, die voll ist.
   */
  it("verwechselt sie nicht mit einer Konfigurationsdatei", () => {
    const konfiguration = datei({
      fassung: 1,
      erzeugt: "2026-09-22T08:00:00.000Z",
      kategorien: [{ id: "k1", name: "Wohnen", elternId: null, defaultCharakter: "Aufwand" }],
    });
    expect(bestandsAdapter.erkennt(konfiguration)).toBe(false);
  });

  it("lässt alles andere liegen", () => {
    expect(bestandsAdapter.erkennt(new TextEncoder().encode("Buchungstag;Betrag\n1;2"))).toBe(false);
    expect(bestandsAdapter.erkennt(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
  });
});

describe("bestandsAdapter.lies", () => {
  it("macht aus einer Zeile einen RohUmsatz samt Beleg und Konto", () => {
    const { umsaetze, warnungen } = bestandsAdapter.lies(bestand());
    expect(warnungen).toEqual([]);
    expect(umsaetze).toHaveLength(1);

    const u = umsaetze[0];
    expect(u.buchungstag).toBe("2026-03-04");
    expect(u.betrag).toBe(-19_90);
    expect(u.gegenpartei).toBe("Kesselmann");
    expect(u.glaeubigerId).toBe("DE98ZZZ09999999999");
    // Aus dem Konto der Datei — die Basis fürs Konto-Mapping beim Übernehmen.
    expect(u.kontoIban).toBe(KONTO.iban);
    expect(u.kontoName).toBe("Alltagskonto");
    // Der NAME, nicht die Id: die gilt nur im Bestand, aus dem die Datei stammt.
    expect(u.kategorieVorschlag).toBe("Versicherungen");
    expect(u.nativeId).toBe("bu-1");
    expect(u.quelle).toBe("bestand");
  });

  it("nimmt eine von Hand erfasste Buchung ohne Beleg mit", () => {
    const ohneBeleg = { ...BUCHUNG, id: "bu-2", beleg: null, notiz: "Kaffeekasse aufgefüllt" };
    const { umsaetze } = bestandsAdapter.lies(bestand({ buchungen: [ohneBeleg] }));

    expect(umsaetze).toHaveLength(1);
    expect(umsaetze[0].gegenpartei).toBe("");
    // Die Notiz ist der einzige Text, den so eine Zahlung hat.
    expect(umsaetze[0].verwendungszweck).toBe("Kaffeekasse aufgefüllt");
    expect(umsaetze[0].waehrung).toBe("EUR");
  });

  it("markiert eine Umschichtung als Umbuchung", () => {
    const um = { ...BUCHUNG, id: "bu-3", charakter: "Umschichtung", transferId: "tr-1" };
    const { umsaetze, warnungen } = bestandsAdapter.lies(bestand({ buchungen: [um] }));
    expect(umsaetze[0].istUmbuchung).toBe(true);
    // Und sagt, dass die Paarung dabei verlorengeht.
    expect(warnungen.join(" ")).toMatch(/nicht mehr gepaart/);
  });

  it("meldet, was beim Weg durch die Inbox verlorengeht", () => {
    const geteilt = {
      ...BUCHUNG,
      id: "bu-4",
      aufteilungen: [
        { kategorieId: "kat-1", betrag: -10_00 },
        { kategorieId: "kat-2", betrag: -9_90 },
      ],
    };
    const fremdesKonto = { ...BUCHUNG, id: "bu-5", kontoId: "gibtesnicht" };
    const { umsaetze, warnungen } = bestandsAdapter.lies(
      bestand({ buchungen: [geteilt, fremdesKonto] }),
    );

    // Beide kommen mit — gemeldet wird, was an ihnen nicht mitkommt.
    expect(umsaetze).toHaveLength(2);
    expect(warnungen.join(" ")).toMatch(/aufgeteilt/);
    expect(warnungen.join(" ")).toMatch(/Konto, das nicht in der Datei steht/);
    expect(umsaetze[1].kontoIban).toBeUndefined();
  });

  it("überspringt eine Zeile ohne Datum oder Betrag, statt die Datei fallenzulassen", () => {
    // Absichtlich kaputt — deshalb der Cast: der Typ sagt, dass es das nicht geben darf,
    // eine Datei von der Platte hält sich daran nicht.
    const kaputt = { ...BUCHUNG, id: "bu-6", datum: null } as unknown as ExportBuchung;
    const { umsaetze, warnungen } = bestandsAdapter.lies(bestand({ buchungen: [kaputt, BUCHUNG] }));
    expect(umsaetze).toHaveLength(1);
    expect(warnungen.join(" ")).toMatch(/ohne Datum oder Betrag/);
  });

  it("weist eine neuere Fassung ab, statt sie zu raten", () => {
    const { umsaetze, warnungen } = bestandsAdapter.lies(
      bestand({ fassung: BESTANDSEXPORT_FASSUNG + 1 }),
    );
    expect(umsaetze).toEqual([]);
    expect(warnungen.join(" ")).toMatch(/nicht sicher deuten/);
  });

  it("sagt es, wenn die Datei gar keine ist", () => {
    expect(bestandsAdapter.lies(new TextEncoder().encode("{kaputt")).warnungen).toEqual([
      "Die Datei ist kein gültiges JSON.",
    ]);
    expect(bestandsAdapter.lies(datei({ fassung: 5 })).warnungen).toEqual([
      "Das ist keine Bestandsdatei dieser App.",
    ]);
  });
});

describe("Die Runde", () => {
  /**
   * Export und Adapter sind zwei Hälften derselben Sache. Geprüft wird hier nicht ein
   * ausgedachtes JSON, sondern das, was `bestandExportieren` WIRKLICH schreibt — inklusive
   * der Feldreihenfolge, an der `erkennt` hängt.
   *
   * Das ist der Test, der beim nächsten Feld anschlägt: wer den Export ändert, ohne den
   * Adapter mitzuziehen, sieht es hier und nicht erst an dem Tag, an dem er die Datei
   * braucht.
   */
  it("liest, was der Bestandsexport wirklich schreibt", async () => {
    const nichts = { speichern: async () => {}, loeschen: async () => {} };
    let geschrieben = "";

    await bestandExportieren(
      {
        ledger: {
          alle: async () => [
            {
              id: "bu-1",
              kontoId: "ko-1",
              datum: "2026-03-04",
              betrag: -19_90,
              charakter: "Aufwand",
              quelle: "import",
              kategorieId: "kat-7",
              rohHash: "h1",
            },
          ],
          ...nichts,
        },
        umsaetze: {
          alle: async () => [
            {
              id: "um-1",
              laufId: "lauf-1",
              zahlungskontoId: "ko-1",
              istbuchungId: "bu-1",
              buchungstag: "2026-03-04",
              betrag: -19_90,
              waehrung: "EUR",
              gegenpartei: "Kesselmann",
              verwendungszweck: "Monatsbeitrag 03/2026",
              rohHash: "h1",
              status: "verbucht",
            },
          ],
        },
        konten: {
          alle: async () => [
            {
              id: "ko-1",
              bezeichnung: "Alltagskonto",
              typ: "Giro",
              klasse: "liquide",
              iban: "DE02999999010000001002",
              inhaberIds: [],
              saldo: 100_00,
            },
          ],
          aktivSetzen: async () => {},
          ...nichts,
        },
        personen: { alle: async () => [], ...nichts },
        vertraege: { alle: async () => [], ...nichts },
        vertragszuordnungen: { alle: async () => [], ...nichts },
        kategorien: {
          alle: async () => [{ id: "kat-7", name: "Versicherungen", defaultCharakter: "Aufwand" }],
          ...nichts,
        },
      } as unknown as Parameters<typeof bestandExportieren>[0],
      { schreiben: async (_name, inhalt) => ((geschrieben = inhalt), "/wohin/auch/immer.json") },
      new Date("2026-09-22T08:00:00.000Z"),
      "moneymanager-dev.db",
    );

    const bytes = new TextEncoder().encode(geschrieben);
    expect(bestandsAdapter.erkennt(bytes)).toBe(true);

    const { umsaetze, warnungen } = bestandsAdapter.lies(bytes);
    expect(warnungen).toEqual([]);
    expect(umsaetze).toHaveLength(1);
    expect(umsaetze[0].gegenpartei).toBe("Kesselmann");
    expect(umsaetze[0].kontoIban).toBe("DE02999999010000001002");
    expect(umsaetze[0].kategorieVorschlag).toBe("Versicherungen");
  });
});
