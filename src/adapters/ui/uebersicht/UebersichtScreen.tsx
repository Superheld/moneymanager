// Übersicht — was JETZT gilt, und sonst nichts.
//
// Drei Blöcke, und die Reihenfolge ist die Reihenfolge der Fragen. Oben die drei
// Monatskarten (laufender Monat plus die beiden folgenden) — „wie geht dieser Monat
// aus". Darunter, nebeneinander, die beiden Seiten desselben Monats: was in ihm noch da
// ist (Budgets) und was aus ihm noch abgeht (Vorschau). Ganz unten die Bestände, die von
// keinem Monat abhängen: Depot und die Stände je Kontoklasse.
//
// **Die Vorschau stand bis 2026-09-13 zwischen Monatskarten und Budgets**, die Stände
// darüber. Beide standen damit allein über die volle Breite, obwohl keine von beiden sie
// braucht — und das Wichtigste, die Budgets, rutschte dadurch unter den Falz. Neben dem,
// was es erklärt, steht jetzt jedes von beiden: die Vorschau nennt die Zahlungen, aus
// denen der Budgetrest daneben schrumpft.
//
// Alles, was einen ZEITRAUM auswertet — Verlauf,
// Kennzahlen, Aufschlüsselung nach Kategorien — ist 2026-08-19 in den Bereich „Analyse"
// gezogen. Vorher hing das an einem Screen, den man erst nach unten scrollen musste,
// bis die Kategorien kamen; und die Frage „wie stehe ich gerade da?" ging dabei unter.
//
// Der Screen RECHNET NICHTS. Er lud vorher sechs Repositories selbst zusammen und rief
// damit die Kernfunktionen auf — und genau dabei ging die Vertragsregel verloren: die
// Karten oben bekamen eine gefilterte Buchungsliste, die Budgetliste darunter die
// ungefilterte, und dasselbe Budget stand im selben Bild mit zwei verschiedenen Werten.
// Seit 2026-08-19 kommt alles fertig aus `uebersichtLaden` (Anwendungsschicht).
//
// Der Monatsumschalter geht ausdrücklich nur nach HINTEN. Ein Budget in der Zukunft hat
// keinen Verbrauch, es gäbe also nichts zu zeigen — was kommt, steht in den Karten
// darüber. Er lädt auch nicht neu, sondern rechnet über `budgetstaende` einen anderen
// Monat aus denselben Daten.
//
// **Die Karte „Budgets" zeigt seit 2026-11-15 nur die monatlichen.** Die aufbauenden
// heissen in der Oberfläche Rücklagen und stehen in deren Bereich; in den Monatskarten
// zählen sie in der Zeile „Rücklagen", unter „Was da ist" als gebunden. Bis dahin standen
// sie hier als zweite Gruppe mit ihrer Fortschreibung (Übertrag, Rate, Verbrauch).
//
// **Der Abruf hat hier seit 2026-10-24 einen eigenen Knopf**, oben rechts im Kopf. Die
// Übersicht ist der Bereich, in dem man landet, und das Erste, was man nach dem Öffnen
// will, ist meist: holen, was seit dem letzten Mal passiert ist. Vorher lag der Knopf
// einen Bereich weiter, im Kontoauszug. Der Dialog ist derselbe; nach dem Abruf wird
// die ganze Übersicht neu gerechnet, weil jede Karte aus denselben Buchungen rechnet.

import { Auswahl } from "../bausteine/Auswahl";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  budgetzeilenZu,
  budgetstaende,
  toIso,
  type Abrufstand,
  type Depotdaten,
  type IstBuchung,
  type Uebersichtsdaten,
} from "../../../application";
import { abrufstand, depots, uebersicht } from "../../dienste";
import { Button, Card, CoverageTrack } from "../bausteine";
import { AbrufDialog } from "../bausteine/AbrufDialog";
import { BuchungDetail } from "../bausteine/BuchungDetail";
import { Buchungsliste } from "../bausteine/Buchungsliste";
import { AUFKLAPP_ZEILEN_SCHMAL } from "../bausteine/aufklappen";
import { DepotKarte } from "./DepotKarte";
import { EinrichtungKarte } from "./EinrichtungKarte";
import { ErgebnisKarten } from "./ErgebnisKarten";
import type { ScreenId } from "../bausteine/AppShell";
import { VorschauKarte } from "./VorschauKarte";
import { PageHead } from "../bausteine/PageHead";
import { VermoegenKarte } from "./VermoegenKarte";
import { geldFarbe } from "../bausteine/geldFarbe";
import { useGeld } from "../bausteine/einstellungenKontext";
import { Collapsible } from "@base-ui/react/collapsible";
import { fehlerMelden } from "../bausteine/Meldungen";
import { Stapel } from "../bausteine/Anordnung";
import { LeererZustand } from "../bausteine/LeererZustand";

function heuteIso(): string {
  const n = new Date();
  return toIso({ y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() });
}

/**
 * `onNavigate` ist freiwillig: die Übersicht führt nur aus der Einrichtungskarte hinaus,
 * und ohne Shell (Tests) stehen deren Schritte dann ohne Knopf da.
 */
export function UebersichtScreen({ onNavigate }: { onNavigate?: (id: ScreenId) => void } = {}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const heute = useMemo(heuteIso, []);
  const dieserMonat = heute.slice(0, 7);

  const [daten, setDaten] = useState<Uebersichtsdaten | null>(null);
  /**
   * Die Depots — getrennt geladen und getrennt gehalten.
   *
   * Nicht Teil von `Uebersichtsdaten`, weil sie mit dem Rest nichts zu tun haben: sie
   * gehen in keine Monatskarte ein, belasten kein Budget und zählen nicht zu den liquiden
   * Mitteln. Ein Fehler beim Laden nimmt der Übersicht deshalb auch nicht ihren Inhalt.
   */
  const [depotdaten, setDepotdaten] = useState<Depotdaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Welcher Monat in der Budget-Liste steht — Vorgabe ist der laufende. */
  const [monat, setMonat] = useState(dieserMonat);
  /** Welches Budget seine Buchungen zeigt — höchstens eines, sonst wird die Karte endlos. */
  const [offenesBudget, setOffenesBudget] = useState<string | null>(null);
  /**
   * Die Buchung, die gerade im Dialog steht.
   *
   * Der Weg dorthin führt über die aufgeklappten Listen: ein Budget zeigt seine Buchungen,
   * der Ausblick seine Posten — und genau dort SIEHT man, dass eine Zeile in der falschen
   * Kategorie hängt. Ohne den Dialog von hier aus musste man sie sich merken und im
   * Kontoauszug wiederfinden.
   */
  const [detail, setDetail] = useState<IstBuchung | null>(null);
  /**
   * Wie frisch die Bankdaten sind. Getrennt von `daten` geladen, aus demselben Grund wie
   * die Depots: ein Fehler hier nimmt der Übersicht nicht ihren Inhalt.
   */
  const [abruf, setAbruf] = useState<Abrufstand | null>(null);
  /** Offener Abruf-Dialog: `null` zu, sonst der vorgewählte Zugang ("" = der erste). */
  const [abrufOffen, setAbrufOffen] = useState<string | null>(null);

  async function laden() {
    try {
      const d = await uebersicht(heute);
      setDaten(d);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
    abrufstand(heute)
      .then(setAbruf)
      .catch((e) => { fehlerMelden(e); setAbruf(null); });
  }

  useEffect(() => {
    laden();
    depots()
      .then(setDepotdaten)
      .catch((e) => { fehlerMelden(e); setDepotdaten(null); });
  }, [heute]);

  /**
   * Die Budgetstände des GEWÄHLTEN Monats. Für den laufenden stehen sie schon in
   * `daten`; für einen vergangenen rechnet `budgetstaende` sie aus derselben Sicht neu —
   * dieselbe Regel, ohne zweiten Ladevorgang.
   *
   * Der Stichtag ist der LETZTE Tag des Monats, damit ein vergangener vollständig zählt;
   * gefenstert wird ohnehin auf den Monat.
   */
  const staende = useMemo(() => {
    if (!daten) return [];
    return monat === dieserMonat ? daten.staende : budgetstaende(daten.sicht, `${monat}-28`);
  }, [daten, monat, dieserMonat]);

  /** Seit Migration 81 ist jedes Budget monatlich; das frühere aufbauende ist eine Rücklage. */
  const monatliche = staende;

  return (
    <div className="screen">
      <PageHead
        title={t("uebersicht.titel")}
        subtitle={t("uebersicht.untertitel")}
        // Nur, wenn es einen Zugang gibt — ein Knopf, der nichts tun kann, ist eine Frage
        // an den Nutzer statt einer Antwort (dieselbe Regel wie im Kontoauszug).
        action={
          abruf?.hatZugang ? (
            <Button variant="primary" onClick={() => setAbrufOffen("")}>{t("konten.abrufen")}</Button>
          ) : undefined
        }
      />

      {fehler && <Card style={{ borderColor: "var(--warn)" }}>{t("uebersicht.fehlerDb")} ({fehler})</Card>}

      {daten && <EinrichtungKarte stand={daten.einrichtung} onNavigate={onNavigate} />}

      {/* Ganz am Anfang — keine Buchung und kein Plan — stand hier der Hinweis auf die
          fehlenden Plan-Daten. Der ist dann der zweite Schritt vor dem ersten: woraus die
          Karten überhaupt rechnen, sind die Buchungen. Mit Plan bleiben die Karten stehen,
          auch ohne Buchung — ihre Spalte „geplant" sagt dann schon etwas.
          Ohne eigenen Knopf: in diesem Zustand steht „Damit die Zahlen stimmen" immer
          direkt darüber (ohne Buchungen ist die Einrichtung nie fertig) und trägt ihn. */}
      {daten && !daten.hatBuchungen && !daten.hatPlandaten && (
        <Card subtitle={t("ergebnis.leerUntertitel")}>
          <LeererZustand>{t("uebersicht.leerOhneBuchungen")}</LeererZustand>
        </Card>
      )}

      {daten && (daten.hatBuchungen || daten.hatPlandaten) && (
        <ErgebnisKarten
          ergebnisse={daten.ergebnisse}
          hatPlandaten={daten.hatPlandaten}
          kategorieNamen={daten.kategorieNamen}
          empfaenger={daten.empfaenger}
          // Die Karte reicht nur die ID heraus; die Buchung selbst steht in der Sicht,
          // die dieser Bildschirm ohnehin schon geladen hat. Findet sich nichts, passiert
          // nichts — eine Zeile, deren Buchung inzwischen gelöscht ist, soll keinen leeren
          // Dialog öffnen.
          onBuchung={(istId) => {
            const b = daten.sicht.buchungen.find((x) => x.id === istId);
            if (b) setDetail(b);
          }}
        />
      )}

      {/* Zwei Paare, und die Aufteilung folgt der Frage, nicht der Optik.
          Oben, was den LAUFENDEN Monat betrifft: was in ihm noch da ist (Budgets) neben
          dem, was aus ihm noch abgeht (Vorschau) — dieselbe Zeitspanne, von zwei Seiten.
          Unten, was UNABHÄNGIG vom Monat gilt: der Depotstand neben den Ständen der
          Kontoklassen. Beides sind Bestände, beides geht in keine Monatskarte ein.
          Fehlt eine Karte, nimmt die andere die volle Breite — das erledigt `auto-fit`
          im Raster, ohne dass hier eine Bedingung stünde, die man beim nächsten Element
          wieder anpassen müsste. */}
      <div className="karten-paar">
      {daten && (
        <Card
          title={t("uebersicht.budgetsTitel")}
          subtitle={monat === dieserMonat ? t("uebersicht.budgetsLaufend") : t("uebersicht.budgetsVergangen")}
          action={
            monatliche.length > 0 ? (
              // `tabellenfilter`: der Wähler stellt ein, was die Karte darunter zeigt —
              // er ist ihr Filter und nicht ihr Inhalt (siehe app.css).
              <span className="tabellenfilter">
                <Auswahl
                  ariaLabel={t("uebersicht.monatWaehlen")}
                  wert={monat}
                  aufAenderung={setMonat}
                  optionen={daten.monate.map((m) => ({
                    wert: m,
                    text: m === dieserMonat ? t("uebersicht.monatDieser", { monat: m }) : m,
                  }))}
                />
              </span>
            ) : undefined
          }
        >
          {monatliche.length === 0 ? (
            <div className="muted">{t("uebersicht.budgetsLeer")}</div>
          ) : (
                  <Stapel abstand={4}>
              {monatliche.map((z) => {
                    const offen = offenesBudget === z.budget.id;
                    const name = z.kategorieName;
                    return (
                      <Collapsible.Root
                        key={z.budget.id}
                        open={offen}
                        onOpenChange={(auf) => setOffenesBudget(auf ? z.budget.id : null)}
                        style={{ paddingLeft: z.tiefe * 18 }}
                      >
                        {/* Die ganze Kopfzeile ist der Schalter: der Balken darunter gehört
                            zur selben Aussage, und ein eigener Pfeil-Knopf daneben wäre ein
                            zweites Ziel für dieselbe Geste. */}
                        <Collapsible.Trigger
                          nativeButton={false}
                          render={<div />}
                          aria-label={t("uebersicht.budgetAufklappen", { name })}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--sp-3)", marginBottom: 4, cursor: "pointer" }}
                        >
                          {/* Schmal wird es zuerst hier eng. Der NAME ist der einzige Teil, der
                              zurückweicht — Pille und Zahlen tragen Information, die ein
                              abgeschnittenes Wort nicht ersetzt. Ohne `minWidth: 0` schrumpft
                              ein Flex-Kind nicht unter seinen Inhalt und schiebt stattdessen
                              die rechte Spalte aus der Karte. */}
                          <span style={{ fontWeight: z.tiefe === 0 ? "var(--fw-bold)" : "var(--fw-semi)", display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, flex: "1 1 auto" }}>
                            {z.tiefe > 0 && <span style={{ color: "var(--ink-3)", flex: "0 0 auto" }}>└</span>}
                            <span style={{ color: "var(--ink-3)", flex: "0 0 auto" }}>{offen ? "▾" : "▸"}</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>{name}</span>
                            {/* Liegt eine Rücklage auf einer Unterkategorie, zählt ihr
                                Verbrauch hier nicht — und sie steht nicht in dieser Karte. */}
                            {z.abgezogen && <span className="muted" style={{ flex: "0 0 auto", fontWeight: "var(--fw-regular)", fontSize: "var(--fs-2xs)" }}>{t("budgets.ruecklageAbgezogen", { count: z.abgezogen.length, namen: z.abgezogen.join(", ") })}</span>}
                          </span>
                          {/* Rechts der Rest, daneben der Rahmen: „von 200" genügt, der
                              Rahmen IST der Monatsbetrag, es gibt nichts fortzuschreiben. */}
                          <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flex: "0 0 auto" }}>
                            <span className="num" style={{ fontSize: "var(--fs-sm)", whiteSpace: "nowrap" }}>
                              {z.monat.ohnePlan ? (
                                // In diesem Monat gab es für die Kategorie noch keinen Rahmen.
                                // Ein Rest von „−x von 0,00" läse sich als überzogen.
                                <span className="muted">{t(z.monat.verbraucht < 0 ? "budgets.verlaufOhnePlanZurueck" : "budgets.verlaufOhnePlan", { verbraucht: geld.formatMitSymbol(Math.abs(z.monat.verbraucht)) })}</span>
                              ) : (
                              <span style={{ fontWeight: "var(--fw-bold)", color: geldFarbe(z.rest) }}>
                                {geld.format(z.rest)}
                              </span>
                              )}
                              {!z.monat.ohnePlan && (
                                <span className="muted"> {t("uebersicht.vonRahmen", { rahmen: geld.formatMitSymbol(z.monat.verfuegbar) })}</span>
                              )}
                            </span>
                          </span>
                        </Collapsible.Trigger>
                        <CoverageTrack
                          name={name}
                          value={Math.max(0, z.monat.verbraucht)}
                          max={Math.max(1, z.monat.verfuegbar)}
                          over={!z.monat.ohnePlan && z.rest < 0}
                          label=""
                          right=""
                        />
                        <Collapsible.Panel>
                          <Buchungsliste
                            // Schmale Karte: sie steht neben einer zweiten, die beim
                            // Aufklappen mitwächst (siehe bausteine/aufklappen.ts).
                            sichtbar={AUFKLAPP_ZEILEN_SCHMAL}
                            zeilen={budgetzeilenZu(daten.sicht, z, daten.zeilenkontext)}
                            leer={t("uebersicht.budgetOhneBuchungen")}
                            onBuchung={setDetail}
                          />
                        </Collapsible.Panel>
                      </Collapsible.Root>
                    );
              })}
                  </Stapel>
          )}
        </Card>
      )}

      {daten && <VorschauKarte zeilen={daten.vorschau} kontoNamen={daten.kontoNamen} />}
      </div>

      <div className="karten-paar">
        {depotdaten && <DepotKarte daten={depotdaten} />}
        {daten && <VermoegenKarte klassen={daten.vermoegen} namen={daten.anspruchNamen} />}
      </div>

      {/* Nach einer Änderung wird die ganze Übersicht neu gerechnet, nicht nur die Zeile:
          eine geänderte Kategorie verschiebt Geld zwischen Budgets, und der Ausblick
          daneben rechnet aus denselben Buchungen. Eine Karte nachzuziehen und die andere
          stehenzulassen zeigte zwei Wahrheiten nebeneinander. */}
      {detail && (
        <BuchungDetail buchung={detail} onClose={() => setDetail(null)} onGeaendert={laden} />
      )}

      {abrufOffen !== null && (
        <AbrufDialog
          zugangId={abrufOffen || undefined}
          onClose={() => setAbrufOffen(null)}
          onFertig={() => void laden()}
        />
      )}
    </div>
  );
}
