/** @vitest-environment jsdom */
// Registerleiste schmal: der aktive Reiter steht beim Öffnen im Bild.
//
// jsdom rechnet kein Layout; die Lage von Leiste und Reiter wird deshalb vorgegeben,
// wie sie bei 390 px gemessen ist — eine Leiste, die bis 358 px reicht, und ein aktiver
// Reiter dahinter. Der Verlauf an der Kante ist CSS und wird am Text der Regel geprüft.

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aktivenReiterZeigen, Registerleiste } from "./Registerleiste";

const REGISTER = [
  { id: "a", label: "Erstes" },
  { id: "b", label: "Zweites" },
  { id: "c", label: "Drittes" },
];

function lage(el: Element, links: number, rechts: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ left: links, right: rechts, top: 0, bottom: 40, width: rechts - links, height: 40, x: links, y: 0, toJSON: () => ({}) });
}

afterEach(() => vi.restoreAllMocks());

describe("Registerleiste schmal", () => {
  it("rückt einen aktiven Reiter hinter der rechten Kante ins Bild, vor den Rand des Verlaufs", () => {
    render(<Registerleiste register={REGISTER} aktiv="c" onWahl={() => {}} />);
    const liste = screen.getByRole("tablist");
    const reiter = screen.getByRole("tab", { name: "Drittes" });
    lage(liste, 16, 374);
    lage(reiter, 358, 448);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ scrollPaddingInlineEnd: "32px" } as CSSStyleDeclaration);

    aktivenReiterZeigen(liste);

    // 448 soll bei 374 − 32 enden: 106 px nach rechts gerollt.
    expect(liste.scrollLeft).toBe(106);
  });

  it("tut das von selbst, sobald die Leiste erscheint", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const [links, rechts] = this.getAttribute("role") === "tablist" ? [16, 374] : this.hasAttribute("data-active") ? [358, 448] : [0, 0];
      return { left: links, right: rechts, top: 0, bottom: 40, width: rechts - links, height: 40, x: links, y: 0, toJSON: () => ({}) };
    });
    render(<Registerleiste register={REGISTER} aktiv="c" onWahl={() => {}} />);
    expect(screen.getByRole("tablist").scrollLeft).toBeGreaterThan(0);
  });

  it("rückt einen Reiter links der Kante zurück", () => {
    render(<Registerleiste register={REGISTER} aktiv="a" onWahl={() => {}} />);
    const liste = screen.getByRole("tablist");
    liste.scrollLeft = 50;
    lage(liste, 16, 374);
    lage(screen.getByRole("tab", { name: "Erstes" }), -34, 30);

    aktivenReiterZeigen(liste);

    expect(liste.scrollLeft).toBe(0);
  });

  it("lässt die Leiste stehen, wenn der aktive Reiter schon im Bild ist", () => {
    render(<Registerleiste register={REGISTER} aktiv="b" onWahl={() => {}} />);
    const liste = screen.getByRole("tablist");
    lage(liste, 16, 374);
    lage(screen.getByRole("tab", { name: "Zweites" }), 100, 180);

    aktivenReiterZeigen(liste);

    expect(liste.scrollLeft).toBe(0);
  });

  it("zeigt schmal einen Verlauf an der rechten Kante, breit nicht", () => {
    const css = readFileSync(join(__dirname, "../../../styles/app.css"), "utf8");
    expect(css).toMatch(/\.registerleiste::after \{[^}]*position: sticky;[^}]*right: 0;[^}]*background: linear-gradient\(to right, transparent, var\(--cream\)/);
    expect(css).toMatch(/@media \(min-width: 700px\) \{[^@]*\.registerleiste::after \{\s*content: none;/);
  });
});
