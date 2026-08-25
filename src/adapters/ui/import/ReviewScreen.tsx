// Review-Inbox (Slice 4) — der persistierte Entwurfs-Stapel: importierte Umsätze (Status
// „neu") prüfen, Zeile für Zeile kategorisieren und verbuchen. Filter nach Konto/Status,
// seitenweise (skaliert auf tausende Zeilen). „Verbuchen" macht aus allen kategorisierten
// Umsätzen Ist-Buchungen (wirkt auf Salden). Umbuchungen sind als Umschichtung fix gelabelt.
//
// Seit 2026-08-20 ist das die EINZIGE Inbox. Der Bankabruf bucht direkt und hat keine
// Warteliste mehr — was er meldet, IST passiert, und ob es doppelt ist, steht im Auszug.
// Der DATEI-Import behält die Vorstufe: eine Datei ist kein Kontoauszug, sie kann alt
// sein, überlappen oder aus einer anderen App stammen. Sicher ist sicher.
//
// Daraus folgen zwei Dinge, die vorher am Konto hingen und hierher gewandert sind:
// der Dublettenverdacht steht an der Zeile (mit Gründen), und der volle Buchungsdialog
// lässt sich zu jedem Entwurf öffnen — Herkunft, Gegenbein, Vertrag, alles vor dem
// Buchen. Beide Wege gab es nur im Konto-Block „Neu von der Bank", den es nicht mehr gibt.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ABRUF_QUELLEN,
  stapelVerdacht,
  type Dublettenverdacht,
  type Kategorie,
  type Zahlungskonto,
} from "../../../application";
import {
  festlegungAnwenden,
  importLaeufe,
  kategorisierung,
  offeneUmsaetze,
  stammdaten,
  umsaetze as alleUmsaetze,
  umsaetzeBuchen,
  umsatzSpeichern,
} from "../../dienste";
import {
  kategorisieren,
  verwerfen,
  zurueckholen,
  vorschlagsbefundFuer,
  type Umsatz,
  type VerbuchenErgebnis,
  type Vorschlagskontext,
} from "../../../application/import";
import { festlegungAngebot } from "../../../application/kategorien/kategoriefestlegungen";
import { BuchungDetail } from "../buchung/BuchungDetail";
import { Button, Card, Pill } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { CategoryPicker } from "../bausteine/CategoryPicker";
import { useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { IconButton } from "../bausteine/IconButton";

const SEITE_GROESSE = 100;

/**
 * Woher der Vorschlag dieser Zeile kommt — und beim Modell, woran es lag.
 *
 * Die Belege werden hier neu gerechnet: sie hängen am aktuellen Modell und an der
 * aktuellen Merkmalskonfiguration. Nur wenn die Neurechnung dieselbe Kategorie liefert
 * wie der gespeicherte Vorschlag, wird sie gezeigt — sonst erklärte sie etwas anderes,
 * als in der Zeile steht.
 */
function Herkunft({ umsatz, kontext }: { umsatz: Umsatz; kontext: Vorschlagskontext | null }) {
  const { t } = useTranslation();
  const quelle = umsatz.vorschlag?.quelle;
  if (!quelle) return null;

  const befund =
    kontext && quelle === "ki" ? vorschlagsbefundFuer(umsatz, kontext, umsatz.zahlungskontoId) : null;
  const passt = befund?.vorschlag?.kategorieId === umsatz.vorschlag?.kategorieId;
  const belege = passt ? befund?.beitraege ?? [] : [];

  return (
    <div style={{ marginTop: 4, display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
      <span title={t(`review.herkunftTitel.${quelle}`)}>
        <Pill variant={quelle === "manuell" || quelle === "festlegung" ? "plan" : quelle === "ki" ? "neutral" : "ok"}>
          {t(`review.herkunft.${quelle}`)}
        </Pill>
      </span>
      {passt && befund?.sicherheit !== undefined && (
        <span
          className="muted"
          style={{ fontSize: "var(--fs-2xs)" }}
          title={belege.map((b) => `${b.gewicht >= 0 ? "+" : "−"}${Math.abs(b.gewicht).toFixed(2)} ${b.merkmal}`).join("  ")}
        >
          {t("review.begruendungSicher", { wert: `${Math.round(befund.sicherheit * 100)} %` })}
          {belege.length > 0 && ` · ${belege.slice(0, 3).map((b) => b.merkmal).join(", ")}`}
        </span>
      )}
    </div>
  );
}

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function ReviewScreen() {
  const { t } = useTranslation();
  const geld = useGeld();

  const [umsaetze, setUmsaetze] = useState<Umsatz[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [kontoFilter, setKontoFilter] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<"alle" | "offen" | "fertig">("alle");
  const [suche, setSuche] = useState("");
  const [seite, setSeite] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [verb, setVerb] = useState<VerbuchenErgebnis | null>(null);
  // Für die Frage „warum diese Kategorie?": dieselben Quellen, aus denen der Vorschlag
  // beim Import entstand. Die Begründung wird beim Anzeigen neu gerechnet statt beim
  // Import gespeichert — sie hängt am aktuellen Modell, und ein gespeicherter Satz von
  // vorgestern erklärte einen Vorschlag, den es so nicht mehr gäbe.
  const [kontext, setKontext] = useState<Vorschlagskontext | null>(null);
  // Das Angebot „immer bei diesem Empfänger" — es steht an GENAU EINER Zeile, nämlich der
  // zuletzt korrigierten. Eine Festlegung soll aus einer bewussten Handlung entstehen;
  // ein Knopf an jeder Zeile wäre eine Einladung, die Liste zuzumüllen.
  const [angebot, setAngebot] = useState<{ umsatzId: string; muster: string; kategorieId: string } | null>(null);
  const [festgelegt, setFestgelegt] = useState<{ muster: string; weitere: number } | null>(null);
  /** Zweite Frage vor dem Sammel-Verwerfen — es betrifft alles, was gerade sichtbar ist. */
  const [verwerfenGefragt, setVerwerfenGefragt] = useState(false);
  /**
   * ALLE Umsätze — Grundlage der Dublettenprüfung, nicht nur die offenen.
   *
   * Verbuchtes muss mit hinein (danach wird ja gesucht), Verworfenes auch: „das habe ich
   * schon einmal weggelegt" ist beim Durchsehen genau die Auskunft, die man braucht.
   */
  const [bestand, setBestand] = useState<Umsatz[]>([]);
  /** Der Entwurf, der gerade im vollen Dialog liegt — geschrieben wird dort erst auf Klick. */
  const [imDialog, setImDialog] = useState<Umsatz | null>(null);
  /** Läufe aus einem Bankabruf — deren Zeilen gehören nicht in diese Inbox. */
  const [abrufLaeufe, setAbrufLaeufe] = useState<ReadonlySet<string>>(new Set());
  /** Der Weggelegt-Bereich ist zugeklappt: er ist der Rückweg, nicht der Alltag. */
  const [zeigeWeggelegt, setZeigeWeggelegt] = useState(false);

  async function laden() {
    try {
      const [u, daten, laeufe, alle] = await Promise.all([
        offeneUmsaetze(),
        stammdaten(),
        importLaeufe(),
        alleUmsaetze(),
      ]);
      // Die Inbox ist der Ort für den gelegentlichen DATEI-Import: ein Stapel, den man am
      // Stück durchsieht. Was per Bankabruf hereinkommt, steht seit 2026-08-18 beim
      // Konto selbst — dort schaut man ohnehin hin, und es ist der Alltag, kein Vorgang.
      const abruf = new Set(
        laeufe.filter((l) => ABRUF_QUELLEN.has(l.quelle)).map((l) => l.id),
      );
      setUmsaetze(u.filter((x) => !abruf.has(x.laufId)));
      setBestand(alle);
      setAbrufLaeufe(abruf);
      setKonten([...daten.konten]);
      setKategorien([...daten.kategorien]);
      setKontext(await kategorisierung());
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void laden();
  }, []);

  const kontoName = useMemo(() => new Map(konten.map((k) => [k.id, k.bezeichnung])), [konten]);
  const katById = useMemo(() => new Map(kategorien.map((k) => [k.id, k])), [kategorien]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return umsaetze.filter((u) => {
      if (kontoFilter !== "alle" && u.zahlungskontoId !== kontoFilter) return false;
      if (statusFilter === "offen" && u.vorschlag) return false;
      if (statusFilter === "fertig" && !u.vorschlag) return false;
      if (q && !(`${u.gegenpartei} ${u.verwendungszweck}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [umsaetze, kontoFilter, statusFilter, suche]);

  /**
   * Welche der offenen Zeilen könnte schon da sein — gerechnet, nicht abgelesen.
   *
   * Der Verdacht, den der Import an die Zeile schreibt, gilt für den Stand von damals.
   * Was seitdem aus einer anderen Quelle dazukam (ein Bankabruf über denselben Zeitraum),
   * würde nie nachträglich angeschrieben. Also beim Hinsehen prüfen — dieselbe Regel wie
   * im Buchungsdialog, nur über den ganzen Stapel (`stapelVerdacht`).
   */
  const verdaechtig = useMemo(() => {
    const eigene = new Set(umsaetze.map((u) => u.id));
    return stapelVerdacht(umsaetze, bestand.filter((u) => !eigene.has(u.id)));
  }, [umsaetze, bestand]);

  const zwillingVon = (v: Dublettenverdacht) => bestand.find((u) => u.id === v.zwillingUmsatzId);

  /**
   * Der Rückweg. Weggelegt heisst nicht gelöscht — aber ohne diese Liste wäre es das
   * praktisch doch: eine versehentlich verworfene Zeile nimmt ihren Betrag aus dem
   * Kontostand mit, und weder wäre zu sehen, dass es sie gibt, noch käme sie zurück.
   */
  const weggelegte = useMemo(
    () =>
      bestand
        .filter((u) => (u.status === "verworfen" || u.status === "duplikat") && !abrufLaeufe.has(u.laufId))
        .sort((a, b) => b.buchungstag.localeCompare(a.buchungstag)),
    [bestand, abrufLaeufe],
  );

  /** Holt eine weggelegte Zeile zurück in den Stapel. */
  async function zurueck(u: Umsatz) {
    try {
      await umsatzSpeichern(zurueckholen(u));
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  const seitenAnzahl = Math.max(1, Math.ceil(gefiltert.length / SEITE_GROESSE));
  const aktuelleSeite = Math.min(seite, seitenAnzahl - 1);
  const zeilen = gefiltert.slice(aktuelleSeite * SEITE_GROESSE, (aktuelleSeite + 1) * SEITE_GROESSE);

  const fertig = umsaetze.filter((u) => u.vorschlag).length;
  const offen = umsaetze.length - fertig;

  async function kategorieGesetzt(u: Umsatz, kategorieId: string) {
    const kat = kategorieId ? katById.get(kategorieId) : undefined;
    const aktualisiert = kategorisieren(
      u,
      kat ? { kategorieId: kat.id, charakter: kat.defaultCharakter, quelle: "manuell" } : { charakter: "Aufwand", quelle: "manuell" },
    );
    // „keine" gewählt → Vorschlag entfernen (zurück zu unkategorisiert).
    const final = kategorieId ? aktualisiert : { ...u, vorschlag: undefined };
    try {
      await umsatzSpeichern(final);
      setUmsaetze((prev) => prev.map((x) => (x.id === u.id ? final : x)));
      setFestgelegt(null);
      const muster = kategorieId ? festlegungAngebot(kontext?.festlegungen ?? [], u.gegenpartei, kategorieId) : null;
      setAngebot(muster ? { umsatzId: u.id, muster, kategorieId } : null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Das Angebot annehmen: die Festlegung entsteht — und die übrigen OFFENEN Zeilen
   * desselben Empfängers ziehen mit.
   *
   * Das Mitziehen ist der Punkt. Wer bei einer von dreizehn Zahlungen an denselben
   * Empfänger „immer so" sagt und danach zwölf falsche Zeilen stehen sieht, hat die Zusage
   * nicht eingelöst bekommen. Verbuchte Zahlungen bleiben unberührt — die holt der
   * rückwirkende Abgleich, mit Vorschau.
   *
   * Unangetastet bleiben Zeilen, an denen jemand von Hand entschieden hat, und
   * Umbuchungen: beides sind Aussagen, die eine Festlegung nicht überstimmen darf.
   */
  async function angebotAnnehmen() {
    if (!angebot) return;
    const kat = katById.get(angebot.kategorieId);
    if (!kat) return;
    try {
      const weitere = await festlegungAnwenden(angebot.muster, kat, umsaetze, angebot.umsatzId);
      setAngebot(null);
      setFestgelegt({ muster: angebot.muster, weitere });
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Eine Zeile aus dem Stapel nehmen, ohne sie zu buchen.
   *
   * Bis 2026-08-19 gab es das hier nicht: was ein Dateiimport hereinbrachte und niemand
   * kategorisierte, blieb für immer stehen. Auf dem echten Bestand waren das neun Zeilen
   * aus einem Import vom Vortag — sichtbar, aber ohne Weg nach vorn oder zurück.
   *
   * Verworfen heisst NICHT gelöscht: die Zeile bleibt in der Datenbank (Status
   * `verworfen`) und zählt bei der Dublettenprüfung weiter mit. „Das habe ich schon
   * einmal weggeworfen" ist genau die Auskunft, die man beim nächsten Import braucht.
   */
  async function zeileVerwerfen(u: Umsatz) {
    try {
      const weggelegt = verwerfen(u);
      await umsatzSpeichern(weggelegt);
      setUmsaetze((prev) => prev.filter((x) => x.id !== u.id));
      // Auch im Bestand nachziehen: daraus speist sich der Weggelegt-Bereich, und ohne
      // das läge die Zeile weg, ohne dass der Rückweg sie zeigt.
      setBestand((prev) => prev.map((x) => (x.id === u.id ? weggelegt : x)));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  /** Alles, was gerade in der Liste steht und keine Kategorie hat, auf einmal weglegen. */
  async function restVerwerfen() {
    setBusy(true);
    setFehler(null);
    try {
      const offeneZeilen = gefiltert.filter((u) => !u.vorschlag);
      for (const u of offeneZeilen) await umsatzSpeichern(verwerfen(u));
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setVerwerfenGefragt(false);
    }
  }

  async function verbuchen() {
    setBusy(true);
    setFehler(null);
    try {
      // Bucht und ordnet die frischen Zahlungen gleich ihren Verträgen zu — der Weg,
      // über den neue Buchungen ihre Kennzeichnung bekommen, ohne dass jemand klickt.
      setVerb(await umsaetzeBuchen(umsaetze));
      await laden(); // verbuchte fallen aus „offene" raus
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const th = { textAlign: "left", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", padding: "8px 10px", borderBottom: "1px solid var(--line)" } as const;
  const td = { padding: "8px 10px", borderBottom: "1px solid var(--line-soft)", color: "var(--ink)" } as const;
  const select = { padding: "5px 8px", borderRadius: "var(--r-md)", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "13px", fontFamily: "var(--font-ui)" } as const;

  return (
    <>

      {fehler && <Card style={{ marginBottom: "var(--sp-4)", borderColor: "var(--danger, #c0392b)" }}>{t("review.fehlerDb")} ({fehler})</Card>}

      {umsaetze.length === 0 && !fehler ? (
        <Card>{t("review.leer")}</Card>
      ) : (
        <Card
          title={t("review.offenInfo", { offen, fertig })}
          action={
            <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", flexWrap: "wrap" }}>
              {festgelegt && (
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>
                  {festgelegt.weitere > 0
                    ? t("review.festlegung.gesetztWeitere", { muster: festgelegt.muster, anzahl: festgelegt.weitere })
                    : t("review.festlegung.gesetzt", { muster: festgelegt.muster })}
                </span>
              )}
              {verb && <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>{t("review.verbuchtErgebnis", { verbucht: verb.verbucht, umbuchungen: verb.umbuchungen, uebersprungen: verb.uebersprungen })}</span>}
              <Button variant="primary" onClick={busy || fertig === 0 ? undefined : verbuchen} style={busy || fertig === 0 ? { opacity: 0.5, cursor: busy ? "wait" : "not-allowed" } : undefined}>
                {busy ? t("review.verbuchenBusy") : t("review.verbuchen", { n: fertig })}
              </Button>
              {/* Der Gegenweg zum Verbuchen: was hier nie eine Kategorie bekommt, soll
                  auch verschwinden können — sonst steht der Rest eines Imports für immer
                  in der Inbox. */}
              {offen > 0 && (
                verwerfenGefragt ? (
                  <span style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center", fontSize: "var(--fs-xs)" }}>
                    <span className="muted">{t("review.verwerfenFrage", { n: gefiltert.filter((u) => !u.vorschlag).length })}</span>
                    <button className="linkbtn" style={{ color: "var(--warn-deep)" }} onClick={() => void restVerwerfen()}>{t("review.verwerfenJa")}</button>
                    <button className="linkbtn" onClick={() => setVerwerfenGefragt(false)}>{t("review.verwerfenNein")}</button>
                  </span>
                ) : (
                  <button className="linkbtn" onClick={() => setVerwerfenGefragt(true)}>
                    {t("review.restVerwerfen")}
                  </button>
                )
              )}
            </div>
          }
        >
          <div style={{ display: "flex", gap: "var(--sp-3)", marginBottom: "var(--sp-3)", flexWrap: "wrap" }}>
            <span style={{ minWidth: 160 }}>
              <Auswahl
                ariaLabel={t("review.alleKonten")}
                wert={kontoFilter}
                aufAenderung={(v) => { setKontoFilter(v); setSeite(0); }}
                optionen={[
                  { wert: "alle", text: t("review.alleKonten") },
                  ...konten.map((k) => ({ wert: k.id, text: k.bezeichnung })),
                ]}
              />
            </span>
            <span style={{ minWidth: 150 }}>
              <Auswahl
                ariaLabel={t("review.statusAlle")}
                wert={statusFilter}
                aufAenderung={(v) => { setStatusFilter(v as typeof statusFilter); setSeite(0); }}
                optionen={[
                  { wert: "alle", text: t("review.statusAlle") },
                  { wert: "offen", text: t("review.statusOffen") },
                  { wert: "fertig", text: t("review.statusFertig") },
                ]}
              />
            </span>
            <input
              value={suche}
              onChange={(e) => { setSuche(e.target.value); setSeite(0); }}
              placeholder={t("review.suche")}
              style={{ ...select, flex: "1 1 200px", minWidth: 160 }}
            />
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", alignSelf: "center" }}>{t("review.treffer", { n: gefiltert.length })}</span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={th}>{t("review.spalteDatum")}</th>
                <th style={th}>{t("review.spalteKonto")}</th>
                <th style={th}>{t("review.spalteGegenpartei")}</th>
                <th style={{ ...th, textAlign: "right" }}>{t("review.spalteBetrag")} {geld.symbol}</th>
                <th style={{ ...th, minWidth: 220 }}>{t("review.spalteKategorie")}</th>
                <th style={{ ...th, width: 76 }} />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((u) => (
                <tr key={u.id}>
                  <td style={td}>{ddmmyyyy(u.buchungstag)}</td>
                  <td style={{ ...td, color: "var(--ink-3)" }}>{kontoName.get(u.zahlungskontoId) ?? "—"}</td>
                  <td style={td}>
                    <div style={{ fontWeight: "var(--fw-bold)" }}>{u.gegenpartei}</div>
                    <div style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-3)" }}>{u.verwendungszweck.length > 50 ? u.verwendungszweck.slice(0, 50) + "…" : u.verwendungszweck}</div>
                    {/* Der Verdacht steht AN der Zeile, nicht in einem eigenen Bereich:
                        entschieden wird hier, mit dem Empfänger daneben. */}
                    {(() => {
                      const v = verdaechtig.get(u.id);
                      if (!v) return null;
                      const zwilling = zwillingVon(v);
                      return (
                        <div style={{ marginTop: 4, display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                          <Pill variant="warn">
                            {t(v.urteil === "identisch" ? "review.dublette.sicher" : "review.dublette.verdacht")}
                          </Pill>
                          <span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>
                            {t("review.dublette.gruende", { gruende: v.gruende.join(", ") })}
                            {zwilling && ` — ${t(`review.dublette.status.${zwilling.status}`)}`}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: geldFarbe(u.betrag) }}>{geld.format(u.betrag, { mitVorzeichen: true })}</td>
                  <td style={td}>
                    {u.vorschlag?.quelle === "umbuchung" ? (
                      <span style={{ color: "var(--ink-2)" }}>{t("review.umbuchung")}</span>
                    ) : (
                      <CategoryPicker kategorien={kategorien} value={u.vorschlag?.kategorieId ?? ""} onChange={(id) => kategorieGesetzt(u, id)} />
                    )}
                    {u.vorschlag && <Herkunft umsatz={u} kontext={kontext} />}
                    {angebot?.umsatzId === u.id && (
                      <div style={{ marginTop: 4, display: "flex", gap: "var(--sp-2)", alignItems: "baseline", flexWrap: "wrap", fontSize: "var(--fs-2xs)" }}>
                        <span className="muted">{t("review.festlegung.frage", { muster: angebot.muster })}</span>
                        <button className="linkbtn" onClick={angebotAnnehmen}>{t("review.festlegung.ja")}</button>
                        <button className="linkbtn" onClick={() => setAngebot(null)}>{t("review.festlegung.nein")}</button>
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <IconButton
                      icon="bearbeiten"
                      label={t("review.zeileOeffnen")}
                      onClick={() => setImDialog(u)}
                    />
                    <IconButton
                      icon="verwerfen"
                      ton="gefahr"
                      label={t("review.zeileVerwerfen")}
                      onClick={() => void zeileVerwerfen(u)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {seitenAnzahl > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--sp-3)", marginTop: "var(--sp-3)" }}>
              <Button variant="ghost" onClick={() => setSeite((s) => Math.max(0, s - 1))}>‹</Button>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("review.seite", { seite: aktuelleSeite + 1, gesamt: seitenAnzahl })}</span>
              <Button variant="ghost" onClick={() => setSeite((s) => Math.min(seitenAnzahl - 1, s + 1))}>›</Button>
            </div>
          )}
        </Card>
      )}

      {/* Der Rückweg — zugeklappt, aber mit Anzahl, damit man weiß, dass dort etwas liegt. */}
      {weggelegte.length > 0 && (
        <Card style={{ marginTop: "var(--gap-card)" }} pad>
          <button className="linkbtn" onClick={() => setZeigeWeggelegt((x) => !x)}>
            {t("review.weggelegt.titel", { n: weggelegte.length })}
          </button>
          {zeigeWeggelegt && (
            <>
              <div className="muted" style={{ fontSize: "var(--fs-xs)", margin: "var(--sp-2) 0" }}>
                {t("review.weggelegt.hinweis")}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <tbody>
                  {weggelegte.map((u) => (
                    <tr key={u.id}>
                      <td style={td}>{ddmmyyyy(u.buchungstag)}</td>
                      <td style={{ ...td, color: "var(--ink-3)" }}>{kontoName.get(u.zahlungskontoId) ?? "—"}</td>
                      <td style={td}>{u.gegenpartei}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: geldFarbe(u.betrag) }}>
                        {geld.format(u.betrag, { mitVorzeichen: true })}
                      </td>
                      <td style={td}>
                        <Pill variant="neutral">{t(`review.weggelegt.status.${u.status}`)}</Pill>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button className="linkbtn" onClick={() => void zurueck(u)}>
                          {t("review.weggelegt.zurueckholen")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      )}

      {/* Der volle Dialog auf einem ENTWURF: er schreibt erst beim Übernehmen oder
          Verwerfen. Wegklicken lässt die Zeile unangetastet stehen. */}
      {imDialog && (
        <BuchungDetail
          entwurf={imDialog}
          onClose={() => setImDialog(null)}
          onGeaendert={laden}
        />
      )}
    </>
  );
}
