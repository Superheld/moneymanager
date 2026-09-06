/** @vitest-environment jsdom */
// Der Wechsel einer Variante darf keine Stilwarnung ausloesen.
//
// `Pill` und `Button` setzen ihre Randfarbe je Variante. Solange die Basis den Rand als
// KURZFORM (`border: '1px solid …'`) hielt, entfernte React beim Wechsel zurueck auf eine
// Variante ohne eigene Farbe die Langform und meldete bei JEDEM Rerender:
// „Removing a style property during rerender (borderColor) when a conflicting property is
// set (border)". Im Betrieb war das eine Fehlerzeile je Rerender — sichtbar geworden ist
// es erst, als jemand die Konsole waehrend eines Abrufs mitlas.
//
// Der Test faengt genau diesen Wechsel ab, nicht die Schreibweise: eine kuenftige
// Umstellung darf die Kurzform wieder einfuehren, solange sie nicht mit einer Langform
// kollidiert.

import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Button, Pill } from "./index";

afterEach(() => vi.restoreAllMocks());

/** Sammelt, was React auf der Konsole meldet, waehrend die Variante wechselt. */
function beimWechsel(zuerst: React.ReactElement, danach: React.ReactElement): string[] {
  const meldungen: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    meldungen.push(args.map(String).join(" "));
  });
  const { rerender } = render(zuerst);
  rerender(danach);
  return meldungen;
}

describe("Randfarbe je Variante", () => {
  it("meldet nichts, wenn eine Pille ihre Variante verliert", () => {
    const meldungen = beimWechsel(<Pill variant="ok">fertig</Pill>, <Pill>fertig</Pill>);
    expect(meldungen.filter((m) => m.includes("conflicting property"))).toEqual([]);
  });

  it("meldet nichts, wenn eine Pille von gestrichelt auf durchgezogen wechselt", () => {
    // `plan` setzt zusaetzlich `borderStyle` — dieselbe Kollision eine Ebene weiter.
    const meldungen = beimWechsel(<Pill variant="plan">geplant</Pill>, <Pill variant="ist">gebucht</Pill>);
    expect(meldungen.filter((m) => m.includes("conflicting property"))).toEqual([]);
  });

  it("meldet nichts, wenn ein Knopf von primary auf default wechselt", () => {
    const meldungen = beimWechsel(<Button variant="primary">Abrufen</Button>, <Button>Abrufen</Button>);
    expect(meldungen.filter((m) => m.includes("conflicting property"))).toEqual([]);
  });
});
