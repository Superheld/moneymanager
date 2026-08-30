/** @vitest-environment jsdom */
// Die vier Karten der automatischen Kategorisierung — von der Oberfläche bis ins Schema.
//
// Geprüft werden die Zahlen und die Wege, nicht die Formulierungen: wie viele Beispiele
// aus dem Bestand entstehen, was ein abgeschaltetes Feld bewirkt, ob ein ausgeschlossenes
// Wort tatsächlich aus dem Vokabular verschwindet, und ob das alles die Datenbank
// erreicht.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { auswahlWaehlen, frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { TrainingBereich } from "./TrainingBereich";
import { sqliteMerkmalskonfigurationRepository as merkmalRepo } from "../../persistence/sqliteMerkmalskonfigurationRepository";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Eine verbuchte Zahlung: Ist-Buchung plus der Umsatz, der Empfänger und Zweck trägt. */
function buchung(o: {
  id: string;
  betrag: number;
  kategorieId?: string;
  charakter?: string;
  gegenpartei?: string;
  zweck?: string;
}) {
  db.run(
    `INSERT INTO ist_buchung (id, datum, betrag, konto_id, kategorie_id, charakter, quelle)
     VALUES ($id, '2026-03-01', $betrag, 'k1', $kat, $char, 'import')`,
    { $id: o.id, $betrag: o.betrag, $kat: o.kategorieId ?? null, $char: o.charakter ?? "Aufwand" },
  );
  // Beleg und Verarbeitungsstand stehen seit dem Umbau getrennt.
  db.run(
    `INSERT INTO umsatz_roh (id, lauf_id, buchungstag, betrag, waehrung,
                             gegenpartei, verwendungszweck, roh_hash)
     VALUES ($uid, 'l1', '2026-03-01', $betrag, 'EUR', $gp, $zweck, $hash)`,
    {
      $uid: `u-${o.id}`, $betrag: o.betrag, $gp: o.gegenpartei ?? "REWE Markt",
      $zweck: o.zweck ?? "Einkauf", $hash: `h-${o.id}`,
    },
  );
  db.run(
    `INSERT INTO umsatz_verarbeitung (umsatz_id, zahlungskonto_id, status, istbuchung_id, geaendert_am)
     VALUES ($uid, 'k1', 'verbucht', $id, '2026-03-01T00:00:00.000Z')`,
    { $uid: `u-${o.id}`, $id: o.id },
  );
}

function kategorie(id: string, name: string) {
  db.run("INSERT INTO kategorie (id, name, default_charakter) VALUES ($id, $name, 'Aufwand')", {
    $id: id, $name: name,
  });
}

/** Genug klar trennbares Material, damit gemessen und trainiert werden kann. */
function material(n = 40) {
  kategorie("kat-lm", "Lebensmittel");
  kategorie("kat-sprit", "Sprit & Laden");
  for (let i = 0; i < n; i++) {
    buchung({ id: `r${i}`, betrag: -1234, kategorieId: "kat-lm", gegenpartei: "Kesselmann Markt", zweck: "Einkauf Lebensmittel" });
    buchung({ id: `s${i}`, betrag: -6000, kategorieId: "kat-sprit", gegenpartei: "Vibora Station", zweck: "Tanken Diesel" });
  }
}

const KARTEN = {
  daten: /1 · Trainingsdaten/,
  woerter: /2 · Wörter/,
  modell: /3 · Erkennungsmodell/,
  abgleich: /4 · Bestand abgleichen/,
} as const;

/**
 * Wählt eines der vier Register und wartet, bis der gemeinsame Ladevorgang durch ist.
 * Der läuft beim Betreten des Bereichs; die Register selbst hängen nur den jeweiligen
 * Inhalt in den Baum.
 */
async function oeffne(nutzer: ReturnType<typeof userEvent.setup>, karte: RegExp) {
  await nutzer.click(await screen.findByRole("tab", { name: karte }));
  await waitFor(() => expect(screen.queryAllByText("…")).toHaveLength(0));
}

/**
 * Der Inhalt des offenen Registers. Seit der Umstellung auf Register ist immer genau
 * eines im Baum — die Einschränkung auf „diese eine Karte" ist damit das Panel selbst.
 * Das Argument bleibt in der Signatur, damit an den Aufrufstellen lesbar steht, welcher
 * Bereich gemeint ist.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function karteninhalt(_karte: RegExp): HTMLElement {
  return screen.getByRole("tabpanel") as HTMLElement;
}

describe("1 · Trainingsdaten", () => {
  it("zählt brauchbare Beispiele und belegte Kategorien", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.daten);

    expect(screen.getByText("Brauchbare Beispiele")).toBeTruthy();
    expect(screen.getByText("von 4 gebuchten Zahlungen")).toBeTruthy();
  });

  it("nennt Umschichtungen als Ausschlussgrund", async () => {
    kategorie("kat-lm", "Lebensmittel");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });
    buchung({ id: "b2", betrag: -500, charakter: "Umschichtung" });
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.daten);

    expect(screen.getByText(/Umschichtung — eigenes Geld/)).toBeTruthy();
  });

  it("warnt vor Kategorien mit zu wenig Material und nennt sie beim Namen", async () => {
    kategorie("kat-lm", "Lebensmittel");
    kategorie("kat-selten", "Seltene Sache");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });
    buchung({ id: "b2", betrag: -999, kategorieId: "kat-selten", gegenpartei: "Kuriosum" });
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.daten);

    expect(
      screen.getAllByText((_, el) => !!el && /Seltene Sache · 1/.test(el.textContent ?? "")).length,
    ).toBeGreaterThan(0);
  });

  it("sagt es, wenn es gar nichts zu lernen gibt", async () => {
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.daten);
    expect(screen.getByText(/Noch keine gebuchten Zahlungen/)).toBeTruthy();
  });
});

describe("2 · Wörter — die Quellen", () => {
  it("führt die Quellen mit Klartext-Namen", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    // `emp=` und `emp:` sind aus dem Präfix nicht zu erraten — sie brauchen Namen.
    expect(screen.getAllByText("Empfänger, ganz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Empfänger, einzelne Wörter").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Verwendungszweck").length).toBeGreaterThan(0);
  });

  it("schaltet eine Quelle ab und schreibt das in die Datenbank", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    await nutzer.click(
      within(karteninhalt(KARTEN.woerter)).getByRole("checkbox", { name: /Verwendungszweck/ }),
    );

    await waitFor(async () => {
      expect(await merkmalRepo.herkuenfteLesen()).not.toContain("vwz");
    });
  });

  it("eine abgeschaltete Quelle verschwindet aus dem Wortbestand", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    // Über den Herkunftsfilter statt über den Token-Text: die Liste zeigt das WORT und
    // die Herkunft in getrennten Spalten, ein „vwz:einkauf" steht nirgends mehr.
    await auswahlWaehlen(nutzer, "gilt", "Verwendungszweck");
    await waitFor(() =>
      expect(within(karteninhalt(KARTEN.woerter)).queryByText("Kein Wort passt zu dieser Suche.")).toBeNull(),
    );

    await nutzer.click(
      within(karteninhalt(KARTEN.woerter)).getByRole("checkbox", { name: /Verwendungszweck/ }),
    );

    // Die Karte rechnet nach dem Schalten neu — die Merkmale dürfen nicht stehen bleiben.
    await waitFor(() =>
      expect(within(karteninhalt(KARTEN.woerter)).getByText("Kein Wort passt zu dieser Suche.")).toBeTruthy(),
    );
  });

  it("stellt die vier Maße nebeneinander — zwei in der Liste, zwei am gewählten Wort", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    // Ohne Zahlen neben dem Wort wäre das Ausschließen ein Ratespiel — und die
    // Trennschärfe allein führt in die Irre, weil sie das Seltene überschätzt.
    const inhalt = karteninhalt(KARTEN.woerter);
    expect(within(inhalt).getByText("Belege")).toBeTruthy();
    expect(within(inhalt).getByText("Trennkraft")).toBeTruthy();
    expect(within(inhalt).getByText("kesselmann markt")).toBeTruthy();

    // Deckung und Trennschärfe braucht man beim Beurteilen EINER Zeile, nicht beim
    // Überfliegen — sie stehen deshalb im Detail und nicht in einer zehnten Spalte.
    await nutzer.click(within(inhalt).getByText("kesselmann markt"));
    await waitFor(() => {
      const jetzt = karteninhalt(KARTEN.woerter);
      expect(within(jetzt).getByText("Deckung")).toBeTruthy();
      expect(within(jetzt).getByText("Trennschärfe")).toBeTruthy();
    });
  });

  it("blendet die mitgelieferten Wörter aus, bis man sie anfordert", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    // Über hundert Stoppwörter, die niemand gesetzt hat, füllen sonst jede Seite und
    // schieben die eigenen Entscheidungen nach hinten.
    const inhalt = karteninhalt(KARTEN.woerter);
    await nutzer.type(within(inhalt).getByPlaceholderText("Wort eingeben …"), "einer");
    await waitFor(() =>
      expect(within(karteninhalt(KARTEN.woerter)).getByText("Kein Wort passt zu dieser Suche.")).toBeTruthy(),
    );

    await nutzer.click(within(karteninhalt(KARTEN.woerter)).getByRole("checkbox", { name: /mitgelieferte/ }));
    await waitFor(() =>
      expect(within(karteninhalt(KARTEN.woerter)).getByText("einer")).toBeTruthy(),
    );
  });

  it("holt eine gelöschte Grundausstattung zurück, ohne Eigenes anzufassen", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    // Ein eigenes Wort setzen, dann ein mitgeliefertes entfernen.
    const inhalt = karteninhalt(KARTEN.woerter);
    await nutzer.type(within(inhalt).getByPlaceholderText("z. B. kdn"), "eigenwort");
    await nutzer.click(within(inhalt).getByRole("button", { name: /Wort sperren/ }));
    await waitFor(async () =>
      expect((await merkmalRepo.ausschluesseLesen()).map((a) => a.wort)).toContain("eigenwort"),
    );
    await merkmalRepo.ausschlussEntfernen("sepa");

    await nutzer.click(
      within(karteninhalt(KARTEN.woerter)).getByRole("button", { name: /Grundausstattung/ }),
    );

    await waitFor(async () => {
      const liste = await merkmalRepo.ausschluesseLesen();
      expect(liste.map((a) => a.wort)).toContain("sepa");
      // Das eigene Wort behält seine Quelle — sonst fiele es beim nächsten Ausblenden
      // aus der eigenen Liste heraus.
      expect(liste.find((a) => a.wort === "eigenwort")?.quelle).toBe("manuell");
    });
  });

  it("schließt ein Wort aus der Liste heraus aus — in seiner Quelle", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    const zeile = screen.getByText("einkauf").closest("tr")!;
    await nutzer.click(within(zeile).getByRole("button", { name: "ausschließen" }));

    await waitFor(async () => {
      const [a] = (await merkmalRepo.ausschluesseLesen()).filter((x) => x.wort === "einkauf");
      expect(a?.herkuenfte).toEqual(["vwz"]);
    });
  });

  it("lässt das abgewählte Wort stehen und wechselt seinen Zustand", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    // Der Kern der Umstellung: vorher verschwand das Wort hier und tauchte auf einer
    // anderen Karte wieder auf — ohne die Zahlen, an denen die Entscheidung gerade hing.
    const zeile = screen.getByText("einkauf").closest("tr")!;
    await nutzer.click(within(zeile).getByRole("button", { name: "ausschließen" }));

    await waitFor(() => {
      const neueZeile = screen.getByText("einkauf").closest("tr")!;
      expect(within(neueZeile).getByText("gesperrt")).toBeTruthy();
      expect(within(neueZeile).getByRole("button", { name: "zulassen" })).toBeTruthy();
    });
  });

  it("zeigt einem gesperrten Wort weiter an, was es brächte", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    const zeile = screen.getByText("einkauf").closest("tr")!;
    const belege = within(zeile).getAllByText("2")[0];
    expect(belege).toBeTruthy();
    await nutzer.click(within(zeile).getByRole("button", { name: "ausschließen" }));

    // Die Belege bleiben stehen — sonst ist ein Ausschluss nicht mehr zu beurteilen,
    // ohne ihn erst zurückzunehmen.
    await waitFor(() => {
      const neueZeile = screen.getByText("einkauf").closest("tr")!;
      expect(within(neueZeile).getAllByText("2").length).toBeGreaterThan(0);
    });
  });

  it("zeigt auf Klick, in welchen Kategorien ein Wort steckt", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    await nutzer.click(screen.getByText("kesselmann markt"));

    await waitFor(() =>
      expect(within(karteninhalt(KARTEN.woerter)).getByText(/Verteilung über \d+ Kategorien/)).toBeTruthy(),
    );
    expect(within(karteninhalt(KARTEN.woerter)).getAllByText("Lebensmittel").length).toBeGreaterThan(0);
  });

  it("sucht im ganzen Bestand, nicht nur in den häufigsten", async () => {
    material(2);
    // Ein Wort, das genau einmal vorkommt und damit früher nie in die Liste kam.
    buchung({ id: "sel", betrag: -900, kategorieId: "kat-lm", gegenpartei: "Ohlert", zweck: "Sonderposten" });
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    await nutzer.type(
      within(karteninhalt(KARTEN.woerter)).getByPlaceholderText("Wort eingeben …"),
      "sonderposten",
    );

    await waitFor(() =>
      expect(within(karteninhalt(KARTEN.woerter)).getByText("sonderposten")).toBeTruthy(),
    );
  });

  it("misst auf Anforderung, was jede Quelle beiträgt", async () => {
    material();
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    await nutzer.click(within(karteninhalt(KARTEN.woerter)).getByRole("button", { name: "Wirkung messen" }));

    await waitFor(() => expect(screen.getByText(/Mit allen aktiven Quellen:/)).toBeTruthy(), { timeout: 20000 });
  }, 30000);
});

describe("2 · Wörter — der Bestand", () => {
  it("legt beim ersten Öffnen die mitgelieferte Liste an", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    // Die Stoppwörter liegen ab jetzt in der Datenbank — nur so ist eines löschbar.
    const woerter = (await merkmalRepo.ausschluesseLesen()).map((a) => a.wort);
    expect(woerter).toContain("sepa");
    // Und sie stehen sichtbar im Bestand, auch die, die hier auf nichts wirken.
    expect(within(karteninhalt(KARTEN.woerter)).getAllByText("gesperrt").length).toBeGreaterThan(0);
  });

  it("nimmt ein Wort über das Formular auf", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    const inhalt = karteninhalt(KARTEN.woerter);
    await nutzer.type(within(inhalt).getByPlaceholderText("z. B. kdn"), "einkauf");
    await nutzer.click(within(inhalt).getByRole("button", { name: /Wort sperren/ }));

    await waitFor(async () => {
      const a = (await merkmalRepo.ausschluesseLesen()).find((x) => x.wort === "einkauf");
      expect(a?.quelle).toBe("manuell");
      expect(a?.herkuenfte).toBeUndefined(); // „überall"
    });
  });

  it("nimmt ein Wort wieder ins Training auf", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    // Ein eigenes Wort statt eines mitgelieferten: welcher Standardeintrag auf Seite
    // eins landet, ist keine Eigenschaft, an der ein Test hängen sollte.
    const inhalt = karteninhalt(KARTEN.woerter);
    await nutzer.type(within(inhalt).getByPlaceholderText("z. B. kdn"), "aaatestwort");
    await nutzer.click(within(inhalt).getByRole("button", { name: /Wort sperren/ }));
    await waitFor(() => expect(screen.getAllByText("aaatestwort").length).toBeGreaterThan(0));

    const zeile = screen.getAllByText("aaatestwort")[0].closest("tr")!;
    await nutzer.click(within(zeile).getByRole("button", { name: "zulassen" }));

    await waitFor(async () => {
      expect((await merkmalRepo.ausschluesseLesen()).map((a) => a.wort)).not.toContain("aaatestwort");
    });
  });

  it("unterscheidet mitgelieferte von selbst gesetzten Einträgen", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    const inhalt = karteninhalt(KARTEN.woerter);
    await nutzer.type(within(inhalt).getByPlaceholderText("z. B. kdn"), "eigenwort");
    await nutzer.click(within(inhalt).getByRole("button", { name: /Wort sperren/ }));

    // Nach dem Eintragen steht die Liste auf dem neuen Wort — sonst läge es hinter
    // hundert mitgelieferten Einträgen und wäre nicht zu sehen.
    await waitFor(() => expect(screen.getAllByText("selbst gesetzt").length).toBeGreaterThan(0));

    const suchfeld = within(inhalt).getByPlaceholderText("Wort eingeben …");
    await nutzer.clear(suchfeld);
    await nutzer.type(suchfeld, "sepa");
    await waitFor(() =>
      expect(within(karteninhalt(KARTEN.woerter)).getAllByText("mitgeliefert").length).toBeGreaterThan(0),
    );
  });
});

describe("2 · Wörter — was jede Kategorie auszeichnet", () => {
  it("sagt ohne Modell, dass es nichts abzulesen gibt", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);

    // Eine Wolke aus blossen Häufigkeiten sähe aus wie eine Auskunft über die Erkennung
    // und wäre keine — solange nichts trainiert ist, gibt es keine Gewichte.
    expect(
      within(karteninhalt(KARTEN.woerter)).getByText(/Noch kein Modell trainiert/),
    ).toBeTruthy();
  });

  it("zeigt nach dem Training je Kategorie ihre Wörter — und führt zurück in die Liste", async () => {
    material();
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.modell);
    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));
    await waitFor(() => expect(screen.getByText(/Zuletzt trainiert am/)).toBeTruthy());

    await oeffne(nutzer, KARTEN.woerter);
    const wolken = within(karteninhalt(KARTEN.woerter));
    await waitFor(() => expect(wolken.getAllByText("Lebensmittel").length).toBeGreaterThan(0));

    // Der Klick auf ein Wort in der Wolke sucht es oben in der Liste — sonst wären es
    // zwei getrennte Werkzeuge auf derselben Seite.
    const wort = wolken.getAllByRole("button", { name: "kesselmann markt" })[0];
    await nutzer.click(wort);
    await waitFor(() =>
      expect(
        (within(karteninhalt(KARTEN.woerter)).getByPlaceholderText("Wort eingeben …") as HTMLInputElement).value,
      ).toBe("kesselmann markt"),
    );
  });
});

describe("3 · Erkennungsmodell", () => {
  it("sagt vor dem ersten Training, dass noch nichts gelernt ist", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.modell);
    expect(screen.getByText(/Noch nicht trainiert/)).toBeTruthy();
  });

  it("trainiert auf Knopfdruck und zeigt eine gemessene Trefferquote", async () => {
    material();
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.modell);

    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));

    await waitFor(() => expect(screen.getByText("100 %")).toBeTruthy());
    expect(screen.getByText(/Zuletzt trainiert am .*, aus 80 Beispielen/)).toBeTruthy();
  });

  it("misst nicht, wenn zu wenige Beispiele da sind", async () => {
    material(1);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.modell);

    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));

    await waitFor(() => expect(screen.getByText("nicht gemessen")).toBeTruthy());
  });

  it("bietet kein Training an, solange es kein Material gibt", async () => {
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.modell);
    expect(screen.queryByRole("button", { name: "Training starten" })).toBeNull();
  });

  it("meldet Fehlerfreiheit, statt eine leere Matrix zu zeigen", async () => {
    material();
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.modell);

    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));

    await waitFor(() => expect(screen.getByText(/Kein einziger Fehler in der Prüfung/)).toBeTruthy());
  });

  it("das Modell überlebt einen Neuaufbau des Screens", async () => {
    material();
    const nutzer = userEvent.setup();
    const erste = rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.modell);
    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));
    await waitFor(() => expect(screen.getByText(/Zuletzt trainiert am/)).toBeTruthy());

    erste.unmount();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.modell);

    await waitFor(() => expect(screen.getByText(/aus 80 Beispielen/)).toBeTruthy());
  });
});

describe("Register", () => {
  it("öffnet mit dem ersten Register und hängt nur dieses in den Baum", async () => {
    // Der Unterschied zu den früheren Klappkarten: es ist immer GENAU EINES offen. Was
    // nicht gewählt ist, wird nicht gerendert — und lädt damit auch nichts nach.
    material(2);
    rendere(<TrainingBereich />);
    await screen.findByRole("tab", { name: KARTEN.daten });

    const reiter = screen.getAllByRole("tab");
    expect(reiter).toHaveLength(4);
    expect(reiter[0].getAttribute("aria-selected")).toBe("true");
    expect(reiter.slice(1).every((r) => r.getAttribute("aria-selected") === "false")).toBe(true);
    // Inhalt eines anderen Registers steht nicht da.
    expect(screen.queryByText("Empfänger, ganz")).toBeNull();
  });

  it("die Register teilen sich einen Ladevorgang", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.daten);

    // Das zweite Register ist sofort gefüllt — geladen wird beim Betreten des Bereichs,
    // nicht je Register.
    await nutzer.click(screen.getByRole("tab", { name: KARTEN.woerter }));
    expect(screen.getAllByText("Empfänger, ganz").length).toBeGreaterThan(0);
  });

  it("wechselt zurück, ohne neu zu laden", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.woerter);
    await nutzer.click(screen.getByRole("tab", { name: KARTEN.daten }));

    expect(screen.getByText("Brauchbare Beispiele")).toBeTruthy();
    expect(screen.queryByText("Empfänger, ganz")).toBeNull();
  });
});

describe("4 · Bestand abgleichen", () => {
  /**
   * Bestand plus eine Erkennungsregel, die etwas anderes sagt als die gebuchte Kategorie.
   *
   * Das Vehikel ist austauschbar — geprüft wird der ABGLEICH, nicht woher der Vorschlag
   * kommt. Bis 2026-08-29 stand hier eine Festlegung; die gibt es nicht mehr.
   */
  function schieflage() {
    kategorie("kat-lm", "Lebensmittel");
    kategorie("kat-dro", "Drogerie");
    for (let i = 0; i < 3; i++) {
      buchung({ id: `r${i}`, betrag: -1234, kategorieId: "kat-lm", gegenpartei: "Talmer", zweck: "Einkauf" });
    }
    db.run(
      `INSERT INTO vertrag (id, anbieter, beginn, verlaengerung, status, art, kategorie_id)
       VALUES ('v-talmer', 'Talmer', '2026-01-01', 'automatisch', 'aktiv', 'laufend', 'kat-dro')`,
    );
    // `schluessel` traegt JSON mit typisierten Merkmalen — der Spaltenname ist aelter als
    // ihr Inhalt (siehe sqliteVertragZuordnungRepositories). Klartext ergaebe eine leere
    // Merkmalsliste, und die Regel traefe nie.
    db.run(
      `INSERT INTO vertrag_erkennung (vertrag_id, schluessel, betrag_von, betrag_bis)
       VALUES ('v-talmer', '[{"art":"empfaenger","muster":"talmer*"}]', 1000, 1500)`,
    );
  }

  it("rechnet erst auf Knopfdruck — und schreibt dabei nichts", async () => {
    // Rechnen und Schreiben sind getrennt: der Lauf ändert die Zahl, die in jedem
    // Budget steht.
    schieflage();
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.abgleich);

    await nutzer.click(screen.getByRole("button", { name: /Vorschau rechnen/ }));

    await waitFor(() => expect(screen.getByText(/3 ×/)).toBeTruthy());
    expect(within(karteninhalt(KARTEN.abgleich)).getByText("Drogerie")).toBeTruthy();
    // Noch unverändert in der Datenbank.
    const [zeile] = db.exec("SELECT kategorie_id FROM ist_buchung WHERE id = 'r0'")[0].values;
    expect(zeile[0]).toBe("kat-lm");
  });

  it("schreibt erst auf Bestätigung — und dann alle drei", async () => {
    schieflage();
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.abgleich);
    await nutzer.click(screen.getByRole("button", { name: /Vorschau rechnen/ }));
    await waitFor(() => expect(screen.getByText(/3 ×/)).toBeTruthy());

    await nutzer.click(screen.getByRole("button", { name: /3 Buchungen ändern/ }));

    await waitFor(() => {
      const treffer = db.exec("SELECT COUNT(*) FROM ist_buchung WHERE kategorie_id = 'kat-dro'");
      expect(treffer[0].values[0][0]).toBe(3);
    });
    // Geschriebenes bleibt für die Automatik offen — sonst wäre der erste Abgleich
    // zugleich der letzte.
    const herkunft = db.exec("SELECT DISTINCT kategorie_herkunft FROM ist_buchung")[0].values;
    expect(herkunft).toEqual([["automatisch"]]);
  });

  it("läuft ein zweites Mal ins Leere", async () => {
    schieflage();
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.abgleich);
    await nutzer.click(screen.getByRole("button", { name: /Vorschau rechnen/ }));
    await waitFor(() => expect(screen.getByText(/3 ×/)).toBeTruthy());
    await nutzer.click(screen.getByRole("button", { name: /3 Buchungen ändern/ }));
    await waitFor(() => expect(screen.getByText(/3 Buchungen geändert/)).toBeTruthy());

    await nutzer.click(screen.getByRole("button", { name: /Vorschau rechnen/ }));

    await waitFor(() => expect(screen.getByText(/Nichts zu ändern/)).toBeTruthy());
  });

  it("lässt eine von Hand gesetzte Kategorie stehen und sagt es", async () => {
    schieflage();
    db.run("UPDATE ist_buchung SET kategorie_herkunft = 'manuell' WHERE id = 'r0'");
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.abgleich);

    await nutzer.click(screen.getByRole("button", { name: /Vorschau rechnen/ }));

    await waitFor(() => expect(screen.getByText(/2 ×/)).toBeTruthy());
    expect(screen.getByText(/eine getroffene Entscheidung bleibt stehen/)).toBeTruthy();
  });
});
