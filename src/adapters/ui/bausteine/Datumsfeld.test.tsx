/** @vitest-environment jsdom */
// Das Datumsfeld. Geprüft wird vor allem, was ein selbstgebauter Kalender erfahrungsgemäß
// falsch macht: das Tippen, die Tastatur im Blatt, den Monatsübergang und kaputte Werte.
//
// `heute` wird überall hereingereicht — ein Test, der die echte Uhr liest, wird am
// Monatsersten rot und niemand weiß warum.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Seiteneffekt-Import: initialisiert i18next auf „de". Ohne ihn rendert t() den
// Schluesselpfad, und `i18n.language` ist leer — dann faellt auch `Intl` auf die
// System-Sprache zurueck und der Kalender kommt auf Englisch heraus.
import "../../../i18n/i18n";
import { Datumsfeld } from "./Datumsfeld";

const HEUTE = "2026-03-12";

function feld(over: Partial<Parameters<typeof Datumsfeld>[0]> = {}) {
  const gemeldet = vi.fn();
  render(
    <Datumsfeld wert="2026-03-05" aufAenderung={gemeldet} heute={HEUTE} ariaLabel="Datum" {...over} />,
  );
  return gemeldet;
}

const eingabe = () => screen.getByRole("textbox", { name: "Datum" });
const kalenderKnopf = () => screen.getByRole("button", { name: "Kalender öffnen" });

describe("Datumsfeld — Anzeige", () => {
  it("zeigt das Datum lesbar, nicht als ISO", () => {
    feld();
    expect(eingabe()).toHaveValue("05.03.2026");
  });

  it("bleibt leer, solange nichts gewählt ist", () => {
    feld({ wert: "" });
    expect(eingabe()).toHaveValue("");
  });

  it("überlebt einen unlesbaren Wert, statt den Dialog mitzureißen", () => {
    // Ein Formularfeld bekommt zwangsläufig auch mal Müll zu sehen. `parseIso` im Kern
    // WIRFT bei so etwas — deshalb liest dieses Feld selbst und nachsichtig.
    feld({ wert: "Quatsch" });
    expect(eingabe()).toHaveValue("");
  });

  it("nimmt den 31. Februar nicht an", () => {
    feld({ wert: "2026-02-31" });
    expect(eingabe()).toHaveValue("");
  });

  it("folgt einer Änderung von außen", () => {
    // Zurücksetzen eines Formulars oder ein anderer Datensatz — das Feld darf dann nicht
    // auf dem alten Text stehenbleiben.
    const { rerender } = render(<Datumsfeld wert="2026-03-05" aufAenderung={() => {}} heute={HEUTE} ariaLabel="D" />);
    rerender(<Datumsfeld wert="2026-09-30" aufAenderung={() => {}} heute={HEUTE} ariaLabel="D" />);
    expect(screen.getByRole("textbox", { name: "D" })).toHaveValue("30.09.2026");
  });
});

describe("Datumsfeld — tippen", () => {
  it("nimmt ein getipptes Datum an", async () => {
    // Der Grund, warum das Feld eine Eingabe ist und kein blosser Knopf: wer das Datum
    // kennt, tippt es schneller, als er es im Kalender sucht.
    const nutzer = userEvent.setup();
    const gemeldet = feld();
    await nutzer.clear(eingabe());
    await nutzer.type(eingabe(), "24.12.2026");
    await nutzer.tab();
    expect(gemeldet).toHaveBeenCalledWith("2026-12-24");
  });

  it("versteht auch einstellige Eingaben und andere Trennzeichen", async () => {
    const nutzer = userEvent.setup();
    const gemeldet = feld();
    await nutzer.clear(eingabe());
    await nutzer.type(eingabe(), "3/7/2026");
    await nutzer.tab();
    expect(gemeldet).toHaveBeenCalledWith("2026-07-03");
  });

  it("versteht durchgetippte Ziffern ohne Trenner", async () => {
    const nutzer = userEvent.setup();
    const gemeldet = feld();
    await nutzer.clear(eingabe());
    await nutzer.type(eingabe(), "01022026");
    await nutzer.tab();
    expect(gemeldet).toHaveBeenCalledWith("2026-02-01");
  });

  it("versteht ISO, egal welche Sprache eingestellt ist", async () => {
    // So steht es in der Datenbank. Wer es eintippt, meint es auch so.
    const nutzer = userEvent.setup();
    const gemeldet = feld();
    await nutzer.clear(eingabe());
    await nutzer.type(eingabe(), "2026-11-08");
    await nutzer.tab();
    expect(gemeldet).toHaveBeenCalledWith("2026-11-08");
  });

  it("übernimmt auch mit Enter, ohne das Feld zu verlassen", async () => {
    const nutzer = userEvent.setup();
    const gemeldet = feld();
    await nutzer.clear(eingabe());
    await nutzer.type(eingabe(), "24.12.2026{Enter}");
    expect(gemeldet).toHaveBeenCalledWith("2026-12-24");
  });

  it("verwirft Unlesbares und springt auf den letzten gültigen Stand zurück", async () => {
    const nutzer = userEvent.setup();
    const gemeldet = feld();
    await nutzer.clear(eingabe());
    await nutzer.type(eingabe(), "übermorgen");
    await nutzer.tab();
    expect(gemeldet).not.toHaveBeenCalled();
    expect(eingabe()).toHaveValue("05.03.2026");
  });

  it("verwirft einen Tag, den es nicht gibt", async () => {
    const nutzer = userEvent.setup();
    const gemeldet = feld();
    await nutzer.clear(eingabe());
    await nutzer.type(eingabe(), "31.02.2026");
    await nutzer.tab();
    expect(gemeldet).not.toHaveBeenCalled();
  });

  it("leert den Wert, wenn das Feld leergemacht wird", async () => {
    const nutzer = userEvent.setup();
    const gemeldet = feld();
    await nutzer.clear(eingabe());
    await nutzer.tab();
    expect(gemeldet).toHaveBeenCalledWith("");
  });
});

describe("Datumsfeld — Kalender", () => {
  it("meldet den angeklickten Tag als ISO", async () => {
    const nutzer = userEvent.setup();
    const gemeldet = feld();
    await nutzer.click(kalenderKnopf());
    await nutzer.click(await screen.findByRole("gridcell", { name: "17" }));
    expect(gemeldet).toHaveBeenCalledWith("2026-03-17");
  });

  it("öffnet auf dem Monat des gewählten Datums", async () => {
    const nutzer = userEvent.setup();
    feld({ wert: "2026-07-04" });
    await nutzer.click(kalenderKnopf());
    expect(await screen.findByRole("grid")).toHaveAccessibleName(/juli 2026/i);
  });

  it("blättert einen Monat weiter", async () => {
    const nutzer = userEvent.setup();
    feld();
    await nutzer.click(kalenderKnopf());
    await nutzer.click(await screen.findByRole("button", { name: "Nächster Monat" }));
    expect(await screen.findByRole("grid")).toHaveAccessibleName(/april 2026/i);
  });

  it("setzt mit „Heute“ den heutigen Tag", async () => {
    const nutzer = userEvent.setup();
    const gemeldet = feld();
    await nutzer.click(kalenderKnopf());
    await nutzer.click(await screen.findByRole("button", { name: "Heute" }));
    expect(gemeldet).toHaveBeenCalledWith(HEUTE);
  });

  it("bietet das Leeren gar nicht an, wenn nichts drinsteht", async () => {
    const nutzer = userEvent.setup();
    feld({ wert: "" });
    await nutzer.click(kalenderKnopf());
    expect(await screen.findByRole("button", { name: "Heute" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leeren" })).not.toBeInTheDocument();
  });
});

describe("Datumsfeld — Tastatur im Blatt", () => {
  async function offenesBlatt(over: Partial<Parameters<typeof Datumsfeld>[0]> = {}) {
    const nutzer = userEvent.setup();
    const gemeldet = feld(over);
    await nutzer.click(kalenderKnopf());
    (await screen.findByRole("grid")).focus();
    return { nutzer, gemeldet };
  }

  it("wandert mit den Pfeiltasten und wählt mit Enter", async () => {
    const { nutzer, gemeldet } = await offenesBlatt();
    await nutzer.keyboard("{ArrowRight}{Enter}");
    expect(gemeldet).toHaveBeenCalledWith("2026-03-06");
  });

  it("springt mit Pfeil nach unten eine Woche weiter", async () => {
    const { nutzer, gemeldet } = await offenesBlatt();
    await nutzer.keyboard("{ArrowDown}{Enter}");
    expect(gemeldet).toHaveBeenCalledWith("2026-03-12");
  });

  it("trägt beim Wandern über den Monatsrand den Monatswechsel mit", async () => {
    // Der Klassiker: der Fokus läuft auf Tag 0 oder 32 und das Blatt bleibt stehen.
    const { nutzer, gemeldet } = await offenesBlatt({ wert: "2026-03-01" });
    await nutzer.keyboard("{ArrowLeft}{Enter}");
    expect(gemeldet).toHaveBeenCalledWith("2026-02-28");
  });

  it("kappt beim Monatssprung auf das Monatsende", async () => {
    // 31. Januar plus ein Monat ist der 28. Februar und nicht der 3. März. Die
    // Datumsarithmetik von JavaScript macht daraus von selbst den März, und im Kalender
    // sähe es aus, als wäre der Februar übersprungen worden.
    const { nutzer, gemeldet } = await offenesBlatt({ wert: "2026-01-31" });
    await nutzer.keyboard("{PageDown}{Enter}");
    expect(gemeldet).toHaveBeenCalledWith("2026-02-28");
  });

  it("springt mit End an das Monatsende", async () => {
    const { nutzer, gemeldet } = await offenesBlatt();
    await nutzer.keyboard("{End}{Enter}");
    expect(gemeldet).toHaveBeenCalledWith("2026-03-31");
  });
});
