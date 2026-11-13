// Die zweite Karte der Kategorisierung: die Wörter beurteilen. Der Rahmen, der sie lädt
// und zusammenhält, steht in `KategorisierungCards.tsx`.

import { useProzent } from "../bausteine/einstellungenKontext";

import { useMemo, useState } from "react";
import { MERKMALSHERKUENFTE, type Merkmalsherkunft } from "../../../application";
import {
  bestandszahlen,
  merkmalsbestand,
  type Wortzeile,
  type Wortzustand,
} from "../../../application/kategorien/merkmalsbestand";
import type { Wirkung } from "../../../application/kategorien/merkmalskonfiguration";
import {
  Button,
  DataTable,
  FormField,
  KPIStat,
  Pill,
} from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { Abschnitt, type Hilfe } from "./kartenteile";
import { Kaestchen } from "../bausteine/Kaestchen";
import { Zeile } from "../bausteine/Anordnung";

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
export function WoerterInhalt({
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
            <Kaestchen
              key={h}
              an={aktiv.has(h)}
              aufAendern={(an) => aufSchalten(h, an)}
              oben
              style={{ display: "flex", gap: "var(--sp-3)" }}
            >
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
                <div className="hinweis">
                  {t(`einstellungen.lernmaterial.herkunftHinweis.${h}`)}
                </div>
              </span>
            </Kaestchen>
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
        <div className="hinweis" style={{ marginBottom: "var(--sp-3)" }}>
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
          <Kaestchen an={mitStandard} aufAendern={setMitStandard} style={{ paddingBottom: "var(--sp-2)" }}>
            <span>{t("einstellungen.lernmaterial.mitStandard")}</span>
          </Kaestchen>
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
                        <span className="hinweis">
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
                      <Button variant="link" onClick={(e) => { e.stopPropagation(); aufZulassen(r.wort); }}>
                        {t("einstellungen.lernmaterial.zulassen")}
                      </Button>
                    ) : r.zustand === "genutzt" ? (
                      <Button variant="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          aufAusschliessen(r.wort, r.herkunft ? [r.herkunft] : undefined);
                        }}
                      >
                        {t("einstellungen.lernmaterial.ausschliessen")}
                      </Button>
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
        <div className="hinweis" style={{ marginTop: "var(--sp-2)" }}>
          {t("einstellungen.lernmaterial.grundausstattungHinweis")}
        </div>
      </Abschnitt>
    </>
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
        borderRadius: "6px",
        background: "var(--surface-2)",
      }}
    >
      <Zeile ausrichtung="baseline">
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
      </Zeile>

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
            <span className="hinweis">
              {t("einstellungen.lernmaterial.spalteDeckung")}
            </span>{" "}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{prozent(zeile.deckung)}</span>
          </span>
          <span>
            <span className="hinweis">
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
                <span className="hinweis">
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
