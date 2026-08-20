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

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
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
  db.run(
    `INSERT INTO umsatz (id, lauf_id, zahlungskonto_id, buchungstag, betrag, waehrung,
                         gegenpartei, verwendungszweck, roh_hash, status, istbuchung_id)
     VALUES ($uid, 'l1', 'k1', '2026-03-01', $betrag, 'EUR', $gp, $zweck, $hash, 'verbucht', $id)`,
    {
      $uid: `u-${o.id}`, $id: o.id, $betrag: o.betrag, $gp: o.gegenpartei ?? "REWE Markt",
      $zweck: o.zweck ?? "Einkauf", $hash: `h-${o.id}`,
    },
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
    buchung({ id: `r${i}`, betrag: -1234, kategorieId: "kat-lm", gegenpartei: "REWE Markt", zweck: "Einkauf Lebensmittel" });
    buchung({ id: `s${i}`, betrag: -6000, kategorieId: "kat-sprit", gegenpartei: "Shell Station", zweck: "Tanken Diesel" });
  }
}

const KARTEN = {
  daten: /1 · Trainingsdaten/,
  merkmale: /2 · Merkmale/,
  ausschluesse: /3 · Ausschlüsse/,
  modell: /4 · Erkennungsmodell/,
  abgleich: /5 · Bestand abgleichen/,
} as const;

/**
 * Wählt eines der fünf Register und wartet, bis der gemeinsame Ladevorgang durch ist.
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

describe("2 · Merkmale", () => {
  it("führt die fünf Quellen mit Klartext-Namen", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.merkmale);

    // `emp=` und `emp:` sind aus dem Präfix nicht zu erraten — sie brauchen Namen.
    expect(screen.getByText("Empfänger, ganz")).toBeTruthy();
    expect(screen.getByText("Empfänger, einzelne Wörter")).toBeTruthy();
    expect(screen.getByText("Vorzeichen")).toBeTruthy();
  });

  it("schaltet eine Quelle ab und schreibt das in die Datenbank", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.merkmale);

    const schalter = within(karteninhalt(KARTEN.merkmale)).getAllByRole("checkbox");
    await nutzer.click(schalter[schalter.length - 1]); // Vorzeichen

    await waitFor(async () => {
      expect(await merkmalRepo.herkuenfteLesen()).not.toContain("vz");
    });
  });

  it("eine abgeschaltete Quelle verschwindet aus dem Vokabular", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.merkmale);
    expect(screen.getByText("vz:-")).toBeTruthy();

    const schalter = within(karteninhalt(KARTEN.merkmale)).getAllByRole("checkbox");
    await nutzer.click(schalter[schalter.length - 1]);

    // Die Karte rechnet nach dem Schalten neu — das Merkmal darf nicht stehen bleiben.
    await waitFor(() => expect(screen.queryByText("vz:-")).toBeNull());
  });

  it("zeigt die Trennschärfe je Merkmal", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.merkmale);

    // Ohne diese Zahl neben dem Wort wäre das Ausschließen ein Ratespiel.
    expect(screen.getByText("Trennschärfe")).toBeTruthy();
    expect(screen.getByText("emp=rewe markt")).toBeTruthy();
  });

  it("schließt ein Merkmal aus der Tabelle heraus aus — in seiner Quelle", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.merkmale);

    const zeile = screen.getByText("vwz:einkauf").closest("tr")!;
    await nutzer.click(within(zeile).getByRole("button", { name: "ausschließen" }));

    await waitFor(async () => {
      const [a] = (await merkmalRepo.ausschluesseLesen()).filter((x) => x.wort === "einkauf");
      expect(a?.herkuenfte).toEqual(["vwz"]);
    });
    // Und es ist tatsächlich weg, nicht nur eingetragen.
    await waitFor(() => expect(screen.queryByText("vwz:einkauf")).toBeNull());
  });

  it("misst auf Anforderung, was jede Quelle beiträgt", async () => {
    material();
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.merkmale);

    await nutzer.click(within(karteninhalt(KARTEN.merkmale)).getByRole("button", { name: "Wirkung messen" }));

    await waitFor(() => expect(screen.getByText(/Mit allen aktiven Quellen:/)).toBeTruthy(), { timeout: 20000 });
  }, 30000);
});

describe("3 · Ausschlüsse", () => {
  it("legt beim ersten Öffnen die mitgelieferte Liste an", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.ausschluesse);

    // Die Stoppwörter liegen ab jetzt in der Datenbank — nur so ist eines löschbar.
    const woerter = (await merkmalRepo.ausschluesseLesen()).map((a) => a.wort);
    expect(woerter).toContain("sepa");
    expect(screen.getByText(/Ausschlussliste \(\d+\)/)).toBeTruthy();
  });

  it("nimmt ein Wort über das Formular auf", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.ausschluesse);

    const inhalt = karteninhalt(KARTEN.ausschluesse);
    await nutzer.type(within(inhalt).getByPlaceholderText("z. B. kdn"), "einkauf");
    await nutzer.click(within(inhalt).getAllByRole("button", { name: /ausschließen/ })[0]);

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
    await oeffne(nutzer, KARTEN.ausschluesse);

    // Ein eigenes Wort statt eines mitgelieferten: die Liste ist alphabetisch sortiert
    // und paginiert, und welcher Standardeintrag auf Seite eins landet, ist keine
    // Eigenschaft, an der ein Test hängen sollte.
    const inhalt = karteninhalt(KARTEN.ausschluesse);
    await nutzer.type(within(inhalt).getByPlaceholderText("z. B. kdn"), "aaatestwort");
    await nutzer.click(within(inhalt).getAllByRole("button", { name: /ausschließen/ })[0]);
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
    await oeffne(nutzer, KARTEN.ausschluesse);

    const inhalt = karteninhalt(KARTEN.ausschluesse);
    await nutzer.type(within(inhalt).getByPlaceholderText("z. B. kdn"), "eigenwort");
    await nutzer.click(within(inhalt).getAllByRole("button", { name: /ausschließen/ })[0]);

    await waitFor(() => expect(screen.getAllByText("selbst gesetzt").length).toBeGreaterThan(0));
    expect(screen.getAllByText("mitgeliefert").length).toBeGreaterThan(0);
  });
});

describe("4 · Erkennungsmodell", () => {
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
    expect(reiter).toHaveLength(5);
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
    await nutzer.click(screen.getByRole("tab", { name: KARTEN.merkmale }));
    expect(screen.getByText("Empfänger, ganz")).toBeTruthy();
  });

  it("wechselt zurück, ohne neu zu laden", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<TrainingBereich />);
    await oeffne(nutzer, KARTEN.merkmale);
    await nutzer.click(screen.getByRole("tab", { name: KARTEN.daten }));

    expect(screen.getByText("Brauchbare Beispiele")).toBeTruthy();
    expect(screen.queryByText("Empfänger, ganz")).toBeNull();
  });
});

describe("5 · Bestand abgleichen", () => {
  /** Bestand plus eine Festlegung, die etwas anderes sagt als die gebuchte Kategorie. */
  function schieflage() {
    kategorie("kat-lm", "Lebensmittel");
    kategorie("kat-dro", "Drogerie");
    for (let i = 0; i < 3; i++) {
      buchung({ id: `r${i}`, betrag: -1234, kategorieId: "kat-lm", gegenpartei: "Talmer", zweck: "Einkauf" });
    }
    db.run(
      `INSERT INTO kategorie_festlegung (muster, kategorie_id, angelegt_am)
       VALUES ('talmer', 'kat-dro', '2026-08-17T10:00:00.000Z')`,
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
