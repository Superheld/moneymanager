// Konsistenz der Übersetzungs-Bundles.
//
// Deutsch ist die Quelle der Wahrheit fürs Wording (ADR-0004), Englisch der Beweis, dass
// die Schicht trägt. Genau das prüfen diese Tests: dass beide Bundles denselben Baum
// haben. Eine fehlende englische Übersetzung fällt in der App sonst nicht auf — i18next
// fällt still auf Deutsch zurück, und ein deutscher Satz mitten in der englischen
// Oberfläche sieht aus wie ein Wortproblem, nicht wie eine Lücke.

import { describe, expect, it } from "vitest";
import i18n, { SPRACHEN } from "./i18n";

type Baum = Record<string, unknown>;

/** Alle Blattpfade eines Bundles, z. B. "fehler.betrag.groesserNull". */
function pfade(baum: Baum, prefix = ""): string[] {
  return Object.entries(baum).flatMap(([schluessel, wert]) => {
    const pfad = prefix ? `${prefix}.${schluessel}` : schluessel;
    return wert !== null && typeof wert === "object"
      ? pfade(wert as Baum, pfad)
      : [pfad];
  });
}

function bundle(sprache: string): Baum {
  return i18n.getResourceBundle(sprache, "translation") as Baum;
}

describe("Übersetzungs-Bundles", () => {
  it("kennt alle deklarierten Sprachen", () => {
    for (const s of SPRACHEN) {
      expect(bundle(s.code), `Bundle fehlt: ${s.code}`).toBeTruthy();
    }
  });

  it("hat in jeder Sprache dieselben Schlüssel wie Deutsch", () => {
    const deutsch = pfade(bundle("de")).sort();
    for (const s of SPRACHEN.filter((x) => x.code !== "de")) {
      const andere = pfade(bundle(s.code)).sort();
      const fehlend = deutsch.filter((p) => !andere.includes(p));
      const ueberzaehlig = andere.filter((p) => !deutsch.includes(p));
      expect(fehlend, `fehlt in ${s.code}`).toEqual([]);
      expect(ueberzaehlig, `nur in ${s.code}`).toEqual([]);
    }
  });

  it("hat nirgends leere Texte", () => {
    for (const s of SPRACHEN) {
      const b = bundle(s.code);
      const leer = pfade(b).filter((p) => {
        const wert = p.split(".").reduce<unknown>((o, k) => (o as Baum)?.[k], b);
        return typeof wert !== "string" || wert.trim() === "";
      });
      expect(leer, `leere Texte in ${s.code}`).toEqual([]);
    }
  });

  it("verwendet in beiden Sprachen dieselben Platzhalter je Schlüssel", () => {
    // „Übernommen: {{neu}} neu · {{duplikate}} Duplikate" — fehlt ein Platzhalter in der
    // Übersetzung, verschwindet die Zahl in der Oberfläche kommentarlos.
    const platzhalter = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const de = bundle("de");
    for (const s of SPRACHEN.filter((x) => x.code !== "de")) {
      const b = bundle(s.code);
      for (const pfad of pfade(de)) {
        const lies = (baum: Baum) =>
          pfad.split(".").reduce<unknown>((o, k) => (o as Baum)?.[k], baum);
        const a = lies(de);
        const c = lies(b);
        if (typeof a === "string" && typeof c === "string") {
          expect(platzhalter(c), `Platzhalter weichen ab bei ${pfad} (${s.code})`).toEqual(
            platzhalter(a),
          );
        }
      }
    }
  });

  it("übersetzt die Enum-Labels für jeden gespeicherten Charakter-Wert", () => {
    // Gespeicherte Enum-Werte sind Code-Konstanten und werden nie umgespeichert; nur ihr
    // Label ist übersetzt. Fehlt eins, zeigt die Oberfläche den rohen Schlüssel.
    for (const wert of ["Aufwand", "Ertrag", "Umschichtung"]) {
      for (const s of SPRACHEN) {
        const label = i18n.getFixedT(s.code)(`charakter.${wert}`);
        expect(label, `${wert} in ${s.code}`).not.toBe(`charakter.${wert}`);
      }
    }
  });
});
