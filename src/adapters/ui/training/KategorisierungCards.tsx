// Die automatische Kategorisierung — vier Karten entlang des Ablaufs, den ein Training
// tatsächlich hat: Daten sichten, Wörter beurteilen, trainieren und prüfen, Bestand
// abgleichen.
//
// Vier statt einer, weil das die Reihenfolge ist, in der man die Fragen stellt. Eine
// einzige Karte mit allem drin zeigte das Ergebnis oben und seine Grundlage unten — also
// rückwärts — und war so lang, dass man den Anfang nicht mehr sah.
//
// **Es waren einmal fünf.** „Merkmale" und „Ausschlüsse" lagen getrennt, und das war der
// Schnitt an der falschen Stelle: dieselben Wörter, zweimal gezeigt, mit verschiedenen
// Spalten — wer eines abwählte, sah es hier verschwinden und musste es dort
// wiederfinden. Sie sind zu „Wörter" verschmolzen, und ein Ausschluss wechselt jetzt den
// Zustand einer Zeile, statt sie an einen anderen Ort zu verschieben.
//
// Geladen wird gemeinsam und erst beim Betreten des Bereichs: die Auswertung zieht den
// gesamten Ledger und rechnet die Merkmale darüber. Je Karte getrennt zu laden wäre
// dieselbe Arbeit mehrfach.

import { useProzent } from "../bausteine/einstellungenKontext";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  MERKMALSHERKUENFTE,
  kategorieprofile,
  verwechslungsmatrix,
  wortVon,
  type Bewertung,
  type Kategorie,
  type Kategorieprofil,
  type Matrixzeile,
  type Merkmalsherkunft,
} from "../../../application";
import {
  type Ausschlussgrund,
  type Materialbefund,
} from "../../../application/kategorien/trainingsmaterial";
import {
  bestandszahlen,
  merkmalsbestand,
  type Wortzeile,
  type Wortzustand,
} from "../../../application/kategorien/merkmalsbestand";
import {
  type Modellzustand,
} from "../../../application/kategorien/klassifikatorTraining";
import {
  charakterWechsel,
  uebergaenge,
  type Abgleichsplan,
} from "../../../application/kategorien/kategorieAbgleich";
import type { Wirkung } from "../../../application/kategorien/merkmalskonfiguration";
import {
  herkunftUmschalten,
  kategorieAbgleichAnwenden,
  kategorieAbgleichVorschau,
  merkmalskonfiguration,
  merkmalswirkung,
  modellStand,
  modellTrainieren,
  trainingsdaten,
  grundausstattungZurueck,
  wortFreigeben,
  wortSperren,
} from "../../dienste";
import type { GespeicherterAusschluss } from "../../../application/ports";
import { Button, Card, DataTable, FormField, KPIStat, Pill } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Bereich } from "../bausteine/Bereich";
import { useGeld, fehlerNachricht } from "../bausteine/einstellungenKontext";

/** Alles, was die vier Karten gemeinsam brauchen. */
interface Daten {
  readonly material: Materialbefund;
  readonly zustand: Modellzustand;
  readonly herkuenfte: readonly Merkmalsherkunft[];
  readonly ausschluesse: readonly GespeicherterAusschluss[];
}

export function KategorisierungCards({ kategorien }: { kategorien: Kategorie[] }) {
  const { t } = useTranslation();
  const prozent = useProzent();
  const { locale } = useGeld();
  const [daten, setDaten] = useState<Daten | null>(null);
  const [angefordert, setAngefordert] = useState(false);
  const [laeuft, setLaeuft] = useState<"training" | "wirkung" | "abgleich" | "anwenden" | null>(null);
  // Der gerechnete, noch NICHT geschriebene Abgleich. Rechnen und Schreiben sind hier
  // getrennt: der Lauf ändert die Zahl, die in jedem Budget steht.
  const [plan, setPlan] = useState<Abgleichsplan | null>(null);
  const [angewendet, setAngewendet] = useState<number | null>(null);
  const [bewertung, setBewertung] = useState<Bewertung | null>(null);
  const [wirkung, setWirkung] = useState<{ basis: number; wirkungen: Wirkung[] } | null>(null);
  const [listenGeaendert, setListenGeaendert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  /**
   * Lädt Konfiguration, Material und Modellzustand — in dieser Reihenfolge, weil das
   * Material von der Konfiguration abhängt: welche Merkmale entstehen, entscheidet sie.
   * Material und Zustand danach zusammen, damit die Karten nicht kurz gegen einen halb
   * gefüllten Stand rechnen.
   */
  async function laden() {
    const stand = await merkmalskonfiguration();
    const [material, zustand] = await Promise.all([
      trainingsdaten(stand.konfiguration),
      modellStand(stand.konfiguration),
    ]);
    setDaten({
      material,
      zustand,
      herkuenfte: stand.konfiguration.herkuenfte,
      ausschluesse: stand.ausschluesse,
    });
  }

  // Geladen wird beim Betreten des Bereichs, nicht beim Aufklappen einer Karte: die
  // Komponente entsteht erst, wenn jemand „Training" wählt. Die Trainingsdaten ziehen den
  // gesamten Ledger und rechnen die Merkmale darüber — dass das nicht nebenbei beim
  // Öffnen der Einstellungen passiert, war schon der Grund für das verzögerte Aufklappen.
  useEffect(() => {
    if (angefordert) return;
    setAngefordert(true);
    laden().catch((e) => setFehler(fehlerNachricht(t, e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Nach jeder Listenänderung: neu rechnen und merken, dass das Modell hinterherhinkt. */
  async function nachAenderung(aktion: Promise<unknown>) {
    setFehler(null);
    try {
      await aktion;
      // Die gemessene Wirkung galt für die alten Listen — sie stehen zu lassen hieße,
      // eine Zahl zu zeigen, die zu den Daten daneben nicht mehr passt.
      setWirkung(null);
      setListenGeaendert(true);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  async function trainingStarten() {
    if (laeuft || !daten) return;
    setLaeuft("training");
    setFehler(null);
    try {
      const r = await modellTrainieren({ herkuenfte: daten.herkuenfte, ausschluesse: daten.ausschluesse });
      setBewertung(r.bewertung ?? null);
      setListenGeaendert(false);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(null);
    }
  }

  async function wirkungStarten() {
    if (laeuft || !daten) return;
    setLaeuft("wirkung");
    setFehler(null);
    try {
      setWirkung(await merkmalswirkung({ herkuenfte: daten.herkuenfte, ausschluesse: daten.ausschluesse }));
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(null);
    }
  }

  async function vorschauRechnen() {
    if (laeuft) return;
    setLaeuft("abgleich");
    setFehler(null);
    setAngewendet(null);
    try {
      setPlan(await kategorieAbgleichVorschau());
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(null);
    }
  }

  async function planUebernehmen() {
    if (laeuft || !plan) return;
    setLaeuft("anwenden");
    setFehler(null);
    try {
      setAngewendet(await kategorieAbgleichAnwenden(plan));
      // Der Plan ist verbraucht: stehen zu lassen hieße, einen Knopf anzubieten, der
      // dieselbe Arbeit ein zweites Mal verspricht.
      setPlan(null);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setLaeuft(null);
    }
  }

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  const hilfe = {
    t,
    daten,
    kategorieName,
    zahl: (n: number) => n.toLocaleString(locale),
    prozent: (x: number) => prozent(x, 1),
  };

  return (
    <Bereich
      titel={t("shell.navTraining")}
      register={[
        {
          id: "daten",
          label: t("einstellungen.lernmaterial.datenTitel"),
          untertitel: t("einstellungen.lernmaterial.datenUntertitel"),
          inhalt: () => (
            <Card>
              {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
              <DatenInhalt {...hilfe} />
            </Card>
          ),
        },
        {
          id: "woerter",
          label: t("einstellungen.lernmaterial.woerterTitel"),
          untertitel: t("einstellungen.lernmaterial.woerterUntertitel"),
          inhalt: () => (
            <Card>
              {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
              <WoerterInhalt
                {...hilfe}
                wirkung={wirkung}
                misst={laeuft === "wirkung"}
                aufWirkung={wirkungStarten}
                aufSchalten={(h, aktiv) => nachAenderung(herkunftUmschalten(h, aktiv))}
                aufAusschliessen={(wort, herkuenfte) =>
                  nachAenderung(wortSperren(wort, herkuenfte))
                }
                aufZulassen={(wort) => nachAenderung(wortFreigeben(wort))}
                aufGrundausstattung={() => nachAenderung(grundausstattungZurueck())}
              />
            </Card>
          ),
        },
        {
          id: "modell",
          label: t("einstellungen.lernmaterial.modellKarteTitel"),
          untertitel: t("einstellungen.lernmaterial.modellKarteUntertitel"),
          inhalt: () => (
            <Card>
              {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
              <ModellInhalt
                {...hilfe}
                bewertung={bewertung}
                trainiert={laeuft === "training"}
                listenGeaendert={listenGeaendert}
                aufTraining={trainingStarten}
              />
            </Card>
          ),
        },
        {
          id: "abgleich",
          label: t("einstellungen.abgleich.titel"),
          untertitel: t("einstellungen.abgleich.untertitel"),
          inhalt: () => (
            <Card>
              {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
              <AbgleichInhalt
                {...hilfe}
                plan={plan}
                angewendet={angewendet}
                rechnet={laeuft === "abgleich"}
                schreibt={laeuft === "anwenden"}
                aufVorschau={vorschauRechnen}
                aufUebernehmen={planUebernehmen}
              />
            </Card>
          ),
        },
      ]}
    />
  );
}

// ------------------------------------------------------------ 5 · Bestand abgleichen

/**
 * Der rückwirkende Abgleich: erst rechnen, zeigen, dann auf Bestätigung schreiben.
 *
 * Bewusst OHNE `beiOeffnen`-Nachladen: die anderen vier Karten zeigen Zustand, diese
 * verändert ihn. Ein Lauf über den ganzen Bestand soll starten, weil jemand ihn startet —
 * nicht, weil jemand eine Karte aufgeklappt hat.
 */
function AbgleichInhalt({
  t, kategorieName, zahl, plan, angewendet, rechnet, schreibt, aufVorschau, aufUebernehmen,
}: Hilfe & {
  plan: Abgleichsplan | null;
  angewendet: number | null;
  rechnet: boolean;
  schreibt: boolean;
  aufVorschau: () => void;
  aufUebernehmen: () => void;
}) {
  const name = (id?: string) => (id ? kategorieName.get(id) ?? id : t("einstellungen.abgleich.ohneKategorie"));
  const gruppen = plan ? uebergaenge(plan) : [];
  const charakter = plan ? charakterWechsel(plan) : [];

  return (
    <>
      <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
        {t("einstellungen.abgleich.hinweis")}
      </div>

      <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", flexWrap: "wrap" }}>
        <Button onClick={rechnet ? undefined : aufVorschau}>
          {rechnet ? t("einstellungen.abgleich.rechnet") : t("einstellungen.abgleich.vorschau")}
        </Button>
        {angewendet !== null && (
          <span className="muted">{t("einstellungen.abgleich.fertig", { anzahl: zahl(angewendet) })}</span>
        )}
      </div>

      {plan && plan.setzen.length === 0 && (
        <div className="muted" style={{ marginTop: "var(--sp-4)" }}>
          {t("einstellungen.abgleich.nichtsZuTun", { unveraendert: zahl(plan.unveraendert) })}
        </div>
      )}

      {plan && plan.setzen.length > 0 && (
        <>
          <div style={{ display: "flex", gap: "var(--sp-6)", flexWrap: "wrap", marginTop: "var(--sp-4)" }}>
            <KPIStat
              size="tile"
              tone="warn"
              label={t("einstellungen.abgleich.aenderungen")}
              value={zahl(plan.setzen.length)}
              meta={t("einstellungen.abgleich.aenderungenMeta", { gruppen: gruppen.length })}
            />
            <KPIStat
              size="tile"
              label={t("einstellungen.abgleich.unveraendert")}
              value={zahl(plan.unveraendert)}
              meta={t("einstellungen.abgleich.unveraendertMeta")}
            />
          </div>

          <Abschnitt titel={t("einstellungen.abgleich.uebergaengeTitel")}>
            <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
              {t("einstellungen.abgleich.uebergaengeHinweis")}
            </div>
            {gruppen.map((g) => (
              <div key={`${g.vonKategorieId ?? ""}-${g.nachKategorieId}`} style={{ marginBottom: "var(--sp-3)" }}>
                <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "var(--fw-bold)", minWidth: "5ch", textAlign: "right" }}>
                    {zahl(g.anzahl)} ×
                  </span>
                  <span>{name(g.vonKategorieId)}</span>
                  <span className="muted">→</span>
                  <span style={{ fontWeight: "var(--fw-semi)" }}>{name(g.nachKategorieId)}</span>
                </div>
                <div className="muted" style={{ fontSize: "var(--fs-xs)", marginLeft: "6ch" }}>
                  {g.beispiele.map((b) => b.gegenpartei || t("einstellungen.abgleich.ohneEmpfaenger")).join(" · ")}
                  {g.anzahl > g.beispiele.length && " …"}
                </div>
              </div>
            ))}
          </Abschnitt>

          {charakter.length > 0 && (
            <Abschnitt titel={t("einstellungen.abgleich.charakterTitel")}>
              <div className="muted" style={{ marginBottom: "var(--sp-2)" }}>
                {t("einstellungen.abgleich.charakterHinweis", { anzahl: zahl(charakter.length) })}
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                {charakter.slice(0, 10).map((w) => (
                  <div key={w.istbuchungId} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                    <span>{w.gegenpartei || t("einstellungen.abgleich.ohneEmpfaenger")}</span>
                    <Pill>{t(`charakter.${w.vonCharakter}`)}</Pill>
                    <span className="muted">→</span>
                    <Pill variant="warn">{t(`charakter.${w.charakter}`)}</Pill>
                    <span className="muted">{name(w.nachKategorieId)}</span>
                  </div>
                ))}
              </div>
            </Abschnitt>
          )}

          <Abschnitt titel={t("einstellungen.abgleich.uebersprungenTitel")}>
            <div style={{ display: "grid", gap: 4 }}>
              {(["handverlesen", "umschichtung", "ohneVorschlag"] as const).map((grund) => (
                <div key={grund} style={{ display: "flex", gap: "var(--sp-3)", alignItems: "baseline" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "5ch", textAlign: "right" }}>
                    {zahl(plan.uebersprungen[grund])}
                  </span>
                  <span className="muted">{t(`einstellungen.abgleich.uebersprungen.${grund}`)}</span>
                </div>
              ))}
            </div>
          </Abschnitt>

          <div style={{ marginTop: "var(--sp-4)" }}>
            <Button variant="primary" onClick={schreibt ? undefined : aufUebernehmen}>
              {schreibt
                ? t("einstellungen.abgleich.schreibt")
                : t("einstellungen.abgleich.uebernehmen", { anzahl: zahl(plan.setzen.length) })}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/** Was alle Inhalts-Komponenten gemeinsam bekommen. */
interface Hilfe {
  t: (key: string, options?: Record<string, unknown>) => string;
  daten: Daten | null;
  kategorieName: Map<string, string>;
  zahl: (n: number) => string;
  prozent: (x: number) => string;
}

// ---------------------------------------------------------------- 1 · Trainingsdaten

function DatenInhalt({ t, daten, kategorieName, zahl }: Hilfe) {
  if (!daten) return <div className="muted">…</div>;
  const { material } = daten;
  if (material.gesamt === 0) return <div className="muted">{t("einstellungen.lernmaterial.leer")}</div>;

  const ausgeschlossen = (Object.entries(material.ausgeschlossen) as [Ausschlussgrund, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div style={{ display: "flex", gap: "var(--sp-6)", flexWrap: "wrap" }}>
        <KPIStat
          size="tile"
          label={t("einstellungen.lernmaterial.brauchbar")}
          value={zahl(material.beispiele.length)}
          meta={t("einstellungen.lernmaterial.brauchbarMeta", { gesamt: zahl(material.gesamt) })}
        />
        <KPIStat
          size="tile"
          label={t("einstellungen.lernmaterial.kategorien")}
          value={zahl(material.kategorien)}
          meta={t("einstellungen.lernmaterial.kategorienMeta", { duenn: material.duenneKategorien.length })}
          tone={material.duenneKategorien.length > 0 ? "warn" : "default"}
        />
        <KPIStat
          size="tile"
          label={t("einstellungen.lernmaterial.vokabular")}
          value={zahl(material.vokabular.groesse)}
          meta={t("einstellungen.lernmaterial.vokabularMeta", { einmalige: zahl(material.vokabular.einmalige) })}
        />
      </div>

      {material.beispiele.length === 0 && (
        <div className="muted" style={{ marginTop: "var(--sp-4)" }}>
          {t("einstellungen.lernmaterial.keineBeispiele")}
        </div>
      )}

      {ausgeschlossen.length > 0 && (
        <Abschnitt titel={t("einstellungen.lernmaterial.ausgeschlossenTitel")}>
          {ausgeschlossen.map(([grund, n]) => (
            <div key={grund} style={{ display: "flex", gap: "var(--sp-3)", alignItems: "baseline" }}>
              <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "4ch", textAlign: "right" }}>{zahl(n)}</span>
              <span className="muted">{t(`einstellungen.lernmaterial.grund.${grund}`)}</span>
            </div>
          ))}
        </Abschnitt>
      )}

      {material.duenneKategorien.length > 0 && (
        <Abschnitt titel={t("einstellungen.lernmaterial.duenneTitel")}>
          <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            {t("einstellungen.lernmaterial.duenneHinweis")}
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            {material.duenneKategorien.map((d) => (
              <Pill key={d.kategorieId} variant="warn">
                {kategorieName.get(d.kategorieId) ?? d.kategorieId} · {d.anzahl}
              </Pill>
            ))}
          </div>
        </Abschnitt>
      )}
    </>
  );
}

// ------------------------------------------------------------------- 2 · Wörter

/**
 * Der Wortbestand — eine Liste statt zweier Karten.
 *
 * Vorher standen die häufigsten Merkmale auf der einen und die Ausschlüsse auf der
 * anderen. Wer ein Wort abwählte, sah es hier verschwinden und musste es dort
 * wiederfinden: andere Karte, andere Sortierung, andere Spalten — und ohne die Zahlen,
 * an denen er es gerade beurteilt hatte. Jetzt wechselt die Zeile ihren Zustand und
 * bleibt, wo sie ist.
 *
 * Die Kappung bei fünfundzwanzig ist mit derselben Bewegung weg. Sie war der Grund, aus
 * dem sich nur ein Bruchteil überhaupt bearbeiten liess — und ein Werkzeug, das nur die
 * Spitze zeigt, führt zur Pflege der Spitze.
 */
function WoerterInhalt({
  t, daten, kategorieName, zahl, prozent, wirkung, misst,
  aufWirkung, aufSchalten, aufAusschliessen, aufZulassen, aufGrundausstattung,
}: Hilfe & {
  wirkung: { basis: number; wirkungen: Wirkung[] } | null;
  misst: boolean;
  aufWirkung: () => void;
  aufSchalten: (h: Merkmalsherkunft, aktiv: boolean) => void;
  aufAusschliessen: (wort: string, herkuenfte?: readonly Merkmalsherkunft[]) => void;
  aufZulassen: (wort: string) => void;
  aufGrundausstattung: () => void;
}) {
  const feinerProzent = useProzent();
  const [suche, setSuche] = useState("");
  const [zustandFilter, setZustandFilter] = useState<Wortzustand | "">("");
  const [herkunftFilter, setHerkunftFilter] = useState<Merkmalsherkunft | "">("");
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  /**
   * Ob die mitgelieferte Grundausstattung mit in der Liste steht. Voreinstellung: NEIN.
   *
   * Über hundert Stoppwörter, die niemand gesetzt hat, füllen sonst jede Seite und
   * schieben die eigenen Entscheidungen nach hinten — genau das machte den Eindruck, ein
   * frisch gesperrtes Wort sei „verschwunden". Sichtbar bleiben sie trotzdem auf Wunsch:
   * ein Eintrag, den man nicht sieht, ist einer, den man nie wieder aufräumt.
   */
  const [mitStandard, setMitStandard] = useState(false);
  const [neu, setNeu] = useState("");
  const [nurIn, setNurIn] = useState<Merkmalsherkunft | "">("");

  const alle = useMemo(
    () => (daten ? merkmalsbestand(daten.material, daten.ausschluesse) : []),
    [daten],
  );
  const zahlen = useMemo(() => bestandszahlen(alle), [alle]);

  // Die Wolken kommen aus dem MODELL, nicht aus der Häufigkeitsverteilung: die sagt, wo
  // ein Wort vorkam, das Gewicht sagt, was die Erkennung daraus gemacht hat. Ohne
  // trainiertes Modell gibt es sie deshalb nicht — und das ist ehrlicher als eine Wolke
  // aus Häufigkeiten, die aussähe wie eine Auskunft über die Erkennung.
  const profile = useMemo(
    () => (daten?.zustand.stand ? kategorieprofile(daten.zustand.stand.modell) : []),
    [daten],
  );

  const sichtbar = useMemo(() => {
    const suchbegriff = suche.trim().toLowerCase();
    return alle.filter(
      (z) =>
        // Ein mitgeliefertes Wort, das im Bestand VORKOMMT, bleibt immer sichtbar: es
        // wirkt auf die eigenen Daten, und das ist eine Entscheidung wie jede andere.
        // Ausgeblendet wird nur, was nichts tut — der grosse Rest der Grundausstattung.
        (mitStandard || z.quelle !== "standard" || z.belege > 0) &&
        (!zustandFilter || z.zustand === zustandFilter) &&
        (!herkunftFilter || z.herkunft === herkunftFilter) &&
        (!suchbegriff || z.anzeige.includes(suchbegriff) || z.wort.includes(suchbegriff)),
    );
  }, [alle, suche, zustandFilter, herkunftFilter, mitStandard]);

  // Bezugsgröße für den Balken: das Maximum der GEZEIGTEN Zeilen, nicht des Bestands.
  // Wer auf eine Herkunft filtert, will die dort vergleichen — an einem bestandsweiten
  // Maximum lägen alle Balken beieinander und die Spalte sagte nichts mehr.
  const maxTrennkraft = useMemo(
    () => sichtbar.reduce((m, z) => Math.max(m, z.trennkraft), 0),
    [sichtbar],
  );

  const zeile = gewaehlt ? sichtbar.find((z) => z.schluessel === gewaehlt) ?? null : null;

  if (!daten) return <div className="muted">…</div>;
  const aktiv = new Set(daten.herkuenfte);
  const wirkungJe = new Map(wirkung?.wirkungen.map((w) => [w.herkunft, w]));

  function hinzufuegen() {
    const wort = neu.trim();
    if (!wort) return;
    aufAusschliessen(wort, nurIn ? [nurIn] : undefined);
    setNeu("");
    // Und die Liste springt darauf. Ein Wort, das im Bestand nicht vorkommt, sortiert
    // ans Ende — es wäre eingetragen und nirgends zu sehen. Genau dieser Bruch war der
    // Grund, aus dem der frühere Ausschluss „verschwunden" wirkte: nicht weil er fehlte,
    // sondern weil ihn niemand fand.
    setSuche(wort.toLowerCase());
    setZustandFilter("");
    setHerkunftFilter("");
    setMitStandard(true);
  }

  return (
    <>
      <div style={{ display: "grid", gap: "var(--sp-3)" }}>
        {MERKMALSHERKUENFTE.map((h) => {
          const w = wirkungJe.get(h);
          return (
            <label
              key={h}
              style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-start", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={aktiv.has(h)}
                onChange={(e) => aufSchalten(h, e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ fontWeight: "var(--fw-bold)" }}>{t(`einstellungen.lernmaterial.herkunft.${h}`)}</span>
                {!aktiv.has(h) && <> · <span className="muted">{t("einstellungen.lernmaterial.herkunftAus")}</span></>}
                {w && (
                  <>
                    {" · "}
                    <span style={{ color: w.abstand < -0.2 ? "var(--warn-deep)" : "var(--ink-3)" }}>
                      {w.abstand >= -0.2 && w.abstand <= 0.2
                        ? t("einstellungen.lernmaterial.wirkungEgal")
                        : t("einstellungen.lernmaterial.wirkungKostet", {
                            wert: prozent(w.genauigkeit),
                            abstand: `${w.abstand >= 0 ? "+" : "−"}${Math.abs(w.abstand).toFixed(2)}`,
                          })}
                    </span>
                  </>
                )}
                <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {t(`einstellungen.lernmaterial.herkunftHinweis.${h}`)}
                </div>
              </span>
            </label>
          );
        })}
      </div>

      <Abschnitt
        titel={t("einstellungen.lernmaterial.wirkungMessen")}
        neben={
          <Button onClick={aufWirkung}>
            {misst ? t("einstellungen.lernmaterial.wirkungLaeuft") : t("einstellungen.lernmaterial.wirkungMessen")}
          </Button>
        }
      >
        <div className="muted">{t("einstellungen.lernmaterial.wirkungHinweis")}</div>
        {wirkung && (
          <div style={{ marginTop: "var(--sp-2)", fontWeight: "var(--fw-bold)" }}>
            {t("einstellungen.lernmaterial.wirkungBasis", { wert: prozent(wirkung.basis) })}
          </div>
        )}
      </Abschnitt>

      <Abschnitt titel={t("einstellungen.lernmaterial.bestandTitel")}>
        <div style={{ display: "flex", gap: "var(--sp-6)", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
          <KPIStat
            size="tile"
            label={t("einstellungen.lernmaterial.zustand.genutzt")}
            value={zahl(zahlen.genutzt)}
            meta={t("einstellungen.lernmaterial.zustandMeta.genutzt")}
          />
          <KPIStat
            size="tile"
            label={t("einstellungen.lernmaterial.zustand.gesperrt")}
            value={zahl(zahlen.gesperrt)}
            meta={t("einstellungen.lernmaterial.zustandMeta.gesperrt")}
          />
          <KPIStat
            size="tile"
            label={t("einstellungen.lernmaterial.zustand.strukturell")}
            value={zahl(zahlen.strukturell)}
            meta={t("einstellungen.lernmaterial.zustandMeta.strukturell")}
          />
        </div>

        <div className="muted" style={{ marginBottom: "var(--sp-2)" }}>
          {t("einstellungen.lernmaterial.bestandHinweis")}
        </div>
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-3)" }}>
          {t("einstellungen.lernmaterial.masseHinweis")}
        </div>

        <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
          <FormField label={t("einstellungen.lernmaterial.suche")}>
            <input
              className="field"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder={t("einstellungen.lernmaterial.suchePlatzhalter")}
            />
          </FormField>
          <FormField label={t("einstellungen.lernmaterial.spalteZustand")}>
            <Auswahl
              ariaLabel={t("einstellungen.lernmaterial.spalteZustand")}
              wert={zustandFilter}
              aufAenderung={(v) => setZustandFilter(v as Wortzustand | "")}
              optionen={[
                { wert: "", text: t("einstellungen.lernmaterial.filterAlle") },
                ...(["genutzt", "gesperrt", "strukturell"] as const).map((z) => ({
                  wert: z,
                  text: t(`einstellungen.lernmaterial.zustand.${z}`),
                })),
              ]}
            />
          </FormField>
          <FormField label={t("einstellungen.lernmaterial.spalteGeltung")}>
            <Auswahl
              ariaLabel={t("einstellungen.lernmaterial.spalteGeltung")}
              wert={herkunftFilter}
              aufAenderung={(v) => setHerkunftFilter(v as Merkmalsherkunft | "")}
              optionen={[
                { wert: "", text: t("einstellungen.lernmaterial.filterAlle") },
                ...MERKMALSHERKUENFTE.map((h) => ({
                  wert: h,
                  text: t(`einstellungen.lernmaterial.herkunft.${h}`),
                })),
              ]}
            />
          </FormField>
          <label style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", paddingBottom: "var(--sp-2)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={mitStandard}
              onChange={(e) => setMitStandard(e.target.checked)}
            />
            <span>{t("einstellungen.lernmaterial.mitStandard")}</span>
          </label>
          <span className="muted" style={{ paddingBottom: "var(--sp-2)" }}>
            {t("einstellungen.lernmaterial.bestandZahl", {
              gezeigt: zahl(sichtbar.length),
              gesamt: zahl(alle.length),
            })}
          </span>
        </div>

        {sichtbar.length === 0 ? (
          <div className="muted">{t("einstellungen.lernmaterial.keineTreffer")}</div>
        ) : (
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
            <DataTable
              sortable
              pageSize={20}
              onRowClick={(r) => setGewaehlt(r.schluessel === gewaehlt ? null : r.schluessel)}
              istAktiv={(r) => r.schluessel === gewaehlt}
              columns={[
                {
                  key: "anzeige",
                  label: t("einstellungen.lernmaterial.spalteWort"),
                  // Die Herkunft steht als grauer Zusatz DANEBEN statt in einer eigenen
                  // Spalte: sie ist kurz, gehört zum Wort, und die Liste hatte zehn
                  // Spalten — zu viele, um eine Zeile noch auf einen Blick zu lesen.
                  // Sortieren muss man danach nicht, dafür gibt es den Filter.
                  //
                  // Weicht die Listenform ab, gehört auch sie daneben: an ihr hängt das
                  // Sperren, und ohne sie ist nicht zu sehen, warum ein Ausschluss auf
                  // ein Wort wirkt, das anders geschrieben dasteht.
                  render: (r) => (
                    <span>
                      {r.anzeige}
                      {r.wort !== r.anzeige && <span className="muted"> → {r.wort}</span>}
                      {r.herkunft && (
                        <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                          {" "}· {t(`einstellungen.lernmaterial.herkunft.${r.herkunft}`)}
                        </span>
                      )}
                    </span>
                  ),
                },
                {
                  key: "zustand",
                  label: t("einstellungen.lernmaterial.spalteZustand"),
                  render: (r) => (
                    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                      <Pill variant={r.zustand === "genutzt" ? "ok" : r.zustand === "gesperrt" ? "warn" : "neutral"}>
                        {t(`einstellungen.lernmaterial.zustand.${r.zustand}`)}
                      </Pill>
                      {/* Woher der Ausschluss kommt, steht nur bei gesperrten Zeilen —
                          bei allen anderen wäre die Spalte eine leere Behauptung. Die
                          mitgelieferten sind eine Grundausstattung und dürfen weg; das
                          sieht man ihnen nur an, wenn es danebensteht. */}
                      {r.quelle && (
                        <Pill variant={r.quelle === "manuell" ? "plan" : "neutral"}>
                          {t(`einstellungen.lernmaterial.quelle${r.quelle === "manuell" ? "Manuell" : "Standard"}`)}
                        </Pill>
                      )}
                    </span>
                  ),
                },
                {
                  key: "belege",
                  label: t("einstellungen.lernmaterial.spalteAnzahl"),
                  align: "right",
                  render: (r) => zahl(r.belege),
                },
                {
                  key: "kategorien",
                  label: t("einstellungen.lernmaterial.spalteKategorien"),
                  align: "right",
                  render: (r) => (r.kategorien ? zahl(r.kategorien) : "—"),
                },
                {
                  key: "trennkraft",
                  label: t("einstellungen.lernmaterial.spalteTrennkraft"),
                  align: "right",
                  render: (r) =>
                    r.belege && r.kategorien ? (
                      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span>{feinerProzent(r.trennkraft, 2)}</span>
                        {/* Der Balken misst gegen die stärkste GEZEIGTE Zeile: die
                            absoluten Werte sind klein, die Reihenfolge ist die Aussage. */}
                        <span style={{ display: "block", width: 48, height: 3, background: "var(--surface-2)" }}>
                          <span
                            style={{
                              display: "block",
                              height: 3,
                              width: `${maxTrennkraft > 0 ? Math.round((r.trennkraft / maxTrennkraft) * 100) : 0}%`,
                              background: "var(--ok-deep)",
                            }}
                          />
                        </span>
                      </span>
                    ) : (
                      "—"
                    ),
                },
                {
                  key: "haeufigsteKategorieId",
                  label: t("einstellungen.lernmaterial.spalteFuer"),
                  render: (r) =>
                    r.haeufigsteKategorieId
                      ? kategorieName.get(r.haeufigsteKategorieId) ?? r.haeufigsteKategorieId
                      : "—",
                },
                {
                  key: "_x",
                  label: "",
                  align: "right",
                  sortable: false,
                  render: (r) =>
                    r.zustand === "gesperrt" ? (
                      <button className="linkbtn" onClick={(e) => { e.stopPropagation(); aufZulassen(r.wort); }}>
                        {t("einstellungen.lernmaterial.zulassen")}
                      </button>
                    ) : r.zustand === "genutzt" ? (
                      <button
                        className="linkbtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          aufAusschliessen(r.wort, r.herkunft ? [r.herkunft] : undefined);
                        }}
                      >
                        {t("einstellungen.lernmaterial.ausschliessen")}
                      </button>
                    ) : (
                      // Strukturell aussortiert — dafür gibt es keinen Listeneintrag,
                      // den man entfernen könnte.
                      <span className="muted">—</span>
                    ),
                },
              ]}
              rows={sichtbar.map((z) => ({ ...z }))}
            />
          </div>
        )}

        {zeile && <Wortdetail zeile={zeile} t={t} kategorieName={kategorieName} zahl={zahl} prozent={prozent} />}
      </Abschnitt>

      <Abschnitt titel={t("einstellungen.lernmaterial.wolkenTitel")}>
        <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
          {profile.length === 0
            ? t("einstellungen.lernmaterial.wolkenOhneModell")
            : t("einstellungen.lernmaterial.wolkenHinweis")}
        </div>
        {profile.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "var(--sp-4)",
            }}
          >
            {profile.map((p) => (
              <Wortwolke
                key={p.kategorieId}
                profil={p}
                name={kategorieName.get(p.kategorieId) ?? p.kategorieId}
                leer={t("einstellungen.lernmaterial.wolkeLeer")}
                aufWort={(merkmal) => {
                  // Der Weg zurück in die Liste: dort steht, was das Wort im Bestand
                  // anrichtet. Wolke und Liste zeigen dasselbe Wort von zwei Seiten —
                  // ohne diesen Sprung wären es wieder zwei getrennte Werkzeuge.
                  setSuche(wortVon(merkmal));
                  setZustandFilter("");
                  setHerkunftFilter("");
                  setMitStandard(true);
                }}
              />
            ))}
          </div>
        )}
      </Abschnitt>

      <Abschnitt titel={t("einstellungen.lernmaterial.neuesWort")}>
        <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
          {t("einstellungen.lernmaterial.neuesWortHinweis")}
        </div>
        <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <FormField label={t("einstellungen.lernmaterial.neuesWort")}>
            <input
              className="field"
              value={neu}
              onChange={(e) => setNeu(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && hinzufuegen()}
              placeholder={t("einstellungen.lernmaterial.neuesWortPlatzhalter")}
            />
          </FormField>
          <FormField label={t("einstellungen.lernmaterial.nurIn")}>
            <Auswahl
              ariaLabel={t("einstellungen.lernmaterial.nurIn")}
              wert={nurIn}
              aufAenderung={(v) => setNurIn(v as Merkmalsherkunft | "")}
              optionen={[
                { wert: "", text: t("einstellungen.lernmaterial.ueberall") },
                ...MERKMALSHERKUENFTE.map((h) => ({ wert: h, text: t(`einstellungen.lernmaterial.herkunft.${h}`) })),
              ]}
            />
          </FormField>
          {/* Eigenes Wort statt „ausschließen": derselbe Text stünde sonst zweimal
              auf der Seite — hier für das Feld daneben, in jeder Tabellenzeile für die
              Zeile. Zwei Knöpfe mit einem Namen, die Verschiedenes nehmen. */}
          <Button variant="primary" plus onClick={hinzufuegen}>
            {t("einstellungen.lernmaterial.wortSperren")}
          </Button>
          {/* Der Weg zurück. Ohne ihn ist das Löschen eines mitgelieferten Wortes
              endgültig, und dann räumt niemand darin auf — was den Sinn des Löschens
              aufhebt. Er legt nur an, was fehlt: eigene Einträge bleiben eigene. */}
          <Button onClick={aufGrundausstattung}>
            {t("einstellungen.lernmaterial.grundausstattung")}
          </Button>
        </div>
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-2)" }}>
          {t("einstellungen.lernmaterial.grundausstattungHinweis")}
        </div>
      </Abschnitt>
    </>
  );
}

/**
 * Eine Kategorie und die Wörter, die sie auszeichnen — Schriftgröße nach Stärke.
 *
 * Eine Wolke und keine Tabelle, weil die Frage eine andere ist: nicht „welchen Wert hat
 * dieses Wort", sondern „woran erkennt die Erkennung diesen Bucket". Darauf antwortet ein
 * Bild schneller als eine Spalte, und der Vergleich zwischen zwei Kategorien wird zum
 * Nebeneinanderlegen zweier Karten.
 *
 * Die Größe misst gegen die stärkste Stelle DIESER Karte, nicht gegen alle: sonst hätte
 * eine Kategorie mit klaren Kennzeichen lauter grosse Wörter und eine mit lauter
 * schwachen gar keine lesbaren — und genau die zweite ist die interessante.
 */
function Wortwolke({
  profil, name, leer, aufWort,
}: {
  profil: Kategorieprofil;
  name: string;
  leer: string;
  aufWort: (merkmal: string) => void;
}) {
  const max = profil.kennzeichen[0]?.staerke ?? 0;
  /** 0,8 rem bis 1,8 rem — darunter unlesbar, darüber sprengt ein Wort die Karte. */
  const groesse = (staerke: number) => 0.8 + (max > 0 ? staerke / max : 0) * 1;

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-2, 6px)",
        padding: "var(--sp-3)",
      }}
    >
      <div style={{ fontWeight: "var(--fw-bold)", marginBottom: "var(--sp-2)" }}>{name}</div>
      {profil.kennzeichen.length === 0 ? (
        <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{leer}</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", alignItems: "baseline" }}>
          {profil.kennzeichen.map((k) => (
            <button
              key={k.merkmal}
              className="linkbtn"
              onClick={() => aufWort(k.merkmal)}
              title={`${k.merkmal} · ${k.staerke.toFixed(2)}`}
              style={{
                fontSize: `${groesse(k.staerke).toFixed(2)}rem`,
                lineHeight: 1.2,
                // Das stärkste Drittel dunkler: die Reihenfolge steht schon in der Größe,
                // aber bei eng beieinanderliegenden Stärken sieht man sie dort kaum.
                color: k.staerke > max * 0.66 ? "var(--ink-1)" : undefined,
                fontWeight: k.staerke > max * 0.66 ? "var(--fw-semi)" : undefined,
              }}
            >
              {wortVon(k.merkmal)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Was hinter einer Zeile steht: die vollständige Verteilung über die Kategorien.
 *
 * Sie ist der Grund, aus dem man eine solche Liste überhaupt aufmacht — „in welchen
 * Kategorien steckt dieses Wort und wie oft". Als Spalte ginge sie nicht: sie ist
 * unterschiedlich lang, und gekappt beantwortet sie genau die Frage nicht, für die man
 * hinsieht.
 */
function Wortdetail({
  zeile, t, kategorieName, zahl, prozent,
}: {
  zeile: Wortzeile;
  t: Hilfe["t"];
  kategorieName: Map<string, string>;
  zahl: (n: number) => string;
  prozent: (x: number) => string;
}) {
  return (
    <div
      style={{
        marginTop: "var(--sp-4)",
        padding: "var(--sp-3)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-2, 6px)",
        background: "var(--surface-2)",
      }}
    >
      <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontWeight: "var(--fw-bold)" }}>{zeile.anzeige}</span>
        {zeile.herkunft && (
          <span className="muted">{t(`einstellungen.lernmaterial.herkunft.${zeile.herkunft}`)}</span>
        )}
        <Pill variant={zeile.zustand === "genutzt" ? "ok" : zeile.zustand === "gesperrt" ? "warn" : "neutral"}>
          {t(`einstellungen.lernmaterial.zustand.${zeile.zustand}`)}
        </Pill>
        {zeile.quelle && (
          <Pill variant={zeile.quelle === "manuell" ? "plan" : "neutral"}>
            {t(`einstellungen.lernmaterial.quelle${zeile.quelle === "manuell" ? "Manuell" : "Standard"}`)}
          </Pill>
        )}
        {zeile.geltung !== undefined && (
          <span className="muted">
            {zeile.geltung?.length
              ? zeile.geltung.map((h) => t(`einstellungen.lernmaterial.herkunft.${h}`)).join(", ")
              : t("einstellungen.lernmaterial.ueberall")}
          </span>
        )}
      </div>

      {zeile.grund && (
        <div className="muted" style={{ marginTop: "var(--sp-2)" }}>
          {t(`einstellungen.lernmaterial.verwurf.${zeile.grund}`)} · {t("einstellungen.lernmaterial.strukturellHinweis")}
        </div>
      )}

      {/* Die zwei Maße, die aus der Tabelle gefallen sind. Sie gehören hierher und nicht
          in eine Spalte: gebraucht werden sie, wenn man EINE Zeile beurteilt, nicht beim
          Überfliegen — und zehn Spalten liest niemand mehr auf einen Blick. */}
      {zeile.belege > 0 && zeile.kategorien > 0 && (
        <div style={{ display: "flex", gap: "var(--sp-5)", flexWrap: "wrap", marginTop: "var(--sp-3)" }}>
          <span>
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
              {t("einstellungen.lernmaterial.spalteDeckung")}
            </span>{" "}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{prozent(zeile.deckung)}</span>
          </span>
          <span>
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
              {t("einstellungen.lernmaterial.trennschaerfe")}
            </span>{" "}
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                color: zeile.konzentration >= 0.8 ? "var(--ok-deep)" : zeile.konzentration < 0.5 ? "var(--warn-deep)" : undefined,
              }}
            >
              {prozent(zeile.konzentration)}
            </span>
          </span>
        </div>
      )}

      {zeile.verteilung.length === 0 ? (
        <div className="muted" style={{ marginTop: "var(--sp-3)" }}>
          {t("einstellungen.lernmaterial.ohneBelege")}
        </div>
      ) : (
        <div style={{ marginTop: "var(--sp-3)" }}>
          <div style={{ fontWeight: "var(--fw-bold)", marginBottom: "var(--sp-2)" }}>
            {t("einstellungen.lernmaterial.verteilungTitel", { anzahl: zahl(zeile.kategorien) })}
          </div>
          <div style={{ display: "grid", gap: 3 }}>
            {zeile.verteilung.map((v) => (
              <div key={v.kategorieId} style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
                <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "5ch", textAlign: "right" }}>
                  {zahl(v.anzahl)}
                </span>
                <span style={{ display: "block", width: 120, height: 6, background: "var(--surface)" }}>
                  <span
                    style={{
                      display: "block",
                      height: 6,
                      width: `${Math.round((v.anzahl / zeile.belege) * 100)}%`,
                      background: "var(--ok-deep)",
                    }}
                  />
                </span>
                <span>{kategorieName.get(v.kategorieId) ?? v.kategorieId}</span>
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {prozent(v.anzahl / zeile.belege)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- 4 · Erkennungsmodell

function ModellInhalt({
  t, daten, kategorieName, zahl, prozent, bewertung, trainiert, listenGeaendert, aufTraining,
}: Hilfe & {
  bewertung: Bewertung | null;
  trainiert: boolean;
  listenGeaendert: boolean;
  aufTraining: () => void;
}) {
  const { locale } = useGeld();
  if (!daten) return <div className="muted">…</div>;
  const stand = daten.zustand.stand;
  const matrix = bewertung
    ? verwechslungsmatrix(bewertung)
    : { kategorien: [] as string[], zeilen: [] as Matrixzeile[] };

  return (
    <>
      <div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center", flexWrap: "wrap" }}>
        {daten.material.beispiele.length > 0 && (
          <Button variant="primary" onClick={aufTraining}>
            {trainiert ? t("einstellungen.lernmaterial.trainiertGerade") : t("einstellungen.lernmaterial.trainieren")}
          </Button>
        )}
        {listenGeaendert && <span className="muted">{t("einstellungen.lernmaterial.modellVeraltet")}</span>}
      </div>

      {!stand ? (
        <div className="muted" style={{ marginTop: "var(--sp-4)" }}>
          {t("einstellungen.lernmaterial.nieTrainiert")}
        </div>
      ) : (
        <>
          <div style={{ marginTop: "var(--sp-4)" }}>
            <KPIStat
              size="tile"
              label={t("einstellungen.lernmaterial.genauigkeit")}
              value={
                stand.genauigkeit === undefined
                  ? t("einstellungen.lernmaterial.genauigkeitUnbekannt")
                  : prozent(stand.genauigkeit)
              }
              meta={
                stand.genauigkeit === undefined
                  ? t("einstellungen.lernmaterial.genauigkeitUnbekanntMeta")
                  : bewertung
                    ? t("einstellungen.lernmaterial.genauigkeitMeta", { gesamt: zahl(bewertung.gesamt) })
                    : undefined
              }
              tone={stand.genauigkeit !== undefined && stand.genauigkeit >= 0.85 ? "ok" : "default"}
            />
          </div>
          <div className="muted" style={{ marginTop: "var(--sp-3)" }}>
            {t("einstellungen.lernmaterial.trainiertAm", {
              datum: new Date(stand.trainiertAm).toLocaleString(locale),
              beispiele: zahl(stand.modell.beispiele),
            })}
            {daten.zustand.zuwachs !== 0 && (
              <>
                {" "}
                {zustandsText(t, daten.zustand.zuwachs, zahl)}
                {daten.zustand.veraltet && ` ${t("einstellungen.lernmaterial.veraltet")}`}
              </>
            )}
          </div>
        </>
      )}

      {bewertung && (
        <Abschnitt titel={t("einstellungen.lernmaterial.matrixTitel")}>
          <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            {matrix.kategorien.length === 0
              ? t("einstellungen.lernmaterial.matrixFehlerfrei")
              : t("einstellungen.lernmaterial.matrixHinweis")}
          </div>
          {matrix.kategorien.length > 0 && (
            <>
              <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
                {t("einstellungen.lernmaterial.matrixLegende", {
                  fehler: zahl(bewertung.gesamt - bewertung.richtig),
                  zellen: zahl(bewertung.verwechslungen.length),
                  kategorien: zahl(matrix.kategorien.length),
                })}
              </div>
              <Matrix
                matrix={matrix}
                beschriftung={(id) => kategorieName.get(id) ?? id}
                kopf={t("einstellungen.lernmaterial.matrixSpalteIst")}
              />
              <Abschnitt titel={t("einstellungen.lernmaterial.paareTitel")}>
                <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
                  {t("einstellungen.lernmaterial.paareHinweis")}
                </div>
                <DataTable
                  columns={[
                    {
                      key: "tatsaechlich",
                      label: t("einstellungen.lernmaterial.spaltePaar"),
                      render: (r) =>
                        `${kategorieName.get(r.tatsaechlich) ?? r.tatsaechlich} → ${kategorieName.get(r.vorhergesagt) ?? r.vorhergesagt}`,
                    },
                    {
                      key: "anzahl",
                      label: t("einstellungen.lernmaterial.spalteAnzahl"),
                      align: "right",
                      render: (r) => zahl(r.anzahl),
                    },
                  ]}
                  rows={bewertung.verwechslungen.slice(0, 15).map((v) => ({ ...v }))}
                />
              </Abschnitt>
            </>
          )}
        </Abschnitt>
      )}
    </>
  );
}

// ------------------------------------------------------------------------ Bausteine

/** Überschrift plus Inhalt, optional mit einem Knopf rechts daneben. */
function Abschnitt({ titel, neben, children }: { titel: string; neben?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginTop: "var(--sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", marginBottom: "var(--sp-2)" }}>
        <div style={{ fontWeight: "var(--fw-bold)" }}>{titel}</div>
        {neben}
      </div>
      {children}
    </div>
  );
}

/**
 * „Seitdem sind n Beispiele dazugekommen/weggefallen." Singular und Plural als eigene
 * Schlüssel statt über die Plural-Mechanik von i18next: die legt den Basis-Schlüssel
 * nicht an, und der Vollständigkeits-Test über alle verwendeten Schlüssel würde ihn
 * dauerhaft als fehlend melden.
 */
function zustandsText(t: Hilfe["t"], zuwachs: number, zahl: (n: number) => string): string {
  const n = Math.abs(zuwachs);
  const stamm = `einstellungen.lernmaterial.${zuwachs > 0 ? "zuwachs" : "schwund"}`;
  return n === 1 ? t(`${stamm}Eins`) : t(`${stamm}Viele`, { anzahl: zahl(n) });
}

/**
 * Die Verwechslungsmatrix als Tabelle: Zeile = tatsächliche Kategorie, Spalte = was die
 * Erkennung daraus gemacht hat.
 *
 * Eine eigene Tabelle statt `DataTable`, weil hier die Spalten aus den Daten entstehen
 * und die Diagonale eine eigene Bedeutung hat. Sie scrollt in ihrem eigenen Kasten —
 * bei fünfundzwanzig beteiligten Kategorien ist sie breiter als jedes Fenster, und die
 * Seite selbst darf davon nicht seitwärts wandern.
 *
 * Leere Zellen bleiben leer statt eine Null zu zeigen: bei rund neunzig Prozent Nullen
 * wäre das ein Feld aus Ziffern, in dem die wenigen echten Zahlen untergehen.
 */
function Matrix({
  matrix,
  beschriftung,
  kopf,
}: {
  matrix: { kategorien: string[]; zeilen: Matrixzeile[] };
  beschriftung: (id: string) => string;
  kopf: string;
}) {
  const zelle = {
    padding: "var(--sp-1) var(--sp-2)",
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums",
    borderBottom: "1px solid var(--line)",
  };
  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table style={{ borderCollapse: "collapse", fontSize: "var(--fs-sm)" }}>
        <thead>
          <tr>
            <th style={{ ...zelle, textAlign: "left", position: "sticky", left: 0, background: "var(--surface)" }}>
              {kopf}
            </th>
            {matrix.kategorien.map((id) => (
              // Schräg gestellt: waagerecht bräuchte jede Spalte die Breite eines
              // Kategorienamens, und die Matrix wäre um ein Vielfaches breiter als hoch.
              <th key={id} style={{ ...zelle, height: 120, verticalAlign: "bottom", padding: 0 }}>
                <div
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                    whiteSpace: "nowrap",
                    padding: "var(--sp-2) var(--sp-1)",
                    fontWeight: "var(--fw-bold)",
                  }}
                >
                  {beschriftung(id)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.zeilen.map((z) => (
            <tr key={z.kategorieId}>
              <th
                style={{
                  ...zelle, textAlign: "left", whiteSpace: "nowrap",
                  position: "sticky", left: 0, background: "var(--surface)",
                  fontWeight: "var(--fw-bold)",
                }}
              >
                {beschriftung(z.kategorieId)}
              </th>
              {matrix.kategorien.map((spalte) => {
                const n = z.zellen.get(spalte);
                const diagonale = spalte === z.kategorieId;
                return (
                  <td
                    key={spalte}
                    style={{
                      ...zelle,
                      color: n ? (diagonale ? "var(--ok-deep)" : "var(--warn-deep)") : "var(--ink-3)",
                      fontWeight: n && !diagonale ? "var(--fw-bold)" : "var(--fw-regular)",
                      background: diagonale ? "var(--surface-2)" : undefined,
                    }}
                    title={`${beschriftung(z.kategorieId)} → ${beschriftung(spalte)}`}
                  >
                    {n ?? ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
