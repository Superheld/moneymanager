/** @vitest-environment jsdom */
// Die Schublade — der Zustand, den die Shell seit dem Umstieg auf mobile first hat.
//
// Was hier geprueft wird, ist nicht das Aussehen: welche der drei Stufen gilt, entscheidet
// eine Medienabfrage, und die kennt jsdom nicht. Geprueft wird der ZUSTAND, an dem das CSS
// haengt (`data-offen`) — und vor allem die drei Wege, die ihn wieder schliessen. Eine
// Schublade, die offen stehen bleibt, verdeckt auf einem Handy genau den Bereich, den sie
// gerade geoeffnet hat.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n/i18n";
import { AppShell } from "./AppShell";

function baue(onNavigate: (id: string) => void = () => {}) {
  return render(
    <AppShell current="uebersicht" onNavigate={onNavigate as never}>
      <p>Inhalt</p>
    </AppShell>,
  );
}

const leiste = () => document.querySelector(".side") as HTMLElement;
const griff = () => screen.getByRole("button", { name: i18n.t("shell.menueOeffnen") });

describe("AppShell — die Schublade", () => {
  it("ist zu, bis jemand den Griff benutzt", async () => {
    const nutzer = userEvent.setup();
    baue();

    expect(leiste().dataset.offen).toBe("false");
    expect(griff()).toHaveAttribute("aria-expanded", "false");

    await nutzer.click(griff());
    expect(leiste().dataset.offen).toBe("true");
    expect(griff()).toHaveAttribute("aria-expanded", "true");
  });

  /**
   * Der wichtigste der drei Wege: ohne ihn steht die Schublade nach dem Wechsel ueber dem
   * Bereich, den sie gerade geoeffnet hat — der Erfolg der Handlung waere unsichtbar.
   */
  it("schliesst, wenn ein Bereich gewaehlt wird", async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    baue((id) => gewaehlt.push(id));

    await nutzer.click(griff());
    await nutzer.click(screen.getByTitle(i18n.t("shell.navBudgets")));

    expect(gewaehlt).toEqual(["budgets"]);
    expect(leiste().dataset.offen).toBe("false");
  });

  it("schliesst mit Escape", async () => {
    const nutzer = userEvent.setup();
    baue();

    await nutzer.click(griff());
    await nutzer.keyboard("{Escape}");

    expect(leiste().dataset.offen).toBe("false");
  });

  it("schliesst ueber den Knopf in der Schublade und gibt den Fokus zurueck", async () => {
    const nutzer = userEvent.setup();
    baue();

    await nutzer.click(griff());
    await nutzer.click(screen.getByRole("button", { name: i18n.t("shell.menueSchliessen") }));

    expect(leiste().dataset.offen).toBe("false");
    // Der Griff steht nach dem Schliessen sichtbar an derselben Stelle — er ist damit
    // das einzige Element, auf dem der Fokus nicht ins Leere zeigt.
    expect(document.activeElement).toBe(griff());
  });

  /** Die Kopfzeile beantwortet schmal die Frage, die die Marke nicht beantwortet. */
  it("nennt in der Kopfleiste den Bereich, in dem man steht", () => {
    baue();
    expect(document.querySelector(".topbar-titel")?.textContent).toBe(i18n.t("shell.navUebersicht"));
  });
});
