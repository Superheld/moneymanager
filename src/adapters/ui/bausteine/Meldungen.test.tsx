/** @vitest-environment jsdom */
// `Meldungen` — der Weg, auf dem ein Fehler ausserhalb des Zeichnens sichtbar wird.
// Vorher endete er als leere Liste oder gar nicht.

import { act } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n/i18n";
import { fehlerMelden, Meldungen } from "./Meldungen";

/**
 * Die sichtbare Meldung. Base UI legt für Vorlesehilfen eine zweite, unsichtbare Ansage
 * desselben Textes an — eine Suche über das ganze Dokument fände beide.
 */
async function meldung(text: string) {
  const kasten = await waitFor(() => {
    const k = document.querySelector(".meldung");
    if (!k) throw new Error("keine Meldung");
    return k as HTMLElement;
  });
  return within(kasten).findByText(text);
}

describe("Meldungen", () => {
  it("zeigt einen gemeldeten Fehler mit seiner Nachricht", async () => {
    render(<Meldungen><p>Inhalt</p></Meldungen>);
    act(() => fehlerMelden(new Error("Datenbank antwortet nicht")));
    expect(await meldung("Datenbank antwortet nicht")).toBeInTheDocument();
    expect(await meldung(i18n.t("meldung.fehlerTitel"))).toBeInTheDocument();
    // Und angesagt wird er — über die Ansage, nicht über die sichtbare Meldung.
    expect(await screen.findByRole("alert")).toHaveTextContent("Datenbank antwortet nicht");
  });

  it("fängt eine Ablehnung, die niemand behandelt hat", async () => {
    render(<Meldungen><p>Inhalt</p></Meldungen>);
    // jsdom kennt `PromiseRejectionEvent` nicht; der Lauscher liest nur `reason`.
    const ereignis = Object.assign(new Event("unhandledrejection"), { reason: new Error("Klick ging ins Leere") });
    act(() => {
      window.dispatchEvent(ereignis);
    });
    expect(await meldung("Klick ging ins Leere")).toBeInTheDocument();
  });

  it("lässt sich schliessen, und der Knopf trägt einen Namen", async () => {
    render(<Meldungen><p>Inhalt</p></Meldungen>);
    act(() => fehlerMelden(new Error("Weg damit")));
    await meldung("Weg damit");
    // Über die Klasse: eine Meldung mit hoher Priorität sagt Base UI über ein eigenes
    // `role="alert"` an und blendet die sichtbare für Vorlesehilfen aus — sonst hörte man
    // sie doppelt. Mit der Tastatur erreichbar bleibt der Knopf (`tabindex`).
    const zu = document.querySelector(".meldung-zu") as HTMLElement;
    expect(zu.getAttribute("aria-label")).toBe(i18n.t("meldung.schliessen"));
    await userEvent.click(zu);
    await waitFor(() => expect(document.querySelector(".meldung")).toBeNull());
  });

  it("nimmt den Lauscher beim Abbau wieder weg", async () => {
    const { unmount } = render(<Meldungen><p>Inhalt</p></Meldungen>);
    unmount();
    render(<p>ohne Meldungen</p>);
    const ereignis = Object.assign(new Event("unhandledrejection"), { reason: new Error("niemand hört zu") });
    act(() => {
      window.dispatchEvent(ereignis);
    });
    expect(document.querySelector(".meldung")).toBeNull();
  });
});
