/** @vitest-environment jsdom */
// Der Bereich Vermögen von der Oberfläche bis ins Schema: anlegen, einen Wert eintragen,
// das Nettovermögen ablesen, löschen.
//
// Gesucht wird nach den Daten, die der Test anlegt, und nach i18n-Schlüsseln — nicht
// nach Wortlaut. Alle Namen und Beträge sind erfunden.

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
import { auswahlWaehlen, frischeDb, klickbareZeile, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { sqliteVermoegenRepository as repo } from "../../persistence/sqliteVermoegenRepository";
import { sqliteZahlungskontoRepository as kontoRepo } from "../../persistence/sqliteStammdatenRepositories";
import { VermoegenScreen } from "./VermoegenScreen";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const JETZT = "2026-01-10T08:00:00.000Z";
const t = (schluessel: string, werte?: Record<string, unknown>) => i18n.t(schluessel, werte) as string;

/** Der Anlege-Knopf trägt ein führendes „+" vor seinem Wort. */
const anlegeKnopf = (schluessel: string) => new RegExp(`^\\+?\\s*${t(schluessel)}$`);
const speichern = () => screen.getByRole("button", { name: t("vermoegen.speichern") });

async function mitGiro(saldo: number) {
  await kontoRepo.speichern({
    id: "giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo,
  });
}

describe("Vermögen — leer", () => {
  it("sagt, was hierher gehört, und zeigt das Nettovermögen aus den Konten", async () => {
    await mitGiro(1_234_56);
    rendere(<VermoegenScreen />);

    expect(await screen.findByText(t("vermoegen.leer"))).toBeTruthy();
    // Ohne Vermögenswert und Schuld ist das Nettovermögen, was auf den Konten liegt.
    await waitFor(() => expect(document.body.textContent).toMatch(/1\.234,56/));
    // Die beiden Listen gibt es erst, wenn etwas darin steht.
    expect(document.querySelector("table")).toBeNull();
  });
});

describe("Vermögen — anlegen und Wert eintragen", () => {
  it("legt einen Vermögenswert an, trägt einen Wert ein und rechnet ihn ins Nettovermögen", async () => {
    const nutzer = userEvent.setup();
    await mitGiro(1_000_00);
    rendere(<VermoegenScreen />);

    await nutzer.click(await screen.findByRole("button", { name: anlegeKnopf("vermoegen.neuVermoegenswert") }));
    await nutzer.type(await screen.findByLabelText(new RegExp(`^${t("vermoegen.feldBezeichnung")}`)), "Wohnung Lindenhof");
    await auswahlWaehlen(nutzer, t("vermoegen.feldArt"), t("vermoegen.art.immobilie"));
    await nutzer.click(speichern());

    await waitFor(async () => {
      expect(await repo.gegenstaende()).toEqual([
        expect.objectContaining({ bezeichnung: "Wohnung Lindenhof", art: "immobilie", aktiv: true }),
      ]);
    });

    // Die Zeile aufklappen und den Wert eintragen — mit dem Stichtag aus der Mitteilung.
    await nutzer.click(await klickbareZeile("Wohnung Lindenhof"));
    await nutzer.click(await screen.findByRole("button", { name: anlegeKnopf("vermoegen.wertEintragen") }));
    const stichtag = await screen.findByRole("textbox", { name: t("vermoegen.feldStichtag") });
    await nutzer.clear(stichtag);
    await nutzer.type(stichtag, "2025-12-31");
    await nutzer.tab();
    await nutzer.type(screen.getByRole("textbox", { name: new RegExp(`^${t("vermoegen.feldWert")}`) }), "250000");
    await nutzer.click(speichern());

    await waitFor(async () => {
      expect(await repo.werte()).toEqual([
        expect.objectContaining({ stichtag: "2025-12-31", wert: 250_000_00 }),
      ]);
    });
    // Konto plus Vermögenswert.
    await waitFor(() => expect(document.body.textContent).toMatch(/251\.000,00/));
  });

  it("zieht eine Schuld mit ihrer Restschuld ab", async () => {
    const nutzer = userEvent.setup();
    await mitGiro(1_000_00);
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Wohnung Lindenhof", art: "immobilie" });
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 250_000_00 }, JETZT);
    rendere(<VermoegenScreen />);

    await nutzer.click(await screen.findByRole("button", { name: anlegeKnopf("vermoegen.neuSchuld") }));
    await nutzer.type(await screen.findByLabelText(new RegExp(`^${t("vermoegen.feldBezeichnung")}`)), "Darlehen Lindenhof");
    await auswahlWaehlen(nutzer, t("vermoegen.feldVermoegenswert"), "Wohnung Lindenhof");
    await nutzer.click(speichern());

    await waitFor(async () => {
      expect(await repo.verbindlichkeiten()).toEqual([
        expect.objectContaining({ bezeichnung: "Darlehen Lindenhof", art: "immobilienkredit", gegenstandId: "g1" }),
      ]);
    });

    await nutzer.click(await klickbareZeile("Darlehen Lindenhof"));
    await nutzer.click(await screen.findByRole("button", { name: anlegeKnopf("vermoegen.restschuldEintragen") }));
    const stichtag = await screen.findByRole("textbox", { name: t("vermoegen.feldStichtag") });
    await nutzer.clear(stichtag);
    await nutzer.type(stichtag, "2025-12-31");
    await nutzer.tab();
    await nutzer.type(screen.getByRole("textbox", { name: new RegExp(`^${t("vermoegen.feldRestschuld")}`) }), "170000");
    await nutzer.click(speichern());

    await waitFor(async () => {
      expect(await repo.staende()).toEqual([
        expect.objectContaining({ stichtag: "2025-12-31", restschuld: 170_000_00 }),
      ]);
    });
    // 1.000 + 250.000 − 170.000
    await waitFor(() => expect(document.body.textContent).toMatch(/81\.000,00/));
  });

  it("überschreibt einen belegten Stichtag nicht, sondern meldet ihn", async () => {
    const nutzer = userEvent.setup();
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Police Nordlicht", art: "versicherung" });
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 14_250_00 }, JETZT);
    rendere(<VermoegenScreen />);

    await nutzer.click(await klickbareZeile("Police Nordlicht"));
    await nutzer.click(await screen.findByRole("button", { name: anlegeKnopf("vermoegen.wertEintragen") }));
    const stichtag = await screen.findByRole("textbox", { name: t("vermoegen.feldStichtag") });
    await nutzer.clear(stichtag);
    await nutzer.type(stichtag, "2025-12-31");
    await nutzer.tab();
    await nutzer.type(screen.getByRole("textbox", { name: new RegExp(`^${t("vermoegen.feldWert")}`) }), "999");
    await nutzer.click(speichern());

    expect(await screen.findByText(t("fehler.vermoegen.stichtagBelegt"))).toBeTruthy();
    expect((await repo.werte())[0].wert).toBe(14_250_00);
  });

  it("entfernt einen eingetragenen Wert wieder", async () => {
    const nutzer = userEvent.setup();
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Police Nordlicht", art: "versicherung" });
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2024-12-31", wert: 13_100_00 }, JETZT);
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 14_250_00 }, JETZT);
    rendere(<VermoegenScreen />);

    await nutzer.click(await klickbareZeile("Police Nordlicht"));
    const knoepfe = await screen.findAllByRole("button", { name: /2025/ });
    // Genau ein Knopf nennt den Stichtag von 2025: der zum Entfernen dieser Zeile.
    expect(knoepfe).toHaveLength(1);
    await nutzer.click(knoepfe[0]);

    await waitFor(async () => {
      expect((await repo.werte()).map((w) => w.stichtag)).toEqual(["2024-12-31"]);
    });
    // Der ältere Wert ist jetzt der jüngste und trägt das Nettovermögen.
    await waitFor(() => expect(document.body.textContent).toMatch(/13\.100,00/));
  });
});

describe("Vermögen — stilllegen und löschen", () => {
  it("zählt einen stillgelegten Vermögenswert nicht mehr, zeigt ihn aber weiter", async () => {
    const nutzer = userEvent.setup();
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Transporter", art: "fahrzeug" });
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 9_000_00 }, JETZT);
    rendere(<VermoegenScreen />);

    await nutzer.click(await screen.findByRole("button", { name: t("vermoegen.bearbeiten", { name: "Transporter" }) }));
    const haken = await screen.findByRole("checkbox", { name: t("vermoegen.gefuehrt") });
    expect(haken).toBeChecked();
    await nutzer.click(haken);
    await nutzer.click(speichern());

    await waitFor(async () => expect((await repo.gegenstaende())[0].aktiv).toBe(false));
    expect(await screen.findByText(t("vermoegen.pillNichtGefuehrt"))).toBeTruthy();
    // Seine Reihe bleibt.
    expect(await repo.werte()).toHaveLength(1);
  });

  it("löscht nicht, wenn die Rückfrage abgebrochen wird", async () => {
    const nutzer = userEvent.setup();
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Anteil Werkhof", art: "beteiligung" });
    rendere(<VermoegenScreen />);

    await nutzer.click(await screen.findByRole("button", { name: t("vermoegen.loeschen", { name: "Anteil Werkhof" }) }));
    const dialog = await screen.findByRole("alertdialog");
    await nutzer.click(within(dialog).getByRole("button", { name: t("loeschen.abbrechen") }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await repo.gegenstaende()).toHaveLength(1);
  });

  it("löscht einen Vermögenswert samt seinen Werten", async () => {
    const nutzer = userEvent.setup();
    await mitGiro(500_00);
    await repo.gegenstandSpeichern({ id: "g1", bezeichnung: "Anteil Werkhof", art: "beteiligung" });
    await repo.wertEintragen({ gegenstandId: "g1", stichtag: "2025-12-31", wert: 8_000_00 }, JETZT);
    rendere(<VermoegenScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/8\.500,00/));

    await nutzer.click(await screen.findByRole("button", { name: t("vermoegen.loeschen", { name: "Anteil Werkhof" }) }));
    const dialog = await screen.findByRole("alertdialog");
    await nutzer.click(within(dialog).getByRole("button", { name: t("loeschen.bestaetigen") }));

    await waitFor(async () => {
      expect(await repo.gegenstaende()).toEqual([]);
      expect(await repo.werte()).toEqual([]);
    });
    // Zurück im leeren Zustand, das Nettovermögen ist wieder das Konto.
    expect(await screen.findByText(t("vermoegen.leer"))).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/8\.500,00/);
  });

  it("löscht eine Schuld samt ihren Restschulden", async () => {
    const nutzer = userEvent.setup();
    await repo.verbindlichkeitSpeichern({ id: "v1", bezeichnung: "Ratenkauf Küche", art: "ratenkredit" });
    await repo.standEintragen({ verbindlichkeitId: "v1", stichtag: "2025-12-31", restschuld: 3_000_00 }, JETZT);
    rendere(<VermoegenScreen />);

    await nutzer.click(await screen.findByRole("button", { name: t("vermoegen.loeschen", { name: "Ratenkauf Küche" }) }));
    const dialog = await screen.findByRole("alertdialog");
    await nutzer.click(within(dialog).getByRole("button", { name: t("loeschen.bestaetigen") }));

    await waitFor(async () => {
      expect(await repo.verbindlichkeiten()).toEqual([]);
      expect(await repo.staende()).toEqual([]);
    });
  });
});

describe("Vermögen — die Tilgung an der Schuld", () => {
  // Zwei Jahresauszüge in der Vergangenheit der echten Uhr: der laufende Monat liegt
  // danach und bekommt die fortgeschriebene Monatstilgung.
  const jahr = new Date().getFullYear();
  const reihe = async () => {
    await repo.standEintragen({ verbindlichkeitId: "v1", stichtag: `${jahr - 2}-12-31`, restschuld: 60_000_00 }, JETZT);
    await repo.standEintragen({ verbindlichkeitId: "v1", stichtag: `${jahr - 1}-12-31`, restschuld: 58_200_00 }, JETZT);
  };
  const tilgungstext = () => t("vermoegen.tilgungImMonat", { betrag: "" }).trim();

  it("zeigt an einer Schuld mit Vertrag die abgeleitete Tilgung im Monat", async () => {
    await repo.verbindlichkeitSpeichern({ id: "v1", bezeichnung: "Darlehen Quellenhof", art: "ratenkredit", vertragId: "vt-1" });
    await reihe();
    rendere(<VermoegenScreen />);

    // 1.800,00 weniger über zwölf Monate: 150,00 im Monat.
    const angabe = await screen.findByText((inhalt) => inhalt.startsWith(tilgungstext()));
    expect(angabe.textContent).toMatch(/150,00/);
  });

  it("zeigt sie nicht, solange die Schuld auf keinen Vertrag verweist", async () => {
    await repo.verbindlichkeitSpeichern({ id: "v1", bezeichnung: "Darlehen Quellenhof", art: "ratenkredit" });
    await reihe();
    rendere(<VermoegenScreen />);

    expect(await screen.findByText("Darlehen Quellenhof")).toBeTruthy();
    expect(screen.queryByText((inhalt) => inhalt.startsWith(tilgungstext()))).toBeNull();
  });
});
