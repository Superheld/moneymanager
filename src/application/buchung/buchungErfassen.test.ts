import { describe, it, expect } from "vitest";
import { euroZuCent, type IstBuchung } from "../../core";
import type { LedgerPort } from "../ports";
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
  it("legt eine manuelle Ausgabe an (Betrag negativ), ohne planRef", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(-12.5), charakter: "Aufwand", notiz: "Bäcker" });
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
    await expect(buchungErfassen(ledger, { kontoId: "bar", datum: "2026-06-17", betrag: euroZuCent(0), charakter: "Aufwand" })).rejects.toThrow("betrag.nichtNull");
  });

  it("buchungBearbeiten erhält Herkunft (quelle, rohHash) und aktualisiert die Felder", async () => {
    const ledger = memLedger();
    const original: IstBuchung = { id: "x1", datum: "2026-06-01", betrag: euroZuCent(-10), kontoId: "giro", charakter: "Aufwand", quelle: "import", rohHash: "h1" };
    ledger.daten.push(original);
    const u = await buchungBearbeiten(ledger, original, { datum: "2026-06-05", betrag: euroZuCent(-25), charakter: "Aufwand", kategorieId: "k1", notiz: "korrigiert" });
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
    await expect(buchungBearbeiten(ledger, o, { datum: "2026-06-01", betrag: 0, charakter: "Aufwand" })).rejects.toThrow("betrag.nichtNull");
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

/**
 * DAS VORZEICHEN IST DIE RICHTUNG.
 *
 * Der Betrag kommt vorzeichenbehaftet herein und wird unveraendert gebucht — beim Import
 * ist das die Tatsache vom Beleg, von Hand das, was jemand eintippt. Nichts leitet die
 * Richtung mehr aus dem Charakter ab, und deshalb kann auch nichts sie mehr umdrehen.
 *
 * Der Charakter sagt, WOFUER das Geld war. Das Vorzeichen sagt, wohin es floss. Beide
 * duerfen auseinanderfallen: eine Erstattung ist ein Aufwand mit positivem Betrag, eine
 * Rueckbuchung ein Ertrag mit negativem.
 */
describe("Das Vorzeichen ist die Richtung", () => {
  /** Eine Erstattung, wie sie hereinkam: ein ZUFLUSS aus einem Bankabruf. */
  function erstattung(): IstBuchung {
    return {
      id: "b1", datum: "2026-08-11", betrag: euroZuCent(49.95), kontoId: "giro",
      charakter: "Ertrag", quelle: "import", rohHash: "h1",
    };
  }

  /**
   * Der gemeldete Fall. Eine Erstattung kommt als Zufluss herein und wird in die
   * Kategorie gelegt, in der die AUSGABE stattgefunden hat — dort gehoert sie hin, damit
   * sie das Budget entlastet. Deren Vorgabe ist "Aufwand", und daraus wurde einmal ein
   * Abfluss: aus dem Zufluss wurde eine zweite Ausgabe.
   */
  it("dreht einen Zufluss nicht um, wenn die Kategorie Aufwand vorgibt", async () => {
    const ledger = memLedger();
    const u = await buchungBearbeiten(ledger, erstattung(), {
      datum: "2026-08-11", betrag: euroZuCent(49.95), charakter: "Aufwand", kategorieId: "kleidung",
    });

    expect(u.betrag).toBe(euroZuCent(49.95));
    // Der Charakter folgt der Einordnung — das ist kein Widerspruch: "Aufwand" sagt,
    // WOFUER das Geld war, das Vorzeichen sagt, wohin es floss.
    expect(u.charakter).toBe("Aufwand");
  });

  it("dreht umgekehrt auch einen Abfluss nicht um", async () => {
    const ledger = memLedger();
    const ausgabe: IstBuchung = { ...erstattung(), betrag: euroZuCent(-49.95), charakter: "Aufwand" };
    const u = await buchungBearbeiten(ledger, ausgabe, {
      datum: "2026-08-11", betrag: euroZuCent(-49.95), charakter: "Ertrag", kategorieId: "k1",
    });

    expect(u.betrag).toBe(euroZuCent(-49.95));
  });

  it("laesst die Hoehe aendern und behaelt die Richtung", async () => {
    const ledger = memLedger();
    const u = await buchungBearbeiten(ledger, erstattung(), {
      datum: "2026-08-11", betrag: euroZuCent(30), charakter: "Aufwand",
    });

    expect(u.betrag).toBe(euroZuCent(30));
  });

  /**
   * Auch bei einer VON HAND erfassten Buchung entscheidet nur noch die Eingabe. Vorher
   * leitete der Charakter das Vorzeichen ab, und ein Wechsel der Kategorie kippte damit
   * die Richtung einer Zahlung, an der sich nichts geaendert hatte.
   */
  it("laesst den Charakter bei einer Handbuchung das Vorzeichen NICHT mehr bestimmen", async () => {
    const ledger = memLedger();
    const vonHand: IstBuchung = {
      id: "b2", datum: "2026-08-11", betrag: euroZuCent(-20), kontoId: "bar",
      charakter: "Aufwand", quelle: "manuell",
    };
    const u = await buchungBearbeiten(ledger, vonHand, {
      datum: "2026-08-11", betrag: euroZuCent(-20), charakter: "Ertrag",
    });

    expect(u.betrag).toBe(euroZuCent(-20));
  });

  /**
   * Und eine importierte Buchung laesst sich ausdruecklich korrigieren. Das ist kein
   * Widerspruch zu "die Richtung kommt vom Beleg": die Maske fuellt das Feld mit dem
   * Vorzeichen des Belegs vor, und wer es aendert, tut das sichtbar und von Hand. Wo gar
   * nicht korrigiert werden darf (Online-Konto), sperrt die Maske das Feld.
   */
  it("nimmt bei einer importierten Buchung die Richtung aus der Eingabe", async () => {
    const ledger = memLedger();
    const ausDemBeleg: IstBuchung = {
      id: "i7", datum: "2026-04-08", betrag: euroZuCent(-34.9), kontoId: "giro",
      charakter: "Aufwand", quelle: "import", rohHash: "h7",
    };
    const u = await buchungBearbeiten(ledger, ausDemBeleg, {
      datum: "2026-04-08", betrag: euroZuCent(34.9), charakter: "Aufwand",
    });

    expect(u.betrag).toBe(euroZuCent(34.9));
  });
});

/**
 * Der Rueckfluss — ein Zufluss, der in eine AUFWANDSkategorie gehoert.
 *
 * Entschieden: Rueckfluesse gehoeren immer in die Kategorie der Ausgabe. Eine Erstattung
 * fuer Kleidung entlastet dort das Budget; unter "Einnahmen" gebucht taete sie das nie.
 * Damit faellt die Richtung mit der Einordnung auseinander — und weil der Betrag sein
 * Vorzeichen selbst traegt, braucht es dafuer kein zweites Feld.
 */
describe("Rueckfluesse von Hand", () => {
  it("bucht einen Aufwand als ZUFLUSS, wenn der Betrag positiv ist", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, {
      kontoId: "giro", datum: "2026-04-08", betrag: euroZuCent(34.9),
      charakter: "Aufwand", kategorieId: "kat-kleidung",
    });

    expect(b.betrag).toBe(euroZuCent(34.9));
    // Die Einordnung bleibt, was sie ist — sie sagt WOFUER das Geld war.
    expect(b.charakter).toBe("Aufwand");
    expect(b.kategorieId).toBe("kat-kleidung");
  });

  it("bucht einen Ertrag als ABFLUSS, wenn der Betrag negativ ist", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, {
      kontoId: "giro", datum: "2026-04-08", betrag: euroZuCent(-212),
      charakter: "Ertrag",
    });

    expect(b.betrag).toBe(euroZuCent(-212));
  });

  /**
   * Der zweite gemeldete Fall: eine Retoure im Bargeldkonto. Sie liess sich ueberhaupt
   * nicht erfassen — ein negativer Betrag flog mit "betrag.groesserNull" raus, egal
   * welche Kategorie und welches Konto. Das Konto spielt hier bewusst keine Rolle mehr.
   */
  it("nimmt eine Retoure in bar mit negativem Betrag an", async () => {
    const ledger = memLedger();
    const b = await buchungErfassen(ledger, {
      kontoId: "bar", datum: "2026-04-08", betrag: euroZuCent(-12.5),
      charakter: "Ertrag", kategorieId: "kat-lebensmittel",
    });

    expect(b.betrag).toBe(euroZuCent(-12.5));
  });

  it("dreht auch beim Bearbeiten einer Handbuchung", async () => {
    const ledger = memLedger();
    const vonHand: IstBuchung = {
      id: "b7", datum: "2026-04-08", betrag: euroZuCent(-34.9), kontoId: "giro",
      charakter: "Aufwand", quelle: "manuell",
    };
    const u = await buchungBearbeiten(ledger, vonHand, {
      datum: "2026-04-08", betrag: euroZuCent(34.9), charakter: "Aufwand",
    });

    expect(u.betrag).toBe(euroZuCent(34.9));
  });

  /** Nur die Null bleibt verboten — sie ist keine Zahlung, in keine Richtung. */
  it("weist 0 ab, in beiden Wegen", async () => {
    const ledger = memLedger();
    await expect(
      buchungErfassen(ledger, { kontoId: "bar", datum: "2026-04-08", betrag: 0, charakter: "Aufwand" }),
    ).rejects.toThrow("betrag.nichtNull");

    const vonHand: IstBuchung = {
      id: "b8", datum: "2026-04-08", betrag: euroZuCent(-5), kontoId: "bar",
      charakter: "Aufwand", quelle: "manuell",
    };
    await expect(
      buchungBearbeiten(ledger, vonHand, { datum: "2026-04-08", betrag: 0, charakter: "Aufwand" }),
    ).rejects.toThrow("betrag.nichtNull");
  });
});
