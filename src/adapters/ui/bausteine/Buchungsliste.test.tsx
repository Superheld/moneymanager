/** @vitest-environment jsdom */
// Die eine Buchungsliste. Geprüft wird die Regel, die die Stellen voneinander
// unterscheiden darf: eine Spalte, die nichts unterscheidet, fällt weg.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../../i18n/i18n";
import type { Buchungszeile, IstBuchung } from "../../../application";
import { Buchungsliste } from "./Buchungsliste";

function zeile(id: string, felder: Partial<Buchungszeile>): Buchungszeile {
  return {
    buchung: { id, datum: "2026-10-03", betrag: -1000, kontoId: "k", charakter: "Aufwand", quelle: "manuell" } as IstBuchung,
    betrag: -1000,
    name: id,
    verwendungszweck: "",
    kategorieName: "Freizeit",
    kontoName: "Girokonto",
    ...felder,
  };
}

const kopf = () => screen.getAllByRole("columnheader").map((th) => th.textContent);

describe("Buchungsliste", () => {
  it("lässt Kategorie und Konto weg, wenn alle Zeilen dieselben tragen", () => {
    render(<Buchungsliste zeilen={[zeile("Kesselmann", {}), zeile("Ohlert", {})]} />);
    expect(kopf()).not.toContain(i18n.t("buchungsliste.kategorie"));
    expect(kopf()).not.toContain(i18n.t("buchungsliste.konto"));
  });

  it("zeigt sie, sobald sie etwas unterscheiden", () => {
    render(
      <Buchungsliste
        zeilen={[zeile("Kesselmann", {}), zeile("Ohlert", { kategorieName: "Mobilität", kontoName: "Kreditkarte" })]}
      />,
    );
    expect(kopf()).toContain(i18n.t("buchungsliste.kategorie"));
    expect(kopf()).toContain(i18n.t("buchungsliste.konto"));
  });

  it("zeigt den Betrag mit Vorzeichen", () => {
    render(<Buchungsliste zeilen={[zeile("Vibora", { betrag: -6250 }), zeile("Aukamp", { betrag: 990 })]} />);
    expect(screen.getByText(/−62,50/)).toBeInTheDocument();
    expect(screen.getByText(/\+9,90/)).toBeInTheDocument();
  });
});
