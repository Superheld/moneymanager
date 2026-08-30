// Die Übersetzungstabelle gegen die Vorlage gehalten.

import { describe, expect, it } from "vitest";
import { fgZielkategorien, unsereKategorieFuer } from "./finanzguruKategorien";
import { standardkategorienFlach } from "../../application/kategorien/standardkategorien";

describe("unsereKategorieFuer", () => {
  it("übersetzt, was Finanzguru anders nennt", () => {
    expect(unsereKategorieFuer("Restaurants")).toBe("Auswärts essen");
    expect(unsereKategorieFuer("Tanken")).toBe("Sprit & Laden");
    expect(unsereKategorieFuer("Lohn / Gehalt")).toBe("Gehalt");
  });

  it("verträgt Leerzeichen am Rand", () => {
    expect(unsereKategorieFuer("  Restaurants  ")).toBe("Auswärts essen");
  });

  it("gibt undefined, wo sie nichts weiss", () => {
    // Kein Treffer heisst nicht „unkategorisiert" — es heisst, dass diese Stufe nichts
    // beiträgt. Danach kommen Vertrag und Modell.
    expect(unsereKategorieFuer("Etwas, das Finanzguru morgen erfindet")).toBeUndefined();
    expect(unsereKategorieFuer(undefined)).toBeUndefined();
    expect(unsereKategorieFuer("")).toBeUndefined();
  });
});

describe("Die Ziele der Tabelle", () => {
  it("zeigen alle auf eine Kategorie, die die Vorlage kennt", () => {
    // **Der Wächter, um dessentwillen `fgZielkategorien` existiert.** Die Tabelle nennt
    // Kategorien beim NAMEN, und Namen ändern sich: wird `Miete / Rate` zu `Miete & Rate`,
    // zeigt der Eintrag ins Leere. Der Import liefe weiter — die Zeile bekäme nur keinen
    // Vorschlag mehr und fiele still in die Review-Inbox. Genau diese Sorte Fehlschlag
    // bemerkt niemand, deshalb steht er hier als Test.
    //
    // Er prüft gegen die VORLAGE, nicht gegen den Katalog des Nutzers: der darf
    // umbenennen und umhängen, und dann greift ein Eintrag eben nicht. Was die Vorlage
    // nicht kennt, ist dagegen ein Tippfehler oder eine Umbenennung, die jemand
    // vergessen hat nachzuziehen.
    const bekannt = new Set(standardkategorienFlach().map((k) => k.name));
    const verwaist = fgZielkategorien().filter((n) => !bekannt.has(n));
    expect(
      verwaist,
      `Diese Ziele gibt es in der Vorlage nicht (mehr): ${verwaist.join(", ")}`,
    ).toEqual([]);
  });
});
