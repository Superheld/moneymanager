import { describe, it, expect } from "vitest";
import type { IstBuchung, Kategorie } from "../../core";
import type { Umsatz } from "../import";
import type { LedgerPort, UmsatzRepository } from "../ports";
import { buchungenLoeschen, buchungenSammelbearbeiten } from "./buchungenSammelbearbeiten";

function memLedger(start: IstBuchung[] = []): LedgerPort & { daten: IstBuchung[] } {
  const daten: IstBuchung[] = [...start];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(b) {
      const i = daten.findIndex((x) => x.id === b.id);
      if (i >= 0) daten[i] = b; else daten.push(b);
    },
    async loeschen(id) {
      const i = daten.findIndex((x) => x.id === id);
      if (i >= 0) daten.splice(i, 1);
    },
  };
}

const KATEGORIEN: Kategorie[] = [
  { id: "essen", name: "Lebensmittel", defaultCharakter: "Aufwand" },
  { id: "lohn", name: "Gehalt", defaultCharakter: "Ertrag" },
];

function b(over: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "b1", datum: "2026-08-12", betrag: -1000, kontoId: "giro",
    charakter: "Aufwand", quelle: "import", notiz: "alt", ...over,
  };
}

describe("buchungenSammelbearbeiten", () => {
  it("setzt die Kategorie auf allen gewählten Buchungen", async () => {
    const ledger = memLedger([b({ id: "1" }), b({ id: "2" })]);
    const erg = await buchungenSammelbearbeiten(ledger, ledger.daten, { kategorieId: "essen" }, KATEGORIEN);
    expect(erg.geaendert).toBe(2);
    expect(ledger.daten.every((x) => x.kategorieId === "essen")).toBe(true);
    // Eine Sammelentscheidung ist eine Handentscheidung — die Automatik fasst sie nicht mehr an.
    expect(ledger.daten.every((x) => x.kategorieHerkunft === "manuell")).toBe(true);
  });

  it("lässt Felder in Ruhe, nach denen nicht gefragt wurde", async () => {
    // Der eigentliche Unterschied zu einer Schleife über den Einzeldialog: `undefined`
    // heisst „nicht anfassen", nicht „leeren". Sonst löschte ein Kategoriewechsel
    // nebenbei alle Notizen.
    const ledger = memLedger([b({ id: "1", notiz: "Baecker" })]);
    await buchungenSammelbearbeiten(ledger, ledger.daten, { kategorieId: "essen" }, KATEGORIEN);
    expect(ledger.daten[0].notiz).toBe("Baecker");
  });

  it("leert die Kategorie bei ausdrücklichem null", async () => {
    const ledger = memLedger([b({ id: "1", kategorieId: "essen" })]);
    await buchungenSammelbearbeiten(ledger, ledger.daten, { kategorieId: null }, KATEGORIEN);
    expect(ledger.daten[0].kategorieId).toBeUndefined();
    // Auch das Wegnehmen ist eine Entscheidung — sonst käme sie beim nächsten Lauf zurück.
    expect(ledger.daten[0].kategorieHerkunft).toBe("manuell");
  });

  it("erbt den Charakter der neuen Kategorie", async () => {
    const ledger = memLedger([b({ id: "1", charakter: "Aufwand" })]);
    await buchungenSammelbearbeiten(ledger, ledger.daten, { kategorieId: "lohn" }, KATEGORIEN);
    expect(ledger.daten[0].charakter).toBe("Ertrag");
  });

  it("überspringt Umbuchungs-Beine, statt die ganze Aktion scheitern zu lassen", async () => {
    // Wer dreissig Zeilen markiert, greift vielleicht eine Umbuchung mit. Sie trägt
    // keine Kategorie (nur eigenes Geld wechselt das Konto) und bleibt unangetastet.
    const ledger = memLedger([b({ id: "1" }), b({ id: "2", transferId: "t1", charakter: "Umschichtung" })]);
    const erg = await buchungenSammelbearbeiten(ledger, ledger.daten, { kategorieId: "essen" }, KATEGORIEN);
    expect(erg).toEqual({ geaendert: 1, uebersprungen: 1 });
    expect(ledger.daten[1].kategorieId).toBeUndefined();
    expect(ledger.daten[1].charakter).toBe("Umschichtung");
  });

  it("setzt die Bezeichnung, ohne die Kategorie anzufassen", async () => {
    const ledger = memLedger([b({ id: "1", kategorieId: "essen", kategorieHerkunft: "automatisch" })]);
    await buchungenSammelbearbeiten(ledger, ledger.daten, { notiz: "Urlaub Norwegen" }, KATEGORIEN);
    expect(ledger.daten[0].notiz).toBe("Urlaub Norwegen");
    expect(ledger.daten[0].kategorieId).toBe("essen");
    // Nur die Bezeichnung zu setzen ist KEINE Kategorie-Entscheidung.
    expect(ledger.daten[0].kategorieHerkunft).toBe("automatisch");
  });

  it("meldet sich, wenn gar nichts zu ändern angegeben wurde", async () => {
    const ledger = memLedger([b({ id: "1" })]);
    await expect(buchungenSammelbearbeiten(ledger, ledger.daten, {}, KATEGORIEN))
      .rejects.toThrow("sammel.nichtsGewaehlt");
  });
});

describe("buchungenLoeschen", () => {
  it("löscht die gewählten Buchungen", async () => {
    const ledger = memLedger([b({ id: "1" }), b({ id: "2" })]);
    const erg = await buchungenLoeschen(ledger, [...ledger.daten], new Set());
    expect(erg).toEqual({ geloescht: 2, gesperrt: 0 });
    expect(ledger.daten).toHaveLength(0);
  });

  it("legt den zugehörigen Umsatz mit weg", async () => {
    // Ohne das blieb er auf „verbucht" stehen und zeigte auf eine Buchung, die es nicht
    // mehr gibt. Sichtbare Folge: die Dublettenprüfung im Auszug mahnte Zeilen an, die
    // längst entfernt waren.
    const ledger = memLedger([b({ id: "1" })]);
    const umsaetze: Umsatz[] = [{
      id: "u1", laufId: "l1", zahlungskontoId: "giro", buchungstag: "2026-08-11",
      betrag: -5700, waehrung: "EUR", gegenpartei: "Musterladen", verwendungszweck: "Einkauf",
      rohHash: "h1", status: "verbucht", istbuchungId: "1",
    }];
    const umsatzRepo = {
      async alle() { return umsaetze; },
      async speichern(u: Umsatz) { umsaetze[0] = u; },
    } as unknown as UmsatzRepository;

    await buchungenLoeschen(ledger, [...ledger.daten], new Set(), umsatzRepo);

    // `verworfen`, nicht `neu`: wer dreissig Zeilen markiert und wegwirft, will sie nicht
    // danach im Stapel wiederfinden. In der Datenbank bleibt die Zeile trotzdem — der
    // nächste Import soll wissen, dass sie schon einmal da war.
    expect(umsaetze[0].status).toBe("verworfen");
    expect(umsaetze[0].istbuchungId).toBeUndefined();
  });

  it("räumt ohne Umsatz-Repository nur das Ledger", async () => {
    const ledger = memLedger([b({ id: "1" })]);
    await buchungenLoeschen(ledger, [...ledger.daten], new Set());
    expect(ledger.daten).toHaveLength(0);
  });

  it("lässt stehen, was aus einem Bankabruf kam — und nur das", async () => {
    // Was die Bank geliefert hat, käme beim nächsten Abruf ohnehin zurück — und bis
    // dahin stimmte der Saldo nicht mehr mit ihr überein. Gesperrt ist die HERKUNFT der
    // Buchung, nicht ihr Konto: „2" liegt auf demselben Bankkonto, kam aber aus einer
    // Datei und ist deshalb löschbar.
    const ledger = memLedger([b({ id: "1", kontoId: "giro" }), b({ id: "2", kontoId: "giro" })]);
    const erg = await buchungenLoeschen(ledger, [...ledger.daten], new Set(["2"]));
    expect(erg).toEqual({ geloescht: 1, gesperrt: 1 });
    expect(ledger.daten.map((x) => x.id)).toEqual(["2"]);
  });
});

/**
 * Umbuchungen im Sammelmodus.
 *
 * Der Fall ist am echten Bestand einmal eingetreten und war danach nicht mehr zu finden:
 * ein Bein blieb allein zurück — mit `transferId` auf ein Paar, das es nicht mehr gibt,
 * und `gegenkontoId` auf ein Konto, auf dem nichts mehr steht. Die Zeile sieht aus wie
 * jede andere Umschichtung, nur dass das Geld auf der Gegenseite nie ankam.
 *
 * Der Grund war, dass der Auszug immer nur EIN Konto zeigt: das Gegenbein liegt auf einem
 * anderen und steht deshalb fast nie mit in der Markierung.
 */
describe("buchungenLoeschen — Umbuchungen", () => {
  const bein = (id: string, konto: string, betrag: number) =>
    b({ id, kontoId: konto, betrag, charakter: "Umschichtung", transferId: "t1",
        gegenkontoId: konto === "giro" ? "spar" : "giro" });

  it("nimmt das Gegenbein mit, auch wenn nur eines markiert ist", async () => {
    const ledger = memLedger([bein("a", "giro", -5000), bein("b", "spar", 5000)]);
    const erg = await buchungenLoeschen(ledger, [ledger.daten[0]], new Set());

    expect(ledger.daten).toHaveLength(0);
    // EINE Loeschung, nicht zwei: markiert war eine Zeile, weggeworfen eine Umbuchung.
    expect(erg.geloescht).toBe(1);
  });

  it("zaehlt ein Paar auch dann einmal, wenn beide Beine markiert sind", async () => {
    const ledger = memLedger([bein("a", "giro", -5000), bein("b", "spar", 5000)]);
    const erg = await buchungenLoeschen(ledger, ledger.daten, new Set());
    expect(ledger.daten).toHaveLength(0);
    expect(erg.geloescht).toBe(1);
  });

  /**
   * Ist EIN Bein geschützt, bleibt das ganze Paar stehen. Das halb geloeschte Paar ist
   * genau der Zustand, den es zu verhindern gilt — und "das eine ging, das andere nicht"
   * waere keine Auskunft, mit der jemand etwas anfangen kann.
   */
  it("laesst das Paar ganz stehen, wenn ein Bein geschuetzt ist", async () => {
    const ledger = memLedger([bein("a", "giro", -5000), bein("b", "spar", 5000)]);
    const erg = await buchungenLoeschen(ledger, [ledger.daten[0]], new Set(["b"]));

    expect(ledger.daten).toHaveLength(2);
    expect(erg).toEqual({ geloescht: 0, gesperrt: 1 });
  });

  it("laesst gewoehnliche Buchungen daneben unberuehrt", async () => {
    const ledger = memLedger([
      bein("a", "giro", -5000),
      bein("b", "spar", 5000),
      b({ id: "einzeln", kontoId: "giro" }),
    ]);
    await buchungenLoeschen(ledger, [ledger.daten[0]], new Set());
    expect(ledger.daten.map((x) => x.id)).toEqual(["einzeln"]);
  });
});
