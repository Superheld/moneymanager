// Die automatische Kategorisierung in den Einstellungen — vier Karten entlang des
// Ablaufs, den ein Training tatsächlich hat: Daten sichten, Merkmale wählen, Ausschlüsse
// pflegen, trainieren und prüfen.
//
// Vier statt einer, weil das die Reihenfolge ist, in der man die Fragen stellt. Eine
// einzige Karte mit allem drin zeigte das Ergebnis oben und seine Grundlage unten — also
// rückwärts — und war so lang, dass man den Anfang nicht mehr sah.
//
// Geladen wird gemeinsam und erst beim ersten Aufklappen einer der vier: die Auswertung
// zieht den gesamten Ledger und rechnet die Merkmale darüber. Viermal getrennt zu laden
// wäre dieselbe Arbeit vierfach.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  MERKMALSHERKUENFTE,
  verwechslungsmatrix,
  type Bewertung,
  type Kategorie,
  type Matrixzeile,
  type Merkmalsherkunft,
  type Verwurfsgrund,
} from "../../application";
import {
  type Ausschlussgrund,
  type Materialbefund,
  type Merkmalswert,
} from "../../application/trainingsmaterial";
import {
  type Modellzustand,
} from "../../application/klassifikatorTraining";
import {
  charakterWechsel,
  uebergaenge,
  type Abgleichsplan,
} from "../../application/kategorieAbgleich";
import type { Wirkung } from "../../application/merkmalskonfiguration";
import {
  herkunftUmschalten,
  kategorieAbgleichAnwenden,
  kategorieAbgleichVorschau,
  merkmalskonfiguration,
  merkmalswirkung,
  modellStand,
  modellTrainieren,
  trainingsdaten,
  wortFreigeben,
  wortSperren,
} from "../dienste";
import type { GespeicherterAusschluss } from "../../application/ports";
import { Button, Card, DataTable, FormField, KPIStat, Pill } from "./ds";
import { Bereich } from "./Bereich";
import { useGeld, fehlerNachricht } from "./einstellungenKontext";

/** Alles, was die vier Karten gemeinsam brauchen. */
interface Daten {
  readonly material: Materialbefund;
  readonly zustand: Modellzustand;
  readonly herkuenfte: readonly Merkmalsherkunft[];
  readonly ausschluesse: readonly GespeicherterAusschluss[];
}

export function KategorisierungCards({ kategorien }: { kategorien: Kategorie[] }) {
  const { t } = useTranslation();
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
    prozent: (x: number) => `${(x * 100).toLocaleString(locale, { maximumFractionDigits: 1 })} %`,
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
          id: "merkmale",
          label: t("einstellungen.lernmaterial.merkmaleTitel"),
          untertitel: t("einstellungen.lernmaterial.merkmaleUntertitel"),
          inhalt: () => (
            <Card>
              {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
              <MerkmaleInhalt
                {...hilfe}
                wirkung={wirkung}
                misst={laeuft === "wirkung"}
                aufWirkung={wirkungStarten}
                aufSchalten={(h, aktiv) => nachAenderung(herkunftUmschalten(h, aktiv))}
                aufAusschliessen={(wort, herkuenfte) =>
                  nachAenderung(wortSperren(wort, herkuenfte))
                }
              />
            </Card>
          ),
        },
        {
          id: "ausschluesse",
          label: t("einstellungen.lernmaterial.ausschluesseTitel"),
          untertitel: t("einstellungen.lernmaterial.ausschluesseUntertitel"),
          inhalt: () => (
            <Card>
              {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
              <AusschluesseInhalt
                {...hilfe}
                aufAusschliessen={(wort, herkuenfte) =>
                  nachAenderung(wortSperren(wort, herkuenfte))
                }
                aufZulassen={(wort) => nachAenderung(wortFreigeben(wort))}
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

// ---------------------------------------------------------------------- 2 · Merkmale

function MerkmaleInhalt({
  t, daten, kategorieName, zahl, prozent, wirkung, misst, aufWirkung, aufSchalten, aufAusschliessen,
}: Hilfe & {
  wirkung: { basis: number; wirkungen: Wirkung[] } | null;
  misst: boolean;
  aufWirkung: () => void;
  aufSchalten: (h: Merkmalsherkunft, aktiv: boolean) => void;
  aufAusschliessen: (wort: string, herkuenfte?: readonly Merkmalsherkunft[]) => void;
}) {
  if (!daten) return <div className="muted">…</div>;
  const aktiv = new Set(daten.herkuenfte);
  const wirkungJe = new Map(wirkung?.wirkungen.map((w) => [w.herkunft, w]));

  /** Wie viele Merkmale je Herkunft — aus der Namensraum-Statistik ist das nicht
   *  ableitbar, weil `emp=` und `emp:` denselben Namensraum teilen. */
  const anzahlJe = new Map<Merkmalsherkunft, number>();
  for (const m of daten.material.vokabular.haeufigste) {
    if (m.herkunft) anzahlJe.set(m.herkunft, (anzahlJe.get(m.herkunft) ?? 0) + 1);
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

      {daten.material.vokabular.haeufigste.length > 0 && (
        <Abschnitt titel={t("einstellungen.lernmaterial.haeufigsteTitel")}>
          <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
            {t("einstellungen.lernmaterial.trennschaerfeHinweis")}
          </div>
          <MerkmalsTabelle
            t={t}
            merkmale={daten.material.vokabular.haeufigste}
            kategorieName={kategorieName}
            zahl={zahl}
            prozent={prozent}
            aufAusschliessen={aufAusschliessen}
          />
        </Abschnitt>
      )}
    </>
  );
}

function MerkmalsTabelle({
  t, merkmale, kategorieName, zahl, prozent, aufAusschliessen,
}: {
  t: Hilfe["t"];
  merkmale: readonly Merkmalswert[];
  kategorieName: Map<string, string>;
  zahl: (n: number) => string;
  prozent: (x: number) => string;
  aufAusschliessen: (wort: string, herkuenfte?: readonly Merkmalsherkunft[]) => void;
}) {
  /** Das nackte Wort ohne Präfix — nur das steht in der Ausschlussliste. */
  const wortVon = (merkmal: string) => merkmal.slice(merkmal.search(/[=:]/) + 1);

  return (
    <DataTable
      sortable
      columns={[
        { key: "merkmal", label: t("einstellungen.lernmaterial.spalteMerkmal") },
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
          render: (r) => zahl(r.kategorien),
        },
        {
          key: "konzentration",
          label: t("einstellungen.lernmaterial.trennschaerfe"),
          align: "right",
          render: (r) => (
            <span style={{ color: r.konzentration >= 0.8 ? "var(--ok-deep)" : r.konzentration < 0.5 ? "var(--warn-deep)" : undefined }}>
              {prozent(r.konzentration)}
            </span>
          ),
        },
        {
          key: "haeufigsteKategorieId",
          label: t("einstellungen.lernmaterial.spalteFuer"),
          render: (r) => kategorieName.get(r.haeufigsteKategorieId) ?? r.haeufigsteKategorieId,
        },
        {
          key: "_x",
          label: "",
          align: "right",
          sortable: false,
          render: (r) => (
            <button
              className="linkbtn"
              onClick={() => aufAusschliessen(wortVon(r.merkmal), r.herkunft ? [r.herkunft] : undefined)}
              title={t("einstellungen.lernmaterial.nurIn")}
            >
              {t("einstellungen.lernmaterial.ausschliessen")}
            </button>
          ),
        },
      ]}
      rows={merkmale.map((m) => ({ ...m }))}
    />
  );
}

// ------------------------------------------------------------------- 3 · Ausschlüsse

function AusschluesseInhalt({
  t, daten, zahl, aufAusschliessen, aufZulassen,
}: Hilfe & {
  aufAusschliessen: (wort: string, herkuenfte?: readonly Merkmalsherkunft[]) => void;
  aufZulassen: (wort: string) => void;
}) {
  const [neu, setNeu] = useState("");
  const [nurIn, setNurIn] = useState<Merkmalsherkunft | "">("");
  if (!daten) return <div className="muted">…</div>;

  const verwurf = (Object.entries(daten.material.vokabular.verworfen) as [Verwurfsgrund, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  function hinzufuegen() {
    const wort = neu.trim();
    if (!wort) return;
    aufAusschliessen(wort, nurIn ? [nurIn] : undefined);
    setNeu("");
  }

  return (
    <>
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
          <select className="field" value={nurIn} onChange={(e) => setNurIn(e.target.value as Merkmalsherkunft | "")}>
            <option value="">{t("einstellungen.lernmaterial.ueberall")}</option>
            {MERKMALSHERKUENFTE.map((h) => (
              <option key={h} value={h}>{t(`einstellungen.lernmaterial.herkunft.${h}`)}</option>
            ))}
          </select>
        </FormField>
        <Button variant="primary" plus onClick={hinzufuegen}>
          {t("einstellungen.lernmaterial.ausschliessen")}
        </Button>
      </div>

      {verwurf.length > 0 && (
        <Abschnitt titel={t("einstellungen.lernmaterial.verworfenTitel")}>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
            {verwurf.map(([grund, n]) => (
              <Pill key={grund}>
                {t(`einstellungen.lernmaterial.verwurf.${grund}`)} · {zahl(n)}
              </Pill>
            ))}
          </div>
          {daten.material.vokabular.haeufigsteVerworfen.length > 0 && (
            <DataTable
              columns={[
                { key: "wort", label: t("einstellungen.lernmaterial.spalteWort") },
                {
                  key: "herkunft",
                  label: t("einstellungen.lernmaterial.spalteGeltung"),
                  render: (r) => t(`einstellungen.lernmaterial.herkunft.${r.herkunft}`),
                },
                {
                  key: "grund",
                  label: t("einstellungen.lernmaterial.spalteGrund"),
                  render: (r) => t(`einstellungen.lernmaterial.verwurf.${r.grund}`),
                },
                {
                  key: "anzahl",
                  label: t("einstellungen.lernmaterial.spalteAnzahl"),
                  align: "right",
                  render: (r) => zahl(r.anzahl),
                },
                {
                  key: "_x",
                  label: "",
                  align: "right",
                  render: (r) =>
                    r.grund === "ausgeschlossen" ? (
                      <button className="linkbtn" onClick={() => aufZulassen(r.wort)}>
                        {t("einstellungen.lernmaterial.zulassen")}
                      </button>
                    ) : (
                      // Strukturell verworfen (Nummer, Platzhalter, zu kurz) — dafür gibt
                      // es keinen Listeneintrag, den man entfernen könnte.
                      <span className="muted">—</span>
                    ),
                },
              ]}
              rows={daten.material.vokabular.haeufigsteVerworfen.map((v) => ({ ...v }))}
            />
          )}
        </Abschnitt>
      )}

      <Abschnitt titel={t("einstellungen.lernmaterial.listeTitel", { anzahl: daten.ausschluesse.length })}>
        <div className="muted" style={{ marginBottom: "var(--sp-3)" }}>
          {t("einstellungen.lernmaterial.listeHinweis")}
        </div>
        <DataTable
          sortable
          pageSize={25}
          columns={[
            { key: "wort", label: t("einstellungen.lernmaterial.spalteWort") },
            {
              key: "geltung",
              label: t("einstellungen.lernmaterial.spalteGeltung"),
              render: (r) =>
                r.herkuenfte?.length
                  ? r.herkuenfte.map((h: Merkmalsherkunft) => t(`einstellungen.lernmaterial.herkunft.${h}`)).join(", ")
                  : t("einstellungen.lernmaterial.ueberall"),
            },
            {
              key: "quelle",
              label: t("einstellungen.lernmaterial.spalteWoher"),
              render: (r) => (
                <Pill variant={r.quelle === "manuell" ? "plan" : "neutral"}>
                  {t(`einstellungen.lernmaterial.quelle${r.quelle === "manuell" ? "Manuell" : "Standard"}`)}
                </Pill>
              ),
            },
            {
              key: "_x",
              label: "",
              align: "right",
              sortable: false,
              render: (r) => (
                <button className="linkbtn" onClick={() => aufZulassen(r.wort)}>
                  {t("einstellungen.lernmaterial.zulassen")}
                </button>
              ),
            },
          ]}
          rows={daten.ausschluesse.map((a) => ({ ...a }))}
        />
      </Abschnitt>
    </>
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
