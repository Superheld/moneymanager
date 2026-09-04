/** @vitest-environment jsdom */
// Die Karte „Da ist etwas zu tun" — und die eine Zusicherung, um die es hier geht.
//
// Unter der Liste standen bis zum 04.09.2026 ZWEI Aussagen in EINEM Absatz: was die
// Pillen „sicher" und „erwartet" bedeuten (eine ERKLAERUNG — hilft beim ersten Mal, ist
// beim zehnten Ballast) und was es heisst, wenn ein Konto hier NICHT steht (eine
// EINSCHRAENKUNG dessen, was die Karte ueberhaupt behauptet).
//
// Solange beides ein Absatz war, haette jedes Wegraeumen der Erklaerung die
// Einschraenkung mitgenommen — und eine leere Karte laese sich dann als Freigabe.

import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../../i18n/i18n";
import type { Kontovorschau } from "../../../application";
import { HandlungsbedarfKarte } from "./HandlungsbedarfKarte";

const bedarf: Kontovorschau[] = [
  {
    kontoId: "k1",
    start: 50_000,
    fest: { tiefstand: -3_000, tiefstandAm: "2026-09-20", minusAb: "2026-09-20" },
    erwartet: { tiefstand: -8_000, tiefstandAm: "2026-09-20", minusAb: "2026-09-20" },
  },
];

function schmalStellen(an: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (media: string) => ({
      matches: an, media, onchange: null,
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
      addListener() {}, removeListener() {},
    }),
  });
}

function zeige() {
  return render(
    <HandlungsbedarfKarte
      bedarf={bedarf}
      kontoNamen={new Map([["k1", "Girokonto"]])}
      bisTag="2026-10-15"
    />,
  );
}

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

describe("HandlungsbedarfKarte — die zwei Raenge", () => {
  it("laesst die EINSCHRAENKUNG schmal offen stehen", () => {
    schmalStellen(true);
    const { container } = zeige();
    const hinweis = screen.getByText(i18n.t("uebersicht.bedarfHinweis"));
    expect(hinweis).toBeInTheDocument();
    // Nicht eingeklappt: was die Aussage begrenzt, darf nicht hinter einem Deckel liegen.
    expect(container.querySelector("details")?.contains(hinweis)).not.toBe(true);
  });

  it("klappt die ERKLAERUNG schmal ein — hinter eine ausgeschriebene Frage", () => {
    schmalStellen(true);
    const { container } = zeige();
    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    expect(details!.querySelector("summary")?.textContent).toBe(i18n.t("uebersicht.bedarfLegendeFrage"));
    // Der Text ist da, nur zugeklappt — das ist der Unterschied zum Streichen.
    expect(details!.textContent).toContain(i18n.t("uebersicht.bedarfLegende"));
  });

  it("zeigt breit beides offen", () => {
    schmalStellen(false);
    const { container } = zeige();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText(i18n.t("uebersicht.bedarfLegende"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("uebersicht.bedarfHinweis"))).toBeInTheDocument();
  });

  /** Ohne Bedarf verschwindet die Karte ganz — sonst waere sie nach zwei Wochen unsichtbar. */
  it("rendert nichts, wenn nichts anliegt", () => {
    schmalStellen(true);
    const { container } = render(
      <HandlungsbedarfKarte bedarf={[]} kontoNamen={new Map()} bisTag="2026-10-15" />,
    );
    expect(container.textContent).toBe("");
  });
});
