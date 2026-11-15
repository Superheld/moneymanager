// Rücklagen — was du für etwas zurücklegst, das noch kommt.
//
// Hiess bis 2026-08-31 „Inventar" und meinte einen Gegenstand. Die Rechnung ist
// geblieben, die Behauptung ist weg, dass am anderen Ende ein Ding steht: eine Rücklage
// hat entweder ZIEL UND FRIST (dann rechnet sie sich, hat einen Fortschritt und fängt
// nach dem Ausbuchen von vorn an) oder eine freie RATE (dann läuft sie ohne Deckel und
// ist nach dem Ausbuchen erledigt).
//
// REIN KALKULATORISCH (2026-08-16): Was TATSÄCHLICH da ist, kommt nicht aus Buchungen,
// sondern aus dem realen Stand des Kontos, das die Rücklage benennt: liegen dort 60 %
// der rechnerischen Summe, ist jede Rücklage darauf zu 60 % gedeckt (anteilig, ohne
// Rangfolge). Auch „Ausgebucht" bucht nichts — der Kauf ist eine normale Ausgabe und
// senkt den Kontostand ohnehin.
//
// ZWEI FORMEN IN EINEM BEREICH (seit 2026-11-15). Hier stehen auch die aufbauenden
// Budgets, als „Rücklage über die Kategorie": für den Nutzer sind beide dasselbe — Geld,
// das Monat für Monat für etwas Späteres zurückgelegt wird. Sichtbar bleibt der eine
// Unterschied, der beim Benutzen zählt: WIE eine Ausgabe zu ihr findet. Eine Rücklage
// bekommt ihre Ausgabe von Hand beim Ausbuchen; die über die Kategorie findet sie von
// selbst. Deshalb zwei Karten mit je einem Satz dazu, und nicht eine Liste, in der man
// jeder Zeile ansehen müsste, wie sie funktioniert.
//
// Im Datenmodell sind es weiter zwei Tabellen (`ruecklage`, `budget` mit Art aufbauend),
// und die zweite Karte benutzt die Bausteine und Use-Cases der Budgets (`BudgetTabelle`,
// `BudgetDialog`, `BudgetVerlauf`, `budgetbereich`) — nachgebaut ist nichts.

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  hatZiel,
  monatsRuecklage,
  nachArtGetrennt,
  type Budgetbereich,
  type GruppierterStand,
  type IstBuchung,
  type Ruecklage,
  type RuecklagenDeckung,
  type Ruecklagenfluss,
  type Ruecklagensicht,
  buchungswahlFuer,
} from "../../../application";
import {
  budgetbereich,
  budgetLoeschen,
  ruecklageLoeschen,
  ruecklagen as ruecklagenLaden,
} from "../../dienste";
import { BudgetDialog } from "../bausteine/BudgetDialog";
import { BudgetTabelle } from "../bausteine/BudgetTabelle";
import { BudgetVerlauf } from "../bausteine/BudgetVerlauf";
import { BuchungDetail } from "../buchung/BuchungDetail";
import { Button, Card, CoverageTrack, KPIStat, Pill } from "../bausteine";
import { FaustformelTacho } from "./FaustformelTacho";
import { RuecklageDialog } from "./RuecklageDialog";
import { AusbuchungDialog } from "./AusbuchungDialog";
import { AusbuchungenKarte } from "./AusbuchungenKarte";
import { PageHead } from "../bausteine/PageHead";
import { IconButton, IconLeiste } from "../bausteine/IconButton";
import { betont } from "../bausteine/betonung";
import { useDatum, useGeld } from "../bausteine/einstellungenKontext";
import { useLoeschfrage } from "../bausteine/Loeschfrage";
import { Stapel } from "../bausteine/Anordnung";
import { LeererZustand } from "../bausteine/LeererZustand";

/** Stabil leer, damit die abgeleiteten Werte nicht bei jedem Render neu entstehen. */
const LEERE_NAMEN: ReadonlyMap<string, string> = new Map();
const LEERE_DECKUNG: RuecklagenDeckung = { posten: [], soll: 0, sollMitKonto: 0, tatsaechlich: 0, grad: 100 };
const LEERE_LISTE: readonly never[] = [];
const LEERER_FLUSS: Ruecklagenfluss = { bedarf: 0, plan: 0, ist: 0, posten: [] };

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
  /** Die Budgets — gebraucht werden hier nur die aufbauenden („über die Kategorie"). */
  const [budgets, setBudgets] = useState<Budgetbereich | null>(null);

  // Welcher Dialog offen ist — sein Zustand gehört ihm (`RuecklageDialog`,
  // `AusbuchungDialog`), der Screen merkt sich nur, für welche Rücklage.
  const [bearbeitet, setBearbeitet] = useState<Ruecklage | "neu" | null>(null);
  const [ausbuchen, setAusbuchen] = useState<Ruecklage | null>(null);
  /** Der Dialog für eine Rücklage über die Kategorie: `"neu"`, die ID des Budgets, oder zu. */
  const [budgetDialog, setBudgetDialog] = useState<string | null>(null);
  /** Welche Rücklage über die Kategorie ihren Verlauf zeigt — höchstens eine. */
  const [offenesBudget, setOffenesBudget] = useState<string | null>(null);
  /** Eine Buchung aus dem Verlauf, die gerade im Dialog steht. */
  const [detail, setDetail] = useState<IstBuchung | null>(null);

  // Verwandte Repos in EINEM Zug laden und zusammen setzen: gestaffelte setState lassen
  // die Deckung kurz gegen eine leere Kontenliste rechnen (jeder Stand wäre dann 0).
  async function laden() {
    const [r, b] = await Promise.all([ruecklagenLaden(heute), budgetbereich(heute)]);
    setSicht(r);
    setBudgets(b);
  }
  useEffect(() => {
    laden();
  }, []);

  const items = sicht?.ruecklagen ?? LEERE_LISTE;
  const konten = sicht?.konten ?? LEERE_LISTE;
  const kontoName = sicht?.kontoNamen ?? LEERE_NAMEN;
  const deckung = sicht?.deckung ?? LEERE_DECKUNG;
  const zielwert = sicht?.zielwert ?? 0;
  const mindest = sicht?.mindest ?? 0;
  const fluss = sicht?.fluss ?? LEERER_FLUSS;
  // Die aufbauenden Budgets in ihrer Baumordnung — getrennt in der Anwendungsschicht,
  // dieselbe Trennung, nach der der Bereich Budgets nur die monatlichen zeigt.
  const ueberKategorie = useMemo(
    () => (budgets ? nachArtGetrennt(budgets.staende).aufbauend : LEERE_LISTE),
    [budgets],
  );
  const offeneKategorie = ueberKategorie.find((z) => z.budget.id === offenesBudget);
  const bearbeitetesBudget =
    budgetDialog && budgetDialog !== "neu" ? budgets?.staende.find((z) => z.budget.id === budgetDialog) ?? null : null;
  /** Was vom Rest auf seinem Konto NICHT liegt — 0, wenn alles da ist. */
  const fehlt = (budgetId: string) => {
    const d = budgets?.deckung.get(budgetId);
    return d ? d.anspruch - d.gedeckt : 0;
  };
  const nichtsDa = items.length === 0 && ueberKategorie.length === 0;

  const neu = () => setBearbeitet("neu");
  const bearbeiten = (r: Ruecklage) => setBearbeitet(r);
  const ausbuchenOeffnen = (r: Ruecklage) => setAusbuchen(r);
  const neuUeberKategorie = () => setBudgetDialog("neu");
  const budgetLoeschfrage = (z: GruppierterStand) => loeschfrage.stellen({
    name: z.kategorieName,
    folgen: t("ruecklagen.kategorie.loeschenFolgen"),
    ausfuehren: async () => { await budgetLoeschen(z.budget.id); await laden(); },
  });
  const anlegenKnoepfe = (hauptknopf: boolean) => (
    <>
      <Button variant={hauptknopf ? "primary" : undefined} plus onClick={neu}>{t("ruecklagen.ruecklage")}</Button>
      <Button plus onClick={neuUeberKategorie}>{t("ruecklagen.kategorie.knopf")}</Button>
    </>
  );

  return (
    <div className="screen">
      <PageHead
        title={t("ruecklagen.titel")}
        subtitle={t("ruecklagen.untertitel")}
        action={<span style={{ display: "inline-flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>{anlegenKnoepfe(true)}</span>}
      />

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-2)" }}>
        <Trans i18nKey="ruecklagen.erklaerung" components={betont} />
      </p>

      {/* Oben das PAAR: links, wie die Rücklagen dastehen — die Rechnung (Ziele, Soll)
          gegen das, was auf den Konten liegt —, rechts der Massstab von aussen, die
          Faustformel. Bis 2026-11-11 standen die Zahlen als sechs Kacheln über der Seite
          und die Faustformel neben „Diesen Monat"; Anzahl und Rate je Monat sind dabei
          weggefallen — die Anzahl zählt man in der Liste, die Rate steht als „Bedarf"
          unter „Diesen Monat".
          Das Tacho steht IMMER da, auch ohne Vertragseinnahmen: dann leer und mit dem
          Grund. Vorher fehlte es in dem Fall einfach. */}
      <div className="karten-paar" style={{ marginTop: 0 }}>
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
      {(fluss.bedarf > 0 || fluss.plan > 0 || fluss.ist !== 0) && (
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

      {items.length > 0 && deckung.sollMitKonto === 0 && (
        // Ohne Kontozuordnung gibt es nur die Rechnung. Das einmal sagen, statt überall
        // ein „—" zu zeigen, hinter dem man einen Fehler vermutet.
        <div className="muted" style={{ fontSize: "var(--fs-sm)", margin: "0 0 var(--sp-3)" }}>
          {t("ruecklagen.hinweisOhneKonto")}
        </div>
      )}

      {/* Leer ist der Bereich erst, wenn es keine der beiden Formen gibt. Gibt es nur die
          über die Kategorie, fällt die Karte der Rücklagen weg — eine leere Karte neben
          einer vollen läse sich wie ein Fehler. */}
      {(nichtsDa || items.length > 0) && (
      <Card
        title={items.length > 0 ? t("ruecklagen.abschnittHand") : undefined}
        subtitle={items.length > 0 ? t("ruecklagen.abschnittHandHinweis") : undefined}
      >
        {nichtsDa && !sicht ? (
          // Vor dem Laden nur der alte Satz — sonst stünde die Erklärung kurz auch bei
          // dem da, der längst Rücklagen führt.
          <div className="muted">{t("ruecklagen.leer")}</div>
        ) : nichtsDa ? (
          // Rücklagen brauchen keine Buchungen — wer eine anlegen will, kann es sofort.
          // Deshalb nur die Knöpfe zum Anlegen, und kein Weg in den Import.
          <LeererZustand
            kopf={t("ruecklagen.leer")}
            aktionen={anlegenKnoepfe(true)}
          >
            {t("ruecklagen.leerErklaerung")}
          </LeererZustand>
        ) : (
          <Stapel abstand={5}>
            {deckung.posten.map((p, idx) => {
              const r = p.ruecklage;
              const mitZiel = hatZiel(r);
              return (
                // Trennlinie ab der zweiten Rücklage: zwei Balken je Posten sehen sonst
                // aus wie vier Balken eines Postens — der Abstand allein trennt zu schwach.
                <div
                  key={r.id}
                  style={idx > 0 ? { borderTop: "1px solid var(--line)", paddingTop: "var(--sp-5)" } : undefined}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: "var(--sp-3)", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: "var(--fw-bold)" }}>
                      {r.bezeichnung}
                      {!mitZiel && <> <Pill variant="um">{t("ruecklagen.pillFrei")}</Pill></>}
                      {!r.kontoId && <> <Pill variant="neutral">{t("ruecklagen.pillNurRechnung")}</Pill></>}
                    </span>
                    <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
                      {t("ruecklagen.rate")} {geld.format(monatsRuecklage(r))} {geld.symbol}{t("ruecklagen.proMonatSuffix")}
                      <IconLeiste>
                        <IconButton icon="uebernehmen" label={t("ruecklagen.ausbuchen")} onClick={() => ausbuchenOeffnen(r)} />
                        <IconButton icon="bearbeiten" label={t("ruecklagen.bearbeiten")} onClick={() => bearbeiten(r)} />
                        <IconButton icon="loeschen" ton="gefahr" label={t("ruecklagen.loeschen")} onClick={() => loeschfrage.stellen({
                            name: r.bezeichnung,
                            folgen: t("ruecklagen.loeschenFolgen"),
                            ausfuehren: async () => { await ruecklageLoeschen(r.id); await laden(); },
                          })} />
                      </IconLeiste>
                    </span>
                  </div>

                  {/* EIN Balken je Rücklage (seit 2026-11-11): was da ist, gegen das Ziel —
                      und ein Strich beim Soll von heute. Vorher standen zwei Balken
                      untereinander („Soll heute / Ziel" und „davon da"), und ob man im
                      Rückstand ist, musste man aus zwei Längen im Kopf abgleichen. Liegt
                      der Balken vor dem Strich, fehlt etwas; dann trägt er die Warnfarbe.
                      Der Balken bekommt die CENT-Werte direkt: er rechnet nur ein
                      Verhältnis.

                      Ohne Konto gibt es nur die Rechnung — dann zeigt der Balken das Soll.
                      Und eine FREIE Rücklage hat keinen Nenner: ein Balken bräuchte einen
                      erfundenen. Dort steht, was aufgelaufen ist, und mit Konto der Stand
                      gegen dieses Aufgelaufene. */}
                  {mitZiel && p.tatsaechlich != null ? (
                    <CoverageTrack
                      value={p.tatsaechlich}
                      max={r.ziel as number}
                      marke={p.soll}
                      over={p.tatsaechlich < p.soll}
                      label={t("ruecklagen.stand", { konto: kontoName.get(r.kontoId!) ?? "?" })}
                      right={t("ruecklagen.standRechts", {
                        da: geld.format(p.tatsaechlich),
                        ziel: geld.formatMitSymbol(r.ziel as number),
                        soll: geld.format(p.soll),
                      })}
                    />
                  ) : mitZiel ? (
                    <CoverageTrack
                      value={p.soll}
                      max={r.ziel as number}
                      label={t("ruecklagen.fortschrittLabel")}
                      right={`${geld.format(p.soll)} / ${geld.format(r.ziel as number)} ${geld.symbol}`}
                    />
                  ) : (
                    <>
                      <div className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                        {t("ruecklagen.freiAufgelaufen", { betrag: `${geld.format(p.soll)} ${geld.symbol}` })}
                      </div>
                      {p.tatsaechlich != null && (
                        <div style={{ marginTop: 6 }}>
                          <CoverageTrack
                            value={p.tatsaechlich}
                            max={Math.max(1, p.soll)}
                            over={p.tatsaechlich < p.soll}
                            label={t("ruecklagen.gedecktDurch", { konto: kontoName.get(r.kontoId!) ?? "?" })}
                            right={`${geld.format(p.tatsaechlich)} / ${geld.format(p.soll)} ${geld.symbol}`}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </Stapel>
        )}
      </Card>
      )}

      {/* Die zweite Form: findet ihre Ausgaben von selbst über die Kategorie. Dieselbe
          Tabelle und derselbe Verlauf wie unter Budgets — nur die Wörter sind die einer
          Rücklage (`bausteine/budgetTexte`). */}
      {budgets && ueberKategorie.length > 0 && (
        <Card title={t("ruecklagen.abschnittKategorie")} subtitle={t("ruecklagen.abschnittKategorieHinweis")}>
          <BudgetTabelle
            zeilen={ueberKategorie}
            kontoNamen={budgets.kontoNamen}
            fehlt={fehlt}
            offen={offenesBudget}
            onZeile={(z) => setOffenesBudget((cur) => (cur === z.budget.id ? null : z.budget.id))}
            onBearbeiten={(z) => setBudgetDialog(z.budget.id)}
            onLoeschen={budgetLoeschfrage}
          />
        </Card>
      )}
      {budgets && offeneKategorie && (
        <BudgetVerlauf
          key={offeneKategorie.budget.id}
          sicht={budgets.sicht}
          stand={offeneKategorie}
          heute={heute}
          zeilenkontext={budgets.zeilenkontext}
          onSchliessen={() => setOffenesBudget(null)}
          onBuchung={setDetail}
        />
      )}

      {/* Was schon gebraucht wurde — samt der beendeten Rücklagen (`AusbuchungenKarte`). */}
      <AusbuchungenKarte zeilen={sicht?.geschichte ?? LEERE_LISTE} onGeaendert={laden} />

      {bearbeitet && (
        <RuecklageDialog
          ruecklage={bearbeitet === "neu" ? null : bearbeitet}
          heute={heute}
          konten={konten}
          kategorien={sicht?.kategorien ?? []}
          onClose={() => setBearbeitet(null)}
          onGespeichert={async () => { setBearbeitet(null); await laden(); }}
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
      {budgets && budgetDialog && (budgetDialog === "neu" || bearbeitetesBudget) && (
        <BudgetDialog
          art="aufbauend"
          stand={bearbeitetesBudget}
          heute={heute}
          kategorien={budgets.kategorien}
          konten={budgets.konten}
          onClose={() => setBudgetDialog(null)}
          onGespeichert={async () => { setBudgetDialog(null); await laden(); }}
          onGeaendert={laden}
        />
      )}
      {detail && <BuchungDetail buchung={detail} onClose={() => setDetail(null)} onGeaendert={laden} />}
      {loeschfrage.dialog}

    </div>
  );
}
