import { describe, it, expect } from "vitest";
import { euroZuCent, type IstBuchung } from "../core";
import type { LedgerPort } from "./ports";
import { buchungBearbeiten, buchungErfassen, buchungLoeschen } from "./buchungErfassen";

function memLedger(): LedgerPort & { daten: IstBuchung[] } {
  const daten: IstBuchung[] = [];
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

describe("buchungErfassen", () => {
  it("legt eine manuelle Ausgabe an (Aufwand → negativ), ohne planRef", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(12.5), charakter: "Aufwand", notiz: "Bäcker" });
    expect(b.betrag).toBe(euroZuCent(-12.5));
    expect(b.quelle).toBe("manuell");
    expect(b.planRef).toBeUndefined();
    expect(b.notiz).toBe("Bäcker");
    expect(ledger.daten).toHaveLength(1);
  });

  it("Ertrag wird positiv gebucht", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(100), charakter: "Ertrag" });
    expect(b.betrag).toBe(euroZuCent(100));
  });

  it("validiert Konto, Datum und Betrag", async () => {
    const ledger = memLedger();
    await expect(buchungErfassen(ledger, { kontoId: "", datum: "2026-06-17", betrag: euroZuCent(5), charakter: "Aufwand" })).rejects.toThrow("konto.waehlen");
    await expect(buchungErfassen(ledger, { kontoId: "bar", datum: "17.06.2026", betrag: euroZuCent(5), charakter: "Aufwand" })).rejects.toThrow("datum.ungueltig");
    await expect(buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(0), charakter: "Aufwand" })).rejects.toThrow("betrag.groesserNull");
  });

  it("buchungBearbeiten erhält Herkunft (quelle, rohHash) und aktualisiert die Felder", async () => {
    const ledger = memLedger();
    const original: IstBuchung = { id: "x1", datum: "2026-06-01", betrag: euroZuCent(-10), kontoId: "giro", charakter: "Aufwand", quelle: "import", rohHash: "h1" };
    ledger.daten.push(original);
    const u = await buchungBearbeiten(ledger, original, { datum: "2026-06-05", betrag: euroZuCent(25), charakter: "Aufwand", kategorieId: "k1", notiz: "korrigiert" });
    expect(u.id).toBe("x1");
    expect(u.quelle).toBe("import");
    expect(u.rohHash).toBe("h1");
    expect(u.betrag).toBe(euroZuCent(-25));
    expect(u.kategorieId).toBe("k1");
    expect(ledger.daten).toHaveLength(1);
  });

  it("buchungBearbeiten validiert Datum und Betrag", async () => {
    const ledger = memLedger();
    const o: IstBuchung = { id: "x", datum: "2026-06-01", betrag: -100, kontoId: "g", charakter: "Aufwand", quelle: "manuell" };
    await expect(buchungBearbeiten(ledger, o, { datum: "x", betrag: 100, charakter: "Aufwand" })).rejects.toThrow("datum.ungueltig");
    await expect(buchungBearbeiten(ledger, o, { datum: "2026-06-01", betrag: 0, charakter: "Aufwand" })).rejects.toThrow("betrag.groesserNull");
  });

  it("buchungBearbeiten verschiebt die Buchung auf ein anderes Konto", async () => {
    // Der Konto-Match des Imports ist eine Vermutung — wer die Buchung vor sich hat,
    // korrigiert sie hier.
    const ledger = memLedger();
    const original: IstBuchung = { id: "x1", datum: "2026-06-01", betrag: euroZuCent(-10), kontoId: "giro", charakter: "Aufwand", quelle: "import" };
    ledger.daten.push(original);
    const u = await buchungBearbeiten(ledger, original, { datum: "2026-06-01", betrag: euroZuCent(10), charakter: "Aufwand", kontoId: "bar" });
    expect(u.kontoId).toBe("bar");
  });

  it("buchungBearbeiten lässt das Konto stehen, wenn keines mitgegeben wird", async () => {
    const ledger = memLedger();
    const original: IstBuchung = { id: "x1", datum: "2026-06-01", betrag: euroZuCent(-10), kontoId: "giro", charakter: "Aufwand", quelle: "import" };
    ledger.daten.push(original);
    const u = await buchungBearbeiten(ledger, original, { datum: "2026-06-01", betrag: euroZuCent(10), charakter: "Aufwand" });
    expect(u.kontoId).toBe("giro");
  });

  it("buchungBearbeiten verweigert den Kontowechsel bei einem Umbuchungs-Bein", async () => {
    // Das Gegenkonto steht am ANDEREN Bein; ein einseitiger Wechsel zöge die Paarung auf
    // zwei verschiedene Aussagen auseinander.
    const ledger = memLedger();
    const bein: IstBuchung = { id: "t1", datum: "2026-06-01", betrag: euroZuCent(-10), kontoId: "giro", charakter: "Umschichtung", quelle: "manuell", transferId: "tr1", gegenkontoId: "spar" };
    ledger.daten.push(bein);
    await expect(
      buchungBearbeiten(ledger, bein, { datum: "2026-06-01", betrag: euroZuCent(10), charakter: "Umschichtung", kontoId: "bar" }),
    ).rejects.toThrow("konten.kontoWechselGepaart");
  });

  it("buchungLoeschen entfernt die Buchung", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(5), charakter: "Aufwand" });
    await buchungLoeschen(ledger, b.id);
    expect(ledger.daten).toHaveLength(0);
  });
});

describe("Herkunft der Kategorie", () => {
  it("erfassen MIT Kategorie ist eine Handentscheidung", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(9), charakter: "Aufwand", kategorieId: "kat-lebensmittel" });
    expect(b.kategorieHerkunft).toBe("manuell");
  });

  it("erfassen OHNE Kategorie bleibt für die Automatik offen", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(9), charakter: "Aufwand" });
    expect(b.kategorieHerkunft).toBeUndefined();
  });

  it("nur die Notiz zu ändern lässt die Herkunft in Ruhe", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(9), charakter: "Aufwand" });
    const nachher = await buchungBearbeiten(ledger, b, { datum: b.datum, betrag: euroZuCent(9), charakter: "Aufwand", notiz: "Bäcker" });
    // Sonst würde jedes Speichern der Maske die Buchung stillschweigend der Automatik entziehen.
    expect(nachher.kategorieHerkunft).toBeUndefined();
    expect(nachher.notiz).toBe("Bäcker");
  });

  it("die Kategorie zu ändern macht sie zur Handentscheidung", async () => {
    const ledger = memLedger();
    const importiert: IstBuchung = { id: "i1", datum: "2026-06-17", betrag: euroZuCent(-9), kontoId: "giro", kategorieId: "kat-falsch", kategorieHerkunft: "automatisch", charakter: "Aufwand", quelle: "import" };
    await ledger.speichern(importiert);
    const nachher = await buchungBearbeiten(ledger, importiert, { datum: "2026-06-17", betrag: euroZuCent(9), charakter: "Aufwand", kategorieId: "kat-richtig" });
    expect(nachher.kategorieHerkunft).toBe("manuell");
    // Die Import-Spur reißt dabei nicht: quelle beschreibt die Buchung, nicht die Kategorie.
    expect(nachher.quelle).toBe("import");
  });

  it("die Kategorie zu LEEREN ist ebenfalls eine Entscheidung", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(9), charakter: "Aufwand", kategorieId: "kat-lebensmittel" });
    const nachher = await buchungBearbeiten(ledger, b, { datum: b.datum, betrag: euroZuCent(9), charakter: "Aufwand" });
    // Ohne das käme beim nächsten Lauf zurück, was jemand gerade weggenommen hat.
    expect(nachher.kategorieId).toBeUndefined();
    expect(nachher.kategorieHerkunft).toBe("manuell");
  });
});
