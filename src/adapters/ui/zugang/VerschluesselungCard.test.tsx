/** @vitest-environment jsdom */
// Was man an der Verschlüsselung einstellen kann — und der eine Fall, der wehtut.
//
// **Der Passphrasenwechsel hatte bis 2026-08-30 kein Bestätigungsfeld.** Ein Vertipper in
// der neuen Passphrase fiel nirgends auf: der Wechsel gelang, die Hülle trug ab da das
// Verschriebene, und gemerkt hätte man es beim nächsten Entsperren — dann wäre der Bestand
// nur noch über den Wiederherstellungscode zu erreichen gewesen. Die Einrichtung im
// Sperrbildschirm prüft das seit jeher; hier fehlte es, und hier ist der Schaden grösser,
// weil beim Einrichten noch nichts drinsteht.
//
// Gesucht wird über i18n-SCHLÜSSEL, nicht über Formulierungen — dieselbe Konvention wie
// in `Sperrbildschirm.test.tsx`.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const wechseln = vi.fn(async (_alte: string, _neue: string) => ({ art: "fertig" as const }));
const codeZeigen = vi.fn(async (_passphrase: string) => "ABCD-EFGH-IJKL");

vi.mock("../../dienste", () => ({
  zugangPassphraseWechseln: (alte: string, neue: string) => wechseln(alte, neue),
  zugangCodeZeigen: (p: string) => codeZeigen(p),
  zeitsperre: async () => 15,
  zeitsperreSetzen: async () => {},
}));

const { VerschluesselungCard } = await import("./VerschluesselungCard");

const ALT = "die alte lange Passphrase";
const NEU = "die neue lange Passphrase";

async function tippen(label: string, text: string) {
  await userEvent.type(screen.getByLabelText(label), text);
}

beforeEach(() => {
  wechseln.mockClear();
  codeZeigen.mockClear();
});

describe("Passphrase wechseln", () => {
  it("wechselt, wenn beide Eingaben übereinstimmen", async () => {
    render(<VerschluesselungCard />);
    await tippen("zugang.feldAltePassphrase", ALT);
    await tippen("zugang.feldNeuePassphrase", NEU);
    await tippen("zugang.feldWiederholung", NEU);
    await userEvent.click(screen.getByRole("button", { name: "zugang.wechselnKnopf" }));

    expect(wechseln).toHaveBeenCalledWith(ALT, NEU);
  });

  it("wechselt NICHT, wenn die Wiederholung abweicht", async () => {
    render(<VerschluesselungCard />);
    await tippen("zugang.feldAltePassphrase", ALT);
    await tippen("zugang.feldNeuePassphrase", NEU);
    await tippen("zugang.feldWiederholung", NEU + "x");
    await userEvent.click(screen.getByRole("button", { name: "zugang.wechselnKnopf" }));

    // Der Punkt: gar nicht erst aufrufen. Ein Wechsel, der durchläuft und danach gemeldet
    // wird, hat die Hülle schon neu geschrieben — die Meldung käme zu spät.
    expect(wechseln).not.toHaveBeenCalled();
    expect(await screen.findByText("zugang.stimmtNichtUeberein")).toBeTruthy();
  });

  it("räumt alle drei Felder, wenn es geklappt hat", async () => {
    render(<VerschluesselungCard />);
    await tippen("zugang.feldAltePassphrase", ALT);
    await tippen("zugang.feldNeuePassphrase", NEU);
    await tippen("zugang.feldWiederholung", NEU);
    await userEvent.click(screen.getByRole("button", { name: "zugang.wechselnKnopf" }));

    // Eine stehengebliebene Passphrase im Feld ist genau das, was die Zeitsperre
    // verhindern soll: wer danach an den Rechner tritt, liest sie ab.
    for (const feld of [
      "zugang.feldAltePassphrase",
      "zugang.feldNeuePassphrase",
      "zugang.feldWiederholung",
    ]) {
      expect((screen.getByLabelText(feld) as HTMLInputElement).value).toBe("");
    }
  });
});
