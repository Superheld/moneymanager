// Der Helfer entscheidet über zwei Dinge, die man leicht falsch macht: was bei LEERER
// Eingabe passiert, und ob das umgebende Formular abgeschickt wird.

import { describe, expect, it, vi } from "vitest";
import { beiEnter } from "./beiEnter";

function taste(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

describe("beiEnter", () => {
  it("löst bei Enter aus", () => {
    const fn = vi.fn();
    beiEnter(fn)(taste("Enter"));
    expect(fn).toHaveBeenCalled();
  });

  it("lässt jede andere Taste durch", () => {
    const fn = vi.fn();
    beiEnter(fn)(taste("a"));
    expect(fn).not.toHaveBeenCalled();
  });

  /**
   * Ein leeres Enter darf nichts tun: der Dialog verschwände, und niemand wüsste, ob
   * abgebrochen oder abgeschickt wurde. Ein Abbruch geschieht über das Schliessen.
   */
  it("tut nichts, wenn die Eingabe leer ist", () => {
    const fn = vi.fn();
    beiEnter(fn, false)(taste("Enter"));
    expect(fn).not.toHaveBeenCalled();
  });

  /** Sonst schickt der Browser ein umgebendes Formular ab — im Modal ein Neuladen. */
  it("hält das Standardverhalten an", () => {
    const e = taste("Enter");
    beiEnter(() => {})(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("hält es NICHT an, wenn gar nicht ausgelöst wird", () => {
    const e = taste("Enter");
    beiEnter(() => {}, false)(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
