// Was eine Datei an fremden Kategorien mitbringt — und was die Ansicht daraus zeigt.

import { describe, expect, it } from "vitest";
import type { Kategorie } from "../../core";
import { fremdkategorienInDatei, vorbelegteZuordnung } from "./fremdkategorien";
import type { RohUmsatz } from "./rohUmsatz";

const kategorien: Kategorie[] = [
  { id: "k-le", name: "Lebensmittel", defaultCharakter: "Aufwand" },
  { id: "k-aus", name: "Auswärts essen", defaultCharakter: "Aufwand" },
];

function roh(over: Partial<RohUmsatz> = {}): RohUmsatz {
  return {
    buchungstag: "2026-03-01",
    betrag: -1234,
    waehrung: "EUR",
    gegenpartei: "Kesselmann",
    verwendungszweck: "Einkauf",
    quelle: "test",
    istUmbuchung: false,
    ...over,
  };
}

describe("fremdkategorienInDatei", () => {
  it("zählt je fremdem Namen und stellt den häufigsten nach oben", () => {
    const befund = fremdkategorienInDatei(
      [
        roh({ kategorieHinweis: "Restaurants", kategorieVorschlag: "Auswärts essen" }),
        roh({ kategorieHinweis: "Lebensmittel", kategorieVorschlag: "Lebensmittel" }),
        roh({ kategorieHinweis: "Lebensmittel", kategorieVorschlag: "Lebensmittel" }),
      ],
      kategorien,
    );
    expect(befund.zeilen.map((z) => [z.fremdName, z.anzahl])).toEqual([
      ["Lebensmittel", 2],
      ["Restaurants", 1],
    ]);
  });

  it("löst die Übersetzung auf eine Kategorie dieses Bestands auf", () => {
    const [zeile] = fremdkategorienInDatei(
      [roh({ kategorieHinweis: "Restaurants", kategorieVorschlag: "Auswärts essen" })],
      kategorien,
    ).zeilen;
    expect(zeile.uebersetzung).toBe("Auswärts essen");
    expect(zeile.kategorieId).toBe("k-aus");
  });

  it("zeigt das Ziel, das es hier nicht gibt, statt die Zeile wegzulassen", () => {
    // **Der Fall, für den die Ansicht gebaut ist.** Die eingebaute Tabelle zeigt auf eine
    // Kategorie, die dieser Haushalt nicht führt — vorher fiel die Zeile wortlos ans
    // Modell. Jetzt steht sie da, mit dem gemeinten Namen daneben.
    const [zeile] = fremdkategorienInDatei(
      [roh({ kategorieHinweis: "Tanken", kategorieVorschlag: "Sprit & Laden" })],
      kategorien,
    ).zeilen;
    expect(zeile.uebersetzung).toBe("Sprit & Laden");
    expect(zeile.kategorieId).toBeUndefined();
  });

  it("führt auch den fremden Namen, den die Übersetzung gar nicht kennt", () => {
    const [zeile] = fremdkategorienInDatei([roh({ kategorieHinweis: "Etwas Neues" })], kategorien)
      .zeilen;
    expect(zeile.fremdName).toBe("Etwas Neues");
    expect(zeile.uebersetzung).toBeUndefined();
  });

  it("zählt Umbuchungen getrennt und nicht in die Zuordnung", () => {
    // Eine Umbuchung wird ganz oben in der Kette entschieden und erreicht diese Stufe
    // nie. Sie mitzuzählen ergäbe eine Zahl, die über das Ergebnis nichts sagt.
    const befund = fremdkategorienInDatei(
      [
        roh({ istUmbuchung: true, kategorieHinweis: "Umbuchung" }),
        roh({ kategorieHinweis: "Restaurants", kategorieVorschlag: "Auswärts essen" }),
      ],
      kategorien,
    );
    expect(befund.umbuchungen).toBe(1);
    expect(befund.zeilen).toHaveLength(1);
  });

  it("zählt Zeilen ohne Angabe getrennt", () => {
    const befund = fremdkategorienInDatei([roh(), roh({ kategorieHinweis: "  " })], kategorien);
    expect(befund.ohneAngabe).toBe(2);
    expect(befund.zeilen).toEqual([]);
  });

  it("fasst denselben Namen mit Leerzeichen am Rand zusammen", () => {
    // Getrimmt wird hier UND beim Übernehmen. Ohne das stünde derselbe Name zweimal in
    // der Ansicht, und eine der beiden Zuordnungen griffe beim Import ins Leere.
    const befund = fremdkategorienInDatei(
      [roh({ kategorieHinweis: " Restaurants" }), roh({ kategorieHinweis: "Restaurants " })],
      kategorien,
    );
    expect(befund.zeilen).toHaveLength(1);
    expect(befund.zeilen[0].anzahl).toBe(2);
  });
});

describe("vorbelegteZuordnung", () => {
  it("belegt vor, was auflösbar war, und lässt den Rest offen", () => {
    const befund = fremdkategorienInDatei(
      [
        roh({ kategorieHinweis: "Restaurants", kategorieVorschlag: "Auswärts essen" }),
        roh({ kategorieHinweis: "Tanken", kategorieVorschlag: "Sprit & Laden" }),
      ],
      kategorien,
    );
    expect(vorbelegteZuordnung(befund)).toEqual({ Restaurants: "k-aus" });
  });
});
