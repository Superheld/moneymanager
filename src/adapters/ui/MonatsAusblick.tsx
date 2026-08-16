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
  type IstBuchung,
  type Kategorie,
  type MonatsAusblick as Ausblick,
  type Zahlungsregel,
} from "../../core";
import { Card, CoverageTrack, Pill } from "./ds";
import { useGeld } from "./einstellungenKontext";

const MONATSNAMEN_KEY = "ausblick.monat";

export function MonatsAusblick({
  regeln,
  budgets,
  ist,
  kategorien,
  heute,
}: {
  regeln: Zahlungsregel[];
  budgets: Budget[];
  ist: IstBuchung[];
  kategorien: Kategorie[];
  /** Von außen hereingereicht, damit die Komponente testbar bleibt (keine Uhr im Render). */
  heute: string;
}) {
  const { t } = useTranslation();
  const ausblicke = useMemo(
    () => monatsAusblicke({ regeln, budgets, ist, kategorien, heute }),
    [regeln, budgets, ist, kategorien, heute],
  );
  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  const ohneEinnahmeplan = ausblicke.every((a) => a.zeilen.find((z) => z.id === "einnahmen")!.plan === 0);

  // Ohne Verträge und Budgets gäbe es drei Karten voller Nullen — das liest sich wie ein
  // Datenfehler, nicht wie ein leerer Plan. Lieber einmal sagen, woher die Zahlen kommen.
  if (regeln.length === 0 && budgets.length === 0) {
    return <Card subtitle={t("ausblick.leerUntertitel")}>{t("ausblick.leer")}</Card>;
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
          gap: "var(--gap-card)",
          alignItems: "start",
        }}
      >
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

  return (
    <Card
      title={`${monatName} ${ausblick.jahr}`}
      subtitle={ausblick.laufend ? t("ausblick.untertitelLaufend") : t("ausblick.untertitelVorschau")}
      action={
        ausblick.laufend ? <Pill variant="ist">{t("ausblick.pillLaufend")}</Pill> : <Pill variant="plan">{t("ausblick.pillVorschau")}</Pill>
      }
    >
      {/* Spaltenköpfe nur dort, wo es zwei Spalten gibt — sonst ist die Zahl selbsterklärend. */}
      {zweiSpalten && (
        <div style={{ ...zeileGrid(true), ...kopfStil }}>
          <span />
          <span style={{ textAlign: "right" }}>{t("ausblick.spaltePlan")}</span>
          <span style={{ textAlign: "right" }}>{t("ausblick.spalteIst")}</span>
        </div>
      )}

      {ausblick.zeilen.map((z) => (
        <ZeileMitPosten
          key={z.id}
          zeile={z}
          zweiSpalten={zweiSpalten}
          offen={offen === z.id}
          onToggle={() => setOffen((cur) => (cur === z.id ? null : z.id))}
          kategorieName={kategorieName}
        />
      ))}

      {/* Der Strich unter der Rechnung. */}
      <div
        style={{
          ...zeileGrid(zweiSpalten),
          borderTop: "2px solid var(--line)",
          marginTop: "var(--sp-2)",
          paddingTop: "var(--sp-3)",
          fontWeight: "var(--fw-black)",
          fontSize: "var(--fs-body)",
        }}
      >
        <span>{t("ausblick.bleibt")}</span>
        <span className="num" style={{ textAlign: "right", color: farbe(ausblick.restPlan) }}>
          {geld.formatMitSymbol(ausblick.restPlan, { mitVorzeichen: true })}
        </span>
        {zweiSpalten && (
          <span className="num" style={{ textAlign: "right", color: farbe(ausblick.restIst ?? 0) }}>
            {geld.formatMitSymbol(ausblick.restIst ?? 0, { mitVorzeichen: true })}
          </span>
        )}
      </div>
    </Card>
  );
}

function ZeileMitPosten({
  zeile,
  zweiSpalten,
  offen,
  onToggle,
  kategorieName,
}: {
  zeile: AusblickZeile;
  zweiSpalten: boolean;
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
          borderBottom: "1px solid var(--line-soft)",
          cursor: aufklappbar ? "pointer" : "default",
          fontSize: "13.5px",
        }}
      >
        <span style={{ fontWeight: "var(--fw-semi)", color: "var(--ink-2)" }}>
          {aufklappbar && <span style={{ color: "var(--ink-3)", marginRight: 6 }}>{offen ? "▾" : "▸"}</span>}
          {t(`ausblick.zeile.${zeile.id}`)}
        </span>
        <span className="num" style={{ textAlign: "right", fontWeight: "var(--fw-bold)" }}>
          {geld.format(zeile.plan, { mitVorzeichen: true })}
        </span>
        {zweiSpalten && (
          <span className="num" style={{ textAlign: "right", fontWeight: "var(--fw-bold)" }}>
            {geld.format(zeile.ist ?? 0, { mitVorzeichen: true })}
          </span>
        )}
      </div>

      {offen && (
        <div style={{ padding: "6px 0 10px 14px", borderLeft: "2px solid var(--line-soft)", marginLeft: 4 }}>
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
      <span style={{ minWidth: 0, color: "var(--ink-2)" }}>
        {posten.datum && <span style={{ color: "var(--ink-3)", fontWeight: "var(--fw-bold)", marginRight: 6 }}>{tagVon(posten.datum)}</span>}
        <span style={{ opacity: erledigt ? 0.72 : 1 }}>{name}</span>
        {posten.status === "bezahlt" && <Pill variant="ok" style={{ marginLeft: 6 }}>{t("ausblick.statusBezahlt")}</Pill>}
      </span>
      <span className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>
        {posten.plan === 0 ? "—" : geld.format(posten.plan, { mitVorzeichen: true })}
      </span>
      {zweiSpalten && (
        <span className="num" style={{ textAlign: "right", color: erledigt ? "var(--ink)" : "var(--ink-3)" }}>
          {posten.ist == null ? t("ausblick.statusOffen") : geld.format(posten.ist, { mitVorzeichen: true })}
        </span>
      )}
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

/** Drei Spalten im laufenden Monat (Label · Plan · Ist), sonst zwei. */
const zeileGrid = (zweiSpalten: boolean) => ({
  display: "grid",
  gridTemplateColumns: zweiSpalten ? "1fr auto auto" : "1fr auto",
  columnGap: "var(--sp-3)",
  alignItems: "center",
} as const);

const kopfStil = {
  fontSize: "var(--fs-2xs)",
  fontWeight: "var(--fw-bold)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "var(--ink-3)",
  paddingBottom: "var(--sp-2)",
} as const;

const farbe = (wert: number) => (wert < 0 ? "var(--warn-deep)" : "var(--ink)");
const tagVon = (iso: string) => `${iso.slice(8)}.`;
