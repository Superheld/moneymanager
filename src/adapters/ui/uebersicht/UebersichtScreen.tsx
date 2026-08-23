// Übersicht — was JETZT gilt, und sonst nichts.
//
// Zwei Blöcke: die drei Monatskarten (laufender Monat plus die beiden folgenden) und
// darunter die Budgets dieses Monats. Alles, was einen ZEITRAUM auswertet — Verlauf,
// Kennzahlen, Aufschlüsselung nach Kategorien — ist 2026-08-19 in den Bereich „Analyse"
// gezogen. Vorher hing das an einem Screen, den man erst nach unten scrollen musste,
// bis die Kategorien kamen; und die Frage „wie stehe ich gerade da?" ging dabei unter.
//
// Der Screen RECHNET NICHTS. Er lud vorher sechs Repositories selbst zusammen und rief
// damit die Kernfunktionen auf — und genau dabei ging die Vertragsregel verloren: die
// Karten oben bekamen eine gefilterte Buchungsliste, die Budgetliste darunter die
// ungefilterte, und dasselbe Budget stand im selben Bild mit zwei verschiedenen Werten.
// Seit 2026-08-19 kommt alles fertig aus `uebersichtLaden` (Anwendungsschicht).
//
// Der Monatsumschalter geht ausdrücklich nur nach HINTEN. Ein Budget in der Zukunft hat
// keinen Verbrauch, es gäbe also nichts zu zeigen — was kommt, steht in den Karten
// darüber. Er lädt auch nicht neu, sondern rechnet über `budgetstaende` einen anderen
// Monat aus denselben Daten.
//
// **Ein aufbauendes Budget zeigt hier seinen MONAT, nicht seine Summe seit Start.** Dort
// stand vorher „140 von 200", und die 200 waren der Betrag, der hineingegangen wäre, hätte
// man nie etwas ausgegeben — eine Zahl, die jeden Monat weiterwächst und über den
// laufenden nichts sagt. An ihre Stelle tritt die Aufrechnung: Übertrag aus dem Vormonat,
// Rate dieses Monats, Verbrauch dieses Monats. Der grosse Betrag daneben bleibt derselbe;
// die Fortschreibung ist die Zerlegung von `budgetStand`, keine zweite Rechnung
// (Herleitung in `core/budgets/budgetverlauf`).

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  budgetPostenZu,
  budgetstaende,
  toIso,
  type Depotdaten,
  type Uebersichtsdaten,
} from "../../../application";
import { depots, uebersicht } from "../../dienste";
import { Card, CoverageTrack, Pill } from "../bausteine";
import { BudgetFortschreibung } from "../bausteine/BudgetFortschreibung";
import { BudgetPostenliste } from "../bausteine/BudgetPostenliste";
import { DepotKarte } from "./DepotKarte";
import { MonatsAusblick } from "./MonatsAusblick";
import { PageHead } from "../bausteine/PageHead";
import { geldFarbe } from "../bausteine/geldFarbe";
import { useGeld } from "../bausteine/einstellungenKontext";

function heuteIso(): string {
  const n = new Date();
  return toIso({ y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() });
}

export function UebersichtScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);
  const dieserMonat = heute.slice(0, 7);

  const [daten, setDaten] = useState<Uebersichtsdaten | null>(null);
  /**
   * Die Depots — getrennt geladen und getrennt gehalten.
   *
   * Nicht Teil von `Uebersichtsdaten`, weil sie mit dem Rest nichts zu tun haben: sie
   * gehen in keine Monatskarte ein, belasten kein Budget und zählen nicht zu den liquiden
   * Mitteln. Ein Fehler beim Laden nimmt der Übersicht deshalb auch nicht ihren Inhalt.
   */
  const [depotdaten, setDepotdaten] = useState<Depotdaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Welcher Monat in der Budget-Liste steht — Vorgabe ist der laufende. */
  const [monat, setMonat] = useState(dieserMonat);
  /** Welches Budget seine Buchungen zeigt — höchstens eines, sonst wird die Karte endlos. */
  const [offenesBudget, setOffenesBudget] = useState<string | null>(null);

  useEffect(() => {
    uebersicht(heute)
      .then((d) => { setDaten(d); setFehler(null); })
      .catch((e) => setFehler(e instanceof Error ? e.message : String(e)));
    depots()
      .then(setDepotdaten)
      .catch(() => setDepotdaten(null));
  }, [heute]);

  /**
   * Die Budgetstände des GEWÄHLTEN Monats. Für den laufenden stehen sie schon in
   * `daten`; für einen vergangenen rechnet `budgetstaende` sie aus derselben Sicht neu —
   * dieselbe Regel, ohne zweiten Ladevorgang.
   *
   * Der Stichtag ist der LETZTE Tag des Monats, damit ein vergangener vollständig zählt;
   * gefenstert wird ohnehin auf den Monat.
   */
  const staende = useMemo(() => {
    if (!daten) return [];
    return monat === dieserMonat ? daten.staende : budgetstaende(daten.sicht, `${monat}-28`);
  }, [daten, monat, dieserMonat]);

  return (
    <div className="screen">
      <PageHead title={t("uebersicht.titel")} subtitle={t("uebersicht.untertitel")} />

      {fehler && <Card style={{ borderColor: "var(--warn)" }}>{t("uebersicht.fehlerDb")} ({fehler})</Card>}

      {daten && (
        <MonatsAusblick
          ausblicke={daten.ausblicke}
          hatPlandaten={daten.hatPlandaten}
          kategorieNamen={daten.kategorieNamen}
          empfaenger={daten.empfaenger}
        />
      )}

      {/* Budgets und Depots nebeneinander. Fehlt eines von beiden, nimmt das andere die
          volle Breite — das erledigt `auto-fit` im Raster, ohne dass hier eine Bedingung
          stünde, die man beim nächsten Element wieder anpassen müsste. */}
      <div className="karten-paar">
      {daten && (
        <Card
          title={t("uebersicht.budgetsTitel")}
          subtitle={monat === dieserMonat ? t("uebersicht.budgetsLaufend") : t("uebersicht.budgetsVergangen")}
          action={
            staende.length > 0 ? (
              <select
                className="field"
                style={{ width: "auto" }}
                aria-label={t("uebersicht.monatWaehlen")}
                value={monat}
                onChange={(e) => setMonat(e.target.value)}
              >
                {daten.monate.map((m) => (
                  <option key={m} value={m}>
                    {m === dieserMonat ? t("uebersicht.monatDieser", { monat: m }) : m}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        >
          {staende.length === 0 ? (
            <div className="muted">{t("uebersicht.budgetsLeer")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
              {staende.map((z) => {
                const offen = offenesBudget === z.budget.id;
                const name = z.kategorieName;
                return (
                  <div key={z.budget.id} style={{ paddingLeft: z.tiefe * 18 }}>
                    {/* Die ganze Kopfzeile ist der Schalter: der Balken darunter gehört
                        zur selben Aussage, und ein eigener Pfeil-Knopf daneben wäre ein
                        zweites Ziel für dieselbe Geste. */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={offen}
                      aria-label={t("uebersicht.budgetAufklappen", { name })}
                      onClick={() => setOffenesBudget(offen ? null : z.budget.id)}
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") &&
                        (e.preventDefault(), setOffenesBudget(offen ? null : z.budget.id))
                      }
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--sp-3)", marginBottom: 4, cursor: "pointer" }}
                    >
                      <span style={{ fontWeight: z.tiefe === 0 ? "var(--fw-bold)" : "var(--fw-semi)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {z.tiefe > 0 && <span style={{ color: "var(--ink-3)" }}>└</span>}
                        <span style={{ color: "var(--ink-3)" }}>{offen ? "▾" : "▸"}</span>
                        {name}
                        {/* Nur das Aufbauende bekommt eine Pille — es ist der Sonderfall.
                            Zwei Pillen nebeneinander in jeder Zeile wären nur Rauschen. */}
                        {z.budget.art === "aufbauend" && <Pill variant="um">{t("budgets.art.aufbauend")}</Pill>}
                      </span>
                      {/* Rechts der Rest, darunter die Herkunft. Beim Monatlichen genügt
                          „von 200": der Rahmen IST der Monatsbetrag, es gibt nichts
                          fortzuschreiben. Beim Aufbauenden steht dort die Aufrechnung —
                          der kumulierte Rahmen hängt nur noch im Titel, weil „insgesamt
                          eingezahlt" eine eigene, seltenere Frage ist. */}
                      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                        <span className="num" style={{ fontSize: "var(--fs-sm)", whiteSpace: "nowrap" }}>
                          {z.monat.ohnePlan ? (
                            // In diesem Monat gab es für die Kategorie noch keinen Rahmen.
                            // Ein Rest von „−x von 0,00" läse sich als überzogen.
                            <span className="muted">{t("budgets.verlaufOhnePlan", { verbraucht: geld.formatMitSymbol(z.monat.verbraucht) })}</span>
                          ) : (
                          <span
                            style={{ fontWeight: "var(--fw-bold)", color: geldFarbe(z.rest) }}
                            title={z.budget.art === "aufbauend" ? t("uebersicht.budgetGesamt", { rahmen: geld.formatMitSymbol(z.rahmen) }) : undefined}
                          >
                            {geld.format(z.rest)}
                          </span>
                          )}
                          {z.budget.art === "monatlich" && !z.monat.ohnePlan && (
                            <span className="muted"> {t("uebersicht.vonRahmen", { rahmen: geld.formatMitSymbol(z.monat.verfuegbar) })}</span>
                          )}
                        </span>
                        {z.budget.art === "aufbauend" && !z.monat.ohnePlan && <BudgetFortschreibung monat={z.monat} />}
                      </span>
                    </div>
                    <CoverageTrack
                      value={Math.max(0, z.monat.verbraucht)}
                      max={Math.max(1, z.monat.verfuegbar)}
                      over={!z.monat.ohnePlan && z.rest < 0}
                      label=""
                      right=""
                    />
                    {offen && (
                      <BudgetPostenliste
                        posten={budgetPostenZu(daten.sicht, z)}
                        empfaenger={daten.empfaenger}
                        kategorieNamen={daten.kategorieNamen}
                        verbraucht={z.monat.verbraucht}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {depotdaten && <DepotKarte daten={depotdaten} />}
      </div>
    </div>
  );
}
