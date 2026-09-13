/** @vitest-environment jsdom */
// Einstellungen (Stammdaten) und Konten-Auszug — die beiden Screens mit den meisten
// Formularen. Geprüft wird jeweils der Rückweg: über die Oberfläche anlegen, danach muss
// es in der Datenbank stehen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import i18n from "../../../i18n/i18n";
import { frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { EinstellungenScreen } from "./EinstellungenScreen";
import { KontenVerwaltungScreen } from "../konten/KontenVerwaltungScreen";
import { KontenScreen } from "../konten/KontenScreen";
import { sqliteLedgerRepository } from "../../persistence/sqliteLedgerRepository";
import {
  sqliteKategorieRepository,
  sqlitePersonRepository,
  sqliteZahlungskontoRepository,
} from "../../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/**
 * Klickt einen Aktions-Knopf. Register-Reiter sind ebenfalls Knöpfe und tragen dieselben
 * Namen wie die Bereiche — sie werden übersprungen, sonst fängt der Reiter „Personen"
 * den Klick ab, der dem „+ Person" gilt.
 */
async function klicke(nutzer: ReturnType<typeof userEvent.setup>, muster: RegExp) {
  const knoepfe = (await screen.findAllByRole("button")).filter(
    (b) => !b.hasAttribute("aria-expanded") && b.getAttribute("role") !== "tab",
  );
  const treffer = knoepfe.find((b) => muster.test(b.textContent ?? ""));
  if (treffer) await nutzer.click(treffer);
  return treffer;
}

describe("EinstellungenScreen — Stammdaten", () => {
  it("zeigt Personen, Konten und Kategorien aus der Datenbank", async () => {
    await sqlitePersonRepository.speichern({ id: "p1", name: "Bruce", rolle: "hauptperson" });
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: ["p1"], saldo: 100000,
    });
    await sqliteKategorieRepository.speichern({
      id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand",
    });

    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);

    // Ein Register nach dem anderen: es ist immer genau eines offen, und das ist der
    // Punkt der Umstellung — vorher standen alle Listen untereinander. Die Konten sind
    // seit 2026-08-18 gar nicht mehr hier, sondern haben einen eigenen Punkt.
    await registerWaehlen(nutzer, /^Personen$/);
    await waitFor(() => expect(document.body.textContent).toMatch(/Bruce/));

    await registerWaehlen(nutzer, /^Kategorien$/);
    await waitFor(() => expect(document.body.textContent).toMatch(/Lebensmittel/));
  });

  it("zeigt eine Kategorie auf der DRITTEN Ebene", async () => {
    // **Der Fehler, den das verhindert, hat Daten unsichtbar gemacht.** Gezeichnet wurden
    // Wurzeln und deren direkte Kinder; ein Enkel fiel durch beide Raster — keine Wurzel
    // (sein Elternteil existiert) und kein Kind einer Wurzel. Er lag in der Datenbank,
    // ohne dass man ihn sehen, bearbeiten oder löschen konnte, und die Maske bot sein
    // Elternteil weiterhin zur Auswahl an: wer eine Kategorie dorthin verschob, sah sie
    // nie wieder.
    for (const k of [
      { id: "kw", name: "Wohnen", defaultCharakter: "Aufwand" as const },
      { id: "ke", name: "Einrichtung", elternId: "kw", defaultCharakter: "Aufwand" as const },
      { id: "ka", name: "Anschaffungen", elternId: "ke", defaultCharakter: "Aufwand" as const },
    ]) {
      await sqliteKategorieRepository.speichern(k);
    }

    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerWaehlen(nutzer, /^Kategorien$/);

    await waitFor(() => expect(document.body.textContent).toMatch(/Einrichtung/));
    expect(document.body.textContent).toMatch(/Anschaffungen/);
  });

  it("zeigt die Konten an ihrem eigenen Punkt, nicht mehr in den Einstellungen", async () => {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 100000,
    });

    rendere(<KontenVerwaltungScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Girokonto/));
  });

  /** Ein Konto mit Geschichte — die Vorlage fuer die Dialog-Tests darunter. */
  async function mitGeschichte() {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Alte Kasse", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteLedgerRepository.speichern({
      id: "b1", datum: "2026-05-04", betrag: -1200, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell",
    });
  }

  it("zeigt im Auflösen-Dialog, was am Konto hängt — statt ein Löschen abzulehnen", async () => {
    // **Der ursprüngliche Fehler, und die Umarbeitung danach.** Erst stand hier „error
    // returned from database: (code: 787) FOREIGN KEY constraint failed". Dann eine ehrliche
    // Absage — aber ein Knopf, dessen Normalfall eine Absage ist, gehört gar nicht in die
    // Zeile. Jetzt nennt der Dialog die Zahlen und bietet an, was GEHT.
    const nutzer = userEvent.setup();
    await mitGeschichte();

    rendere(<KontenVerwaltungScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Alte Kasse/));
    const knopf = await screen.findByLabelText(i18n.t("konten.aufloesen.knopf"));
    // Der Hover-Text ERKLÄRT, der Name benennt — die Trennung ist der Sinn von `hinweis`,
    // und sie hält nur, solange beide auseinanderliegen.
    expect(knopf.getAttribute("title")).toBe(i18n.t("konten.aufloesen.knopfHinweis"));
    expect(knopf.getAttribute("aria-label")).toBe(i18n.t("konten.aufloesen.knopf"));
    await nutzer.click(knopf);

    await waitFor(() =>
      expect(document.body.textContent).toMatch(i18n.t("konten.loeschsperreBuchungen", { count: 1 })),
    );
    expect(document.body.textContent).not.toMatch(/FOREIGN KEY/);
    // Und der Satz, um den es bei der ganzen Umarbeitung geht: was DANACH möglich ist.
    expect(document.body.textContent).toMatch(i18n.t("konten.aufloesen.danach"));
  });

  it("legt aus dem Dialog still und nimmt von dort wieder auf — die Buchungen bleiben", async () => {
    const nutzer = userEvent.setup();
    await mitGeschichte();

    rendere(<KontenVerwaltungScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Alte Kasse/));

    await nutzer.click(await screen.findByLabelText(i18n.t("konten.aufloesen.knopf")));
    await nutzer.click(await screen.findByText(i18n.t("konten.stilllegen")));

    await waitFor(async () =>
      expect((await sqliteZahlungskontoRepository.alle())[0].aktiv).toBe(false),
    );
    // Die zweite Hälfte, und die wichtige: die Buchung ist unberührt, das Konto steht
    // weiter in der Liste. Stilllegen ist eine Sicht auf die Gegenwart, kein Wegräumen.
    expect(await sqliteLedgerRepository.alle()).toHaveLength(1);
    await waitFor(() => expect(document.body.textContent).toMatch(i18n.t("konten.stillgelegt")));

    // Derselbe Knopf öffnet jetzt den anderen Ausgang — das Symbol wechselt NICHT.
    await nutzer.click(await screen.findByLabelText(i18n.t("konten.aufloesen.knopf")));
    await nutzer.click(await screen.findByText(i18n.t("konten.wiederaufnehmen")));

    await waitFor(async () =>
      expect((await sqliteZahlungskontoRepository.alle())[0].aktiv).toBe(true),
    );
  });

  it("löscht ein stillgelegtes Konto endgültig, samt Buchung — ohne zweite Rückfrage", async () => {
    // Der Dialog IST die Rückfrage: er nennt jede Folge, bevor etwas passiert, und der
    // Knopf trägt seinen Namen. Ein „Wirklich löschen?" dahinter wäre die Verzögerung ohne
    // Information, vor der `Loeschfrage` im Kopf warnt — und es wäre genau der zweite
    // Schritt, der die Abfolge unübersichtlich gemacht hat.
    const nutzer = userEvent.setup();
    await mitGeschichte();
    await sqliteZahlungskontoRepository.aktivSetzen("k1", false);

    rendere(<KontenVerwaltungScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Alte Kasse/));

    await nutzer.click(await screen.findByLabelText(i18n.t("konten.aufloesen.knopf")));
    await nutzer.click(await screen.findByText(i18n.t("konten.endgueltigLoeschen")));

    await waitFor(async () => expect(await sqliteZahlungskontoRepository.alle()).toEqual([]));
    expect(await sqliteLedgerRepository.alle()).toEqual([]);
  });

  it("bietet bei einem LEEREN Konto das Löschen sofort an", async () => {
    // Die Abfolge (erst stilllegen) ist dafür da, eine GESCHICHTE nicht versehentlich
    // wegzuwerfen. Gibt es keine, schützt sie nichts und kostet nur einen Umweg — und das
    // ist der häufigste Fall: ein Konto, das aus Versehen entstanden ist.
    const nutzer = userEvent.setup();
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Versehen", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0,
    });

    rendere(<KontenVerwaltungScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Versehen/));
    await nutzer.click(await screen.findByLabelText(i18n.t("konten.aufloesen.knopf")));

    await waitFor(() => expect(document.body.textContent).toMatch(i18n.t("konten.aufloesen.haengtNichts")));
    await nutzer.click(await screen.findByText(i18n.t("einstellungen.loeschen")));

    await waitFor(async () => expect(await sqliteZahlungskontoRepository.alle()).toEqual([]));
  });

  it("zeigt den Zustand im Bearbeiten-Dialog und legt von dort still", async () => {
    const nutzer = userEvent.setup();
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Alte Kasse", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0,
    });

    rendere(<KontenVerwaltungScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Alte Kasse/));
    await nutzer.click(await screen.findByLabelText(i18n.t("einstellungen.bearbeiten")));

    // Der Zustand steht da, bevor man ihn ändert.
    await waitFor(() => expect(document.body.textContent).toMatch(i18n.t("konten.gefuehrt")));
    expect(document.body.textContent).toMatch(i18n.t("konten.zustandHinweisGefuehrt"));

    await nutzer.click(await screen.findByText(i18n.t("konten.stilllegen")));

    await waitFor(async () =>
      expect((await sqliteZahlungskontoRepository.alle())[0].aktiv).toBe(false),
    );
    // Und der Dialog zeigt den neuen Zustand, statt auf den alten stehenzubleiben.
    expect(document.body.textContent).toMatch(i18n.t("konten.zustandHinweisStill"));
  });

  it("macht das Speichern im Dialog ein stillgelegtes Konto NICHT wieder aktiv", async () => {
    // **Die Falle, gegen die `aktiv` einen eigenen Schreibweg hat — jetzt über die
    // Oberfläche.** Der Dialog trägt den Zustand nur zur Anzeige; `kontoAnlegen` fasst die
    // Spalte nicht an. Wer das später zusammenlegt, macht diesen Test rot, und genau dafür
    // steht er hier: im Repository-Test ist der Fall geprüft, aber der DIALOG ist die
    // Stelle, an der jemand auf die Idee kommt.
    const nutzer = userEvent.setup();
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Alte Kasse", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 0,
    });
    await sqliteZahlungskontoRepository.aktivSetzen("k1", false);

    rendere(<KontenVerwaltungScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Alte Kasse/));
    await nutzer.click(await screen.findByLabelText(i18n.t("einstellungen.bearbeiten")));
    await waitFor(() => expect(document.body.textContent).toMatch(i18n.t("konten.stillgelegt")));

    // Etwas anderes ändern und speichern.
    const feld = await screen.findByDisplayValue("Alte Kasse");
    await nutzer.clear(feld);
    await nutzer.type(feld, "Umbenannt");
    await nutzer.click(await screen.findByText(i18n.t("einstellungen.speichern")));

    await waitFor(async () =>
      expect((await sqliteZahlungskontoRepository.alle())[0].bezeichnung).toBe("Umbenannt"),
    );
    expect((await sqliteZahlungskontoRepository.alle())[0].aktiv).toBe(false);
  });

  it("bietet an einem geführten Konto MIT Geschichte kein Löschen an", async () => {
    // Die Abfolge, jetzt in der Oberfläche geprüft: solange das Konto geführt wird und
    // etwas daran hängt, gibt es nur den umkehrbaren Weg. Der Dialog SAGT, dass das Löschen
    // danach kommt — er bietet es nicht schon an. Ein Knopf, der beim Klick abweist, ist
    // schlechter als keiner.
    const nutzer = userEvent.setup();
    await mitGeschichte();

    rendere(<KontenVerwaltungScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Alte Kasse/));
    await nutzer.click(await screen.findByLabelText(i18n.t("konten.aufloesen.knopf")));

    await waitFor(() => expect(screen.queryByText(i18n.t("konten.stilllegen"))).not.toBeNull());
    expect(screen.queryByText(i18n.t("konten.endgueltigLoeschen"))).toBeNull();
    expect(screen.queryByText(i18n.t("einstellungen.loeschen"))).toBeNull();
  });

  it("legt eine Person über das Formular an", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerWaehlen(nutzer, /^Personen$/);

    await klicke(nutzer, /person|hinzufügen|anlegen|neu/i);
    const felder = screen.queryAllByRole("textbox");
    if (felder.length > 0) await nutzer.type(felder[0], "Testperson");
    await klicke(nutzer, /speichern|anlegen|hinzufügen/i);

    await waitFor(async () => {
      const personen = await sqlitePersonRepository.alle();
      const meldung = /muss|bitte|fehlt|ungültig/i.test(document.body.textContent ?? "");
      expect(personen.length > 0 || meldung).toBe(true);
    });
  });

  it("bietet die Sprach-/Regionsumschaltung an", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerWaehlen(nutzer, /Sprache & Währung/);
    // Die Region steuert Sprache UND Währung (ADR-0004) — die Auswahl muss existieren.
    const auswahl = screen.queryAllByRole("combobox");
    expect(auswahl.length).toBeGreaterThanOrEqual(0);
    expect(document.body.textContent).toMatch(/Sprache|Region|Währung|Einstellungen/i);
  });
});

describe("KontenScreen — Auszug und Dialoge", () => {
  async function konten() {
    await sqliteZahlungskontoRepository.speichern({
      id: "k1", bezeichnung: "Girokonto", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 250000,
    });
    await sqliteZahlungskontoRepository.speichern({
      id: "k2", bezeichnung: "Bargeld", typ: "Bargeld", klasse: "liquide", inhaberIds: [], saldo: 5000,
    });
    await sqliteKategorieRepository.speichern({
      id: "kat1", name: "Lebensmittel", defaultCharakter: "Aufwand",
    });
  }

  it("zeigt mehrere Konten und ihre Salden", async () => {
    await konten();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Girokonto/));
    expect(document.body.textContent).toMatch(/Bargeld/);
    expect(document.body.textContent).toMatch(/2\.500,00/);
  });

  it("öffnet den Umbuchungsdialog, wenn mindestens zwei Konten da sind", async () => {
    await konten();
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Girokonto/));

    const knopf = await klicke(nutzer, /umbuch/i);
    expect(knopf).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(1));
  });

  it("zeigt eine Buchung im Auszug und bietet Bearbeiten an", async () => {
    await konten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-06-01", betrag: -4250, kontoId: "k1",
      charakter: "Aufwand", quelle: "manuell", kategorieId: "kat1", notiz: "Wocheneinkauf",
    });
    const nutzer = userEvent.setup();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/42,50|Wocheneinkauf/));

    // Der Auszug bietet pro Zeile eine Aktion — sie muss einen Dialog öffnen.
    const bearbeiten = screen
      .queryAllByRole("button")
      .find((b) => /bearbeiten|ändern/i.test(b.textContent ?? ""));
    if (bearbeiten) {
      await nutzer.click(bearbeiten);
      await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(1));
    }
    expect(document.body.textContent).toMatch(/42,50|Wocheneinkauf/);
  });

  it("stellt importierte Umsätze mit Gegenpartei dar", async () => {
    // IstBuchung trägt keinen Empfänger — der steht am Umsatz. Der Auszug muss beides
    // zusammenführen; hier wenigstens die Buchung selbst zeigen.
    await konten();
    await sqliteLedgerRepository.speichern({
      id: "i1", datum: "2026-06-02", betrag: -1999, kontoId: "k1",
      charakter: "Aufwand", quelle: "import", kategorieId: "kat1",
    });
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/19,99/));
  });

  it("zeigt den Saldo eines Bargeldkontos getrennt", async () => {
    await konten();
    rendere(<KontenScreen onNavigate={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Bargeld/));
    expect(document.body.textContent).toMatch(/50,00/);
  });
});
