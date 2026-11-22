// Die Monatskarten — der laufende Monat und die beiden folgenden als Ergebnisrechnung:
// was der Monat KOSTET, nicht was in ihm vom Konto ging.
//
// Drei Stufen, jede mit ihrer Zwischensumme, weil jede eine eigene Frage beantwortet:
// was nach den Pflichten bleibt, was der Alltag übrig lässt, was wirklich frei ist.
// Darunter, aufklappbar, der Weg zurück zum Konto (die Überleitung) — sie ist der Beleg,
// dass die Rechnung darüber gegen die Bank aufgeht.
//
// Bewusst Zahlen statt Diagramm, und der laufende Monat trägt zwei Spalten (bisher /
// geplant), die kommenden nur den Plan. Gerechnet wird hier NICHTS: die Karten bekommen
// fertige `MonatsErgebnis`-Werte aus `uebersichtLaden`.
//
// Bis 2026-11-15 stand hier `MonatsAusblick`, eine Aufrechnung nach Auszahlung, in der
// Rücklagen mit der Rate und aufbauende Budgets mit der Ausgabe zählten.

import { Fragment, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ErgebnisPosten, ErgebnisZeile, ErgebnisZeileId, MonatsErgebnis, Stufe } from "../../../application";
import { Card, CoverageTrack, Pill } from "../bausteine";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { Aufklappflaeche } from "../bausteine/Aufklapptabelle";
import { AUFKLAPP_ZEILEN_BREIT } from "../bausteine/aufklappen";
import { Klappblock } from "../bausteine/Klappblock";
import { Collapsible } from "@base-ui/react/collapsible";
import { Button as BaseButton } from "@base-ui/react/button";

/**
 * Welche Zeilen zu welcher Stufe gehören. Die Reihenfolge der Zeilen kommt aus dem Kern;
 * hier steht nur, NACH welcher Zeile eine Zwischensumme fällig ist.
 */
const STUFEN: readonly { id: "nachPflichten" | "nachAlltag" | "ergebnis"; zeilen: readonly ErgebnisZeileId[] }[] = [
  { id: "nachPflichten", zeilen: ["einnahmen", "fixkosten"] },
  { id: "nachAlltag", zeilen: ["laufend", "ungeplant"] },
  // Die Tilgung steht hier und nicht bei den Verträgen: sie ist der Teil der Kreditrate,
  // der Vermögen aufbaut (die Schuld sinkt), wie eine Rücklagenrate. Der Kern spaltet sie
  // ab; hier steht nur, in welche Stufe sie gehört.
  { id: "ergebnis", zeilen: ["abschreibungen", "vorsorge", "tilgung"] },
];

interface Namen {
  /** Kategorie-ID → Name. Der Kern gibt IDs heraus, die Oberfläche zeigt Namen. */
  readonly kategorie: ReadonlyMap<string, string>;
  /** Buchungs-ID → Empfänger aus dem Import; er steht am Umsatz, nicht an der Buchung. */
  readonly empfaenger: ReadonlyMap<string, string>;
}

export function ErgebnisKarten({
  ergebnisse,
  hatPlandaten,
  kategorieNamen,
  empfaenger,
  onBuchung,
  unterDemLaufenden,
}: {
  ergebnisse: readonly MonatsErgebnis[];
  /** Gibt es überhaupt Verträge, Budgets oder Rücklagen? */
  hatPlandaten: boolean;
  kategorieNamen: ReadonlyMap<string, string>;
  empfaenger: ReadonlyMap<string, string>;
  /** Klick auf einen Posten, hinter dem genau EINE Buchung steht — er öffnet sie. */
  onBuchung?: (istId: string) => void;
  /**
   * Was direkt unter dem laufenden Monat steht, vor den kommenden. Schmal ist das die
   * Einrichtungskarte (siehe `UebersichtScreen`): dort stehen die Karten untereinander,
   * und der laufende Monat soll oben stehen, ohne dass sie hinter zwei Vorschaumonate
   * rutscht. Breit bleibt es leer — nebeneinander gäbe es kein „darunter".
   */
  unterDemLaufenden?: ReactNode;
}) {
  const { t } = useTranslation();
  const ohneEinnahmeplan = ergebnisse.every((e) => (e.zeilen.find((z) => z.id === "einnahmen")?.plan ?? 0) === 0);

  // Ohne Plan gäbe es drei Karten voller Nullen — das liest sich wie ein Datenfehler,
  // nicht wie ein leerer Plan. Lieber einmal sagen, woher die Zahlen kommen.
  if (!hatPlandaten) {
    return <Card subtitle={t("ergebnis.leerUntertitel")}>{t("ergebnis.leer")}</Card>;
  }

  const namen: Namen = { kategorie: kategorieNamen, empfaenger };
  return (
    <div>
      <div className="ausblick-karten">
        {ergebnisse.map((e, i) => (
          <Fragment key={e.label}>
            <ErgebnisKarte ergebnis={e} namen={namen} onBuchung={onBuchung} />
            {i === 0 && unterDemLaufenden}
          </Fragment>
        ))}
      </div>
      {ohneEinnahmeplan && (
        // Kein Schätzwert an dieser Stelle: die Einnahmen kommen aus Verträgen. Fehlen
        // sie, sagt die Karte das, statt eine Zahl zu erfinden.
        <div className="hinweis" style={{ marginTop: "var(--sp-3)" }}>
          {t("ergebnis.hinweisKeineEinnahmen")}
        </div>
      )}
    </div>
  );
}

function ErgebnisKarte({
  ergebnis,
  namen,
  onBuchung,
}: {
  ergebnis: MonatsErgebnis;
  namen: Namen;
  onBuchung?: (istId: string) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [offen, setOffen] = useState<string | null>(null);
  const [wegOffen, setWegOffen] = useState(false);
  const zweiSpalten = !ergebnis.zukunft;

  // Eine Zwischensumme steht nur da, wenn danach noch etwas abgezogen wird. Hat ein
  // Haushalt weder Rücklagen noch Vorsorge, wäre „was der Alltag übrig lässt" dieselbe
  // Zahl wie das Ergebnis direkt darunter — die letzte Gruppe mit Zeilen schliesst
  // deshalb immer mit dem Ergebnis.
  const gruppen = STUFEN.map((s) => ({
    ...s,
    zeilen: ergebnis.zeilen.filter((z) => s.zeilen.includes(z.id)),
  })).filter((g) => g.zeilen.length > 0);

  return (
    <Card
      title={`${t(`ergebnis.monat.${ergebnis.monat}`)} ${ergebnis.jahr}`}
      subtitle={ergebnis.laufend ? t("ergebnis.untertitelLaufend") : t("ergebnis.untertitelVorschau")}
      action={
        ergebnis.laufend ? <Pill variant="ist">{t("ergebnis.pillLaufend")}</Pill> : <Pill variant="plan">{t("ergebnis.pillVorschau")}</Pill>
      }
    >
      {/* Spaltenköpfe nur dort, wo es zwei Spalten gibt. Das Tatsächliche steht links. */}
      {zweiSpalten && (
        <div style={{ ...zeileGrid(true), ...kopfStil }}>
          <span />
          <span style={{ textAlign: "right" }}>{t("ergebnis.spalteIst")}</span>
          <span style={{ textAlign: "right" }}>{t("ergebnis.spaltePlan")}</span>
        </div>
      )}

      {gruppen.map((g, i) => {
        const letzte = i === gruppen.length - 1;
        return (
          <div key={g.id}>
            {g.zeilen.map((z) => (
              <ZeileMitPosten
                key={z.id}
                zeile={z}
                zweiSpalten={zweiSpalten}
                offen={offen === z.id}
                onToggle={() => setOffen((cur) => (cur === z.id ? null : z.id))}
                namen={namen}
                onBuchung={onBuchung}
              />
            ))}
            {letzte ? (
              <Summe stufe={ergebnis.ergebnis} zweiSpalten={zweiSpalten} titel={t("ergebnis.stufe.ergebnis")} erklaerung={t("ergebnis.ergebnisErklaerung")} schluss />
            ) : (
              <Summe stufe={ergebnis[g.id]} zweiSpalten={zweiSpalten} titel={t(`ergebnis.stufe.${g.id}`)} />
            )}
          </div>
        );
      })}

      {/* Die Hochrechnung steht als EINE Zeile unter dem Ergebnis und nicht als dritte
          Spalte: „bisher" und „geplant" sind je Zeile verschieden, die Erwartung ist je
          Zeile fast immer eine der beiden. Neu ist nur die Summe. */}
      {ergebnis.erwartet !== undefined && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", alignItems: "start", marginTop: "var(--sp-3)", fontSize: "var(--fs-sm)" }}>
          <span>
            {t("ergebnis.erwartet")}
            <span className="hinweis" style={{ display: "block", marginTop: 2 }}>{t("ergebnis.erwartetHinweis")}</span>
          </span>
          <span className="num" style={{ fontWeight: "var(--fw-bold)", color: geldFarbe(ergebnis.erwartet), whiteSpace: "nowrap" }}>
            {geld.formatMitSymbol(ergebnis.erwartet, { mitVorzeichen: true })}
          </span>
        </div>
      )}

      {ergebnis.ueberleitung && ergebnis.ueberleitung.posten.length > 0 && (
        <Klappblock titel={t("ergebnis.ueberleitung.titel")} offen={wegOffen} onUmschalten={() => setWegOffen((o) => !o)}>
          <Weg ueberleitung={ergebnis.ueberleitung} />
        </Klappblock>
      )}
    </Card>
  );
}

/** Eine Zwischensumme bzw. das Ergebnis unter dem Strich. */
function Summe({
  stufe,
  zweiSpalten,
  titel,
  erklaerung,
  schluss = false,
}: {
  stufe: Stufe;
  zweiSpalten: boolean;
  titel: string;
  erklaerung?: string;
  schluss?: boolean;
}) {
  const geld = useGeld();
  return (
    <div
      style={{
        ...zeileGrid(zweiSpalten),
        padding: schluss ? "var(--sp-3) 0 0" : "7px 0 var(--sp-3)",
        borderTop: "1px solid var(--line)",
        fontWeight: schluss ? "var(--fw-black)" : "var(--fw-bold)",
        fontSize: schluss ? "var(--fs-body)" : "var(--fs-sm)",
        alignItems: "start",
      }}
    >
      <span>
        {titel}
        {erklaerung && (
          <span className="hinweis" style={{ display: "block", marginTop: 2, whiteSpace: "normal" }}>
            {erklaerung}
          </span>
        )}
      </span>
      {zweiSpalten && (
        <span className="num" style={{ textAlign: "right", color: geldFarbe(stufe.ist ?? 0) }}>
          {geld.formatMitSymbol(stufe.ist ?? 0, { mitVorzeichen: true })}
        </span>
      )}
      <span className="num" style={{ textAlign: "right", color: geldFarbe(stufe.plan) }}>
        {geld.formatMitSymbol(stufe.plan, { mitVorzeichen: true })}
      </span>
    </div>
  );
}

/** Die Überleitung: vom Ergebnis zurück zur Änderung der Kontostände. */
function Weg({ ueberleitung }: { ueberleitung: NonNullable<MonatsErgebnis["ueberleitung"]> }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const zeile = (name: string, betrag: number, fett = false) => (
    <div key={name} style={{ ...zeileGrid(false), padding: "4px 0", fontSize: "var(--fs-ui)", fontWeight: fett ? "var(--fw-bold)" : undefined }}>
      <span style={{ whiteSpace: "normal" }}>{name}</span>
      <span className="num" style={{ textAlign: "right", color: geldFarbe(betrag) }}>
        {geld.format(betrag, { mitVorzeichen: true })}
      </span>
    </div>
  );
  return (
    <div>
      {zeile(t("ergebnis.ueberleitung.ergebnis"), ueberleitung.ergebnis)}
      {ueberleitung.posten.map((p) => zeile(t(`ergebnis.ueberleitung.${p.id}`), p.betrag))}
      <div style={{ borderTop: "1px solid var(--line)", marginTop: 4 }}>
        {zeile(t("ergebnis.ueberleitung.summe"), ueberleitung.kontoaenderung, true)}
      </div>
    </div>
  );
}

function ZeileMitPosten({
  zeile,
  zweiSpalten,
  offen,
  onToggle,
  namen,
  onBuchung,
}: {
  zeile: ErgebnisZeile;
  zweiSpalten: boolean;
  offen: boolean;
  onToggle: () => void;
  namen: Namen;
  onBuchung?: (istId: string) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const aufklappbar = zeile.posten.length > 0;

  // Base UI `Collapsible`. Eine Zeile ohne Posten hat nichts aufzuklappen und ist kein
  // Schalter — sie bekommt `disabled`, und damit weder Fokus noch Rolle als Knopf.
  return (
    <Collapsible.Root open={offen && aufklappbar} onOpenChange={onToggle} disabled={!aufklappbar}>
      <Collapsible.Trigger
        nativeButton={false}
        render={<div />}
        className="aufklappzeile"
        style={{
          ...zeileGrid(zweiSpalten),
          padding: "9px 0",
          borderBottom: "1px solid var(--line-soft)",
          cursor: aufklappbar ? "pointer" : "default",
          fontSize: "var(--fs-sm)",
          background: offen ? "var(--accent-soft)" : "transparent",
        }}
      >
        <span style={{ fontWeight: "var(--fw-semi)", color: "var(--ink-2)", ...gekappt }}>
          {aufklappbar && <span style={{ color: "var(--ink-3)", marginRight: 6 }}>{offen ? "▾" : "▸"}</span>}
          {t(`ergebnis.zeile.${zeile.id}`)}
        </span>
        {zweiSpalten && (
          <span className="num" style={{ textAlign: "right", fontWeight: "var(--fw-bold)", color: geldFarbe(zeile.ist ?? 0) }}>
            {geld.format(zeile.ist ?? 0, { mitVorzeichen: true })}
          </span>
        )}
        <span className="num" style={{ textAlign: "right", fontWeight: "var(--fw-bold)", color: geldFarbe(zeile.plan) }}>
          {geld.format(zeile.plan, { mitVorzeichen: true })}
        </span>
      </Collapsible.Trigger>

      <Collapsible.Panel>
        {/* Dieselbe Fläche wie überall, wo etwas aufklappt — ohne eigenes Tabellenraster,
            damit die Posten mit den Spalten der Zeile darüber fluchten. Der negative Rand
            hebt dafür das Innenpolster auf. */}
        <Aufklappflaeche zeilen={AUFKLAPP_ZEILEN_BREIT} rand="-8px">
          {zeile.posten.map((p) =>
            zeile.id === "laufend" ? (
              <BudgetPosten key={p.schluessel} posten={p} name={postenname(p, zeile.id, namen, t)} zeigeIst={zweiSpalten} />
            ) : (
              <PlanPosten key={p.schluessel} posten={p} zeile={zeile.id} zweiSpalten={zweiSpalten} namen={namen} onBuchung={onBuchung} />
            ),
          )}
        </Aufklappflaeche>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

/**
 * Wie ein Posten heisst. Eine Regel oder Rücklage trägt ihren Namen selbst; ein Budget
 * heisst wie seine Kategorie; eine einzelne Buchung ohne Plan trägt keinen Namen, und
 * dann gilt dieselbe Reihenfolge wie im Kontoauszug: Notiz, Empfänger, Kategorie, und
 * erst zuletzt das Sammelwort.
 */
function postenname(p: ErgebnisPosten, zeile: ErgebnisZeileId, namen: Namen, t: (k: string) => string): string {
  const kategorie = p.kategorieId ? namen.kategorie.get(p.kategorieId) : undefined;
  return (
    p.bezeichnung ||
    (p.istId ? namen.empfaenger.get(p.istId) : undefined) ||
    kategorie ||
    t(`ergebnis.sammel.${zeile}`)
  );
}

/** Ein Posten mit Namen und Betrag — Vertrag, Rücklage, Topf oder einzelne Buchung. */
function PlanPosten({
  posten,
  zeile,
  zweiSpalten,
  namen,
  onBuchung,
}: {
  posten: ErgebnisPosten;
  zeile: ErgebnisZeileId;
  zweiSpalten: boolean;
  namen: Namen;
  onBuchung?: (istId: string) => void;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const erledigt = posten.status === "gebucht";
  const name = postenname(posten, zeile, namen, t);
  const kategorie = posten.kategorieId ? namen.kategorie.get(posten.kategorieId) : undefined;
  // Was die Zahl daneben einschränkt, steht offen da: dass sie nur ein Teil der Zahlung
  // ist, dass aus dem Topf mehr bezahlt wurde, als er den Monat kostet — und beim
  // Vorsorgeziel, was wirklich überwiesen wurde. Dort auch, wenn es nichts war: die Rate
  // steht als Kosten da, ob gespart wurde oder nicht, und genau das will man hier sehen.
  const zusatz = [
    posten.teile ? t("ergebnis.anteil", { teile: posten.teile }) : undefined,
    // Ohne das Wort läse sich der Vertrag kleiner, als er abgebucht wird — die Tilgung
    // steht weiter unten in ihrer eigenen Zeile.
    posten.nurZinsen ? t("ergebnis.nurZinsen") : undefined,
    posten.entnahme ? t("ergebnis.entnommen", { betrag: geld.formatMitSymbol(-posten.entnahme) }) : undefined,
    posten.zufuehrung !== undefined
      ? t("ergebnis.ueberwiesen", { betrag: geld.formatMitSymbol(-posten.zufuehrung || 0) })
      : undefined,
    kategorie && kategorie !== name ? kategorie : undefined,
  ].filter(Boolean);

  // Klickbar nur, wenn hinter dem Posten genau EINE Buchung steht. Ein geplanter Posten
  // beschreibt, was fällig wird — ihn zu öffnen hiesse, einen Dialog auf etwas zu
  // zeigen, das es nicht gibt.
  const istId = posten.istId;
  const oeffnen = istId && onBuchung ? () => onBuchung(istId) : undefined;
  const inhalt = (
    <>
      <span style={{ color: "var(--ink-2)", display: "flex", alignItems: "baseline", gap: 6, ...gekappt }} title={name}>
        <span style={{ opacity: erledigt ? 0.72 : 1, ...gekappt }}>{name}</span>
        {zusatz.length > 0 && (
          <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-2xs)", ...gekappt }}>{zusatz.join(" · ")}</span>
        )}
      </span>
      {zweiSpalten && (
        <span className="num" style={{ textAlign: "right", color: erledigt || posten.status === "ohnePlan" ? "var(--ink)" : "var(--ink-3)" }}>
          {posten.status === "offen" ? t("ergebnis.statusOffen") : geld.format(posten.ist ?? 0, { mitVorzeichen: true })}
        </span>
      )}
      <span className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>
        {posten.plan === 0 ? "—" : geld.format(posten.plan, { mitVorzeichen: true })}
      </span>
    </>
  );

  const zeilenstil = { ...zeileGrid(zweiSpalten), padding: "5px 0", fontSize: "var(--fs-ui)", alignItems: "baseline" } as const;
  return oeffnen ? (
    <BaseButton type="button" className="buchungszeile" title={t("uebersicht.buchungOeffnen")} style={zeilenstil} onClick={oeffnen}>
      {inhalt}
    </BaseButton>
  ) : (
    <div style={zeilenstil}>{inhalt}</div>
  );
}

/** Ein monatliches Budget: wie weit ist der Rahmen durch? Balken statt zweier Zahlen. */
function BudgetPosten({ posten, name, zeigeIst }: { posten: ErgebnisPosten; name: string; zeigeIst: boolean }) {
  const geld = useGeld();
  const rahmen = -posten.plan;
  // `posten.ist` ist vorzeichenbehaftet wie eine Buchung: ein Verbrauch ist NEGATIV. Das
  // Minus und nicht `Math.abs` — kam unterm Strich mehr zurück, als ausgegeben wurde,
  // steht dort ein Minusbetrag, und der Balken bleibt leer statt zu wachsen.
  const verbraucht = -(posten.ist ?? 0);
  return (
    <div style={{ padding: "6px 0" }}>
      <CoverageTrack
        value={zeigeIst ? Math.max(0, verbraucht) : 0}
        max={Math.max(1, rahmen)}
        label={<span style={{ fontSize: "var(--fs-ui)" }}>{name}</span>}
        right={
          <span className="num" style={{ fontSize: "var(--fs-ui)" }}>
            {zeigeIst ? `${geld.format(verbraucht)} / ${geld.formatMitSymbol(rahmen)}` : geld.formatMitSymbol(rahmen)}
          </span>
        }
      />
    </div>
  );
}

/**
 * Drei Spalten im laufenden Monat (Name · bisher · geplant), sonst zwei. Die
 * Zahlenspalten haben eine FESTE Breite: mit `auto` bemaß sich jede Karte an ihrem
 * eigenen längsten Betrag, und die drei Karten standen sichtbar gegeneinander versetzt.
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
