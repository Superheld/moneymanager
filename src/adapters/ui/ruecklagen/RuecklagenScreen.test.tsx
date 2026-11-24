/** @vitest-environment jsdom */
// Die Bedienpfade der Rücklagen: bearbeiten, ausbuchen, löschen.
//
// Das reine Anzeigen war abgedeckt, die Wege dahin nicht — und dort sitzt die Fachlogik,
// die bei einem Fehler still das Falsche tut: „bearbeiten" darf keine ZWEITE Rücklage
// anlegen, und „ausgebucht" startet den Zyklus neu, statt nur ein Datum zu ändern.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { RuecklagenScreen } from "./RuecklagenScreen";
import { sqliteRuecklagenRepository } from "../../persistence/sqliteRuecklagenRepository";
import { planzahlungSpeichern } from "../../../testwerkzeug/planzahlung";

let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/**
 * Legt eine Rücklage mit Ziel und Frist an und wartet, bis der Screen sie zeigt. `ohneKategorie`
 * baut den Altbestand von vor der Umstellung — nur der wird seit Paket 5 noch ausgebucht.
 */
async function mitRuecklage(bezeichnung: string, ziel: number, frist: number, ohneKategorie = false) {
  await sqliteRuecklagenRepository.speichern({
    id: `rue-${bezeichnung}`,
    bezeichnung,
    beginn: "2024-03-01",
    ziel,
    fristMonate: frist,
    kategorieId: ohneKategorie ? undefined : "kat-tellwick",
  });
  rendere(<RuecklagenScreen />);
  await waitFor(() => expect(document.body.textContent).toMatch(bezeichnung));
}

describe("Rücklagen — bearbeiten", () => {
  it("übernimmt die Änderung am selben Gegenstand, statt einen zweiten anzulegen", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Trockner", 60000, 120);

    await nutzer.click(screen.getByRole("button", { name: "bearbeiten" }));

    // Der Dialog kommt vorbelegt — sonst überschriebe ein Speichern die Felder mit Leere.
    const felder = await screen.findAllByRole("textbox");
    expect((felder[0] as HTMLInputElement).value).toBe("Trockner");

    await nutzer.clear(felder[0]);
    await nutzer.type(felder[0], "Trockner (Ersatzgerät)");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      const alle = await sqliteRuecklagenRepository.alle();
      expect(alle).toHaveLength(1);
      expect(alle[0].bezeichnung).toBe("Trockner (Ersatzgerät)");
      expect(alle[0].id).toBe("rue-Trockner");
    });
  });
});

describe("Rücklagen — ausbuchen (Altbestand ohne Kategorie)", () => {
  it("startet den Zyklus neu und zieht das Ziel nach", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Rasenmaeher", 40000, 96, true);

    await nutzer.click(screen.getByRole("button", { name: "ausgebucht" }));

    // Der Dialog schlägt das bisherige Ziel vor; hier wird es erhöht (Preise steigen).
    const ziel = await screen.findByLabelText(/^Ziel/);
    await nutzer.clear(ziel);
    await nutzer.type(ziel, "520");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.alle();
      expect(r.ziel).toBe(52000);
      // Der Zyklus beginnt neu: der Beginn ist nicht mehr der alte Tag.
      expect(r.beginn).not.toBe("2024-03-01");
    });
  });

  it("meldet ein unbrauchbares Ziel, statt es zu speichern", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Werkbank", 30000, 60, true);

    await nutzer.click(screen.getByRole("button", { name: "ausgebucht" }));
    const ziel = await screen.findByLabelText(/^Ziel/);
    await nutzer.clear(ziel);
    await nutzer.type(ziel, "0");
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    // Der Fehler steht am Dialog, und der Bestand ist unangetastet.
    await waitFor(() => expect(document.querySelector(".err")).not.toBeNull());
    const [r] = await sqliteRuecklagenRepository.alle();
    expect(r.ziel).toBe(30000);
    expect(r.beginn).toBe("2024-03-01");
  });

  /**
   * Die freie Rücklage ist der andere Ausgang derselben Handlung — und der Grund,
   * warum es kein Feld „wiederkehrend" gibt: die Form entscheidet.
   */
  it("beendet eine freie Rücklage, statt sie neu zu starten", async () => {
    const nutzer = userEvent.setup();
    await sqliteRuecklagenRepository.speichern({
      id: "rue-frei", bezeichnung: "Urlaubskasse", beginn: "2024-03-01", rate: 5000,
    });
    rendere(<RuecklagenScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch("Urlaubskasse"));

    await nutzer.click(screen.getByRole("button", { name: "ausgebucht" }));
    // Ohne Ziel gibt es auch kein Zielfeld im Dialog.
    expect(screen.queryByLabelText(/^Ziel/)).toBeNull();
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(async () => {
      expect(await sqliteRuecklagenRepository.alle()).toHaveLength(0);
    });
    // Was sie gekostet hat, bleibt trotzdem festgehalten.
    expect(await sqliteRuecklagenRepository.ausbuchungen()).toHaveLength(1);
  });
});

/** Der Tag `tag` im Monat, `n` Monate von heute versetzt — der Screen liest die Uhr selbst. */
function tagVersetzt(n: number, tag = 1): string {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

/**
 * Eine Rücklage MIT Kategorie wird abgeschlossen, nicht ausgebucht (Paket 5): keine
 * Buchungswahl, der Dialog zeigt, was frei wird, und lässt neu beginnen oder beenden.
 * Erfunden: frei 100,00 im Monat seit drei Monaten, im Vormonat 150,00 über die Kategorie
 * getragen → angespart 300,00, frei 150,00.
 */
describe("Rücklagen — abschliessen", () => {
  async function bestand() {
    const { sqliteLedgerRepository } = await import("../../persistence/sqliteLedgerRepository");
    const { sqliteKategorieRepository, sqliteZahlungskontoRepository } = await import("../../persistence/sqliteStammdatenRepositories");
    await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 100000 });
    await sqliteKategorieRepository.speichern({ id: "kat-drav", name: "Dravunel", defaultCharakter: "Aufwand" });
    await sqliteRuecklagenRepository.speichern({
      id: "rue-drav", bezeichnung: "Quenvala", kategorieId: "kat-drav", art: "abschliessend", kontoId: "giro",
      beginn: tagVersetzt(-3), findetAb: tagVersetzt(-3),
    });
    await sqliteRuecklagenRepository.rateSpeichern("rue-drav", { abMonat: tagVersetzt(-3).slice(0, 7), betrag: 10000 });
    await sqliteLedgerRepository.speichern({
      id: "b-drav", datum: tagVersetzt(-1, 10), betrag: -15000, kontoId: "giro", charakter: "Aufwand",
      quelle: "manuell", kategorieId: "kat-drav", notiz: "Lirvasko",
    });
    rendere(<RuecklagenScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch("Quenvala"));
  }

  it("zeigt den Rest, beendet ohne Buchungswahl und führt den Abschluss mit dem Freigewordenen", async () => {
    const { default: i18n } = await import("../../../i18n/i18n");
    const nutzer = userEvent.setup();
    await bestand();

    await nutzer.click(screen.getByRole("button", { name: i18n.t("ruecklagen.abschliessen") }));
    const dialog = await screen.findByRole("dialog");
    // Keine Buchungswahl: das Feld „Buchung" des Ausbuchens steht hier nicht.
    expect(within(dialog).queryByLabelText(i18n.t("ruecklagen.feldAusBuchung"))).toBeNull();
    expect(dialog.textContent).toMatch(/300,00/);
    expect(dialog.textContent).toMatch(/150,00/);
    // Eine freie Rate ist mit „beenden" vorbelegt — wie das Ausbuchen bis Paket 4.
    await nutzer.click(within(dialog).getByRole("button", { name: i18n.t("ruecklagen.abschliessen") }));

    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.beendete();
      expect(r?.id).toBe("rue-drav");
    });
    // Aufgezeichnet ohne Buchung und ohne Betrag — gebucht wird nichts.
    const [a] = await sqliteRuecklagenRepository.ausbuchungen();
    expect(a).toMatchObject({ ruecklageId: "rue-drav", betrag: 0 });
    expect(a.istbuchungId).toBeUndefined();

    const pille = await screen.findByText(i18n.t("ruecklagen.pillBeendet"));
    const zeile = pille.closest("tr") as HTMLElement;
    expect(zeile.textContent).toContain("Quenvala");
    // Angespart 300,00, getragen 150,00, frei geworden 150,00, nichts ungedeckt.
    expect(zeile.textContent).toMatch(/300,00/);
    expect(zeile.textContent).toMatch(/150,00/);
    expect(document.body.textContent).toContain(i18n.t("ruecklagen.geschichteFrei"));
  });

  it("beginnt auf Wunsch neu — der Anspruch fällt auf den neuen Zyklus", async () => {
    const { default: i18n } = await import("../../../i18n/i18n");
    const { auswahlWaehlen } = await import("../../../testwerkzeug/harness");
    const nutzer = userEvent.setup();
    await bestand();

    await nutzer.click(screen.getByRole("button", { name: i18n.t("ruecklagen.abschliessen") }));
    const dialog = await screen.findByRole("dialog");
    await auswahlWaehlen(nutzer, i18n.t("ruecklagen.feldFolge"), i18n.t("ruecklagen.folge.neu"), within(dialog));
    await nutzer.click(within(dialog).getByRole("button", { name: i18n.t("ruecklagen.abschliessen") }));

    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.alle();
      expect(r.beginn).not.toBe(tagVersetzt(-3));
    });
    expect(await sqliteRuecklagenRepository.beendete()).toHaveLength(0);
  });
});

describe("Rücklagen — löschen", () => {
  /**
   * Die eigentliche Zusage der Rückfrage — und die einzige, die man testen muss: dass
   * Abbrechen NICHTS tut. Ein Dialog, der aufgeht und trotzdem löscht, wäre schlimmer
   * als gar keiner, weil er Sicherheit vortäuscht.
   */
  it("löscht nicht, wenn die Rückfrage abgebrochen wird", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Naehmaschine", 25000, 84);

    await nutzer.click(screen.getByRole("button", { name: "löschen" }));
    await nutzer.click(await screen.findByRole("button", { name: "Abbrechen" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Endgültig löschen" })).toBeNull();
    });
    expect(await sqliteRuecklagenRepository.alle()).toHaveLength(1);
  });

  it("entfernt die Rücklage aus dem Bestand", async () => {
    const nutzer = userEvent.setup();
    await mitRuecklage("Naehmaschine", 25000, 84);

    await nutzer.click(screen.getByRole("button", { name: "löschen" }));
    // Seit 2026-08-27 fragt jeder Löschweg nach — bestätigen gehört jetzt dazu.
    await nutzer.click(await screen.findByRole("button", { name: "Endgültig löschen" }));

    await waitFor(async () => {
      expect(await sqliteRuecklagenRepository.alle()).toHaveLength(0);
    });
  });
});

/**
 * „Diesen Monat" zählt, was auf den Rücklagenkonten EINGEHT, und zeigt die Buchungen
 * dazu — bis 2026-11-08 stand dort „geflossen", und woraus die Zahl bestand, stand
 * nirgends. Daneben misst der Tacho den Stand der Rücklagenkonten an der Faustformel.
 */
describe("Rücklagen — diesen Monat und die Faustformel", () => {
  it("zählt Umbuchung und Zinsen als eingegangen und misst den Stand an der Faustformel", async () => {
    const { sqliteZahlungskontoRepository } = await import("../../persistence/sqliteStammdatenRepositories");
    const { sqliteLedgerRepository } = await import("../../persistence/sqliteLedgerRepository");
    const { sqliteVertragRepository } = await import("../../persistence/sqliteVertragRepository");
    const n = new Date();
    const tag = (d: number) => `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
    await sqliteZahlungskontoRepository.speichern({ id: "tg", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 100000 });
    // Die Faustformel braucht Vertragseinnahmen: 1.000,00 im Monat → 3.000,00.
    await sqliteVertragRepository.speichern({ id: "v1", anbieter: "Arbeitgeber", beginn: "2024-01-01", verlaengerung: "keine" });
    await planzahlungSpeichern({
      id: "r1", bezeichnung: "Gehalt", betrag: 100000, rhythmus: "monatlich", startdatum: "2024-01-01",
      charakter: "Ertrag", kontoId: "giro", vertragId: "v1",
    });
    await sqliteLedgerRepository.speichern({
      id: "ab", datum: tag(1), betrag: -20000, kontoId: "giro", charakter: "Umschichtung", quelle: "manuell",
      transferId: "t1", gegenkontoId: "tg",
    });
    await sqliteLedgerRepository.speichern({
      id: "zu", datum: tag(1), betrag: 20000, kontoId: "tg", charakter: "Umschichtung", quelle: "manuell",
      transferId: "t1", gegenkontoId: "giro",
    });
    await sqliteLedgerRepository.speichern({
      id: "zins", datum: tag(1), betrag: 312, kontoId: "tg", charakter: "Ertrag", quelle: "manuell",
    });

    await mitRuecklage("Waschmaschine", 60000, 12);

    // 200,00 Umbuchung + 3,12 Zinsen — das Paar zählt einmal, die Zinsen zählen mit.
    await waitFor(() => expect(document.body.textContent).toMatch(/203,12/));
    expect(document.body.textContent).toMatch(/eingegangen/);
    expect(document.body.textContent).toMatch(/von Girokonto/);
    expect(document.body.textContent).toMatch(/Zinsen oder Gutschrift/);
    // Stand 1.000,00 + 203,12 = 1.203,12 gegen 3.000,00 → 40 %, es fehlen 1.796,88.
    expect(document.body.textContent).toMatch(/40 %/);
    expect(document.body.textContent).toMatch(/1\.796,88/);
  });

  it("misst den Stand eines Kontos, auf dem eine Rücklage liegt, auch wenn es nicht als Rücklage eingestuft ist", async () => {
    // Der Tacho stand bis 2026-11-09 auf null, sobald die Rücklagen auf einem Konto der
    // Klasse „Sparen" lagen — die Zuordnung an der Rücklage zählte nicht.
    const { sqliteZahlungskontoRepository } = await import("../../persistence/sqliteStammdatenRepositories");
    const { sqliteVertragRepository } = await import("../../persistence/sqliteVertragRepository");
    await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
    await sqliteZahlungskontoRepository.speichern({ id: "spar", bezeichnung: "Sparkonto", typ: "Tagesgeld", klasse: "sparen", inhaberIds: [], saldo: 150000 });
    await sqliteVertragRepository.speichern({ id: "v1", anbieter: "Arbeitgeber", beginn: "2024-01-01", verlaengerung: "keine" });
    await planzahlungSpeichern({
      id: "r1", bezeichnung: "Gehalt", betrag: 100000, rhythmus: "monatlich", startdatum: "2024-01-01",
      charakter: "Ertrag", kontoId: "giro", vertragId: "v1",
    });
    await sqliteRuecklagenRepository.speichern({ id: "rk", bezeichnung: "Puffer", rate: 5000, beginn: "2026-01-01", kontoId: "spar" });
    rendere(<RuecklagenScreen />);
    // 1.500,00 gegen 3.000,00 → 50 %.
    await waitFor(() => expect(document.body.textContent).toMatch(/50 %/));
    expect(document.body.textContent).toMatch(/1\.500,00/);
  });

  it("steht auch ohne Vertragseinnahmen da und sagt, warum es keinen Zeiger hat", async () => {
    // Bis 2026-11-11 fehlte die Karte dann ganz — und das sah aus wie ein Fehler.
    const { default: i18n } = await import("../../../i18n/i18n");
    const { sqliteZahlungskontoRepository } = await import("../../persistence/sqliteStammdatenRepositories");
    await sqliteZahlungskontoRepository.speichern({ id: "tg", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 42000 });
    rendere(<RuecklagenScreen />);
    expect(await screen.findByRole("img", { name: i18n.t("ruecklagen.tachoOhneMassstabAria") })).toBeInTheDocument();
    expect(document.body.textContent).toContain(i18n.t("ruecklagen.mindestTitel"));
    // Der Stand der Rücklagenkonten steht im Hinweis.
    expect(document.body.textContent).toMatch(/420,00/);
  });
});

/**
 * Seit Migration 76 bleibt eine freie Rücklage nach dem Ausbuchen stehen — zu sehen war
 * sie danach nirgends. Die Geschichte unter der Liste zeigt sie, mit der Ausbuchung, die
 * sie beendet hat, und führt in die Buchung, wenn eine dranhängt.
 */
describe("Rücklagen — die Geschichte", () => {
  it("zeigt eine eben beendete Rücklage als beendet, ohne Weg in eine Buchung", async () => {
    const { default: i18n } = await import("../../../i18n/i18n");
    const nutzer = userEvent.setup();
    await sqliteRuecklagenRepository.speichern({
      id: "rue-wendler", bezeichnung: "Wendlinger", beginn: "2024-03-01", rate: 3000,
    });
    rendere(<RuecklagenScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch("Wendlinger"));

    await nutzer.click(screen.getByRole("button", { name: "ausgebucht" }));
    await nutzer.click(screen.getByRole("button", { name: /^speichern$/i }));

    // Bis ins Schema: beendet, nicht gelöscht, und über den eigenen Leseweg zu finden.
    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.beendete();
      expect(r?.id).toBe("rue-wendler");
    });
    expect(await sqliteRuecklagenRepository.alle()).toHaveLength(0);

    expect(await screen.findByText(i18n.t("ruecklagen.ausbuchungenTitel"))).toBeInTheDocument();
    const pille = await screen.findByText(i18n.t("ruecklagen.pillBeendet"));
    const zeile = pille.closest("tr") as HTMLElement;
    expect(zeile.textContent).toContain("Wendlinger");
    // Keine Buchung dran: die Zeile ist Text, nicht anklickbar und nicht im Tab-Fluss.
    expect(zeile.getAttribute("tabindex")).toBeNull();
  });

  it("öffnet aus der Zeile die verknüpfte Buchung und nennt, was ungedeckt war", async () => {
    const { default: i18n } = await import("../../../i18n/i18n");
    const { sqliteLedgerRepository } = await import("../../persistence/sqliteLedgerRepository");
    const { sqliteZahlungskontoRepository } = await import("../../persistence/sqliteStammdatenRepositories");
    const nutzer = userEvent.setup();
    await sqliteZahlungskontoRepository.speichern({ id: "giro", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 });
    await sqliteLedgerRepository.speichern({
      id: "b-ortlieb", datum: "2025-04-02", betrag: -21000, kontoId: "giro", charakter: "Aufwand",
      quelle: "manuell", notiz: "Ortlieb", budgetrelevant: false,
    });
    // Frei, 40,00 im Monat seit Januar, ausgebucht Anfang April: 120,00 angespart,
    // die Buchung über 210,00 lässt 90,00 ungedeckt.
    await sqliteRuecklagenRepository.speichern({
      id: "rue-ortlieb", bezeichnung: "Gessnitz", beginn: "2025-01-01", rate: 4000, beendetAm: "2025-04-01",
    });
    await sqliteRuecklagenRepository.ausbuchungSpeichern({
      id: "a-ortlieb", ruecklageId: "rue-ortlieb", datum: "2025-04-01", betrag: 0, istbuchungId: "b-ortlieb",
      zyklusBeginn: "2025-01-01", zyklusRate: 4000,
    });
    rendere(<RuecklagenScreen />);

    const pille = await screen.findByText(i18n.t("ruecklagen.pillBeendet"));
    const zeile = pille.closest("tr") as HTMLElement;
    expect(zeile.textContent).toContain("Gessnitz");
    expect(zeile.textContent).toContain("Ortlieb");
    expect(zeile.textContent).toMatch(/120,00/);
    expect(zeile.textContent).toMatch(/90,00/);
    expect(zeile.textContent).toMatch(/210,00/);
    expect(zeile.getAttribute("tabindex")).toBe("0");

    await nutzer.click(zeile);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Ortlieb");
  });
});
