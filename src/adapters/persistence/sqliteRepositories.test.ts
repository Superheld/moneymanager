// Repository-Tests gegen eine echte SQLite-Engine (sql.js, In-Memory) — nie gegen die
// Nutzer-DB. Getestet wird das, was zwischen Aggregat und Tabelle passiert: Spalten-
// Mapping, Rundreise (speichern → laden), Löschen und die typabhängigen Spielarten.
//
// Der Zugang wird über `getDb` gemockt: die Repos sprechen sonst tauri-plugin-sql an,
// das es im Test nicht gibt. Der Adapter übersetzt dessen API ($1-Platzhalter, select/
// execute) auf sql.js — dieselbe SQL-Engine, die auch in der App läuft.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { MIGRATIONS } from "./migrations";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return {
    setzen: (d: unknown) => (aktuell = d),
    lesen: () => aktuell,
  };
});

vi.mock("./db", () => ({
  getDb: async () => halter.lesen(),
}));

import { sqliteBudgetRepository as budgetRepository } from "./sqliteBudgetRepository";
import { sqliteEinstellungenRepository as einstellungenRepository } from "./sqliteEinstellungenRepository";
import { sqliteInventarRepository as inventarRepository } from "./sqliteInventarRepository";
import { sqliteLedgerRepository as ledgerRepository } from "./sqliteLedgerRepository";
import { sqliteKlassifikatorRepository as klassifikatorRepository } from "./sqliteKlassifikatorRepository";
import { sqliteMerkmalskonfigurationRepository as merkmalRepository } from "./sqliteMerkmalskonfigurationRepository";
import { sqliteKategoriefestlegungRepository as festlegungRepository } from "./sqliteKategoriefestlegungRepository";
import { klassifizieren, trainieren } from "../../core";
import { sqliteVertragRepository as vertragRepository } from "./sqliteVertragRepository";
import {
  sqliteVertragserkennungRepository as erkennungRepository,
  sqliteVertragszuordnungRepository as zuordnungRepository,
} from "./sqliteVertragZuordnungRepositories";
import { sqliteZahlungsregelRepository as zahlungsregelRepository } from "./sqliteZahlungsregelRepository";
import {
  sqliteKategorieRepository as kategorieRepository,
  sqlitePersonRepository as personRepository,
  sqliteZahlungskontoRepository as zahlungskontoRepository,
} from "./sqliteStammdatenRepositories";
import { sqliteKontostandsankerRepository as ankerRepository } from "./sqliteKontostandRepository";
import { sqliteDepotRepository as depotRepository } from "./sqliteDepotRepository";
import {
  sqliteDublettenfreigabeRepository as freigabeRepository,
  sqliteImportLaufRepository as importLaufRepository,
  sqliteUmsatzRepository as umsatzRepository,
} from "./sqliteImportRepositories";

/**
 * tauri-plugin-sql-API auf sql.js. Der Plugin nummeriert Platzhalter ($1, $2, …), sql.js
 * bindet Arrays an „?" — deshalb werden die Werte hier auf benannte Parameter abgebildet.
 */
function pluginApi(db: Database) {
  const benannt = (werte: unknown[] = []) =>
    Object.fromEntries(werte.map((w, i) => [`$${i + 1}`, w as never]));
  return {
    async execute(sql: string, werte?: unknown[]) {
      db.run(sql, benannt(werte));
      return { rowsAffected: db.getRowsModified(), lastInsertId: 0 };
    },
    async select<T>(sql: string, werte?: unknown[]): Promise<T> {
      const stmt = db.prepare(sql);
      if (werte?.length) stmt.bind(benannt(werte));
      const zeilen: unknown[] = [];
      while (stmt.step()) zeilen.push(stmt.getAsObject());
      stmt.free();
      return zeilen as unknown as T;
    },
  };
}

const require = createRequire(import.meta.url);
let SQL: SqlJsStatic;
let db: Database;

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
});

beforeEach(() => {
  db?.close();
  db = new SQL.Database();
  for (const m of MIGRATIONS) for (const sql of m.sql) db.run(sql);
  halter.setzen(pluginApi(db));
});

describe("Stammdaten-Repositories", () => {
  it("speichert und liest eine Person", async () => {
    await personRepository.speichern({ id: "p1", name: "Bruce", rolle: "hauptperson" });
    const alle = await personRepository.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0].name).toBe("Bruce");
  });

  it("speichert ein Zahlungskonto mit allen Feldern und liest es zurück", async () => {
    await zahlungskontoRepository.speichern({
      id: "k1",
      bezeichnung: "Giro",
      typ: "Giro", klasse: "liquide",
      iban: "DE93999999990000000001",
      inhaberIds: [],
      saldo: 123456,
    });
    const [k] = await zahlungskontoRepository.alle();
    expect(k.bezeichnung).toBe("Giro");
    expect(k.typ).toBe("Giro");
    expect(k.klasse).toBe("liquide");
    expect(k.iban).toBe("DE93999999990000000001");
    expect(k.saldo).toBe(123456);
  });

  it("hält Typ und Klasse getrennt", async () => {
    // Ein Depot, das der Nutzer ausdrücklich als verfügbar führt: der Typ sagt, was es
    // ist, die Klasse, ob es mitzählt. Ein Repository, das die Klasse aus dem Typ
    // ableitet, nähme ihm diese Wahl.
    await zahlungskontoRepository.speichern({
      id: "k9",
      bezeichnung: "Depot",
      typ: "Depot",
      klasse: "liquide",
      inhaberIds: [],
      saldo: 900,
    });
    const k = (await zahlungskontoRepository.alle()).find((x) => x.id === "k9")!;
    expect(k.typ).toBe("Depot");
    expect(k.klasse).toBe("liquide");
  });

  it("gibt einem Konto ohne gespeicherte Klasse den Vorschlag aus dem Typ", async () => {
    // Migration 40 belegt alles vor — aber eine Zeile, die auf anderem Weg hereinkommt,
    // soll nicht am Fehlen eines Feldes still aus den liquiden Mitteln fallen.
    const db = halter.lesen() as { execute: (sql: string, w?: unknown[]) => Promise<unknown> };
    await db.execute(
      `INSERT INTO zahlungskonto (id, bezeichnung, typ, klasse, inhaber_ids, kontostand)
       VALUES ($1, $2, $3, NULL, '[]', 0)`,
      ["k8", "Altes Depot", "Depot"],
    );
    const k = (await zahlungskontoRepository.alle()).find((x) => x.id === "k8")!;
    expect(k.klasse).toBe("vorsorge");
  });

  it("speichert eine Kategorie mit Elternbezug", async () => {
    await kategorieRepository.speichern({
      id: "k-eltern",
      name: "Wohnen",
      defaultCharakter: "Aufwand",
    });
    await kategorieRepository.speichern({
      id: "k-kind",
      name: "Miete",
      defaultCharakter: "Aufwand",
      elternId: "k-eltern",
    });
    const alle = await kategorieRepository.alle();
    expect(alle).toHaveLength(2);
    expect(alle.find((k) => k.id === "k-kind")?.elternId).toBe("k-eltern");
  });

  it("löscht eine Person wieder", async () => {
    await personRepository.speichern({ id: "p1", name: "Bruce", rolle: "hauptperson" });
    await personRepository.loeschen("p1");
    expect(await personRepository.alle()).toHaveLength(0);
  });

  it("aktualisiert beim erneuten Speichern derselben ID, statt zu doppeln", async () => {
    await personRepository.speichern({ id: "p1", name: "Bruce", rolle: "hauptperson" });
    await personRepository.speichern({ id: "p1", name: "Bruce W.", rolle: "hauptperson" });
    const alle = await personRepository.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0].name).toBe("Bruce W.");
  });
});

describe("Budget-Repository", () => {
  it("macht die Rundreise für beide Arten", async () => {
    await budgetRepository.speichern({
      id: "b1", kategorieId: "k1", kontoId: "giro",
      betragProMonat: 40000, art: "monatlich", start: "2026-08-01",
    });
    await budgetRepository.speichern({
      id: "b2", kategorieId: "k2", kontoId: "tagesgeld",
      betragProMonat: 5000, art: "aufbauend", start: "2026-01-01",
    });
    const alle = await budgetRepository.alle();
    expect(alle).toHaveLength(2);

    const monatlich = alle.find((b) => b.id === "b1");
    expect(monatlich?.betragProMonat).toBe(40000);
    expect(monatlich?.art).toBe("monatlich");
    expect(monatlich?.kontoId).toBe("giro");

    const aufbauend = alle.find((b) => b.id === "b2");
    expect(aufbauend?.art).toBe("aufbauend");
    expect(aufbauend?.start).toBe("2026-01-01");
  });

  it("löscht ein Budget", async () => {
    await budgetRepository.speichern({
      id: "b1", kategorieId: "k1", kontoId: "giro",
      betragProMonat: 40000, art: "monatlich", start: "2026-08-01",
    });
    await budgetRepository.loeschen("b1");
    expect(await budgetRepository.alle()).toHaveLength(0);
  });
});

describe("Ledger-Repository", () => {
  it("speichert eine Ist-Buchung und liest sie zurück", async () => {
    await ledgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -1500, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1",
    });
    const alle = await ledgerRepository.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0].betrag).toBe(-1500);
    expect(alle[0].charakter).toBe("Aufwand");
    expect(alle[0].kategorieId).toBe("kat1");
  });

  it("hält das Vorzeichen exakt (Minor Units, kein Float)", async () => {
    await ledgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -1, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell",
    });
    await ledgerRepository.speichern({
      id: "i2", datum: "2026-06-02", betrag: 999999, kontoId: "k1",
      charakter: "Ertrag", quelle: "manuell",
    });
    const summe = (await ledgerRepository.alle()).reduce((s, b) => s + b.betrag, 0);
    expect(summe).toBe(999998);
  });

  it("löscht eine Buchung", async () => {
    await ledgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -1500, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell",
    });
    await ledgerRepository.loeschen("i1");
    expect(await ledgerRepository.alle()).toHaveLength(0);
  });

  it("trägt die Kategorie-Herkunft durch Schema und zurück", async () => {
    await ledgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -1500, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat1", kategorieHerkunft: "manuell",
    });
    // Ohne Angabe: die Spalte ist NOT NULL, das Feld optional — der Adapter muss den
    // Default setzen, sonst schlägt das INSERT fehl statt still „automatisch" zu meinen.
    await ledgerRepository.speichern({
      id: "i2", datum: "2026-06-02", betrag: -200, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat2",
    });

    const nachId = new Map((await ledgerRepository.alle()).map((b) => [b.id, b]));
    expect(nachId.get("i1")?.kategorieHerkunft).toBe("manuell");
    expect(nachId.get("i2")?.kategorieHerkunft).toBe("automatisch");
  });

  it("überschreibt die Herkunft beim Aktualisieren derselben Buchung", async () => {
    const basis = {
      id: "i1", datum: "2026-06-01", betrag: -1500, kontoId: "k1",
      charakter: "Aufwand" as const, quelle: "import" as const, kategorieId: "kat1",
    };
    await ledgerRepository.speichern({ ...basis, kategorieHerkunft: "automatisch" });
    await ledgerRepository.speichern({ ...basis, kategorieId: "kat2", kategorieHerkunft: "manuell" });

    const alle = await ledgerRepository.alle();
    expect(alle).toHaveLength(1);
    // Fehlte die Spalte im ON-CONFLICT-Zweig, bliebe hier „automatisch" stehen — und die
    // Korrektur wäre beim nächsten Abgleich wieder weg.
    expect(alle[0].kategorieHerkunft).toBe("manuell");
    expect(alle[0].kategorieId).toBe("kat2");
  });
});

describe("Vertrag- und Zahlungsregel-Repository", () => {
  it("speichert einen Vertrag mit Laufzeitfeldern", async () => {
    await vertragRepository.speichern({
      id: "v1", anbieter: "Petrossen", beginn: "2026-01-01", status: "aktiv",
      verlaengerung: "automatisch", verlaengerungMonate: 12,
      mindestlaufzeitMonate: 12, kuendigungsfristMonate: 3,
    });
    const [v] = await vertragRepository.alle();
    expect(v.anbieter).toBe("Petrossen");
    expect(v.mindestlaufzeitMonate).toBe(12);
    expect(v.kuendigungsfristMonate).toBe(3);
    expect(v.verlaengerung).toBe("automatisch");
  });

  it("speichert eine Zahlungsregel und liest Rhythmus und Betrag zurück", async () => {
    await zahlungsregelRepository.speichern({
      id: "z1", bezeichnung: "Miete", betrag: -90000, rhythmus: "monatlich",
      startdatum: "2026-01-01", charakter: "Aufwand",
    });
    const [z] = await zahlungsregelRepository.alle();
    expect(z.betrag).toBe(-90000);
    expect(z.rhythmus).toBe("monatlich");
    expect(z.startdatum).toBe("2026-01-01");
  });

  it("löscht Vertrag und Regel", async () => {
    await vertragRepository.speichern({
      id: "v1", anbieter: "X", beginn: "2026-01-01", status: "aktiv", verlaengerung: "keine",
    });
    await zahlungsregelRepository.speichern({
      id: "z1", bezeichnung: "X", betrag: -100, rhythmus: "monatlich",
      startdatum: "2026-01-01", charakter: "Aufwand",
    });
    await vertragRepository.loeschen("v1");
    await zahlungsregelRepository.loeschen("z1");
    expect(await vertragRepository.alle()).toHaveLength(0);
    expect(await zahlungsregelRepository.alle()).toHaveLength(0);
  });
});

describe("Inventar-Repository", () => {
  it("speichert einen Inventargegenstand samt Rücklagenkonto", async () => {
    await inventarRepository.speichern({
      id: "g1", bezeichnung: "Waschmaschine", anschaffung: "2024-01-01",
      wiederbeschaffung: 60000, nutzungsdauerMonate: 120, kontoId: "k-tagesgeld",
    });
    const [g] = await inventarRepository.alle();
    expect(g.bezeichnung).toBe("Waschmaschine");
    expect(g.wiederbeschaffung).toBe(60000);
    expect(g.nutzungsdauerMonate).toBe(120);
    expect(g.anschaffung).toBe("2024-01-01");
    expect(g.kontoId).toBe("k-tagesgeld");
  });

  it("liefert ohne Zuordnung undefined statt eines leeren Strings", async () => {
    await inventarRepository.speichern({
      id: "g1", bezeichnung: "Ohne Konto", anschaffung: "2024-01-01",
      wiederbeschaffung: 100, nutzungsdauerMonate: 12,
    });
    const [g] = await inventarRepository.alle();
    expect(g.kontoId).toBeUndefined();
  });

  it("löscht einen Gegenstand", async () => {
    await inventarRepository.speichern({
      id: "g1", bezeichnung: "X", anschaffung: "2024-01-01",
      wiederbeschaffung: 100, nutzungsdauerMonate: 12,
    });
    await inventarRepository.loeschen("g1");
    expect(await inventarRepository.alle()).toHaveLength(0);
  });
});

describe("Einstellungen-Repository", () => {
  it("liefert vor dem ersten Schreiben nichts und danach den Wert", async () => {
    expect(await einstellungenRepository.lesen()).toEqual({});
    await einstellungenRepository.schreiben("locale", "de-DE");
    expect(await einstellungenRepository.lesen()).toEqual({ locale: "de-DE" });
  });

  it("überschreibt denselben Schlüssel, statt eine zweite Zeile anzulegen", async () => {
    await einstellungenRepository.schreiben("locale", "de-DE");
    await einstellungenRepository.schreiben("locale", "en-US");
    await einstellungenRepository.schreiben("waehrung", "USD");
    expect(await einstellungenRepository.lesen()).toEqual({ locale: "en-US", waehrung: "USD" });
  });
});

describe("Import-Repositories", () => {
  const umsatz = (over: Record<string, unknown> = {}) => ({
    id: "u1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-01-05",
    betrag: -500, waehrung: "EUR", gegenpartei: "Rewe", verwendungszweck: "Einkauf",
    rohHash: "h1", status: "neu" as const, ...over,
  });

  it("speichert einen Lauf und seine Umsätze und liest sie je Lauf", async () => {
    await importLaufRepository.speichern({
      id: "l1", quelle: "finanzguru", zeitpunkt: "2026-01-06T10:00:00Z",
      eingelesen: 1, neu: 1, duplikate: 0,
    });
    await umsatzRepository.anlegenViele([umsatz()]);
    const laeufe = await importLaufRepository.alle();
    expect(laeufe).toHaveLength(1);
    const ausLauf = await umsatzRepository.nachLauf("l1");
    expect(ausLauf).toHaveLength(1);
    expect(ausLauf[0].gegenpartei).toBe("Rewe");
  });

  it("liefert offene Umsätze und den Bestandsschlüssel", async () => {
    await umsatzRepository.anlegenViele([
      umsatz({ id: "u1", rohHash: "h1", nativeId: "n1" }),
      umsatz({ id: "u2", rohHash: "h2" }),
    ]);
    expect(await umsatzRepository.offene()).toHaveLength(2);
    const bestand = await umsatzRepository.bestandsSchluessel();
    expect([...bestand.hashes].sort()).toEqual(["h1", "h2"]);
    expect([...bestand.nativeIds]).toEqual(["n1"]);
    // Nur die Zeile ohne native ID zählt als ID-loser Hash.
    expect([...(bestand.hashesOhneId ?? [])]).toEqual(["h2"]);
  });

  it("löscht einen Umsatz", async () => {
    await umsatzRepository.anlegen(umsatz());
    await umsatzRepository.loeschen("u1");
    expect(await umsatzRepository.alle()).toHaveLength(0);
  });

  it("hält Vorschlag und Ist-Buchungs-Verknüpfung über die Rundreise", async () => {
    await umsatzRepository.anlegen(
      umsatz({
        vorschlag: { kategorieId: "kat1", charakter: "Aufwand", quelle: "remapping" },
        istbuchungId: "i1",
      }),
    );
    const [u] = await umsatzRepository.alle();
    expect(u.vorschlag?.kategorieId).toBe("kat1");
    expect(u.vorschlag?.quelle).toBe("remapping");
    expect(u.istbuchungId).toBe("i1");
  });
});

/**
 * Erkennungsregel und Zuordnung (Migration 19). Beides geht durch eine JSON-Textspalte
 * bzw. eine NULL-tragende Spalte, deren Bedeutung leicht verloren geht — genau die zwei
 * Stellen, an denen ein Mapping-Fehler nicht knallt, sondern still das Falsche tut.
 */
describe("Vertragszuordnung — Persistenz", () => {
  it("hält typisierte Merkmale und alle Grenzen über die Rundreise", async () => {
    await erkennungRepository.speichern({
      vertragId: "v1",
      merkmale: [
        { art: "glaeubigerId", muster: "DE98ZZZ09999999999" },
        { art: "empfaenger", muster: "petrossen*" },
      ],
      betragVon: 1000,
      betragBis: 2000,
      gueltigAb: "2025-01-01",
      gueltigBis: "2026-12-31",
      kontoId: "k1",
    });
    const [e] = await erkennungRepository.alle();
    expect(e.merkmale).toEqual([
      { art: "glaeubigerId", muster: "DE98ZZZ09999999999" },
      { art: "empfaenger", muster: "petrossen*" },
    ]);
    expect(e.betragVon).toBe(1000);
    expect(e.gueltigBis).toBe("2026-12-31");
    expect(e.kontoId).toBe("k1");
  });

  /**
   * Das Format der ersten Fassung: eine flache Liste von Schlüsseln ohne Art. So stehen
   * die Regeln in Datenbanken, die vor der Typisierung angelegt wurden — der Leser muss
   * sie noch verstehen und die Art an der Form des Werts erraten.
   */
  it("liest die flache Schlüsselliste der ersten Fassung", async () => {
    db.run(
      `INSERT INTO vertrag_erkennung (vertrag_id, schluessel, betrag_von, betrag_bis)
       VALUES ('alt', '["vibora","DE98ZZZ09999999999"]', 990, 2970)`,
    );
    const [e] = await erkennungRepository.alle();
    expect(e.merkmale).toEqual([
      { art: "empfaenger", muster: "vibora" },
      { art: "glaeubigerId", muster: "DE98ZZZ09999999999" },
    ]);
    expect(e.betragVon).toBe(990);
  });

  it("überlebt eine kaputte JSON-Spalte, ohne die Liste ausfallen zu lassen", async () => {
    db.run(`INSERT INTO vertrag_erkennung (vertrag_id, schluessel) VALUES ('kaputt', '{nicht')`);
    const [e] = await erkennungRepository.alle();
    expect(e.merkmale).toEqual([]);
  });

  /**
   * `vertragId: null` ist die Aussage „gehört ausdrücklich zu keinem Vertrag" und darf
   * beim Laden NICHT zu `undefined` werden — sonst wäre die Korrektur von Hand nicht mehr
   * von „noch nicht entschieden" zu unterscheiden.
   */
  it("hält das ausdrückliche „kein Vertrag“ über die Rundreise", async () => {
    // Die Zuordnung steht seit v47 AN der Buchung. Ohne Buchung gibt es sie nicht mehr —
    // und genau das war der Bug: es standen Zuordnungen zu gelöschten Buchungen herum.
    db.run(`INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle)
            VALUES ('i1','2026-08-11',-5700,'k1','Aufwand','manuell')`);
    await zuordnungRepository.speichern({ istbuchungId: "i1", vertragId: null, herkunft: "manuell" });
    const [z] = await zuordnungRepository.alle();
    expect(z.vertragId).toBeNull();
    expect(z.herkunft).toBe("manuell");
  });

  it("überschreibt eine bestehende Zuordnung statt zu doppeln", async () => {
    db.run(`INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle)
            VALUES ('i1','2026-08-11',-5700,'k1','Aufwand','manuell')`);
    await zuordnungRepository.speichern({ istbuchungId: "i1", vertragId: "v1", herkunft: "automatisch" });
    await zuordnungRepository.speichern({ istbuchungId: "i1", vertragId: "v2", herkunft: "manuell" });
    const alle = await zuordnungRepository.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0].vertragId).toBe("v2");
  });

  /**
   * Zurücknehmen muss BEIDE Spalten räumen. Bliebe `vertrag_herkunft` stehen, sähe die
   * Buchung aus wie „ausdrücklich keinem Vertrag zugeordnet" — und die Automatik liesse
   * sie künftig in Ruhe, obwohl sie gerade wieder ran darf.
   */
  it("gibt die Buchung nach dem Zuruecknehmen wieder frei", async () => {
    db.run(`INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle)
            VALUES ('i1','2026-08-11',-5700,'k1','Aufwand','manuell')`);
    await zuordnungRepository.speichern({ istbuchungId: "i1", vertragId: null, herkunft: "manuell" });
    await zuordnungRepository.loeschen("i1");
    expect(await zuordnungRepository.alle()).toHaveLength(0);
  });
});

describe("Klassifikator-Repository", () => {
  it("trägt ein Modell verlustfrei durch das Schema", async () => {
    const modell = trainieren([
      { merkmale: ["emp=rewe", "vz:-"], kategorieId: "kat-lm" },
      { merkmale: ["emp=shell", "vz:-"], kategorieId: "kat-sprit" },
    ]);
    await klassifikatorRepository.speichern({
      modell, trainiertAm: "2026-08-16T12:00:00.000Z", genauigkeit: 0.891,
    });

    const zurueck = await klassifikatorRepository.laden();
    expect(zurueck?.trainiertAm).toBe("2026-08-16T12:00:00.000Z");
    expect(zurueck?.genauigkeit).toBeCloseTo(0.891, 5);
    expect([...zurueck!.modell.kategorien]).toEqual([...modell.kategorien]);
    expect([...zurueck!.modell.vokabular]).toEqual([...modell.vokabular]);
    // Bit für Bit: die Gewichte gehen als Float32 durch base64, nicht über Textzahlen.
    expect([...zurueck!.modell.gewichte]).toEqual([...modell.gewichte]);
    expect([...zurueck!.modell.bias]).toEqual([...modell.bias]);
  });

  it("liefert das geladene Modell mit identischen Entscheidungen", async () => {
    const beispiele = [
      { merkmale: ["emp=rewe", "vwz:einkauf"], kategorieId: "kat-lm" },
      { merkmale: ["emp=shell", "vwz:tanken"], kategorieId: "kat-sprit" },
    ];
    const modell = trainieren(beispiele);
    await klassifikatorRepository.speichern({ modell, trainiertAm: "2026-08-16T12:00:00.000Z" });

    const zurueck = (await klassifikatorRepository.laden())!.modell;
    for (const b of beispiele) {
      expect(klassifizieren(zurueck, b.merkmale)?.kategorieId).toBe(
        klassifizieren(modell, b.merkmale)?.kategorieId,
      );
    }
  });

  it("liefert null, solange nie trainiert wurde", async () => {
    expect(await klassifikatorRepository.laden()).toBeNull();
  });

  it("ersetzt das Modell statt ein zweites anzulegen", async () => {
    const a = trainieren([{ merkmale: ["emp=alt"], kategorieId: "kat-a" }]);
    const b = trainieren([{ merkmale: ["emp=neu"], kategorieId: "kat-b" }]);
    await klassifikatorRepository.speichern({ modell: a, trainiertAm: "2026-08-01T00:00:00.000Z" });
    await klassifikatorRepository.speichern({ modell: b, trainiertAm: "2026-08-16T00:00:00.000Z" });

    const zurueck = await klassifikatorRepository.laden();
    expect([...zurueck!.modell.kategorien]).toEqual(["kat-b"]);
    expect(zurueck!.trainiertAm).toBe("2026-08-16T00:00:00.000Z");
  });

  it("übersteht ein leeres Modell (nichts zu lernen gewesen)", async () => {
    await klassifikatorRepository.speichern({
      modell: trainieren([]), trainiertAm: "2026-08-16T00:00:00.000Z",
    });
    const zurueck = await klassifikatorRepository.laden();
    expect(zurueck!.modell.kategorien).toHaveLength(0);
    expect(zurueck!.modell.vokabular).toHaveLength(0);
    expect(zurueck!.genauigkeit).toBeUndefined();
  });
});

describe("Merkmalskonfiguration — Persistenz", () => {
  it("unterscheidet „nie gesetzt“ von „alles abgeschaltet“", async () => {
    expect(await merkmalRepository.herkuenfteLesen()).toBeNull();

    await merkmalRepository.herkuenfteSetzen([]);

    // Ein leerer Eintrag ist eine Entscheidung; würde er als „nie gesetzt" gelesen,
    // käme beim nächsten Start der Standard zurück.
    expect(await merkmalRepository.herkuenfteLesen()).toEqual([]);
  });

  it("trägt die aktiven Herkünfte durch das Schema", async () => {
    await merkmalRepository.herkuenfteSetzen(["empGanz", "vwz"]);
    expect(await merkmalRepository.herkuenfteLesen()).toEqual(["empGanz", "vwz"]);
  });

  it("überschreibt die Herkünfte statt sie zu ergänzen", async () => {
    await merkmalRepository.herkuenfteSetzen(["empGanz", "vwz"]);
    await merkmalRepository.herkuenfteSetzen(["gid"]);
    expect(await merkmalRepository.herkuenfteLesen()).toEqual(["gid"]);
  });

  it("speichert einen globalen Ausschluss ohne Herkunftsliste", async () => {
    await merkmalRepository.ausschlussSetzen({ wort: "kdn", quelle: "manuell" });

    const [a] = await merkmalRepository.ausschluesseLesen();
    expect(a.wort).toBe("kdn");
    // NULL in der Spalte muss als „fehlend" zurückkommen, nicht als leere Liste — im
    // Kern bedeutet die leere Liste etwas anderes.
    expect(a.herkuenfte).toBeUndefined();
    expect(a.quelle).toBe("manuell");
  });

  it("speichert einen auf Herkünfte eingeschränkten Ausschluss", async () => {
    await merkmalRepository.ausschlussSetzen({ wort: "bank", herkuenfte: ["vwz", "empWort"], quelle: "manuell" });
    expect((await merkmalRepository.ausschluesseLesen())[0].herkuenfte).toEqual(["vwz", "empWort"]);
  });

  it("normalisiert das Wort beim Speichern und Löschen", async () => {
    await merkmalRepository.ausschlussSetzen({ wort: "  KDN  ", quelle: "manuell" });
    expect((await merkmalRepository.ausschluesseLesen())[0].wort).toBe("kdn");

    await merkmalRepository.ausschlussEntfernen("KDN");
    expect(await merkmalRepository.ausschluesseLesen()).toHaveLength(0);
  });

  it("ändert einen vorhandenen Eintrag statt einen zweiten anzulegen", async () => {
    await merkmalRepository.ausschlussSetzen({ wort: "bank", quelle: "standard" });
    await merkmalRepository.ausschlussSetzen({ wort: "bank", herkuenfte: ["vwz"], quelle: "manuell" });

    const alle = await merkmalRepository.ausschluesseLesen();
    expect(alle).toHaveLength(1);
    expect(alle[0].quelle).toBe("manuell");
    expect(alle[0].herkuenfte).toEqual(["vwz"]);
  });
});

describe("Kategorie-Festlegungen — Persistenz", () => {
  it("trägt Muster, Kategorie und Zeitpunkt durch das Schema", async () => {
    await festlegungRepository.speichern({
      muster: "kesselmann international", kategorieId: "k-abo", angelegtAm: "2026-08-17T10:00:00.000Z",
    });

    expect(await festlegungRepository.alle()).toEqual([
      { muster: "kesselmann international", kategorieId: "k-abo", angelegtAm: "2026-08-17T10:00:00.000Z" },
    ]);
  });

  it("normalisiert das Muster beim Speichern und Löschen", async () => {
    // „Kesselmann" und „kesselmann" wirken gleich — als zwei Zeilen ließe sich die eine
    // löschen, ohne dass sich etwas ändert.
    await festlegungRepository.speichern({ muster: "  KESSELMANN  ", kategorieId: "k-abo", angelegtAm: "2026-08-17T10:00:00.000Z" });
    expect((await festlegungRepository.alle())[0].muster).toBe("kesselmann");

    await festlegungRepository.loeschen("KESSELMANN");
    expect(await festlegungRepository.alle()).toHaveLength(0);
  });

  it("ersetzt eine vorhandene Festlegung statt eine zweite anzulegen", async () => {
    await festlegungRepository.speichern({ muster: "rewe", kategorieId: "k-le", angelegtAm: "2026-08-01T00:00:00.000Z" });
    await festlegungRepository.speichern({ muster: "rewe", kategorieId: "k-abo", angelegtAm: "2026-08-17T00:00:00.000Z" });

    const alle = await festlegungRepository.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0].kategorieId).toBe("k-abo");
  });
});

describe("Vertrag — Kategorie am Aggregat", () => {
  it("trägt die Kategorie durch das Schema", async () => {
    await vertragRepository.speichern({
      id: "v1", anbieter: "Kesselmann", beginn: "2026-01-01",
      verlaengerung: "automatisch", status: "aktiv", kategorieId: "kat-abo",
    });
    expect((await vertragRepository.alle())[0].kategorieId).toBe("kat-abo");
  });

  it("ein Vertrag ohne Kategorie bleibt ohne", async () => {
    await vertragRepository.speichern({
      id: "v1", anbieter: "Kesselmann", beginn: "2026-01-01",
      verlaengerung: "keine", status: "aktiv",
    });
    expect((await vertragRepository.alle())[0].kategorieId).toBeUndefined();
  });

  it("überschreibt die Kategorie beim Aktualisieren", async () => {
    const basis = { id: "v1", anbieter: "Kesselmann", beginn: "2026-01-01", verlaengerung: "keine" as const, status: "aktiv" as const };
    await vertragRepository.speichern({ ...basis, kategorieId: "kat-alt" });
    await vertragRepository.speichern({ ...basis, kategorieId: "kat-neu" });
    expect((await vertragRepository.alle())[0].kategorieId).toBe("kat-neu");
  });
});


describe("Dubletten-Freigabe — von Hand festgehalten", () => {
  it("speichert das Paar und liest es zurück", async () => {
    await freigabeRepository.speichern({ umsatzA: "u-a", umsatzB: "u-b", angelegt: "2026-08-20T10:00:00.000Z" });
    expect(await freigabeRepository.alle()).toEqual([
      { umsatzA: "u-a", umsatzB: "u-b", angelegt: "2026-08-20T10:00:00.000Z" },
    ]);
  });

  it("legt dasselbe Paar nicht zweimal an", async () => {
    await freigabeRepository.speichern({ umsatzA: "u-a", umsatzB: "u-b", angelegt: "2026-08-20T10:00:00.000Z" });
    await freigabeRepository.speichern({ umsatzA: "u-a", umsatzB: "u-b", angelegt: "2026-08-21T10:00:00.000Z" });
    const alle = await freigabeRepository.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0].angelegt).toBe("2026-08-21T10:00:00.000Z");
  });

  it("entfernt auch, wenn die IDS andersherum kommen", async () => {
    // Die Anzeige kennt „diese Zeile und ihr Zwilling" — welche davon in Spalte A steht,
    // weiss sie nicht.
    await freigabeRepository.speichern({ umsatzA: "u-a", umsatzB: "u-b", angelegt: "2026-08-20T10:00:00.000Z" });
    await freigabeRepository.entfernen("u-b", "u-a");
    expect(await freigabeRepository.alle()).toEqual([]);
  });
});


describe("Kontostands-Anker", () => {
  it("trägt Stichtag, Herkunft und Erfassungszeitpunkt getrennt durch das Schema", async () => {
    await ankerRepository.speichern({
      kontoId: "giro", datum: "2026-08-20", herkunft: "bank", betrag: 145678,
      erfasstAm: "2026-08-20T22:47:25.284Z",
    });
    expect(await ankerRepository.alle()).toEqual([
      { kontoId: "giro", datum: "2026-08-20", herkunft: "bank", betrag: 145678, erfasstAm: "2026-08-20T22:47:25.284Z" },
    ]);
  });

  it("überschreibt denselben Stichtag derselben Quelle, statt zu doppeln", async () => {
    // Zwei Abrufe an einem Tag sind zwei Aussagen über DENSELBEN Tag.
    const basis = { kontoId: "giro", datum: "2026-08-20", herkunft: "bank" as const };
    await ankerRepository.speichern({ ...basis, betrag: 145678, erfasstAm: "2026-08-20T09:00:00.000Z" });
    await ankerRepository.speichern({ ...basis, betrag: 170000, erfasstAm: "2026-08-20T22:00:00.000Z" });
    const alle = await ankerRepository.alle();
    expect(alle).toHaveLength(1);
    expect(alle[0].betrag).toBe(170000);
  });

  it("hält Bank und Kassensturz desselben Tages auseinander", async () => {
    // Zwei Quellen, zwei Aussagen — die dürfen sich nicht gegenseitig überschreiben.
    await ankerRepository.speichern({ kontoId: "bar", datum: "2026-08-20", herkunft: "bank", betrag: 100, erfasstAm: "x" });
    await ankerRepository.speichern({ kontoId: "bar", datum: "2026-08-20", herkunft: "hand", betrag: 4750, erfasstAm: "y" });
    expect(await ankerRepository.alle()).toHaveLength(2);
  });

  it("entfernt gezielt einen Anker", async () => {
    await ankerRepository.speichern({ kontoId: "giro", datum: "2026-08-20", herkunft: "bank", betrag: 1, erfasstAm: "x" });
    await ankerRepository.speichern({ kontoId: "giro", datum: "2026-08-21", herkunft: "bank", betrag: 2, erfasstAm: "x" });
    await ankerRepository.entfernen("giro", "2026-08-20", "bank");
    expect((await ankerRepository.alle()).map((a) => a.datum)).toEqual(["2026-08-21"]);
  });
});

describe("Depot — Beobachtungen statt Buchungen", () => {
  const depot = {
    id: "d1",
    zugangId: "z1",
    schluessel: "9876543210|Depot",
    bezeichnung: "Depot",
    waehrung: "EUR",
  };

  it("macht die Rundreise über alle drei Tabellen", async () => {
    await depotRepository.speichern(depot);
    await depotRepository.wertSpeichern(
      { depotId: "d1", stichtag: "2026-08-20", gesamtwert: 1_250_00 },
      "2026-08-20T10:00:00.000Z",
    );
    await depotRepository.positionenErsetzen("d1", "2026-08-20", [
      {
        depotId: "d1",
        stichtag: "2026-08-20",
        kennung: "DE000TEST001",
        isin: "DE000TEST001",
        wkn: "TST001",
        name: "Vibora Sammelanlage",
        stueck: 12.3456,
        kurs: 87.65,
        wert: 1_082_09,
        waehrung: "EUR",
        einstandDatum: "2024-03-01",
        einstandKurs: 60.5,
      },
    ]);

    expect(await depotRepository.alle()).toEqual([depot]);
    expect(await depotRepository.werte("d1")).toEqual([
      { depotId: "d1", stichtag: "2026-08-20", gesamtwert: 1_250_00 },
    ]);
    const positionen = await depotRepository.positionen("d1");
    expect(positionen).toHaveLength(1);
    // Die Stückzahl überlebt als Bruch: sie ist eine Menge, kein Geld, und würde als
    // Integer auf 12 zusammenfallen.
    expect(positionen[0].stueck).toBe(12.3456);
    expect(positionen[0].kurs).toBe(87.65);
    expect(positionen[0].wert).toBe(1_082_09);
    expect(positionen[0].einstandKurs).toBe(60.5);
  });

  it("überschreibt einen zweiten Abruf desselben Stichtags", async () => {
    // Zwei Werte für denselben Tag wären keine Geschichte, sondern ein Widerspruch — die
    // spätere Aussage der Bank ist die genauere.
    await depotRepository.speichern(depot);
    await depotRepository.wertSpeichern({ depotId: "d1", stichtag: "2026-08-20", gesamtwert: 100 }, "a");
    await depotRepository.wertSpeichern({ depotId: "d1", stichtag: "2026-08-20", gesamtwert: 200 }, "b");
    expect(await depotRepository.werte("d1")).toEqual([
      { depotId: "d1", stichtag: "2026-08-20", gesamtwert: 200 },
    ]);
  });

  it("hält die Stichtage auseinander und liefert sie geordnet", async () => {
    await depotRepository.speichern(depot);
    await depotRepository.wertSpeichern({ depotId: "d1", stichtag: "2026-08-20", gesamtwert: 300 }, "x");
    await depotRepository.wertSpeichern({ depotId: "d1", stichtag: "2026-06-30", gesamtwert: 100 }, "x");
    await depotRepository.wertSpeichern({ depotId: "d1", stichtag: "2026-07-31", gesamtwert: 200 }, "x");
    expect((await depotRepository.werte("d1")).map((w) => w.stichtag)).toEqual([
      "2026-06-30",
      "2026-07-31",
      "2026-08-20",
    ]);
  });

  it("ersetzt Positionen, statt sie anzuhäufen", async () => {
    // Eine Position, die im neuen Abruf fehlt, ist verkauft. Nur einzufügen ergäbe ein
    // Depot, das nur wachsen kann.
    await depotRepository.speichern(depot);
    const basis = { depotId: "d1", stichtag: "2026-08-20" };
    await depotRepository.positionenErsetzen("d1", "2026-08-20", [
      { ...basis, kennung: "A", name: "Ohlert Anteil", wert: 100 },
      { ...basis, kennung: "B", name: "Kesselmann Anteil", wert: 200 },
    ]);
    await depotRepository.positionenErsetzen("d1", "2026-08-20", [
      { ...basis, kennung: "A", name: "Ohlert Anteil", wert: 150 },
    ]);
    const positionen = await depotRepository.positionen("d1", "2026-08-20");
    expect(positionen.map((p) => p.kennung)).toEqual(["A"]);
    expect(positionen[0].wert).toBe(150);
  });

  it("hält zwei namenlose Positionen desselben Tages auseinander", async () => {
    // Ohne eigene Kennung wären sie in einem zusammengesetzten Schlüssel aus NULL-Werten
    // ununterscheidbar — SQLite betrachtet NULLs dort paarweise als verschieden, die
    // Zeilen kämen bei jedem Abruf erneut dazu.
    await depotRepository.speichern(depot);
    const basis = { depotId: "d1", stichtag: "2026-08-20" };
    await depotRepository.positionenErsetzen("d1", "2026-08-20", [
      { ...basis, kennung: "#0", wert: 100 },
      { ...basis, kennung: "#1", wert: 200 },
    ]);
    expect(await depotRepository.positionen("d1", "2026-08-20")).toHaveLength(2);
  });

  it("räumt beim Löschen die Wertreihe und die Positionen mit ab", async () => {
    await depotRepository.speichern(depot);
    await depotRepository.wertSpeichern({ depotId: "d1", stichtag: "2026-08-20", gesamtwert: 1 }, "x");
    await depotRepository.positionenErsetzen("d1", "2026-08-20", [
      { depotId: "d1", stichtag: "2026-08-20", kennung: "A", wert: 1 },
    ]);
    await depotRepository.loeschen("d1");
    expect(await depotRepository.alle()).toEqual([]);
    expect(await depotRepository.werte()).toEqual([]);
    expect(await depotRepository.positionen("d1")).toEqual([]);
  });
});
