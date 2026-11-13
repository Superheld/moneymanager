/** @vitest-environment jsdom */
// Die Kleinbausteine — geprüft wird, was sie zusagen: Abstand aus der Token-Reihe, das
// richtige Element, und dass eine Trennlinie für die Vorlesehilfe eine ist.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stapel, Trenner, Zeile } from "./Anordnung";

describe("Zeile", () => {
  it("legt nebeneinander, mit Abstand aus der Reihe, und bricht um", () => {
    const { container } = render(<Zeile abstand={3}>a</Zeile>);
    const el = container.firstChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el.style.display).toBe("flex");
    expect(el.style.gap).toBe("var(--sp-3)");
    expect(el.style.flexWrap).toBe("wrap");
  });

  it("wird inline eine span und richtet aus, wie verlangt", () => {
    const { container } = render(<Zeile inline ausrichtung="start" umbruch={false}>a</Zeile>);
    const el = container.firstChild as HTMLElement;
    expect(el.tagName).toBe("SPAN");
    expect(el.style.alignItems).toBe("flex-start");
    expect(el.style.flexWrap).toBe("nowrap");
  });
});

describe("Stapel", () => {
  it("legt untereinander, mit Abstand statt marginTop", () => {
    const { container } = render(<Stapel abstand={5}><p>a</p><p>b</p></Stapel>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.flexDirection).toBe("column");
    expect(el.style.gap).toBe("var(--sp-5)");
  });
});

describe("Trenner", () => {
  it("ist für die Vorlesehilfe eine Grenze", () => {
    render(<Trenner />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("trägt ein Wort in der Mitte, zwischen zwei Linien", () => {
    render(<Trenner text="oder" />);
    expect(screen.getByText("oder")).toBeInTheDocument();
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });
});
