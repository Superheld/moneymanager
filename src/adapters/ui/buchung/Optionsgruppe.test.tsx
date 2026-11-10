/** @vitest-environment jsdom */
// `Optionsgruppe` und `Richtungswahl` — beide auf Base UI `RadioGroup`. Der Grund für den
// Wechsel steht hier als Test: die Pfeiltasten. Die `Richtungswahl` versprach sie im
// Kommentar und hatte sie nicht.

import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n/i18n";
import { Option, Optionsgruppe } from "./Optionsgruppe";
import { Richtungswahl, type Richtung } from "./Richtungswahl";

describe("Optionsgruppe", () => {
  function Gruppe() {
    const [w, setW] = useState("a");
    return (
      <Optionsgruppe wert={w} aufAendern={setW} label="Gegenseite">
        <Option wert="a">Alpha</Option>
        <Option wert="b">Beta</Option>
      </Optionsgruppe>
    );
  }

  it("ist als Gruppe benannt, und ein Klick auf den Text wählt", async () => {
    render(<Gruppe />);
    expect(screen.getByRole("radiogroup", { name: "Gegenseite" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeChecked();
    await userEvent.click(screen.getByText("Beta"));
    expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Alpha" })).not.toBeChecked();
  });

  it("wechselt mit den Pfeiltasten", async () => {
    render(<Gruppe />);
    screen.getByRole("radio", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
  });
});

describe("Richtungswahl", () => {
  function Wahl({ meldungen }: { meldungen: Richtung[] }) {
    const [r, setR] = useState<Richtung>("ab");
    return <Richtungswahl wert={r} aufAenderung={(neu) => { meldungen.push(neu); setR(neu); }} />;
  }
  const ab = () => screen.getByRole("radio", { name: i18n.t("konten.buchung.richtungAb") });
  const zu = () => screen.getByRole("radio", { name: i18n.t("konten.buchung.richtungZu") });

  it("wechselt mit den Pfeiltasten — das stand im Kommentar und fehlte", async () => {
    render(<Wahl meldungen={[]} />);
    ab().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(zu()).toBeChecked();
  });

  it("meldet auch den Klick auf die Richtung, die schon gilt", async () => {
    // Das ist eine Entscheidung „von Hand", und danach stellt ein Kategoriewechsel die
    // Richtung nicht mehr um. Base UI meldet von sich aus nur einen Wechsel.
    const meldungen: Richtung[] = [];
    render(<Wahl meldungen={meldungen} />);
    await userEvent.click(ab());
    expect(meldungen).toEqual(["ab"]);
  });

  it("bleibt gesperrt lesbar und lässt sich nicht ändern", async () => {
    const meldungen: Richtung[] = [];
    render(<Richtungswahl wert="zu" aufAenderung={(r) => meldungen.push(r)} deaktiviert />);
    expect(zu()).toBeChecked();
    await userEvent.click(ab());
    await userEvent.click(zu());
    expect(meldungen).toEqual([]);
  });
});
