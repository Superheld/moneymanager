// Monatsausblick — drei Karten nebeneinander: der laufende Monat und die beiden
// folgenden, jeweils als Aufrechnung (Einnahmen − Verträge − Budgets = bleibt).
//
// Bewusst Zahlen statt Diagramm: die Frage „was bleibt diesen Monat, und was in den
// nächsten beiden?" beantwortet eine Spalte Zahlen direkter als jede Kurve. Der
// laufende Monat trägt zwei Spalten (geplant / gebucht), die kommenden nur den Plan.
//
// Jede Zeile lässt sich aufklappen und zeigt dann ihre Posten: welche Rate schon
// abgebucht ist, wie weit ein Budget durch ist. Gerechnet wird nichts hier — die
// Aufrechnung kommt fertig aus `monatsAusblick` (Kern).

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  monatsAusblicke,
  type AusblickPosten,
  type AusblickZeile,
  type Budget,
  type Inventargegenstand,
  type IstBuchung,
  type Kategorie,
  type MonatsAusblick as Ausblick,
  type Zahlungsregel,
} from "../../core";
import { Card, CoverageTrack, Pill } from "./ds";
import { useGeld } from "./einstellungenKontext";
import { geldFarbe } from "./geldFarbe";

const MONATSNAMEN_KEY = "ausblick.monat";

export function MonatsAusblick({
  regeln,
  budgets,
  inventar,
  ist,
  kategorien,
  heute,
}: {
  regeln: Zahlungsregel[];
  budgets: Budget[];
  inventar: Inventargegenstand[];
  ist: IstBuchung[];
  kategorien: Kategorie[];
  /** Von außen hereingereicht, damit die Komponente testbar bleibt (keine Uhr im Render). */
  heute: string;
}) {
  const { t } = useTranslation();
  const ausblicke = useMemo(
    () => monatsAusblicke({ regeln, budgets, inventar, ist, kategorien, heute }),
    [regeln, budgets, inventar, ist, kategorien, heute],
  );
  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  const ohneEinnahmeplan = ausblicke.every((a) => a.zeilen.find((z) => z.id === "einnahmen")!.plan === 0);

  // Ohne Verträge und Budgets gäbe es drei Karten voller Nullen — das liest sich wie ein
  // Datenfehler, nicht wie ein leerer Plan. Lieber einmal sagen, woher die Zahlen kommen.
  if (regeln.length === 0 && budgets.length === 0 && inventar.length === 0) {
    return <Card subtitle={t("ausblick.leerUntertitel")}>{t("ausblick.leer")}</Card>;
  }

  return (
    <div>
      <div className="ausblick-karten">
        {ausblicke.map((a) => (
          <AusblickKarte key={a.label} ausblick={a} kategorieName={kategorieName} />
        ))}
      </div>
      {ohneEinnahmeplan && (
        // Kein Schätzwert an dieser Stelle: die Einnahmen kommen aus Verträgen. Fehlen
        // sie, sagt die Karte das, statt eine Zahl zu erfinden.
        <div className="muted" style={{ fontSize: "var(--fs-2xs)", marginTop: "var(--sp-3)" }}>
          {t("ausblick.hinweisKeineEinnahmen")}
        </div>
      )}
    </div>
  );
}

function AusblickKarte({
  ausblick,
  kategorieName,
}: {
  ausblick: Ausblick;
  kategorieName: Map<string, string>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [offen, setOffen] = useState<string | null>(null);
  const zweiSpalten = !ausblick.zukunft;
  const monatName = t(`${MONATSNAMEN_KEY}.${ausblick.monat}`);
  /** Die eine Zahl unter dem Strich. */
  const bleibt = ausblick.zukunft ? ausblick.restPlan : (ausblick.restIst ?? 0);

  return (
    <Card
      title={`${monatName} ${ausblick.jahr}`}
      subtitle={ausblick.laufend ? t("ausblick.untertitelLaufend") : t("ausblick.untertitelVorschau")}
      action={
        ausblick.laufend ? <Pill variant="ist">{t("ausblick.pillLaufend")}</Pill> : <Pill variant="plan">{t("ausblick.pillVorschau")}</Pill>
      }
    >
      {/* Spaltenköpfe nur dort, wo es zwei Spalten gibt — sonst ist die Zahl
          selbsterklärend. Gebucht steht vor Geplant: das Tatsächliche zuerst. */}
      {zweiSpalten && (
        <div style={{ ...zeileGrid(true), ...kopfStil }}>
          <span />
          <span style={{ textAlign: "right" }}>{t("ausblick.spalteIst")}</span>
          <span style={{ textAlign: "right" }}>{t("ausblick.spaltePlan")}</span>
        </div>
      )}

      {ausblick.zeilen.map((z, i) => (
        <ZeileMitPosten
          key={z.id}
          zeile={z}
          zweiSpalten={zweiSpalten}
          letzte={i === ausblick.zeilen.length - 1}
          offen={offen === z.id}
          onToggle={() => setOffen((cur) => (cur === z.id ? null : z.id))}
          kategorieName={kategorieName}
        />
      ))}

      {/* Unter dem Strich EINE Zahl: im laufenden Monat das Gebuchte (die Realität),
          in der Vorschau der Plan. Die jeweils andere Sicht steht klein darunter als
          Abstand zum Plan — zwei fette Zahlen nebeneinander lasen sich unruhig.
          Der Strich ist die Trennlinie der letzten Zeile; ein eigener kam als zweite
          Linie direkt darüber zu liegen. */}
      <div
        style={{
          ...zeileGrid(zweiSpalten),
          marginTop: "var(--sp-3)",
          fontWeight: "var(--fw-black)",
          fontSize: "var(--fs-body)",
          alignItems: "start",
        }}
      >
        <span>{t("ausblick.bleibt")}</span>
        <span style={{ gridColumn: zweiSpalten ? "2 / span 2" : "2", textAlign: "right" }}>
          <span className="num" style={{ color: geldFarbe(bleibt) }}>
            {geld.formatMitSymbol(bleibt, { mitVorzeichen: true })}
          </span>
          {zweiSpalten && (
            <span
              style={{
                display: "block",
                fontSize: "var(--fs-2xs)",
                fontWeight: "var(--fw-semi)",
                color: "var(--ink-3)",
                marginTop: 2,
              }}
            >
              {t("ausblick.vsPlan", { betrag: geld.formatMitSymbol(bleibt - ausblick.restPlan, { mitVorzeichen: true }) })}
            </span>
          )}
        </span>
      </div>
    </Card>
  );
}

function ZeileMitPosten({
  zeile,
  zweiSpalten,
  letzte,
  offen,
  onToggle,
  kategorieName,
}: {
  zeile: AusblickZeile;
  zweiSpalten: boolean;
  /** Die unterste Zeile trägt den Strich, gegen den „Bleibt" gerechnet wird. */
  letzte: boolean;
  offen: boolean;
  onToggle: () => void;
  kategorieName: Map<string, string>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const aufklappbar = zeile.posten.length > 0;

  return (
    <div>
      <div
        role={aufklappbar ? "button" : undefined}
        tabIndex={aufklappbar ? 0 : undefined}
        aria-expanded={aufklappbar ? offen : undefined}
        onClick={aufklappbar ? onToggle : undefined}
        onKeyDown={aufklappbar ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle()) : undefined}
        style={{
          ...zeileGrid(zweiSpalten),
          padding: "9px 0",
          borderBottom: `1px solid ${letzte ? "var(--line)" : "var(--line-soft)"}`,
          cursor: aufklappbar ? "pointer" : "default",
          fontSize: "13.5px",
          background: offen ? "var(--accent-soft, rgba(20,160,160,.10))" : "transparent",
        }}
      >
        <span style={{ fontWeight: "var(--fw-semi)", color: "var(--ink-2)", ...gekappt }}>
          {aufklappbar && <span style={{ color: "var(--ink-3)", marginRight: 6 }}>{offen ? "▾" : "▸"}</span>}
          {t(`ausblick.zeile.${zeile.id}`)}
        </span>
        {zweiSpalten && (
          <span className="num" style={{ textAlign: "right", fontWeight: "var(--fw-bold)", color: geldFarbe(zeile.ist ?? 0) }}>
            {geld.format(zeile.ist ?? 0, { mitVorzeichen: true })}
          </span>
        )}
        <span className="num" style={{ textAlign: "right", fontWeight: "var(--fw-bold)", color: geldFarbe(zeile.plan) }}>
          {geld.format(zeile.plan, { mitVorzeichen: true })}
        </span>
      </div>

      {offen && (
        // Dieselbe Fläche wie beim Aufklappen in der Historie. Der negative Rand hebt das
        // Innenpolster wieder auf, damit die Beträge mit denen der Zeile darüber fluchten.
        <div
          style={{
            background: "var(--surface-2, rgba(0,0,0,.015))",
            borderRadius: "var(--r-md)",
            padding: "4px 8px",
            margin: "4px -8px 10px",
          }}
        >
          {zeile.id === "budgets"
            ? zeile.posten.map((p) => (
                <BudgetPosten key={p.schluessel} posten={p} name={kategorieName.get(p.bezeichnung) ?? p.bezeichnung} zeigeIst={zweiSpalten} />
              ))
            : zeile.posten.map((p) => (
                <PlanPosten key={p.schluessel} posten={p} zeile={zeile.id} zweiSpalten={zweiSpalten} />
              ))}
        </div>
      )}
    </div>
  );
}

/** Ein Vertragsposten: Fälligkeit, Name, geplanter Betrag — und ob er schon gebucht ist. */
function PlanPosten({
  posten,
  zeile,
  zweiSpalten,
}: {
  posten: AusblickPosten;
  zeile: AusblickZeile["id"];
  zweiSpalten: boolean;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const erledigt = posten.status === "bezahlt" || posten.status === "gebucht";
  const name = posten.status === "ohnePlan" ? t(`ausblick.sammel.${zeile}`) : posten.bezeichnung;

  return (
    <div style={{ ...zeileGrid(zweiSpalten), padding: "5px 0", fontSize: "12.5px", alignItems: "baseline" }}>
      {/* Anbieternamen aus dem Import sind lang („SWB - Service - Wohnungsvermietungs-
          und -baugesellschaft mbH"). Eine Zeile, abgeschnitten; der volle Name steht im
          title — umbrechend zerlegte er die Karte. */}
      <span style={{ color: "var(--ink-2)", display: "flex", alignItems: "baseline", gap: 6, ...gekappt }} title={name}>
        {posten.datum && <span style={{ color: "var(--ink-3)", fontWeight: "var(--fw-bold)", flex: "0 0 auto" }}>{tagVon(posten.datum)}</span>}
        <span style={{ opacity: erledigt ? 0.72 : 1, ...gekappt }}>{name}</span>
        {posten.status === "bezahlt" && <Pill variant="ok" style={{ marginLeft: 0 }}>{t("ausblick.statusBezahlt")}</Pill>}
      </span>
      {zweiSpalten && (
        <span className="num" style={{ textAlign: "right", color: erledigt ? "var(--ink)" : "var(--ink-3)" }}>
          {posten.ist == null ? t("ausblick.statusOffen") : geld.format(posten.ist, { mitVorzeichen: true })}
        </span>
      )}
      <span className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>
        {posten.plan === 0 ? "—" : geld.format(posten.plan, { mitVorzeichen: true })}
      </span>
    </div>
  );
}

/** Ein Budget: wie weit ist der Rahmen durch? Balken statt zweier Zahlen. */
function BudgetPosten({ posten, name, zeigeIst }: { posten: AusblickPosten; name: string; zeigeIst: boolean }) {
  const geld = useGeld();
  const rahmen = Math.abs(posten.plan);
  const verbraucht = Math.abs(posten.ist ?? 0);
  return (
    <div style={{ padding: "6px 0" }}>
      <CoverageTrack
        value={zeigeIst ? verbraucht : 0}
        max={Math.max(1, rahmen)}
        label={<span style={{ fontSize: "12.5px" }}>{name}</span>}
        right={
          <span className="num" style={{ fontSize: "12.5px" }}>
            {zeigeIst
              ? `${geld.format(verbraucht)} / ${geld.formatMitSymbol(rahmen)}`
              : geld.formatMitSymbol(rahmen)}
          </span>
        }
      />
    </div>
  );
}

/**
 * Drei Spalten im laufenden Monat (Label · Plan · Ist), sonst zwei. Die Zahlenspalten
 * haben eine FESTE Breite: mit `auto` bemaß sich jede Karte an ihrem eigenen längsten
 * Betrag, und die drei Karten standen sichtbar gegeneinander versetzt. 88px trägt
 * „−9.999,99" bei tabellarischen Ziffern.
 */
const zeileGrid = (zweiSpalten: boolean) => ({
  display: "grid",
  gridTemplateColumns: zweiSpalten ? "1fr 88px 88px" : "1fr 88px",
  columnGap: "var(--sp-3)",
  alignItems: "center",
} as const);

/** Einzeilig, überlanger Text mit „…" — braucht in einem Grid das `minWidth: 0`. */
const gekappt = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const kopfStil = {
  fontSize: "var(--fs-2xs)",
  fontWeight: "var(--fw-bold)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "var(--ink-3)",
  paddingBottom: "var(--sp-2)",
} as const;

const tagVon = (iso: string) => `${iso.slice(8)}.`;
