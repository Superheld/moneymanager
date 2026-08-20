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

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  budgetPostenZu,
  budgetstaende,
  toIso,
  type Depotdaten,
  type Uebersichtsdaten,
  type Verbrauchsposten,
} from "../../../application";
import { depots, uebersicht } from "../../dienste";
import { Card, CoverageTrack, Pill } from "../bausteine";
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

      {depotdaten && <DepotKarte daten={depotdaten} />}

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
                      <span className="num" style={{ fontSize: "var(--fs-sm)", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: "var(--fw-bold)", color: geldFarbe(z.rest) }}>{geld.format(z.rest)}</span>
                        <span className="muted"> {t("uebersicht.vonRahmen", { rahmen: geld.formatMitSymbol(z.rahmen) })}</span>
                      </span>
                    </div>
                    <CoverageTrack
                      value={Math.max(0, z.verbraucht)}
                      max={Math.max(1, z.rahmen)}
                      over={z.rest < 0}
                      label=""
                      right=""
                    />
                    {offen && (
                      <BudgetBuchungen
                        posten={budgetPostenZu(daten.sicht, z)}
                        empfaenger={daten.empfaenger}
                        kategorieNamen={daten.kategorieNamen}
                        verbraucht={z.verbraucht}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * Woraus der Verbrauch eines Budgets besteht — die Buchungen selbst, nicht noch eine
 * Zahl. Die Liste kommt aus `budgetBuchungen`, also aus derselben Auswahl, die auch den
 * Verbrauch summiert; sie kann gar nicht anders ausfallen als der Balken darüber.
 *
 * Bei einem aufbauenden Budget reicht das Fenster bis zum Start zurück — das können
 * viele Monate sein. Deshalb ein Deckel mit eigener Scrollfläche statt einer Karte,
 * die den halben Bildschirm füllt.
 */
function BudgetBuchungen({
  posten,
  empfaenger,
  kategorieNamen,
  verbraucht,
}: {
  posten: readonly Verbrauchsposten[];
  empfaenger: ReadonlyMap<string, string>;
  kategorieNamen: ReadonlyMap<string, string>;
  verbraucht: number;
}) {
  const { t } = useTranslation();
  const geld = useGeld();

  if (posten.length === 0) {
    return (
      <div className="muted" style={{ fontSize: "var(--fs-xs)", padding: "8px 0 2px" }}>
        {t("uebersicht.budgetOhneBuchungen")}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface-2, rgba(0,0,0,.015))",
        borderRadius: "var(--r-md)",
        padding: "4px 10px",
        margin: "8px 0 2px",
        maxHeight: 260,
        overflowY: "auto",
      }}
    >
      {posten.map((p, i) => {
        const kategorie = p.kategorieId ? kategorieNamen.get(p.kategorieId) : undefined;
        const name =
          p.buchung.notiz || empfaenger.get(p.buchung.id) || kategorie || t("uebersicht.budgetBuchung");
        return (
          <div
            key={`${p.buchung.id}#${i}`}
            style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", fontSize: "12.5px", borderBottom: i < posten.length - 1 ? "1px solid var(--line-soft)" : "none" }}
          >
            <span className="num" style={{ color: "var(--ink-3)", fontWeight: "var(--fw-bold)", flex: "0 0 auto" }}>
              {p.buchung.datum.slice(8)}.{p.buchung.datum.slice(5, 7)}.{p.buchung.datum.slice(2, 4)}
            </span>
            <span title={name} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>
              {name}
            </span>
            {kategorie && kategorie !== name && (
              <span style={{ color: "var(--ink-3)", fontSize: "11.5px", flex: "0 0 auto" }}>{kategorie}</span>
            )}
            <span className="num" style={{ marginLeft: "auto", flex: "0 0 auto", fontWeight: "var(--fw-semi)" }}>
              {geld.format(p.betrag)}
            </span>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0 5px", borderTop: "1px solid var(--line)", fontSize: "12.5px", fontWeight: "var(--fw-bold)" }}>
        <span>{t("uebersicht.budgetSumme")}</span>
        <span className="num">{geld.formatMitSymbol(verbraucht)}</span>
      </div>
    </div>
  );
}
