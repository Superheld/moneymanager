import { describe, it, expect } from "vitest";
import type { IstBuchung, Kategorie } from "../core";
import type { LedgerPort } from "./ports";
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

  it("lässt Buchungen auf Bankkonten stehen", async () => {
    // Was die Bank geliefert hat, käme beim nächsten Abruf ohnehin zurück — und bis
    // dahin stimmte der Saldo nicht mehr mit ihr überein.
    const ledger = memLedger([b({ id: "1", kontoId: "giro" }), b({ id: "2", kontoId: "bar" })]);
    const erg = await buchungenLoeschen(ledger, [...ledger.daten], new Set(["giro"]));
    expect(erg).toEqual({ geloescht: 1, gesperrt: 1 });
    expect(ledger.daten.map((x) => x.id)).toEqual(["1"]);
  });
});
