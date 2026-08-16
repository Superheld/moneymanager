/** @vitest-environment jsdom */
// Die Lernmaterial-Karte in den Einstellungen — von der Oberfläche bis ins Schema.
//
// Sie ist die einzige Stelle, an der sichtbar wird, woraus die automatische
// Kategorisierung lernt. Geprüft wird deshalb nicht die Formulierung, sondern die Zahlen:
// wie viele Beispiele aus dem Bestand entstehen, was warum ausfällt, und dass die
// Ausschlussliste tatsächlich mit Belegen aus DIESEN Daten dasteht.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../test/harness";
import { EinstellungenScreen } from "./EinstellungenScreen";

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
  // Empfänger und Verwendungszweck stehen am Umsatz, nicht an der Buchung; die
  // Verknüpfung läuft über umsatz.istbuchung_id (siehe application/zahlungsspuren).
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
  db.run(
    "INSERT INTO kategorie (id, name, default_charakter) VALUES ($id, $name, 'Aufwand')",
    { $id: id, $name: name },
  );
}

/**
 * Klappt die Karte auf und wartet, bis ihr Inhalt geladen ist.
 *
 * Die Karten der Einstellungen starten zugeklappt, und der Inhalt wird erst dann
 * gerendert — der Ladeeffekt läuft also auch erst dann. Das ist der Punkt der Sache:
 * wer eine Person umbenennen will, soll nicht den ganzen Ledger laden.
 */
async function karteGeladen(nutzer: ReturnType<typeof userEvent.setup>) {
  await nutzer.click(await screen.findByRole("button", { name: /Automatische Kategorisierung/ }));
  await screen.findByText(/Brauchbare Beispiele|Noch keine gebuchten Zahlungen/);
}

/**
 * Sucht Text, der über mehrere Elemente verteilt sein darf — Pills setzen sich aus
 * Name, Trennzeichen und Zahl zusammen, und `getByText` sieht nur einzelne Knoten.
 */
function textVorhanden(muster: RegExp): boolean {
  return screen
    .getAllByText((_, el) => !!el && muster.test(el.textContent ?? ""))
    .length > 0;
}

describe("Lernmaterial-Karte", () => {
  it("zählt brauchbare Beispiele und belegte Kategorien", async () => {
    kategorie("kat-lm", "Lebensmittel");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });
    buchung({ id: "b2", betrag: -2345, kategorieId: "kat-lm" });

    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);

    expect(screen.getByText("Brauchbare Beispiele")).toBeTruthy();
    expect(screen.getByText("von 2 gebuchten Zahlungen")).toBeTruthy();
  });

  it("nennt Umschichtungen als Ausschlussgrund mit Zahl", async () => {
    kategorie("kat-lm", "Lebensmittel");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });
    buchung({ id: "b2", betrag: -500, charakter: "Umschichtung" });
    buchung({ id: "b3", betrag: 500, charakter: "Umschichtung" });

    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);

    expect(screen.getByText(/Umschichtung — eigenes Geld/)).toBeTruthy();
    // Zwei Umschichtungen, eine brauchbare Zahlung von dreien.
    expect(screen.getByText("von 3 gebuchten Zahlungen")).toBeTruthy();
  });

  it("warnt vor Kategorien mit zu wenigen Beispielen und nennt sie beim Namen", async () => {
    kategorie("kat-lm", "Lebensmittel");
    kategorie("kat-selten", "Seltene Sache");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });
    buchung({ id: "b2", betrag: -999, kategorieId: "kat-selten", gegenpartei: "Kuriosum" });

    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);

    // Der Name, nicht die Id — sonst ist die Warnung nicht verwertbar.
    expect(textVorhanden(/Seltene Sache · 1/)).toBe(true);
  });

  it("zeigt die aussortierten Wörter mit Grund und Belegzahl", async () => {
    kategorie("kat-lm", "Lebensmittel");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm", zweck: "SEPA Lastschrift RE2026004711" });
    buchung({ id: "b2", betrag: -2345, kategorieId: "kat-lm", zweck: "SEPA Lastschrift RE2026004712" });

    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);

    expect(screen.getByText("Aussortierte Wörter")).toBeTruthy();
    // Das Originalwort steht da, nicht der gekürzte Kern — sonst zeigte die Liste
    // Wörter, die so in den Daten gar nicht vorkommen.
    expect(screen.getByText("re2026004711")).toBeTruthy();
    // „lastschrift" steht zweimal im DOM: als Beleg aus diesen Daten und als Eintrag der
    // festen Stoppwortliste weiter unten. Beides ist gewollt.
    expect(screen.getAllByText("lastschrift").length).toBeGreaterThanOrEqual(1);
  });

  it("führt die feste Stoppwortliste auf", async () => {
    kategorie("kat-lm", "Lebensmittel");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });

    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);

    expect(textVorhanden(/Feste Stoppwortliste \(\d+\)/)).toBe(true);
  });

  it("sagt es, wenn es gar nichts zu lernen gibt", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);
    expect(screen.getByText(/Noch keine gebuchten Zahlungen/)).toBeTruthy();
  });
});

describe("Training über die Oberfläche", () => {
  /** Genug klar trennbares Material, damit eine Messung überhaupt stattfindet. */
  function material() {
    kategorie("kat-lm", "Lebensmittel");
    kategorie("kat-sprit", "Sprit & Laden");
    for (let i = 0; i < 40; i++) {
      buchung({ id: `r${i}`, betrag: -1234, kategorieId: "kat-lm", gegenpartei: "REWE Markt", zweck: "Einkauf" });
      buchung({ id: `s${i}`, betrag: -6000, kategorieId: "kat-sprit", gegenpartei: "Shell Station", zweck: "Tanken" });
    }
  }

  it("sagt vor dem ersten Training, dass noch nichts gelernt ist", async () => {
    material();
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);
    expect(screen.getByText(/Noch nicht trainiert/)).toBeTruthy();
  });

  it("trainiert auf Knopfdruck und zeigt danach eine gemessene Trefferquote", async () => {
    material();
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);

    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));

    // Die Aufgabe ist trennbar — das Modell muss sie treffen.
    await waitFor(() => expect(screen.getByText("100 %")).toBeTruthy());
    expect(screen.getByText(/Zuletzt trainiert am .*, aus 80 Beispielen/)).toBeTruthy();
    expect(screen.queryByText(/Noch nicht trainiert/)).toBeNull();
    // Bei fehlerfreier Erkennung darf keine Liste „wo es schwerfällt" erscheinen.
    expect(screen.queryByText("Wo die Erkennung sich schwertut")).toBeNull();
  });

  it("das Modell überlebt einen Neuaufbau des Screens", async () => {
    material();
    const nutzer = userEvent.setup();
    const ersteAnsicht = rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);
    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));
    await waitFor(() => expect(screen.getByText(/Zuletzt trainiert am/)).toBeTruthy());

    // Es liegt in der Datenbank, nicht im Zustand der Komponente.
    ersteAnsicht.unmount();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);
    await waitFor(() => expect(screen.getByText(/aus 80 Beispielen/)).toBeTruthy());
  });

  it("misst nicht, wenn zu wenige Beispiele da sind", async () => {
    kategorie("kat-lm", "Lebensmittel");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);

    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));

    // Lieber keine Angabe als eine, die nur den Zufall des Splits wiedergibt.
    await waitFor(() => expect(screen.getByText("nicht gemessen")).toBeTruthy());
    expect(screen.getByText(/aus 1 Beispielen/)).toBeTruthy();
  });

  it("bietet kein Training an, solange es kein Material gibt", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);
    expect(screen.queryByRole("button", { name: "Training starten" })).toBeNull();
  });
});

describe("Karten klappen", () => {
  it("startet eingeklappt und lädt den Inhalt erst beim Aufklappen", async () => {
    kategorie("kat-lm", "Lebensmittel");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);

    const titel = await screen.findByRole("button", { name: /Automatische Kategorisierung/ });
    expect(titel.getAttribute("aria-expanded")).toBe("false");
    // Der Inhalt hängt nicht im Baum — damit läuft auch sein Ladeeffekt nicht.
    expect(screen.queryByText("Brauchbare Beispiele")).toBeNull();

    await nutzer.click(titel);

    expect(titel.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByText("Brauchbare Beispiele")).toBeTruthy();
  });

  it("klappt auf Klick wieder zu", async () => {
    kategorie("kat-lm", "Lebensmittel");
    buchung({ id: "b1", betrag: -1234, kategorieId: "kat-lm" });
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    const titel = await screen.findByRole("button", { name: /Automatische Kategorisierung/ });

    await nutzer.click(titel);
    await screen.findByText("Brauchbare Beispiele");
    await nutzer.click(titel);

    expect(screen.queryByText("Brauchbare Beispiele")).toBeNull();
  });

  it("alle Karten der Einstellungen starten eingeklappt", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await screen.findByRole("button", { name: /Automatische Kategorisierung/ });

    const schalter = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
    expect(schalter.length).toBeGreaterThanOrEqual(5);
    for (const s of schalter) expect(s.getAttribute("aria-expanded")).toBe("false");
    // Die Titel bleiben lesbar — genau das ist der Sinn der Sache.
    expect(document.body.textContent).toMatch(/Personen/);
    expect(document.body.textContent).toMatch(/Kategorien/);
    expect(nutzer).toBeTruthy();
  });
});

describe("Verwechslungsmatrix in der Anzeige", () => {
  /** Zwei Empfänger, die dasselbe Wort teilen — das erzwingt echte Verwechslungen. */
  function verwechselbar() {
    kategorie("kat-a", "Alpha");
    kategorie("kat-b", "Beta");
    for (let i = 0; i < 30; i++) {
      buchung({ id: `a${i}`, betrag: -1000, kategorieId: "kat-a", gegenpartei: "Markt Nord", zweck: "Kauf" });
      buchung({ id: `b${i}`, betrag: -1000, kategorieId: "kat-b", gegenpartei: "Markt Nord", zweck: "Kauf" });
    }
  }

  it("zeigt nach dem Training eine Matrix mit den Kategorienamen", async () => {
    verwechselbar();
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);

    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));
    await waitFor(() => expect(screen.getByText("Verwechslungen")).toBeTruthy());

    // Identische Merkmale bei zwei Kategorien — eine davon muss die andere schlucken.
    expect(screen.getByText(/tatsächlich ↓ \/ erkannt →/)).toBeTruthy();
    expect(screen.getAllByText(/Alpha|Beta/).length).toBeGreaterThan(0);
    expect(screen.getByText("Häufigste Verwechslungen")).toBeTruthy();
  });

  it("meldet Fehlerfreiheit, statt eine leere Matrix zu zeigen", async () => {
    kategorie("kat-lm", "Lebensmittel");
    kategorie("kat-sprit", "Sprit & Laden");
    for (let i = 0; i < 40; i++) {
      buchung({ id: `r${i}`, betrag: -1234, kategorieId: "kat-lm", gegenpartei: "REWE Markt", zweck: "Einkauf" });
      buchung({ id: `s${i}`, betrag: -6000, kategorieId: "kat-sprit", gegenpartei: "Shell Station", zweck: "Tanken" });
    }
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await karteGeladen(nutzer);

    await nutzer.click(screen.getByRole("button", { name: "Training starten" }));

    await waitFor(() => expect(screen.getByText(/Kein einziger Fehler in der Prüfung/)).toBeTruthy());
    expect(screen.queryByText(/tatsächlich ↓/)).toBeNull();
  });
});
