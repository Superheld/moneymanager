// Die Befunde: was die Zahlen über den Zeitraum sagen, wenn man sie fragt, wie es um die
// Finanzen steht.
//
// Der Block darüber beantwortet „wie viel und wohin" — Verlauf und Kategorien. Das reicht,
// solange man nachsieht; es reicht nicht, um zu beurteilen. Hier stehen deshalb die
// Fragen, die eine ANTWORT haben statt einer Zahl: wie viel ist überhaupt frei, hält der
// Plan, wo fliesst etwas, das in keiner Planung vorkommt.
//
// **Sechs Lupen, eine Fläche.** Untereinander wäre der Bereich vier Bildschirme lang, und
// was unten steht, sieht niemand. Dasselbe Mittel wie beim Verlauf darüber (Fluss ·
// Saldo · Tabelle), und aus demselben Grund. Voreingestellt ist „fest und frei": es ist
// die Frage, aus der die anderen fünf folgen.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Befunde, IstBuchung } from "../../../application";
import { Card, DataTable, KPIStat, Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

type Lupe = "fest" | "empfaenger" | "kategorien" | "budgets" | "vertraege" | "ausreisser";

const LUPEN: Lupe[] = ["fest", "empfaenger", "kategorien", "budgets", "vertraege", "ausreisser"];

/** Wie viele Zeilen eine Rangliste zeigt, bevor sie blättert. */
const SEITE = 12;

export function BefundeBereich({
  befunde,
  kontoNamen,
  onBuchung,
}: {
  befunde: Befunde;
  kontoNamen: ReadonlyMap<string, string>;
  onBuchung?: (b: IstBuchung) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [lupe, setLupe] = useState<Lupe>("fest");
  const z = befunde.kennzahlen;

  /** Ein Bruchteil als Prozentzahl. `undefined` bleibt ein Strich — siehe Kern. */
  const quote = (x?: number) =>
    x == null ? "—" : `${(x * 100).toLocaleString(geld.locale, { maximumFractionDigits: 0 })} %`;

  const tabellentexte = {
    labelSeite: t("konten.seite"),
    labelErste: t("konten.seiteErste"),
    labelLetzte: t("konten.seiteLetzte"),
    labelZurueck: t("konten.seiteZurueck"),
    labelVor: t("konten.seiteVor"),
  };

  return (
    <>
      {/* Vier Zahlen, die zusammen „wie steht es" beantworten. Sie stehen ÜBER den Lupen,
          weil sie die Frage sind und die Lupen die Begründung. */}
      <div className="kpis">
        <KPIStat
          size="chip"
          label={t("befunde.kpiFest")}
          value={geld.format(z.festJeMonat)}
          unit={geld.symbol}
          meta={t("befunde.kpiFestMeta", { quote: quote(z.fixkostenquote) })}
        />
        <KPIStat
          size="chip"
          label={t("befunde.kpiFrei")}
          value={geld.format(z.freiJeMonat)}
          unit={geld.symbol}
          meta={t("befunde.kpiFreiMeta")}
        />
        <KPIStat
          size="chip"
          label={t("befunde.kpiSparquote")}
          value={quote(z.sparquote)}
          tone={z.sparquote != null && z.sparquote < 0 ? "warn" : "ok"}
          meta={t("befunde.kpiSparquoteMeta")}
        />
        <KPIStat
          size="chip"
          label={t("befunde.kpiReichweite")}
          value={
            z.reichweiteMonate == null
              ? "—"
              : z.reichweiteMonate.toLocaleString(geld.locale, { maximumFractionDigits: 1 })
          }
          unit={t("befunde.monate")}
          tone={z.reichweiteMonate != null && z.reichweiteMonate < 3 ? "warn" : "default"}
          meta={t("befunde.kpiReichweiteMeta")}
        />
      </div>

      <Card title={t("befunde.titel")} subtitle={t(`befunde.lupe.${lupe}.untertitel`)}>
        <div
          style={{
            display: "inline-flex",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            overflow: "hidden",
            background: "var(--surface)",
            marginBottom: "var(--sp-3)",
            flexWrap: "wrap",
          }}
        >
          {LUPEN.map((l, i) => {
            const an = lupe === l;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={an}
                onClick={() => setLupe(l)}
                style={{
                  padding: "6px 12px",
                  fontSize: "12.5px",
                  fontWeight: an ? "var(--fw-bold)" : "var(--fw-semi)",
                  fontFamily: "var(--font-ui)",
                  border: "none",
                  borderLeft: i ? "1px solid var(--line-soft)" : "none",
                  background: an ? "var(--accent-wash)" : "transparent",
                  color: an ? "var(--accent-deep)" : "var(--ink-2)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t(`befunde.lupe.${l}.name`)}
              </button>
            );
          })}
        </div>

        {lupe === "fest" && (
          <DataTable
            sortable
            pageSize={SEITE}
            {...tabellentexte}
            columns={[
              { key: "monat", label: t("befunde.spalteMonat") },
              {
                key: "fest",
                label: `${t("befunde.spalteFest")} ${geld.symbol}`,
                align: "right",
                render: (r) => geld.format(r.fest),
              },
              {
                key: "frei",
                label: `${t("befunde.spalteFrei")} ${geld.symbol}`,
                align: "right",
                render: (r) => geld.format(r.frei),
              },
              {
                key: "einnahmen",
                label: `${t("befunde.spalteEinnahmen")} ${geld.symbol}`,
                align: "right",
                render: (r) => geld.format(r.einnahmen),
              },
              {
                // Der Anteil ist die eigentliche Aussage der Zeile: 1.200 fest sind bei
                // 4.000 Einnahmen etwas anderes als bei 1.500.
                key: "anteil",
                label: t("befunde.spalteGebunden"),
                align: "right",
                sortValue: (r) => (r.einnahmen > 0 ? r.fest / r.einnahmen : -1),
                render: (r) => (r.einnahmen > 0 ? quote(r.fest / r.einnahmen) : "—"),
              },
            ]}
            rows={[...befunde.festFrei].reverse()}
          />
        )}

        {lupe === "empfaenger" && (
          <DataTable
            sortable
            pageSize={SEITE}
            {...tabellentexte}
            columns={[
              { key: "name", label: t("befunde.spalteEmpfaenger"), maxWidth: 320 },
              {
                key: "summe",
                label: `${t("befunde.spalteSumme")} ${geld.symbol}`,
                align: "right",
                render: (r) => geld.format(r.summe),
              },
              { key: "anzahl", label: t("befunde.spalteAnzahl"), align: "right" },
              {
                // Erst beide zusammen sagen etwas: zwölf Zahlungen in zwölf Monaten sind
                // ein Abo, zwölf in einem Monat ein Einkauf, der oft passiert.
                key: "monate",
                label: t("befunde.spalteMonate"),
                align: "right",
              },
              { key: "letzte", label: t("befunde.spalteLetzte"), align: "right" },
            ]}
            rows={[...befunde.empfaenger]}
          />
        )}

        {lupe === "kategorien" && (
          <DataTable
            sortable
            pageSize={SEITE}
            {...tabellentexte}
            columns={[
              { key: "name", label: t("befunde.spalteKategorie"), maxWidth: 260 },
              { key: "anzahl", label: t("befunde.spalteAnzahl"), align: "right" },
              {
                key: "summe",
                label: `${t("befunde.spalteSumme")} ${geld.symbol}`,
                align: "right",
                render: (r) => geld.format(r.summe),
              },
              {
                key: "schnitt",
                label: `${t("befunde.spalteSchnitt")} ${geld.symbol}`,
                align: "right",
                render: (r) => geld.format(r.schnitt),
              },
              {
                key: "groesster",
                label: `${t("befunde.spalteGroesster")} ${geld.symbol}`,
                align: "right",
                render: (r) => geld.format(r.groesster),
              },
              { key: "monate", label: t("befunde.spalteMonate"), align: "right" },
            ]}
            rows={[...befunde.kategorien]}
          />
        )}

        {lupe === "budgets" && (
          <>
            {befunde.budgets.length === 0 ? (
              <div className="muted">{t("befunde.keineBudgets")}</div>
            ) : (
              <DataTable
                sortable
                pageSize={SEITE}
                {...tabellentexte}
                columns={[
                  { key: "name", label: t("befunde.spalteBudget"), maxWidth: 260 },
                  {
                    key: "rahmen",
                    label: `${t("befunde.spalteRahmen")} ${geld.symbol}`,
                    align: "right",
                    render: (r) => geld.format(r.rahmen),
                  },
                  {
                    key: "verbraucht",
                    label: `${t("befunde.spalteVerbraucht")} ${geld.symbol}`,
                    align: "right",
                    render: (r) => geld.format(r.verbraucht),
                  },
                  {
                    // Die Zahl, für die es diese Lupe gibt: eine aufgehende Jahressumme
                    // kann in jedem einzelnen Monat verfehlt worden sein.
                    key: "gehalten",
                    label: t("befunde.spalteGehalten"),
                    align: "right",
                    sortValue: (r) => r.gehalten / Math.max(1, r.monate),
                    render: (r) => (
                      <Pill variant={r.gehalten === r.monate ? "ok" : r.gehalten * 2 >= r.monate ? "neutral" : "warn"}>
                        {t("befunde.gehaltenVon", { gehalten: r.gehalten, monate: r.monate })}
                      </Pill>
                    ),
                  },
                  {
                    key: "schlimmste",
                    label: `${t("befunde.spalteSchlimmste")} ${geld.symbol}`,
                    align: "right",
                    render: (r) =>
                      r.schlimmste > 0 ? (
                        <span style={{ color: "var(--warn-deep)" }}>{geld.format(r.schlimmste)}</span>
                      ) : (
                        "—"
                      ),
                  },
                ]}
                rows={[...befunde.budgets]}
              />
            )}

            {/* Der eigentliche Befund dieses Registers steht UNTER der Tabelle und nicht
                darin: was in keinem Budget vorkommt, hat dort auch keine Zeile. Ein
                Haushalt kann jedes Budget halten und trotzdem im Minus landen. */}
            <div style={{ marginTop: "var(--sp-4)" }}>
              <div
                style={{
                  fontSize: "var(--fs-2xs)",
                  textTransform: "uppercase",
                  letterSpacing: "var(--ls-eyebrow)",
                  color: "var(--ink-3)",
                  marginBottom: "var(--sp-2)",
                }}
              >
                {t("befunde.blindTitel")}
              </div>
              {befunde.blindeFlecken.length === 0 ? (
                <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {t("befunde.blindKeine")}
                </div>
              ) : (
                <DataTable
                  sortable
                  pageSize={SEITE}
                  {...tabellentexte}
                  columns={[
                    { key: "name", label: t("befunde.spalteKategorie"), maxWidth: 260 },
                    {
                      key: "summe",
                      label: `${t("befunde.spalteSumme")} ${geld.symbol}`,
                      align: "right",
                      render: (r) => geld.format(r.summe),
                    },
                    {
                      key: "anteil",
                      label: t("befunde.spalteAnteil"),
                      align: "right",
                      render: (r) => quote(r.anteil),
                    },
                  ]}
                  rows={[...befunde.blindeFlecken]}
                />
              )}
            </div>
          </>
        )}

        {lupe === "vertraege" &&
          (befunde.vertraege.length === 0 ? (
            <div className="muted">{t("befunde.keineVertraege")}</div>
          ) : (
            <DataTable
              sortable
              pageSize={SEITE}
              {...tabellentexte}
              columns={[
                { key: "anbieter", label: t("befunde.spalteVertrag"), maxWidth: 240 },
                {
                  key: "soll",
                  label: `${t("befunde.spalteSoll")} ${geld.symbol}`,
                  align: "right",
                  sortValue: (r) => r.soll ?? -1,
                  // Kein Soll heisst „keine Zahlungsregel" und nicht „null Euro" — eine 0
                  // liesse den Vertrag aussehen, als koste er unerwartet Geld.
                  render: (r) => (r.soll == null ? "—" : geld.format(r.soll)),
                },
                {
                  key: "ist",
                  label: `${t("befunde.spalteIst")} ${geld.symbol}`,
                  align: "right",
                  render: (r) => geld.format(r.ist),
                },
                {
                  key: "abweichung",
                  label: t("befunde.spalteAbweichung"),
                  align: "right",
                  sortValue: (r) => (r.soll ? (r.ist - r.soll) / r.soll : 0),
                  render: (r) =>
                    r.soll == null || r.soll === 0 ? (
                      "—"
                    ) : (
                      <span style={{ color: geldFarbe(r.soll - r.ist) }}>
                        {quote((r.ist - r.soll) / r.soll)}
                      </span>
                    ),
                },
                { key: "anzahl", label: t("befunde.spalteAnzahl"), align: "right" },
                {
                  // Eine grosse Spanne heisst: die eine Rate im Vertrag ist eine Fiktion,
                  // und die daraus abgeleitete Erkennungsspanne trifft fast nie.
                  key: "spanne",
                  label: `${t("befunde.spalteSpanne")} ${geld.symbol}`,
                  align: "right",
                  sortValue: (r) => r.groesste - r.kleinste,
                  render: (r) =>
                    r.anzahl === 0 ? "—" : `${geld.format(r.kleinste)} – ${geld.format(r.groesste)}`,
                },
                {
                  key: "kategorien",
                  label: t("befunde.spalteKategorie"),
                  maxWidth: 220,
                  sortValue: (r) => r.kategorien.length,
                  render: (r) =>
                    r.kategorien.length === 0 ? (
                      "—"
                    ) : (
                      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                        {r.kategorien.map((k: string) => (
                          <Pill key={k} variant={r.kategorien.length > 1 ? "warn" : "neutral"}>
                            {k}
                          </Pill>
                        ))}
                      </span>
                    ),
                },
              ]}
              rows={[...befunde.vertraege]}
            />
          ))}

        {lupe === "ausreisser" && (
          <DataTable
            sortable
            pageSize={SEITE}
            {...tabellentexte}
            onRowClick={onBuchung ? (r) => onBuchung(r.buchung) : undefined}
            columns={[
              { key: "datum", label: t("befunde.spalteDatum"), sortValue: (r) => r.buchung.datum, render: (r) => r.buchung.datum },
              {
                key: "konto",
                label: t("befunde.spalteKonto"),
                maxWidth: 200,
                sortValue: (r) => kontoNamen.get(r.buchung.kontoId) ?? "",
                render: (r) => kontoNamen.get(r.buchung.kontoId) ?? "—",
              },
              {
                key: "betrag",
                label: `${t("befunde.spalteBetrag")} ${geld.symbol}`,
                align: "right",
                render: (r) => geld.format(r.betrag),
              },
              {
                // Der Bezug ist der Punkt: ein Betrag ist nur im Verhältnis zum Monat gross.
                key: "vielfaches",
                label: t("befunde.spalteVielfaches"),
                align: "right",
                sortValue: (r) => r.vielfaches ?? 0,
                render: (r) =>
                  r.vielfaches == null
                    ? "—"
                    : `${r.vielfaches.toLocaleString(geld.locale, { maximumFractionDigits: 2 })} ×`,
              },
            ]}
            rows={[...befunde.grossposten].slice(0, 60)}
          />
        )}
      </Card>
    </>
  );
}
