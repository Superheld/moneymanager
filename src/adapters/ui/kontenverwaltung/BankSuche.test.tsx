/** @vitest-environment jsdom */
// `BankSuche` auf Base UI `Combobox`. Geprüft wird, was der Eigenbau nicht hatte — die
// Rollen — und was er hatte und behalten muss: tippen, mit Pfeil und Enter wählen.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n/i18n";

// Erfundene Banken mit nicht existierenden Bankleitzahlen (Bereich 999999xx).
const LISTE = vi.hoisted(() => [
  { blz: "99999901", name: "Kesselmann Bank", ort: "Nordhausen", version: "3.0", url: "https://kesselmann.invalid/fints" },
  { blz: "99999902", name: "Kesselmann Privatbank", ort: "Südstadt", version: "3.0", url: "https://kp.invalid/fints" },
  { blz: "99999903", name: "Vibora Sparkasse", ort: "Weststadt", version: "3.0", url: "https://vibora.invalid/fints" },
]);
vi.mock("../../fints/bankenliste", async (orig) => {
  const echt = await orig<typeof import("../../fints/bankenliste")>();
  return { ...echt, bankenliste: async () => LISTE };
});

import { BankSuche } from "./BankSuche";

describe("BankSuche", () => {
  it("ist eine Combobox und zeigt Treffer als Liste", async () => {
    const nutzer = userEvent.setup();
    render(<BankSuche onWaehlen={() => {}} />);
    const feld = await screen.findByRole("combobox", { name: i18n.t("bankabruf.feldBankSuche") });
    await vi.waitFor(() => expect(feld).not.toBeDisabled());
    await nutzer.type(feld, "Kesselmann");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("wählt mit Pfeil und Enter und meldet die ganze Bank", async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    render(<BankSuche onWaehlen={(b) => gewaehlt.push(b.blz)} />);
    const feld = await screen.findByRole("combobox", { name: i18n.t("bankabruf.feldBankSuche") });
    await vi.waitFor(() => expect(feld).not.toBeDisabled());
    await nutzer.type(feld, "Kesselmann");
    await screen.findByRole("listbox");
    await nutzer.keyboard("{ArrowDown}{Enter}");
    expect(gewaehlt).toEqual(["99999902"]);
    expect((feld as HTMLInputElement).value).toBe("Kesselmann Privatbank, Südstadt");
  });

  it("nimmt mit Enter den ersten Treffer, ohne dass man zuerst einen Pfeil drückt", async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    render(<BankSuche onWaehlen={(b) => gewaehlt.push(b.blz)} />);
    const feld = await screen.findByRole("combobox", { name: i18n.t("bankabruf.feldBankSuche") });
    await vi.waitFor(() => expect(feld).not.toBeDisabled());
    await nutzer.type(feld, "Vibora");
    await screen.findByRole("listbox");
    await nutzer.keyboard("{Enter}");
    expect(gewaehlt).toEqual(["99999903"]);
  });
});
