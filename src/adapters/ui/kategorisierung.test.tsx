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
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../test/harness";
import { EinstellungenScreen } from "./EinstellungenScreen";
import { sqliteMerkmalskonfigurationRepository as merkmalRepo } from "../persistence/sqliteMerkmalskonfigurationRepository";

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
} as const;

/**
 * Klappt eine der vier Karten auf und wartet, bis der gemeinsame Ladevorgang durch ist.
 * Er läuft erst beim ersten Aufklappen — vorher hängt der Inhalt nicht im Baum.
 */
async function oeffne(nutzer: ReturnType<typeof userEvent.setup>, karte: RegExp) {
  await nutzer.click(await screen.findByRole("button", { name: karte }));
  await waitFor(() => expect(screen.queryAllByText("…")).toHaveLength(0));
}

/**
 * Der Kasten EINER Karte. Am Hintergrund-Token erkannt, das die Card-Komponente setzt —
 * die Zahl der Zwischenebenen ist ein Detail des Design-Systems und würde jeden Test
 * beim nächsten Umbau dort brechen.
 */
function karteninhalt(karte: RegExp): HTMLElement {
  const titel = screen.getByRole("button", { name: karte });
  return titel.closest('div[style*="var(--surface)"]') as HTMLElement;
}

describe("1 · Trainingsdaten", () => {
  it("zählt brauchbare Beispiele und belegte Kategorien", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.daten);

    expect(screen.getByText("Brauchbare Beispiele")).toBeTruthy();
    expect(screen.getByText("von 4 gebuchten Zahlungen")).toBeTruthy();
  });

  it("nennt Umschichtungen als Ausschlussgrund", async () => {
    kategorie("kat-lm", "Lebensmittel");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });
    buchung({ id: "b2", betrag: -500, charakter: "Umschichtung" });
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.daten);

    expect(screen.getByText(/Umschichtung — eigenes Geld/)).toBeTruthy();
  });

  it("warnt vor Kategorien mit zu wenig Material und nennt sie beim Namen", async () => {
    kategorie("kat-lm", "Lebensmittel");
    kategorie("kat-selten", "Seltene Sache");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });
    buchung({ id: "b2", betrag: -999, kategorieId: "kat-selten", gegenpartei: "Kuriosum" });
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.daten);

    expect(
      screen.getAllByText((_, el) => !!el && /Seltene Sache · 1/.test(el.textContent ?? "")).length,
    ).toBeGreaterThan(0);
  });

  it("sagt es, wenn es gar nichts zu lernen gibt", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.daten);
    expect(screen.getByText(/Noch keine gebuchten Zahlungen/)).toBeTruthy();
  });
});

describe("2 · Merkmale", () => {
  it("führt die fünf Quellen mit Klartext-Namen", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.merkmale);

    // `emp=` und `emp:` sind aus dem Präfix nicht zu erraten — sie brauchen Namen.
    expect(screen.getByText("Empfänger, ganz")).toBeTruthy();
    expect(screen.getByText("Empfänger, einzelne Wörter")).toBeTruthy();
    expect(screen.getByText("Vorzeichen")).toBeTruthy();
  });

  it("schaltet eine Quelle ab und schreibt das in die Datenbank", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
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
    rendere(<EinstellungenScreen />);
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
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.merkmale);

    // Ohne diese Zahl neben dem Wort wäre das Ausschließen ein Ratespiel.
    expect(screen.getByText("Trennschärfe")).toBeTruthy();
    expect(screen.getByText("emp=rewe markt")).toBeTruthy();
  });

  it("schließt ein Merkmal aus der Tabelle heraus aus — in seiner Quelle", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
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
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.merkmale);

    await nutzer.click(within(karteninhalt(KARTEN.merkmale)).getByRole("button", { name: "Wirkung messen" }));

    await waitFor(() => expect(screen.getByText(/Mit allen aktiven Quellen:/)).toBeTruthy(), { timeout: 20000 });
  }, 30000);
});

describe("3 · Ausschlüsse", () => {
  it("legt beim ersten Öffnen die mitgelieferte Liste an", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.ausschluesse);

    // Die Stoppwörter liegen ab jetzt in der Datenbank — nur so ist eines löschbar.
    const woerter = (await merkmalRepo.ausschluesseLesen()).map((a) => a.wort);
    expect(woerter).toContain("sepa");
    expect(screen.getByText(/Ausschlussliste \(\d+\)/)).toBeTruthy();
  });

  it("nimmt ein Wort über das Formular auf", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
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
    rendere(<EinstellungenScreen />);
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
    rendere(<EinstellungenScreen />);
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
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.modell);
    expect(screen.getByText(/Noch nicht trainiert/)).toBeTruthy();
  });

  it("trainiert auf Knopfdruck und zeigt eine gemessene Trefferquote", async () => {
    material();
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.modell);

    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));

    await waitFor(() => expect(screen.getByText("100 %")).toBeTruthy());
    expect(screen.getByText(/Zuletzt trainiert am .*, aus 80 Beispielen/)).toBeTruthy();
  });

  it("misst nicht, wenn zu wenige Beispiele da sind", async () => {
    material(1);
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.modell);

    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));

    await waitFor(() => expect(screen.getByText("nicht gemessen")).toBeTruthy());
  });

  it("bietet kein Training an, solange es kein Material gibt", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.modell);
    expect(screen.queryByRole("button", { name: "Training starten" })).toBeNull();
  });

  it("meldet Fehlerfreiheit, statt eine leere Matrix zu zeigen", async () => {
    material();
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.modell);

    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));

    await waitFor(() => expect(screen.getByText(/Kein einziger Fehler in der Prüfung/)).toBeTruthy());
  });

  it("das Modell überlebt einen Neuaufbau des Screens", async () => {
    material();
    const nutzer = userEvent.setup();
    const erste = rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.modell);
    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));
    await waitFor(() => expect(screen.getByText(/Zuletzt trainiert am/)).toBeTruthy());

    erste.unmount();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.modell);

    await waitFor(() => expect(screen.getByText(/aus 80 Beispielen/)).toBeTruthy());
  });
});

describe("Karten klappen", () => {
  it("alle Karten starten eingeklappt und laden nichts", async () => {
    material(2);
    rendere(<EinstellungenScreen />);
    await screen.findByRole("button", { name: KARTEN.daten });

    const schalter = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
    expect(schalter.length).toBeGreaterThanOrEqual(8); // 4 Stammdaten + 4 Kategorisierung
    for (const s of schalter) expect(s.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Brauchbare Beispiele")).toBeNull();
  });

  it("die vier Karten teilen sich einen Ladevorgang", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.daten);

    // Die zweite Karte ist sofort gefüllt — sie lädt nicht noch einmal.
    await nutzer.click(screen.getByRole("button", { name: KARTEN.merkmale }));
    expect(screen.getByText("Empfänger, ganz")).toBeTruthy();
  });

  it("klappt auf Klick wieder zu", async () => {
    material(2);
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await oeffne(nutzer, KARTEN.daten);
    await nutzer.click(screen.getByRole("button", { name: KARTEN.daten }));

    expect(screen.queryByText("Brauchbare Beispiele")).toBeNull();
  });
});
