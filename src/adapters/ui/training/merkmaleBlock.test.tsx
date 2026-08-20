/** @vitest-environment jsdom */
// „Was die Erkennung hier sieht" am Buchungsdialog — der Ort, an dem Ausschlüsse mit dem
// Beleg vor Augen gepflegt werden.
//
// Geprüft wird der Weg, nicht das Wording: dass die Merkmale dieser Buchung erscheinen,
// dass die Statistik aus dem GANZEN Bestand danebensteht, und dass ein Klick tatsächlich
// in der Datenbank landet und die Merkmalsliste danach anders aussieht.

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
import { MerkmaleBlock } from "./MerkmaleBlock";
import { sqliteMerkmalskonfigurationRepository as merkmalRepo } from "../../persistence/sqliteMerkmalskonfigurationRepository";
import { sqliteKlassifikatorRepository as klassifikatorRepo } from "../../persistence/sqliteKlassifikatorRepository";
import { trainieren, type IstBuchung } from "../../../core";
import type { Umsatz } from "../../../application/import";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

const BUCHUNG: IstBuchung = {
  id: "b1", datum: "2026-03-01", betrag: -1234, kontoId: "k1",
  kategorieId: "kat-lm", charakter: "Aufwand", quelle: "import",
};

const UMSATZ: Umsatz = {
  id: "u-b1", laufId: "l1", zahlungskontoId: "k1", buchungstag: "2026-03-01",
  betrag: -1234, waehrung: "EUR", gegenpartei: "REWE Markt",
  verwendungszweck: "Einkauf SEPA Lastschrift RE2026004711", rohHash: "h1",
  status: "verbucht", istbuchungId: "b1",
};

/** Bestand, damit die Statistik über mehr als diese eine Buchung rechnet. */
function bestand(n = 30) {
  db.run("INSERT INTO kategorie (id, name, default_charakter) VALUES ('kat-lm', 'Lebensmittel', 'Aufwand')");
  for (let i = 0; i < n; i++) {
    db.run(
      `INSERT INTO ist_buchung (id, datum, betrag, konto_id, kategorie_id, charakter, quelle)
       VALUES ($id, '2026-03-01', -1234, 'k1', 'kat-lm', 'Aufwand', 'import')`,
      { $id: `x${i}` },
    );
    db.run(
      `INSERT INTO umsatz (id, lauf_id, zahlungskonto_id, buchungstag, betrag, waehrung,
                           gegenpartei, verwendungszweck, roh_hash, status, istbuchung_id)
       VALUES ($uid, 'l1', 'k1', '2026-03-01', -1234, 'EUR', 'REWE Markt', 'Einkauf', $hash, 'verbucht', $id)`,
      { $uid: `u-x${i}`, $id: `x${i}`, $hash: `h-x${i}` },
    );
  }
}

async function aufklappen(nutzer: ReturnType<typeof userEvent.setup>) {
  await nutzer.click(await screen.findByRole("button", { name: /Was die Erkennung hier sieht/ }));
  await waitFor(() => expect(screen.queryByText("rechne …")).toBeNull());
}

describe("Merkmale einer Buchung", () => {
  it("startet zugeklappt und lädt erst auf Klick", async () => {
    bestand();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={UMSATZ} />);

    const schalter = await screen.findByRole("button", { name: /Was die Erkennung hier sieht/ });
    expect(schalter.getAttribute("aria-expanded")).toBe("false");
    // Die Trennschärfe braucht den ganzen Bestand — das darf den Dialog nicht aufhalten.
    expect(screen.queryByText("Verwendet")).toBeNull();
  });

  it("zeigt die Merkmale dieser Buchung", async () => {
    bestand();
    const nutzer = userEvent.setup();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={UMSATZ} />);
    await aufklappen(nutzer);

    expect(screen.getByText("emp=rewe markt")).toBeTruthy();
    expect(screen.getByText("vwz:einkauf")).toBeTruthy();
  });

  it("stellt die Statistik aus dem ganzen Bestand daneben", async () => {
    bestand(30);
    const nutzer = userEvent.setup();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={UMSATZ} />);
    await aufklappen(nutzer);

    // 30 Belege im Bestand, alle auf einer Kategorie — der Einzelfall allein sagte das nicht.
    const zeile = screen.getByText("emp=rewe markt").parentElement!;
    expect(zeile.textContent).toMatch(/30×/);
    expect(zeile.textContent).toMatch(/1 Kategorien/);
  });

  it("sagt es, wenn ein Merkmal nur in dieser Buchung vorkommt", async () => {
    bestand(30);
    const nutzer = userEvent.setup();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={{ ...UMSATZ, verwendungszweck: "Sonderposten" }} />);
    await aufklappen(nutzer);

    expect(screen.getByText(/kommt nur in dieser Buchung vor/)).toBeTruthy();
  });

  it("führt die nicht verwendeten Wörter mit ihrem Grund", async () => {
    bestand();
    const nutzer = userEvent.setup();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={UMSATZ} />);
    await aufklappen(nutzer);

    expect(screen.getByText("Nicht verwendet")).toBeTruthy();
    expect(screen.getByText("re2026004711")).toBeTruthy(); // Nummer
    expect(screen.getByText("sepa")).toBeTruthy(); // Ausschlussliste
  });
});

describe("Listen am Einzelfall pflegen", () => {
  it("schließt ein Merkmal in seiner Quelle aus", async () => {
    bestand();
    const nutzer = userEvent.setup();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={UMSATZ} />);
    await aufklappen(nutzer);

    const zeile = screen.getByText("vwz:einkauf").parentElement!;
    await nutzer.click(within(zeile).getByRole("button", { name: "ausschließen" }));

    await waitFor(async () => {
      const a = (await merkmalRepo.ausschluesseLesen()).find((x) => x.wort === "einkauf");
      expect(a?.herkuenfte).toEqual(["vwz"]);
      expect(a?.quelle).toBe("manuell");
    });
    // Und die Anzeige rechnet neu: das Merkmal ist weg, das Wort steht bei den Verworfenen.
    await waitFor(() => expect(screen.queryByText("vwz:einkauf")).toBeNull());
  });

  it("holt ein ausgeschlossenes Wort zurück", async () => {
    bestand();
    const nutzer = userEvent.setup();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={UMSATZ} />);
    await aufklappen(nutzer);

    const zeile = screen.getByText("sepa").parentElement!;
    await nutzer.click(within(zeile).getByRole("button", { name: "zulassen" }));

    await waitFor(() => expect(screen.getByText("vwz:sepa")).toBeTruthy());
    expect((await merkmalRepo.ausschluesseLesen()).map((a) => a.wort)).not.toContain("sepa");
  });

  it("bietet kein Zulassen für strukturell Verworfenes an", async () => {
    bestand();
    const nutzer = userEvent.setup();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={UMSATZ} />);
    await aufklappen(nutzer);

    // Eine Referenznummer steht auf keiner Liste, die man ändern könnte.
    const zeile = screen.getByText("re2026004711").parentElement!;
    expect(within(zeile).queryByRole("button", { name: "zulassen" })).toBeNull();
  });
});

describe("Was das Modell hier vorschlagen würde", () => {
  it("sagt es, solange kein Modell trainiert ist", async () => {
    bestand();
    const nutzer = userEvent.setup();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={UMSATZ} />);
    await aufklappen(nutzer);

    expect(screen.getByText(/Es ist noch kein Modell trainiert/)).toBeTruthy();
  });

  it("zeigt Vorschlag, Sicherheit und die Belege dafür", async () => {
    bestand();
    await klassifikatorRepo.speichern({
      modell: trainieren([
        { merkmale: ["emp=rewe markt", "vwz:einkauf", "vz:-"], kategorieId: "kat-lm" },
        { merkmale: ["emp=shell", "vwz:tanken", "vz:-"], kategorieId: "kat-sprit" },
      ]),
      trainiertAm: "2026-08-17T10:00:00.000Z",
    });
    const nutzer = userEvent.setup();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={UMSATZ} />);
    await aufklappen(nutzer);

    expect(screen.getByText("Das Modell würde vorschlagen")).toBeTruthy();
    // Die gebuchte Kategorie ist kat-lm — das Modell muss sie treffen.
    expect(screen.getByText("trifft die gebuchte Kategorie")).toBeTruthy();
    // Die Beitragszerlegung IST die Rechnung, keine nachgebaute Erklärung.
    expect(screen.getByText(/[+−][\d.]+ emp=rewe markt/)).toBeTruthy();
  });

  it("meldet, wie viele Merkmale das Modell nicht kennt", async () => {
    bestand();
    await klassifikatorRepo.speichern({
      modell: trainieren([
        { merkmale: ["emp=voellig anderer"], kategorieId: "kat-lm" },
        { merkmale: ["emp=noch einer"], kategorieId: "kat-sprit" },
      ]),
      trainiertAm: "2026-08-17T10:00:00.000Z",
    });
    const nutzer = userEvent.setup();
    rendere(<MerkmaleBlock buchung={BUCHUNG} umsatz={UMSATZ} />);
    await aufklappen(nutzer);

    expect(screen.getByText(/Merkmale kennt das Modell nicht/)).toBeTruthy();
  });
});
