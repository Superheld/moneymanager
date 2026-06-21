// Import-Screen (Slice 3) — Datei → Konten zuordnen → „Übernehmen" schreibt den
// reversiblen Entwurfs-Stapel. Berührt KEINE Salden. Das zeilenweise Bearbeiten der
// Kategorien + Verbuchen kommt als Review-Inbox (Slice 4). Alles Geld über useGeld(),
// alle Strings über t(). Persistenz nur in der Desktop-App (tauri dev).

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KONTOTYPEN, type Kontotyp, type Zahlungskonto } from "../../core";
import {
  kontoMatchVorschlag,
  umsaetzeUebernehmen,
  waehleAdapter,
  type ImportErgebnis,
  type KontoMatch,
  type UebernahmeErgebnis,
  type UebernahmeKonto,
} from "../../application/import";
// Selbst-Registrierung des Finanzguru-Adapters auslösen.
import "../import/finanzguruAdapter";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../persistence/sqliteStammdatenRepositories";
import { sqliteImportLaufRepository, sqliteUmsatzRepository } from "../persistence/sqliteImportRepositories";
import { Button, Card, DataTable } from "./ds";
import { PageHead } from "./PageHead";
import { useGeld } from "./EinstellungenProvider";

const VORSCHAU_MAX = 500;
type RU = ImportErgebnis["umsaetze"][number];

interface Ziel {
  modus: "neu" | "existing";
  kontoId?: string;
  bezeichnung: string;
  typ: Kontotyp;
  iban?: string;
}

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function ImportScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const inputRef = useRef<HTMLInputElement>(null);

  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);
  const [dateiname, setDateiname] = useState<string | null>(null);
  const [nichtErkannt, setNichtErkannt] = useState(false);
  const [bestehende, setBestehende] = useState<Zahlungskonto[]>([]);
  const [matches, setMatches] = useState<KontoMatch[]>([]);
  const [ziele, setZiele] = useState<Record<string, Ziel>>({});
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [uErgebnis, setUErgebnis] = useState<UebernahmeErgebnis | null>(null);

  async function dateiGewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!datei) return;
    setDateiname(datei.name);
    setUErgebnis(null);
    setFehler(null);
    const inhalt = await datei.text();
    const adapter = waehleAdapter(inhalt);
    if (!adapter) {
      setErgebnis(null);
      setNichtErkannt(true);
      return;
    }
    setNichtErkannt(false);
    const erg = adapter.lies(inhalt);
    setErgebnis(erg);

    let konten: Zahlungskonto[] = [];
    try {
      konten = await sqliteZahlungskontoRepository.alle();
    } catch {
      konten = []; // reiner Browser-Modus ohne SQLite
    }
    setBestehende(konten);
    const ms = kontoMatchVorschlag(erg.umsaetze, konten);
    setMatches(ms);
    const z: Record<string, Ziel> = {};
    for (const m of ms) {
      z[m.quelleKey] = m.kontoId
        ? { modus: "existing", kontoId: m.kontoId, bezeichnung: m.quelleName ?? "", typ: "Giro" }
        : { modus: "neu", bezeichnung: m.neu!.bezeichnung, typ: m.neu!.typ, iban: m.neu!.iban };
    }
    setZiele(z);
  }

  function setZiel(key: string, patch: Partial<Ziel>) {
    setZiele((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function zielGewaehlt(m: KontoMatch, value: string) {
    if (value === "__neu") {
      setZiel(m.quelleKey, {
        modus: "neu",
        kontoId: undefined,
        bezeichnung: m.neu?.bezeichnung ?? m.quelleName ?? "",
        typ: m.neu?.typ ?? "Giro",
        iban: m.neu?.iban,
      });
    } else {
      setZiel(m.quelleKey, { modus: "existing", kontoId: value });
    }
  }

  async function uebernehmen() {
    if (!ergebnis) return;
    setBusy(true);
    setFehler(null);
    try {
      const konten: UebernahmeKonto[] = matches.map((m) => {
        const z = ziele[m.quelleKey];
        return z.modus === "existing" && z.kontoId
          ? { quelleKey: m.quelleKey, kontoId: z.kontoId }
          : { quelleKey: m.quelleKey, neu: { bezeichnung: z.bezeichnung, typ: z.typ, iban: z.iban } };
      });
      const r = await umsaetzeUebernehmen(
        {
          quelle: ergebnis.quelle,
          dateiname: dateiname ?? undefined,
          zeitpunkt: new Date().toISOString(),
          rohUmsaetze: ergebnis.umsaetze,
          konten,
        },
        {
          kontoRepo: sqliteZahlungskontoRepository,
          kategorieRepo: sqliteKategorieRepository,
          umsatzRepo: sqliteUmsatzRepository,
          laufRepo: sqliteImportLaufRepository,
          id: () => crypto.randomUUID(),
        },
      );
      setUErgebnis(r);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const konten = ergebnis ? new Set(ergebnis.umsaetze.map((u) => u.kontoIban)).size : 0;
  const vorschau = ergebnis ? ergebnis.umsaetze.slice(0, VORSCHAU_MAX) : [];
  const eingabeStil = { padding: "5px 8px", borderRadius: "var(--r-md)", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "13px", fontFamily: "var(--font-ui)" } as const;

  return (
    <>
      <PageHead title={t("import.titel")} subtitle={t("import.untertitel")} />

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={dateiGewaehlt} style={{ display: "none" }} />
          <Button variant="primary" onClick={() => inputRef.current?.click()}>{t("import.dateiWaehlen")}</Button>
          {dateiname && <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{dateiname}</span>}
        </div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--sp-3)" }}>{t("import.hinweis")}</div>
      </Card>

      {nichtErkannt && (
        <Card style={{ marginTop: "var(--sp-4)", borderColor: "var(--warn, #d9822b)" }}>{t("import.nichtErkannt")}</Card>
      )}

      {ergebnis && (
        <Card
          style={{ marginTop: "var(--sp-4)" }}
          title={t("import.kontenTitel")}
          subtitle={t("import.kontenHinweis")}
        >
          {ergebnis.warnungen.length > 0 && (
            <ul style={{ margin: "0 0 var(--sp-3)", paddingLeft: "1.2em", color: "var(--ink-2)", fontSize: "var(--fs-xs)" }}>
              {ergebnis.warnungen.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>{t("import.spalteQuelle")}</th>
                <th style={{ textAlign: "left", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>{t("import.spalteZiel")}</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => {
                const z = ziele[m.quelleKey];
                if (!z) return null;
                return (
                  <tr key={m.quelleKey}>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" }}>
                      <div style={{ fontWeight: "var(--fw-bold)", color: "var(--ink)" }}>{m.quelleName ?? m.quelleKey}</div>
                      <div style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-3)" }}>{t("import.buchungenAnzahl", { n: m.anzahl })}</div>
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--line-soft)" }}>
                      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "center" }}>
                        <select
                          value={z.modus === "existing" ? z.kontoId : "__neu"}
                          onChange={(e) => zielGewaehlt(m, e.target.value)}
                          style={eingabeStil}
                        >
                          <option value="__neu">{t("import.neuAnlegen")}</option>
                          {bestehende.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung}</option>)}
                        </select>
                        {z.modus === "neu" && (
                          <>
                            <input
                              value={z.bezeichnung}
                              onChange={(e) => setZiel(m.quelleKey, { bezeichnung: e.target.value })}
                              placeholder={t("import.feldBezeichnung")}
                              style={{ ...eingabeStil, minWidth: 140 }}
                            />
                            <select value={z.typ} onChange={(e) => setZiel(m.quelleKey, { typ: e.target.value as Kontotyp })} style={eingabeStil}>
                              {KONTOTYPEN.map((kt) => <option key={kt} value={kt}>{t(`konten.typ.${kt}`)}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginTop: "var(--sp-4)", flexWrap: "wrap" }}>
            <Button
              variant="primary"
              onClick={busy || uErgebnis ? undefined : uebernehmen}
              style={busy || uErgebnis ? { opacity: 0.5, cursor: busy ? "wait" : "not-allowed" } : undefined}
            >
              {busy ? t("import.uebernehmenBusy") : t("import.uebernehmen")}
            </Button>
            {uErgebnis && (
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>
                {t("import.uebernahmeErgebnis", { neu: uErgebnis.neu, duplikate: uErgebnis.duplikate, konten: uErgebnis.angelegteKonten })}
              </span>
            )}
          </div>
          {uErgebnis && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--sp-2)" }}>{t("import.uebernahmeHinweis")}</div>}
          {fehler && <div style={{ fontSize: "var(--fs-xs)", color: "var(--danger, #c0392b)", marginTop: "var(--sp-2)" }}>{t("import.fehlerDb")} ({fehler})</div>}
        </Card>
      )}

      {ergebnis && (
        <Card style={{ marginTop: "var(--sp-4)" }} title={t("import.vorschauTitel")} subtitle={t("import.erkannt", { n: ergebnis.umsaetze.length, quelle: ergebnis.quelle, konten })}>
          <DataTable
            columns={[
              { key: "buchungstag", label: t("import.spalteDatum"), render: (u: RU) => ddmmyyyy(u.buchungstag) },
              { key: "betrag", label: `${t("import.spalteBetrag")} ${geld.symbol}`, align: "right", render: (u: RU) => geld.format(u.betrag, { mitVorzeichen: true }) },
              { key: "gegenpartei", label: t("import.spalteGegenpartei") },
              { key: "verwendungszweck", label: t("import.spalteZweck"), render: (u: RU) => (u.verwendungszweck.length > 60 ? u.verwendungszweck.slice(0, 60) + "…" : u.verwendungszweck) },
              { key: "kategorieHinweis", label: t("import.spalteKategorie"), render: (u: RU) => (u.istUmbuchung ? "↔ Umbuchung" : u.kategorieHinweis ?? "—") },
            ]}
            rows={vorschau}
          />
          {ergebnis.umsaetze.length > VORSCHAU_MAX && (
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--sp-3)" }}>
              {t("import.zeigeAuszug", { zeige: VORSCHAU_MAX, gesamt: ergebnis.umsaetze.length })}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
