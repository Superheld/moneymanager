// Was mit dieser Buchung geschah — und der Weg zurueck.
//
// Das Journal wurde seit seiner Einfuehrung bei jeder Aenderung mitgeschrieben und war
// nirgends zu sehen. Hier ist es zu sehen, und hier faengt der Rueckweg an.
//
// **Zugeklappt, solange niemand danach fragt** — dieselbe Form wie die Herkunft darunter.
// „Was habe ich hier eigentlich veraendert" ist eine Frage, die man selten und dann
// gezielt stellt; aufgeklappt schoebe der Abschnitt die Knoepfe aus dem Bild.
//
// **Die Rueckfrage steht im Abschnitt, nicht in einem eigenen Dialog.** Anders als beim
// Loeschen ist hier schon zu sehen, was passiert: die Unterschiede stehen direkt darueber.
// Ein Dialog wiederholte sie nur — und er saesse als dritte Ebene ueber einer Maske, die
// selbst schon in einem Modal liegt.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Buchungshistorie, IstBuchung, Journaleintrag, Vergleichsfeld } from "../../../application";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";
import { Button } from "../bausteine/Button";
import { ddmm } from "./ddmm";

/** Womit sich ein Feldwert lesbar machen laesst — Namen und Geldformat kennt nur die UI. */
interface Lesehilfe {
  readonly kontoName: Map<string, string>;
  readonly kategorieName: Map<string, string>;
  readonly geld: ReturnType<typeof useGeld>;
  readonly t: (schluessel: string, werte?: Record<string, unknown>) => string;
}

/**
 * Ein Feld als Text.
 *
 * Nicht der Rohwert: eine Konto-Id sagt niemandem etwas, und ein Betrag in Cent liest
 * sich als Zahl ohne Bedeutung. Die Ids sind der Grund, warum diese Funktion Hilfen
 * braucht statt eine reine Funktion im Kern zu sein.
 */
function feldWert(b: IstBuchung, feld: Vergleichsfeld, h: Lesehilfe): string {
  const leer = "—";
  switch (feld) {
    case "datum":
      return ddmm(b.datum);
    case "betrag":
      return h.geld.formatMitSymbol(b.betrag, { mitVorzeichen: true });
    case "kontoId":
      return h.kontoName.get(b.kontoId) ?? b.kontoId;
    case "gegenkontoId":
      return b.gegenkontoId ? h.kontoName.get(b.gegenkontoId) ?? b.gegenkontoId : leer;
    case "kategorieId":
      return b.kategorieId ? h.kategorieName.get(b.kategorieId) ?? b.kategorieId : leer;
    case "kategorieHerkunft":
      return h.t(`konten.journal.herkunft.${b.kategorieHerkunft ?? "automatisch"}`);
    case "charakter":
      return h.t(`charakter.${b.charakter}`);
    case "notiz":
      return b.notiz || leer;
    case "aufteilungen":
      return b.aufteilungen?.length
        ? h.t("konten.journal.teileAnzahl", { anzahl: b.aufteilungen.length })
        : h.t("konten.journal.ohneTeile");
    case "transferId":
      return b.transferId ? h.t("konten.journal.gepaart") : leer;
    case "planRef":
      return b.planRef ? ddmm(b.planRef.faelligkeit) : leer;
    case "zuPruefen":
      return b.zuPruefen ? h.t("konten.journal.vorgemerkt") : leer;
  }
}

/** Zeitpunkt in der Sprache des Nutzers — die gespeicherte Form ist UTC. */
function zeitpunkt(iso: string, sprache: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(sprache, { dateStyle: "short", timeStyle: "short" }).format(d);
}

export function JournalBlock({
  historie,
  aktuell,
  kontoName,
  kategorieName,
  onZuruecksetzen,
}: {
  /** Fehlt, solange noch geladen wird oder die Buchung neu ist. */
  historie?: Buchungshistorie;
  aktuell: IstBuchung;
  kontoName: Map<string, string>;
  kategorieName: Map<string, string>;
  onZuruecksetzen: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const geld = useGeld();
  const [offen, setOffen] = useState(false);
  const [fragt, setFragt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  if (!historie) return null;
  const hilfe: Lesehilfe = { kontoName, kategorieName, geld, t };

  async function zuruecksetzen() {
    setLaeuft(true);
    setFehler(null);
    try {
      await onZuruecksetzen();
      setFragt(false);
    } catch (e) {
      // Stehenbleiben und den Fehler zeigen — dieselbe Regel wie bei der Löschfrage: ein
      // Rückweg, der scheitert und den Abschnitt schliesst, sieht aus wie einer, der ging.
      // Über `fehlerNachricht`, damit ein fachlicher Code als Satz ankommt und nicht als
      // Schlüssel: `journal.paarung` steht sonst wörtlich in der Oberfläche.
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(false);
    }
  }

  const { eintraege, urzustand, abweichungen, rueckweg } = historie;

  return (
    <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
      <button className="linkbtn" onClick={() => setOffen((x) => !x)} aria-expanded={offen}>
        {offen ? "▾" : "▸"} {t("konten.journal.titel")}{" "}
        {eintraege.length > 0 && <span className="muted">({eintraege.length})</span>}
      </button>

      {offen && (
        <div style={{ marginTop: 8 }}>
          {eintraege.length === 0 ? (
            /* Der Bestand vor dem 23.08.2026. Kein Fehler, sondern eine Auskunft — und
               ohne sie stünde hier eine leere Fläche, die nach einem Fehler aussieht. */
            <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.journal.leer")}</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {eintraege.map((e: Journaleintrag) => (
                <li key={e.id} style={{ display: "flex", gap: "var(--sp-3)", padding: "3px 0", fontSize: 13 }}>
                  <span className="muted" style={{ flex: "0 0 34%", fontSize: "var(--fs-xs)" }}>
                    {zeitpunkt(e.zeitpunkt, i18n.language)}
                  </span>
                  <span>{t(`konten.journal.art.${e.art}`)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Der Unterschied zum Ursprung — die eigentliche Auskunft. Eine Liste von
              Zeitpunkten sagt DASS etwas geschah, diese Tabelle sagt WAS. */}
          {urzustand && abweichungen.length > 0 && (
            // Als benannte GRUPPE, nicht als lose Zeilenfolge: die Werte darin stehen
            // ohne Zusammenhang („Haushalt", „Werkzeug") und wiederholen sich anderswo im
            // Dialog. Ein Screenreader liest sie sonst als Fortsetzung des Formulars.
            <div role="group" aria-label={t("konten.journal.seitEntstehung")} style={{ marginTop: "var(--sp-3)" }}>
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: 4 }}>
                {t("konten.journal.seitEntstehung")}
              </div>
              {abweichungen.map((feld) => (
                <div key={feld} style={{ display: "flex", gap: "var(--sp-2)", padding: "3px 0", fontSize: 13, alignItems: "baseline" }}>
                  <span style={{ flex: "0 0 34%", fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontWeight: "var(--fw-semi)" }}>
                    {t(`konten.journal.feld.${feld}`)}
                  </span>
                  <span className="muted" style={{ textDecoration: "line-through" }}>{feldWert(urzustand, feld, hilfe)}</span>
                  <span aria-hidden>→</span>
                  <span>{feldWert(aktuell, feld, hilfe)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "var(--sp-3)" }}>
            {rueckweg.moeglich && !fragt && (
              <button className="linkbtn" onClick={() => { setFehler(null); setFragt(true); }}>
                {t("konten.journal.zuruecksetzen")}
              </button>
            )}
            {rueckweg.moeglich && fragt && (
              <div>
                <p style={{ margin: "0 0 var(--sp-2)", fontSize: 13 }}>{t("konten.journal.frage")}</p>
                {/* `Button` kennt kein `disabled` (Design-System, dort wird nichts
                    erfunden) — während des Schreibens verschwindet er deshalb. */}
                {!laeuft && (
                  <Button variant="primary" onClick={() => void zuruecksetzen()}>
                    {t("konten.journal.bestaetigen")}
                  </Button>
                )}
                {laeuft && <span className="muted">{t("konten.journal.laeuft")}</span>}
                <button className="linkbtn" style={{ marginLeft: "var(--sp-3)" }} onClick={() => setFragt(false)} disabled={laeuft}>
                  {t("konten.journal.abbrechen")}
                </button>
              </div>
            )}
            {/* Warum nicht — statt eines fehlenden Knopfes ohne Erklärung. */}
            {!rueckweg.moeglich && (
              <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                {t(`konten.journal.zu.${rueckweg.grund}`)}
              </div>
            )}
            {fehler && <div className="err" style={{ marginTop: "var(--sp-2)", fontSize: 13 }}>{fehler}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
