// Budgets — die MONATLICHEN, und nur die.
//
// Bis 2026-11-15 standen hier zwei Arten nebeneinander: monatlich (der Rest verfällt) und
// aufbauend (der Rest bleibt). Ein aufbauendes Budget ist für den Nutzer aber dasselbe wie
// eine Rücklage — Geld, das Monat für Monat für etwas Späteres zurückgelegt wird —, und es
// stand seitdem im Bereich Rücklagen. Seit Migration 81 ist es auch im Datenmodell eine
// Rücklage (Sorte `fortlaufend`); ein Budget ist nur noch monatlich.
//
// Die Verschachtelung gilt weiter: ein Budget auf einer Unterkategorie nimmt dem Dach
// seinen Verbrauch weg (core/budget), eine Rücklage darunter ebenso. Die sieht man hier
// nicht — die Zeile des Dachs sagt deshalb, was abgezogen ist (`abgezogen` am
// `Budgetstand`, aus der Zuständigkeit).
//
// Die Kennzahlen stehen als eigene Reihe ÜBER den Karten, nicht darin — wie auf der
// Übersicht. In der Karte konkurrierten sie mit der Tabelle um dieselbe Fläche.
//
// PILOT für ADR-0004: alle sichtbaren Strings über t()/<Trans>, alles Geld über useGeld().

import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  type Budgetbereich,
  type Budgetstand,
  type Budgetvorschlag,
  type IstBuchung,
} from "../../../application";
import { budgetbereich, budgetLoeschen, budgetvorschlagVerwerfen } from "../../dienste";
import { Button, Card, DataTable, KPIStat, Pill } from "../bausteine";
import { BuchungDetail } from "../bausteine/BuchungDetail";
import { BudgetVerlauf } from "./BudgetVerlauf";
import { BudgetDialog, type BudgetVorbelegung } from "./BudgetDialog";
import { BudgetTabelle } from "./BudgetTabelle";
import { IconButton, IconLeiste } from "../bausteine/IconButton";
import { betont } from "../bausteine/betonung";
import { PageHead } from "../bausteine/PageHead";
import { warnTon } from "../bausteine/geldFarbe";
import { useGeld } from "../bausteine/einstellungenKontext";
import { useLoeschfrage } from "../bausteine/Loeschfrage";
import { LeererZustand } from "../bausteine/LeererZustand";
import type { ScreenId } from "../bausteine/AppShell";

/** Stabile leere Karte — eine frisch erzeugte Map liesse jedes Memo neu rechnen. */
const LEERE_NAMEN: ReadonlyMap<string, string> = new Map();

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/**
 * `onNavigate` ist freiwillig: der leere Bereich führt damit in den Import. Ohne Shell
 * (Tests) steht dort nur der Knopf zum Anlegen.
 */
export function BudgetsScreen({ onNavigate }: { onNavigate?: (id: ScreenId) => void } = {}) {
  const loeschfrage = useLoeschfrage();
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);

  const [bereich, setBereich] = useState<Budgetbereich | null>(null);
  /**
   * Welches Budget seinen Verlauf zeigt — höchstens eines. Zwei aufgeklappte Charts
   * untereinander schöben die Liste aus dem Bild, von der man ausgegangen ist.
   */
  const [offenesBudget, setOffenesBudget] = useState<string | null>(null);
  /**
   * Die Buchung aus der Verbrauchsliste, die gerade im Dialog steht.
   *
   * Der Verlauf zeigt, WORAUS der Verbrauch eines Monats besteht — und das ist die
   * Stelle, an der eine falsch einsortierte Zeile auffällt. Von hier aus zu korrigieren
   * spart den Umweg über den Kontoauszug.
   */
  const [detail, setDetail] = useState<IstBuchung | null>(null);
  /**
   * Der Verlauf steht unter der ganzen Liste, nicht unter der geklickten Zeile — eine
   * Tabelle kann nichts zwischen zwei Zeilen einhängen. Bei sechs Budgets plus
   * Vorschlagskarte liegt er damit unter dem Sichtbaren, und wer klickt, sieht nichts
   * passieren und hält es für kaputt. Deshalb wird er beim Aufklappen herangeholt.
   */
  const verlaufRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // `?.` auch am Aufruf: jsdom kennt `scrollIntoView` nicht, und ein Screen-Test soll
    // nicht an einer Bequemlichkeit scheitern.
    if (offenesBudget) verlaufRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [offenesBudget]);

  /** Auf- und zuklappen — von der Zeile wie vom Namen aus dieselbe Geste. */
  function verlaufUmschalten(id: string) {
    setOffenesBudget((cur) => (cur === id ? null : id));
  }

  /**
   * Der Dialog: `null` zu, `"neu"` zum Anlegen (mit Vorbelegung aus einem Vorschlag),
   * sonst die ID des bearbeiteten Budgets. Sein Zustand gehört ihm
   * (`BudgetDialog`); der aktuelle Stand wird bei jedem Render aus der Liste gesucht, damit
   * er nach dem Entfernen einer Version die neue Reihe zeigt.
   */
  const [dialog, setDialog] = useState<
    { neu: true; vorbelegung?: BudgetVorbelegung } | { neu: false; id: string } | null
  >(null);

  // EIN Ladevorgang, EIN setState: gestaffelte await/setState-Paare lassen abgeleitete
  // Werte kurz gegen leere Listen rechnen (ein Kategorie-Lookup meldet dann für einen
  // Render „ohne Kategorie").
  async function laden() {
    setBereich(await budgetbereich(heute));
  }
  useEffect(() => {
    laden();
  }, []);

  /**
   * Die Liste in Baumordnung: ein Budget steht unter dem, in dem es liegt. Nur so ist
   * ablesbar, dass das Dach für alles AUSSER ihm gilt — sein Verbrauch zählt dort nicht.
   * Geordnet und gerechnet wird das in
   * `budgetstaende` (Anwendungsschicht), nicht hier.
   */
  const alle = bereich?.staende ?? [];
  const zeilen = alle;
  const kategorien = bereich?.kategorien ?? [];
  const konten = bereich?.konten ?? [];
  const vorschlaege = bereich?.vorschlaege ?? [];
  const kontoName = bereich?.kontoNamen ?? LEERE_NAMEN;
  /** Die Zeile, deren Verlauf offen ist — sie kann nach einem Löschen weg sein. */
  const offenesZeile = zeilen.find((z) => z.budget.id === offenesBudget);
  /** Das Budget, das der Dialog gerade bearbeitet, im aktuellen Stand. */
  const bearbeitet = dialog && !dialog.neu ? alle.find((z) => z.budget.id === dialog.id) ?? null : null;

  /**
   * Die Kennzahlen summieren über die monatlichen Budgets. Doppelt zählt dabei nichts: ein
   * Dach gilt für alles ausser seinen Unterbudgets, Betrag wie Verbrauch sind getrennt.
   */
  const summe = useMemo(() => {
    let proMonat = 0, rahmen = 0, verbraucht = 0;
    for (const z of zeilen) {
      proMonat += z.proMonat;
      rahmen += z.monat.verfuegbar;
      verbraucht += z.monat.verbraucht;
    }
    return {
      proMonat,
      verbraucht,
      auslastung: rahmen > 0 ? Math.round((verbraucht / rahmen) * 100) : 0,
      ueberzogen: zeilen.filter((z) => z.rest < 0).length,
    };
  }, [zeilen]);

  const neu = () => setDialog({ neu: true });
  const bearbeiten = (z: Budgetstand) => setDialog({ neu: false, id: z.budget.id });

  /**
   * Übernimmt einen Vorschlag in die Anlege-Maske — bestätigt wird dort.
   *
   * Hier stehen nur Budgets. Eine Kategorie, in der zweimal im Jahr etwas passiert,
   * bekäme mit einem monatlichen Rahmen die falsche Zusage; ihr Vorschlag steht im
   * Bereich Rücklagen. Bis 2026-11-16 stand er hier mit der Art „Rücklage" und öffnete
   * den Dialog einer Rücklage — wer hier ein Budget erwartete, fand danach keins.
   */
  function vorschlagUebernehmen(v: Budgetvorschlag) {
    setDialog({ neu: true, vorbelegung: { kategorieId: v.kategorieId, betrag: v.vorschlag } });
  }

  async function vorschlagVerwerfen(v: Budgetvorschlag) {
    await budgetvorschlagVerwerfen(v.kategorieId);
    await laden();
  }

  return (
    <div className="screen">
      <PageHead
        title={t("budgets.titel")}
        subtitle={t("budgets.untertitel")}
        action={
          <Button variant="primary" plus onClick={neu}>
            {t("budgets.anlegen")}
          </Button>
        }
      />

      <p style={{ color: "var(--ink-2)", fontSize: "var(--fs-body)", lineHeight: 1.55, maxWidth: 660, margin: "0 0 var(--sp-3)" }}>
        <Trans i18nKey="budgets.erklaerung" components={betont} />
      </p>

      {/* Kennzahlen als eigene Reihe, nicht in der Karte — dieselbe Ordnung wie auf der
          Übersicht: erst die Zahlen, dann das, worüber sie sprechen. */}
      {zeilen.length > 0 && (
        <div className="kpis">
          <KPIStat size="chip" label={t("budgets.kpiAnzahl")} value={String(zeilen.length)} />
          <KPIStat size="chip" label={t("budgets.kpiProMonat")} value={geld.format(summe.proMonat)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("budgets.kpiVerbraucht")} value={geld.format(summe.verbraucht)} unit={geld.symbol} />
          <KPIStat size="chip" label={t("budgets.kpiAuslastung")} value={String(summe.auslastung)} unit="%" tone={warnTon(summe.auslastung > 100)} />
          {summe.ueberzogen > 0 && (
            <KPIStat size="chip" label={t("budgets.kpiUeberzogen")} value={String(summe.ueberzogen)} tone="warn" />
          )}
        </div>
      )}

      {zeilen.length === 0 ? (
        <Card title={t("budgets.abschnittListe")}>
          {/* Vor dem Laden nur der alte Satz: ob es Buchungen gibt, weiss erst die Sicht,
              und daran hängt der nächste Schritt — ohne Buchungen gibt es nichts, woraus
              sich ein Budget vorschlagen liesse, also zuerst der Import. */}
          {!bereich ? (
            <div className="muted">{t("budgets.leer")}</div>
          ) : (
            <LeererZustand
              kopf={t("budgets.leer")}
              aktionen={
                <>
                  {!bereich.hatBuchungen && onNavigate && (
                    <Button variant="primary" onClick={() => onNavigate("import")}>
                      {t("einrichtung.zuBereich", { bereich: t("shell.navImport") })}
                    </Button>
                  )}
                  <Button variant={bereich.hatBuchungen ? "primary" : undefined} plus onClick={neu}>
                    {t("budgets.anlegen")}
                  </Button>
                </>
              }
            >
              {t("budgets.leerErklaerung")}
              {!bereich.hatBuchungen
                ? ` ${t("budgets.leerOhneBuchungen")}`
                : vorschlaege.length > 0
                  ? ` ${t("budgets.leerMitVorschlaegen")}`
                  : ""}
            </LeererZustand>
          )}
        </Card>
      ) : (
        <Card title={t("budgets.abschnittListe")} subtitle={t("budgets.verbrauchHinweis")}>
          <BudgetTabelle
            zeilen={zeilen}
            kontoNamen={kontoName}
            offen={offenesBudget}
            onZeile={(z) => verlaufUmschalten(z.budget.id)}
            onBearbeiten={bearbeiten}
            onLoeschen={(z) => loeschfrage.stellen({
              name: z.kategorieName,
              folgen: t("budgets.loeschenFolgen"),
              ausfuehren: async () => { await budgetLoeschen(z.budget.id); await laden(); },
            })}
          />
          {zeilen.some((z) => z.tiefe > 0) && (
            <div className="muted" style={{ fontSize: "var(--fs-2xs)", marginTop: "var(--sp-2)" }}>
              <div>{t("budgets.abschnittListeHinweis")}</div>
            </div>
          )}
        </Card>
      )}

      {/* Der Verlauf NEBEN der Liste, nicht darin: die Liste steckt schon in einer Karte,
          und eine zweite darin wären zwei Rahmen um dieselbe Sache. Der `key` sorgt dafür,
          dass beim Wechsel auf ein anderes Budget die Monatsauswahl neu anfängt statt auf
          einem Index zu stehen, den die kürzere Reihe womöglich gar nicht hat. */}
      {bereich && offenesZeile && (
        <div ref={verlaufRef}>
        <BudgetVerlauf
          key={offenesZeile.budget.id}
          sicht={bereich.sicht}
          stand={offenesZeile}
          heute={heute}
          zeilenkontext={bereich.zeilenkontext}
          onSchliessen={() => setOffenesBudget(null)}
          onBuchung={setDetail}
        />
        </div>
      )}

      {/*
        Die Vorschläge stehen UNTER der Liste, nicht darüber.

        Sie sind kein Einstieg, sondern ein Nachtrag: wer den Bereich öffnet, will
        sehen, was er sich vorgenommen hat, und nicht zuerst, was die App ihm
        vorschlägt. Über der Liste schob sich der Vorschlag bei jedem Besuch vor die
        eigenen Zahlen — und je mehr Kategorien sich bewegen, desto weiter rutschte
        das Eigentliche nach unten.

        Auch unter dem Verlauf und nicht zwischen ihm und der Liste: der Verlauf
        gehört an die Zeile, die ihn aufgeklappt hat (siehe dort).
      */}
      {vorschlaege.length > 0 && (
        <Card
          title={t("budgets.vorschlaegeTitel")}
          subtitle={t("budgets.vorschlaegeUntertitel", { count: vorschlaege.length })}
        >
          <p className="muted" style={{ fontSize: "var(--fs-sm)", maxWidth: 660, margin: "0 0 var(--sp-3)" }}>
            {t("budgets.vorschlaegeHinweis")}
          </p>
          <DataTable
            sortable
            pageSize={10}
            columns={[
              { key: "kategorie", label: t("budgets.spalteKategorie"), render: (v: Budgetvorschlag) => v.name },
              {
                key: "median",
                label: `${t("budgets.spalteBisher")} ${geld.symbol}`,
                align: "right",
                sortValue: (v: Budgetvorschlag) => v.proMonat,
                render: (v: Budgetvorschlag) => geld.format(v.proMonat),
              },
              {
                // Was der Vertrag abbucht, steuert kein Budget — deshalb steht der Abzug
                // in der Tabelle und nicht nur im Ergebnis.
                key: "vertrag",
                label: `${t("budgets.spalteVertraglich")} ${geld.symbol}`,
                align: "right",
                sortValue: (v: Budgetvorschlag) => v.vertragsanteil,
                render: (v: Budgetvorschlag) => (v.vertragsanteil > 0 ? geld.format(-v.vertragsanteil) : "—"),
              },
              {
                key: "vorschlag",
                label: `${t("budgets.spalteVorschlag")} ${geld.symbol}`,
                align: "right",
                sortValue: (v: Budgetvorschlag) => v.vorschlag,
                render: (v: Budgetvorschlag) => <b>{geld.format(v.vorschlag)}</b>,
              },
              {
                // Sagt, wie oft der Rahmen reißen wird: ×1 = jeden Monat gleich,
                // ×23 = ein einzelner Monat war das Dreiundzwanzigfache.
                key: "schwankung",
                label: t("budgets.spalteSchwankung"),
                align: "right",
                sortValue: (v: Budgetvorschlag) => v.schwankung,
                render: (v: Budgetvorschlag) =>
                  v.schwankung <= 2 ? (
                    <Pill variant="ok">{t("budgets.stabil")}</Pill>
                  ) : (
                    <Pill variant="warn">{t("budgets.schwankend", { faktor: v.schwankung })}</Pill>
                  ),
              },
              { key: "monate", label: t("budgets.spalteMonate"), align: "right", render: (v: Budgetvorschlag) => String(v.monate) },
              {
                key: "_a",
                label: "",
                align: "right",
                sortable: false,
                render: (v: Budgetvorschlag) => (
                  <IconLeiste>
                    <IconButton icon="uebernehmen" label={t("budgets.vorschlagUebernehmen")} onClick={() => vorschlagUebernehmen(v)} />
                    <IconButton icon="verwerfen" label={t("budgets.vorschlagVerwerfen")} onClick={() => void vorschlagVerwerfen(v)} />
                  </IconLeiste>
                ),
              },
            ]}
            rows={[...vorschlaege]}
          />
        </Card>
      )}

      {dialog && (dialog.neu || bearbeitet) && (
        <BudgetDialog
          stand={bearbeitet}
          vorbelegung={dialog.neu ? dialog.vorbelegung : undefined}
          heute={heute}
          kategorien={kategorien}
          konten={konten}
          onClose={() => setDialog(null)}
          onGespeichert={async () => { setDialog(null); await laden(); }}
          onGeaendert={laden}
        />
      )}

      {/* Nach einer Änderung den ganzen Bereich neu rechnen: eine geänderte Kategorie
          verschiebt Geld zwischen Budgets, nicht nur innerhalb des offenen. */}
      {detail && (
        <BuchungDetail buchung={detail} onClose={() => setDetail(null)} onGeaendert={laden} />
      )}
      {loeschfrage.dialog}

    </div>
  );
}
