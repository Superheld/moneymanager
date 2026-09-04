/** @vitest-environment jsdom */
// Ein Datum in der Schreibweise des Nutzers.
//
// Der Testfall, um den es hier eigentlich geht, ist der zweite: neun Stellen der
// Oberflaeche schrieben die deutsche Reihenfolge fest, und in einer englischen Fassung
// stand damit `28.09.2026`, wo `9/28/2026` hingehoert. Das ist nicht dieselbe
// Unsauberkeit wie ein falsches Dezimalzeichen — `05.03.` und `03/05/` sind dieselben
// Ziffern mit anderer Bedeutung.

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { EXPERIMENTE_AUS, STANDARD_EINSTELLUNGEN } from "../../../application";
import { EinstellungenContext, useDatum } from "./einstellungenKontext";

function Probe({ iso }: { iso: string }) {
  const datum = useDatum();
  return (
    <>
      <span data-testid="mitJahr">{datum.mitJahr(iso)}</span>
      <span data-testid="kurz">{datum.kurz(iso)}</span>
      <span data-testid="ohneJahr">{datum.ohneJahr(iso)}</span>
    </>
  );
}

// Jeder Aufruf rendert seinen eigenen Baum — deshalb wird im `container` gesucht und
// nicht ueber `screen`. Auch das `getByTestId` des Render-Ergebnisses reicht nicht: es
// haengt am `body`, nicht am Baum, und zwei Vergleiche im selben Testfall finden dann
// beide Elemente.
function zeige(iso: string, locale: string) {
  const { container } = render(
    <EinstellungenContext.Provider
      value={{
        einstellungen: { ...STANDARD_EINSTELLUNGEN, locale },
        regionSetzen: async () => {},
        experimente: EXPERIMENTE_AUS,
        experimentSetzen: async () => {},
      }}
    >
      <Probe iso={iso} />
    </EinstellungenContext.Provider>,
  );
  const lies = (kennung: string) => container.querySelector(`[data-testid="${kennung}"]`)!.textContent;
  return { mitJahr: lies("mitJahr"), kurz: lies("kurz"), ohneJahr: lies("ohneJahr") };
}

describe("useDatum", () => {
  it("zeigt die drei Formen in deutscher Schreibweise", () => {
    expect(zeige("2026-09-28", "de-DE")).toEqual({
      mitJahr: "28.09.2026",
      kurz: "28.09.26",
      ohneJahr: "28.09.",
    });
  });

  /** Der eigentliche Grund fuer den Hook: die REIHENFOLGE gehoert der Locale. */
  it("dreht Tag und Monat, wo die Locale es verlangt", () => {
    expect(zeige("2026-09-28", "en-US").mitJahr).toBe("09/28/2026");
    expect(zeige("2026-09-28", "en-GB").mitJahr).toBe("28/09/2026");
  });

  /**
   * Ein ISO-Datum ist ein KALENDERTAG und keine Zeitangabe. Ohne feste Zone zoege ein
   * Rechner westlich von Greenwich jeden Tag um einen zurueck — aus dem Ersten wuerde
   * der Letzte des Vormonats, und in einer Monatsauswertung landete die Buchung im
   * falschen Monat.
   */
  it("rechnet in UTC und verschiebt keinen Tag", () => {
    expect(zeige("2026-01-01", "de-DE").mitJahr).toBe("01.01.2026");
  });

  /** Der Import traegt Zeitstempel; sie werden auf ihren Tag gekuerzt. */
  it("nimmt auch einen Zeitstempel an", () => {
    expect(zeige("2026-08-11T09:00:00.000Z", "de-DE").mitJahr).toBe("11.08.2026");
  });

  /**
   * Eine Anzeige ist kein Ort, an dem eine kaputte Zeile den Bildschirm leeren darf —
   * was sich nicht als Datum lesen laesst, kommt unveraendert zurueck.
   */
  it("gibt Unlesbares unveraendert zurueck", () => {
    expect(zeige("", "de-DE").mitJahr).toBe("");
    expect(zeige("keins", "de-DE").mitJahr).toBe("keins");
  });
});
