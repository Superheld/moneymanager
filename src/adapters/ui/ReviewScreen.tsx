// Review-Inbox (Slice 4) — der persistierte Entwurfs-Stapel: importierte Umsätze (Status
// „neu") prüfen, Zeile für Zeile kategorisieren und verbuchen. Filter nach Konto/Status,
// seitenweise (skaliert auf tausende Zeilen). „Verbuchen" macht aus allen kategorisierten
// Umsätzen Ist-Buchungen (wirkt auf Salden). Umbuchungen sind als Umschichtung fix gelabelt.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { festlegungTrifft, type Kategorie, type Zahlungskonto } from "../../core";
import {
  kategorisieren,
  umsaetzeVerbuchen,
  vorschlagsbefundFuer,
  type Umsatz,
  type VerbuchenErgebnis,
  type Vorschlagskontext,
} from "../../application/import";
import { kategorisierungsquellen } from "../../application/kategorisierungsquellen";
import { festlegungAngebot, festlegungSetzen } from "../../application/kategoriefestlegungen";
import { sqliteKategoriefestlegungRepository } from "../persistence/sqliteKategoriefestlegungRepository";
import { zuordnungenAbgleichen } from "../../application/vertragszuordnung";
import { vertragsAbgleichDeps } from "../persistence/sqliteVertragZuordnungRepositories";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../persistence/sqliteStammdatenRepositories";
import { sqliteImportLaufRepository, sqliteUmsatzRepository } from "../persistence/sqliteImportRepositories";
import { sqliteLedgerRepository } from "../persistence/sqliteLedgerRepository";
import { sqliteVertragRepository } from "../persistence/sqliteVertragRepository";
import { sqliteVertragserkennungRepository } from "../persistence/sqliteVertragZuordnungRepositories";
import { sqliteKlassifikatorRepository } from "../persistence/sqliteKlassifikatorRepository";
import { sqliteMerkmalskonfigurationRepository } from "../persistence/sqliteMerkmalskonfigurationRepository";
import { Button, Card, Pill } from "./ds";
import { ABRUF_QUELLEN } from "./NeueBuchungen";
import { CategoryPicker } from "./CategoryPicker";
import { useGeld } from "./einstellungenKontext";

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

  async function laden() {
    try {
      const [u, k, kat, laeufe] = await Promise.all([
        sqliteUmsatzRepository.offene(),
        sqliteZahlungskontoRepository.alle(),
        sqliteKategorieRepository.alle(),
        sqliteImportLaufRepository.alle(),
      ]);
      // Die Inbox ist der Ort für den gelegentlichen DATEI-Import: ein Stapel, den man am
      // Stück durchsieht. Was per Bankabruf hereinkommt, steht seit 2026-08-18 beim
      // Konto selbst — dort schaut man ohnehin hin, und es ist der Alltag, kein Vorgang.
      const abruf = new Set(
        laeufe.filter((l) => ABRUF_QUELLEN.has(l.quelle)).map((l) => l.id),
      );
      setUmsaetze(u.filter((x) => !abruf.has(x.laufId)));
      setKonten(k);
      setKategorien(kat);
      setKontext(
        await kategorisierungsquellen({
          kategorieRepo: sqliteKategorieRepository,
          festlegungRepo: sqliteKategoriefestlegungRepository,
          vertragRepo: sqliteVertragRepository,
          erkennungRepo: sqliteVertragserkennungRepository,
          klassifikatorRepo: sqliteKlassifikatorRepository,
          merkmalRepo: sqliteMerkmalskonfigurationRepository,
        }),
      );
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
      await sqliteUmsatzRepository.speichern(final);
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
      const f = await festlegungSetzen(sqliteKategoriefestlegungRepository, angebot.muster, angebot.kategorieId);
      if (!f) return;
      let weitere = 0;
      for (const x of umsaetze) {
        if (x.id === angebot.umsatzId) continue;
        if (x.vorschlag?.quelle === "manuell" || x.vorschlag?.quelle === "umbuchung") continue;
        if (x.vorschlag?.kategorieId === kat.id) continue;
        if (!festlegungTrifft(f, x.gegenpartei)) continue;
        await sqliteUmsatzRepository.speichern(
          kategorisieren(x, { kategorieId: kat.id, charakter: kat.defaultCharakter, quelle: "festlegung" }),
        );
        weitere++;
      }
      setAngebot(null);
      setFestgelegt({ muster: angebot.muster, weitere });
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }

  async function verbuchen() {
    setBusy(true);
    setFehler(null);
    try {
      const ergebnis = await umsaetzeVerbuchen(umsaetze, {
        ledgerRepo: sqliteLedgerRepository,
        umsatzRepo: sqliteUmsatzRepository,
        id: () => crypto.randomUUID(),
      });
      setVerb(ergebnis);
      // Frisch verbuchte Zahlungen sofort den Verträgen zuordnen — das ist der Weg, über
      // den neue Buchungen ihre Kennzeichnung bekommen, ohne dass jemand etwas anklickt.
      // Bewusst HIER und nicht in `umsaetzeVerbuchen`: der Use-Case schreibt Fakten ins
      // Ledger, die Zuordnung ist eine Interpretation darüber.
      await zuordnungenAbgleichen(vertragsAbgleichDeps);
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
            </div>
          }
        >
          <div style={{ display: "flex", gap: "var(--sp-3)", marginBottom: "var(--sp-3)", flexWrap: "wrap" }}>
            <select value={kontoFilter} onChange={(e) => { setKontoFilter(e.target.value); setSeite(0); }} style={select}>
              <option value="alle">{t("review.alleKonten")}</option>
              {konten.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setSeite(0); }} style={select}>
              <option value="alle">{t("review.statusAlle")}</option>
              <option value="offen">{t("review.statusOffen")}</option>
              <option value="fertig">{t("review.statusFertig")}</option>
            </select>
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
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{geld.format(u.betrag, { mitVorzeichen: true })}</td>
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
    </>
  );
}
