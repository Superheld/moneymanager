/** @vitest-environment jsdom */
// Die Karte, über die eine fremde Ordnung hereinkommt.
//
// Geprüft wird die Naht, die kein Use-Case-Test erreicht: eine echte Datei geht durch die
// Dateiauswahl, die Vorschau steht da, und erst der zweite Klick schreibt. Genau dieser
// zweite Klick ist die Zusicherung der Karte — ein Import, der beim Dateiwählen losläuft,
// nimmt einem die einzige Gelegenheit, ihn nicht zu wollen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { KonfigurationImportCard } from "./KonfigurationImportCard";
import { sqliteKategorieRepository as kategorieRepo } from "../../persistence/sqliteStammdatenRepositories";
import { EXPORT_FASSUNG } from "../../../application";
import i18n from "../../../i18n/i18n";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Eine Exportdatei, wie sie aus der Karte darüber fällt. */
function exportdatei(kategorien: unknown[]): File {
  const inhalt = JSON.stringify({
    fassung: EXPORT_FASSUNG,
    erzeugt: "2026-09-22T08:00:00.000Z",
    kategorien,
  });
  return new File([inhalt], "konfiguration-probe-2026-09-22.json", { type: "application/json" });
}

const WOHNEN = { id: "d1", name: "Wohnen", elternId: null, defaultCharakter: "Aufwand" };
const MIETE = { id: "d2", name: "Miete", elternId: "d1", defaultCharakter: "Aufwand" };

/**
 * Das versteckte Dateifeld — sichtbar ist nur der Knopf davor.
 *
 * Wartend, nicht greifend: der `EinstellungenProvider` lädt Locale und Währung aus der
 * Datenbank und rendert seine Kinder bis dahin gar nicht.
 */
async function dateifeld(): Promise<HTMLInputElement> {
  return (await screen.findByLabelText(
    i18n.t("einstellungen.import.dateiWaehlen"),
  )) as HTMLInputElement;
}

describe("Eine Ordnung einlesen", () => {
  it("zeigt erst die Vorschau und schreibt erst auf den zweiten Klick", async () => {
    await kategorieRepo.speichern({ id: "b1", name: "Wohnen", defaultCharakter: "Aufwand" });
    const nutzer = userEvent.setup();
    rendere(<KonfigurationImportCard />);

    await nutzer.upload(await dateifeld(), exportdatei([WOHNEN, MIETE]));

    // Eine neu, eine schon da — und noch hat sich am Bestand nichts geändert.
    await screen.findByText(i18n.t("einstellungen.import.zaehlerNeu", { n: 1 }));
    screen.getByText(i18n.t("einstellungen.import.zaehlerVorhanden", { n: 1 }));
    expect(await kategorieRepo.alle()).toHaveLength(1);

    await nutzer.click(screen.getByRole("button", { name: i18n.t("einstellungen.import.uebernehmen", { n: 1 }) }));

    await screen.findByText(i18n.t("einstellungen.import.fertig", { n: 1 }));
    const nachher = await kategorieRepo.alle();
    expect(nachher.map((k) => k.name).sort()).toEqual(["Miete", "Wohnen"]);
    // Angehängt an die Kategorie, die es hier schon gab — nicht an eine zweite „Wohnen".
    expect(nachher.find((k) => k.name === "Miete")!.elternId).toBe("b1");
  });

  it("sagt es, wenn die Datei keine ist — und bietet nichts zum Übernehmen an", async () => {
    const nutzer = userEvent.setup();
    rendere(<KonfigurationImportCard />);

    await nutzer.upload(await dateifeld(), new File(["kein json"], "notizen.json", { type: "application/json" }));

    await screen.findByText(i18n.t("fehler.import.keinJson"));
    expect(screen.queryByText(/anlegen$/)).toBeNull();
  });
});
