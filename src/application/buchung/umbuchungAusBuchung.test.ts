import { describe, it, expect } from "vitest";
import { euroZuCent, istInterneUmbuchung, liquideMittelReal, realerKontostand, type IstBuchung, type Zahlungskonto } from "../../core";
import type { LedgerPort } from "../ports";
import {
  buchungenPaaren,
  gegenbeinErzeugen,
  paarungLoesen,
  paarungsKandidaten,
  umbuchungsBeinBearbeiten,
} from "./umbuchungAusBuchung";

function memLedger(start: IstBuchung[] = []): LedgerPort & { daten: IstBuchung[] } {
  const daten: IstBuchung[] = [...start];
  return {
    daten,
    async alle() {
      return [...daten];
    },
    async speichern(b) {
      const i = daten.findIndex((x) => x.id === b.id);
      if (i >= 0) daten[i] = b;
      else daten.push(b);
    },
    async loeschen(id) {
      const i = daten.findIndex((x) => x.id === id);
      if (i >= 0) daten.splice(i, 1);
    },
  };
}

function buchung(p: Partial<IstBuchung> & { id: string; kontoId: string; betrag: number }): IstBuchung {
  return { datum: "2026-08-12", charakter: "Aufwand", quelle: "import", ...p };
}

function konto(id: string, saldoEuro: number): Zahlungskonto {
  return { id, bezeichnung: id, typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: euroZuCent(saldoEuro) };
}

describe("paarungsKandidaten", () => {
  const abhebung = buchung({ id: "a", kontoId: "giro", betrag: euroZuCent(-200) });

  it("findet den exakten Gegenbetrag auf einem anderen Konto", () => {
    const treffer = buchung({ id: "b", kontoId: "bar", betrag: euroZuCent(200) });
    expect(paarungsKandidaten([abhebung, treffer], abhebung)).toEqual([treffer]);
  });

  it("schließt gleiches Konto, abweichenden Betrag und gleiches Vorzeichen aus", () => {
    const kandidaten = paarungsKandidaten(
      [
        abhebung,
        buchung({ id: "selbesKonto", kontoId: "giro", betrag: euroZuCent(200) }),
        buchung({ id: "andererBetrag", kontoId: "bar", betrag: euroZuCent(199) }),
        buchung({ id: "gleichesVorzeichen", kontoId: "bar", betrag: euroZuCent(-200) }),
      ],
      abhebung,
    );
    expect(kandidaten).toEqual([]);
  });

  it("blendet Buchungen aus, die schon zu einer Umbuchung gehören", () => {
    const belegt = buchung({ id: "b", kontoId: "bar", betrag: euroZuCent(200), transferId: "t1" });
    expect(paarungsKandidaten([abhebung, belegt], abhebung)).toEqual([]);
  });

  it("liefert für eine bereits gepaarte Buchung gar nichts", () => {
    const schonGepaart = { ...abhebung, transferId: "t1" };
    const frei = buchung({ id: "b", kontoId: "bar", betrag: euroZuCent(200) });
    expect(paarungsKandidaten([schonGepaart, frei], schonGepaart)).toEqual([]);
  });

  it("hält das Datumsfenster ein und sortiert das nächstliegende nach vorn", () => {
    const nah = buchung({ id: "nah", kontoId: "bar", betrag: euroZuCent(200), datum: "2026-08-14" });
    const fern = buchung({ id: "fern", kontoId: "tg", betrag: euroZuCent(200), datum: "2026-08-20" });
    const draussen = buchung({ id: "draussen", kontoId: "tg", betrag: euroZuCent(200), datum: "2026-09-01" });
    const ids = paarungsKandidaten([abhebung, fern, nah, draussen], abhebung).map((k) => k.id);
    expect(ids).toEqual(["nah", "fern"]);
  });
});

/** Kein Konto haengt an einer Bankverbindung — der Normalfall dieser Tests. */
const OHNE_BANK: ReadonlySet<string> = new Set();

describe("gegenbeinErzeugen (S-1a)", () => {
  it("erzeugt das fehlende Bein mit gespiegeltem Betrag und verknüpft beide", async () => {
    const abhebung = buchung({ id: "a", kontoId: "giro", betrag: euroZuCent(-200) });
    const ledger = memLedger([abhebung]);

    const { bestehend, erzeugt } = await gegenbeinErzeugen(ledger, abhebung, "bar", OHNE_BANK);

    expect(erzeugt.betrag).toBe(euroZuCent(200));
    expect(erzeugt.kontoId).toBe("bar");
    expect(erzeugt.quelle).toBe("manuell");
    expect(erzeugt.datum).toBe(abhebung.datum);
    expect(bestehend.transferId).toBe(erzeugt.transferId);
    expect(bestehend.gegenkontoId).toBe("bar");
    expect(erzeugt.gegenkontoId).toBe("giro");
    expect(bestehend.charakter).toBe("Umschichtung");
    expect(ledger.daten).toHaveLength(2);
  });

  it("trägt auch die Gegenrichtung: aus einer Einzahlung wird das Abgangs-Bein erzeugt", async () => {
    const einzahlung = buchung({ id: "a", kontoId: "giro", betrag: euroZuCent(200), charakter: "Ertrag" });
    const ledger = memLedger([einzahlung]);

    const { erzeugt } = await gegenbeinErzeugen(ledger, einzahlung, "bar", OHNE_BANK);

    expect(erzeugt.betrag).toBe(euroZuCent(-200));
    expect(erzeugt.kontoId).toBe("bar");
  });

  // Netto 0 gilt für das PAAR, nicht für den Übergang: vorher war die Abhebung ein
  // Aufwand (Geld weg), nachher eine Umschichtung (Geld nur woanders). Die liquiden
  // Mittel STEIGEN dabei also — und landen wieder beim Stand ohne die Buchung.
  it("verschiebt Geld statt es zu verbrauchen — Summe wie ohne die Buchung", async () => {
    const abhebung = buchung({ id: "a", kontoId: "giro", betrag: euroZuCent(-200) });
    const ledger = memLedger([abhebung]);
    const konten = [konto("giro", 1000), konto("bar", 0)];

    await gegenbeinErzeugen(ledger, abhebung, "bar", OHNE_BANK);
    const beine = await ledger.alle();

    expect(liquideMittelReal(konten, beine)).toBe(liquideMittelReal(konten, []));
    expect(beine.reduce((s, b) => s + b.betrag, 0)).toBe(0);
    expect(realerKontostand(konten[0], beine)).toBe(euroZuCent(800));
    expect(realerKontostand(konten[1], beine)).toBe(euroZuCent(200));
  });

  it("nimmt der bestehenden Buchung die Kategorie, behält aber die Import-Spur", async () => {
    const mitKategorie = buchung({
      id: "a", kontoId: "giro", betrag: euroZuCent(-200),
      kategorieId: "haushalt", rohHash: "h1", notiz: "Abhebung",
    });
    const ledger = memLedger([mitKategorie]);

    const { bestehend } = await gegenbeinErzeugen(ledger, mitKategorie, "bar", OHNE_BANK);

    expect(bestehend.kategorieId).toBeUndefined();
    expect(bestehend.rohHash).toBe("h1");
    expect(bestehend.quelle).toBe("import");
    expect(bestehend.id).toBe("a");
    expect(istInterneUmbuchung(bestehend)).toBe(true);
  });

  it("weist gleiches Konto, fehlendes Konto und bereits gepaarte Buchungen ab", async () => {
    const b = buchung({ id: "a", kontoId: "giro", betrag: euroZuCent(-200) });
    const ledger = memLedger([b]);
    await expect(gegenbeinErzeugen(ledger, b, "giro", OHNE_BANK)).rejects.toThrow("konten.verschieden");
    await expect(gegenbeinErzeugen(ledger, b, "", OHNE_BANK)).rejects.toThrow("konto.waehlen");
    await expect(gegenbeinErzeugen(ledger, { ...b, transferId: "t1" }, "bar", OHNE_BANK)).rejects.toThrow(
      "umbuchung.schonGepaart",
    );
  });
});

describe("buchungenPaaren (S-1b)", () => {
  const ab = buchung({ id: "ab", kontoId: "giro", betrag: euroZuCent(-500), kategorieId: "sparen" });
  const zu = buchung({ id: "zu", kontoId: "tg", betrag: euroZuCent(500), datum: "2026-08-14" });

  it("verknüpft beide Beine und ordnet Abgang vor Zugang, unabhängig von der Reihenfolge", async () => {
    const ledger = memLedger([ab, zu]);
    const paar = await buchungenPaaren(ledger, zu, ab); // bewusst Zugang zuerst übergeben

    expect(paar.ab.id).toBe("ab");
    expect(paar.zu.id).toBe("zu");
    expect(paar.ab.transferId).toBe(paar.zu.transferId);
    expect(paar.ab.gegenkontoId).toBe("tg");
    expect(paar.zu.gegenkontoId).toBe("giro");
    expect(ledger.daten).toHaveLength(2);
  });

  it("macht aus beiden eine Umschichtung ohne Kategorie", async () => {
    const ledger = memLedger([ab, zu]);
    const paar = await buchungenPaaren(ledger, ab, zu);

    expect(paar.ab.charakter).toBe("Umschichtung");
    expect(paar.zu.charakter).toBe("Umschichtung");
    expect(paar.ab.kategorieId).toBeUndefined();
    expect(istInterneUmbuchung(paar.ab)).toBe(true);
    expect(istInterneUmbuchung(paar.zu)).toBe(true);
  });

  it("behält die eigenen Buchungstage beider Beine", async () => {
    const ledger = memLedger([ab, zu]);
    const paar = await buchungenPaaren(ledger, ab, zu);
    expect(paar.ab.datum).toBe("2026-08-12");
    expect(paar.zu.datum).toBe("2026-08-14");
  });

  it("weist Beträge zurück, die sich nicht zu null ergänzen", async () => {
    const schief = buchung({ id: "x", kontoId: "tg", betrag: euroZuCent(499) });
    const ledger = memLedger([ab, schief]);
    await expect(buchungenPaaren(ledger, ab, schief)).rejects.toThrow("umbuchung.betragGegen");
  });

  it("weist dasselbe Konto, dieselbe Buchung und bereits gepaarte Beine ab", async () => {
    const ledger = memLedger([ab, zu]);
    await expect(buchungenPaaren(ledger, ab, ab)).rejects.toThrow("umbuchung.selbeBuchung");
    await expect(
      buchungenPaaren(ledger, ab, buchung({ id: "y", kontoId: "giro", betrag: euroZuCent(500) })),
    ).rejects.toThrow("konten.verschieden");
    await expect(buchungenPaaren(ledger, { ...ab, transferId: "t1" }, zu)).rejects.toThrow(
      "umbuchung.schonGepaart",
    );
  });
});

describe("umbuchungsBeinBearbeiten", () => {
  it("ändert Datum und Notiz, lässt Betrag, Charakter und Verknüpfung unangetastet", async () => {
    const zugang = buchung({
      id: "zu", kontoId: "tg", betrag: euroZuCent(500),
      charakter: "Umschichtung", transferId: "t1", gegenkontoId: "giro",
    });
    const ledger = memLedger([zugang]);

    const neu = await umbuchungsBeinBearbeiten(ledger, zugang, { datum: "2026-08-15", notiz: " Sparrate " });

    expect(neu.datum).toBe("2026-08-15");
    expect(neu.notiz).toBe("Sparrate");
    expect(neu.betrag).toBe(euroZuCent(500));
    expect(neu.charakter).toBe("Umschichtung");
    expect(neu.transferId).toBe("t1");
    expect(neu.gegenkontoId).toBe("giro");
  });

  // Der Grund, warum es diesen Use-Case überhaupt gibt: `buchungBearbeiten` leitet das
  // Vorzeichen über vorzeichenbehaftet() aus dem Charakter ab und macht jede
  // Umschichtung negativ — das Zugangs-Bein kippte dabei und risse die Netto-Null auf.
  it("hält die Netto-Null des Paares, auch am Zugangs-Bein", async () => {
    const ab = buchung({ id: "ab", kontoId: "giro", betrag: euroZuCent(-500) });
    const zu = buchung({ id: "zu", kontoId: "tg", betrag: euroZuCent(500) });
    const ledger = memLedger([ab, zu]);
    const paar = await buchungenPaaren(ledger, ab, zu);

    await umbuchungsBeinBearbeiten(ledger, paar.zu, { datum: "2026-08-15" });

    expect(ledger.daten.reduce((s, b) => s + b.betrag, 0)).toBe(0);
  });

  it("weist ein unmögliches Datum ab", async () => {
    const ledger = memLedger();
    const bein = buchung({ id: "zu", kontoId: "tg", betrag: euroZuCent(500), transferId: "t1" });
    await expect(umbuchungsBeinBearbeiten(ledger, bein, { datum: "15.08.2026" })).rejects.toThrow(
      "datum.ungueltig",
    );
  });
});

describe("paarungLoesen", () => {
  it("nimmt beiden Beinen die Verknüpfung, löscht aber nichts", async () => {
    const ab = buchung({ id: "ab", kontoId: "giro", betrag: euroZuCent(-500) });
    const zu = buchung({ id: "zu", kontoId: "tg", betrag: euroZuCent(500) });
    const ledger = memLedger([ab, zu]);
    const paar = await buchungenPaaren(ledger, ab, zu);

    const geloest = await paarungLoesen(ledger, paar.ab.transferId!);

    expect(geloest).toHaveLength(2);
    expect(ledger.daten).toHaveLength(2);
    for (const b of ledger.daten) {
      expect(b.transferId).toBeUndefined();
      expect(b.gegenkontoId).toBeUndefined();
    }
  });

  it("gibt die gelösten Beine wieder zum Paaren frei", async () => {
    const ab = buchung({ id: "ab", kontoId: "giro", betrag: euroZuCent(-500) });
    const zu = buchung({ id: "zu", kontoId: "tg", betrag: euroZuCent(500) });
    const ledger = memLedger([ab, zu]);
    const paar = await buchungenPaaren(ledger, ab, zu);
    await paarungLoesen(ledger, paar.ab.transferId!);

    const frei = await ledger.alle();
    const wieder = paarungsKandidaten(frei, frei.find((b) => b.id === "ab")!);
    expect(wieder.map((k) => k.id)).toEqual(["zu"]);
  });

  it("lässt fremde Buchungen unangetastet", async () => {
    const ab = buchung({ id: "ab", kontoId: "giro", betrag: euroZuCent(-500) });
    const zu = buchung({ id: "zu", kontoId: "tg", betrag: euroZuCent(500) });
    const fremd = buchung({ id: "fremd", kontoId: "giro", betrag: euroZuCent(-10), transferId: "t9", gegenkontoId: "tg" });
    const ledger = memLedger([ab, zu, fremd]);
    const paar = await buchungenPaaren(ledger, ab, zu);

    await paarungLoesen(ledger, paar.ab.transferId!);

    expect(ledger.daten.find((b) => b.id === "fremd")!.transferId).toBe("t9");
  });
});

/**
 * Erzeugen heisst: eine Buchung anlegen, die es bei der Bank nicht gibt. Auf einem
 * abgerufenen Konto wäre das eine Behauptung gegen den Kontoauszug — sie taucht beim
 * nächsten Abgleich als Abweichung auf, und dann sieht sie aus wie eine FEHLENDE Buchung.
 *
 * Für zwei abgerufene Konten braucht es das auch gar nicht: beide Seiten meldet die Bank,
 * sie müssen nur verbunden werden. Genau das prüft der zweite Test — die Sperre gilt fürs
 * Erzeugen, nicht fürs Paaren.
 */
describe("Gegenbein und online geführte Konten", () => {
  const abhebung = buchung({ id: "a", kontoId: "giro", betrag: euroZuCent(-200) });

  it("legt kein Gegenbein auf einem Konto mit Bankverbindung an", async () => {
    const ledger = memLedger([abhebung]);
    await expect(
      gegenbeinErzeugen(ledger, abhebung, "bar", new Set(["bar"])),
    ).rejects.toThrow("umbuchung.zielOnline");
    // Und es bleibt wirklich bei einer Zeile — nicht halb angelegt.
    expect(ledger.daten).toHaveLength(1);
  });

  it("erlaubt es weiterhin auf einem Konto ohne Bankverbindung", async () => {
    const ledger = memLedger([abhebung]);
    const { erzeugt } = await gegenbeinErzeugen(ledger, abhebung, "bar", new Set(["giro"]));
    expect(erzeugt.kontoId).toBe("bar");
    expect(ledger.daten).toHaveLength(2);
  });

  /** Die Sperre gilt fürs ERZEUGEN, nicht fürs Paaren — beide Zeilen existieren schon. */
  it("paart zwei bestehende Buchungen auch dann, wenn beide Konten online sind", async () => {
    const gegen = buchung({ id: "b2", kontoId: "bar", betrag: euroZuCent(200) });
    const ledger = memLedger([abhebung, gegen]);
    const paar = await buchungenPaaren(ledger, abhebung, gegen);
    expect(paar.ab.transferId).toBeDefined();
    expect(paar.ab.transferId).toBe(paar.zu.transferId);
  });
});
