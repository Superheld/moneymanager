/** @vitest-environment jsdom */
// Das Vorsorgeziel von der Oberfläche bis ins Schema: anlegen, die Kette ablesen, einen
// Vermögenswert zuordnen, ändern, löschen.
//
// Gerechnet wird mit 0 % Rendite: dann ist der Bedarf Lücke × Monate und hängt nicht
// davon ab, an welchem Tag der Test läuft. Alle Namen und Beträge sind erfunden.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import i18n from "../../../i18n/i18n";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { vorsorge, vorsorgezielFestlegen, vorsorgezielLoeschen } from "../../dienste";
import { sqliteVermoegenRepository as vermoegenRepo } from "../../persistence/sqliteVermoegenRepository";
import { sqliteVorsorgeRepository as repo } from "../../persistence/sqliteVorsorgeRepository";
import { sqliteZahlungskontoRepository as kontoRepo } from "../../persistence/sqliteStammdatenRepositories";
import { VermoegenScreen } from "./VermoegenScreen";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const t = (schluessel: string, werte?: Record<string, unknown>) => i18n.t(schluessel, werte) as string;
const feld = (schluessel: string) => screen.getByRole("textbox", { name: new RegExp(`^${t(schluessel)}`) });

async function mitVorsorgekonto(saldo: number) {
  await kontoRepo.speichern({
    id: "vors", bezeichnung: "Vorsorgekonto", typ: "Tagesgeld", klasse: "vorsorge", inhaberIds: [], saldo,
  });
}

/** Wunsch 2.000, Rente 1.500, zwanzig Jahre, 0 %: Bedarf 500 × 240 = 120.000. */
const EINGABE = {
  bezeichnung: "Ruhestand",
  zielMonat: "2090-01",
  wunschMonatlich: 2_000_00,
  renteMonatlich: 1_500_00,
  entnahmeJahre: 20,
  renditeBp: 0,
};

describe("Vorsorge — anlegen", () => {
  it("bietet ohne Ziel das Anlegen an und rechnet danach die Kette", async () => {
    const nutzer = userEvent.setup();
    await mitVorsorgekonto(20_000_00);
    rendere(<VermoegenScreen />);

    expect(await screen.findByText(t("vermoegen.vorsorge.leer"))).toBeTruthy();
    await nutzer.click(screen.getByRole("button", { name: new RegExp(`^\\+?\\s*${t("vermoegen.vorsorge.neu")}$`) }));

    const ab = await screen.findByRole("textbox", { name: t("vermoegen.vorsorge.feldAb") });
    await nutzer.type(ab, "2090-01-01");
    await nutzer.tab();
    await nutzer.type(feld("vermoegen.vorsorge.feldWunsch"), "2000");
    await nutzer.type(feld("vermoegen.vorsorge.feldRente"), "1500");
    await nutzer.type(feld("vermoegen.vorsorge.feldJahre"), "20");
    await nutzer.type(feld("vermoegen.vorsorge.feldRendite"), "0");
    await nutzer.click(screen.getByRole("button", { name: t("vermoegen.speichern") }));

    await waitFor(async () => {
      expect(await repo.annahmen()).toEqual([
        expect.objectContaining({
          zielMonat: "2090-01", wunschMonatlich: 2_000_00, renteMonatlich: 1_500_00, entnahmeMonate: 240, renditeBp: 0,
        }),
      ]);
    });
    // Bedarf, und was nach dem Vorsorgekonto noch fehlt.
    await waitFor(() => expect(document.body.textContent).toMatch(/120\.000,00/));
    expect(document.body.textContent).toMatch(/100\.000,00/);
    expect(screen.getByText(t("vermoegen.vorsorge.sparrate"))).toBeTruthy();
  });

  it("weist eine unlesbare Rendite ab, statt null daraus zu machen", async () => {
    await expect(vorsorgezielFestlegen({ ...EINGABE, renditeBp: Number.NaN }, "2026-01-10")).rejects.toMatchObject({
      code: "vorsorge.renditeUngueltig",
    });
    expect(await repo.ziele()).toEqual([]);
  });
});

describe("Vorsorge — Annahmen gelten ab einem Monat", () => {
  it("überschreibt im selben Monat und legt im nächsten eine neue Zeile an", async () => {
    await vorsorgezielFestlegen(EINGABE, "2026-01-10");
    await vorsorgezielFestlegen({ ...EINGABE, wunschMonatlich: 2_200_00 }, "2026-01-20");
    expect(await repo.annahmen()).toHaveLength(1);

    await vorsorgezielFestlegen({ ...EINGABE, wunschMonatlich: 2_500_00 }, "2026-03-05");
    const reihe = await repo.annahmen();
    expect(reihe.map((a) => [a.abMonat, a.wunschMonatlich])).toEqual([
      ["2026-01", 2_200_00],
      ["2026-03", 2_500_00],
    ]);
    // Es bleibt EIN Ziel: das zweite Festlegen ändert, es legt kein zweites an.
    expect(await repo.ziele()).toHaveLength(1);
    // Im Februar gilt noch, was im Januar festgelegt wurde.
    expect((await vorsorge("2026-02-15"))?.annahme.wunschMonatlich).toBe(2_200_00);
  });
});

/** Ein abgerufenes Depot mit einem Wert — so, wie der Abruf es hinterlässt. */
function mitDepot(id: string, bezeichnung: string, wert: number) {
  db.run("INSERT OR IGNORE INTO bankzugang (id, bezeichnung, url, blz, benutzer, angelegt_am) VALUES ('z','Ormelbank','https://example.invalid','99999990','u','2026-01-01')");
  db.run("INSERT INTO depot (id, zugang_id, schluessel, bezeichnung) VALUES (?, 'z', ?, ?)", [id, `${id}|`, bezeichnung]);
  db.run("INSERT INTO depotwert (depot_id, stichtag, gesamtwert, erfasst_am) VALUES (?, '2026-01-02', ?, '2026-01-02')", [id, wert]);
}

describe("Vorsorge — Depots", () => {
  it("ordnet beim Anlegen des Ziels alle Depots zu, und das Löschen löst die Zuordnung", async () => {
    mitDepot("d1", "Depot Kranich", 40_000_00);
    mitDepot("d2", "Depot Hollerbusch", 10_000_00);
    const ziel = await vorsorgezielFestlegen(EINGABE, "2026-01-10");
    expect((await vorsorge("2026-01-10"))?.vermoegen.depots).toBe(50_000_00);
    expect(db.exec("SELECT DISTINCT vorsorgeziel_id FROM depot")[0].values).toEqual([[ziel.id]]);

    await vorsorgezielLoeschen();
    expect(db.exec("SELECT DISTINCT vorsorgeziel_id FROM depot")[0].values).toEqual([[null]]);
  });

  it("listet unter „Heute dafür da“ das Depot mit Verrechnungskonto und sagt, wenn dessen Klasse nicht zählt", async () => {
    mitDepot("d1", "Depot Kranich", 40_000_00);
    mitDepot("d2", "Depot Hollerbusch", 10_000_00);
    await kontoRepo.speichern({ id: "verr", bezeichnung: "Konto Tannrode", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 2_500_00 });
    await mitVorsorgekonto(20_000_00);
    await vorsorgezielFestlegen(EINGABE, "2026-01-10");
    db.run("UPDATE depot SET verrechnungskonto_id = 'verr' WHERE id = 'd1'");
    // Das zweite Depot zählt nicht zum Ziel.
    db.run("UPDATE depot SET vorsorgeziel_id = NULL WHERE id = 'd2'");

    rendere(<VermoegenScreen />);
    const karte = (await screen.findByText(t("vermoegen.vorsorge.spaltePosten"))).closest(".abschnitt") as HTMLElement;
    expect(within(karte).getAllByText("Depot Kranich").length).toBeGreaterThan(0);
    expect(within(karte).getByText("Konto Tannrode")).toBeTruthy();
    expect(within(karte).getByText("Vorsorgekonto")).toBeTruthy();
    expect(within(karte).queryByText("Depot Hollerbusch")).toBeNull();
    expect(
      within(karte).getByText(t("vermoegen.vorsorge.zaehltNichtKurz", { klasse: t("einstellungen.konto.klasse.liquide") })),
    ).toBeTruthy();
    // Die Summe bleibt, was zählt: Depot und Vorsorgekonto, nicht das Konto der Klasse Liquidität.
    expect((await vorsorge("2026-01-10"))?.vermoegen.netto).toBe(40_000_00 + 20_000_00);
  });
});

describe("Vorsorge — Vermögenswerte", () => {
  it("zählt einen zugeordneten Vermögenswert mit und löst die Zuordnung beim Löschen des Ziels", async () => {
    const ziel = await vorsorgezielFestlegen(EINGABE, "2026-01-10");
    await vermoegenRepo.gegenstandSpeichern({ id: "g1", bezeichnung: "Police Auenweg", art: "versicherung", vorsorgezielId: ziel.id });
    await vermoegenRepo.gegenstandSpeichern({ id: "g2", bezeichnung: "Wagen", art: "fahrzeug" });
    await vermoegenRepo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 30_000_00 }, "2026-01-10T08:00:00.000Z");
    await vermoegenRepo.wertEintragen({ gegenstandId: "g2", stichtag: "2025-12-31", wert: 9_000_00 }, "2026-01-10T08:00:00.000Z");

    const sicht = await vorsorge("2026-01-10");
    expect(sicht?.vermoegen.netto).toBe(30_000_00);
    expect(sicht?.stand.fehlbetrag).toBe(90_000_00);

    await vorsorgezielLoeschen();
    expect(await vorsorge("2026-01-10")).toBeNull();
    expect(await repo.annahmen()).toEqual([]);
    const g1 = (await vermoegenRepo.gegenstaende()).find((g) => g.id === "g1");
    expect(g1).toBeDefined();
    expect(g1?.vorsorgezielId).toBeUndefined();
  });
});
