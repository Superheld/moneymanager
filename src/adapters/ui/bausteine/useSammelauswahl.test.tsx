/** @vitest-environment jsdom */
// `useSammelauswahl` — die Mechanik, die Kontoauszug und Review-Inbox teilen.

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSammelauswahl } from "./useSammelauswahl";

describe("useSammelauswahl", () => {
  it("markiert, hebt auf und wählt alle sichtbaren", () => {
    const ids = ["a", "b", "c"];
    const { result } = renderHook(() => useSammelauswahl(ids));
    act(() => result.current.umschalten("b"));
    expect([...result.current.auswahl]).toEqual(["b"]);
    act(() => result.current.alleUmschalten());
    expect(result.current.alleGewaehlt).toBe(true);
    act(() => result.current.alleUmschalten());
    expect(result.current.auswahl.size).toBe(0);
  });

  it("vergisst beim Ausschalten des Modus die Auswahl", () => {
    const ids = ["a", "b"];
    const { result } = renderHook(() => useSammelauswahl(ids));
    act(() => result.current.modusSetzen(true));
    act(() => result.current.umschalten("a"));
    act(() => result.current.modusSetzen(false));
    expect(result.current.modus).toBe(false);
    expect(result.current.auswahl.size).toBe(0);
  });

  it("wirft aus der Auswahl, was nicht mehr sichtbar ist", () => {
    const { result, rerender } = renderHook(({ ids }) => useSammelauswahl(ids), { initialProps: { ids: ["a", "b", "c"] } });
    act(() => result.current.alleUmschalten());
    rerender({ ids: ["b"] });
    expect([...result.current.auswahl]).toEqual(["b"]);
    expect(result.current.alleGewaehlt).toBe(true);
  });

  it("hat bei leerer Liste nicht alles gewählt", () => {
    const { result } = renderHook(() => useSammelauswahl([]));
    expect(result.current.alleGewaehlt).toBe(false);
  });
});
