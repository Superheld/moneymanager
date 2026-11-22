// Analyse (Rückblick) — echte Einnahmen und Ausgaben pro Monat aus den verbuchten
// Ist-Buchungen, realer Saldo-Verlauf über die Zeit, Aufschlüsselung nach Kategorien.
// Zeitraum wählbar (12/24 Monate, dieses Jahr, alles). Alles Geld über useGeld().
//
// Abgetrennt von der Übersicht (2026-08-19): dort steht, was JETZT gilt — die drei
// Monatskarten und die Budgets des laufenden Monats. Alles, was einen Zeitraum
// auswertet, hat einen eigenen Bereich bekommen. Vorher war das ein Screen, den man
// nach unten scrollen musste, bis die Kategorien kamen.
//
// **Seit 2026-11-08 in Registern.** Untereinander war die Seite so lang, dass man für
// die Befunde oder ein Depot an allem anderen vorbeiscrollte; mit Reitern ist jeder
// Abschnitt einen Klick entfernt, und die Leiste selbst zeigt, was es gibt. Die Filter
// stehen seit 2026-11-09 am Register, das sie einstellen.
//
// **Seit 2026-11-11 ist jedes Register unabhängig**: eigener Zeitraum, eigener Zustand
// (`ZeitraumWahl.tsx` sagt, warum). Der Zustand liegt trotzdem HIER und nicht im Register,
// damit ein Wechsel des Reiters ihn nicht verwirft — es wird immer nur das aktive Register
// gerendert. Verlauf und Kategorien stehen in eigenen Dateien (`VerlaufRegister`,
// `KategorienRegister`); der Verlauf zeigt unter einem angeklickten Monat dessen
// Aufschlüsselung, die Kategorien sind eine eigene Auswertung über die Zeit.
//
// Was hier NICHT umgekehrt wurde: die Befunde bleiben innerhalb ihres Registers sieben
// Karten untereinander (siehe `BefundeBereich.tsx`). Dort galt und gilt, dass niemand
// sucht, was hinter einem Reiter liegt; ein Reiter „Befunde" sagt aber, was darunter ist,
// sieben Reiter „Treue", „Ohne Plan", „Ausreißer" sagten es nicht mehr.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  analyseAusblick,
  analyseBefunde,
  analyseFenster,
  analyseFensterTaggenau,
  analyseLiquiditaet,
  analysePlanrechnung,
  analyseReichweite,
  type Analysebasis,
  type Depotdaten,
  type IstBuchung,
  type Zeitraum,
} from "../../../application";
import { analyse, depots } from "../../dienste";
import { Button, Card } from "../bausteine";
import type { ScreenId } from "../bausteine/AppShell";
import { LeererZustand } from "../bausteine/LeererZustand";
import { BuchungDetail } from "../bausteine/BuchungDetail";
import { AusblickKarte } from "./AusblickKarte";
import { BefundeBereich } from "./BefundeBereich";
import { DepotAnsicht } from "./DepotAnsicht";
import { LiquiditaetKarte } from "./LiquiditaetKarte";
import { ReichweiteKarte } from "./ReichweiteKarte";
import { KATEGORIEN_ANFANG, KategorienRegister, type KategorienZustand } from "./KategorienRegister";
import { VERLAUF_ANFANG, VerlaufRegister, type VerlaufZustand } from "./VerlaufRegister";
import { Filterzeile, ZeitraumWahl } from "./ZeitraumWahl";
import { BERICHT_ANFANG, BerichtRegister, type BerichtZustand } from "./BerichtRegister";
import { PlanrechnungRegister } from "./PlanrechnungRegister";
import { PageHead } from "../bausteine/PageHead";
import { Registerleiste } from "../bausteine/Registerleiste";
import { fehlerMelden } from "../bausteine/Meldungen";

/** Die Register in Anzeigereihenfolge — dieselbe, in der sie vorher untereinander standen. */
type AnalyseRegister = "verlauf" | "kategorien" | "ausblick" | "planrechnung" | "befunde" | "depot" | "bericht";

/** Heute als ISO — die Uhr wird hier gelesen, gerechnet wird in der Anwendungsschicht. */
function toIsoHeute(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** `onNavigate` führt aus der leeren Analyse in den Import; ohne Shell (Tests) kein Knopf. */
export function AnalyseScreen({ onNavigate }: { onNavigate?: (id: ScreenId) => void } = {}) {
  const { t } = useTranslation();
  const [basis, setBasis] = useState<Analysebasis | null>(null);
  const [detail, setDetail] = useState<IstBuchung | null>(null);
  const [register, setRegister] = useState<AnalyseRegister>("verlauf");
  const [fehler, setFehler] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);
  /**
   * Die Depots. Getrennt geladen, weil sie mit der übrigen Analyse nichts teilen: sie
   * bestehen aus Beobachtungen, nicht aus Buchungen, und gehen in keine Kennzahl ein.
   */
  const [depotdaten, setDepotdaten] = useState<Depotdaten | null>(null);

  // Je Register ein eigener Zustand — siehe Kopf.
  const [verlauf, setVerlauf] = useState<VerlaufZustand>(VERLAUF_ANFANG);
  const [kategorien, setKategorien] = useState<KategorienZustand>(KATEGORIEN_ANFANG);
  const [befundeZeitraum, setBefundeZeitraum] = useState<Zeitraum>("12");
  const [depotZeitraum, setDepotZeitraum] = useState<Zeitraum>("12");
  const [bericht, setBericht] = useState<BerichtZustand>(BERICHT_ANFANG);

  // Gemeinsam laden und in EINEM Schritt setzen — kein Render-Fenster, in dem die
  // Aufschlüsselung gegen eine noch leere Kategorie-Liste rechnet (sonst „ohne Kategorie").
  async function laden() {
    try {
      setBasis(await analyse());
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setGeladen(true);
    }
  }
  useEffect(() => {
    laden();
    depots()
      .then(setDepotdaten)
      .catch((e) => { fehlerMelden(e); setDepotdaten(null); });
  }, []);

  const heute = useMemo(() => toIsoHeute(), []);

  // Die Befunde werden in EINEM Zug gerechnet, damit zwei Zahlen auf einem Bildschirm
  // nicht verschiedene Mengen meinen — über das Fenster IHRES Zeitraums.
  const befunde = useMemo(() => {
    if (!basis) return null;
    const { von, bis } = analyseFenster(basis, befundeZeitraum, heute);
    return analyseBefunde(basis, von, bis);
  }, [basis, befundeZeitraum, heute]);

  const depotFenster = useMemo(() => {
    if (!basis) return null;
    const { von, bis } = analyseFenster(basis, depotZeitraum, heute);
    // Depotstände hängen an TAGEN: das Ende des Monats, nicht sein Erster (siehe
    // `analyseFensterTaggenau`).
    return { von, bis: analyseFensterTaggenau(bis) };
  }, [basis, depotZeitraum, heute]);

  /**
   * Der Blick nach vorn hängt NICHT an einem Zeitraum, sondern steht fest bei sechs
   * Monaten zurück und zwölf voraus (bis 2026-11-11 sechs voraus; gewünscht war ein
   * ganzes Jahr nach vorn). Die Projektion wird nicht besser, wenn man sie über zwei
   * Jahre zieht — ihre späten Monate wären Behauptung statt Vorschau.
   */
  const ausblick = useMemo(() => (basis ? analyseAusblick(basis, heute, 6, 12) : []), [basis, heute]);

  /**
   * „Reicht das Geld?" steht unter dem Blick nach vorn und hängt wie er an keinem
   * Zeitraum: das Fenster ist fest (`LIQUIDITAET_TAGE`). Aus derselben Basis gerechnet
   * wie der Saldo darüber — zwei Vorschauen auf einem Bildschirm müssen denselben
   * Bestand meinen.
   */
  const liquiditaet = useMemo(() => (basis ? analyseLiquiditaet(basis, heute) : null), [basis, heute]);

  /**
   * „Wie lange reicht es ohne Einnahmen?" steht darunter und hängt ebenfalls an keinem
   * Zeitraum: gemittelt wird fest über die letzten abgeschlossenen Monate
   * (`REICHWEITE_MONATE` im Kern). Dieselbe Basis wie die Karten darüber.
   */
  const reichweite = useMemo(() => (basis ? analyseReichweite(basis, heute) : null), [basis, heute]);

  /** Der Plan der nächsten zwölf Monate, Verträge anteilig — fest ab heute wie der Ausblick. */
  const planrechnung = useMemo(() => (basis ? analysePlanrechnung(basis, heute) : null), [basis, heute]);

  const ist = basis?.buchungen ?? [];

  /**
   * Nur Register mit Inhalt. Ein Reiter „Depot" ohne abgerufenes Depot wäre ein Weg ins
   * Leere.
   */
  const registerListe = (
    [
      ["verlauf", true],
      ["kategorien", !!basis && basis.kategorien.length > 0],
      ["ausblick", true],
      // Nach dem Ausblick: auch sie schaut nach vorn, aber auf den Plan statt aufs Konto.
      ["planrechnung", !!planrechnung?.hatPlan],
      ["befunde", !!befunde],
      ["depot", !!depotdaten && depotdaten.depots.length > 0],
      // Zuletzt: der Bericht fasst zusammen, was die Register davor einzeln zeigen. Er
      // steht auch ohne abgeschlossenen Monat da und sagt dann, ab wann es ihn gibt.
      ["bericht", true],
    ] as const
  )
    .filter(([, da]) => da)
    .map(([id]) => ({ id, label: t(`analyse.register.${id}`) }));
  /** Verschwindet das gewählte Register (Depot entfernt), gilt wieder das erste. */
  const wirksamesRegister: AnalyseRegister = registerListe.some((r) => r.id === register) ? register : "verlauf";

  return (
    <div className="screen">
      <PageHead title={t("analyse.titel")} subtitle={t("analyse.untertitel")} />

      {fehler && <Card style={{ borderColor: "var(--danger)" }}>{t("historie.fehlerDb")} ({fehler})</Card>}

      {!geladen ? null : ist.length === 0 && !fehler ? (
        <Card>
          <LeererZustand
            kopf={t("historie.leer")}
            aktionen={onNavigate && (
              <Button variant="primary" onClick={() => onNavigate("import")}>
                {t("einrichtung.zuBereich", { bereich: t("shell.navImport") })}
              </Button>
            )}
          >
            {t("analyse.leerErklaerung")}
          </LeererZustand>
        </Card>
      ) : (
        basis && (
          <Registerleiste
            register={registerListe}
            aktiv={wirksamesRegister}
            onWahl={(id) => setRegister(id as AnalyseRegister)}
            stapeln
          >
            {wirksamesRegister === "verlauf" && (
              <VerlaufRegister basis={basis} heute={heute} zustand={verlauf} setZustand={setVerlauf} onBuchung={setDetail} />
            )}

            {wirksamesRegister === "kategorien" && (
              <KategorienRegister basis={basis} heute={heute} zustand={kategorien} setZustand={setKategorien} onBuchung={setDetail} />
            )}

            {/* Der Blick nach vorn ist derselbe Saldo wie im Verlauf, nur weitergedacht. */}
            {wirksamesRegister === "ausblick" && <AusblickKarte punkte={ausblick} />}
            {/* Daneben, nicht darin — keine Karte in einer Karte. Der Ausblick darüber
                rechnet monatsweise über alle liquiden Konten zusammen; das hier sagt je
                Konto und taggenau, ob es reicht. */}
            {wirksamesRegister === "ausblick" && liquiditaet && <LiquiditaetKarte sicht={liquiditaet} />}
            {/* Dieselbe Frage ohne die Einnahmen und über das Fenster hinaus: wie lange das
                freie Geld die Kosten eines Monats trägt. */}
            {wirksamesRegister === "ausblick" && reichweite && <ReichweiteKarte sicht={reichweite} />}

            {wirksamesRegister === "planrechnung" && planrechnung && <PlanrechnungRegister sicht={planrechnung} />}

            {/* Die Befunde beantworten die Frage nach „wie viel wohin" — ob das so
                tragfähig ist. */}
            {wirksamesRegister === "befunde" && befunde && (
              <>
                <Filterzeile><ZeitraumWahl wert={befundeZeitraum} aufAenderung={setBefundeZeitraum} /></Filterzeile>
                <BefundeBereich befunde={befunde} kontoNamen={basis.kontoNamen} onBuchung={(b) => setDetail(b)} />
              </>
            )}

            {/* Nebeneinander wie in der Übersicht — bei einem einzelnen Depot nimmt es die
                volle Breite. */}
            {wirksamesRegister === "depot" && depotdaten && depotFenster && depotdaten.depots.length > 0 && (
              <>
                <Filterzeile><ZeitraumWahl wert={depotZeitraum} aufAenderung={setDepotZeitraum} /></Filterzeile>
                <div className="karten-paar" style={{ marginTop: 0 }}>
                  {depotdaten.depots.map((d) => (
                    <DepotAnsicht key={d.depot.id} sicht={d} von={depotFenster.von} bis={depotFenster.bis} />
                  ))}
                </div>
              </>
            )}

            {/* Ein Zeitraum auf einem Blatt: Ergebnis, Weg zum Konto, Vermögen. */}
            {wirksamesRegister === "bericht" && (
              <BerichtRegister basis={basis} heute={heute} zustand={bericht} setZustand={setBericht} />
            )}
          </Registerleiste>
        )
      )}

      {detail && (
        <BuchungDetail buchung={detail} onClose={() => setDetail(null)} onGeaendert={laden} />
      )}
    </div>
  );
}
