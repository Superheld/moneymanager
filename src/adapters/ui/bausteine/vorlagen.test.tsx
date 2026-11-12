/** @vitest-environment jsdom */
// Die Bausteine aus der Design-System-Vorlage — `Button`, `Pill`, `KPIStat`, `Card`,
// `CoverageTrack`.
// Seit 2026-11-10 sind alle TypeScript; `Dialog` ist in `Modal` aufgegangen (siehe
// `Modal.test.tsx`), `DataTable` und `FormField` haben eigene Tests.
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

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, Card, CoverageTrack, KPIStat, Pill } from "./index";

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

  it("unterscheidet die Varianten über ihre Klasse", () => {
    // Das Aussehen steht seit 2026-11-10 in app.css (`.btn`), nicht mehr inline — jsdom
    // lädt das Stylesheet nicht, also wird die Klasse geprüft, die es auswählt.
    render(
      <>
        <Button>Normal</Button>
        <Button variant="primary">Haupt</Button>
        <Button variant="ghost">Still</Button>
        <Button variant="link">Abbrechen</Button>
      </>,
    );
    const klasse = (name: string) => screen.getByRole("button", { name }).className;
    expect(klasse("Normal")).toBe("btn");
    expect(klasse("Haupt")).toBe("btn btn--primary");
    expect(klasse("Still")).toBe("btn btn--ghost");
    expect(klasse("Abbrechen")).toBe("btn btn--link");
  });

  it("fällt bei einer unbekannten Variante auf die normale zurück, statt zu werfen", () => {
    // @ts-expect-error — genau der Fall, den der Typ verbietet und ein Aufruf trotzdem bringen kann
    render(<Button variant="gibtsnicht">Egal</Button>);
    expect(screen.getByRole("button", { name: "Egal" }).className).toBe("btn");
  });

  it("lässt den Aufrufer den Stil ergänzen", () => {
    render(<Button style={{ marginLeft: "auto" }}>Rechts</Button>);
    expect(screen.getByRole("button").style.marginLeft).toBe("auto");
  });

  it("schickt kein Formular ab, ausser es ist verlangt", async () => {
    // Ohne `type` nimmt der Browser `submit` — ein „Abbrechen" in einem <form> schickte
    // es dann ab.
    const abschicken = vi.fn((e: Event) => e.preventDefault());
    render(
      <form onSubmit={(e) => abschicken(e.nativeEvent)}>
        <Button>Abbrechen</Button>
        <Button type="submit">Senden</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(abschicken).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Senden" }));
    expect(abschicken).toHaveBeenCalledTimes(1);
  });

  it("nimmt gesperrt keinen Klick an", async () => {
    const klick = vi.fn();
    render(<Button disabled onClick={klick}>Speichern</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(klick).not.toHaveBeenCalled();
  });

  it("sperrt sich, solange er läuft, und meldet sich beschäftigt", async () => {
    const klick = vi.fn();
    render(<Button laeuft onClick={klick}>Wechseln</Button>);
    const knopf = screen.getByRole("button", { name: "Wechseln" });
    expect(knopf.getAttribute("aria-disabled")).toBe("true");
    expect(knopf.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(knopf);
    expect(klick).not.toHaveBeenCalled();
  });

  it("sperrt über aria-disabled, nicht über das Attribut — damit der Fokus stehen bleibt", async () => {
    // Der Grund für Base UI darunter: ein natives `disabled` schiebt im Browser den Fokus
    // auf <body>. jsdom tut das NICHT (nachgemessen: mit nativem `disabled` bliebe ein
    // reiner Fokus-Test grün), also wird geprüft, was den Fokus im Browser hält — kein
    // `disabled`-Attribut, und der Knopf bleibt in der Tab-Reihenfolge.
    function Laeufer() {
      const [laeuft, setLaeuft] = useState(false);
      return <Button laeuft={laeuft} onClick={() => setLaeuft(true)}>Starten</Button>;
    }
    render(<Laeufer />);
    const knopf = screen.getByRole("button", { name: "Starten" });
    knopf.focus();
    await userEvent.keyboard("{Enter}");
    expect(knopf.getAttribute("aria-busy")).toBe("true");
    expect(knopf.hasAttribute("disabled")).toBe(false);
    expect(knopf.tabIndex).toBe(0);
  });

  it("reicht Namen und Zustand an die Vorlesehilfe durch", () => {
    render(<Button aria-label="Abschnitt öffnen" aria-expanded={false} title="Mehr zeigen">▸</Button>);
    const knopf = screen.getByRole("button", { name: "Abschnitt öffnen" });
    expect(knopf.getAttribute("aria-expanded")).toBe("false");
    expect(knopf.getAttribute("title")).toBe("Mehr zeigen");
    expect(knopf.hasAttribute("aria-busy")).toBe(false);
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

describe("Card", () => {
  it("zeigt Kopf, Untertitel und Aktion nur, wenn es sie gibt", () => {
    const { container, rerender } = render(<Card>nur Inhalt</Card>);
    // Ohne Titel und Aktion kein Kopf: die Karte trägt nur ihren Text.
    expect((container.firstChild as HTMLElement).children).toHaveLength(0);
    rerender(<Card title="Konten" subtitle="alle" action={<button>Neu</button>}>Inhalt</Card>);
    expect(screen.getByText("Konten")).toBeTruthy();
    expect(screen.getByText("alle")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Neu" })).toBeTruthy();
  });

  it("schwebt nur auf Wunsch und lässt sich ohne Polster stellen", () => {
    const { container, rerender } = render(<Card>x</Card>);
    const flaeche = () => container.firstChild as HTMLElement;
    expect(flaeche().style.boxShadow).toBe("var(--shadow-none)");
    expect(flaeche().style.padding).toBe("var(--pad-card)");
    rerender(<Card floating pad={false}>x</Card>);
    expect(flaeche().style.boxShadow).toBe("var(--shadow-card)");
    expect(flaeche().style.padding).toBe("0px");
  });
});

describe("CoverageTrack", () => {
  // Seit 2026-11-11: ein Strich auf derselben Skala wie der Wert (das Soll einer Rücklage).
  it("setzt die Marke an ihren Anteil am Maximum", () => {
    const { container } = render(<CoverageTrack value={30} max={200} marke={50} name="Stand" />);
    const strich = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(strich.style.left).toBe("calc(25% - 1px)");
  });

  it("zeichnet ohne Marke keinen Strich", () => {
    const { container } = render(<CoverageTrack value={30} max={200} name="Stand" />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  // Vorher zwei div-Kästen: für eine Vorlesehilfe gab es den Balken nicht.
  it("meldet sich als Messwert mit Grenzen", () => {
    render(<CoverageTrack value={30} max={60} label="Lebensmittel" />);
    const balken = screen.getByRole("meter", { name: "Lebensmittel" });
    expect(balken.getAttribute("aria-valuenow")).toBe("30");
    expect(balken.getAttribute("aria-valuemax")).toBe("60");
  });

  it("sagt über dem Ziel, um wie viel — der Wert selbst ist gekappt", () => {
    render(<CoverageTrack value={620} max={600} label="Budget" right="620 / 600" />);
    const balken = screen.getByRole("meter", { name: "Budget" });
    expect(balken.getAttribute("aria-valuenow")).toBe("600");
    expect(balken.getAttribute("aria-valuetext")).toBe("620 / 600");
    expect(screen.getByText("620 / 600").style.color).toBe("var(--warn-deep)");
  });

  it("nimmt eine erzwungene Überschreitung und ein Ziel von null hin", () => {
    const { container } = render(<CoverageTrack value={5} max={0} over />);
    const fuellung = container.querySelector("[data-ueber]") as HTMLElement;
    expect(fuellung.style.background).toBe("var(--warn)");
    expect(fuellung.style.width).toBe("100%");
  });
});
