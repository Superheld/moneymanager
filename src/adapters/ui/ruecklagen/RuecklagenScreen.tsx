// Rücklagen — was du für etwas zurücklegst, das noch kommt.
//
// Hiess bis 2026-08-31 „Inventar" und meinte einen Gegenstand. Die Rechnung ist
// geblieben, die Behauptung ist weg, dass am anderen Ende ein Ding steht.
//
// REIN KALKULATORISCH (2026-08-16): Was TATSÄCHLICH da ist, kommt nicht aus Buchungen,
// sondern aus dem realen Stand des Kontos, das die Rücklage benennt: liegen dort 60 %
// der rechnerischen Summe, ist jede Rücklage darauf zu 60 % gedeckt (anteilig, ohne
// Rangfolge). Auch „Ausgebucht" bucht nichts — der Kauf ist eine normale Ausgabe und
// senkt den Kontostand ohnehin.
//
// EINE LISTE, EIN DIALOG (seit Paket 4, ADR-0006). Bis dahin standen hier zwei Karten:
// die Rücklagen von Hand und, als „Rücklage über die Kategorie", die aufbauenden Budgets
// mit Tabelle, Dialog und Verlauf der Budgets. Seit Migration 81 sind beide dieselbe
// Sache; was sie unterscheidet, ist die Sorte — „läuft weiter" oder „wird abgeschlossen"
// —, und die steht als Pille an der Zeile. Den Verlauf hat jetzt jede (`RuecklageVerlauf`).

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  hatZiel,
  type GeldJeKonto,
  type IstBuchung,
  type Ruecklage,
  type RuecklagenDeckung,
  type Ruecklagenfluss,
  type Ruecklagensicht,
  type Ruecklagenvorschlag,
  buchungswahlFuer,
} from "../../../application";
import {
  geldJeKonto,
  ruecklageLoeschen,
  ruecklagen as ruecklagenLaden,
  ruecklagenvorschlaege,
  ruecklagenvorschlagVerwerfen,
} from "../../dienste";
import { BuchungDetail } from "../bausteine/BuchungDetail";
import { Button, Card, CoverageTrack, KPIStat, Pill } from "../bausteine";
import { FaustformelTacho } from "./FaustformelTacho";
import { RuecklageDialog, type RuecklageVorbelegung } from "./RuecklageDialog";
import { VorschlaegeKarte } from "./VorschlaegeKarte";
import { RuecklageVerlauf } from "./RuecklageVerlauf";
import { AusbuchungDialog } from "./AusbuchungDialog";
import { AbschlussDialog } from "./AbschlussDialog";
import { WartetKarte } from "./WartetKarte";
import { AusbuchungenKarte } from "./AusbuchungenKarte";
import { GeldJeKontoKarte } from "./GeldJeKontoKarte";
import { PageHead } from "../bausteine/PageHead";
import { IconButton, IconLeiste } from "../bausteine/IconButton";
import { Zeilenlink } from "../bausteine/Zeilenlink";
import { betont } from "../bausteine/betonung";
import { geldFarbe } from "../bausteine/geldFarbe";
import { useDatum, useGeld } from "../bausteine/einstellungenKontext";
import { useLoeschfrage } from "../bausteine/Loeschfrage";
import { Stapel } from "../bausteine/Anordnung";
import { LeererZustand } from "../bausteine/LeererZustand";
import { SchmalKlappblock } from "../bausteine/SchmalKlappblock";
import { useSchmal } from "../bausteine/useSchmal";
import { Collapsible } from "@base-ui/react/collapsible";

/** Stabil leer, damit die abgeleiteten Werte nicht bei jedem Render neu entstehen. */
const LEERE_NAMEN: ReadonlyMap<string, string> = new Map();
const LEERE_DECKUNG: RuecklagenDeckung = {
  posten: [], soll: 0, sollMitKonto: 0, tatsaechlich: 0, grad: 100, nurRechnung: false,
};
const LEERE_LISTE: readonly never[] = [];
const LEERER_FLUSS: Ruecklagenfluss = { bedarf: 0, plan: 0, planposten: [], ist: 0, posten: [] };

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function RuecklagenScreen() {
  const loeschfrage = useLoeschfrage();
  const { t } = useTranslation();
  const geld = useGeld();
  // Die Liste unter „Diesen Monat" geht über höchstens einen Monat — dort sagt das Jahr nichts.
  const datum = useDatum();
  const heute = useMemo(heuteIso, []);
  const [sicht, setSicht] = useState<Ruecklagensicht | null>(null);
  /** Je Konto, welche Rücklagen dort Geld haben — für die Karte „Wo das Geld liegt". */
  const [jeKonto, setJeKonto] = useState<GeldJeKonto | null>(null);
  /** Wofür sich nach den bisherigen Ausgaben eine Rücklage lohnt (`VorschlaegeKarte`). */
  const [vorschlaege, setVorschlaege] = useState<readonly Ruecklagenvorschlag[]>(LEERE_LISTE);

  // Welcher Dialog offen ist — sein Zustand gehört ihm (`RuecklageDialog`,
  // `AusbuchungDialog`), der Screen merkt sich nur, für welche Rücklage.
  const [bearbeitet, setBearbeitet] = useState<Ruecklage | "neu" | null>(null);
  /** Was ein übernommener Vorschlag beim Anlegen vorbelegt — nur zusammen mit `"neu"`. */
  const [vorbelegung, setVorbelegung] = useState<RuecklageVorbelegung | undefined>(undefined);
  const [ausbuchen, setAusbuchen] = useState<Ruecklage | null>(null);
  /** Eine Rücklage mit Kategorie, deren Abschluss gerade im Dialog steht. */
  const [abschliessen, setAbschliessen] = useState<Ruecklage | null>(null);
  /** Welche Rücklage ihren Verlauf zeigt — höchstens eine. */
  const [offeneRuecklage, setOffeneRuecklage] = useState<string | null>(null);
  /** Eine Buchung aus dem Verlauf, die gerade im Dialog steht. */
  const [detail, setDetail] = useState<IstBuchung | null>(null);

  // Verwandte Repos in EINEM Zug laden und zusammen setzen: gestaffelte setState lassen
  // die Deckung kurz gegen eine leere Kontenliste rechnen (jeder Stand wäre dann 0).
  async function laden() {
    const [r, k, v] = await Promise.all([ruecklagenLaden(heute), geldJeKonto(heute), ruecklagenvorschlaege(heute)]);
    setSicht(r);
    setJeKonto(k);
    setVorschlaege(v);
  }
  useEffect(() => {
    laden();
  }, []);

  const items = sicht?.ruecklagen ?? LEERE_LISTE;
  const zeilen = sicht?.zeilen ?? LEERE_LISTE;
  const konten = sicht?.konten ?? LEERE_LISTE;
  const kontoName = sicht?.kontoNamen ?? LEERE_NAMEN;
  const deckung = sicht?.deckung ?? LEERE_DECKUNG;
  const zielwert = sicht?.zielwert ?? 0;
  const mindest = sicht?.mindest ?? 0;
  const fluss = sicht?.fluss ?? LEERER_FLUSS;
  const nichtsDa = items.length === 0;
  /** Die Zeile, deren Verlauf offen ist — sie kann nach einem Löschen weg sein. */
  const offeneZeile = zeilen.find((z) => z.ruecklage.id === offeneRuecklage);

  const neu = () => { setVorbelegung(undefined); setBearbeitet("neu"); };
  const bearbeiten = (r: Ruecklage) => { setVorbelegung(undefined); setBearbeitet(r); };
  /**
   * Ein Vorschlag öffnet den Dialog vorbelegt mit Kategorie, Name und Rate — als
   * Rücklage, die weiterläuft: sie trägt Ausgaben, die immer wieder kommen, und beginnt
   * nie neu. Bestätigt wird im Dialog.
   */
  const vorschlagUebernehmen = (v: Ruecklagenvorschlag) => {
    setVorbelegung({ kategorieId: v.kategorieId, bezeichnung: v.name, rate: v.vorschlag, art: "fortlaufend" });
    setBearbeitet("neu");
  };
  const vorschlagVerwerfen = async (v: Ruecklagenvorschlag) => {
    await ruecklagenvorschlagVerwerfen(v.kategorieId);
    await laden();
  };
  const ausbuchenOeffnen = (r: Ruecklage) => setAusbuchen(r);
  /**
   * Schmal (unter 700 px) steht oben, womit man arbeitet (seit 2026-11-22): was auf eine
   * Zuordnung wartet, dann die Rücklagen selbst — je eine kurze Zeile. Was man nachsieht,
   * rückt darunter und klappt ein: Stand und Faustformel samt „Diesen Monat", „Wo das
   * Geld liegt", die Vorschläge, „Schon abgeschlossen". Der Erklärtext klappt ebenfalls
   * ein — er ist Erklärung („Drei Ränge", `ui/CLAUDE.md`). Breit ändert sich nichts.
   *
   * `useSchmal` statt CSS, weil sich das Markup ändert: Karten klappen ein und rücken um,
   * und die Zeile je Rücklage ist eine andere. Geprüft in `schmal.test.tsx`.
   */
  const schmal = useSchmal();
  /**
   * Ohne eine einzige Rücklage sind die Vorschläge der Weg hinein — der leere Zustand
   * zeigt auf sie. Dann stehen sie auch schmal offen da, nicht hinter einer Zeile.
   */
  const vorschlaegeOffen = nichtsDa;

  const anlegenKnopf = (hauptknopf: boolean) => (
    <Button variant={hauptknopf ? "primary" : undefined} plus onClick={neu}>{t("ruecklagen.ruecklage")}</Button>
  );

  /** Stand, Faustformel und „Diesen Monat" — breit oben, schmal eingeklappt darunter. */
  const flussDa = fluss.bedarf > 0 || fluss.plan > 0 || fluss.ist !== 0;
  const staendeUndMonat = (
    <>
      {/* Oben das PAAR: links, wie die Rücklagen dastehen — die Rechnung (Ziele, Soll)
          gegen das, was auf den Konten liegt —, rechts der Massstab von aussen, die
          Faustformel. Bis 2026-11-11 standen die Zahlen als sechs Kacheln über der Seite
          und die Faustformel neben „Diesen Monat"; Anzahl und Rate je Monat sind dabei
          weggefallen — die Anzahl zählt man in der Liste, die Rate steht als „Bedarf"
          unter „Diesen Monat".
          Das Tacho steht IMMER da, auch ohne Vertragseinnahmen: dann leer und mit dem
          Grund. Vorher fehlte es in dem Fall einfach. */}
      <div className="karten-paar" style={{ marginTop: 0 }}>
        {/* Über BEIDE Sorten (`ruecklagenDeckung`): Soll, „tatsächlich da" und Deckung
            zählen jede Rücklage mit ihrem Stand über null. „Ziele gesamt" zählt nur die mit
            Ziel — die anderen haben keins. */}
        {items.length > 0 && (
          <Card title={t("ruecklagen.standTitel")} subtitle={t("ruecklagen.standUntertitel")}>
            {/* Zwei mal zwei statt `kpis`: vier Kacheln brechen dort drei zu eins um, und
                die Paare gehören zusammen — Ziele und Soll ist die Rechnung, Stand und
                Deckung die Wirklichkeit. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--gap-card)" }}>
              <KPIStat size="chip" label={t("ruecklagen.kpiZielwert")} value={geld.format(zielwert)} unit={geld.symbol} />
              <KPIStat size="chip" label={t("ruecklagen.kpiSoll")} value={geld.format(deckung.soll)} unit={geld.symbol} />
              <KPIStat size="chip" label={t("ruecklagen.kpiTatsaechlich")} value={geld.format(deckung.tatsaechlich)} unit={geld.symbol} tone="ok" />
              <KPIStat size="chip" label={t("ruecklagen.kpiDeckung")} value={String(deckung.grad)} unit="%" tone={deckung.grad < 50 ? "warn" : "default"} />
            </div>
          </Card>
        )}

        {/* Die Faustformel misst seit 2026-11-08 etwas: den Stand der Rücklagenkonten.
            Sie entscheidet trotzdem nichts — keine Warnung, keine Rechnung hängt an ihr. */}
        {/* Erst mit geladener Sicht: vorher ist `mindest` 0, und das Tacho meldete einen
            Augenblick lang „kein Vertrag mit Einnahmen", der vielleicht da ist. */}
        {sicht && (
          <Card
            title={t("ruecklagen.mindestTitel")}
            subtitle={mindest > 0 ? t("ruecklagen.mindestHerleitung", { einnahmen: geld.formatMitSymbol(sicht.vertragseinnahmen) }) : undefined}
          >
            <FaustformelTacho stand={sicht.ruecklagenStand} mindest={mindest} />
          </Card>
        )}
      </div>

      {/* Drei Zahlen, nicht eine — und das ist der ganze Nutzen dieser Karte:
          BEDARF verlangt die Rechnung, PLAN hast du eingerichtet, EINGEGANGEN ist, was
          auf den Rücklagenkonten angekommen ist. Bedarf über Plan heisst „du legst zu
          wenig zurück"; Plan über Eingang heisst „die Überweisung ist ausgefallen".
          Die Buchungen stehen darunter: bis 2026-11-08 hiess die dritte Zahl
          „geflossen", und man musste raten, woraus sie bestand. */}
      {flussDa && (
        <Card title={t("ruecklagen.flussTitel")} subtitle={t("ruecklagen.flussUntertitel")}>
          <div className="kpis">
            <KPIStat size="chip" label={t("ruecklagen.flussBedarf")} value={geld.format(fluss.bedarf)} unit={geld.symbol} />
            <KPIStat
              size="chip"
              label={t("ruecklagen.flussPlan")}
              value={geld.format(fluss.plan)}
              unit={geld.symbol}
              tone={fluss.plan < fluss.bedarf ? "warn" : "default"}
            />
            <KPIStat
              size="chip"
              label={t("ruecklagen.flussIst")}
              value={geld.format(fluss.ist)}
              unit={geld.symbol}
              tone={fluss.ist >= fluss.plan && fluss.plan > 0 ? "ok" : "default"}
            />
          </div>
          {fluss.plan === 0 && fluss.bedarf > 0 && (
            <div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--sp-2)" }}>
              {t("ruecklagen.flussOhnePlan")}
            </div>
          )}
          {/* Die Verträge hinter „eingerichtet": die Summe sagt nicht, WELCHER Vertrag die
              Rücklagen füllt, und bei „eingerichtet unter Bedarf" ist das die nächste Frage. */}
          {fluss.planposten.length > 0 && (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <div className="muted" style={{ fontSize: "var(--fs-sm)", marginBottom: 2 }}>
                {t("ruecklagen.flussPlanListe")}
              </div>
              {fluss.planposten.map((p, i) => (
                <div
                  key={p.vertragId}
                  style={{
                    display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", fontSize: "var(--fs-ui)",
                    borderTop: i === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
                  }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                    {p.bezeichnung}
                    <span className="muted">
                      {" · "}
                      {t("ruecklagen.flussPlanWeg", {
                        von: kontoName.get(p.vonKontoId) ?? p.vonKontoId,
                        nach: kontoName.get(p.nachKontoId) ?? p.nachKontoId,
                      })}
                      {!p.monatlich && ` · ${t("ruecklagen.flussPlanAnteilig")}`}
                    </span>
                  </span>
                  <span className="num" style={{ marginLeft: "auto", flex: "0 0 auto", fontWeight: "var(--fw-semi)" }}>
                    {geld.format(p.monatsrate)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {fluss.planposten.length > 0 && fluss.posten.length > 0 && (
            <div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--sp-3)", marginBottom: -8 }}>
              {t("ruecklagen.flussIstListe")}
            </div>
          )}
          {fluss.posten.length === 0 ? (
            <div className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--sp-3)" }}>
              {t("ruecklagen.flussKeineBuchung")}
            </div>
          ) : (
            <div style={{ marginTop: "var(--sp-3)" }}>
              {fluss.posten.map((p, i) => (
                <div
                  key={p.buchungId}
                  style={{
                    display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", fontSize: "var(--fs-ui)",
                    borderTop: i === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
                  }}
                >
                  <span className="num" style={{ color: "var(--ink-3)", fontWeight: "var(--fw-bold)", flex: "0 0 auto" }}>
                    {datum.ohneJahr(p.datum)}
                  </span>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                    {kontoName.get(p.nachKontoId) ?? p.nachKontoId}
                    <span className="muted">
                      {" · "}
                      {p.vonKontoId
                        ? t("ruecklagen.flussVon", { konto: kontoName.get(p.vonKontoId) ?? p.vonKontoId })
                        : t("ruecklagen.flussOhneKonto")}
                    </span>
                  </span>
                  <span className="num" style={{ marginLeft: "auto", flex: "0 0 auto", fontWeight: "var(--fw-semi)" }}>
                    {geld.format(p.betrag)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
  const vorschlaegeKarte = (
    <VorschlaegeKarte
      vorschlaege={vorschlaege}
      onUebernehmen={vorschlagUebernehmen}
      onVerwerfen={(v) => void vorschlagVerwerfen(v)}
    />
  );
  /** Die Überschrift der eingeklappten Zeile: die Titel der Karten, die darin stehen. */
  const staendeUndMonatTitel = [
    items.length > 0 ? t("ruecklagen.standTitel") : null,
    sicht ? t("ruecklagen.mindestTitel") : null,
    flussDa ? t("ruecklagen.flussTitel") : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="screen">
      <PageHead
        title={t("ruecklagen.titel")}
        subtitle={t("ruecklagen.untertitel")}
        action={anlegenKnopf(true)}
      />

      <SchmalKlappblock titel={t("ruecklagen.erklaerungFrage")}>
        <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-2)" }}>
          <Trans i18nKey="ruecklagen.erklaerung" components={betont} />
        </p>
      </SchmalKlappblock>

      {/* Schmal ganz oben: hier ist etwas zu tun. Breit steht sie nach der Liste (unten). */}
      {schmal && <WartetKarte zeilen={sicht?.wartend ?? LEERE_LISTE} onGewaehlt={laden} />}

      {!schmal && staendeUndMonat}

      {deckung.nurRechnung && (
        // Ohne Kontozuordnung gibt es nur die Rechnung. Das einmal sagen, statt überall
        // ein „—" zu zeigen, hinter dem man einen Fehler vermutet.
        <div className="muted" style={{ fontSize: "var(--fs-sm)", margin: "0 0 var(--sp-3)" }}>
          {t("ruecklagen.hinweisOhneKonto")}
        </div>
      )}

      {/* EINE Liste für beide Sorten (seit Paket 4, ADR-0006). Bis dahin standen hier zwei
          Karten — „Von Hand ausgebucht" und „Über die Kategorie" —, weil die beiden Formen
          ihre Ausgaben verschieden fanden. Seit jede über ihre Kategorie findet, ist der
          Unterschied, der beim Benutzen zählt, ein anderer: ob sie weiterläuft oder
          abgeschlossen wird — und der steht als Pille an der Zeile. Gerechnet ist alles
          schon (`Ruecklagenzeile`); hier wird nur gezeigt. */}
      <Card
        title={zeilen.length > 0 ? t("ruecklagen.listeTitel") : undefined}
        subtitle={zeilen.length > 0 ? t("ruecklagen.listeHinweis") : undefined}
      >
        {nichtsDa && !sicht ? (
          // Vor dem Laden nur der alte Satz — sonst stünde die Erklärung kurz auch bei
          // dem da, der längst Rücklagen führt.
          <div className="muted">{t("ruecklagen.leer")}</div>
        ) : nichtsDa ? (
          // Rücklagen brauchen keine Buchungen — wer eine anlegen will, kann es sofort.
          <LeererZustand kopf={t("ruecklagen.leer")} aktionen={anlegenKnopf(true)}>
            {t("ruecklagen.leerErklaerung")}
            {/* Gibt es Vorschläge, zeigt der Satz auf sie — wie bei den Budgets. */}
            {vorschlaege.length > 0 && ` ${t("ruecklagen.leerMitVorschlaegen")}`}
          </LeererZustand>
        ) : (
          <div className="ruecklagen-liste">
          <Stapel abstand={schmal ? 3 : 5}>
            {zeilen.map((z, idx) => {
              const r = z.ruecklage;
              const mitZiel = hatZiel(r);
              const offen = offeneRuecklage === r.id;
              const titelVerlauf = t(offen ? "ruecklagen.verlaufZu" : "ruecklagen.verlaufAuf", { name: r.bezeichnung });
              /** „Wertverlust bis heute … · fehlt …" — nur mit Kauf und Nutzungsdauer (Migration 82). */
              const wertverlustText = z.wertverlust
                ? [
                    t("ruecklagen.wertverlust.bisHeute", { betrag: geld.formatMitSymbol(z.wertverlust.bisHeute) }),
                    ...(z.wertverlust.fehlt > 0 ? [t("ruecklagen.wertverlust.fehlt", { betrag: geld.formatMitSymbol(z.wertverlust.fehlt) })] : []),
                  ].join(" · ")
                : null;
              const umschalten = () => setOffeneRuecklage(offen ? null : r.id);

              /** Sorte und „ohne Konto" — breit neben dem Namen, schmal hinter der Zeile. */
              const pillen = (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                  <Pill variant={z.art === "fortlaufend" ? "um" : "neutral"}>{t(`ruecklagen.sorte.${z.art}`)}</Pill>
                  {!z.kontoName && <Pill variant="neutral">{t("ruecklagen.pillNurRechnung")}</Pill>}
                </span>
              );
              const rateUndKnoepfe = (
                <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
                  {t("ruecklagen.rate")} {geld.format(z.rate)} {geld.symbol}{t("ruecklagen.proMonatSuffix")}
                  <IconLeiste>
                    {/* Nur an einer, die abgeschlossen wird — eine, die weiterläuft,
                        beginnt nie neu. Mit Kategorie wird sie abgeschlossen (ohne
                        Buchungswahl), der Altbestand ohne Kategorie ausgebucht wie vorher. */}
                    {z.abschlussweg === "abschliessen" && <IconButton icon="uebernehmen" label={t("ruecklagen.abschliessen")} onClick={() => setAbschliessen(r)} />}
                    {z.abschlussweg === "ausbuchen" && <IconButton icon="uebernehmen" label={t("ruecklagen.ausbuchen")} onClick={() => ausbuchenOeffnen(r)} />}
                    <IconButton icon="bearbeiten" label={t("ruecklagen.bearbeiten")} onClick={() => bearbeiten(r)} />
                    <IconButton icon="loeschen" ton="gefahr" label={t("ruecklagen.loeschen")} onClick={() => loeschfrage.stellen({
                        name: r.bezeichnung,
                        folgen: t("ruecklagen.loeschenFolgen"),
                        ausfuehren: async () => { await ruecklageLoeschen(r.id); await laden(); },
                      })} />
                  </IconLeiste>
                </span>
              );
              /* Zweite Zeile: woran sie hängt und wo ihr Geld liegt. Fehlt die
                 Kategorie (ein Altfall), steht es da — beim Bearbeiten wird sie Pflicht. */
              const herkunft = (
                <div className="hinweis" style={{ marginBottom: 6 }}>
                  {z.kategorieName ?? t("ruecklagen.ohneKategorie")}
                  {" · "}
                  {z.kontoName ?? t("ruecklagen.kontoKeins")}
                </div>
              );

              if (schmal) {
                // Schmal EINE Zeile je Rücklage: Name, Stand (mit Ziel: Stand / Ziel) und
                // der Balken. Die ganze Zeile ist der Knopf und öffnet, was breit der Name
                // öffnet — den Verlauf unter der Liste —, und hier darunter Sorte, Rate,
                // die Knöpfe und woran sie hängt. Es fällt nichts weg, es liegt dahinter.
                return (
                  // Base UI `Collapsible`: `aria-expanded` und `aria-controls` kommen von dort
                  // (`bedienteile.test.ts`), der Zustand bleibt der des Screens — er öffnet
                  // auch den Verlauf unter der Liste.
                  <Collapsible.Root
                    key={r.id}
                    open={offen}
                    onOpenChange={umschalten}
                    style={idx > 0 ? { borderTop: "1px solid var(--line)", paddingTop: "var(--sp-3)" } : undefined}
                  >
                    <Collapsible.Trigger className="aufklappzeile" title={titelVerlauf}>
                      <span className="ruecklage-kurz-kopf">
                        <b>{r.bezeichnung} <span className="muted" aria-hidden="true">{offen ? "▾" : "▸"}</span></b>
                        {/* Im Minus steht der Stand selbst, auch mit Ziel: „0 / Ziel" sagte
                            nicht, dass sie mehr getragen hat, als zurückgelegt war. */}
                        <span className="num" style={{ whiteSpace: "nowrap", fontWeight: "var(--fw-semi)", color: mitZiel && z.stand >= 0 ? "var(--ink-2)" : geldFarbe(z.stand) }}>
                          {mitZiel && z.stand >= 0
                            ? `${geld.format(z.stand)} / ${geld.formatMitSymbol(r.ziel as number)}`
                            : geld.formatMitSymbol(z.stand)}
                        </span>
                      </span>
                      {mitZiel && (
                        <CoverageTrack
                          value={Math.max(0, z.stand)}
                          max={r.ziel as number}
                          name={t("ruecklagen.fortschritt")}
                          style={{ marginTop: 6 }}
                        />
                      )}
                      {/* Schmal nur als kleine Zeile unter dem Balken — der Stand bleibt die Zahl der Zeile. */}
                      {wertverlustText && <span className="hinweis ruecklage-kurz-wertverlust">{wertverlustText}</span>}
                    </Collapsible.Trigger>
                    <Collapsible.Panel>
                      <div style={{ marginTop: "var(--sp-2)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: 6 }}>
                          {pillen}
                          {rateUndKnoepfe}
                        </div>
                        {herkunft}
                        {z.tatsaechlich != null && (
                          <div className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                            {t("ruecklagen.davonDa", { konto: z.kontoName ?? "?", betrag: geld.formatMitSymbol(z.tatsaechlich) })}
                          </div>
                        )}
                      </div>
                    </Collapsible.Panel>
                  </Collapsible.Root>
                );
              }

              return (
                // Trennlinie ab der zweiten Rücklage: der Abstand allein trennt zu schwach.
                <div key={r.id} style={idx > 0 ? { borderTop: "1px solid var(--line)", paddingTop: "var(--sp-5)" } : undefined}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: "var(--sp-3)", flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                      {/* Der Name öffnet den Verlauf darunter — derselbe Weg wie bei den Budgets. */}
                      <Zeilenlink titel={titelVerlauf} onKlick={umschalten}>
                        <b>{r.bezeichnung}</b>
                      </Zeilenlink>
                      {pillen}
                    </span>
                    {rateUndKnoepfe}
                  </div>

                  {herkunft}

                  {/* Der Stand — auch im Minus: dann hat sie mehr getragen, als zurückgelegt
                      war. Mit Ziel EIN Balken gegen das Ziel, mit Konto dazu, was davon
                      wirklich daliegt. */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", fontSize: "var(--fs-sm)" }}>
                    <span>
                      {t("ruecklagen.standHeute")}{" "}
                      <b className="num" style={{ color: geldFarbe(z.stand) }}>{geld.formatMitSymbol(z.stand)}</b>
                      {/* Klein daneben, nicht statt des Stands: was der Gegenstand bis heute
                          verloren hat und, liegt der Stand darunter, wie viel fehlt. */}
                      {wertverlustText && <span className="muted"> · {wertverlustText}</span>}
                    </span>
                    {z.tatsaechlich != null && (
                      <span className="muted">
                        {t("ruecklagen.davonDa", { konto: z.kontoName ?? "?", betrag: geld.formatMitSymbol(z.tatsaechlich) })}
                      </span>
                    )}
                  </div>
                  {mitZiel && (
                    <div style={{ marginTop: 6 }}>
                      <CoverageTrack
                        value={Math.max(0, z.stand)}
                        max={r.ziel as number}
                        label={t("ruecklagen.fortschritt")}
                        right={`${geld.format(Math.max(0, z.stand))} / ${geld.formatMitSymbol(r.ziel as number)}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </Stapel>
          </div>
        )}
      </Card>

      {/* Der Verlauf NEBEN der Liste, nicht darin. Der `key` lässt beim Wechsel die
          Monatsauswahl neu anfangen. */}
      {sicht && offeneZeile && (
        <RuecklageVerlauf
          key={offeneZeile.ruecklage.id}
          sicht={sicht}
          ruecklage={offeneZeile.ruecklage}
          heute={heute}
          onSchliessen={() => setOffeneRuecklage(null)}
          onBuchung={setDetail}
        />
      )}


      {/* Was auf eine Zuordnung wartet — direkt nach der Liste, weil hier etwas zu tun ist;
          ist nichts offen, steht die Karte nicht da (`WartetKarte`). Schmal steht sie
          ganz oben. */}
      {!schmal && <WartetKarte zeilen={sicht?.wartend ?? LEERE_LISTE} onGewaehlt={laden} />}

      {/* Schmal rückt hierher, was breit über der Liste steht. Die Zeile steht nur da,
          wenn darin eine Karte steht. */}
      {schmal && staendeUndMonatTitel && (
        <SchmalKlappblock titel={staendeUndMonatTitel}>{staendeUndMonat}</SchmalKlappblock>
      )}

      {/* Die Vorschläge unter der Liste, wie bei den Budgets: ein Nachtrag, kein
          Einstieg — wer den Bereich öffnet, will zuerst seine eigenen Rücklagen sehen.
          Nach „Wartet auf Zuordnung", weil dort schon etwas zu tun ist. Schmal stehen
          sie eingeklappt nach „Wo das Geld liegt" — ausser es gibt noch keine Rücklage. */}
      {(!schmal || vorschlaegeOffen) && vorschlaegeKarte}

      {/* Nach der Liste und nicht davor: dort wird gearbeitet (anlegen, ausbuchen),
          hier wird nachgesehen, auf welchem Konto das alles liegt. Vor den Listen schöbe
          eine Karte mit einem Abschnitt je Konto die Handlungen aus dem ersten Blick.
          Die Bedingung ist die der Karte selbst: ohne sie stünde schmal eine Zeile da,
          hinter der nichts aufgeht. */}
      {jeKonto && (jeKonto.konten.length > 0 || jeKonto.ohneKonto.length > 0) && (
        <SchmalKlappblock titel={t("ruecklagen.geldJeKonto.titel")}>
          <GeldJeKontoKarte
            sicht={jeKonto}
            onBearbeiten={(r) => {
              const ruecklage = items.find((x) => x.id === r.id);
              if (ruecklage) setBearbeitet(ruecklage);
            }}
          />
        </SchmalKlappblock>
      )}

      {schmal && !vorschlaegeOffen && vorschlaege.length > 0 && (
        <SchmalKlappblock titel={t("ruecklagen.vorschlaege.titel")}>{vorschlaegeKarte}</SchmalKlappblock>
      )}

      {/* Was schon gebraucht wurde — samt der beendeten Rücklagen (`AusbuchungenKarte`). */}
      {(sicht?.geschichte.length ?? 0) > 0 && (
        <SchmalKlappblock titel={t("ruecklagen.ausbuchungenTitel")}>
          <AusbuchungenKarte zeilen={sicht?.geschichte ?? LEERE_LISTE} onGeaendert={laden} />
        </SchmalKlappblock>
      )}

      {bearbeitet && (
        <RuecklageDialog
          ruecklage={bearbeitet === "neu" ? null : bearbeitet}
          vorbelegung={bearbeitet === "neu" ? vorbelegung : undefined}
          heute={heute}
          konten={konten}
          kategorien={sicht?.kategorien ?? []}
          kategoriebelegung={sicht?.kategoriebelegung}
          onClose={() => setBearbeitet(null)}
          onGespeichert={async () => { setBearbeitet(null); await laden(); }}
          onGeaendert={laden}
        />
      )}
      {ausbuchen && (
        <AusbuchungDialog
          ruecklage={ausbuchen}
          heute={heute}
          buchungswahl={sicht ? buchungswahlFuer(sicht, ausbuchen) : []}
          onClose={() => setAusbuchen(null)}
          onGespeichert={async () => { setAusbuchen(null); await laden(); }}
        />
      )}
      {abschliessen && sicht && (
        <AbschlussDialog
          ruecklage={abschliessen}
          sicht={sicht}
          heute={heute}
          onClose={() => setAbschliessen(null)}
          onGespeichert={async () => { setAbschliessen(null); await laden(); }}
        />
      )}
      {detail && <BuchungDetail buchung={detail} onClose={() => setDetail(null)} onGeaendert={laden} />}
      {loeschfrage.dialog}

    </div>
  );
}
