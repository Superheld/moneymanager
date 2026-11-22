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
import { Modal } from "./Modal";

function baue(onNavigate: (id: string) => void = () => {}) {
  return render(
    <AppShell current="uebersicht" onNavigate={onNavigate as never}>
      <p>Inhalt</p>
    </AppShell>,
  );
}

const leiste = () => document.querySelector(".side") as HTMLElement;
/**
 * Der Weg in die Schublade. Bis 2026-11-22 war das der Griff (☰) in der Kopfleiste;
 * seitdem ist es „Mehr" in der Leiste unten, und den Griff gibt es nicht mehr.
 */
const griff = () => screen.getByRole("button", { name: i18n.t("shell.navMehr") });

describe("AppShell — die Schublade", () => {
  it("ist zu, bis jemand Mehr benutzt", async () => {
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

  it("bleibt offen, wenn Escape einem Dialog darueber galt", async () => {
    // Der Eigenbau des Modals las `defaultPrevented`, setzte es aber nie: eine Escape
    // schloss Dialog UND Schublade. Base UI verbraucht die Taste.
    const nutzer = userEvent.setup();
    const zu: string[] = [];
    const { rerender } = baue();
    await nutzer.click(griff());
    rerender(
      <AppShell current="uebersicht" onNavigate={(() => {}) as never}>
        <Modal title="Darueber" onClose={() => zu.push("dialog")}>Inhalt</Modal>
      </AppShell>,
    );

    await nutzer.keyboard("{Escape}");

    expect(zu).toEqual(["dialog"]);
    expect(leiste().dataset.offen).toBe("true");
  });

  it("schliesst ueber den Knopf in der Schublade und gibt den Fokus zurueck", async () => {
    const nutzer = userEvent.setup();
    baue();

    await nutzer.click(griff());
    await nutzer.click(screen.getByRole("button", { name: i18n.t("shell.menueSchliessen") }));

    expect(leiste().dataset.offen).toBe("false");
    // „Mehr" steht nach dem Schliessen sichtbar an derselben Stelle — es ist damit
    // das einzige Element, auf dem der Fokus nicht ins Leere zeigt.
    expect(document.activeElement).toBe(griff());
  });

  /** Die Kopfzeile beantwortet schmal die Frage, die die Marke nicht beantwortet. */
  it("nennt in der Kopfleiste den Bereich, in dem man steht", () => {
    baue();
    expect(document.querySelector(".topbar-titel")?.textContent).toBe(i18n.t("shell.navUebersicht"));
  });
});

describe("AppShell — die Leiste unten", () => {
  const eintraege = () =>
    [...document.querySelectorAll(".leiste .leiste-eintrag")].map((e) => e.textContent);

  function baueIn(current: string, versteckt?: string[], onNavigate: (id: string) => void = () => {}) {
    return render(
      <AppShell current={current as never} onNavigate={onNavigate as never} versteckt={versteckt as never}>
        <p>Inhalt</p>
      </AppShell>,
    );
  }

  /** Beschriftung aus derselben Tabelle wie die Schublade — nicht aus einer zweiten. */
  it("zeigt vier Bereiche und Mehr, beschriftet wie in der Schublade", () => {
    baueIn("uebersicht");
    expect(eintraege()).toEqual([
      i18n.t("shell.navUebersicht"),
      i18n.t("shell.navBuchungen"),
      i18n.t("shell.navRuecklagen"),
      i18n.t("shell.navBudgets"),
      i18n.t("shell.navMehr"),
    ]);
  });

  it("markiert den Bereich, in dem man steht", () => {
    baueIn("konten");
    const leisteNav = document.querySelector(".leiste") as HTMLElement;
    const aktiv = [...leisteNav.querySelectorAll("[aria-current]")];
    expect(aktiv.map((e) => [e.textContent, e.getAttribute("aria-current")])).toEqual([
      [i18n.t("shell.navBuchungen"), "page"],
    ]);
  });

  /** Ohne eigenen Eintrag ist „Mehr" der Weg dorthin — und damit das, was leuchtet. */
  it("markiert Mehr, wenn der Bereich keinen eigenen Eintrag hat", () => {
    baueIn("analyse");
    const leisteNav = document.querySelector(".leiste") as HTMLElement;
    const aktiv = [...leisteNav.querySelectorAll("[aria-current]")];
    expect(aktiv.map((e) => e.textContent)).toEqual([i18n.t("shell.navMehr")]);
    expect(griff()).toHaveAttribute("aria-current", "true");
  });

  it("wechselt den Bereich und laesst die Schublade zu", async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    baueIn("uebersicht", undefined, (id) => gewaehlt.push(id));

    await nutzer.click(screen.getByRole("button", { name: i18n.t("shell.navRuecklagen") }));

    expect(gewaehlt).toEqual(["ruecklagen"]);
    expect(leiste().dataset.offen).toBe("false");
  });

  it("oeffnet mit Mehr die Schublade mit allen Bereichen", async () => {
    const nutzer = userEvent.setup();
    baueIn("uebersicht");

    await nutzer.click(griff());

    expect(leiste().dataset.offen).toBe("true");
    expect(griff()).toHaveAttribute("aria-controls", "hauptnavigation");
    // Auch die, die unten keinen Eintrag haben.
    expect(screen.getByTitle(i18n.t("shell.navEinstellungen"))).toBeInTheDocument();
  });

  /** Nicht aufgefüllt: an derselben Stelle stuende sonst je nach Einstellung etwas anderes. */
  it("laesst einen versteckten Bereich weg, statt aufzufuellen", () => {
    baueIn("uebersicht", ["ruecklagen"]);
    expect(eintraege()).toEqual([
      i18n.t("shell.navUebersicht"),
      i18n.t("shell.navBuchungen"),
      i18n.t("shell.navBudgets"),
      i18n.t("shell.navMehr"),
    ]);
  });
});
