// Übersicht — was JETZT gilt, und sonst nichts.
//
// Zwei Blöcke: die drei Monatskarten (laufender Monat plus die beiden folgenden) und
// darunter die Budgets dieses Monats. Alles, was einen ZEITRAUM auswertet — Verlauf,
// Kennzahlen, Aufschlüsselung nach Kategorien — ist 2026-08-19 in den Bereich „Analyse"
// gezogen. Vorher hing das an einem Screen, den man erst nach unten scrollen musste,
// bis die Kategorien kamen; und die Frage „wie stehe ich gerade da?" ging dabei unter.
//
// Der Monatsumschalter geht ausdrücklich nur nach HINTEN. Ein Budget in der Zukunft hat
// keinen Verbrauch, es gäbe also nichts zu zeigen — was kommt, steht in den Karten
// darüber.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  budgetBuchungen,
  budgetStand,
  elternBudget,
  fruehesterMonat,
  toIso,
  verbrauchsFenster,
  type Budget,
  type Inventargegenstand,
  type IstBuchung,
  type Kategorie,
  type Verbrauchsposten,
  type Zahlungsregel,
} from "../../core";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteBudgetRepository as budgetRepo } from "../persistence/sqliteBudgetRepository";
import { sqliteInventarRepository as inventarRepo } from "../persistence/sqliteInventarRepository";
import { sqliteUmsatzRepository as umsatzRepo } from "../persistence/sqliteImportRepositories";
import { Card, CoverageTrack, Pill } from "./ds";
import { MonatsAusblick } from "./MonatsAusblick";
import { PageHead } from "./PageHead";
import { geldFarbe } from "./geldFarbe";
import { useGeld } from "./einstellungenKontext";

function heuteIso(): string {
  const n = new Date();
  return toIso({ y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() });
}

/** Der Monatsschlüssel `zurueck` Monate vor `von` (ISO-Monat „YYYY-MM"). */
function monatMinus(von: string, zurueck: number): string {
  const [j, m] = von.split("-").map(Number);
  const gesamt = j * 12 + (m - 1) - zurueck;
  return `${Math.floor(gesamt / 12)}-${String((gesamt % 12) + 1).padStart(2, "0")}`;
}

export function UebersichtScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);
  const dieserMonat = heute.slice(0, 7);

  const [ist, setIst] = useState<IstBuchung[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [inventar, setInventar] = useState<Inventargegenstand[]>([]);
  /**
   * Buchungs-ID → Empfänger aus dem Import. Steht am Umsatz, nicht an der Buchung —
   * ohne ihn heisst jede aufgeklappte Zeile „Buchung".
   */
  const [empfaenger, setEmpfaenger] = useState<ReadonlyMap<string, string>>(new Map());
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Welcher Monat in der Budget-Liste steht — Vorgabe ist der laufende. */
  const [monat, setMonat] = useState(dieserMonat);
  /** Welches Budget seine Buchungen zeigt — höchstens eines, sonst wird die Karte endlos. */
  const [offenesBudget, setOffenesBudget] = useState<string | null>(null);

  // Verwandte Repos in EINEM Effekt per Promise.all und zusammen setzen: gestaffelte
  // setState lassen abgeleitete Werte kurz gegen leere Listen rechnen.
  useEffect(() => {
    (async () => {
      try {
        const [i, kat, r, b, inv, ums] = await Promise.all([
          ledgerRepo.alle(), kategorieRepo.alle(), regelRepo.alle(), budgetRepo.alle(), inventarRepo.alle(),
          umsatzRepo.alle(),
        ]);
        setIst(i);
        setKategorien(kat);
        setRegeln(r);
        setBudgets(b);
        setInventar(inv);
        setEmpfaenger(
          new Map(
            ums
              .filter((u) => u.istbuchungId && u.gegenpartei)
              .map((u) => [u.istbuchungId!, u.gegenpartei!]),
          ),
        );
        setFehler(null);
      } catch (e) {
        setFehler(e instanceof Error ? e.message : String(e));
      } finally {
        setGeladen(true);
      }
    })();
  }, []);

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  /**
   * Zur Auswahl stehen die Monate, in denen es überhaupt Buchungen gibt — höchstens
   * aber zwei Jahre zurück. Eine Liste aller je gebuchten Monate wäre bei einem
   * mehrjährigen Bestand ein Dropdown mit sechzig Einträgen.
   */
  const monate = useMemo(() => {
    const frueh = (fruehesterMonat(ist) ?? heute).slice(0, 7);
    const liste: string[] = [];
    for (let i = 0; i < 24; i++) {
      const m = monatMinus(dieserMonat, i);
      liste.push(m);
      if (m <= frueh) break;
    }
    return liste;
  }, [ist, heute, dieserMonat]);

  /** Die Budgets in Baumordnung — eingebettete stehen unter ihrem Dach (wie im Bereich Budgets). */
  const zeilen = useMemo(() => {
    // Der Stichtag ist der LETZTE Tag des gewählten Monats, damit ein vergangener Monat
    // vollständig zählt; `budgetStand` fenstert selbst auf den Monat.
    const am = `${monat}-28`;
    const kinder = new Map<string | null, Budget[]>();
    for (const b of budgets) {
      const eltern = elternBudget(b, budgets, kategorien)?.id ?? null;
      const liste = kinder.get(eltern);
      if (liste) liste.push(b);
      else kinder.set(eltern, [b]);
    }
    const raus: {
      budget: Budget; tiefe: number; rahmen: number; verbraucht: number; rest: number;
      von: string; bis: string;
    }[] = [];
    const gehe = (elternId: string | null, tiefe: number) => {
      const gruppe = [...(kinder.get(elternId) ?? [])].sort((a, b) =>
        (kategorieName.get(a.kategorieId) ?? "").localeCompare(kategorieName.get(b.kategorieId) ?? ""),
      );
      for (const b of gruppe) {
        raus.push({
          budget: b, tiefe,
          ...budgetStand(ist, kategorien, b, budgets, am),
          ...verbrauchsFenster(b, am),
        });
        gehe(b.id, tiefe + 1);
      }
    };
    gehe(null, 0);
    return raus;
  }, [budgets, kategorien, ist, monat, kategorieName]);

  return (
    <div className="screen">
      <PageHead title={t("uebersicht.titel")} subtitle={t("uebersicht.untertitel")} />

      {fehler && <Card style={{ borderColor: "var(--warn)" }}>{t("uebersicht.fehlerDb")} ({fehler})</Card>}

      {geladen && !fehler && (
        <MonatsAusblick
          regeln={regeln}
          budgets={budgets}
          inventar={inventar}
          ist={ist}
          kategorien={kategorien}
          heute={heute}
          empfaenger={empfaenger}
        />
      )}

      {geladen && !fehler && (
        <Card
          title={t("uebersicht.budgetsTitel")}
          subtitle={monat === dieserMonat ? t("uebersicht.budgetsLaufend") : t("uebersicht.budgetsVergangen")}
          action={
            budgets.length > 0 ? (
              <select
                className="field"
                style={{ width: "auto" }}
                aria-label={t("uebersicht.monatWaehlen")}
                value={monat}
                onChange={(e) => setMonat(e.target.value)}
              >
                {monate.map((m) => (
                  <option key={m} value={m}>
                    {m === dieserMonat ? t("uebersicht.monatDieser", { monat: m }) : m}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        >
          {budgets.length === 0 ? (
            <div className="muted">{t("uebersicht.budgetsLeer")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
              {zeilen.map((z) => {
                const offen = offenesBudget === z.budget.id;
                const name = kategorieName.get(z.budget.kategorieId) ?? "?";
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
                        posten={budgetBuchungen(ist, kategorien, z.budget, budgets, z.von, z.bis)}
                        empfaenger={empfaenger}
                        kategorieName={kategorieName}
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
  kategorieName,
  verbraucht,
}: {
  posten: readonly Verbrauchsposten[];
  empfaenger: ReadonlyMap<string, string>;
  kategorieName: Map<string, string>;
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
        const kategorie = p.kategorieId ? kategorieName.get(p.kategorieId) : undefined;
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
