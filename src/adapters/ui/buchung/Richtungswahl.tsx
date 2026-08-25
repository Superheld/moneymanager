// Höhe und Richtung eines Betrags — das Feld und die Wahl daneben.
//
// Eigene Datei seit dem Entzerren von `BuchungDetail.tsx` (2026-08-25). Zusammen liegen
// hier die Zerlegung eines vorzeichenbehafteten Betrags in seine zwei Hälften und das
// Bedienteil, das die zweite zeigt — was zusammen gedacht werden muss, soll auch
// zusammen liegen. Die Begründung, warum es überhaupt zwei Hälften sind, steht in der
// Wurzel-`CLAUDE.md` unter „Das Vorzeichen ist die Richtung".

import { useTranslation } from "react-i18next";
import type { Geld } from "../bausteine/einstellungenKontext";

/**
 * Der Text fürs Betragsfeld — die HÖHE, ohne Vorzeichen.
 *
 * Die Richtung steht daneben als eigene Auswahl und nicht im Feld. Zwei Anläufe davor
 * haben sie im Feld untergebracht: erst als blosse Höhe mit einer Ableitung aus dem
 * Charakter dahinter, dann als eingetipptes Vorzeichen. Das erste war unsichtbar, das
 * zweite verlangte, dass man auf die Idee kommt, ein Minus zu tippen — und wies es bis
 * 2026-08-25 sogar ab. Eine Wahl, die man SIEHT und die zwei Möglichkeiten nebeneinander
 * zeigt, verlangt weder Wissen noch Vertrauen.
 *
 * Formatiert wird über `useGeld` und nicht über `String(minorZuMajor(…))`: das schrieb
 * einen Punkt als Dezimaltrenner und liess die zweite Nachkommastelle weg, also genau
 * das, was daneben in der Liste anders aussah.
 */
export function betragsHoehe(cent: number, geld: Geld): string {
  return geld.format(Math.abs(cent));
}

/** Ab- oder Zufluss — die Richtung als eigene Grösse neben der Höhe. */
export type Richtung = "ab" | "zu";

export function richtungVon(cent: number): Richtung {
  return cent < 0 ? "ab" : "zu";
}

/**
 * Ein getipptes oder eingefügtes Vorzeichen ist eine Richtungsangabe und wird als solche
 * genommen: es wandert aus dem Feld in die Auswahl daneben, statt abgewiesen zu werden.
 *
 * Wer einen Betrag von woanders hereinkopiert, bringt das Vorzeichen mit — es dort stumm
 * zu verschlucken hiesse, die Hälfte der Angabe wegzuwerfen. Erkannt werden dieselben
 * Schreibweisen wie in `parseBetrag`: vorne, hinten, oder Klammern für negativ.
 */
export function vorzeichenAbspalten(text: string): { rest: string; richtung?: Richtung } {
  const klammer = /^\s*\((.*)\)\s*$/.exec(text);
  if (klammer) return { rest: klammer[1], richtung: "ab" };
  const vorne = /^\s*([-\u2212+])\s*/.exec(text);
  if (vorne) return { rest: text.slice(vorne[0].length), richtung: vorne[1] === "+" ? "zu" : "ab" };
  const hinten = /\s*([-\u2212+])\s*$/.exec(text);
  if (hinten) return { rest: text.slice(0, hinten.index), richtung: hinten[1] === "+" ? "zu" : "ab" };
  return { rest: text };
}

/**
 * Die Richtungswahl — zwei Knöpfe, immer beide sichtbar.
 *
 * **Warum zwei Knöpfe und kein Kästchen.** Ein Kästchen zeigt eine Möglichkeit und
 * verschweigt die andere: „Geld kam zurück" ohne Haken heisst irgendetwas, und was, muss
 * man wissen. Genau daran ist der Vorgänger gescheitert. Zwei Knöpfe nebeneinander zeigen
 * beide Möglichkeiten und welche gerade gilt — dafür braucht es kein Vorwissen.
 *
 * **Warum kein `Auswahl`.** Es sind genau zwei Werte, und die passen nebeneinander. Eine
 * Klappliste versteckte die Hälfte der Antwort hinter einem Klick, um Platz zu sparen,
 * den es hier nicht zu sparen gibt.
 *
 * **Warum Farbe.** Ab und Zu sind dieselben Farben wie überall, wo ein Betrag steht
 * (`geldFarbe`): Minus in der Warnfarbe, Plus in Grün. Wer die Liste kennt, erkennt die
 * Wahl wieder, ohne das Wort zu lesen.
 *
 * **Warum es sichtbar bleibt, wenn es gesperrt ist.** Bei einer Bankzeile ist die
 * Richtung eine Tatsache — die soll man ablesen können. Ein Feld, das dann verschwindet,
 * beantwortet die Frage gar nicht.
 *
 * `radiogroup` und nicht zwei Umschalter: es ist EINE Frage mit zwei Antworten, und die
 * Pfeiltasten sollen zwischen ihnen wechseln.
 */
export function Richtungswahl({
  wert,
  aufAenderung,
  deaktiviert,
}: {
  wert: Richtung;
  aufAenderung: (r: Richtung) => void;
  deaktiviert?: boolean;
}) {
  const { t } = useTranslation();
  const moeglichkeiten: readonly { r: Richtung; zeichen: string; textKey: string; farbe: string }[] = [
    { r: "ab", zeichen: "\u2212", textKey: "konten.buchung.richtungAb", farbe: "var(--warn-deep)" },
    { r: "zu", zeichen: "+", textKey: "konten.buchung.richtungZu", farbe: "var(--ok-deep)" },
  ];
  return (
    <div role="radiogroup" aria-label={t("konten.buchung.richtung")} style={{ display: "flex", gap: 6 }}>
      {moeglichkeiten.map((m) => {
        const aktiv = m.r === wert;
        return (
          <button
            key={m.r}
            type="button"
            role="radio"
            aria-checked={aktiv}
            aria-label={t(m.textKey)}
            disabled={deaktiviert}
            onClick={() => aufAenderung(m.r)}
            className="field"
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              cursor: deaktiviert ? "default" : "pointer",
              fontWeight: aktiv ? "var(--fw-bold)" : "var(--fw-semi)",
              // Die gewählte Seite trägt Farbe und Fläche, die andere bleibt ein blasses
              // Feld. Nur Fettschrift reichte nicht — nebeneinander sehen zwei Kästen mit
              // leicht verschiedener Strichstärke gleich aus.
              color: aktiv ? m.farbe : "var(--ink-3)",
              borderColor: aktiv ? m.farbe : "var(--line)",
              background: aktiv ? "color-mix(in oklab, currentColor 10%, transparent)" : "transparent",
              opacity: deaktiviert && !aktiv ? 0.5 : 1,
            }}
          >
            <span aria-hidden="true" style={{ fontWeight: "var(--fw-black)" }}>{m.zeichen}</span>
            {t(m.textKey)}
          </button>
        );
      })}
    </div>
  );
}

