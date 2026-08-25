// Ein Datum wählen — der Ersatz für `<input type="date">`.
//
// **Warum überhaupt.** Derselbe Grund wie bei `Auswahl`: das native Feld bringt den
// Kalender des Betriebssystems mit, und der folgt nicht dem Design der App. Dazu kommt
// beim Datum etwas, das es beim Auswahlfeld nicht gibt — das native Feld erzwingt sein
// eigenes Eingabeformat mit festen Segmenten, und dessen Reihenfolge hängt an der
// Systemsprache, nicht an der der App.
//
// **Warum hier selbst gebaut, wo `Auswahl` eine Bibliothek benutzt.** Base UI hat keinen
// Datepicker (nachgesehen, nicht vermutet). Das ist aber weniger schlimm, als es klingt:
// die schwierige Hälfte eines Auswahlfeldes ist die Combobox-Semantik — Knopf und Liste
// über ARIA verbinden, Tippsuche, Rollen richtig setzen. Ein Kalender ist dagegen ein
// GRID, und dafür gibt es eine klare, kleine Konvention: `role="grid"` mit Zellen, und
// die Pfeiltasten bewegen einen Fokuspunkt darin. Die restliche Mechanik — Positionierung
// am Fensterrand, Schliessen bei Klick daneben, Fokus zurück auf den Knopf — kommt aus
// Base UIs Popover und wird nicht nachgebaut.
//
// **Der Wert ist immer ISO (`yyyy-mm-dd`) oder leer**, wie in der ganzen App. Angezeigt
// wird in der Sprache des Nutzers; das ist Darstellung und bleibt draussen.
//
// **Man kann weiterhin TIPPEN, und das ist der Grund für die Form dieser Komponente.**
// Der erste Entwurf war ein blosser Knopf, der den Kalender öffnet — schöner anzusehen und
// im Gebrauch ein Rückschritt: wer ein Datum kennt, tippt es schneller, als er es sucht,
// und das native Feld konnte das. Deshalb ist das Feld eine echte Eingabe, und der Kalender
// hängt als Knopf darin. Gelesen wird tolerant (Punkte, Schrägstriche, Bindestriche oder
// nur Ziffern), und die Reihenfolge von Tag und Monat kommt aus der SPRACHE, nicht aus
// einer festen Annahme — im Englischen steht der Monat vorn.
//
// Unlesbares ändert den Wert NICHT: das Feld springt beim Verlassen auf den letzten
// gültigen Stand zurück. Eine halb getippte Eingabe darf nicht als Datum durchgehen.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover } from "@base-ui/react/popover";

/** Wieviele Tage der Monat hat. Tag 0 des Folgemonats IST der letzte dieses Monats. */
function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

/** Wochentag des Ersten, 0 = Montag. Die Woche beginnt hier montags, nicht sonntags. */
function wochentagDesErsten(jahr: number, monat: number): number {
  return (new Date(Date.UTC(jahr, monat - 1, 1)).getUTCDay() + 6) % 7;
}

function iso(jahr: number, monat: number, tag: number): string {
  return `${String(jahr).padStart(4, "0")}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

/**
 * Zerlegt einen ISO-Wert — ohne zu werfen.
 *
 * Ein Formularfeld bekommt zwangsläufig auch mal Müll oder einen leeren String zu sehen,
 * und ein Kalender, der daran stirbt, reisst den ganzen Dialog mit. Unlesbares heisst
 * hier schlicht „nichts gewählt".
 */
function zerlege(wert: string): { jahr: number; monat: number; tag: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert ?? "");
  if (!m) return null;
  const jahr = Number(m[1]);
  const monat = Number(m[2]);
  const tag = Number(m[3]);
  if (monat < 1 || monat > 12) return null;
  if (tag < 1 || tag > tageImMonat(jahr, monat)) return null;
  return { jahr, monat, tag };
}

/** Verschiebt ein Datum um Tage und bleibt dabei ein gültiges Datum. */
function plusTage(jahr: number, monat: number, tag: number, n: number) {
  const d = new Date(Date.UTC(jahr, monat - 1, tag + n));
  return { jahr: d.getUTCFullYear(), monat: d.getUTCMonth() + 1, tag: d.getUTCDate() };
}

/**
 * Verschiebt um Monate und KAPPT den Tag auf das Monatsende.
 *
 * Ohne das Kappen liefe der 31. Januar bei „ein Monat weiter" auf den 3. März — das tut
 * die Datumsarithmetik von JavaScript von selbst, und in einem Kalender sähe es aus, als
 * hätte man den Februar übersprungen.
 */
function plusMonate(jahr: number, monat: number, tag: number, n: number) {
  const roh = (jahr * 12 + (monat - 1)) + n;
  const zJahr = Math.floor(roh / 12);
  const zMonat = (roh % 12) + 1;
  return { jahr: zJahr, monat: zMonat, tag: Math.min(tag, tageImMonat(zJahr, zMonat)) };
}

/**
 * In welcher Reihenfolge die Sprache Tag, Monat und Jahr schreibt.
 *
 * Aus `Intl` erfragt statt geraten: im Deutschen 05.03.2026, im Englischen 03/05/2026 —
 * dieselben Ziffern, andere Bedeutung. Wer hier eine feste Reihenfolge annimmt, baut je
 * nach Sprache stillschweigend das falsche Datum.
 */
function reihenfolge(locale: string): ("tag" | "monat" | "jahr")[] {
  const teile = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
    .formatToParts(new Date(Date.UTC(2026, 2, 5)));
  const raus: ("tag" | "monat" | "jahr")[] = [];
  for (const teil of teile) {
    if (teil.type === "day") raus.push("tag");
    else if (teil.type === "month") raus.push("monat");
    else if (teil.type === "year") raus.push("jahr");
  }
  return raus.length === 3 ? raus : ["tag", "monat", "jahr"];
}

/**
 * Liest eine getippte Eingabe — tolerant, aber nicht raterisch.
 *
 * Erlaubt sind Trennzeichen aller Art und gar keine (`5.3.2026`, `05/03/2026`, `05032026`).
 * ISO wird immer erkannt, egal welche Sprache eingestellt ist: es steht so in der
 * Datenbank, und wer es eintippt, meint es auch so.
 *
 * Ein zweistelliges Jahr wird ins aktuelle Jahrhundert gelegt. Das ist eine Annahme, aber
 * die einzige brauchbare — und sie betrifft nur Eingaben, die ohnehin unvollständig sind.
 */
function lies(text: string, locale: string): string | null {
  const roh = text.trim();
  if (!roh) return "";

  const isoTreffer = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(roh);
  if (isoTreffer) {
    return gueltig(Number(isoTreffer[1]), Number(isoTreffer[2]), Number(isoTreffer[3]));
  }

  const zahlen = roh.split(/[^\d]+/).filter(Boolean);
  let tag: number, monat: number, jahr: number;

  if (zahlen.length === 3) {
    const ord = reihenfolge(locale);
    const zu = (was: "tag" | "monat" | "jahr") => Number(zahlen[ord.indexOf(was)]);
    tag = zu("tag");
    monat = zu("monat");
    jahr = zu("jahr");
  } else if (zahlen.length === 1 && (zahlen[0].length === 8 || zahlen[0].length === 6)) {
    // Durchgetippt ohne Trenner. Die Reihenfolge ist dieselbe wie mit.
    const z = zahlen[0];
    const jahrLaenge = z.length === 8 ? 4 : 2;
    const ord = reihenfolge(locale);
    const breiten = ord.map((f) => (f === "jahr" ? jahrLaenge : 2));
    const stuecke: Record<string, number> = {};
    let pos = 0;
    ord.forEach((f, i) => {
      stuecke[f] = Number(z.slice(pos, pos + breiten[i]));
      pos += breiten[i];
    });
    tag = stuecke.tag;
    monat = stuecke.monat;
    jahr = stuecke.jahr;
  } else {
    return null;
  }

  if (jahr < 100) jahr += Math.floor(new Date().getFullYear() / 100) * 100;
  return gueltig(jahr, monat, tag);
}

/** Gibt das ISO-Datum zurueck — oder null, wenn es den Tag nicht gibt. */
function gueltig(jahr: number, monat: number, tag: number): string | null {
  if (!Number.isInteger(jahr) || !Number.isInteger(monat) || !Number.isInteger(tag)) return null;
  if (jahr < 1000 || jahr > 9999) return null;
  if (monat < 1 || monat > 12) return null;
  if (tag < 1 || tag > tageImMonat(jahr, monat)) return null;
  return iso(jahr, monat, tag);
}

export function Datumsfeld({
  wert,
  aufAenderung,
  ariaLabel,
  id,
  deaktiviert,
  platzhalter,
  heute,
}: {
  /** ISO `yyyy-mm-dd`, oder leer für „nichts gewählt". */
  wert: string;
  aufAenderung: (iso: string) => void;
  ariaLabel?: string;
  id?: string;
  deaktiviert?: boolean;
  platzhalter?: string;
  /** Nur für Tests — sonst der heutige Tag. */
  heute?: string;
}) {
  const { t, i18n } = useTranslation();
  const gewaehlt = zerlege(wert);

  const heuteWert = useMemo(() => {
    if (heute) return zerlege(heute);
    const d = new Date();
    return { jahr: d.getFullYear(), monat: d.getMonth() + 1, tag: d.getDate() };
  }, [heute]);

  // Welcher Monat im Blatt steht. Startpunkt ist der gewählte Tag, sonst heute — ein
  // Kalender, der bei einem gesetzten Datum woanders aufmacht, lässt einen suchen.
  const [blatt, setBlatt] = useState(() => ({
    jahr: (gewaehlt ?? heuteWert)?.jahr ?? 2000,
    monat: (gewaehlt ?? heuteWert)?.monat ?? 1,
  }));

  // Der Tag, auf dem die Tastatur gerade steht. Er ist NICHT die Auswahl: man wandert mit
  // den Pfeilen umher und entscheidet erst mit Enter. Beides gleichzusetzen hiesse, dass
  // schon das Durchblättern den Wert ändert.
  const [fokusTag, setFokusTag] = useState<number | null>(null);

  const [offen, setOffen] = useState(false);

  const anzeige = useMemo(() => {
    if (!gewaehlt) return null;
    return new Date(Date.UTC(gewaehlt.jahr, gewaehlt.monat - 1, gewaehlt.tag)).toLocaleDateString(
      i18n.language,
      { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" },
    );
  }, [gewaehlt, i18n.language]);

  // Was im Feld STEHT, waehrend getippt wird. Es folgt dem Wert von aussen, ist aber
  // nicht dasselbe: zwischen zwei Anschlaegen steht hier regelmaessig etwas, das noch
  // kein Datum ist.
  const [text, setText] = useState(anzeige ?? "");
  const [zuletztGesehen, setZuletztGesehen] = useState(wert);
  if (wert !== zuletztGesehen) {
    // Aendert jemand den Wert von aussen (Zuruecksetzen, anderer Datensatz), folgt das
    // Feld. Waehrend des Renderns zu setzen ist hier das vorgesehene Muster — ein Effekt
    // zeigte dafuer einen Frame lang den alten Text.
    setZuletztGesehen(wert);
    setText(anzeige ?? "");
  }

  function uebernehmen() {
    const gelesen = lies(text, i18n.language);
    if (gelesen === null) {
      // Unlesbares aendert nichts. Zurueck auf den letzten gueltigen Stand — eine halb
      // getippte Eingabe darf nicht als Datum durchgehen.
      setText(anzeige ?? "");
      return;
    }
    if (gelesen !== wert) aufAenderung(gelesen);
    // Auch bei gleichem Wert die Schreibweise glaetten: aus „5.3.2026" wird „05.03.2026".
    else setText(anzeige ?? "");
  }

  const monatsTitel = useMemo(
    () =>
      new Date(Date.UTC(blatt.jahr, blatt.monat - 1, 1)).toLocaleDateString(i18n.language, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    [blatt, i18n.language],
  );

  // Die Kürzel kommen aus `Intl`, nicht aus i18n.ts: sie sind bei jeder Sprache dieselben
  // sieben und würden dort nur als Übersetzungspflicht liegen, die niemand pflegt.
  const wochentage = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" });
    // 2024-01-01 war ein Montag — der Anker für „Woche beginnt montags".
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
  }, [i18n.language]);

  const anzahlTage = tageImMonat(blatt.jahr, blatt.monat);
  const vorlauf = wochentagDesErsten(blatt.jahr, blatt.monat);

  function waehle(tag: number) {
    aufAenderung(iso(blatt.jahr, blatt.monat, tag));
    setOffen(false);
  }

  function blaettere(n: number, einheit: "tag" | "monat") {
    const basis = fokusTag ?? gewaehlt?.tag ?? 1;
    const ziel =
      einheit === "tag"
        ? plusTage(blatt.jahr, blatt.monat, basis, n)
        : plusMonate(blatt.jahr, blatt.monat, basis, n);
    setBlatt({ jahr: ziel.jahr, monat: ziel.monat });
    setFokusTag(ziel.tag);
  }

  function beiTaste(e: React.KeyboardEvent) {
    const basis = fokusTag ?? gewaehlt?.tag ?? 1;
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); blaettere(-1, "tag"); break;
      case "ArrowRight": e.preventDefault(); blaettere(1, "tag"); break;
      case "ArrowUp": e.preventDefault(); blaettere(-7, "tag"); break;
      case "ArrowDown": e.preventDefault(); blaettere(7, "tag"); break;
      case "PageUp": e.preventDefault(); blaettere(-1, "monat"); break;
      case "PageDown": e.preventDefault(); blaettere(1, "monat"); break;
      case "Home": e.preventDefault(); setFokusTag(1); break;
      case "End": e.preventDefault(); setFokusTag(anzahlTage); break;
      case "Enter":
      case " ":
        e.preventDefault();
        waehle(basis);
        break;
      default:
        break;
    }
  }

  const fokus = fokusTag ?? (gewaehlt && gewaehlt.jahr === blatt.jahr && gewaehlt.monat === blatt.monat ? gewaehlt.tag : 1);

  return (
    <Popover.Root
      open={offen}
      onOpenChange={(o) => {
        setOffen(o);
        // Beim Öffnen zurück auf den gewählten Monat: wer zuletzt im Mai geblättert und
        // dann abgebrochen hat, will beim nächsten Mal nicht wieder im Mai landen.
        if (o) {
          const start = gewaehlt ?? heuteWert;
          if (start) setBlatt({ jahr: start.jahr, monat: start.monat });
          setFokusTag(null);
        }
      }}
    >
      <div className="datumsfeld-huelle field" data-gesperrt={deaktiviert || undefined}>
        <input
          className="datumsfeld-eingabe"
          id={id}
          aria-label={ariaLabel}
          disabled={deaktiviert}
          value={text}
          placeholder={platzhalter}
          inputMode="numeric"
          onChange={(e) => setText(e.target.value)}
          // Uebernommen wird beim VERLASSEN, nicht bei jedem Anschlag: waehrend „05.0"
          // getippt ist, gibt es noch kein Datum, und ein Feld, das dabei dauernd
          // zurueckspringt, laesst sich nicht bedienen.
          onBlur={uebernehmen}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              uebernehmen();
            }
          }}
        />
        <Popover.Trigger
          className="datumsfeld-knopf"
          aria-label={t("datum.kalenderOeffnen")}
          disabled={deaktiviert}
          type="button"
        >
          <Kalendersymbol />
        </Popover.Trigger>
      </div>

      <Popover.Portal>
        {/* Die Klasse traegt nur den z-Index (siehe app.css, „Schwebende Ebenen"): das
            Blatt haengt per Portal am body und laege sonst hinter jedem Dialog, aus dem
            heraus es geoeffnet wurde. */}
        <Popover.Positioner className="datumsfeld-positioner" sideOffset={4} align="start">
          <Popover.Popup className="datumsfeld-popup">
            <div className="datumsfeld-kopf">
              <button
                type="button"
                className="datumsfeld-pfeil"
                aria-label={t("datum.vorherigerMonat")}
                onClick={() => setBlatt(plusMonate(blatt.jahr, blatt.monat, 1, -1))}
              >
                ‹
              </button>
              {/* `aria-live`, damit das Blättern per Tastatur auch angesagt wird — sonst
                  wandert der Monat lautlos weiter. */}
              <span className="datumsfeld-monat" aria-live="polite">{monatsTitel}</span>
              <button
                type="button"
                className="datumsfeld-pfeil"
                aria-label={t("datum.naechsterMonat")}
                onClick={() => setBlatt(plusMonate(blatt.jahr, blatt.monat, 1, 1))}
              >
                ›
              </button>
            </div>

            <div
              className="datumsfeld-grid"
              role="grid"
              tabIndex={0}
              aria-label={monatsTitel}
              onKeyDown={beiTaste}
            >
              {wochentage.map((w) => (
                <span key={w} className="datumsfeld-wt" role="columnheader">
                  {w}
                </span>
              ))}
              {Array.from({ length: vorlauf }, (_, i) => (
                <span key={`leer${i}`} className="datumsfeld-leer" />
              ))}
              {Array.from({ length: anzahlTage }, (_, i) => {
                const tag = i + 1;
                const istGewaehlt =
                  !!gewaehlt && gewaehlt.jahr === blatt.jahr && gewaehlt.monat === blatt.monat && gewaehlt.tag === tag;
                const istHeute =
                  !!heuteWert && heuteWert.jahr === blatt.jahr && heuteWert.monat === blatt.monat && heuteWert.tag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    role="gridcell"
                    className="datumsfeld-tag"
                    data-gewaehlt={istGewaehlt || undefined}
                    data-heute={istHeute || undefined}
                    data-fokus={tag === fokus || undefined}
                    aria-selected={istGewaehlt}
                    tabIndex={-1}
                    onClick={() => waehle(tag)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="datumsfeld-fuss">
              <button
                type="button"
                className="linkbtn"
                onClick={() => {
                  if (!heuteWert) return;
                  aufAenderung(iso(heuteWert.jahr, heuteWert.monat, heuteWert.tag));
                  setOffen(false);
                }}
              >
                {t("datum.heute")}
              </button>
              {/* Leeren geht nur, wenn etwas drinsteht — ein Knopf, der nichts tut, ist
                  eine Frage ohne Antwort. */}
              {wert ? (
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => {
                    aufAenderung("");
                    setOffen(false);
                  }}
                >
                  {t("datum.leeren")}
                </button>
              ) : null}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Kalendersymbol() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
