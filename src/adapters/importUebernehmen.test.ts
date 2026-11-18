/** @vitest-environment jsdom */
// Welche Kategorie mit welcher Herkunft eine Importzeile nach dem Übernehmen trägt — über
// die ganze Kette, so wie die App sie zusammensteckt: `importUebernehmen` aus `dienste`,
// dahinter die echten Repositories gegen sql.js.
//
// Warum über `dienste` und nicht über den Use-Case: geprüft wird gerade die VERDRAHTUNG.
// Ob der Import die Kette selbst ruft oder sie hereingereicht bekommt, ist eine Frage der
// Zusammensetzung; das Ergebnis je Zeile muss dasselbe bleiben, und dieser Test sieht nur
// das Ergebnis. Er kennt deshalb weder den Use-Case noch die Kette, sondern nur Daten.
//
// Namen und Beträge sind erfunden — das Repo ist öffentlich.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("./persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, sqlLaden } from "../testwerkzeug/harness";
import { importUebernehmen } from "./dienste";
import { merkmalsbefund, standardErkennung, trainieren, STANDARD_KONFIGURATION } from "../core";
import type { RohUmsatz } from "../application/import/rohUmsatz";
import { sqliteKategorieRepository as kategorieRepo } from "./persistence/sqliteStammdatenRepositories";
import { sqliteUmsatzRepository as umsatzRepo } from "./persistence/sqliteImportRepositories";
import { sqliteVertragRepository as vertragRepo } from "./persistence/sqliteVertragRepository";
import { sqliteVertragserkennungRepository as erkennungRepo } from "./persistence/sqliteVertragZuordnungRepositories";
import { sqliteKlassifikatorRepository as klassifikatorRepo } from "./persistence/sqliteKlassifikatorRepository";

const IBAN = "DE02999999010000001002";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

function roh(over: Partial<RohUmsatz>): RohUmsatz {
  return {
    buchungstag: "2026-04-03", betrag: -1250, waehrung: "EUR", gegenpartei: "", verwendungszweck: "",
    istUmbuchung: false, quelle: "datei", kontoIban: IBAN, ...over,
  };
}

/** Was das Modell über eine Zeile sieht — dieselbe Merkmalsbildung wie beim Vorschlagen. */
const merkmaleVon = (gegenpartei: string, verwendungszweck: string, betrag: number) =>
  merkmalsbefund({ gegenpartei, verwendungszweck, betrag }, STANDARD_KONFIGURATION).merkmale;

describe("Kategorie-Vorschlag beim Übernehmen, je Stufe der Kette", () => {
  beforeEach(async () => {
    for (const id of ["k-vertrag", "k-quelle-id", "k-quelle-name", "k-modell", "k-anders"]) {
      await kategorieRepo.speichern({ id, name: `Name ${id}`, defaultCharakter: "Aufwand" });
    }
    // Ein Vertrag mit Kategorie und einer Erkennungsregel auf seinen Anbieter.
    await vertragRepo.speichern({
      id: "v-1", anbieter: "Kesselmann", beginn: "2025-01-01", verlaengerung: "keine",
      status: "aktiv", kategorieId: "k-vertrag",
    });
    await erkennungRepo.speichern(standardErkennung("v-1", "Kesselmann", 2990));
    // Ein Modell, das „Ohlert" kennt — und zum Vergleich etwas anderes, damit es wählen muss.
    await klassifikatorRepo.speichern({
      modell: trainieren([
        { merkmale: merkmaleVon("Ohlert", "Ruvelo", -1250), kategorieId: "k-modell" },
        { merkmale: merkmaleVon("Vibora", "Tamsel", -1250), kategorieId: "k-anders" },
      ]),
      trainiertAm: "2026-04-01T08:00:00.000Z",
    });
  });

  it("hält je Zeile Kategorie und Herkunft fest", async () => {
    await importUebernehmen({
      quelle: "datei",
      zeitpunkt: "2026-04-05T09:00:00.000Z",
      rohUmsaetze: [
        // 1. Umbuchung: die Quelle hat es markiert — Umschichtung ohne Kategorie, auch
        //    wenn der Text auf den Vertrag passen würde.
        roh({ nativeId: "z-umbuchung", istUmbuchung: true, gegenpartei: "Kesselmann", betrag: -2990 }),
        // 2. Vertrag: die Erkennungsregel trifft, obwohl die Quelle etwas anderes sagt.
        roh({ nativeId: "z-vertrag", gegenpartei: "Kesselmann", betrag: -2990, kategorieHinweis: "Fremd A" }),
        // 3a. Quelle, in der Import-Ansicht zugeordnet (Id).
        roh({ nativeId: "z-quelle-id", gegenpartei: "Ohlert", verwendungszweck: "Ruvelo", kategorieHinweis: "Fremd B" }),
        // 3b. Quelle, vom Adapter übersetzt (Name in unserem Katalog).
        roh({ nativeId: "z-quelle-name", gegenpartei: "Ohlert", verwendungszweck: "Ruvelo", kategorieVorschlag: "Name k-quelle-name" }),
        // 4. Modell: nichts davon trifft, das Modell legt sich fest.
        roh({ nativeId: "z-modell", gegenpartei: "Ohlert", verwendungszweck: "Ruvelo" }),
        // 5. Nichts: ohne ein einziges Merkmal trägt das Modell keine Entscheidung.
        roh({ nativeId: "z-nichts" }),
      ],
      konten: [{ quelleKey: IBAN, neu: { bezeichnung: "Giro", typ: "Giro", iban: IBAN } }],
      fremdkategorien: { "Fremd A": "k-quelle-id", "Fremd B": "k-quelle-id" },
    });

    const umsaetze = await umsatzRepo.alle();
    const jeZeile = Object.fromEntries(umsaetze.map((u) => [u.nativeId, u.vorschlag ?? null]));
    expect(jeZeile).toEqual({
      "z-umbuchung": { charakter: "Umschichtung", quelle: "umbuchung" },
      "z-vertrag": { kategorieId: "k-vertrag", charakter: "Aufwand", quelle: "regel" },
      "z-quelle-id": { kategorieId: "k-quelle-id", charakter: "Aufwand", quelle: "fremdkategorie" },
      "z-quelle-name": { kategorieId: "k-quelle-name", charakter: "Aufwand", quelle: "fremdkategorie" },
      "z-modell": { kategorieId: "k-modell", charakter: "Aufwand", quelle: "ki" },
      "z-nichts": null,
    });
  });
});
