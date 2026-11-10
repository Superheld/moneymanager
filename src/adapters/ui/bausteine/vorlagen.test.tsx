/** @vitest-environment jsdom */
// Die Bausteine aus der Design-System-Vorlage — `Button`, `Pill`, `KPIStat`, `Dialog`.
//
// **Warum sie einen eigenen Test brauchen.** Sie liegen als `.jsx` mit handgeschriebener
// `.d.ts` daneben: der Compiler prüft ihr Inneres nicht, und bis 2026-11-10 zählte die
// Coverage sie auch nicht mit (`include` nannte nur `.ts` und `.tsx`). Sie waren damit
// der einzige Code der App, den weder der Übersetzer noch die Messung sah — und
// zugleich der meistbenutzte. Die Screen-Tests fahren sie mit, aber nur auf den Wegen,
// die ein Screen gerade braucht.
//
// Geprüft wird VERHALTEN (was klickt, was erscheint, was die Vorlesehilfe findet) und
// die eine Sorte Aussehen, die eine Aussage ist: welche Farbe eine Variante trägt.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, Dialog, KPIStat, Pill } from "./index";

describe("Button", () => {
  it("meldet den Klick", async () => {
    const klick = vi.fn();
    render(<Button onClick={klick}>Speichern</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(klick).toHaveBeenCalledTimes(1);
  });

  it("setzt das Plus vor die Beschriftung, wenn verlangt", () => {
    render(<Button plus>Konto</Button>);
    expect(screen.getByRole("button").textContent).toBe("+Konto");
  });

  it("unterscheidet die Varianten sichtbar", () => {
    render(
      <>
        <Button>Normal</Button>
        <Button variant="primary">Haupt</Button>
        <Button variant="ghost">Still</Button>
      </>,
    );
    const farbe = (name: string) => screen.getByRole("button", { name }).style.background;
    expect(farbe("Haupt")).toBe("var(--accent)");
    expect(farbe("Still")).toBe("transparent");
    expect(farbe("Normal")).toBe("var(--surface)");
  });

  it("fällt bei einer unbekannten Variante auf die normale zurück, statt zu werfen", () => {
    // @ts-expect-error — genau der Fall, den die .d.ts verbietet und das JS trotzdem bekommt
    render(<Button variant="gibtsnicht">Egal</Button>);
    expect(screen.getByRole("button", { name: "Egal" }).style.background).toBe("var(--surface)");
  });

  it("lässt den Aufrufer den Stil ergänzen", () => {
    render(<Button style={{ marginLeft: "auto" }}>Rechts</Button>);
    expect(screen.getByRole("button").style.marginLeft).toBe("auto");
  });
});

describe("Pill", () => {
  it("zeigt ihren Text", () => {
    render(<Pill>geplant</Pill>);
    expect(screen.getByText("geplant")).toBeTruthy();
  });

  it("färbt Warnung und Entwarnung verschieden", () => {
    render(
      <>
        <Pill variant="warn">knapp</Pill>
        <Pill variant="ok">stabil</Pill>
        <Pill>neutral</Pill>
      </>,
    );
    expect(screen.getByText("knapp").style.color).toBe("var(--warn-deep)");
    expect(screen.getByText("stabil").style.color).toBe("var(--ok-deep)");
    expect(screen.getByText("neutral").style.color).toBe("var(--ink-3)");
  });

  it("zeichnet den Plan gestrichelt — er ist noch nicht geschehen", () => {
    render(<Pill variant="plan">Plan</Pill>);
    expect(screen.getByText("Plan").style.borderStyle).toBe("dashed");
  });

  it("fällt bei einer unbekannten Variante auf neutral zurück", () => {
    // @ts-expect-error — siehe oben
    render(<Pill variant="gibtsnicht">Etikett</Pill>);
    expect(screen.getByText("Etikett").style.color).toBe("var(--ink-3)");
  });
});

describe("KPIStat", () => {
  it("zeigt Beschriftung, Wert, Einheit und Zusatz", () => {
    render(<KPIStat label="Frei" value="120,00" unit="€" meta="bis Monatsende" />);
    for (const text of ["Frei", "120,00", "€", "bis Monatsende"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("lässt Einheit und Zusatz weg, wenn sie fehlen", () => {
    const { container } = render(<KPIStat label="Anzahl" value="3" />);
    expect(container.textContent).toBe("Anzahl3");
  });

  it("färbt den Wert nach dem Ton — und die Einheit mit", () => {
    render(<KPIStat label="Rest" value="-5,00" unit="€" tone="warn" />);
    expect(screen.getByText("-5,00").style.color).toBe("var(--warn-deep)");
    expect(screen.getByText("€").style.color).toBe("var(--warn-deep)");
  });

  it("lässt die Einheit im neutralen Ton zurücktreten", () => {
    render(<KPIStat label="Rest" value="5,00" unit="€" />);
    expect(screen.getByText("5,00").style.color).toBe("var(--ink)");
    expect(screen.getByText("€").style.color).toBe("var(--ink-2)");
  });

  it("trägt nur als Kachel einen eigenen Rahmen", () => {
    const { container, rerender } = render(<KPIStat label="a" value="1" />);
    expect((container.firstChild as HTMLElement).style.borderRadius).toBe("var(--r-lg)");
    rerender(<KPIStat label="a" value="1" size="hero" />);
    expect((container.firstChild as HTMLElement).style.borderRadius).toBe("");
  });

  it("stuft die Grösse des Werts", () => {
    const groesse = (size: "hero" | "tile" | "chip") => {
      const { unmount } = render(<KPIStat label="x" value="42" size={size} />);
      const fs = screen.getByText("42").style.fontSize;
      unmount();
      return fs;
    };
    expect(groesse("hero")).toBe("var(--fs-display)");
    expect(groesse("tile")).toBe("var(--fs-h1)");
    expect(groesse("chip")).toBe("var(--fs-h2)");
  });
});

describe("Dialog", () => {
  it("zeigt Titel, Untertitel, Inhalt und Fusszeile", () => {
    render(
      <Dialog title="Vertrag anlegen" subtitle="Schritt eins" footer={<button>Weiter</button>}>
        <p>Der Inhalt</p>
      </Dialog>,
    );
    expect(screen.getByRole("heading", { name: "Vertrag anlegen" })).toBeTruthy();
    expect(screen.getByText("Schritt eins")).toBeTruthy();
    expect(screen.getByText("Der Inhalt")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeTruthy();
  });

  it("schliesst über den Knopf", async () => {
    const zu = vi.fn();
    render(<Dialog title="Titel" onClose={zu}>Inhalt</Dialog>);
    await userEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(zu).toHaveBeenCalledTimes(1);
  });

  it("schliesst bei einem Klick auf den Hintergrund", async () => {
    const zu = vi.fn();
    const { container } = render(<Dialog title="Titel" onClose={zu}>Inhalt</Dialog>);
    await userEvent.click(container.firstChild as HTMLElement);
    expect(zu).toHaveBeenCalledTimes(1);
  });

  // Der Fall, der sonst Eingaben kostet: ein Klick IM Dialog steigt bis zum Hintergrund
  // auf und darf ihn nicht schliessen.
  it("schliesst NICHT bei einem Klick in den Inhalt", async () => {
    const zu = vi.fn();
    render(<Dialog title="Titel" onClose={zu}><p>Inhalt</p></Dialog>);
    await userEvent.click(screen.getByText("Inhalt"));
    await userEvent.click(screen.getByRole("heading", { name: "Titel" }));
    expect(zu).not.toHaveBeenCalled();
  });

  it("verträgt einen Klick auf den Hintergrund ohne Schliess-Funktion", async () => {
    const { container } = render(<Dialog title="Titel">Inhalt</Dialog>);
    await userEvent.click(container.firstChild as HTMLElement);
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });
});
