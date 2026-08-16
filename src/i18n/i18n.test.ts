// Konsistenz der Übersetzungs-Bundles.
//
// Deutsch ist die Quelle der Wahrheit fürs Wording (ADR-0004), Englisch der Beweis, dass
// die Schicht trägt. Genau das prüfen diese Tests: dass beide Bundles denselben Baum
// haben. Eine fehlende englische Übersetzung fällt in der App sonst nicht auf — i18next
// fällt still auf Deutsch zurück, und ein deutscher Satz mitten in der englischen
// Oberfläche sieht aus wie ein Wortproblem, nicht wie eine Lücke.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * Jeder Schlüssel, den der Code anfordert, muss im Bundle stehen.
 *
 * Fehlt er, wirft i18next nicht — es rendert den PFAD. In der Oberfläche steht dann
 * wörtlich „konten.bearbeiten" statt „bearbeiten", und das sieht aus wie eine fehlende
 * Übersetzung, nicht wie ein Tippfehler. Der Paritätstest oben findet das nicht: er
 * vergleicht die Bundles nur untereinander, und ein Schlüssel, den es in KEINER Sprache
 * gibt, ist zwischen ihnen konsistent.
 *
 * Erfasst werden nur statisch lesbare Aufrufe — t("a.b") und <Trans i18nKey="a.b">.
 * Zusammengesetzte Schlüssel (Template-Literale wie `konten.typ.${typ}`) bleiben außen
 * vor; die sind aus dem Quelltext nicht auflösbar.
 */
describe("Schlüssel im Code", () => {
  const WURZEL = new URL("..", import.meta.url).pathname;

  function quelldateien(verzeichnis: string): string[] {
    return readdirSync(verzeichnis, { withFileTypes: true }).flatMap((e) => {
      const pfad = join(verzeichnis, e.name);
      if (e.isDirectory()) return quelldateien(pfad);
      return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [pfad] : [];
    });
  }

  it("fordert keinen Schlüssel an, den es nicht gibt", () => {
    const fundstellen = new Map<string, string[]>();
    for (const datei of quelldateien(WURZEL)) {
      readFileSync(datei, "utf8").split("\n").forEach((zeile, i) => {
        const treffer = [
          ...zeile.matchAll(/\bt\(\s*"([^"${}]+)"/g),
          ...zeile.matchAll(/i18nKey=\{?"([^"${}]+)"/g),
        ];
        for (const m of treffer) {
          const ort = `${datei.slice(WURZEL.length)}:${i + 1}`;
          fundstellen.set(m[1], [...(fundstellen.get(m[1]) ?? []), ort]);
        }
      });
    }

    // Sicherung gegen einen still leerlaufenden Test: wenn das Sammeln kaputtgeht,
    // wäre die Liste leer und der Test grün, ohne irgendetwas geprüft zu haben.
    expect(fundstellen.size).toBeGreaterThan(100);

    const fehlend = [...fundstellen.entries()]
      .filter(([schluessel]) => !i18n.exists(schluessel))
      .map(([schluessel, orte]) => `${schluessel} (${orte.join(", ")})`);
    expect(fehlend).toEqual([]);
  });
});

/**
 * Sichtbare Texte kommen aus dem Bundle, nicht aus dem Quelltext.
 *
 * Das Gegenstück zum Test darüber: der prüft, dass angeforderte Schlüssel existieren —
 * dieser, dass überhaupt einer angefordert wird. Ein hartkodiertes `placeholder="suchen…"`
 * fällt sonst nirgends auf, es sieht in der deutschen Oberfläche ja richtig aus. Erst in
 * der englischen steht ein deutsches Wort mitten im Formular.
 *
 * Geprüft werden die Attribute, die der Nutzer LIEST. Reine Zahlen sind erlaubt (ein
 * Platzhalter „96" für Monate ist sprachfrei) — Beträge dagegen nicht: die gehören über
 * `geld.format(0)` formatiert, weil das Dezimaltrennzeichen an der Locale hängt.
 */
describe("Sichtbare Texte in Komponenten", () => {
  const UI = new URL("../adapters/ui", import.meta.url).pathname;
  const SICHTBAR = /\b(placeholder|title|aria-label|alt)\s*=\s*"([^"]*)"/g;
  /** Sprachfrei und deshalb erlaubt: reine Ganzzahlen. */
  const SPRACHFREI = /^\d+$/;

  it("hält keine sichtbaren Texte als Literal im Quelltext", () => {
    const funde: string[] = [];
    for (const name of readdirSync(UI)) {
      if (!name.endsWith(".tsx") || name.includes(".test.")) continue;
      readFileSync(join(UI, name), "utf8")
        .split("\n")
        .forEach((zeile, i) => {
          for (const m of zeile.matchAll(SICHTBAR)) {
            if (SPRACHFREI.test(m[2])) continue;
            funde.push(`${name}:${i + 1} ${m[1]}="${m[2]}"`);
          }
        });
    }
    expect(funde).toEqual([]);
  });
});

/**
 * Fast Refresh bleibt heil, solange Dateien mit Komponenten NUR Komponenten exportieren.
 *
 * Sonst tauscht Vite die Datei nicht partiell aus, sondern lädt die ganze Seite neu —
 * bei `EinstellungenProvider.tsx` hing daran der halbe UI-Baum, weil fast jeder Screen
 * daraus importierte. Der Test hält die Trennung fest, damit ein bequemer Export dort
 * nicht unbemerkt zurückkommt.
 *
 * Geprüft wird die Provider-Datei stellvertretend: sie ist die einzige, bei der Hooks und
 * Komponente historisch zusammenlagen, und die einzige mit dieser Reichweite.
 */
describe("Fast Refresh", () => {
  it("lässt den EinstellungenProvider nur seine Komponente exportieren", () => {
    const datei = new URL("../adapters/ui/EinstellungenProvider.tsx", import.meta.url).pathname;
    const exporte = [...readFileSync(datei, "utf8").matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)]
      .map((m) => m[1]);
    const keineKomponente = exporte.filter((n) => !/^[A-Z]/.test(n));
    expect(keineKomponente).toEqual([]);
    expect(exporte).toContain("EinstellungenProvider");
  });
});
