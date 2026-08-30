// Die Vorlage selbst — nicht das Anlegen, das prüft `bootstrap.test.ts`.

import { describe, expect, it } from "vitest";
import {
  kategorieSlug,
  standardkategorienFlach,
  STANDARDKATEGORIEN,
} from "./standardkategorien";

describe("kategorieSlug", () => {
  it("schreibt Umlaute aus, statt sie wegzuwerfen", () => {
    // Weggeworfen ergäben „Mobilität" und ein hypothetisches „Mobilitt" denselben Slug.
    expect(kategorieSlug("Mobilität")).toBe("kat-mobilitaet");
    expect(kategorieSlug("Nebeneinkünfte")).toBe("kat-nebeneinkuenfte");
    expect(kategorieSlug("Straße")).toBe("kat-strasse");
  });

  it("macht aus Sonderzeichen einen einzelnen Trennstrich", () => {
    expect(kategorieSlug("Abos & Streaming")).toBe("kat-abos-streaming");
    expect(kategorieSlug("Miete & Nebenkosten")).toBe("kat-miete-nebenkosten");
    // Klammern und Schrägstrich stehen in der Vorlage von heute nicht mehr — geprüft
    // werden sie trotzdem, denn die Vorlage ist umbenennbar und die Funktion nicht.
    expect(kategorieSlug("Kfz (Steuer & Wartung)")).toBe("kat-kfz-steuer-wartung");
    expect(kategorieSlug("Miete / Rate")).toBe("kat-miete-rate");
  });
});

describe("standardkategorienFlach", () => {
  it("vergibt keine ID zweimal", () => {
    // **Die Bedingung, unter der sprechende IDs überhaupt taugen.** Zwei Namen, die
    // denselben Slug ergeben, wären im Spielstand eine einzige Kategorie — und der
    // Fehler zeigte sich nicht beim Anlegen, sondern erst dort, wo eine Buchung in der
    // falschen Kategorie landet.
    const ids = standardkategorienFlach().map((k) => k.id);
    const doppelt = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(doppelt, `Diese IDs kommen mehrfach vor: ${[...new Set(doppelt)].join(", ")}`).toEqual(
      [],
    );
  });

  it("nennt jede Elternkategorie, bevor sie als Elternteil gebraucht wird", () => {
    // Der Spielstand schreibt die Zeilen in dieser Reihenfolge in die Datenbank, und
    // `kategorie.eltern_id` ist ein Fremdschlüssel auf dieselbe Tabelle.
    const gesehen = new Set<string>();
    for (const k of standardkategorienFlach()) {
      if (k.elternId) expect(gesehen.has(k.elternId), `${k.name} vor seinem Elternteil`).toBe(true);
      gesehen.add(k.id);
    }
  });

  it("bildet den ganzen Baum ab, nicht nur zwei Ebenen", () => {
    const flach = standardkategorienFlach();
    const namen = flach.map((k) => k.name);
    // „Anschaffungen" hängt unter „Einrichtung & Geräte" und damit auf der dritten Ebene.
    // Solange es die gibt, ist dieser Fall der Beleg, dass die Abflachung sie sieht.
    const enkel = flach.filter((k) => {
      const elter = flach.find((x) => x.id === k.elternId);
      return elter?.elternId !== undefined;
    });
    expect(namen.length).toBeGreaterThan(STANDARDKATEGORIEN.length);
    expect(enkel.length, "Kein Enkel im Baum — dann prüft dieser Fall nichts").toBeGreaterThan(0);
  });

  it("erbt den Charakter vom Elternteil, wo keiner dransteht", () => {
    const flach = standardkategorienFlach();
    const wohnen = flach.find((k) => k.name === "Wohnen");
    const miete = flach.find((k) => k.name === "Miete & Nebenkosten");
    expect(miete?.defaultCharakter).toBe(wohnen?.defaultCharakter);

    // Und wo einer dransteht, gewinnt er: Sparen ist eine Umschichtung in einer
    // ansonsten als Aufwand geführten Gruppe.
    const sparen = flach.find((k) => k.name === "Sparen & Anlegen");
    expect(sparen?.defaultCharakter).toBe("Umschichtung");
    expect(flach.find((k) => k.name === "Finanzen")?.defaultCharakter).toBe("Aufwand");
  });
});
