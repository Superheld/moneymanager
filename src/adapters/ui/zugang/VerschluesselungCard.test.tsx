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
const schluesselWechseln = vi.fn(
  async (
    _passphrase: string,
  ): Promise<{
    wiederherstellungscode: string;
    sicherungenUmgestellt: number;
    sicherungenUebrig: number;
  } | null> => ({
    wiederherstellungscode: "NEUE-RCOD-EHIE",
    sicherungenUmgestellt: 3,
    sicherungenUebrig: 0,
  }),
);

vi.mock("../../dienste", () => ({
  zugangPassphraseWechseln: (alte: string, neue: string) => wechseln(alte, neue),
  zugangCodeZeigen: (p: string) => codeZeigen(p),
  zugangSchluesselWechseln: (p: string) => schluesselWechseln(p),
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

describe("Neuen Schlüssel erzeugen", () => {
  // Zwei Karten tragen ein Feld mit demselben Namen (Code ansehen, Schlüssel erzeugen) —
  // gemeint ist das in der Karte, deren Knopf gedrückt wird.
  async function passphraseEingeben(text: string) {
    const felder = screen.getAllByLabelText("zugang.feldPassphrase");
    await userEvent.type(felder[felder.length - 1], text);
  }
  const knopf = () => screen.getByRole("button", { name: "zugang.schluesselKnopf" });

  beforeEach(() => schluesselWechseln.mockClear());

  it("zeigt den neuen Code und nennt die umgestellten Sicherungen", async () => {
    render(<VerschluesselungCard />);
    await passphraseEingeben(ALT);
    await userEvent.click(knopf());

    expect(schluesselWechseln).toHaveBeenCalledWith(ALT);
    expect(await screen.findByText("NEUE-RCOD-EHIE")).toBeTruthy();
    expect(screen.getByText("zugang.schluesselFertig")).toBeTruthy();
    expect(screen.getByText("zugang.schluesselSicherungen")).toBeTruthy();
    expect(screen.queryByText("zugang.schluesselUebrig")).toBeNull();
  });

  it("sagt es, wenn Sicherungen am alten Code hängen bleiben", async () => {
    schluesselWechseln.mockResolvedValueOnce({
      wiederherstellungscode: "NEUE-RCOD-EHIE",
      sicherungenUmgestellt: 0,
      sicherungenUebrig: 2,
    });
    render(<VerschluesselungCard />);
    await passphraseEingeben(ALT);
    await userEvent.click(knopf());

    expect(await screen.findByText("zugang.schluesselUebrig")).toBeTruthy();
    expect(screen.queryByText("zugang.schluesselSicherungen")).toBeNull();
  });

  it("meldet eine falsche Passphrase und zeigt keinen Code", async () => {
    schluesselWechseln.mockResolvedValueOnce(null);
    render(<VerschluesselungCard />);
    await passphraseEingeben("falsch geraten");
    await userEvent.click(knopf());

    expect(await screen.findByText("zugang.passphraseFalsch")).toBeTruthy();
    expect(screen.queryByText("NEUE-RCOD-EHIE")).toBeNull();
  });

  it("räumt einen vorher angezeigten Code weg — er ist danach der alte", async () => {
    render(<VerschluesselungCard />);
    await userEvent.type(screen.getAllByLabelText("zugang.feldPassphrase")[0], ALT);
    await userEvent.click(screen.getByRole("button", { name: "zugang.codeAbrufenKnopf" }));
    expect(await screen.findByText("ABCD-EFGH-IJKL")).toBeTruthy();

    await passphraseEingeben(ALT);
    await userEvent.click(knopf());

    expect(await screen.findByText("NEUE-RCOD-EHIE")).toBeTruthy();
    expect(screen.queryByText("ABCD-EFGH-IJKL")).toBeNull();
  });

  it("meldet einen Fehlschlag, statt still zu bleiben", async () => {
    schluesselWechseln.mockRejectedValueOnce(new Error("kein Platz"));
    render(<VerschluesselungCard />);
    await passphraseEingeben(ALT);
    await userEvent.click(knopf());

    expect(await screen.findByText("zugang.fehlerAllgemein")).toBeTruthy();
  });
});
