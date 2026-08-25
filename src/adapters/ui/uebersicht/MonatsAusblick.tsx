// Monatsausblick — drei Karten nebeneinander: der laufende Monat und die beiden
// folgenden, jeweils als Aufrechnung (Einnahmen − Verträge − Budgets = bleibt).
//
// Bewusst Zahlen statt Diagramm: die Frage „was bleibt diesen Monat, und was in den
// nächsten beiden?" beantwortet eine Spalte Zahlen direkter als jede Kurve. Der
// laufende Monat trägt zwei Spalten (geplant / gebucht), die kommenden nur den Plan.
//
// Jede Zeile lässt sich aufklappen und zeigt dann ihre Posten: welche Rate schon
// abgebucht ist, wie weit ein Budget durch ist. Gerechnet wird hier NICHTS — die
// Aufrechnung kommt fertig aus `uebersichtLaden` (Anwendungsschicht), die Komponente
// bekommt sie als `ausblicke` gereicht. Bis 2026-08-19 rief sie `monatsAusblicke` selbst
// auf und musste dafür Regeln, Budgets, Inventar und Buchungen kennen.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AusblickPosten,
  AusblickZeile,
  MonatsAusblick as Ausblick,
} from "../../../application";
import { Card, CoverageTrack, Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

const MONATSNAMEN_KEY = "ausblick.monat";

export function MonatsAusblick({
  ausblicke,
  hatPlandaten,
  kategorieNamen,
  empfaenger,
  onBuchung,
}: {
  /** Fertig aufgerechnet aus `uebersichtLaden` — hier wird nichts mehr gerechnet. */
  ausblicke: readonly Ausblick[];
  /** Gibt es überhaupt Verträge, Budgets oder Inventar? */
  hatPlandaten: boolean;
  /** Kategorie-ID → Name. Der Kern gibt IDs heraus, die Oberfläche zeigt Namen. */
  kategorieNamen: ReadonlyMap<string, string>;
  /**
   * Buchungs-ID → Empfänger aus dem Import. Der Kern kennt ihn nicht (er steht am
   * Umsatz, nicht an der IstBuchung), aufgeklappt ist er aber das Einzige, woran man
   * eine ungeplante Zeile wiedererkennt.
   */
  empfaenger: ReadonlyMap<string, string>;
  /**
   * Klick auf einen Posten, hinter dem genau EINE Buchung steht — er öffnet sie.
   *
   * Die ID reicht: welche Buchung dahintersteckt, weiss der Bildschirm darüber, der die
   * Sicht ohnehin schon geladen hat. Hier eine ganze `IstBuchung` durchzureichen hiesse,
   * den Ausblick um Daten zu erweitern, die er zum Rechnen nicht braucht.
   */
  onBuchung?: (istId: string) => void;
}) {
  const { t } = useTranslation();
  const ohneEinnahmeplan = ausblicke.every((a) => a.zeilen.find((z) => z.id === "einnahmen")!.plan === 0);

  // Ohne Verträge und Budgets gäbe es drei Karten voller Nullen — das liest sich wie ein
  // Datenfehler, nicht wie ein leerer Plan. Lieber einmal sagen, woher die Zahlen kommen.
  if (!hatPlandaten) {
    return <Card subtitle={t("ausblick.leerUntertitel")}>{t("ausblick.leer")}</Card>;
  }

  return (
    <div>
      <div className="ausblick-karten">
        {ausblicke.map((a) => (
          <AusblickKarte
            key={a.label}
            ausblick={a}
            kategorieName={kategorieNamen}
            empfaenger={empfaenger}
            onBuchung={onBuchung}
          />
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
  empfaenger,
  onBuchung,
}: {
  ausblick: Ausblick;
  kategorieName: ReadonlyMap<string, string>;
  empfaenger: ReadonlyMap<string, string>;
  onBuchung?: (istId: string) => void;
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
          empfaenger={empfaenger}
          onBuchung={onBuchung}
        />
      ))}

      {/* Unter dem Strich steht die Zahl in JEDER Spalte, in der sie eine Bedeutung hat:
          links, was bisher tatsächlich übrig ist, rechts, was übrig bliebe, wenn der
          Monat wie geplant durchläuft. Vorher stand dort eine Zahl und darunter der
          Abstand zum Plan („+112,30 gegenüber Plan") — man musste im Kopf addieren, um
          auf die Planzahl zu kommen, und es war nicht zu sehen, WELCHE der beiden die
          fette Zahl war.
          Der Strich darüber ist die Trennlinie der letzten Zeile; ein eigener kam als
          zweite Linie direkt darüber zu liegen. */}
      <div
        style={{
          ...zeileGrid(zweiSpalten),
          marginTop: "var(--sp-3)",
          fontWeight: "var(--fw-black)",
          fontSize: "var(--fs-body)",
          alignItems: "start",
        }}
      >
        <span>
          {t("ausblick.bleibt")}
          <span
            style={{
              display: "block",
              fontSize: "var(--fs-2xs)",
              fontWeight: "var(--fw-semi)",
              color: "var(--ink-3)",
              marginTop: 2,
              whiteSpace: "normal",
            }}
          >
            {t("ausblick.bleibtErklaerung")}
          </span>
        </span>
        {zweiSpalten && (
          <span className="num" style={{ textAlign: "right", color: geldFarbe(ausblick.restIst ?? 0) }}>
            {geld.formatMitSymbol(ausblick.restIst ?? 0, { mitVorzeichen: true })}
          </span>
        )}
        <span className="num" style={{ textAlign: "right", color: geldFarbe(ausblick.restPlan) }}>
          {geld.formatMitSymbol(ausblick.restPlan, { mitVorzeichen: true })}
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
  empfaenger,
  onBuchung,
}: {
  zeile: AusblickZeile;
  zweiSpalten: boolean;
  /** Die unterste Zeile trägt den Strich, gegen den „Bleibt" gerechnet wird. */
  letzte: boolean;
  offen: boolean;
  onToggle: () => void;
  kategorieName: ReadonlyMap<string, string>;
  empfaenger: ReadonlyMap<string, string>;
  onBuchung?: (istId: string) => void;
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
            // „Sonstiges" ist im laufenden Monat die längste Liste — auf echten Daten
            // dreissig bis vierzig Zeilen. Ohne Deckel schiebt eine aufgeklappte Zeile
            // die beiden Nachbarkarten aus dem Bild.
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {zeile.id === "budgets"
            ? zeile.posten.map((p) => (
                <BudgetPosten key={p.schluessel} posten={p} name={kategorieName.get(p.bezeichnung) ?? p.bezeichnung} zeigeIst={zweiSpalten} />
              ))
            : zeile.posten.map((p) => (
                <PlanPosten
                  key={p.schluessel}
                  posten={p}
                  zeile={zeile.id}
                  zweiSpalten={zweiSpalten}
                  kategorieName={kategorieName}
                  empfaenger={empfaenger}
                  onBuchung={onBuchung}
                />
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
  kategorieName,
  empfaenger,
  onBuchung,
}: {
  posten: AusblickPosten;
  zeile: AusblickZeile["id"];
  zweiSpalten: boolean;
  kategorieName: ReadonlyMap<string, string>;
  empfaenger: ReadonlyMap<string, string>;
  onBuchung?: (istId: string) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const erledigt = posten.status === "bezahlt" || posten.status === "gebucht";
  /**
   * Ein ungeplanter Posten ist genau EINE Buchung — die trägt aber selbst keinen Namen.
   * Dieselbe Reihenfolge wie im Konto-Register: eigene Notiz vor Empfänger aus dem
   * Import, dann die Kategorie, und erst zuletzt das Sammelwort.
   */
  const name =
    posten.status !== "ohnePlan"
      ? posten.bezeichnung
      : posten.bezeichnung ||
        (posten.istId ? empfaenger.get(posten.istId) : undefined) ||
        (posten.kategorieId ? kategorieName.get(posten.kategorieId) : undefined) ||
        t(`ausblick.sammel.${zeile}`);
  /** Die Kategorie als Zusatz — nur, wenn sie nicht schon der Name ist. */
  const kategorie = posten.kategorieId ? kategorieName.get(posten.kategorieId) : undefined;

  /**
   * Klickbar nur, wenn hinter dem Posten genau EINE Buchung steht.
   *
   * Ein geplanter Posten ohne `istId` ist noch nichts Gebuchtes — er beschreibt, was
   * fällig wird. Ihn zu öffnen hiesse, einen Dialog auf eine Buchung zu zeigen, die es
   * nicht gibt; ein Knopf, der nichts tun kann, ist eine Frage ohne Antwort.
   */
  const istId = posten.istId;
  const oeffnen = istId && onBuchung ? () => onBuchung(istId) : undefined;
  const inhalt = (
    <>
      {/* Anbieternamen aus dem Import sind lang („SWB - Service - Wohnungsvermietungs-
          und -baugesellschaft mbH"). Eine Zeile, abgeschnitten; der volle Name steht im
          title — umbrechend zerlegte er die Karte. */}
      <span style={{ color: "var(--ink-2)", display: "flex", alignItems: "baseline", gap: 6, ...gekappt }} title={name}>
        {posten.datum && <span style={{ color: "var(--ink-3)", fontWeight: "var(--fw-bold)", flex: "0 0 auto" }}>{tagVon(posten.datum)}</span>}
        <span style={{ opacity: erledigt ? 0.72 : 1, ...gekappt }}>{name}</span>
        {kategorie && kategorie !== name && (
          <span style={{ color: "var(--ink-3)", fontSize: "11.5px", flex: "0 0 auto" }}>{kategorie}</span>
        )}
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
    </>
  );

  // Dieselbe Zeile, einmal als Text und einmal als Knopf. Am Aussehen ändert sich nichts:
  // was hier klickbar ist, entscheidet der Inhalt der Zeile, nicht ihre Gestalt.
  const zeilenstil = { ...zeileGrid(zweiSpalten), padding: "5px 0", fontSize: "12.5px", alignItems: "baseline" } as const;
  return oeffnen ? (
    <button type="button" className="buchungszeile" title={t("uebersicht.buchungOeffnen")} style={zeilenstil} onClick={oeffnen}>
      {inhalt}
    </button>
  ) : (
    <div style={zeilenstil}>{inhalt}</div>
  );
}

/** Ein Budget: wie weit ist der Rahmen durch? Balken statt zweier Zahlen. */
function BudgetPosten({ posten, name, zeigeIst }: { posten: AusblickPosten; name: string; zeigeIst: boolean }) {
  const geld = useGeld();
  const rahmen = Math.abs(posten.plan);
  /**
   * `posten.ist` ist vorzeichenbehaftet wie eine Buchung: ein Verbrauch ist NEGATIV. Hier
   * wird daraus die Verbrauchshöhe, also positiv — deshalb das Minus und nicht `Math.abs`.
   *
   * Der Unterschied zeigt sich genau im Rückfluss-Monat: kam unterm Strich mehr zurück,
   * als ausgegeben wurde (Erstattung, Retoure), ist `ist` positiv, und `Math.abs`
   * behauptete dann, es sei genau so viel VERBRAUCHT worden. Jetzt steht dort ein
   * Minusbetrag, und der Balken bleibt leer statt zu wachsen.
   */
  const verbraucht = -(posten.ist ?? 0);
  return (
    <div style={{ padding: "6px 0" }}>
      <CoverageTrack
        value={zeigeIst ? Math.max(0, verbraucht) : 0}
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
